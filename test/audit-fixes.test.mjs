import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler, parseScheduleExpression } from '../lib/scheduler.js';
import { SessionRunner } from '../lib/runner.js';
import { Config, name as pluginName, inject as pluginInject } from '../lib/index.js';

test('Audit #71: Config schemastery schema and plugin definition', () => {
  assert.equal(pluginName, '@goodandready/dsh-cron');
  assert.ok(pluginInject.includes('tools'));
  assert.ok(!pluginInject.includes('settings'));
  assert.ok(Config);
  assert.ok(Config.type === 'object' || typeof Config === 'function' || typeof Config === 'object');
});

test('Audit #73 & #74: getClientSettings masks botToken and prevents plaintext leaks', () => {
  const tmpPath = `/tmp/dsh-cron-test-store-${Date.now()}.json`;
  const store = new TaskStore(tmpPath);

  // Save secret bot token
  store.saveSettings({
    botToken: '123456789:AAFgHijKlmnOpqrStuv-Wxyz1234567',
    chatId: '987654321',
    notifyTelegram: true,
  });

  const rawSettings = store.getSettings();
  assert.equal(rawSettings.botToken, '123456789:AAFgHijKlmnOpqrStuv-Wxyz1234567');

  const clientSettings = store.getClientSettings();
  assert.ok(clientSettings.botToken.includes('••••'));
  assert.equal(clientSettings.hasBotToken, true);
  assert.equal(clientSettings.hasCustomBotToken, true);
  assert.equal(clientSettings.chatId, '987654321');

  // Saving masked token must preserve original token
  store.saveSettings({
    botToken: clientSettings.botToken,
    chatId: '987654321',
  });
  assert.equal(store.getSettings().botToken, '123456789:AAFgHijKlmnOpqrStuv-Wxyz1234567');

  try { fs.unlinkSync(tmpPath); } catch {}
});

test('Audit #69 & #76: TaskStore preserves status and supports PATCH schedule recalculation', () => {
  const tmpPath = `/tmp/dsh-cron-test-patch-${Date.now()}.json`;
  const store = new TaskStore(tmpPath);

  const created = store.set({
    title: 'Original Task',
    schedule: '0 9 * * 1-5',
    prompt: 'Original prompt',
    status: 'paused',
    type: 'llm',
  });

  assert.equal(created.status, 'paused');

  // Simulating update via store.set (like PATCH or POST update)
  const updated = store.set({
    ...created,
    title: 'Updated Task Name',
  });

  assert.equal(updated.status, 'paused', 'Status should be preserved when editing task');
  assert.equal(updated.title, 'Updated Task Name');

  // Check schedule recalculation
  const parsedNew = parseScheduleExpression('every 15m');
  const patched = store.set({
    ...updated,
    schedule: parsedNew.cronPattern,
    scheduleText: parsedNew.humanText,
  });

  assert.equal(patched.schedule, '*/15 * * * *');
  assert.equal(patched.scheduleText, 'Every 15 minutes');
  assert.equal(patched.status, 'paused');

  try { fs.unlinkSync(tmpPath); } catch {}
});

test('Audit #77: TaskScheduler marks status as timeout when execution times out', async () => {
  const tmpPath = `/tmp/dsh-cron-test-sched-${Date.now()}.json`;
  const store = new TaskStore(tmpPath);

  const scheduler = new TaskScheduler(store, async (task) => {
    throw new Error('Task execution timed out after 5 seconds');
  });

  const task = store.set({
    title: 'Timing Out Task',
    schedule: '0 9 * * *',
    prompt: 'hanging job',
    status: 'active',
  });

  await scheduler.runTask(task.id);

  const saved = store.get(task.id);
  assert.equal(saved.lastStatus, 'timeout', 'lastStatus must be timeout');

  const history = store.getHistory(task.id, 1);
  assert.equal(history[0].status, 'timeout');
  assert.ok(history[0].error.includes('timed out'));

  try { fs.unlinkSync(tmpPath); } catch {}
});

test('Audit #66: TaskScheduler toggleTask pauses and resumes correctly', () => {
  const tmpPath = `/tmp/dsh-cron-test-toggle-${Date.now()}.json`;
  const store = new TaskStore(tmpPath);
  const scheduler = new TaskScheduler(store, async () => {});

  const task = store.set({
    title: 'Toggle Task',
    schedule: '0 9 * * *',
    prompt: 'test prompt',
    status: 'active',
  });

  const paused = scheduler.toggleTask(task.id);
  assert.equal(paused.status, 'paused');

  const resumed = scheduler.toggleTask(task.id);
  assert.equal(resumed.status, 'active');

  scheduler.stopAll();
  try { fs.unlinkSync(tmpPath); } catch {}
});

test('Audit #199: CronSettingsCard does not hardcode stale version and dynamic version is supported', () => {
  const cardCode = fs.readFileSync(new URL('../lib/client-src/70-settings-card.js', import.meta.url), 'utf-8');
  assert.ok(!cardCode.includes("'0.2.24'"), 'hardcoded 0.2.24 version removed from CronSettingsCard');
  assert.ok(cardCode.includes("currentVersion: '',"), 'currentVersion initialized to empty string');
  assert.ok(cardCode.includes('data.settings.version'), 'reads dynamic version from settings endpoint');
});

test('Audit #200: /dsh-cron/heartbeat and /dsh-cron/models enforce GET method with 405', async () => {
  const { getModelsHandler } = await import('../lib/models-handler.js');
  let status = 0;
  let responseData = null;
  const sendJson = (res, code, data) => {
    status = code;
    responseData = data;
  };

  // POST to getModelsHandler must be rejected with 405
  await getModelsHandler({}, { method: 'POST', url: '/dsh-cron/models' }, {}, sendJson);
  assert.equal(status, 405);
  assert.equal(responseData?.ok, false);
  assert.equal(responseData?.error, 'Method not allowed');

  // DELETE to getModelsHandler must be rejected with 405
  await getModelsHandler({}, { method: 'DELETE', url: '/dsh-cron/models' }, {}, sendJson);
  assert.equal(status, 405);
});

test('Audit #201: /tasks/export and /tasks/import reject wrong methods with 405, not 404', async () => {
  const { createCronApiHandler } = await import('../lib/api.js');
  const tmpPath = `/tmp/dsh-cron-test-methods-${Date.now()}.json`;
  const store = new TaskStore(tmpPath);
  const handler = createCronApiHandler(store, null, { recommendations: [] });

  let status = 0;
  let bodyData = null;
  const mockRes = {
    writeHead(code) { status = code; },
    end(str) {
      if (str) {
        try { bodyData = JSON.parse(str); } catch {}
      }
    }
  };

  // POST /dsh-cron/tasks/export must answer 405 Method Not Allowed
  await handler({ method: 'POST', url: '/dsh-cron/tasks/export', headers: {} }, mockRes);
  assert.equal(status, 405);
  assert.equal(bodyData?.ok, false);
  assert.equal(bodyData?.error, 'Method not allowed');

  // GET /dsh-cron/tasks/import must answer 405 Method Not Allowed
  await handler({ method: 'GET', url: '/dsh-cron/tasks/import', headers: {} }, mockRes);
  assert.equal(status, 405);
  assert.equal(bodyData?.ok, false);
  assert.equal(bodyData?.error, 'Method not allowed');

  try { fs.unlinkSync(tmpPath); } catch {}
});

test('Audit #202: dead exports createTaskParameters and createTaskOutput removed', async () => {
  const indexModule = await import('../lib/index.js');
  assert.equal(indexModule.createTaskParameters, undefined);
  assert.equal(indexModule.createTaskOutput, undefined);
  assert.ok(indexModule.cronToolParameters);
});

test('Audit #203: lib/client.js contains zero 6-digit hex colors', () => {
  const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  const hexMatches = clientCode.match(/#[0-9a-fA-F]{6}/g) || [];
  assert.equal(hexMatches.length, 0, 'all 6-digit hex colors replaced with CSS theme variables');
});

test('Audit #204: lib/logger.js forwards log calls to ctx.logger when configured', async () => {
  const { setLogger, logger } = await import('../lib/logger.js');
  const logged = [];
  const customLogger = {
    info(...args) { logged.push({ level: 'info', args }); },
    warn(...args) { logged.push({ level: 'warn', args }); },
    error(...args) { logged.push({ level: 'error', args }); },
    debug(...args) { logged.push({ level: 'debug', args }); },
  };

  setLogger(customLogger);
  logger.info('[test] info message');
  logger.warn('[test] warning message');
  logger.error('[test] error message');

  assert.equal(logged.length, 3);
  assert.equal(logged[0].level, 'info');
  assert.equal(logged[0].args[0], '[test] info message');
  assert.equal(logged[1].level, 'warn');
  assert.equal(logged[2].level, 'error');

  // Reset back to console
  setLogger(console);
});
