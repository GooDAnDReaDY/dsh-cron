import fs from 'node:fs';
import path from 'node:path';
import { bestEffort } from './best-effort.js';
import { setLogger, logger } from './logger.js';
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
  plainConfig,
} from './settings.js';
import { registerRoutes } from './routes.js';

export {
  Config,
  SETTINGS_SYNC_KEYS,
  applySettingsToScope,
  sanitizeSettingsPayload,
  unwrapConfig,
  unwrapConfigValue,
  plainConfig,
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
const pkgUrl = new URL('../package.json', import.meta.url);
const pkgVersion = JSON.parse(fs.readFileSync(pkgUrl, 'utf8')).version || '0.2.29';

export function apply(ctx, rawConfig) {
  if (ctx && ctx.logger) setLogger(ctx.logger);
  const config = plainConfig(rawConfig);
  const storePath = (config && (config.cronDir || config.storePath)) ? (config.storePath || path.join(config.cronDir, 'tasks.json')) : undefined;
  const store = new TaskStore(storePath);

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
    logger.info('[dsh-cron] config jobs synced: ' + JSON.stringify(summary));
  } catch (err) {
    logger.error('[dsh-cron] config job sync failed:', err.message);
  }

  scheduler.start();

  // Heartbeat / dead man's snitch (#16): an optional periodic GET ping so an
  // external monitor can alert when this scheduler stops responding.
  // Heartbeat / dead man's snitch (#16): an optional periodic GET ping so an
  // external monitor can alert when this scheduler stops responding.
  let heartbeatTimer = null;
  function updateHeartbeat(url, intervalSec) {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    const cleanUrl = String(url || '').trim();
    const cleanSec = Number(intervalSec) || 0;
    if (cleanUrl && cleanSec > 0) {
      heartbeatTimer = setInterval(() => {
        fetch(cleanUrl, { method: 'GET' }).catch((err) => {
          logger.warn('[dsh-cron] heartbeat ping failed:', err.message);
        });
      }, cleanSec * 1000);
      if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
    }
  }
  updateHeartbeat(config && config.heartbeatUrl, config && config.heartbeatIntervalSec);

  // Synchronize volatile Config settings to runtime scheduler and store (#235)
  let activeVolatileConfig = {};
  function syncVolatileConfig(updatedConfig) {
    try {
      const isPlainConfigObject = updatedConfig && typeof updatedConfig === 'object' && !Array.isArray(updatedConfig);
      const cfg = isPlainConfigObject ? { ...(ctx.config || config || {}), ...updatedConfig } : (ctx.config || config || {});
      const unwrapped = unwrapConfig(cfg);
      activeVolatileConfig = { ...activeVolatileConfig, ...unwrapped };
      if (typeof unwrapped.maxConcurrent === 'number') {
        scheduler.maxConcurrent = unwrapped.maxConcurrent;
      }
      if (typeof unwrapped.defaultTimezone === 'string') {
        scheduler.defaultTimezone = unwrapped.defaultTimezone;
      }
      if (typeof unwrapped.llmActionsEnabled === 'boolean') {
        scheduler.llmActionsEnabled = unwrapped.llmActionsEnabled;
      }
      if (unwrapped.heartbeatUrl !== undefined || unwrapped.heartbeatIntervalSec !== undefined) {
        updateHeartbeat(unwrapped.heartbeatUrl, unwrapped.heartbeatIntervalSec);
      }
      const current = store.getSettings();
      const patch = {};
      for (const k of ['maxConcurrent', 'defaultTimezone', 'heartbeatUrl', 'heartbeatIntervalSec', 'llmActionsEnabled']) {
        if (unwrapped[k] !== undefined && unwrapped[k] !== current[k]) {
          patch[k] = unwrapped[k];
        }
      }
      if (Object.keys(patch).length > 0) {
        store.saveSettings(patch);
      }
    } catch (err) {
      logger.warn('[dsh-cron] error syncing volatile config:', err.message);
    }
  }

  if (typeof ctx.on === 'function') {
    ctx.on('loader/volatile-update', (updatedConfig) => {
      syncVolatileConfig(updatedConfig);
    });
  }

  ctx.effect(() => {
    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      scheduler.stopAll();
      bestEffort('lifecycle-store-flush', () => store.flushSync(), logger);
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
          const unwrapped = {
            ...unwrapConfig(ctx.config || config || {}),
            ...activeVolatileConfig,
          };
          const clientSettings = store.getClientSettings();
          for (const k of ['maxConcurrent', 'defaultTimezone', 'heartbeatUrl', 'heartbeatIntervalSec', 'llmActionsEnabled']) {
            if (unwrapped[k] !== undefined) {
              clientSettings[k] = unwrapped[k];
            }
          }
          sendJson(res, 200, { ok: true, settings: { ...clientSettings, version: pkgVersion } });
          return;
        }
        if (req.method === 'POST') {
          if (rejectCrossOrigin(req, res)) return;
          const { body, error } = await readBody(req, res);
          if (error) return;
          const payload = sanitizeSettingsPayload(body);
          const scopeErrors = await applySettingsToScope(settingsService, payload);
          if (scopeErrors && scopeErrors.length > 0) {
            sendJson(res, 500, {
              ok: false,
              error: `Settings scope update failed: ${scopeErrors.join('; ')}`,
              scopeErrors,
            });
            return;
          }
          store.saveSettings(payload);
          if (payload.maxConcurrent !== undefined && Number.isFinite(Number(payload.maxConcurrent))) {
            scheduler.maxConcurrent = Number(payload.maxConcurrent);
          }
          if (payload.defaultTimezone !== undefined) {
            scheduler.defaultTimezone = String(payload.defaultTimezone || '').trim();
          }
          if (payload.heartbeatUrl !== undefined || payload.heartbeatIntervalSec !== undefined) {
            const current = store.getSettings();
            updateHeartbeat(current.heartbeatUrl, current.heartbeatIntervalSec);
          }
          sendJson(res, 200, {
            ok: true,
            settings: { ...store.getClientSettings(), version: pkgVersion },
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
