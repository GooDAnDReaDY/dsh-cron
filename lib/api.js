/**
 * REST surface of the plugin: the /dsh-cron/tasks and /dsh-cron/action route
 * families. Extracted from index.js and split into per-scope handlers so each
 * piece stays reviewable (#97); route contracts and response bodies are
 * unchanged.
 */

import { randomUUID } from 'node:crypto';
import { parseScheduleExpression } from './scheduler.js';
import { normalizeTaskType, CODE_EXECUTING_TYPES } from './runtimes.js';
import { CHANNEL_IDS } from './channels.js';
import { applyTaskPatch } from './task-patch.js';
import { sendJson, rejectCrossOrigin, readBody, pickPatchableFields, SCRIPT_CONFIRM_HEADER } from './http-utils.js';
import {
  validateTaskType,
  buildDuplicateTask,
  buildTaskExport,
  validateImportDocument,
  planImport,
  hasCodeExecutingTask,
  IMPORT_STRATEGIES,
  RESERVED_TASK_IDS,
  PATCHABLE_TASK_FIELDS,
} from './task-transfer.js';

const NOT_FOUND = { ok: false, error: 'Task not found' };
const NOT_ALLOWED = { ok: false, error: 'Method not allowed' };

/**
 * Shared implementation for the /dsh-cron/tasks... and /dsh-cron/action...
 * route families — the #66 alias is kept alive by the same code path instead
 * of a duplicated handler.
 *
 * IMPORTANT: prefix routes must be registered WITHOUT a trailing slash —
 * with one, the core degrades matching to exact-path equality and every
 * deeper path unrouted (#96). Exported for unit tests.
 */
export function createCronApiHandler(store, scheduler, collection) {
  return async function handleCronApi(req, res) {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').filter(Boolean);
      const scope = parts[1]; // 'tasks' | 'action'
      const id = parts[2];
      const action = parts[3];

      if (!id) {
        await handleTaskCollection({ store, scheduler, collection, req, res, url, scope });
        return;
      }

      if (req.method !== 'GET' && rejectCrossOrigin(req, res)) return;

      // Export/import are collection operations that live under /tasks/:id/…,
      // so they are matched before the generic id handling below.
      if (id === 'export' && req.method === 'GET') {
        handleTaskExport({ store, res });
        return;
      }
      if (id === 'import' && req.method === 'POST') {
        await handleTaskImport({ store, scheduler, req, res });
        return;
      }

      await handleTaskItem({ store, scheduler, req, res, url, id, action });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
    }
  };
}

// ------------------------------------------------------------- collection

async function handleTaskCollection({ store, scheduler, collection, req, res, url, scope }) {
  // The alias family only exists for individual tasks.
  if (scope === 'action' || !collection) {
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }
  if (req.method === 'GET') {
    listTasks({ store, scheduler, collection, res, url });
    return;
  }
  if (req.method === 'POST') {
    await createOrUpdateTask({ store, scheduler, req, res });
    return;
  }
  sendJson(res, 405, NOT_ALLOWED);
}

function listTasks({ store, scheduler, collection, res, url }) {
  const status = url.searchParams.get('status') || 'all';
  const query = url.searchParams.get('query') || '';
  const list = store.list({ status, query }).map((t) => ({
    ...t,
    running: scheduler.isRunning(t.id),
    runningSince: scheduler.runningSince(t.id),
  }));
  const stats = store.getAggregatedStats();
  sendJson(res, 200, { ok: true, tasks: list, recommendations: collection.recommendations, stats });
}

async function createOrUpdateTask({ store, scheduler, req, res }) {
  if (rejectCrossOrigin(req, res)) return;
  const { body, error } = await readBody(req, res);
  if (error) return;
  if (!body.title || !body.schedule || !body.prompt) {
    sendJson(res, 400, { ok: false, error: 'Fields title, schedule and prompt are required' });
    return;
  }
  const taskType = normalizeTaskType(body.type);
  if (CODE_EXECUTING_TYPES.includes(taskType) && req.headers[SCRIPT_CONFIRM_HEADER] !== 'script') {
    sendJson(res, 403, { ok: false, error: `Creating ${taskType} tasks over HTTP requires the x-dsh-cron-confirm: script header` });
    return;
  }
  const typeError = validateTaskType(taskType, body);
  if (typeError) {
    sendJson(res, 400, { ok: false, error: typeError });
    return;
  }
  const parsed = parseScheduleExpression(body.schedule);
  // A client-supplied id must not shadow the collection routes under
  // /dsh-cron/tasks, otherwise that task could never be fetched or deleted
  // again (#42 review finding).
  if (body.id && RESERVED_TASK_IDS.includes(String(body.id))) {
    sendJson(res, 400, { ok: false, error: `Task id "${body.id}" is reserved` });
    return;
  }
  const task = store.set(buildTaskRecord(store, body, taskType, parsed));
  if (task.status === 'active') {
    scheduler.scheduleTask(task);
  } else {
    scheduler.pauseTask(task.id);
  }
  sendJson(res, 200, { ok: true, task });
}

/** Merge a create/update payload onto the stored task, if any. */
function buildTaskRecord(store, body, taskType, parsed) {
  const current = body.id ? store.get(body.id) : null;
  const resolvedStatus = body.status || (current ? current.status : 'active');
  return {
    id: body.id,
    title: body.title,
    schedule: parsed.cronPattern || body.schedule,
    scheduleText: body.scheduleText || parsed.humanText,
    prompt: body.prompt,
    type: taskType,
    delivery: body.delivery || 'current',
    status: resolvedStatus,
    provider: body.provider || undefined,
    model: body.model || undefined,
    fallbackProvider: body.fallbackProvider || undefined,
    fallbackModel: body.fallbackModel || undefined,
    notifyTelegram: body.notifyTelegram !== undefined ? Boolean(body.notifyTelegram) : (current ? current.notifyTelegram : false),
    onlyOnFailure: body.onlyOnFailure !== undefined ? Boolean(body.onlyOnFailure) : (current ? current.onlyOnFailure : false),
    timeoutSeconds: body.timeoutSeconds !== undefined ? Number(body.timeoutSeconds) : (current ? current.timeoutSeconds : 1800),
    overlapPolicy: body.overlapPolicy || (current ? current.overlapPolicy : 'skip'),
    kanbanMode: body.kanbanMode || (current ? current.kanbanMode : 'none'),
    timezone: body.timezone !== undefined ? String(body.timezone).trim() : (current ? current.timezone : ''),
    misfirePolicy: ['skip', 'runOnce', 'catchUpAll'].includes(body.misfirePolicy) ? body.misfirePolicy : (current ? (current.misfirePolicy || 'skip') : 'skip'),
    maxRetries: body.maxRetries !== undefined ? Math.max(0, Number(body.maxRetries) || 0) : (current ? (Number(current.maxRetries) || 0) : 0),
    retryBackoffMs: body.retryBackoffMs !== undefined ? Math.max(1000, Number(body.retryBackoffMs) || 30000) : (current ? (Number(current.retryBackoffMs) || 30000) : 30000),
    permissionPreset: ['default', 'read-only', 'workspace-write', 'full'].includes(body.permissionPreset) ? body.permissionPreset : (current ? (current.permissionPreset || 'default') : 'default'),
    ...mergeExecutionFields(current, body, parsed),
  };
}

// --------------------------------------------------------- export / import

function handleTaskExport({ store, res }) {
  const doc = buildTaskExport(store.list({ status: 'all' }));
  sendJson(res, 200, { ok: true, document: doc, count: doc.tasks.length });
}

async function handleTaskImport({ store, scheduler, req, res }) {
  const { body, error } = await readBody(req, res);
  if (error) return;
  const strategy = IMPORT_STRATEGIES.includes(body && body.strategy) ? body.strategy : 'skip';
  const checked = validateImportDocument(body && body.document);
  if (!checked.ok) {
    sendJson(res, 400, { ok: false, error: checked.error });
    return;
  }
  // The import file is external input: importing code-executing tasks needs
  // the same explicit confirmation that creating one over HTTP needs,
  // otherwise a hand-edited file would bypass that gate (#86).
  if (hasCodeExecutingTask(checked.tasks) && req.headers[SCRIPT_CONFIRM_HEADER] !== 'script') {
    sendJson(res, 403, {
      ok: false,
      error: `Importing code-executing tasks over HTTP requires the ${SCRIPT_CONFIRM_HEADER}: script header`,
    });
    return;
  }
  const existingIds = store.list({ status: 'all' }).map((x) => x.id);
  const plan = planImport(checked.tasks, existingIds, strategy);
  const summary = { add: plan.add.length, replace: plan.replace.length, skip: plan.skip.length };
  if (body && body.dryRun) {
    sendJson(res, 200, {
      ok: true,
      dryRun: true,
      strategy: plan.strategy,
      summary,
      codeExecuting: hasCodeExecutingTask(plan.add.concat(plan.replace)),
    });
    return;
  }
  const applied = applyImportPlan({ store, scheduler, plan });
  if (applied.error) {
    sendJson(res, 500, { ok: false, error: applied.error });
    return;
  }
  sendJson(res, 200, { ok: true, imported: applied.imported.length, summary, tasks: applied.imported });
}

/**
 * Write an import plan. Every imported task is paused (the file's status is
 * ignored) and every touched id is disarmed explicitly, because writing
 * "paused" does not stop an already-armed croner job. A failed write rolls the
 * store back so a partial import cannot survive.
 */
function applyImportPlan({ store, scheduler, plan }) {
  const imported = [];
  const rollback = [];
  const disarm = [];
  try {
    for (const task of plan.add) {
      const before = store.get(task.id);
      const created = store.set({ ...task, id: task.id || randomUUID(), status: 'paused', updatedAt: Date.now() });
      imported.push(created);
      rollback.push({ id: created.id, previous: before || null });
      disarm.push(created.id);
    }
    for (const task of plan.replace) {
      const before = store.get(task.id);
      if (!before) continue;
      const replaced = store.set({ ...task, id: task.id, status: 'paused', updatedAt: Date.now() });
      imported.push(replaced);
      rollback.push({ id: replaced.id, previous: before });
      disarm.push(replaced.id);
    }
  } catch (writeErr) {
    for (const entry of rollback.reverse()) {
      try {
        if (entry.previous) store.set(entry.previous);
        else store.delete(entry.id);
      } catch (_) {}
    }
    return { imported: [], error: `Import failed and was rolled back: ${writeErr.message}` };
  }
  // Disarm outside the write transaction: pauseTask is idempotent and a
  // failure here must not undo a successful import.
  for (const id of disarm) {
    try {
      scheduler.pauseTask(id);
    } catch (err) {
      console.error('[dsh-cron] import: could not pause task', id + ':', err.message);
    }
  }
  return { imported };
}

// ------------------------------------------------------------ single task

async function handleTaskItem({ store, scheduler, req, res, url, id, action }) {
  if (req.method === 'GET' && (action === 'history' || !action)) {
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    sendJson(res, 200, { ok: true, history: store.getHistory(id, limit) });
    return;
  }
  if (req.method === 'POST') {
    const handled = await handleItemPost({ store, scheduler, req, res, url, id, action });
    if (handled) return;
  }
  if (req.method === 'PATCH') {
    await patchTask({ store, scheduler, req, res, id });
    return;
  }
  if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
    deleteTask({ store, scheduler, res, id });
    return;
  }
  sendJson(res, 405, NOT_ALLOWED);
}

/** Task actions that are plain POSTs. Returns true when one matched. */
async function handleItemPost({ store, scheduler, req, res, url, id, action }) {
  if (action === 'run') {
    if (!store.get(id)) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    await scheduler.triggerManualRun(id);
    sendJson(res, 200, { ok: true, task: store.get(id) });
    return true;
  }
  if (action === 'duplicate') {
    const source = store.get(id);
    if (!source) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const copy = buildDuplicateTask(source, { id: randomUUID() });
    store.set(copy);
    // A copy starts paused: it must never fire on its own before the user
    // reviews the schedule (a duplicated one-shot may point at a past time).
    scheduler.pauseTask(copy.id);
    sendJson(res, 200, { ok: true, task: copy });
    return true;
  }
  if (action === 'pause' || action === 'resume') {
    const task = action === 'pause' ? scheduler.pauseTask(id) : scheduler.resumeTask(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    sendJson(res, 200, { ok: true, task });
    return true;
  }
  if (action === 'toggle' || (!action && url.searchParams.get('action') === 'toggle')) {
    if (!store.get(id)) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const task = scheduler.toggleTask(id);
    sendJson(res, 200, { ok: true, task });
    return true;
  }
  return false;
}

async function patchTask({ store, scheduler, req, res, id }) {
  const current = store.get(id);
  if (!current) {
    sendJson(res, 404, NOT_FOUND);
    return;
  }
  const { body, error } = await readBody(req, res);
  if (error) return;
  const result = applyTaskPatch({
    store,
    scheduler,
    id,
    body,
    allowCodeSwitch: req.headers[SCRIPT_CONFIRM_HEADER] === 'script',
  });
  if (!result.ok) {
    const status = result.notFound ? 404 : (result.needsConfirmation ? 403 : 400);
    const error = result.needsConfirmation
      ? `Switching a task to the ${normalizeTaskType(body.type)} type over HTTP requires the ${SCRIPT_CONFIRM_HEADER}: script header`
      : result.error;
    sendJson(res, status, { ok: false, error });
    return;
  }
  sendJson(res, 200, { ok: true, task: result.task });
}

function deleteTask({ store, scheduler, res, id }) {
  const current = store.get(id);
  if (current) {
    scheduler.pauseTask(id);
    store.delete(id);
  }
  sendJson(res, 200, { ok: true });
}

/**
 * Runtime and execution settings of a task, merged onto the stored one. Split
 * out of buildTaskRecord so both stay readable.
 */
function mergeExecutionFields(current, body, parsed) {
  return {
    env: body.env && typeof body.env === 'object' ? body.env : (current ? current.env : undefined),
    cwd: body.cwd !== undefined ? String(body.cwd).trim() : (current ? current.cwd : ''),
    channels: Array.isArray(body.channels)
      ? body.channels.filter((c) => CHANNEL_IDS.includes(c))
      : (current ? current.channels : undefined),
    template: body.template !== undefined ? String(body.template) : (current ? current.template : ''),
    silentRule: body.silentRule !== undefined ? String(body.silentRule) : (current ? current.silentRule : ''),
    inspectOnFailure: body.inspectOnFailure !== undefined ? Boolean(body.inspectOnFailure) : (current ? Boolean(current.inspectOnFailure) : false),
    workspaceId: body.workspaceId !== undefined ? String(body.workspaceId).trim() : (current ? current.workspaceId : ''),
    worktree: body.worktree !== undefined ? Boolean(body.worktree) : (current ? Boolean(current.worktree) : false),
    keepWorktree: body.keepWorktree !== undefined ? Boolean(body.keepWorktree) : (current ? Boolean(current.keepWorktree) : false),
    httpMethod: body.httpMethod ? String(body.httpMethod).toUpperCase() : (current ? current.httpMethod : 'GET'),
    httpUrl: body.httpUrl !== undefined ? String(body.httpUrl).trim() : (current ? current.httpUrl : ''),
    httpHeaders: body.httpHeaders !== undefined ? body.httpHeaders : (current ? current.httpHeaders : undefined),
    httpBody: body.httpBody !== undefined ? String(body.httpBody) : (current ? current.httpBody : ''),
    sshProfileId: body.sshProfileId !== undefined ? String(body.sshProfileId).trim() : (current ? current.sshProfileId : ''),
    sshTarget: body.sshTarget !== undefined ? String(body.sshTarget).trim() : (current ? current.sshTarget : ''),
    sshPort: body.sshPort !== undefined ? Number(body.sshPort) || 0 : (current ? current.sshPort : 0),
    sshKeyPath: body.sshKeyPath !== undefined ? String(body.sshKeyPath).trim() : (current ? current.sshKeyPath : ''),
    dockerImage: body.dockerImage !== undefined ? String(body.dockerImage).trim() : (current ? current.dockerImage : ''),
    pythonPath: body.pythonPath !== undefined ? String(body.pythonPath).trim() : (current ? current.pythonPath : ''),
    nodePath: body.nodePath !== undefined ? String(body.nodePath).trim() : (current ? current.nodePath : ''),
    skillName: body.skillName !== undefined ? String(body.skillName).trim() : (current ? current.skillName : ''),
    workflowName: body.workflowName !== undefined ? String(body.workflowName).trim() : (current ? current.workflowName : ''),
    oneShot: Boolean((parsed && parsed.isOneShot) || (body && body.oneShot)),
  };
}
