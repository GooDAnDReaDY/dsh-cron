import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionRunner } from '../lib/runner.js';
import { TaskStore, getDefaultStorePath } from '../lib/store.js';
import { TaskScheduler, describeCron } from '../lib/scheduler.js';
import { parseJsonBody } from '../lib/http-utils.js';
import {
  createCronApiHandler,
  executeCreateTask,
  applySettingsToScope,
  sanitizeSettingsPayload,
} from '../lib/index.js';

function mockReq(chunks) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

function mockRes() {
  const res = {
    statusCode: 0,
    payload: null,
    writeHead(code) { this.statusCode = code; },
    end(payload) { this.payload = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

// Tests must never touch the real cron store — always an isolated tmp file.
function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-stability-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  return { store, scheduler };
}

test('parseJsonBody decodes multi-byte UTF-8 split across chunk boundaries', async () => {
  // "👍" is 4 bytes in UTF-8; split it across two string chunks the way
  // network chunks arrive (#106 byte-limit rework).
  const buf1 = Buffer.from('{"a":"', 'utf8');
  const emoji = Buffer.from('👍', 'utf8');
  const buf2 = Buffer.concat([Buffer.from('hello'), emoji.subarray(0, 2)]);
  const buf3 = Buffer.concat([emoji.subarray(2), Buffer.from('"}', 'utf8')]);
  const data = await parseJsonBody(mockReq([buf1, buf2, buf3]));
  assert.equal(data.a, 'hello👍');
});

test('POST run on a missing task id answers 404 (#97 follow-up)', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const res = mockRes();
  await handler({ method: 'POST', url: '/dsh-cron/tasks/cron_missing/run', headers: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.ok, false);
  assert.equal(res.payload.error, 'Task not found');
});

test('createCronApiHandler collection endpoints keep working', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const res = mockRes();
  await handler({ method: 'GET', url: '/dsh-cron/tasks', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.deepEqual(res.payload.tasks, []);
});

test('executeCreateTask stores an llm task with defaults', (t) => {
  const { store, scheduler } = makeEnv(t);
  t.after(() => scheduler.stopAll()); // cron jobs hold live timers
  const res = executeCreateTask(store, scheduler, {
    title: 'Nightly digest',
    schedule: '0 3 * * *',
    prompt: 'do the thing',
  });
  assert.equal(res.success, true);
  const task = store.get(res.task.id);
  assert.equal(task.type, 'llm');
  assert.equal(task.status, 'active');
  assert.equal(task.delivery, 'isolated');
  assert.equal(task.overlapPolicy, 'skip');
  assert.equal(task.kanbanMode, 'none');
  assert.equal(task.oneShot, false);
  assert.equal(task.timeoutSeconds, 1800);
});

test('executeCreateTask marks one-shot schedules and script type', (t) => {
  const { store, scheduler } = makeEnv(t);
  t.after(() => scheduler.stopAll()); // one-shot timers hold live timeouts
  const res = executeCreateTask(store, scheduler, {
    title: 'One shot script',
    schedule: 'in 30m',
    prompt: 'echo hi',
    type: 'script',
  });
  const task = store.get(res.task.id);
  assert.equal(task.type, 'script');
  assert.equal(task.oneShot, true);
  assert.equal(task.nextRunAt > Date.now(), true);
});

test('applySettingsToScope writes only present keys and collects errors (#102)', async () => {
  const calls = [];
  const scope = {
    set: async (key, value) => {
      if (key === 'chatId' && value === 'boom') throw new Error('rejected by core');
      calls.push([key, value]);
    },
  };
  const errors = await applySettingsToScope(scope, {
    chatId: 'boom',
    kanbanBaseUrl: 'http://127.0.0.1:3000',
    totalTokens: 'not-a-setting',
  });
  // The rejected key never reaches the scope; the loop continues with the rest.
  assert.deepEqual(errors, ['chatId: rejected by core']);
  assert.deepEqual(calls, [['kanbanBaseUrl', 'http://127.0.0.1:3000']]);
});

test('applySettingsToScope returns null without a settings service', async () => {
  assert.equal(await applySettingsToScope(null, { chatId: 'x' }), null);
});

test('sanitizeSettingsPayload drops masked secrets, keeps the rest (#86-era guard)', () => {
  const clean = sanitizeSettingsPayload({ botToken: '123:real', chatId: '42' });
  assert.equal(clean.botToken, '123:real');
  const masked = sanitizeSettingsPayload({ botToken: '8830••••••••UkI', chatId: '42' });
  assert.equal(masked.botToken, undefined);
  assert.equal(masked.chatId, '42');
  const stars = sanitizeSettingsPayload({ botToken: '123****456' });
  assert.equal(stars.botToken, undefined);
});

test('describeCron renders human text for common patterns', () => {
  assert.equal(describeCron('*/10 * * * *'), 'Every 10 minutes');
  assert.equal(describeCron('0 8 * * 1-5'), 'Weekdays at 08:00');
  assert.equal(describeCron('30 21 * * *'), 'Every day at 21:30');
  assert.equal(describeCron('0 18 * * 5'), 'Fridays at 18:00');
  assert.equal(describeCron('7 7 7 7 7'), '7 7 7 7 7');
});

test('SessionRunner disposes a hung agent session when timeout fires', async () => {
  let disposed = false;
  let followupReceived = false;
  let idleCalls = 0;
  const handle = {
    agent: {
      // First whenIdle (init) resolves; the post-followup turn hangs forever.
      whenIdle: async () => {
        idleCalls++;
        if (idleCalls >= 2) return new Promise(() => {});
      },
      followup: () => { followupReceived = true; },
      session: { id: 'hung-session' },
    },
    dispose: async () => { disposed = true; },
  };
  const ctx = { agents: { create: async () => handle } };
  const runner = new SessionRunner(ctx);
  const task = { id: 'hung', title: 'Hung agent', type: 'llm', prompt: 'p', timeoutSeconds: 1 };
  await assert.rejects(() => runner.execute(task), (err) => {
    assert.match(err.message, /timed out/);
    return true;
  });
  assert.equal(followupReceived, true, 'followup was dispatched before the deadline');
  // Give the abort listener tick a moment to run the dispose path.
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(disposed, true, 'handle disposed after timeout abort');
});

test('store path honours DSH_DATA_DIR and DSH_HOME before the user home', () => {
  const env = { ...process.env };
  try {
    // An isolated profile must not write into another home's data directory:
    // that is how the MiniPC test cycle leaked a task into the non-test home.
    process.env.DSH_DATA_DIR = path.join(os.tmpdir(), 'dsh-data-dir');
    assert.equal(
      getDefaultStorePath(),
      path.join(os.tmpdir(), 'dsh-data-dir', 'cron', 'tasks.json'),
      'DSH_DATA_DIR wins',
    );

    delete process.env.DSH_DATA_DIR;
    process.env.DSH_HOME = path.join(os.tmpdir(), 'dsh-home');
    assert.equal(
      getDefaultStorePath(),
      path.join(os.tmpdir(), 'dsh-home', 'data', 'cron', 'tasks.json'),
      'DSH_HOME decides where profile data lives',
    );

    delete process.env.DSH_HOME;
    process.env.HOME = path.join(os.tmpdir(), 'plain-home');
    assert.equal(
      getDefaultStorePath(),
      path.join(os.tmpdir(), 'plain-home', '.dsh', 'data', 'cron', 'tasks.json'),
      'user home is the last resort',
    );
  } finally {
    process.env.DSH_DATA_DIR = env.DSH_DATA_DIR;
    process.env.DSH_HOME = env.DSH_HOME;
    process.env.HOME = env.HOME;
    if (env.DSH_DATA_DIR === undefined) delete process.env.DSH_DATA_DIR;
    if (env.DSH_HOME === undefined) delete process.env.DSH_HOME;
  }
});
