import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler, parseScheduleExpression } from '../lib/scheduler.js';
import { SessionRunner } from '../lib/runner.js';
import { Config, name as pluginName, inject as pluginInject } from '../lib/index.js';

test('Audit #71: Config schemastery schema and plugin definition', () => {
  assert.equal(pluginName, '@goodandready/dsh-cron');
  assert.ok(pluginInject.includes('settings'));
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
