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
import { resolveTelegramSecrets, resolveCredentialValue } from './secrets.js';
import {
  PATCHABLE_TASK_FIELDS,
  DUPLICATE_TASK_FIELDS,
  RESERVED_TASK_IDS,
  EXPORT_SECRET_BEARING_FIELDS,
  validateTaskType,
  buildDuplicateTask,
  buildTaskExport,
  validateImportDocument,
  hasCodeExecutingTask,
  planImport,
  TASK_EXPORT_KIND,
  TASK_EXPORT_VERSION,
  EXPORT_TASK_FIELDS,
  IMPORT_STRATEGIES,
} from './task-transfer.js';

// Re-exported for backward compatibility: tests and tools import these names
// from lib/index.js.
export {
  PATCHABLE_TASK_FIELDS,
  DUPLICATE_TASK_FIELDS,
  RESERVED_TASK_IDS,
  EXPORT_SECRET_BEARING_FIELDS,
  validateTaskType,
  buildDuplicateTask,
  buildTaskExport,
  validateImportDocument,
  hasCodeExecutingTask,
  planImport,
  TASK_EXPORT_KIND,
  TASK_EXPORT_VERSION,
  EXPORT_TASK_FIELDS,
  IMPORT_STRATEGIES,
};
import { deliverRun, CHANNEL_IDS, resolveDeliveryTimeoutMs, MIN_DELIVERY_TIMEOUT_MS } from './channels.js';
import { sendJson, rejectCrossOrigin, readBody } from './http-utils.js';
import { recipeRecommendations, recipesByCategory } from './recipes.js';
import { applyTaskPatch, describeTaskPatch } from './task-patch.js';
import { makeAsk } from './silent-rule.js';

// The REST surface lives in lib/api.js. It is IMPORTED (the plugin body calls
// it) and re-exported for tests and tools that import it from the entry point —
// a bare re-export creates no local binding and the plugin then fails to load
// with "createCronApiHandler is not defined".
import { createCronApiHandler } from './api.js';
export { createCronApiHandler };

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
  // --- Delivery channels (#20-#23, #26, #28, #47) ---
  template: z.string().default('').description('Global notification template; placeholders: {title} {status} {output} {error} {duration} {schedule} {time} {tokens} {cost}'),
  channelTemplates: z.object({}).default({}).description('Per-channel template overrides keyed by channel id'),
  silentRuleModel: z.string().default('').description('Model used to evaluate a task silent rule (empty = the task model)'),
  inspectorModel: z.string().default('').description('Model used to diagnose failed runs (empty = the task model)'),
  deliveryTimeoutMs: z.number().min(MIN_DELIVERY_TIMEOUT_MS).default(15000).description('Per-channel delivery timeout in ms (minimum 1000); a slower endpoint is recorded as a failure and does not block other channels or the next tick'),
  discordWebhookUrl: z.string().default('').description('Discord webhook URL'),
  slackWebhookUrl: z.string().default('').description('Slack incoming webhook URL'),
  ntfyUrl: z.string().default('https://ntfy.sh').description('ntfy server base URL'),
  ntfyTopic: z.string().default('').description('ntfy topic for push notifications'),
  ntfyTokenRef: z.string().default('').description('Credential name for the ntfy access token'),
  barkServerUrl: z.string().default('https://api.day.app').description('Bark server base URL'),
  barkKey: z.string().default('').description('Bark device key'),
  pushplusTokenRef: z.string().default('').description('Credential name for the PushPlus token'),
  pushplusUrl: z.string().default('https://www.pushplus.plus/send').description('PushPlus send endpoint (override for a self-hosted proxy)'),
  ttsBaseUrl: z.string().default('http://127.0.0.1:3080').description('Base URL of the harness used to reach the dsh-tts speak route'),
  giteaBaseUrl: z.string().default('').description('Gitea base URL for alert issues'),
  giteaRepo: z.string().default('').description('Gitea repository (owner/name) for alert issues'),
  giteaTokenRef: z.string().default('').description('Credential name for the Gitea API token'),
});


export const SETTINGS_SYNC_KEYS = [
  'botToken', 'botTokenRef', 'chatId', 'notifyTelegram', 'onlyOnFailure', 'kanbanBaseUrl',
  'template', 'channelTemplates', 'deliveryTimeoutMs', 'silentRuleModel', 'inspectorModel',
  'discordWebhookUrl', 'slackWebhookUrl',
  'ntfyUrl', 'ntfyTopic', 'ntfyTokenRef',
  'barkServerUrl', 'barkKey',
  'pushplusTokenRef',
  'pushplusUrl',
  'ttsBaseUrl',
  'giteaBaseUrl', 'giteaRepo', 'giteaTokenRef',
];

/**
 * Apply settings writes through the registered settings scope so the core
 * snapshot stays authoritative (#102). Returns null when the settings
 * service is unavailable (headless profiles fall back to store-only writes).
 */
export async function applySettingsToScope(settingsScope, body) {
  if (!settingsScope || typeof settingsScope.set !== 'function') return null;
  const errors = [];
  for (const key of SETTINGS_SYNC_KEYS) {
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
 * Drop values that must never re-enter the store from the client:
 *
 * - a masked secret echoed back by the settings UI would overwrite the real
 *   value (bot token, webhook URLs, Bark key);
 * - the raw credential keys are refused outright — the *Ref fields are the
 *   supported way to configure them.
 *
 * Applied before both the settings scope and the store, because the scope is
 * the source of truth and would otherwise persist a raw or masked value.
 */
export function sanitizeSettingsPayload(body) {
  const payload = Object.assign({}, body);
  for (const key of TaskStore.MASKED_SETTING_KEYS) {
    const val = payload[key];
    if (typeof val === 'string' && (val.includes('••') || val.includes('****'))) {
      delete payload[key];
    }
  }
  for (const key of TaskStore.FORBIDDEN_SETTING_KEYS) {
    if (key in payload) {
      console.warn(`[dsh-cron] refusing raw secret "${key}" from the client — use a credential reference`);
      delete payload[key];
    }
  }
  // #115: normalise the delivery deadline here, before it reaches the settings
  // scope, so a value like 1 ms can never be persisted and then fail every
  // delivery before the request is even sent.
  if ('deliveryTimeoutMs' in payload) {
    const raw = payload.deliveryTimeoutMs;
    const n = Number(raw);
    if (raw === '' || raw === null || !Number.isFinite(n) || n <= 0) {
      delete payload.deliveryTimeoutMs;
    } else {
      payload.deliveryTimeoutMs = resolveDeliveryTimeoutMs(n);
    }
  }
  return payload;
}

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
    channels: Array.isArray(args.channels) ? args.channels.filter((c) => CHANNEL_IDS.includes(c)) : undefined,
    template: args.template ? String(args.template) : '',
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
  inspectOnFailure: { type: 'boolean', description: 'Diagnose failed runs with a model and store the diagnosis with the run (agent tasks)' },
  silentRule: { type: 'string', description: 'Plain-language condition for staying silent on a successful run (script/node/python/http tasks)' },
  fallbackModel: { type: 'string', description: 'Model tried once more when the primary model fails (llm/skill/workflow tasks)' },
  fallbackProvider: { type: 'string', description: 'Provider for the fallback model (defaults to the task provider)' },
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
  channels: { type: 'array', items: { type: 'string', enum: CHANNEL_IDS }, description: 'Notification channels for this task; empty = legacy telegram/kanban flags' },
  template: { type: 'string', description: 'Notification template with {title} {status} {output} {error} {duration} placeholders; empty = built-in text' },
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
    askModel: makeAsk(ctx),
    deliver: (task, runInfo, settings) => deliverRun({
      task,
      runInfo,
      settings,
      secrets: {
        botToken: settings.botToken || '',
        resolveSecret: (ref) => resolveCredentialValue(ctx, ref),
      },
    }),
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

  // #48: the recipe hub is the single source of the panel's suggestions.
  const recommendations = recipeRecommendations();

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

  // GET /dsh-cron/recipes (#48): the built-in recipe catalog.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/recipes',
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        const categories = recipesByCategory();
        const recipes = categories.reduce((acc, category) => acc.concat(category.recipes), []);
        sendJson(res, 200, { ok: true, categories, recipes });
      } catch (err) {
        sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /recipes');

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
    name: 'cron_get_task',
    description: 'Read the full configuration of one scheduled task, including fields that are not visible in the task list',
    parameters: {
      id: { type: 'string', description: 'Task identifier', required: true }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          task: { type: 'object', additionalProperties: true }
        }
      },
      render: (_args, val) => [{ type: 'text', text: val.message }]
    },
    execute: async (args) => {
      const task = store.get(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      const summary = [
        `Task "${task.title}" (${task.id})`,
        `type: ${task.type || 'llm'}`,
        `schedule: ${task.scheduleText || task.schedule}`,
        `status: ${task.status}`,
        task.type === 'llm' || !task.type ? `model: ${task.model || '(default)'}${task.fallbackModel ? ` (fallback: ${task.fallbackModel})` : ''}` : null,
        `channels: ${Array.isArray(task.channels) && task.channels.length ? task.channels.join(', ') : '(legacy flags)'}`,
        `prompt: ${String(task.prompt || '').slice(0, 500)}`,
      ].filter(Boolean).join(String.fromCharCode(10));
      return { success: true, message: summary, task };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_update_task',
    description: 'Change an existing scheduled task. Ask the user what to change first. Switching a task to a code-executing type (script/node/python/ssh/docker) is refused unless confirmCodeSwitch is set, which requires the user to have agreed explicitly. Only the documented task fields can be changed.',
    parameters: {
      id: { type: 'string', description: 'Task identifier', required: true },
      confirmCodeSwitch: { type: 'boolean', description: 'Set to true only after the user explicitly agreed to switch this task into a type that executes code' },
      title: { type: 'string', description: 'New title' },
      schedule: { type: 'string', description: 'New schedule (cron expression or interval)' },
      prompt: { type: 'string', description: 'New prompt or command' },
      type: { type: 'string', enum: TASK_TYPES, description: 'New execution type' },
      model: { type: 'string', description: 'New model for agent tasks' },
      fallbackModel: { type: 'string', description: 'New fallback model' },
      provider: { type: 'string', description: 'New provider' },
      channels: { type: 'array', items: { type: 'string', enum: CHANNEL_IDS }, description: 'New delivery channels' },
      template: { type: 'string', description: 'New message template' },
      onlyOnFailure: { type: 'boolean', description: 'Deliver only on failures' },
      timeoutSeconds: { type: 'number', description: 'New execution timeout in seconds' },
      overlapPolicy: { type: 'string', enum: ['skip', 'queue', 'replace'], description: 'New overlap policy' },
      maxRetries: { type: 'number', description: 'New retry count' },
      kanbanMode: { type: 'string', enum: ['none', 'on_failure', 'always'], description: 'New Kanban policy' },
      timezone: { type: 'string', description: 'New IANA time zone' },
      cwd: { type: 'string', description: 'New working directory' },
      env: { type: 'object', additionalProperties: true, description: 'New environment variables (KEY: value)' }
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
      const { id, confirmCodeSwitch, ...patch } = args || {};
      if (!id) return { success: false, message: 'A task id is required' };
      const result = applyTaskPatch({ store, scheduler, id, body: patch, allowCodeSwitch: confirmCodeSwitch === true });
      if (!result.ok) return { success: false, message: result.error };
      return {
        success: true,
        message: `Task "${result.task.title}" updated (${result.task.scheduleText || result.task.schedule}). Changed: ${describeTaskPatch(result.task, result.patch)}`,
      };
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
