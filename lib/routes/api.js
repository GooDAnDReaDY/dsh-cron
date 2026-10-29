import { handleTaskWebhookRoute } from './api-task-webhook.js';
import { sendJson, rejectCrossOrigin, redactTaskSecrets } from '../http-utils.js';
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
  handleScheduleTimeline,
} from './api-helpers.js';
import {
  refuseConfigOwned,
  handleTaskCollection,
  createOrUpdateTask,
  NOT_ALLOWED,
  NOT_FOUND,
} from './api-collection.js';
import { handleTaskItem, deleteTask } from './api-item.js';
import { handleItemPost } from './api-actions.js';

export {
  handleTaskExport,
  handleTaskImport,
  applyImportPlan,
  handleTelegramWebhook,
  handleHeartbeatPing,
  handleSchedulePreview,
  handleDryRunTask,
  handleScheduleTimeline,
  refuseConfigOwned,
};

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
  const ctx = collection?.ctx;
  return async function handleCronApi(req, res) {
    try {
      const apiToken = store?.getSettings?.()?.apiToken;
      const authOptions = { apiToken, ctx };
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').filter(Boolean);
      const scope = parts[1]; // 'tasks' | 'action' | 'heartbeat-ping'
      const id = parts[2];
      const action = parts[3];
      const subAction = parts[4];

      if (scope === 'telegram' && id === 'webhook') {
        await handleTelegramWebhook({ store, scheduler, req, res });
        return;
      }
      if (scope === 'webhook' && id) {
        await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: id });
        return;
      }

      if ((scope === 'heartbeat' || scope === 'heartbeat-ping') && id) {
        handleHeartbeatPing({ store, req, res, taskId: id, apiToken, ctx });
        return;
      }

      if (scope === 'schedule' && id === 'preview') {
        await handleSchedulePreview({ req, res, url, store, apiToken, ctx });
        return;
      }
      if (scope === 'schedule' && id === 'timeline-24h') {
        await handleScheduleTimeline({ req, res, url, store, scheduler, apiToken, ctx });
        return;
      }

      if (!id) {
        await handleTaskCollection({ store, scheduler, collection, req, res, url, scope, apiToken, ctx });
        return;
      }

      if (rejectCrossOrigin(req, res, { apiToken, ctx })) return;

      // Export/import are collection operations that live under /tasks/:id/…,
      // so they are matched before the generic id handling below.
      if (id === 'export') {
        if (req.method !== 'GET') {
          sendJson(res, 405, NOT_ALLOWED);
          return;
        }
        handleTaskExport({ store, req, res });
        return;
      }
      if (id === 'import') {
        if (req.method !== 'POST') {
          sendJson(res, 405, NOT_ALLOWED);
          return;
        }
        await handleTaskImport({ store, scheduler, req, res });
        return;
      }

      await handleTaskItem({ store, scheduler, req, res, url, id, action, subAction, apiToken, ctx });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
    }
  };
}

// --------------------------------------------------------- external surface

/**
 * Task operations for the token-guarded /dsh-cron/api/* prefix (#54). The shape
 * is deliberately small — list, read, create or update, delete, manual run —
 * and reuses the handlers above, so the confirmation gate for code-executing
 * tasks and the config-owned refusals are the same code, not a second copy.
 */
export async function handleExternalTaskRequest({ store, scheduler, req, res, url, apiToken }) {
  const parts = url.pathname.split('/').filter(Boolean); // dsh-cron, api, [tasks|heartbeat|schedule], :id?, :action?
  if (parts[2] === 'webhook' && parts[3]) {
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: parts[3] });
    return;
  }
  if (parts[2] === 'heartbeat' && parts[3]) {
    handleHeartbeatPing({ store, req, res, taskId: parts[3], apiToken });
    return;
  }
  if (parts[2] === 'schedule' && parts[3] === 'preview') {
    await handleSchedulePreview({ req, res, url, store, apiToken });
    return;
  }
  const id = parts[3];
  const action = parts[4];
  const subAction = parts[5];

  if (!id) {
    if (req.method === 'GET') {
      const list = store
        .list({ status: url.searchParams.get('status') || 'all', query: url.searchParams.get('query') || '' })
        .map((task) => ({ ...redactTaskSecrets(task), running: scheduler.isRunning(task.id) }));
      sendJson(res, 200, { ok: true, tasks: list });
      return;
    }
    if (req.method === 'POST') {
      await createOrUpdateTask({ store, scheduler, req, res, apiToken, ctx: undefined });
      return;
    }
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }

  if (req.method === 'POST') {
    const handled = await handleItemPost({ store, scheduler, req, res, url, id, action, subAction });
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

