import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { createCronApiHandler, buildTaskExport } from '../lib/index.js';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), 'dsh-cron-configapi-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch (err) {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler, handler: createCronApiHandler(store, scheduler, { recommendations: [] }) };
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
  const req = mockReq(body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]);
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

function seedConfigTask(store) {
  return store.set({
    id: 'cron_cfg',
    title: 'Nightly report',
    schedule: '0 3 * * *',
    prompt: 'summarise',
    type: 'llm',
    status: 'active',
    managedBy: 'config',
  });
}

test('#50: a config task cannot be patched, paused or deleted over HTTP', async (t) => {
  const { store, handler } = makeEnv(t);
  seedConfigTask(store);

  const patch = mockRes();
  await handler(mockBody('PATCH', '/dsh-cron/tasks/cron_cfg', { title: 'Renamed' }), patch);
  assert.equal(patch.statusCode, 409);
  assert.match(patch.payload.error, /declared in the profile config/);
  assert.equal(store.get('cron_cfg').title, 'Nightly report', 'nothing changed');

  const pause = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks/cron_cfg/pause', {}), pause);
  assert.equal(pause.statusCode, 409);
  assert.equal(store.get('cron_cfg').status, 'active');

  const toggle = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks/cron_cfg/toggle', {}), toggle);
  assert.equal(toggle.statusCode, 409);

  const del = mockRes();
  await handler(mockBody('DELETE', '/dsh-cron/tasks/cron_cfg', undefined), del);
  assert.equal(del.statusCode, 409);
  assert.ok(store.get('cron_cfg'), 'the task is still there');
});

test('#50: create-or-update cannot overwrite a config task either', async (t) => {
  const { store, handler } = makeEnv(t);
  seedConfigTask(store);

  const res = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks', {
    id: 'cron_cfg',
    title: 'Replaced through POST',
    schedule: '0 6 * * *',
    prompt: 'other',
    type: 'llm',
  }), res);
  assert.equal(res.statusCode, 409);
  assert.match(res.payload.error, /declared in the profile config/);
  assert.equal(store.get('cron_cfg').title, 'Nightly report', 'the config task is untouched');
  assert.equal(store.get('cron_cfg').schedule, '0 3 * * *');
});

test('#50: a config task can still be triggered by hand', async (t) => {
  const { store, handler } = makeEnv(t);
  seedConfigTask(store);
  const res = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks/cron_cfg/run', {}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
});

test('#50: an import cannot replace a task the config owns', async (t) => {
  const { store, handler } = makeEnv(t);
  seedConfigTask(store);
  const doc = buildTaskExport([{ id: 'cron_cfg', title: 'Imported', schedule: '0 4 * * *', prompt: 'x', type: 'llm' }]);

  const res = mockRes();
  await handler(mockBody('POST', '/dsh-cron/tasks/import', { document: doc, strategy: 'replace' }), res);
  assert.equal(res.statusCode, 409);
  assert.match(res.payload.error, /cannot be replaced by an import/);
  assert.equal(store.get('cron_cfg').title, 'Nightly report');
});

test('#50: a plain task keeps every action it had', async (t) => {
  const { store, handler } = makeEnv(t);
  store.set({ id: 'cron_plain', title: 'Plain', schedule: '0 3 * * *', prompt: 'x', type: 'llm', status: 'active' });

  const patch = mockRes();
  await handler(mockBody('PATCH', '/dsh-cron/tasks/cron_plain', { title: 'Renamed' }), patch);
  assert.equal(patch.statusCode, 200);
  assert.equal(store.get('cron_plain').title, 'Renamed');

  const del = mockRes();
  await handler(mockBody('DELETE', '/dsh-cron/tasks/cron_plain', undefined), del);
  assert.equal(del.statusCode, 200);
  assert.equal(store.get('cron_plain'), undefined);
});
