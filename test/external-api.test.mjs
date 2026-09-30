import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { tokenMatches, readBearerToken, createExternalApiHandler, API_TOKEN_SETTING_KEY } from '../lib/external-api.js';

const TOKEN = 'ci-token-1234567890';

function makeEnv(t, { token = TOKEN } = {}) {
  const filePath = path.join(os.tmpdir(), 'dsh-cron-external-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch (err) {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  if (token) store.saveSettings({ [API_TOKEN_SETTING_KEY]: token });
  return {
    store,
    scheduler,
    handler: createExternalApiHandler({ store, scheduler, getToken: () => store.getSettings()[API_TOKEN_SETTING_KEY] || '' }),
  };
}

function mockReq(chunks, method, url, headers) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function call(method, url, { body, token = TOKEN, headers = {} } = {}) {
  const auth = token === null ? {} : { authorization: 'Bearer ' + token };
  return mockReq(body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')], method, url, { ...auth, ...headers });
}

function mockRes() {
  return {
    statusCode: 0,
    payload: null,
    writeHead(code) { this.statusCode = code; },
    end(payload) { this.payload = payload ? JSON.parse(payload) : null; },
  };
}

test('#54: the token comparison is exact and length-safe', () => {
  assert.equal(tokenMatches(TOKEN, TOKEN), true);
  assert.equal(tokenMatches(TOKEN, TOKEN.slice(0, -1)), false, 'a shorter token is refused');
  assert.equal(tokenMatches(TOKEN, TOKEN + 'x'), false, 'a longer token is refused');
  assert.equal(tokenMatches(TOKEN, 'other-token-1234567890'), false);
  assert.equal(tokenMatches('', TOKEN), false);
  assert.equal(tokenMatches(TOKEN, ''), false);
});

test('#54: only a bearer header is accepted', () => {
  assert.equal(readBearerToken({ headers: { authorization: 'Bearer ' + TOKEN } }), TOKEN);
  assert.equal(readBearerToken({ headers: { authorization: 'bearer ' + TOKEN } }), TOKEN);
  assert.equal(readBearerToken({ headers: { authorization: 'Basic ' + TOKEN } }), '');
  assert.equal(readBearerToken({ headers: {} }), '');
  assert.equal(readBearerToken({}), '');
});

test('#54: an unconfigured token disables the surface instead of opening it', async (t) => {
  const { handler } = makeEnv(t, { token: '' });
  const res = mockRes();
  await handler(call('GET', '/dsh-cron/api/tasks', { token: null }), res);
  assert.equal(res.statusCode, 503);
  assert.match(res.payload.error, /apiToken/);
});

test('#54: a missing or wrong token is refused', async (t) => {
  const { handler } = makeEnv(t);
  const missing = mockRes();
  await handler(call('GET', '/dsh-cron/api/tasks', { token: null }), missing);
  assert.equal(missing.statusCode, 401);

  const wrong = mockRes();
  await handler(call('GET', '/dsh-cron/api/tasks', { token: 'nope' }), wrong);
  assert.equal(wrong.statusCode, 401);
});

test('#54: the authorized surface lists, reads, creates and deletes', async (t) => {
  const { store, scheduler, handler } = makeEnv(t);

  const created = mockRes();
  await handler(call('POST', '/dsh-cron/api/tasks', {
    body: { title: 'CI job', schedule: '*/30 * * * *', prompt: 'check', type: 'llm' },
  }), created);
  assert.equal(created.statusCode, 200);
  const id = created.payload.task.id;
  assert.equal(scheduler.jobs.has(id), true, 'a created task is armed');

  const list = mockRes();
  await handler(call('GET', '/dsh-cron/api/tasks'), list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.tasks.length, 1);
  assert.equal(list.payload.tasks[0].running, false);

  const one = mockRes();
  await handler(call('GET', '/dsh-cron/api/tasks/' + id), one);
  assert.equal(one.statusCode, 200);
  assert.equal(one.payload.task.id, id);

  const missing = mockRes();
  await handler(call('GET', '/dsh-cron/api/tasks/cron_nope'), missing);
  assert.equal(missing.statusCode, 404);

  const removed = mockRes();
  await handler(call('DELETE', '/dsh-cron/api/tasks/' + id), removed);
  assert.equal(removed.statusCode, 200);
  assert.equal(store.get(id), undefined);
});

test('#54: a manual run is available to the external surface', async (t) => {
  const { store, handler } = makeEnv(t);
  store.set({ id: 'cron_run', title: 'R', schedule: '0 4 * * *', prompt: 'x', type: 'llm', status: 'paused' });
  const res = mockRes();
  await handler(call('POST', '/dsh-cron/api/tasks/cron_run/run', { body: {} }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
});

test('#54: the code-execution gate holds on the external surface', async (t) => {
  const { store, handler } = makeEnv(t);
  const denied = mockRes();
  await handler(call('POST', '/dsh-cron/api/tasks', {
    body: { title: 'Shell job', schedule: '0 4 * * *', prompt: 'rm -rf /tmp/x', type: 'script' },
  }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(store.list({ status: 'all' }).length, 0);

  const allowed = mockRes();
  await handler(call('POST', '/dsh-cron/api/tasks', {
    body: { title: 'Shell job', schedule: '0 4 * * *', prompt: 'echo hi', type: 'script' },
    headers: { 'x-dsh-cron-confirm': 'script' },
  }), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.payload.task.type, 'script');
});

test('#54: a config-owned task is refused through the external surface too', async (t) => {
  const { store, handler } = makeEnv(t);
  store.set({ id: 'cron_cfg', title: 'C', schedule: '0 4 * * *', prompt: 'x', type: 'llm', status: 'active', managedBy: 'config' });
  const res = mockRes();
  await handler(call('DELETE', '/dsh-cron/api/tasks/cron_cfg'), res);
  assert.equal(res.statusCode, 409);
  assert.ok(store.get('cron_cfg'));
});

test('#54: the token is masked on read and a masked echo cannot overwrite it', (t) => {
  const { store } = makeEnv(t);
  const client = store.getClientSettings();
  assert.notEqual(client.apiToken, TOKEN);
  assert.match(client.apiToken, /•/, 'the browser never receives the token in clear');
  assert.equal(store.getSettings().apiToken, TOKEN);

  store.saveSettings({ apiToken: client.apiToken });
  assert.equal(store.getSettings().apiToken, TOKEN, 'a masked value does not replace the stored token');
});
