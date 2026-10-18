import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { createCronApiHandler } from '../lib/api.js';
import { createExternalApiHandler, API_TOKEN_SETTING_KEY } from '../lib/external-api.js';
import { applyTaskPatch } from '../lib/task-patch.js';

function mockReq({ method = 'GET', url = '/', headers = {}, body = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1:3080', ...headers };
  req.connection = { remoteAddress: '127.0.0.1' };
  req.socket = { remoteAddress: '127.0.0.1' };

  process.nextTick(() => {
    if (body !== null && body !== undefined) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      req.emit('data', Buffer.from(data, 'utf8'));
    }
    req.emit('end');
  });

  return req;
}

function mockRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.body = '';
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.writeHead = (code, headers) => {
    res.statusCode = code;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        res.headers[k.toLowerCase()] = v;
      }
    }
  };
  res.end = (chunk) => {
    if (chunk) res.body += chunk.toString('utf8');
    res.emit('finish');
  };
  return res;
}

function makeEnv(t) {
  const tmpFile = path.join(os.tmpdir(), `dsh-cron-gh10-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(tmpFile);
  t.after(() => {
    try { fs.rmSync(tmpFile, { force: true }); } catch (err) {}
  });

  const scheduledTasks = new Map();
  const scheduler = {
    scheduleTask: (task) => scheduledTasks.set(task.id, task),
    unscheduleTask: (id) => scheduledTasks.delete(id),
    runNow: async () => {},
    tasks: scheduledTasks,
  };

  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  return { store, scheduler, handler };
}

test('GH #10: POST /dsh-cron/tasks persists sessionTitle on task creation', async (t) => {
  const { store, handler } = makeEnv(t);

  const payload = {
    title: '[probe] Session Worker',
    sessionTitle: ' [W] Background Agent  ',
    schedule: '0 4 1 1 *',
    prompt: 'reply OK',
    type: 'llm',
    targetSessionId: 'cron-exec-example',
    delivery: 'current',
  };

  const req = mockReq({
    method: 'POST',
    url: '/dsh-cron/tasks',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200, 'HTTP response should be 200: ' + res.body);
  const data = JSON.parse(res.body);
  assert.equal(data.ok, true);
  assert.ok(data.task.id);
  assert.equal(data.task.sessionTitle, '[W] Background Agent', 'sessionTitle must be present and trimmed');

  const stored = store.get(data.task.id);
  assert.ok(stored);
  assert.equal(stored.sessionTitle, '[W] Background Agent', 'sessionTitle must be stored in TaskStore');
});

test('GH #10: POST /dsh-cron/api/tasks persists sessionTitle on external API creation', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const token = 'gh10-auth-token-xyz';
  store.saveSettings({ [API_TOKEN_SETTING_KEY]: token });

  const externalHandler = createExternalApiHandler({
    store,
    scheduler,
    getToken: () => store.getSettings()[API_TOKEN_SETTING_KEY] || '',
  });

  const payload = {
    title: 'External API Task',
    sessionTitle: '[Ext] Resident Worker',
    schedule: '0 */6 * * *',
    prompt: 'run audit',
    type: 'llm',
    targetSessionId: 'sess-ext-777',
  };

  const req = mockReq({
    method: 'POST',
    url: '/dsh-cron/api/tasks',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + token,
    },
    body: payload,
  });
  const res = mockRes();
  await externalHandler(req, res);

  assert.equal(res.statusCode, 200, 'External API creation should succeed: ' + res.body);
  const data = JSON.parse(res.body);
  assert.equal(data.ok, true);
  assert.equal(data.task.sessionTitle, '[Ext] Resident Worker');

  const stored = store.get(data.task.id);
  assert.equal(stored.sessionTitle, '[Ext] Resident Worker');
});

test('GH #10: POST /dsh-cron/tasks update preserves existing sessionTitle when omitted and overrides when provided', async (t) => {
  const { store, handler } = makeEnv(t);

  // 1. Create with initial sessionTitle
  const reqCreate = mockReq({
    method: 'POST',
    url: '/dsh-cron/tasks',
    headers: { 'content-type': 'application/json' },
    body: {
      title: 'Initial Task',
      sessionTitle: 'Original Title',
      schedule: '0 12 * * *',
      prompt: 'step 1',
      type: 'llm',
      targetSessionId: 'sess-init-1',
    },
  });
  const resCreate = mockRes();
  await handler(reqCreate, resCreate);
  assert.equal(resCreate.statusCode, 200);
  const createdId = JSON.parse(resCreate.body).task.id;

  // 2. Update without sessionTitle in payload -> should preserve original
  const reqUpdate1 = mockReq({
    method: 'POST',
    url: '/dsh-cron/tasks',
    headers: { 'content-type': 'application/json' },
    body: {
      id: createdId,
      title: 'Updated Task Name',
      schedule: '0 13 * * *',
      prompt: 'step 1 updated',
    },
  });
  const resUpdate1 = mockRes();
  await handler(reqUpdate1, resUpdate1);
  assert.equal(resUpdate1.statusCode, 200);
  const data1 = JSON.parse(resUpdate1.body);
  assert.equal(data1.task.sessionTitle, 'Original Title', 'Existing sessionTitle must be preserved on update');

  // 3. Update with new sessionTitle -> should update
  const reqUpdate2 = mockReq({
    method: 'POST',
    url: '/dsh-cron/tasks',
    headers: { 'content-type': 'application/json' },
    body: {
      id: createdId,
      title: 'Updated Task Name',
      schedule: '0 12 * * *',
      prompt: 'step 1 updated',
      sessionTitle: 'New Overridden Title',
    },
  });
  const resUpdate2 = mockRes();
  await handler(reqUpdate2, resUpdate2);
  assert.equal(resUpdate2.statusCode, 200, resUpdate2.body);
  const data2 = JSON.parse(resUpdate2.body);
  assert.equal(data2.task.sessionTitle, 'New Overridden Title', 'sessionTitle must be updated when explicitly provided');
});

test('GH #10: applyTaskPatch and TaskStore.set handle sessionTitle', async (t) => {
  const { store, scheduler } = makeEnv(t);

  const task = store.set({
    title: 'Patch Me',
    sessionTitle: 'Before Patch',
    schedule: '0 0 * * *',
    prompt: 'ping',
    type: 'llm',
  });
  assert.equal(task.sessionTitle, 'Before Patch');

  // Patch sessionTitle via patchTask
  const patched = await applyTaskPatch({ store, scheduler, id: task.id, body: {
    sessionTitle: '  After Patch Clean  ',
  }});
  assert.equal(patched.task.sessionTitle, 'After Patch Clean');
  assert.equal(store.get(task.id).sessionTitle, 'After Patch Clean');
});
