import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseTelegramCommand,
  formatStatusMessage,
  formatTasksMessage,
  handleTelegramCommand,
} from '../lib/telegram-commands.js';
import { handleTelegramWebhook } from '../lib/api-webhook.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { TaskStore } from '../lib/store.js';

test('1. parseTelegramCommand parses commands, args, and strips bot username', () => {
  assert.equal(parseTelegramCommand(''), null);
  assert.equal(parseTelegramCommand('hello world'), null);

  const simple = parseTelegramCommand('/status');
  assert.deepEqual(simple, { command: 'status', args: [], raw: '/status' });

  const withArgs = parseTelegramCommand('/run job_123');
  assert.deepEqual(withArgs, { command: 'run', args: ['job_123'], raw: '/run job_123' });

  const withBotName = parseTelegramCommand('/pause@dsh_cron_bot task_foo reason_bar');
  assert.deepEqual(withBotName, { command: 'pause', args: ['task_foo', 'reason_bar'], raw: '/pause@dsh_cron_bot task_foo reason_bar' });
});

test('2. formatStatusMessage and formatTasksMessage format Markdown', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-fmt-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  const scheduler = new TaskScheduler(store);

  store.set({ id: 't1', title: 'Task One', schedule: '0 * * * *', status: 'active' });
  store.set({ id: 't2', title: 'Task Two', schedule: '0 0 * * *', status: 'paused', pausedReason: 'Maintenance' });

  const statusMsg = formatStatusMessage({ store, scheduler });
  assert.match(statusMsg, /DSH Cron — Scheduler Status/);
  assert.match(statusMsg, /Total: 2/);
  assert.match(statusMsg, /Active: 🟢 1/);
  assert.match(statusMsg, /Paused: ⏸ 1/);

  const tasksMsg = formatTasksMessage(store.list(), scheduler);
  assert.match(tasksMsg, /Task One/);
  assert.match(tasksMsg, /Task Two/);
  assert.match(tasksMsg, /Maintenance/);

  scheduler.stopAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('3. handleTelegramCommand executes run, pause, resume, and log', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cmds-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  let ranTaskId = null;

  const scheduler = new TaskScheduler(store, async (t) => {
    ranTaskId = t.id;
    return { status: 'success', output: 'Everything ok', costUsd: 0.001 };
  });

  const task = store.set({ id: 'my_job', title: 'My Job', schedule: '0 * * * *', status: 'active' });

  const sentMessages = [];
  const mockFetch = async (url, opts) => {
    const payload = JSON.parse(opts.body);
    sentMessages.push(payload);
    return { ok: true, json: async () => ({ ok: true }) };
  };

  // Test /run
  const runRes = await handleTelegramCommand({
    store,
    scheduler,
    text: '/run my_job',
    chatId: '12345',
    botToken: 'fake-token',
    fetchFn: mockFetch,
  });
  assert.equal(runRes.ok, true);
  assert.equal(runRes.taskId, 'my_job');
  assert.equal(ranTaskId, 'my_job');
  assert.match(sentMessages[0].text, /Triggered immediate execution/);

  // Test /pause
  const pauseRes = await handleTelegramCommand({
    store,
    scheduler,
    text: '/pause my_job',
    chatId: '12345',
    botToken: 'fake-token',
    fetchFn: mockFetch,
  });
  assert.equal(pauseRes.ok, true);
  assert.equal(store.get('my_job').status, 'paused');
  assert.match(sentMessages[1].text, /paused/);

  // Test /resume
  const resumeRes = await handleTelegramCommand({
    store,
    scheduler,
    text: '/resume my_job',
    chatId: '12345',
    botToken: 'fake-token',
    fetchFn: mockFetch,
  });
  assert.equal(resumeRes.ok, true);
  assert.equal(store.get('my_job').status, 'active');
  assert.match(sentMessages[2].text, /resumed/);

  // Test /log
  store.recordRun('my_job', {
    at: Date.now(),
    status: 'success',
    durationMs: 420,
    output: 'Backup finished cleanly',
    costUsd: 0.002,
  });
  const logRes = await handleTelegramCommand({
    store,
    scheduler,
    text: '/log my_job',
    chatId: '12345',
    botToken: 'fake-token',
    fetchFn: mockFetch,
  });
  assert.equal(logRes.ok, true);
  assert.match(sentMessages[3].text, /Backup finished cleanly/);

  scheduler.stopAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('4. handleTelegramWebhook enforces authorization for text commands', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-hook-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  const scheduler = new TaskScheduler(store);

  store.saveSettings({ chatId: '99999', botToken: 'mock-token' });

  // Unauthorized chat
  let unauthCode = 0;
  const unauthRes = {
    writeHead: (code) => { unauthCode = code; },
    end: (body) => {},
    setHeader: () => {},
  };
  const unauthReq = {
    method: 'POST',
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ message: { chat: { id: 11111 }, text: '/status' } })));
      if (evt === 'end') cb();
    }
  };
  await handleTelegramWebhook({ store, scheduler, req: unauthReq, res: unauthRes });
  assert.equal(unauthCode, 403);

  // Authorized chat
  let authCode = 0;
  let authBody = null;
  const authRes = {
    writeHead: (code) => { authCode = code; },
    end: (body) => { authBody = JSON.parse(body); },
    setHeader: () => {},
  };
  const authReq = {
    method: 'POST',
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ message: { chat: { id: 99999 }, text: '/help' } })));
      if (evt === 'end') cb();
    }
  };
  await handleTelegramWebhook({ store, scheduler, req: authReq, res: authRes });
  assert.equal(authCode, 200);
  assert.equal(authBody.ok, true);

  scheduler.stopAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

