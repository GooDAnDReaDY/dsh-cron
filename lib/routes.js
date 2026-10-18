import { handleTaskWebhookRoute } from './api-task-webhook.js';
import { calculateCostHeatmap } from './timeline.js';
import { buildAnalyticsDigest, formatDigestMarkdown, sendAnalyticsDigest } from './analytics-digest.js';
import { listVerifiedRecipes } from './recipes-catalog.js';
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
import { buildTaskGraphModel } from './dag.js';

export function registerRoutes(ctx, { store, scheduler, recommendations }) {
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

  // Incoming HTTP Webhook triggers (#348)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/webhook',
    handler: (req, res) => handleTaskWebhookRoute({ store, scheduler, req, res })
  }), 'dsh-cron: /webhook[...]');

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


  // Chain retry from failed step (#319)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/chains',
    handler: (req, res) => handleChainRoutes(store, scheduler, req, res)
  }), 'dsh-cron: /chains[...]');

  // Run artifacts listing, download and safe preview (#321)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/runs',
    handler: (req, res) => handleRunArtifactRoutes(store, req, res)
  }), 'dsh-cron: /runs[...]');

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
      const settings = store && typeof store.getSettings === 'function' ? store.getSettings() : {};
      const apiToken = settings.apiToken;
      if (rejectCrossOrigin(req, res, { apiToken })) return;
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

  // Analytics digest routes (#330)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/analytics',
    handler: async (req, res) => {
      try {
        const settings = store && typeof store.getSettings === 'function' ? store.getSettings() : {};
        const apiToken = settings.apiToken;
        if (rejectCrossOrigin(req, res, { apiToken })) return;

        const url = new URL(req.url, 'http://127.0.0.1');
        const path = url.pathname;

        if (req.method === 'GET') {
          if (path === '/dsh-cron/analytics/heatmap') {
            const modelFilter = url.searchParams.get('model') || null;
            const providerFilter = url.searchParams.get('provider') || null;
            const costLedger = store.costLedger || [];
            let history = [];
            if (store.history) {
              if (typeof store.history.values === 'function') {
                for (const runs of store.history.values()) {
                  if (Array.isArray(runs)) history.push(...runs);
                }
              } else if (typeof store.history === 'object') {
                for (const runs of Object.values(store.history)) {
                  if (Array.isArray(runs)) history.push(...runs);
                }
              }
            }
            const heatmap = calculateCostHeatmap({ costLedger, history, modelFilter, providerFilter });
            sendJson(res, 200, { ok: true, heatmap });
            return;
          }
          const days = parseInt(url.searchParams.get('days') || '7', 10);
          const tasks = store.list ? store.list() : Object.values(store.tasks || {});
          let history = [];
          if (store.history) {
            if (typeof store.history.values === 'function') {
              for (const runs of store.history.values()) {
                if (Array.isArray(runs)) history.push(...runs);
              }
            } else if (typeof store.history === 'object') {
              for (const runs of Object.values(store.history)) {
                if (Array.isArray(runs)) history.push(...runs);
              }
            }
          }
          const costLedger = store.costLedger || [];
          const digest = buildAnalyticsDigest({ tasks, history, costLedger, periodDays: days });
          const markdown = formatDigestMarkdown(digest);
          sendJson(res, 200, { ok: true, digest, markdown });
          return;
        }

        if (req.method === 'POST') {
          if (rejectCrossOrigin(req, res)) return;
          const { body } = await readBody(req, res);
          const days = parseInt(body?.days || url.searchParams.get('days') || '7', 10);
          const tasks = store.list ? store.list() : Object.values(store.tasks || {});
          let history = [];
          if (store.history) {
            if (typeof store.history.values === 'function') {
              for (const runs of store.history.values()) {
                if (Array.isArray(runs)) history.push(...runs);
              }
            } else if (typeof store.history === 'object') {
              for (const runs of Object.values(store.history)) {
                if (Array.isArray(runs)) history.push(...runs);
              }
            }
          }
          const costLedger = store.costLedger || [];
          const digest = buildAnalyticsDigest({ tasks, history, costLedger, periodDays: days });
          const settings = store.getSettings ? store.getSettings() : {};
          const deliveryConfig = {
            telegram: body?.telegram !== false && Boolean(settings.botToken && settings.chatId),
            webhookUrl: body?.webhookUrl || settings.webhookUrl,
          };
          const channels = {
            sendTelegram: async (text) => sendTelegramMessage({ botToken: settings.botToken, chatId: settings.chatId, text }),
            sendWebhook: async (targetUrl, payload) => {
              const r = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              return { ok: r.ok, status: r.status };
            },
          };
          const delivery = await sendAnalyticsDigest({ digest, channels, deliveryConfig });
          sendJson(res, 200, { ok: true, digest, delivery });
          return;
        }

        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /analytics');

  // GET /dsh-cron/recipes (#48): the built-in recipe catalog.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/recipes',
    handler: async (req, res) => {
      try {
        if ((req.method || 'GET') !== 'GET') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        const settings = store.getSettings ? store.getSettings() : {};
        const apiToken = settings.apiToken;
        if (rejectCrossOrigin(req, res, { apiToken })) return;
        const categories = recipesByCategory();
        const recipes = listVerifiedRecipes(settings);
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
        if ((req.method || 'GET') !== 'GET') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        const settings = store.getSettings ? store.getSettings() : {};
        const apiToken = settings.apiToken;
        if (rejectCrossOrigin(req, res, { apiToken })) return;

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


/**
 * Handler for chain step retries (#319)
 */
export async function handleChainRoutes(store, scheduler, req, res) {
  const settings = store && typeof store.getSettings === 'function' ? store.getSettings() : {};
  const apiToken = settings.apiToken;
  if (rejectCrossOrigin(req, res, { apiToken })) return;
  const url = new URL(req.url, 'http://localhost');

  // GET /dsh-cron/chains/:chainRunId (#334)
  const getMatch = url.pathname.match(/^\/dsh-cron\/chains\/([^\/]+)$/);
  if (getMatch && req.method === 'GET') {
    const chainRunId = getMatch[1];
    const snapshots = store.chainCheckpointManager ? store.chainCheckpointManager.getChainSnapshots(chainRunId) : [];
    const relevantTasks = [];
    const stepIds = new Set(snapshots.map((s) => s.stepTaskId));
    if (store.tasks) {
      for (const t of Object.values(store.tasks)) {
        if (t && (stepIds.has(t.id) || t.onSuccess || t.onFailure || t.dependsOn)) {
          relevantTasks.push(t);
        }
      }
    }
    const graph = buildTaskGraphModel(relevantTasks, snapshots);
    sendJson(res, 200, { ok: true, chainRunId, snapshots, graph });
    return;
  }

  // POST /dsh-cron/chains/:chainRunId/retry-from/:stepTaskId (#319, #328)
  const m = url.pathname.match(/^\/dsh-cron\/chains\/([^\/]+)\/retry-from\/([^\/]+)$/);
  if (!m) {
    sendJson(res, 404, { ok: false, error: 'Route not found' });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }
  const [, chainRunId, stepTaskId] = m;
  const result = await store.chainCheckpointManager.retryChainFromStep(scheduler, chainRunId, stepTaskId);
  if (!result.ok) {
    sendJson(res, 400, result);
    return;
  }
  sendJson(res, 200, result);
}

/**
 * Handler for run artifacts (#321)
 */
export async function handleRunArtifactRoutes(store, req, res) {
  const url = new URL(req.url, 'http://localhost');
  const m = url.pathname.match(/^\/dsh-cron\/runs\/([^\/]+)\/artifacts(?:\/([^\/]+)(?:\/(preview))?)?$/);
  if (!m) {
    sendJson(res, 404, { ok: false, error: 'Route not found' });
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }
  const settings = store && typeof store.getSettings === 'function' ? store.getSettings() : {};
  const apiToken = settings.apiToken;
  if (rejectCrossOrigin(req, res, { apiToken })) return;

  const [, runId, artifactId, action] = m;
  if (!artifactId) {
    const artifacts = store.getArtifactsForRun(runId);
    sendJson(res, 200, { ok: true, runId, artifacts });
    return;
  }
  const artifacts = store.getArtifactsForRun(runId);
  const record = artifacts.find((a) => a.id === artifactId);
  if (!record) {
    sendJson(res, 404, { ok: false, error: 'Artifact record not found' });
    return;
  }
  if (action === 'preview') {
    const preview = store.artifactManager.generatePreview(artifactId, record.name);
    sendJson(res, preview.ok ? 200 : 404, preview);
    return;
  }
  const buf = store.artifactManager.readArtifact(artifactId, record.name);
  if (!buf) {
    sendJson(res, 404, { ok: false, error: 'Artifact file missing from disk (expired or removed)' });
    return;
  }
  res.writeHead(200, {
    'Content-Type': record.mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(record.name)}"`,
    'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
}
