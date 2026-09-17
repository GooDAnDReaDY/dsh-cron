import { randomUUID } from 'node:crypto';
import {
  buildTaskExport,
  validateImportDocument,
  planImport,
  hasCodeExecutingTask,
  IMPORT_STRATEGIES,
} from './task-transfer.js';
import { unknownChannelIds } from './channels.js';
import {
  sendJson,
  readBody,
  SCRIPT_CONFIRM_HEADER,
} from './http-utils.js';
import { MANAGED_BY_CONFIG } from './config-jobs.js';

export function handleTaskExport({ store, res }) {
  const doc = buildTaskExport(store.list({ status: 'all' }));
  sendJson(res, 200, { ok: true, document: doc, count: doc.tasks.length });
}

export async function handleTaskImport({ store, scheduler, req, res }) {
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
  // #121: an imported file may name a channel this build no longer has. The
  // import stays tolerant by design (#42), but the loss is reported instead of
  // being invisible.
  const rawTasks = Array.isArray(body.document && body.document.tasks) ? body.document.tasks : [];
  const droppedChannels = [];
  for (const item of rawTasks) {
    for (const id of unknownChannelIds(item.channels)) {
      if (!droppedChannels.includes(id)) droppedChannels.push(id);
    }
  }
  if (droppedChannels.length) {
    console.warn('[dsh-cron] import: unknown channel ids were dropped: ' + droppedChannels.join(', '));
  }
  const existingIds = store.list({ status: 'all' }).map((x) => x.id);
  const plan = planImport(checked.tasks, existingIds, strategy);
  // Replacing a task the config owns would be undone at the next start, and
  // the id could then hold two different tasks (#50).
  const configConflicts = plan.replace
    .map((item) => item.id)
    .filter((taskId) => {
      const stored = store.get(taskId);
      return stored && stored.managedBy === MANAGED_BY_CONFIG;
    });
  if (configConflicts.length) {
    sendJson(res, 409, {
      ok: false,
      error: 'These tasks are declared in the profile config and cannot be replaced by an import: ' + configConflicts.join(', '),
    });
    return;
  }
  const summary = { add: plan.add.length, replace: plan.replace.length, skip: plan.skip.length };
  if (body && body.dryRun) {
    sendJson(res, 200, {
      ok: true,
      dryRun: true,
      strategy: plan.strategy,
      summary,
      codeExecuting: hasCodeExecutingTask(plan.add.concat(plan.replace)),
      unknownChannels: droppedChannels,
    });
    return;
  }
  const applied = applyImportPlan({ store, scheduler, plan });
  if (applied.error) {
    sendJson(res, 500, { ok: false, error: applied.error });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    imported: applied.imported.length,
    summary,
    unknownChannels: droppedChannels,
    tasks: applied.imported,
  });
}

/**
 * Write an import plan. Every imported task is paused (the file's status is
 * ignored) and every touched id is disarmed explicitly, because writing
 * "paused" does not stop an already-armed croner job. A failed write rolls the
 * store back so a partial import cannot survive.
 */
export function applyImportPlan({ store, scheduler, plan }) {
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
      } catch (rollbackErr) {
        console.warn(`[dsh-cron] import rollback failed for task "${entry.id}":`, rollbackErr?.message || rollbackErr);
      }
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

