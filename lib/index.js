import { TaskStore } from './store.js';
import { TaskScheduler, parseScheduleExpression } from './scheduler.js';
import { SessionRunner } from './runner.js';
import { getModelsHandler } from './models-handler.js';
import { chatStartHandler } from './chat-start.js';
import { sendTelegramMessage } from './telegram.js';
import { createKanbanCard } from './integrations.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
import {
  parseJsonBody,
  isCrossOrigin,
  pickPatchableFields,
  SCRIPT_CONFIRM_HEADER,
} from './http-utils.js';
import { TASK_TYPES, CODE_EXECUTING_TYPES, normalizeTaskType } from './runtimes.js';
import { resolveTelegramSecrets } from './secrets.js';

export const name = '@goodandready/dsh-cron';
export const inject = ['tools', 'webServer', 'settings', 'llm', 'agents', 'agentDefaultModel', 'credentials'];

export const Config = z.object({
  botToken: z.string().role('secret').default('').description('Legacy Telegram Bot API token (prefer botTokenRef with the DSH credentials service)'),
  botTokenRef: z.string().default('').description('Name of the DSH credential that holds the Telegram bot token'),
  chatId: z.string().default('').description('Telegram chat ID that receives task reports'),
  notifyTelegram: z.boolean().default(false).description('Deliver task reports to Telegram for every task'),
  onlyOnFailure: z.boolean().default(false).description('Deliver reports only for failed runs'),
  kanbanBaseUrl: z.string().default('http://127.0.0.1:3000').description('Base URL of the dsh-kanban HTTP API'),
  defaultTimezone: z.string().default('').description('Default IANA time zone for schedules (empty = server local)'),
  maxConcurrent: z.number().default(0).description('Max parallel task runs (0 = unlimited)'),
  heartbeatUrl: z.string().default('').description('Dead man\'s snitch URL pinged on the heartbeat interval'),
  heartbeatIntervalSec: z.number().default(0).description('Heartbeat ping interval in seconds (0 = off)'),
});

const PATCHABLE_TASK_FIELDS = [
  'title',
  'schedule',
  'scheduleText',
  'prompt',
  'type',
  'delivery',
  'provider',
  'model',
  'timezone',
  'misfirePolicy',
  'maxRetries',
  'retryBackoffMs',
  'permissionPreset',
  'env',
  'cwd',
  'workspaceId',
  'worktree',
  'keepWorktree',
  'httpMethod',
  'httpUrl',
  'httpHeaders',
  'httpBody',
  'sshTarget',
  'sshPort',
  'sshKeyPath',
  'sshProfileId',
  'dockerImage',
  'pythonPath',
  'nodePath',
  'skillName',
  'workflowName',
  'notifyTelegram',
  'onlyOnFailure',
  'timeoutSeconds',
  'overlapPolicy',
  'kanbanMode',
  'status',
  'oneShot',
];

/**
 * Validate runtime-specific task configuration. Returns an error string or
 * null when the payload is usable for the given type.
 */
export function validateTaskType(type, payload) {
  const t = normalizeTaskType(type);
  if (t === 'http') {
    const raw = String((payload && (payload.httpUrl || payload.prompt)) || '').trim();
    if (!raw) return 'HTTP tasks require a URL (httpUrl or prompt)';
    try {
      // eslint-disable-next-line no-new
      new URL(raw);
    } catch {
      return `Invalid HTTP URL: ${raw}`;
    }
  }
  if (t === 'ssh') {
    const hasProfile = Boolean(payload && String(payload.sshProfileId || '').trim());
    const hasTarget = Boolean(payload && String(payload.sshTarget || '').trim());
    if (!hasProfile && !hasTarget) return 'SSH tasks require sshProfileId (remote-workspace profile) or sshTarget (user@host)';
  }
  if (t === 'docker' && !String((payload && payload.dockerImage) || '').trim()) {
    return 'Docker tasks require dockerImage';
  }
  return null;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function rejectCrossOrigin(req, res) {
  if (isCrossOrigin(req)) {
    sendJson(res, 403, { ok: false, error: 'Cross-origin request rejected' });
    return true;
  }
  return false;
}

async function readBody(req, res) {
  try {
    return { body: await parseJsonBody(req) };
  } catch (err) {
    sendJson(res, err.statusCode || 400, { ok: false, error: err.message });
    return { error: true };
  }
}

/**
 * Apply settings writes through the registered settings scope so the core
 * snapshot stays authoritative (#102). Returns null when the settings
 * service is unavailable (headless profiles fall back to store-only writes).
 */
export async function applySettingsToScope(settingsScope, body) {
  if (!settingsScope || typeof settingsScope.set !== 'function') return null;
  const errors = [];
  for (const key of ['botToken', 'botTokenRef', 'chatId', 'notifyTelegram', 'onlyOnFailure', 'kanbanBaseUrl']) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    try {
      await settingsScope.set(key, body[key]);
    } catch (e) {
      errors.push(key + ': ' + ((e && e.message) || e));
    }
  }
  return errors;
}

/**
 * Drop values that must never re-enter the store from the client: a masked
 * secret echoed back by the settings UI would overwrite the real token.
 */
export function sanitizeSettingsPayload(body) {
  const payload = Object.assign({}, body);
  if (typeof payload.botToken === 'string' && (payload.botToken.includes('••') || payload.botToken.includes('****'))) {
    delete payload.botToken;
  }
  return payload;
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
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').filter(Boolean);
      const scope = parts[1]; // 'tasks' | 'action'
      const id = parts[2];
      const action = parts[3];

      // Collection level: /dsh-cron/tasks (list + create)
      if (!id) {
        if (scope === 'action' || !collection) {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        if (req.method === 'GET') {
          const status = url.searchParams.get('status') || 'all';
          const query = url.searchParams.get('query') || '';
          const list = store.list({ status, query }).map((t) => ({
            ...t,
            running: scheduler.isRunning(t.id),
            runningSince: scheduler.runningSince(t.id),
          }));
          const stats = store.getAggregatedStats();
          sendJson(res, 200, { ok: true, tasks: list, recommendations: collection.recommendations, stats });
          return;
        }
        if (req.method === 'POST') {
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
          const current = body.id ? store.get(body.id) : null;
          const resolvedStatus = body.status || (current ? current.status : 'active');

          const task = store.set({
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
            env: body.env && typeof body.env === 'object' ? body.env : (current ? current.env : undefined),
            cwd: body.cwd !== undefined ? String(body.cwd).trim() : (current ? current.cwd : ''),
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
            oneShot: Boolean(parsed.isOneShot || body.oneShot),
          });
          if (task.status === 'active') {
            scheduler.scheduleTask(task);
          } else {
            scheduler.pauseTask(task.id);
          }
          sendJson(res, 200, { ok: true, task });
          return;
        }
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      // Item level: /dsh-cron/{tasks|action}/:id[/:action]
      if (req.method !== 'GET' && rejectCrossOrigin(req, res)) return;

      if (req.method === 'GET' && (action === 'history' || !action)) {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        sendJson(res, 200, { ok: true, history: store.getHistory(id, limit) });
        return;
      }

      if (req.method === 'POST' && action === 'run') {
        if (!store.get(id)) {
          sendJson(res, 404, { ok: false, error: 'Task not found' });
          return;
        }
        await scheduler.triggerManualRun(id);
        sendJson(res, 200, { ok: true, task: store.get(id) });
        return;
      }

      if (req.method === 'POST' && action === 'pause') {
        const task = scheduler.pauseTask(id);
        if (!task) {
          sendJson(res, 404, { ok: false, error: 'Task not found' });
          return;
        }
        sendJson(res, 200, { ok: true, task });
        return;
      }

      if (req.method === 'POST' && action === 'resume') {
        const task = scheduler.resumeTask(id);
        if (!task) {
          sendJson(res, 404, { ok: false, error: 'Task not found' });
          return;
        }
        sendJson(res, 200, { ok: true, task });
        return;
      }

      if (req.method === 'POST' && (action === 'toggle' || (!action && url.searchParams.get('action') === 'toggle'))) {
        const current = store.get(id);
        if (!current) {
          sendJson(res, 404, { ok: false, error: 'Task not found' });
          return;
        }
        const task = scheduler.toggleTask(id);
        sendJson(res, 200, { ok: true, task });
        return;
      }

      if (req.method === 'PATCH') {
        const current = store.get(id);
        if (!current) {
          sendJson(res, 404, { ok: false, error: 'Task not found' });
          return;
        }
        const { body, error } = await readBody(req, res);
        if (error) return;
        // Whitelist patchable fields so stats/timestamps stay server-owned (#90)
        const patchData = pickPatchableFields(body, PATCHABLE_TASK_FIELDS);
        if (patchData.type !== undefined) {
          patchData.type = normalizeTaskType(patchData.type);
          const switchingToCode = CODE_EXECUTING_TYPES.includes(patchData.type)
            && !CODE_EXECUTING_TYPES.includes(current.type);
          if (switchingToCode && req.headers[SCRIPT_CONFIRM_HEADER] !== 'script') {
            sendJson(res, 403, { ok: false, error: `Switching a task to the ${patchData.type} type over HTTP requires the x-dsh-cron-confirm: script header` });
            return;
          }
          const typeError = validateTaskType(patchData.type, { ...current, ...patchData });
          if (typeError) {
            sendJson(res, 400, { ok: false, error: typeError });
            return;
          }
        }
        if (patchData.schedule) {
          const parsed = parseScheduleExpression(patchData.schedule);
          patchData.schedule = parsed.cronPattern || patchData.schedule;
          patchData.scheduleText = body.scheduleText || parsed.humanText;
          patchData.oneShot = Boolean(parsed.isOneShot || body.oneShot);
        }
        const task = store.set({ ...current, ...patchData, id });
        if (task.status === 'active') {
          scheduler.scheduleTask(task);
        } else {
          scheduler.pauseTask(id);
        }
        sendJson(res, 200, { ok: true, task });
        return;
      }

      if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
        const current = store.get(id);
        if (current) {
          scheduler.pauseTask(id);
          store.delete(id);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
    }
  };
}

/**
 * Single implementation behind the cron_create_task / cron_schedule_task
 * alias pair (#70, #92). Exported for unit tests.
 */
export function executeCreateTask(store, scheduler, args) {
  const taskType = normalizeTaskType(args.type);
  const typeError = validateTaskType(taskType, args);
  if (typeError) throw new Error(typeError);
  const parsed = parseScheduleExpression(args.schedule);
  const task = store.set({
    title: args.title,
    schedule: parsed.cronPattern || args.schedule,
    scheduleText: parsed.humanText,
    prompt: args.prompt,
    type: taskType,
    delivery: args.delivery || 'isolated',
    status: 'active',
    provider: args.provider,
    model: args.model,
    notifyTelegram: Boolean(args.notifyTelegram),
    onlyOnFailure: Boolean(args.onlyOnFailure),
    timeoutSeconds: Number(args.timeoutSeconds) || 1800,
    overlapPolicy: args.overlapPolicy || 'skip',
    timezone: args.timezone ? String(args.timezone).trim() : '',
    misfirePolicy: ['skip', 'runOnce', 'catchUpAll'].includes(args.misfirePolicy) ? args.misfirePolicy : 'skip',
    maxRetries: Number(args.maxRetries) > 0 ? Number(args.maxRetries) : 0,
    retryBackoffMs: Number(args.retryBackoffMs) > 0 ? Number(args.retryBackoffMs) : 30000,
    permissionPreset: ['default', 'read-only', 'workspace-write', 'full'].includes(args.permissionPreset) ? args.permissionPreset : 'default',
    kanbanMode: args.kanbanMode || 'none',
    env: args.env && typeof args.env === 'object' ? args.env : undefined,
    cwd: args.cwd ? String(args.cwd).trim() : '',
    workspaceId: args.workspaceId ? String(args.workspaceId).trim() : '',
    worktree: Boolean(args.worktree),
    keepWorktree: Boolean(args.keepWorktree),
    httpMethod: args.httpMethod ? String(args.httpMethod).toUpperCase() : 'GET',
    httpUrl: args.httpUrl ? String(args.httpUrl).trim() : '',
    httpHeaders: args.httpHeaders,
    httpBody: args.httpBody !== undefined ? String(args.httpBody) : '',
    sshProfileId: args.sshProfileId ? String(args.sshProfileId).trim() : '',
    sshTarget: args.sshTarget ? String(args.sshTarget).trim() : '',
    sshPort: Number(args.sshPort) || 0,
    sshKeyPath: args.sshKeyPath ? String(args.sshKeyPath).trim() : '',
    dockerImage: args.dockerImage ? String(args.dockerImage).trim() : '',
    pythonPath: args.pythonPath ? String(args.pythonPath).trim() : '',
    nodePath: args.nodePath ? String(args.nodePath).trim() : '',
    skillName: args.skillName ? String(args.skillName).trim() : '',
    workflowName: args.workflowName ? String(args.workflowName).trim() : '',
    oneShot: Boolean(parsed.isOneShot),
  });
  scheduler.scheduleTask(task);
  return {
    success: true,
    message: `Task "${task.title}" scheduled successfully (${task.scheduleText})`,
    task
  };
}

export const createTaskParameters = {
  title: { type: 'string', description: 'Short task name', required: true },
  schedule: { type: 'string', description: 'Schedule: cron ("0 9 * * *"), shorthand ("@daily", "@every 30m"), interval ("every 2h") or one-shot ("in 30m", "at: 2026-09-05T15:00:00Z")', required: true },
  prompt: { type: 'string', description: 'Prompt/instruction for the agent at run time', required: true },
  type: { type: 'string', enum: TASK_TYPES, description: 'Task type: llm | script | node | python | http | ssh | docker | skill | workflow' },
  delivery: { type: 'string', enum: ['current', 'isolated'], description: 'Run mode: current (in the current chat) or isolated (separate session)' },
  provider: { type: 'string', description: 'Model provider (optional)' },
  model: { type: 'string', description: 'Model (optional)' },
  timezone: { type: 'string', description: 'IANA time zone for the schedule, e.g. "Europe/Berlin" (optional, default = server local)' },
  notifyTelegram: { type: 'boolean', description: 'Send the run report to Telegram' },
  onlyOnFailure: { type: 'boolean', description: 'Send reports only for failures' },
  timeoutSeconds: { type: 'number', description: 'Execution time limit in seconds' },
  overlapPolicy: { type: 'string', enum: ['skip', 'queue', 'replace'], description: 'Overlap policy' },
  misfirePolicy: { type: 'string', enum: ['skip', 'runOnce', 'catchUpAll'], description: 'What to do with a run missed during downtime' },
  maxRetries: { type: 'number', description: 'Automatic retry attempts on failure (0 = off)' },
  retryBackoffMs: { type: 'number', description: 'Base backoff between retries in ms, doubled per attempt' },
  permissionPreset: { type: 'string', enum: ['default', 'read-only', 'workspace-write', 'full'], description: 'Permission preset applied to the task session' },
  kanbanMode: { type: 'string', enum: ['none', 'on_failure', 'always'], description: 'Create a dsh-kanban card for runs' },
  env: { type: 'object', additionalProperties: true, description: 'Environment variables for external runtimes (KEY: value); do not store secrets here' },
  cwd: { type: 'string', description: 'Working directory for the run (external runtimes and agent sessions)' },
  workspaceId: { type: 'string', description: 'Workspace bound to the task; resolved through the harness' },
  worktree: { type: 'boolean', description: 'Run code-modifying agent tasks in an isolated git worktree' },
  keepWorktree: { type: 'boolean', description: 'Keep the created worktree after the run' },
  nodePath: { type: 'string', description: 'Node.js binary for node tasks (default: the harness runtime)' },
  pythonPath: { type: 'string', description: 'Python interpreter for python tasks (default: auto-detected venv)' },
  httpMethod: { type: 'string', description: 'HTTP method for http tasks' },
  httpUrl: { type: 'string', description: 'URL for http tasks' },
  httpHeaders: { type: 'object', additionalProperties: true, description: 'Headers for http tasks' },
  httpBody: { type: 'string', description: 'Request body for http tasks' },
  sshProfileId: { type: 'string', description: 'dsh-remote-workspace profile id that provides host and credentials' },
  sshTarget: { type: 'string', description: 'Fallback user@host when no remote-workspace profile is used' },
  sshPort: { type: 'number', description: 'SSH port (with sshTarget fallback)' },
  sshKeyPath: { type: 'string', description: 'Private key path (with sshTarget fallback)' },
  dockerImage: { type: 'string', description: 'Container image for docker tasks' },
  skillName: { type: 'string', description: 'DSH skill name for skill tasks' },
  workflowName: { type: 'string', description: 'DSH workflow name for workflow tasks' },
};

const createTaskOutput = {
  schema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      task: { type: 'object', additionalProperties: true }
    }
  },
  render: (_args, val) => [{ type: 'text', text: val.message || JSON.stringify(val) }]
};

export function apply(ctx, config) {
  const store = new TaskStore();
  const runner = new SessionRunner(ctx);
  const scheduler = new TaskScheduler(store, (task, opts) => runner.execute(task, opts), {
    maxConcurrent: config && config.maxConcurrent,
    defaultTimezone: config && config.defaultTimezone,
    resolveSecrets: (settings) => resolveTelegramSecrets(ctx, settings),
  });

  // Register settings in the Harness settings service (#71, #102): the scope
  // is the source of truth for the core, scope.watch mirrors values into the
  // plugin store, and REST writes go through scope.set so nothing bypasses
  // the settings service.
  let cronSettingsScope = null;
  ctx.inject(['settings'], (sctx) => {
    try {
      cronSettingsScope = sctx.settings.register('dsh-cron', Config, {
        base: store.getSettings()
      });
      if (cronSettingsScope && typeof cronSettingsScope.watch === 'function') {
        cronSettingsScope.watch((updated) => {
          if (updated && typeof updated === 'object') {
            store.saveSettings(updated);
          }
        });
      }
      sctx.effect(() => () => {
        cronSettingsScope = null;
      });
    } catch (e) {
      console.warn('[dsh-cron] settings registration warning:', e.message);
    }
  });

  scheduler.start();

  // Heartbeat / dead man's snitch (#16): an optional periodic GET ping so an
  // external monitor can alert when this scheduler stops responding.
  let heartbeatTimer = null;
  if (config && config.heartbeatUrl && Number(config.heartbeatIntervalSec) > 0) {
    const intervalMs = Number(config.heartbeatIntervalSec) * 1000;
    heartbeatTimer = setInterval(() => {
      fetch(config.heartbeatUrl, { method: 'GET' }).catch((err) => {
        console.warn('[dsh-cron] heartbeat ping failed:', err.message);
      });
    }, intervalMs);
  }

  ctx.effect(() => {
    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      scheduler.stopAll();
    };
  }, 'dsh-cron: lifecycle');

  const recommendations = [
    {
      id: 'rec_daily_digest',
      title: 'Daily digest',
      schedule: '0 8 * * 1-5',
      scheduleText: 'Weekdays at 08:00',
      prompt: 'Prepare a brief morning digest: review the list of active tasks, open Gitea tickets and outline the key priorities for today.',
      description: 'Start every weekday with a summary of calendar, unread mail and priorities',
      icon: 'bell'
    },
    {
      id: 'rec_weekly_review',
      title: 'Weekly review',
      schedule: '0 16 * * 5',
      scheduleText: 'Fridays at 16:00',
      prompt: 'Prepare a weekly report on the work done: the list of closed tasks, created PRs and the current status of ongoing projects.',
      description: 'Every Friday create a short report on the completed work',
      icon: 'clipboard'
    },
    {
      id: 'rec_monitor_status',
      title: 'Follow-up monitor',
      schedule: '0 9 * * 1-5',
      scheduleText: 'Weekdays at 09:00',
      prompt: 'Review recent project activity, build statuses and flag everything that requires developer attention.',
      description: 'Review recent project activity and flag anything that needs your attention',
      icon: 'activity'
    }
  ];

  // 1. REST API — collection (list/create) + item actions in one prefix
  // handler per route family; registered WITHOUT the trailing slash (#96)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/tasks',
    handler: createCronApiHandler(store, scheduler, { recommendations })
  }), 'dsh-cron: /tasks[...]');

  // Alias route /dsh-cron/action/:id/:action for backward compatibility (#66)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/action',
    handler: createCronApiHandler(store, scheduler, null)
  }), 'dsh-cron: /action/:id/:action');

  // GET /dsh-cron/models
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/models',
    handler: async (req, res) => {
      await getModelsHandler(ctx, req, res, sendJson);
    }
  }), 'dsh-cron: /models');

  // POST /dsh-cron/chat/start
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/chat/start',
    handler: async (req, res) => {
      if (req.method === 'POST' && rejectCrossOrigin(req, res)) return;
      await chatStartHandler(ctx, req, res, parseJsonBody, sendJson, randomUUID);
    }
  }), 'dsh-cron: /chat/start');

  // GET & POST /dsh-cron/settings
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/settings',
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, settings: store.getClientSettings() });
          return;
        }
        if (req.method === 'POST') {
          if (rejectCrossOrigin(req, res)) return;
          const { body, error } = await readBody(req, res);
          if (error) return;
          // Masked secrets echoed back by the client must never overwrite the
          // stored token (store.saveSettings guards this too, #86-era).
          const payload = sanitizeSettingsPayload(body);
          const scopeErrors = await applySettingsToScope(cronSettingsScope, payload);
          if (scopeErrors === null) {
            store.saveSettings(payload);
          }
          sendJson(res, 200, { ok: true, settings: store.getClientSettings(), scopeErrors: scopeErrors || undefined });
          return;
        }
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      } catch (err) {
        sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /settings');

  // GET /dsh-cron/heartbeat (#16): liveness probe for external monitors.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/heartbeat',
    handler: async (req, res) => {
      try {
        const tasks = store.list({ status: 'active' });
        const lastRuns = tasks.map((t) => t.lastRunAt || 0);
        sendJson(res, 200, {
          ok: true,
          activeTasks: tasks.length,
          running: scheduler.runningCount(),
          lastRunAt: lastRuns.length ? Math.max(...lastRuns) : null,
          serverTime: Date.now(),
        });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /heartbeat');

  // POST /dsh-cron/telegram/test
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/telegram/test',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        if (rejectCrossOrigin(req, res)) return;
        const { body, error } = await readBody(req, res);
        if (error) return;
        const settings = store.getSettings();
        const botToken = body.botToken || settings.botToken;
        const chatId = body.chatId || settings.chatId;

        if (!botToken || !chatId) {
          sendJson(res, 400, { ok: false, error: 'botToken or chatId is not configured' });
          return;
        }

        const text = `🔔 *dsh-cron test notification*\n\nConnection between DSH Cron and Telegram is working! Checked at: \`${new Date().toISOString()}\``;
        await sendTelegramMessage({ botToken, chatId, text });
        sendJson(res, 200, { ok: true, message: 'Test message sent successfully' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /telegram/test');

  // POST /dsh-cron/kanban/test
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/kanban/test',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        if (rejectCrossOrigin(req, res)) return;
        const { body, error } = await readBody(req, res);
        if (error) return;
        const settings = store.getSettings();
        const kanbanBaseUrl = body.kanbanBaseUrl || settings.kanbanBaseUrl || 'http://127.0.0.1:3000';

        const result = await createKanbanCard({
          title: '[Test] dsh-cron -> Kanban connectivity check',
          body: `Test card created automatically by the \`dsh-cron\` module at ${new Date().toISOString()}.`,
          board: 'main',
          column: 'backlog',
          labels: ['cron', 'test'],
          kanbanBaseUrl
        });

        if (result.success) {
          sendJson(res, 200, { ok: true, task: result.task });
        } else {
          sendJson(res, 500, { ok: false, error: result.error });
        }
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /kanban/test');

  // 2. Tools
  ctx.tools.register(defineTool({
    name: 'cron_create_task',
    description: 'Create a new scheduled cron task (cron schedule, or one-shot via "at: <ISO timestamp>" or "in 20m")',
    parameters: createTaskParameters,
    output: createTaskOutput,
    execute: async (args) => executeCreateTask(store, scheduler, args)
  }));

  // Alias tool cron_schedule_task for compatibility with agent prompts (#70)
  ctx.tools.register(defineTool({
    name: 'cron_schedule_task',
    description: 'Alias for cron_create_task: create a new scheduled cron task',
    parameters: createTaskParameters,
    output: createTaskOutput,
    execute: async (args) => executeCreateTask(store, scheduler, args)
  }));

  ctx.tools.register(defineTool({
    name: 'cron_list_tasks',
    description: 'List all scheduled cron tasks',
    parameters: {
      status: { type: 'string', enum: ['all', 'active', 'paused', 'completed'], description: 'Filter by status' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          count: { type: 'number' },
          tasks: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      render: (_args, val) => [{ type: 'text', text: `Total tasks: ${val.count}` }]
    },
    execute: async (args) => {
      const tasks = store.list({ status: args.status || 'all' });
      return {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          schedule: t.scheduleText || t.schedule,
          status: t.status,
          nextRunAt: t.nextRunAt ? new Date(t.nextRunAt).toISOString() : null,
          lastStatus: t.lastStatus,
          totalTokens: t.totalTokens || 0,
          totalCostUsd: t.totalCostUsd || 0,
          oneShot: Boolean(t.oneShot),
        }))
      };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_pause_task',
    description: 'Pause a task by its ID',
    parameters: {
      id: { type: 'string', description: 'Task identifier', required: true }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      },
      render: (_args, val) => [{ type: 'text', text: val.message }]
    },
    execute: async (args) => {
      const task = scheduler.pauseTask(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      return { success: true, message: `Task "${task.title}" paused` };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_resume_task',
    description: 'Resume a paused task',
    parameters: {
      id: { type: 'string', description: 'Task identifier', required: true }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      },
      render: (_args, val) => [{ type: 'text', text: val.message }]
    },
    execute: async (args) => {
      const task = scheduler.resumeTask(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      return { success: true, message: `Task "${task.title}" resumed (${task.scheduleText})` };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_delete_task',
    description: 'Delete a task by its ID',
    parameters: {
      id: { type: 'string', description: 'Task identifier', required: true }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      },
      render: (_args, val) => [{ type: 'text', text: val.message }]
    },
    execute: async (args) => {
      scheduler.pauseTask(args.id);
      const ok = store.delete(args.id);
      return { success: ok, message: ok ? 'Task deleted' : 'Task not found' };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_run_task',
    description: 'Trigger a task immediately, out of band',
    parameters: {
      id: { type: 'string', description: 'Task identifier', required: true }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      },
      render: (_args, val) => [{ type: 'text', text: val.message }]
    },
    execute: async (args) => {
      const task = store.get(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      scheduler.triggerManualRun(args.id);
      return { success: true, message: `Manual run started for task "${task.title}"` };
    }
  }));
}
