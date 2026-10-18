import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { parseNaturalSchedule } from '../lib/nl-schedule.js';
import { parseScheduleExpression } from '../lib/scheduler.js';
import { handleTaskWebhookRoute, verifyHmacSignature, verifyToken } from '../lib/api-task-webhook.js';
import { buildPromptContext, interpolateTaskPrompt, resolveTaskForExecution } from '../lib/prompt-interpolation.js';
import { TaskStore } from '../lib/store.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Pack 25: 1. Natural Language Schedule Engine parses diverse multi-lingual expressions', () => {
  const cases = [
    { in: 'каждый день в 9:00', pattern: '0 9 * * *' },
    { in: 'every day at 9am', pattern: '0 9 * * *' },
    { in: 'по будням в 18:30', pattern: '30 18 * * 1-5' },
    { in: 'every weekday at 6:30pm', pattern: '30 18 * * 1-5' },
    { in: 'по выходным в 12:00', pattern: '0 12 * * 0,6' },
    { in: 'every weekend at 10am', pattern: '0 10 * * 0,6' },
    { in: 'по понедельникам в 9:00', pattern: '0 9 * * 1' },
    { in: 'каждую пятницу в 18:00', pattern: '0 18 * * 5' },
    { in: 'каждый час', pattern: '0 * * * *' },
    { in: 'в полночь', pattern: '0 0 * * *' },
    { in: 'в полдень', pattern: '0 12 * * *' },
    { in: 'каждые 15 минут', pattern: '*/15 * * * *' },
    { in: 'каждые 2 часа', pattern: '0 */2 * * *' },
    { in: 'каждое 1 число в 9:00', pattern: '0 9 1 * *' },
    { in: 'on the 15th of every month at 10:00', pattern: '0 10 15 * *' },
  ];

  for (const c of cases) {
    const parsed = parseScheduleExpression(c.in);
    assert.equal(parsed.cronPattern, c.pattern, `Failed for input: ${c.in}`);
    assert.ok(parsed.humanText, `Missing humanText for: ${c.in}`);
    assert.ok(parsed.nextRun > 0, `Missing nextRun for: ${c.in}`);
  }
});

test('Pack 25: 2. Webhook variable interpolation handles deep JSON paths and environment variables', () => {
  const task = {
    id: 'wh-interp',
    title: 'Interpolation Task',
    prompt: 'Process alert {{webhook.body.alerts[0].name}} on host {{webhook.headers.x-host}} with param {{webhook.query.limit}}',
    script: 'echo "Handling {webhook.body.service}"',
    command: 'run --target {webhook.body.service}',
    url: 'https://api.internal/deploy?env={webhook.query.env}',
    env: { DEFAULT_ENV: 'prod' },
  };

  const options = {
    webhook: {
      body: {
        alerts: [{ name: 'cpu-spike', value: 98 }],
        service: 'billing-api',
      },
      headers: {
        'x-host': 'prod-worker-9',
      },
      query: {
        limit: '50',
        env: 'staging',
      },
    },
  };

  const resolved = resolveTaskForExecution(task, options);
  assert.equal(resolved.prompt, 'Process alert cpu-spike on host prod-worker-9 with param 50');
  assert.equal(resolved.script, 'echo "Handling billing-api"');
  assert.equal(resolved.command, 'run --target billing-api');
  assert.equal(resolved.url, 'https://api.internal/deploy?env=staging');
  assert.equal(resolved.env.DEFAULT_ENV, 'prod');
  assert.ok(resolved.env.DSH_CRON_WEBHOOK_BODY.includes('billing-api'));
  assert.ok(resolved.env.DSH_CRON_WEBHOOK_HEADERS.includes('prod-worker-9'));
});

test('Pack 25: 3. Webhook route validates tokens, HMAC signatures, and debounce windows', async () => {
  const secret = 'test-hmac-sha256-key';
  const token = 'test-bearer-token-123';

  const task = {
    id: 'sec-wh-task',
    title: 'Secure Webhook Task',
    status: 'active',
    webhookEnabled: true,
    webhookSecret: secret,
    webhookToken: token,
    webhookDebounceMs: 200,
  };

  const store = { get(id) { return id === task.id ? task : null; }, getSettings() { return {}; } };
  let triggeredRuns = 0;
  const scheduler = {
    triggerManualRun() {
      triggeredRuns++;
      return Promise.resolve({ status: 'started' });
    },
  };

  const payload = { ping: 'pong' };
  const rawBody = JSON.stringify(payload);
  const correctSig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Verify HMAC helper directly
  assert.equal(verifyHmacSignature(Buffer.from(rawBody), secret, correctSig), true);
  assert.equal(verifyHmacSignature(Buffer.from(rawBody), secret, 'sha256=invalidsig'), false);

  // Fake HTTP request runner
  async function callWebhook(headers = {}, queryStr = '') {
    let statusCode = 200;
    let responseData = null;
    const req = {
      method: 'POST',
      url: `/dsh-cron/webhook/sec-wh-task${queryStr}`,
      headers,
      on(event, handler) {
        if (event === 'data') handler(Buffer.from(rawBody));
        if (event === 'end') process.nextTick(handler);
        return req;
      },
      destroy() {},
    };
    const res = {
      writeHead(code) { statusCode = code; },
      end(data) { try { responseData = JSON.parse(data); } catch { responseData = data; } },
    };
    await handleTaskWebhookRoute({ store, scheduler, req, res, taskId: 'sec-wh-task' });
    return { status: statusCode, json: responseData };
  }

  // 1. Missing signature/token -> 401
  const r1 = await callWebhook();
  assert.equal(r1.status, 401);

  // 2. Correct HMAC signature -> 200
  const r2 = await callWebhook({ 'x-hub-signature-256': correctSig });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.triggered, true);
  assert.equal(triggeredRuns, 1);

  // 3. Debounce check: second immediate call -> debounced
  const r3 = await callWebhook({ 'x-hub-signature-256': correctSig });
  assert.equal(r3.status, 200);
  assert.equal(r3.json.debounced, true);
  assert.equal(triggeredRuns, 1);
});

test('Pack 25: 4. TaskStore persists and normalizes webhook fields', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-pack25-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));

  const created = store.set({
    title: 'Webhook Integration Job',
    schedule: '0 12 * * *',
    prompt: 'Run daily check',
    webhookEnabled: true,
    webhookToken: 'token-abc',
    webhookSecret: 'secret-xyz',
    webhookDebounceMs: 1500,
  });

  assert.equal(created.webhookEnabled, true);
  assert.equal(created.webhookToken, 'token-abc');
  assert.equal(created.webhookSecret, 'secret-xyz');
  assert.equal(created.webhookDebounceMs, 1500);

  // Reload store from disk
  const reloaded = new TaskStore(path.join(tmpDir, 'tasks.json'));
  const fetched = reloaded.get(created.id);
  assert.equal(fetched.webhookEnabled, true);
  assert.equal(fetched.webhookToken, 'token-abc');
  assert.equal(fetched.webhookSecret, 'secret-xyz');
  assert.equal(fetched.webhookDebounceMs, 1500);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
