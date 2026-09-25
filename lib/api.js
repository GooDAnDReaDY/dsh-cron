/**
 * REST surface of the plugin: the /dsh-cron/tasks and /dsh-cron/action route
 * families. Extracted from index.js and split into per-scope handlers so each
 * piece stays reviewable (#97); route contracts and response bodies are
 * unchanged.
 */

import { randomUUID, createHash } from 'node:crypto';
import { parseScheduleExpression } from './scheduler.js';
import { normalizeTaskType, CODE_EXECUTING_TYPES } from './runtimes.js';
import { CHANNEL_IDS, unknownChannelIds } from './channels.js';
import { applyTaskPatch } from './task-patch.js';
import { MANAGED_BY_CONFIG, configOwnedMessage } from './config-jobs.js';
import { sendJson, rejectCrossOrigin, readBody, pickPatchableFields, SCRIPT_CONFIRM_HEADER, redactTaskSecrets, restoreTaskSecrets } from './http-utils.js';
import {
  validateTaskType,
  buildDuplicateTask,
  RESERVED_TASK_IDS,
  PATCHABLE_TASK_FIELDS,
} from './task-transfer.js';
import {
  handleTaskExport,
  handleTaskImport,
  applyImportPlan,
} from './api-import-export.js';
import { handleTelegramWebhook } from './api-webhook.js';
import {
  handleHeartbeatPing,
  handleSchedulePreview,
  handleDryRunTask,
} from './api-helpers.js';

export {
  handleTaskExport,
  handleTaskImport,
  applyImportPlan,
  handleTelegramWebhook,
  handleHeartbeatPing,
  handleSchedulePreview,
  handleDryRunTask,
};

const NOT_FOUND = { ok: false, error: 'Task not found' };
const NOT_ALLOWED = { ok: false, error: 'Method not allowed' };

/**
 * A task declared in the profile config is owned by that file (#50): the next
 * plugin start would revert any change made here, so every mutating route
 * refuses it and says where the task really lives.
 */
function refuseConfigOwned(res, id) {
  sendJson(res, 409, { ok: false, error: configOwnedMessage(id) });
}

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
      const apiToken = store?.getSettings?.()?.apiToken;
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').filter(Boolean);
      const scope = parts[1]; // 'tasks' | 'action' | 'heartbeat-ping'
      const id = parts[2];
      const action = parts[3];

      if (scope === 'telegram' && id === 'webhook') {
        await handleTelegramWebhook({ store, scheduler, req, res });
        return;
      }

      if ((scope === 'heartbeat' || scope === 'heartbeat-ping') && id) {
        handleHeartbeatPing({ store, req, res, taskId: id });
        return;
      }

      if (scope === 'schedule' && id === 'preview') {
        await handleSchedulePreview({ req, res, url, store });
        return;
      }

      if (!id) {
        await handleTaskCollection({ store, scheduler, collection, req, res, url, scope, apiToken });
        return;
      }

      if (rejectCrossOrigin(req, res, { apiToken })) return;

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

      await handleTaskItem({ store, scheduler, req, res, url, id, action, apiToken });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
    }
  };
}

// ------------------------------------------------------------- collection

async function handleTaskCollection({ store, scheduler, collection, req, res, url, scope, apiToken }) {
  // The alias family only exists for individual tasks.
  if (scope === 'action' || !collection) {
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }
  if (req.method === 'GET') {
    if (rejectCrossOrigin(req, res, { apiToken })) return;
    listTasks({ store, scheduler, collection, req, res, url });
    return;
  }
  if (req.method === 'POST') {
    await createOrUpdateTask({ store, scheduler, req, res, apiToken });
    return;
  }
  sendJson(res, 405, NOT_ALLOWED);
}

function listTasks({ store, scheduler, collection, req, res, url }) {
  const status = url.searchParams.get('status') || 'all';
  const query = url.searchParams.get('query') || '';
  const list = store.list({ status, query }).map((t) => ({
    ...redactTaskSecrets(t),
    running: scheduler.isRunning(t.id),
    runningSince: scheduler.runningSince(t.id),
  }));
  const stats = store.getAggregatedStats();
  const payload = { ok: true, tasks: list, recommendations: collection.recommendations, stats };

  // Calculate ETag based on payload JSON representation (#134)
  const bodyString = JSON.stringify(payload);
  const etag = 'W/"' + createHash('sha1').update(bodyString).digest('hex') + '"';

  if (req && req.headers) {
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === etag.slice(2))) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'no-cache' });
      res.end();
      return;
    }
  }

  if (typeof res.setHeader === 'function') {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
  }
  sendJson(res, 200, payload);
}

async function createOrUpdateTask({ store, scheduler, req, res, apiToken }) {
  if (rejectCrossOrigin(req, res, { apiToken })) return;
  const { body: rawBody, error } = await readBody(req, res);
  if (error) return;
  const existing = rawBody.id ? store.get(rawBody.id) : null;
  const body = existing ? restoreTaskSecrets(rawBody, existing) : rawBody;
  if (!body.title || !body.schedule || !body.prompt) {
    sendJson(res, 400, { ok: false, error: 'Fields title, schedule and prompt are required' });
    return;
  }
  const unknownChannels = unknownChannelIds(body.channels);
  if (unknownChannels.length) {
    sendJson(res, 400, {
      ok: false,
      error: 'Unknown channel ids: ' + unknownChannels.join(', '),
      unknownChannels,
    });
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
  // Create-or-update with an existing id is an update too, so the config-owned
  // refusal must apply here as well — otherwise the POST route would be a way
  // around the guard on PATCH (#50 review finding).
  if (body.id) {
    const existing = store.get(body.id);
    if (existing && existing.managedBy === MANAGED_BY_CONFIG) {
      refuseConfigOwned(res, body.id);
      return;
    }
  }
  const task = store.set(buildTaskRecord(store, body, taskType, parsed));
  if (task.status === 'active') {
    scheduler.scheduleTask(task);
  } else {
    scheduler.pauseTask(task.id);
  }
  sendJson(res, 200, { ok: true, task: redactTaskSecrets(task) });
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

// export/import logic moved to ./api-import-export.js

// ------------------------------------------------------------ single task

async function handleTaskItem({ store, scheduler, req, res, url, id, action, apiToken }) {
  if (action === 'heartbeat') {
    handleHeartbeatPing({ store, req, res, taskId: id });
    return;
  }

  if (req.method === 'POST' && action === 'dry-run') {
    await handleDryRunTask({ store, scheduler, req, res, id });
    return;
  }

  if (req.method === 'GET') {
    if (rejectCrossOrigin(req, res, { apiToken })) return;
    if (action === 'archive') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const search = url.searchParams.get('search') || '';
      const result = typeof store.getArchivedRuns === 'function'
        ? store.getArchivedRuns(id, { limit, offset, search })
        : { runs: [], total: 0 };
      sendJson(res, 200, { ok: true, taskId: id, ...result });
      return;
    }
    if (action === 'stats') {
      const stats = typeof store.getTaskStats === 'function' ? store.getTaskStats(id) : null;
      sendJson(res, 200, { ok: true, taskId: id, stats });
      return;
    }
    if (action === 'history') {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      sendJson(res, 200, { ok: true, history: store.getHistory(id, limit) });
      return;
    }
    if (!action) {
      const task = store.get(id);
      if (!task) {
        sendJson(res, 404, NOT_FOUND);
        return;
      }
      sendJson(res, 200, {
        ok: true,
        task: {
          ...redactTaskSecrets(task),
          running: scheduler.isRunning(task.id),
          runningSince: scheduler.runningSince(task.id),
        },
      });
      return;
    }
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
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(store.get(id)) });
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
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(copy) });
    return true;
  }
  if (action === 'pause' || action === 'resume') {
    if (store.get(id) && store.get(id).managedBy === MANAGED_BY_CONFIG) {
      refuseConfigOwned(res, id);
      return true;
    }
    const task = action === 'pause' ? scheduler.pauseTask(id) : scheduler.resumeTask(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(task) });
    return true;
  }
  if (action === 'toggle' || (!action && url.searchParams.get('action') === 'toggle')) {
    const stored = store.get(id);
    if (!stored) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    if (stored.managedBy === MANAGED_BY_CONFIG) {
      refuseConfigOwned(res, id);
      return true;
    }
    const task = scheduler.toggleTask(id);
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(task) });
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
  if (current.managedBy === MANAGED_BY_CONFIG) {
    refuseConfigOwned(res, id);
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
    sendJson(res, status, {
      ok: false,
      error,
      ...(result.unknownChannels ? { unknownChannels: result.unknownChannels } : {}),
    });
    return;
  }
  sendJson(res, 200, { ok: true, task: redactTaskSecrets(result.task) });
}

function deleteTask({ store, scheduler, res, id }) {
  const current = store.get(id);
  if (current && current.managedBy === MANAGED_BY_CONFIG) {
    refuseConfigOwned(res, id);
    return;
  }
  if (current) {
    if (scheduler && typeof scheduler.removeTask === 'function') {
      scheduler.removeTask(id);
    } else if (scheduler) {
      scheduler.pauseTask(id);
    }
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
    costLimitUsd: body.costLimitUsd !== undefined ? (body.costLimitUsd === null ? null : (Number(body.costLimitUsd) > 0 ? Number(body.costLimitUsd) : null)) : (current ? current.costLimitUsd : undefined),
    dailyCostLimitUsd: body.dailyCostLimitUsd !== undefined ? (body.dailyCostLimitUsd === null ? null : (Number(body.dailyCostLimitUsd) > 0 ? Number(body.dailyCostLimitUsd) : null)) : (current ? current.dailyCostLimitUsd : undefined),
    tokenLimit: body.tokenLimit !== undefined ? (body.tokenLimit === null ? null : (Number(body.tokenLimit) > 0 ? Number(body.tokenLimit) : null)) : (current ? current.tokenLimit : undefined),
    pausedReason: body.pausedReason !== undefined ? (body.pausedReason ? String(body.pausedReason) : null) : (current ? current.pausedReason : undefined),
  };
}

// --------------------------------------------------------- external surface

/**
 * Task operations for the token-guarded /dsh-cron/api/* prefix (#54). The shape
 * is deliberately small — list, read, create or update, delete, manual run —
 * and reuses the handlers above, so the confirmation gate for code-executing
 * tasks and the config-owned refusals are the same code, not a second copy.
 */
export async function handleExternalTaskRequest({ store, scheduler, req, res, url }) {
  const parts = url.pathname.split('/').filter(Boolean); // dsh-cron, api, [tasks|heartbeat|schedule], :id?, :action?
  if (parts[2] === 'heartbeat' && parts[3]) {
    handleHeartbeatPing({ store, req, res, taskId: parts[3] });
    return;
  }
  if (parts[2] === 'schedule' && parts[3] === 'preview') {
    await handleSchedulePreview({ req, res, url });
    return;
  }
  const id = parts[3];
  const action = parts[4];

  if (!id) {
    if (req.method === 'GET') {
      const list = store
        .list({ status: url.searchParams.get('status') || 'all', query: url.searchParams.get('query') || '' })
        .map((task) => ({ ...redactTaskSecrets(task), running: scheduler.isRunning(task.id) }));
      sendJson(res, 200, { ok: true, tasks: list });
      return;
    }
    if (req.method === 'POST') {
      await createOrUpdateTask({ store, scheduler, req, res });
      return;
    }
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }

  if (req.method === 'POST') {
    const handled = await handleItemPost({ store, scheduler, req, res, url, id, action });
    if (handled) return;
  }
  if (req.method === 'GET' && !action) {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return;
    }
    sendJson(res, 200, { ok: true, task: { ...redactTaskSecrets(task), running: scheduler.isRunning(id) } });
    return;
  }
  if (req.method === 'DELETE' && !action) {
    deleteTask({ store, scheduler, res, id });
    return;
  }
  sendJson(res, 405, NOT_ALLOWED);
}

// webhook and helper endpoints moved to ./api-webhook.js and ./api-helpers.js
