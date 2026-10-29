import { logStreamer } from '../log-streamer.js';
import { applyTaskPatch } from '../task-patch.js';
import { MANAGED_BY_CONFIG } from '../config-jobs.js';
import { sendJson, rejectCrossOrigin, readBody, SCRIPT_CONFIRM_HEADER, redactTaskSecrets } from '../http-utils.js';
import { normalizeTaskType } from '../runtimes.js';
import { handleHeartbeatPing, handleDryRunTask } from './api-helpers.js';
import { handleItemPost } from './api-actions.js';
import { refuseConfigOwned, NOT_FOUND, NOT_ALLOWED } from './api-collection.js';

// ------------------------------------------------------------ single task

export async function handleTaskItem({ store, scheduler, req, res, url, id, action, subAction, apiToken, ctx }) {
  if (action === 'heartbeat') {
    handleHeartbeatPing({ store, req, res, taskId: id, apiToken, ctx });
    return;
  }

  if (req.method === 'POST' && action === 'dry-run') {
    await handleDryRunTask({ store, scheduler, req, res, id, apiToken, ctx });
    return;
  }

  if (req.method === 'GET') {
    // Both /dsh-cron/tasks/:id/stream and /dsh-cron/tasks/:id/logs/stream (#392)
    if (action === 'stream' || (action === 'logs' && subAction === 'stream')) {
      logStreamer.handleSseRequest(id, req, res);
      return;
    }
    if (rejectCrossOrigin(req, res, { apiToken, ctx })) return;
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
    if (action === 'prompt-history') {
      const task = store.get(id);
      if (!task) {
        sendJson(res, 404, NOT_FOUND);
        return;
      }
      sendJson(res, 200, {
        ok: true,
        taskId: id,
        promptVersion: task.promptVersion || 1,
        promptHistory: task.promptHistory || [],
      });
      return;
    }
    if (action === 'history') {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      sendJson(res, 200, { ok: true, history: store.getHistory(id, limit) });
      return;
    }
    if (action === 'git-diff') {
      const task = store.get(id);
      if (!task) {
        sendJson(res, 404, NOT_FOUND);
        return;
      }
      const runs = store.getHistory(id, 10);
      const runId = url.searchParams.get('runId') || subAction;
      const targetRun = runId ? runs.find((r) => r.id === runId) : runs[0];
      const diffData = targetRun?.gitDiff || null;
      sendJson(res, 200, {
        ok: true,
        taskId: id,
        runId: targetRun?.id || null,
        gitDiff: diffData,
      });
      return;
    }
    if (action === 'doctor') {
      const task = store.get(id);
      if (!task) {
        sendJson(res, 404, NOT_FOUND);
        return;
      }
      const runs = store.getHistory(id, 5);
      const latestRun = runs[0] || null;
      const reportRun = runs.find((r) => r.doctorReport) || latestRun;
      sendJson(res, 200, {
        ok: true,
        taskId: id,
        doctorReport: reportRun?.doctorReport || null,
        revisions: task.revisions || [],
        previousPrompt: task.previousPrompt || null,
        autoHeal: Boolean(task.autoHeal || task.selfHealing?.autoApply),
      });
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
    const handled = await handleItemPost({ store, scheduler, req, res, url, id, action, subAction });
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

export async function patchTask({ store, scheduler, req, res, id }) {
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
    const status = result.status || (result.notFound ? 404 : (result.needsConfirmation ? 403 : 400));
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


export function deleteTask({ store, scheduler, res, id }) {
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
    try {
      store.delete(id);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: 'Failed to delete task: ' + err.message });
      return;
    }
  }
  sendJson(res, 200, { ok: true });
}

