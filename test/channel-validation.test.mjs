import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { createCronApiHandler, buildTaskExport } from '../lib/index.js';
import { unknownChannelIds, unknownChannels } from '../lib/channels.js';
import { buildTaskPatch, applyTaskPatch } from '../lib/task-patch.js';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), 'dsh-cron-channels-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch (err) {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

function mockReq(chunks) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

function mockBody(method, url, body, headers = {}) {
  const req = mockReq([Buffer.from(JSON.stringify(body), 'utf8')]);
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function mockRes() {
  return {
    statusCode: 0,
    payload: null,
    writeHead(code) { this.statusCode = code; },
    end(payload) { this.payload = payload ? JSON.parse(payload) : null; },
  };
}

test('#121: unknownChannelIds lists only ids this build does not know', () => {
  assert.deepEqual(unknownChannelIds(['discord', 'email', 'slack']), ['email']);
  assert.deepEqual(unknownChannelIds(['ntfy']), []);
  assert.deepEqual(unknownChannelIds('discord'), [], 'a non-array is not a channel list');
  assert.deepEqual(unknownChannelIds(undefined), []);
});

test('#121: unknownChannels still reports what a stored task references', () => {
  assert.deepEqual(unknownChannels({ channels: ['telegram', 'email'] }), ['email']);
  assert.deepEqual(unknownChannels({}), []);
});

test('#121: POST with an unknown channel answers 400 and names it', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const res = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks', {
    title: 'Report', schedule: '0 4 * * *', prompt: 'summarise', type: 'llm', channels: ['discord', 'email'],
  }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload.unknownChannels, ['email']);
  assert.equal(store.list({ status: 'all' }).length, 0, 'nothing was written');
});

test('#121: POST with known channels still creates the task', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const res = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks', {
    title: 'Report', schedule: '0 4 * * *', prompt: 'summarise', type: 'llm', channels: ['discord', 'ntfy'],
  }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.task.channels, ['discord', 'ntfy']);
});

test('#121: PATCH refuses unknown ids and leaves the task alone', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  store.set({ id: 'cron_a', title: 'A', schedule: '0 4 * * *', prompt: 'x', type: 'llm', status: 'paused', channels: ['discord'] });
  const res = mockRes();
  await handler(mockBody('PATCH', '/dsh-cron/tasks/cron_a', { channels: ['telegram', 'email'] }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload.unknownChannels, ['email']);
  assert.deepEqual(store.get('cron_a').channels, ['discord'], 'the stored task is unchanged');
});

test('#121: the tool path is refused in the same place', (t) => {
  const { store, scheduler } = makeEnv(t);
  const current = { id: 'cron_b', title: 'B', schedule: '0 4 * * *', prompt: 'x', type: 'llm', status: 'paused' };
  const built = buildTaskPatch(current, { channels: ['email'] });
  assert.equal(built.ok, false);
  assert.match(built.error, /email/);
  assert.deepEqual(built.unknownChannels, ['email']);
  store.set(current);
  const applied = applyTaskPatch({ store, scheduler, id: 'cron_b', body: { channels: ['email'] } });
  assert.equal(applied.ok, false);
  assert.deepEqual(applied.unknownChannels, ['email']);
  assert.deepEqual(store.get('cron_b').channels, undefined, 'nothing was written');
});

test('#121: import stays tolerant but reports the dropped ids', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const doc = buildTaskExport([{ id: 'cron_imp', title: 'Imported', schedule: '0 4 * * *', prompt: 'x', type: 'llm', channels: ['discord', 'email'] }]);
  const res = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks/import', { document: doc, strategy: 'add' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.unknownChannels, ['email']);
  const imported = store.list({ status: 'all' })[0];
  assert.deepEqual(imported.channels, ['discord'], 'the unknown id is not stored');
});
