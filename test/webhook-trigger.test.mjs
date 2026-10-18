import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleTaskWebhookRoute, verifyHmacSignature, verifyToken } from '../lib/api-task-webhook.js';
import { buildPromptContext, interpolateTaskPrompt, resolveTaskForExecution } from '../lib/prompt-interpolation.js';
import { redactTaskSecrets, restoreTaskSecrets } from '../lib/http-utils.js';

function fakeRequestResponse({ method = 'POST', url = '/dsh-cron/webhook/task1', headers = {}, body = null }) {
  const req = {
    method,
    url,
    headers: { ...headers },
    on(event, handler) {
      if (event === 'data' && body !== null) {
        const payload = typeof body === 'object' ? JSON.stringify(body) : String(body);
        handler(Buffer.from(payload));
      }
      if (event === 'end') {
        process.nextTick(handler);
      }
      return req;
    },
    destroy() {},
  };

  let statusCode = 200;
  let headersSent = {};
  let bodySent = '';

  const res = {
    writeHead(code, h) {
      statusCode = code;
      headersSent = { ...headersSent, ...h };
    },
    end(data) {
      bodySent = data ? data.toString('utf8') : '';
    },
    getHeader(name) { return headersSent[name]; },
    setHeader(name, val) { headersSent[name] = val; },
    get status() { return statusCode; },
    get json() {
      try { return JSON.parse(bodySent); } catch { return bodySent; }
    },
  };

  return { req, res };
}

test('prompt interpolation resolves nested webhook payload variables', () => {
  const task = { id: 'task-webhook', title: 'Webhook Handler', prompt: 'Alert in {webhook.body.alerts[0].name} on host {webhook.headers.x-host} with limit {webhook.query.limit}' };
  const options = {
    webhook: {
      body: { alerts: [{ name: 'db-down', severity: 'critical' }], service: 'postgres' },
      headers: { 'x-host': 'prod-db-1' },
      query: { limit: '10' },
    },
  };

  const context = buildPromptContext(task, options);
  const interpolated = interpolateTaskPrompt(task.prompt, context);
  assert.equal(interpolated, 'Alert in db-down on host prod-db-1 with limit 10');

  // Full body interpolation
  const fullBodyPrompt = 'Payload is: {webhook.body}';
  const fullInterpolated = interpolateTaskPrompt(fullBodyPrompt, context);
  assert.ok(fullInterpolated.includes('"service":"postgres"'));

  // Script environment variable injection
  const scriptTask = { id: 'script-task', type: 'script', script: 'echo hello', env: { FOO: 'bar' } };
  const resolved = resolveTaskForExecution(scriptTask, options);
  assert.equal(resolved.env.FOO, 'bar');
  assert.ok(resolved.env.DSH_CRON_WEBHOOK_BODY.includes('db-down'));
  assert.ok(resolved.env.DSH_CRON_WEBHOOK_HEADERS.includes('prod-db-1'));
});

test('handleTaskWebhookRoute handles 404, 400 and 403 authorization states', async () => {
  const tasks = new Map();
  const store = {
    get(id) { return tasks.get(id); },
    getSettings() { return {}; },
  };
  const scheduler = { triggerManualRun() {} };

  // 1. Missing task -> 404
  {
    const { req, res } = fakeRequestResponse({ url: '/dsh-cron/webhook/missing' });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'missing' });
    assert.equal(res.status, 404);
  }

  // 2. Inactive task -> 400
  tasks.set('paused-task', { id: 'paused-task', status: 'paused', webhookEnabled: true });
  {
    const { req, res } = fakeRequestResponse({ url: '/dsh-cron/webhook/paused-task' });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'paused-task' });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /not active/);
  }

  // 3. Webhook disabled -> 403
  tasks.set('disabled-task', { id: 'disabled-task', status: 'active', webhookEnabled: false });
  {
    const { req, res } = fakeRequestResponse({ url: '/dsh-cron/webhook/disabled-task' });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'disabled-task' });
    assert.equal(res.status, 403);
    assert.match(res.json.error, /not enabled/);
  }

  // 4. No secret or token configured -> fail-closed 403
  tasks.set('unsecured-task', { id: 'unsecured-task', status: 'active', webhookEnabled: true });
  {
    const { req, res } = fakeRequestResponse({ url: '/dsh-cron/webhook/unsecured-task' });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'unsecured-task' });
    assert.equal(res.status, 403);
    assert.match(res.json.error, /security/);
  }
});

test('handleTaskWebhookRoute enforces HMAC SHA-256 signatures', async () => {
  const secret = 'super-secret-hmac-key';
  const task = {
    id: 'hmac-task',
    title: 'GitHub Push Task',
    status: 'active',
    webhookEnabled: true,
    webhookSecret: secret,
  };
  const store = { get() { return task; }, getSettings() { return {}; } };
  let triggeredWith = null;
  const scheduler = {
    triggerManualRun(id, opts) {
      triggeredWith = { id, opts };
      return Promise.resolve({ status: 'running' });
    },
  };

  const payload = { action: 'opened', issue: { number: 42, title: 'Bug report' } };
  const rawPayload = JSON.stringify(payload);
  const correctSig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

  // Wrong signature -> 401
  {
    const { req, res } = fakeRequestResponse({
      url: '/dsh-cron/webhook/hmac-task',
      headers: { 'x-hub-signature-256': 'sha256=wrongsignature' },
      body: payload,
    });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'hmac-task' });
    assert.equal(res.status, 401);
    assert.equal(triggeredWith, null);
  }

  // Correct signature -> 200 and triggers task execution
  {
    const { req, res } = fakeRequestResponse({
      url: '/dsh-cron/webhook/hmac-task',
      headers: { 'x-hub-signature-256': correctSig },
      body: payload,
    });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'hmac-task' });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.triggered, true);
    assert.ok(triggeredWith);
    assert.equal(triggeredWith.id, 'hmac-task');
    assert.equal(triggeredWith.opts.webhook.body.issue.number, 42);
  }
});

test('handleTaskWebhookRoute enforces auth tokens and debouncing', async () => {
  const token = 'task-secret-token-12345';
  const task = {
    id: 'token-task',
    title: 'Debounced Token Task',
    status: 'active',
    webhookEnabled: true,
    webhookToken: token,
    webhookDebounceMs: 500,
  };
  const store = { get() { return task; }, getSettings() { return {}; } };
  let runCount = 0;
  const scheduler = {
    triggerManualRun() {
      runCount++;
      return Promise.resolve({ status: 'success' });
    },
  };

  // Wrong token -> 401
  {
    const { req, res } = fakeRequestResponse({
      url: '/dsh-cron/webhook/token-task',
      headers: { 'x-dsh-cron-webhook-token': 'wrong-token' },
      body: { test: true },
    });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'token-task' });
    assert.equal(res.status, 401);
  }

  // Correct Bearer token -> 200
  {
    const { req, res } = fakeRequestResponse({
      url: '/dsh-cron/webhook/token-task',
      headers: { authorization: `Bearer ${token}` },
      body: { test: true },
    });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'token-task' });
    assert.equal(res.status, 200);
    assert.equal(res.json.triggered, true);
    assert.equal(runCount, 1);
  }

  // Immediate second call within 500ms debounce -> debounced
  {
    const { req, res } = fakeRequestResponse({
      url: '/dsh-cron/webhook/token-task',
      headers: { 'x-dsh-cron-webhook-token': token },
      body: { test: true },
    });
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'token-task' });
    assert.equal(res.status, 200);
    assert.equal(res.json.debounced, true);
    assert.equal(runCount, 1); // Not incremented!
  }
});

test('redactTaskSecrets and restoreTaskSecrets protect webhookToken and webhookSecret', () => {
  const original = {
    id: 'sec-task',
    title: 'Secret Task',
    webhookToken: 'my-super-token',
    webhookSecret: 'my-super-secret',
  };

  const redacted = redactTaskSecrets(original);
  assert.equal(redacted.webhookToken, '[REDACTED]');
  assert.equal(redacted.webhookSecret, '[REDACTED]');

  const incomingUpdate = {
    title: 'Updated Title',
    webhookToken: '[REDACTED]',
    webhookSecret: '[REDACTED]',
  };

  const restored = restoreTaskSecrets(incomingUpdate, original);
  assert.equal(restored.title, 'Updated Title');
  assert.equal(restored.webhookToken, 'my-super-token');
  assert.equal(restored.webhookSecret, 'my-super-secret');
});
