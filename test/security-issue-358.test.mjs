import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { handleTaskWebhookRoute, verifyToken } from '../lib/api-task-webhook.js';

function createMockReq({ method = 'POST', url = '/dsh-cron/webhook/wh-task-1', headers = {}, body = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.destroy = () => {};
  const chunks = [Buffer.from(JSON.stringify(body), 'utf8')];
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

function createMockRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(data) {
      try {
        this.payload = JSON.parse(data);
      } catch {
        this.payload = data;
      }
    },
  };
}

test('Issue #358: verifyToken strictly refuses query-parameter tokens', () => {
  const expected = 'super-secret-token-123';

  // 1. Token passed only via URL query parameter -> must return false (#358)
  const reqWithQueryOnly = { headers: {} };
  const urlWithQuery = new URL('http://127.0.0.1/webhook/task1?token=super-secret-token-123');
  assert.equal(
    verifyToken(expected, reqWithQueryOnly, urlWithQuery),
    false,
    'query-parameter token must be rejected'
  );

  // 2. Token passed via header x-dsh-cron-webhook-token -> true
  const reqHeader = { headers: { 'x-dsh-cron-webhook-token': 'super-secret-token-123' } };
  assert.equal(verifyToken(expected, reqHeader), true);

  // 3. Token passed via header x-webhook-token -> true
  const reqAltHeader = { headers: { 'x-webhook-token': 'super-secret-token-123' } };
  assert.equal(verifyToken(expected, reqAltHeader), true);

  // 4. Token passed via Authorization: Bearer -> true
  const reqBearer = { headers: { authorization: 'Bearer super-secret-token-123' } };
  assert.equal(verifyToken(expected, reqBearer), true);

  // 5. Wrong token in header -> false
  const reqWrong = { headers: { 'x-dsh-cron-webhook-token': 'wrong-token' } };
  assert.equal(verifyToken(expected, reqWrong), false);

  // 6. Missing token -> false
  assert.equal(verifyToken(expected, { headers: {} }), false);
  assert.equal(verifyToken('', reqHeader), false);
});

test('Issue #358: Webhook route rejects ?token= in URL and accepts headers (Task token)', async () => {
  const token = 'task-webhook-token-abc';
  const task = {
    id: 'task-sec-358',
    title: 'Webhook Security Test',
    status: 'active',
    webhookEnabled: true,
    webhookToken: token,
  };

  const tasks = new Map([[task.id, task]]);
  const store = {
    get: (id) => tasks.get(id) || null,
    getSettings: () => ({}),
  };

  let triggered = false;
  const scheduler = {
    triggerManualRun: async () => {
      triggered = true;
      return { runId: 'run-358' };
    },
  };

  // 1. Attempt webhook with ?token= in query string -> 401
  const queryReq = createMockReq({
    url: `/dsh-cron/webhook/${task.id}?token=${token}`,
    headers: {},
    body: { event: 'ping' },
  });
  const queryRes = createMockRes();
  await handleTaskWebhookRoute({ store, scheduler, req: queryReq, res: queryRes, taskId: task.id });

  assert.equal(queryRes.statusCode, 401);
  assert.equal(queryRes.payload.ok, false);
  assert.equal(queryRes.payload.error, 'Invalid webhook token');
  assert.equal(triggered, false, 'Task must not be triggered with query token');

  // 2. Webhook with x-dsh-cron-webhook-token header -> 200
  const headerReq = createMockReq({
    url: `/dsh-cron/webhook/${task.id}`,
    headers: { 'x-dsh-cron-webhook-token': token },
    body: { event: 'ping' },
  });
  const headerRes = createMockRes();
  await handleTaskWebhookRoute({ store, scheduler, req: headerReq, res: headerRes, taskId: task.id });

  assert.equal(headerRes.statusCode, 200);
  assert.equal(headerRes.payload.ok, true);
  assert.equal(triggered, true);

  // Reset trigger state
  triggered = false;

  // 3. Webhook with Authorization: Bearer header -> 200
  const bearerReq = createMockReq({
    url: `/dsh-cron/webhook/${task.id}`,
    headers: { authorization: `Bearer ${token}` },
    body: { event: 'ping' },
  });
  const bearerRes = createMockRes();
  await handleTaskWebhookRoute({ store, scheduler, req: bearerReq, res: bearerRes, taskId: task.id });

  assert.equal(bearerRes.statusCode, 200);
  assert.equal(bearerRes.payload.ok, true);
  assert.equal(triggered, true);
});

test('Issue #358: Webhook route rejects ?token= in URL for master API token', async () => {
  const masterToken = 'master-api-token-xyz';
  const task = {
    id: 'task-sec-358-master',
    title: 'Webhook Master Token Test',
    status: 'active',
    webhookEnabled: true,
    // No task-specific token: relies on master apiToken fallback
  };

  const tasks = new Map([[task.id, task]]);
  const store = {
    get: (id) => tasks.get(id) || null,
    getSettings: () => ({ apiToken: masterToken }),
  };

  let triggered = false;
  const scheduler = {
    triggerManualRun: async () => {
      triggered = true;
      return { runId: 'run-358-master' };
    },
  };

  // 1. Master token in query -> 401
  const queryReq = createMockReq({
    url: `/dsh-cron/webhook/${task.id}?token=${masterToken}`,
    headers: {},
    body: { event: 'ping' },
  });
  const queryRes = createMockRes();
  await handleTaskWebhookRoute({ store, scheduler, req: queryReq, res: queryRes, taskId: task.id });

  assert.equal(queryRes.statusCode, 401);
  assert.equal(queryRes.payload.ok, false);
  assert.equal(triggered, false, 'Master token in query must not trigger task');

  // 2. Master token in Bearer header -> 200
  const bearerReq = createMockReq({
    url: `/dsh-cron/webhook/${task.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
    body: { event: 'ping' },
  });
  const bearerRes = createMockRes();
  await handleTaskWebhookRoute({ store, scheduler, req: bearerReq, res: bearerRes, taskId: task.id });

  assert.equal(bearerRes.statusCode, 200);
  assert.equal(bearerRes.payload.ok, true);
  assert.equal(triggered, true);
});
