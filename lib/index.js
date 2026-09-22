import { registerPluginUpdater } from './updater.js';
import { credentialRefStatus } from './secrets.js';
import { TaskStore } from './store.js';
import { TaskScheduler, parseScheduleExpression } from './scheduler.js';
import { SessionRunner } from './runner.js';
import { getModelsHandler } from './models-handler.js';
import { chatStartHandler } from './chat-start.js';
import { sendTelegramMessage, createTelegramTaskKeyboard } from './telegram.js';
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
import { createMetricsHandler } from './metrics.js';
import { applyConfigSync, isConfigOwned, configOwnedMessage } from './config-jobs.js';
import { createExternalApiHandler, EXTERNAL_API_PREFIX } from './external-api.js';
export { createCronApiHandler };

import {
  Config,
  SETTINGS_SYNC_KEYS,
  applySettingsToScope,
  sanitizeSettingsPayload,
  unwrapConfig,
  unwrapConfigValue,
} from './settings.js';
import { registerRoutes } from './routes.js';

export {
  Config,
  SETTINGS_SYNC_KEYS,
  applySettingsToScope,
  sanitizeSettingsPayload,
  unwrapConfig,
  unwrapConfigValue,
};

export const name = '@goodandready/dsh-cron';
export const inject = ['tools', 'webServer', 'llm', 'agents', 'agentDefaultModel', 'credentials'];

import { executeCreateTask } from './task-create.js';
export { executeCreateTask };

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

export function apply(ctx, rawConfig) {
  const config = unwrapConfig(rawConfig);
  const store = new TaskStore();

  // Sync settings declared in the profile config into the store (#184)
  if (config && typeof config === 'object') {
    const fromConfig = {};
    for (const key of SETTINGS_SYNC_KEYS) {
      const val = config[key];
      if (val !== undefined && val !== null && val !== '') {
        fromConfig[key] = val;
      }
    }
    if (Object.keys(fromConfig).length > 0) {
      store.saveSettings(fromConfig);
    }
  }
  const runner = new SessionRunner(ctx, store);
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

  // Settings integration for DSH 0.1.7+ (#184):
  // DSH 0.1.7 removed legacy settings.register and uses volatile Config fields.
  // We attach to settings optionally, configure presentation, and synchronize writes.
  let settingsService = null;
  ctx.inject(['settings'], (sctx) => {
    settingsService = sctx.settings;
    try {
      if (settingsService && typeof settingsService.configure === 'function') {
        sctx.effect(() => settingsService.configure({ auto: false }, ctx.fiber));
      }
    } catch {
      // ignore presentation policy errors
    }
    sctx.effect(() => () => {
      settingsService = null;
    });
  });

  // #50: jobs declared in the profile config belong to the config. The sync
  // runs before the scheduler starts and also when the section is gone: a
  // config that dropped its jobs must still retire the tasks it used to own.
  // A broken entry is reported and skipped, never fatal.
  try {
    const configJobs = Array.isArray(config && config.jobs) ? config.jobs : [];
    const summary = applyConfigSync({ store, scheduler, entries: configJobs });
    console.log('[dsh-cron] config jobs synced: ' + JSON.stringify(summary));
  } catch (err) {
    console.error('[dsh-cron] config job sync failed:', err.message);
  }

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

  // Auto-updater route (#147)
  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: '/api/dsh-cron/update',
    packageName: '@goodandready/dsh-cron',
    manifestUrl: new URL('../package.json', import.meta.url),
  }), 'dsh-cron: /api/dsh-cron/update');

  // 1. REST API — collection (list/create) + item actions in one prefix
  // 1. Web server routes (extracted to ./routes.js)
  registerRoutes(ctx, {
    store,
    scheduler,
    getCronSettingsScope: () => settingsService,
    recommendations,
  });

  // GET & POST /dsh-cron/settings (#102)
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
          const payload = sanitizeSettingsPayload(body);
          store.saveSettings(payload);
          const scopeErrors = await applySettingsToScope(settingsService, payload);
          sendJson(res, 200, {
            ok: true,
            settings: store.getClientSettings(),
            scopeErrors: (scopeErrors && scopeErrors.length > 0) ? scopeErrors : undefined
          });
          return;
        }
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      } catch (err) {
        sendJson(res, err.statusCode || 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /settings');

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
      // A config-owned task cannot be paused from here either: the next start
      // would resume it, and the agent would have reported a change that never
      // happened (#50 review finding).
      if (isConfigOwned(store.get(args.id))) return { success: false, message: configOwnedMessage(args.id) };
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
      if (isConfigOwned(store.get(args.id))) return { success: false, message: configOwnedMessage(args.id) };
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
      // Deleting a config-owned task would also drop its run history, and the
      // task would come back at the next start without it.
      if (isConfigOwned(store.get(args.id))) return { success: false, message: configOwnedMessage(args.id) };
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
