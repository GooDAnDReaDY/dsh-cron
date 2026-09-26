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
import {
  cronToolParameters,
  cronToolOutput,
  executeCronTool,
  rejectLegacyTool,
  LEGACY_TOOL_NAMES,
  LEGACY_ACTION_MAP,
} from './cron-tool.js';

export {
  executeCreateTask,
  cronToolParameters,
  cronToolOutput,
  executeCronTool,
  rejectLegacyTool,
  LEGACY_TOOL_NAMES,
  LEGACY_ACTION_MAP,
};
export const createTaskParameters = cronToolParameters;
export const createTaskOutput = cronToolOutput;

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

  // 2. Tools: unified background automation runner (Issue #196: 9 tools -> 1)
  ctx.tools.register(defineTool({
    name: 'cron',
    description: 'Background automation runner for DSH: isolated agent runs, script/node/python/http/ssh/docker runtimes, cost guard, notifications, heartbeats. For simple reminders in the current chat, use the built-in schedule_create tool instead. Actions: create, list, get, update, pause, resume, run, delete.',
    parameters: cronToolParameters,
    output: cronToolOutput,
    execute: async (args) => executeCronTool(store, scheduler, args),
  }));
}
