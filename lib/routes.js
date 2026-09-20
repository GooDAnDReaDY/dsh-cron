import { randomUUID } from 'node:crypto';
import { createCronApiHandler } from './api.js';
import { createMetricsHandler } from './metrics.js';
import { createExternalApiHandler, EXTERNAL_API_PREFIX } from './external-api.js';
import { getModelsHandler } from './models-handler.js';
import { chatStartHandler } from './chat-start.js';
import { sendJson, rejectCrossOrigin, readBody, parseJsonBody } from './http-utils.js';
import { recipesByCategory } from './recipes.js';
import { sendTelegramMessage, createTelegramTaskKeyboard } from './telegram.js';
import { createKanbanCard } from './integrations.js';
import { sanitizeSettingsPayload, applySettingsToScope } from './settings.js';

export function registerRoutes(ctx, { store, scheduler, getCronSettingsScope, recommendations }) {
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

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/telegram',
    handler: createCronApiHandler(store, scheduler, null)
  }), 'dsh-cron: /telegram[...]');

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/heartbeat-ping',
    handler: createCronApiHandler(store, scheduler, null)
  }), 'dsh-cron: /heartbeat-ping[...]');

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/schedule',
    handler: createCronApiHandler(store, scheduler, null)
  }), 'dsh-cron: /schedule[...]');

  // GET /dsh-cron/metrics (#53) — Prometheus text exposition
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/metrics',
    handler: createMetricsHandler({ store, scheduler })
  }), 'dsh-cron: /metrics');

  // External REST API under /dsh-cron/api/* (#54, ADR-0001): the only surface
  // guarded by a bearer token, so CI and host automation can drive the
  // scheduler without a browser session. The token is read per request, so a
  // settings change applies without a restart.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: EXTERNAL_API_PREFIX,
    handler: createExternalApiHandler({
      store,
      scheduler,
      getToken: () => store.getSettings().apiToken || ''
    })
  }), 'dsh-cron: /api[...]');

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
        const replyMarkup = createTelegramTaskKeyboard(undefined, undefined);
        await sendTelegramMessage({ botToken, chatId, text, replyMarkup });
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
}

