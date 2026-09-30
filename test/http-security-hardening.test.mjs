import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  isTrustedRequest,
  isCrossOrigin,
  rejectCrossOrigin,
  redactTaskSecrets,
  restoreTaskSecrets,
  REDACTED_SECRET,
} from '../lib/http-utils.js';
import { handleHeartbeatPing } from '../lib/api-helpers.js';
import { createCronApiHandler } from '../lib/api.js';

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      if (headers) Object.assign(this.headers, headers);
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(data) {
      if (data) this.body = data;
    },
  };
  return res;
}

function mockReq({ method = 'GET', url = '/', headers = {}, remoteAddress = '127.0.0.1', body = null }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  req.socket = { remoteAddress };
  req.connection = { remoteAddress };
  process.nextTick(() => {
    if (body !== null) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.emit('data', Buffer.from(payload));
    }
    req.emit('end');
  });
  return req;
}

test('HTTP Security Hardening (#86): isTrustedRequest rejects untrusted remote callers', () => {
  // Remote IP without token is rejected
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '203.0.113.10' },
    headers: { host: '127.0.0.1:3080' },
  }), false);

  // Remote IP with forged matching Origin + Host is rejected without token
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '203.0.113.10' },
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      'sec-fetch-site': 'same-origin',
    },
  }), false);

  // Remote IP with valid Bearer token is trusted
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '203.0.113.10' },
    headers: {
      host: '127.0.0.1:3080',
      authorization: 'Bearer secret-test-token',
    },
  }, { apiToken: 'secret-test-token' }), true);

  // Remote IP with valid x-dsh-cron-token header is trusted
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '203.0.113.10' },
    headers: {
      host: '127.0.0.1:3080',
      'x-dsh-cron-token': 'custom-cron-token',
    },
  }, { apiToken: 'custom-cron-token' }), true);

  // Loopback callers are trusted
  for (const loopback of ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']) {
    assert.equal(isTrustedRequest({
      socket: { remoteAddress: loopback },
      headers: { host: '127.0.0.1:3080' },
    }), true, `Loopback ${loopback} must be trusted`);
  }
});

test('HTTP Security Hardening (#86): isTrustedRequest validates Origin and Sec-Fetch-Site', () => {
  // Origin null rejected
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080', origin: 'null' },
  }), false);

  // Cross-site Sec-Fetch-Site rejected
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' },
  }), false);

  // Same-site Sec-Fetch-Site rejected
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-site' },
  }), false);

  // Same-origin Sec-Fetch-Site accepted
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
  }), true);

  // None Sec-Fetch-Site accepted
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'none' },
  }), true);

  // Origin mismatch rejected
  assert.equal(isTrustedRequest({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080', origin: 'http://attacker.example' },
  }), false);
});

test('HTTP Security Hardening (#86): redactTaskSecrets masks env, httpHeaders, and httpBody', () => {
  const task = {
    id: 'task-1',
    name: 'Secret task',
    command: 'curl http://api.internal',
    env: {
      API_KEY: 'super-secret-key-12345',
      DB_PASS: 'db-secret-pass',
      PUBLIC_VAR: 'public-data',
    },
    httpHeaders: {
      Authorization: 'Bearer bearer-secret-token',
      'X-Api-Key': 'key-abc-123',
    },
    httpBody: JSON.stringify({ webhookSecret: 'top-secret-payload' }),
  };

  const redacted = redactTaskSecrets(task);

  assert.equal(redacted.id, 'task-1');
  assert.equal(redacted.name, 'Secret task');
  assert.equal(redacted.command, 'curl http://api.internal');
  assert.equal(redacted.env.API_KEY, REDACTED_SECRET);
  assert.equal(redacted.env.DB_PASS, REDACTED_SECRET);
  assert.equal(redacted.env.PUBLIC_VAR, REDACTED_SECRET);
  assert.equal(redacted.httpHeaders.Authorization, REDACTED_SECRET);
  assert.equal(redacted.httpHeaders['X-Api-Key'], REDACTED_SECRET);
  assert.equal(redacted.httpBody, REDACTED_SECRET);

  // Handle stringified JSON httpHeaders
  const taskWithStringHeaders = {
    id: 'task-2',
    httpHeaders: JSON.stringify({ Authorization: 'Bearer test' }),
  };
  const redactedStringHeaders = redactTaskSecrets(taskWithStringHeaders);
  const parsed = JSON.parse(redactedStringHeaders.httpHeaders);
  assert.equal(parsed.Authorization, REDACTED_SECRET);
});

test('HTTP Security Hardening (#86): restoreTaskSecrets preserves original secrets', () => {
  const existing = {
    id: 'task-1',
    env: {
      SECRET_ONE: 'orig-secret-1',
      SECRET_TWO: 'orig-secret-2',
    },
    httpHeaders: {
      Authorization: 'Bearer orig-token',
      'X-Custom': 'orig-custom',
    },
    httpBody: '{"token":"orig-body-secret"}',
  };

  const incomingWithRedacted = {
    id: 'task-1',
    name: 'Updated Name',
    env: {
      SECRET_ONE: REDACTED_SECRET, // preserved
      SECRET_TWO: 'new-unredacted-secret', // updated
    },
    httpHeaders: {
      Authorization: REDACTED_SECRET, // preserved
      'X-Custom': 'new-custom', // updated
    },
    httpBody: REDACTED_SECRET, // preserved
  };

  const restored = restoreTaskSecrets(incomingWithRedacted, existing);

  assert.equal(restored.name, 'Updated Name');
  assert.equal(restored.env.SECRET_ONE, 'orig-secret-1');
  assert.equal(restored.env.SECRET_TWO, 'new-unredacted-secret');
  assert.equal(restored.httpHeaders.Authorization, 'Bearer orig-token');
  assert.equal(restored.httpHeaders['X-Custom'], 'new-custom');
  assert.equal(restored.httpBody, '{"token":"orig-body-secret"}');
});

test('HTTP Security Hardening (#86): handleHeartbeatPing enforces POST method and guards caller', async () => {
  let pingCalled = false;
  const mockStore = {
    getSettings: () => ({ apiToken: 'test-token' }),
    get: (id) => ({ id, title: 'task' }),
    recordHeartbeat: (taskId) => {
      pingCalled = true;
      return { ok: true, taskId };
    },
  };

  // 1. GET method rejected with 405 Method Not Allowed
  const getReq = {
    method: 'GET',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080' },
  };
  const getRes = mockRes();
  handleHeartbeatPing({ store: mockStore, req: getReq, res: getRes, taskId: 'task-1' });
  assert.equal(getRes.statusCode, 405);
  assert.equal(pingCalled, false);

  // 2. Untrusted remote caller rejected with 403 Forbidden
  const remoteReq = {
    method: 'POST',
    socket: { remoteAddress: '198.51.100.5' },
    headers: { host: '127.0.0.1:3080' },
  };
  const remoteRes = mockRes();
  handleHeartbeatPing({ store: mockStore, req: remoteReq, res: remoteRes, taskId: 'task-1' });
  assert.equal(remoteRes.statusCode, 403);
  assert.equal(pingCalled, false);

  // 3. Valid local POST accepted
  const postReq = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080' },
  };
  const postRes = mockRes();
  handleHeartbeatPing({ store: mockStore, req: postReq, res: postRes, taskId: 'task-1' });
  assert.equal(postRes.statusCode, 200);
  assert.equal(pingCalled, true);
  const data = JSON.parse(postRes.body);
  assert.equal(data.ok, true);
  assert.equal(data.taskId, 'task-1');
});

test('HTTP Security Hardening (#86): createCronApiHandler protects GET tasks and redacts secrets', async () => {
  const secretTask = {
    id: 't-123',
    title: 'Secret Task',
    schedule: '0 0 * * *',
    prompt: 'Do confidential work',
    status: 'active',
    env: { DB_PASS: 'top-secret' },
    httpHeaders: { Authorization: 'Bearer secret-auth' },
    httpBody: 'confidential payload',
  };

  const tasksMap = new Map([[secretTask.id, { ...secretTask }]]);
  const mockStore = {
    getSettings: () => ({ apiToken: 'expected-token' }),
    list: () => Array.from(tasksMap.values()),
    get: (id) => tasksMap.get(id) || null,
    set: (t) => { tasksMap.set(t.id, t); return t; },
    getAggregatedStats: () => ({}),
  };

  const mockScheduler = {
    isRunning: () => false,
    runningSince: () => null,
    scheduleTask: () => {},
    pauseTask: (id) => {
      const t = tasksMap.get(id);
      if (t) t.status = 'paused';
      return t;
    },
  };

  const collection = { recommendations: [] };
  const handler = createCronApiHandler(mockStore, mockScheduler, collection);

  // 1. Untrusted remote caller rejected on GET /dsh-cron/tasks
  const untrustedReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/tasks',
    remoteAddress: '203.0.113.50',
    headers: { host: '127.0.0.1:3080' },
  });
  const untrustedRes = mockRes();
  await handler(untrustedReq, untrustedRes);
  assert.equal(untrustedRes.statusCode, 403);

  // 2. Loopback caller accepted on GET /dsh-cron/tasks and secrets are redacted
  const localReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/tasks',
    remoteAddress: '127.0.0.1',
    headers: { host: '127.0.0.1:3080' },
  });
  const localRes = mockRes();
  await handler(localReq, localRes);
  assert.equal(localRes.statusCode, 200);
  const listData = JSON.parse(localRes.body);
  assert.equal(listData.tasks.length, 1);
  assert.equal(listData.tasks[0].env.DB_PASS, REDACTED_SECRET);
  assert.equal(listData.tasks[0].httpHeaders.Authorization, REDACTED_SECRET);
  assert.equal(listData.tasks[0].httpBody, REDACTED_SECRET);

  // 3. Untrusted remote caller rejected on GET /dsh-cron/tasks/t-123
  const untrustedItemReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/tasks/t-123',
    remoteAddress: '203.0.113.50',
    headers: { host: '127.0.0.1:3080' },
  });
  const untrustedItemRes = mockRes();
  await handler(untrustedItemReq, untrustedItemRes);
  assert.equal(untrustedItemRes.statusCode, 403);

  // 4. Loopback caller accepted on GET /dsh-cron/tasks/t-123 and secrets are redacted
  const localItemReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/tasks/t-123',
    remoteAddress: '127.0.0.1',
    headers: { host: '127.0.0.1:3080' },
  });
  const localItemRes = mockRes();
  await handler(localItemReq, localItemRes);
  assert.equal(localItemRes.statusCode, 200);
  const itemData = JSON.parse(localItemRes.body);
  assert.equal(itemData.task.env.DB_PASS, REDACTED_SECRET);
  assert.equal(itemData.task.httpHeaders.Authorization, REDACTED_SECRET);
  assert.equal(itemData.task.httpBody, REDACTED_SECRET);

  // 5. Updating task with REDACTED_SECRET preserves original secrets
  const updateReq = mockReq({
    method: 'POST',
    url: '/dsh-cron/tasks',
    remoteAddress: '127.0.0.1',
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    body: {
      id: 't-123',
      title: 'Updated Title',
      schedule: '0 0 * * *',
      prompt: 'Do confidential work',
      env: { DB_PASS: REDACTED_SECRET },
      httpHeaders: { Authorization: REDACTED_SECRET },
      httpBody: REDACTED_SECRET,
    },
  });
  const updateRes = mockRes();
  await handler(updateReq, updateRes);
  assert.equal(updateRes.statusCode, 200);
  // Stored record retained actual secrets
  const stored = tasksMap.get('t-123');
  assert.equal(stored.title, 'Updated Title');
  assert.equal(stored.env.DB_PASS, 'top-secret');
  assert.equal(stored.httpHeaders.Authorization, 'Bearer secret-auth');
  assert.equal(stored.httpBody, 'confidential payload');
});
