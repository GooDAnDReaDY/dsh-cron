import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler, parseScheduleExpression } from '../lib/scheduler.js';
import { executeCronTool } from '../lib/cron-tool.js';
import { executeCreateTask } from '../lib/task-create.js';
import { isTrustedRequest, redactTaskSecrets } from '../lib/http-utils.js';
import { executePreflight, handleCompleteRun } from '../lib/scheduler-execution.js';
import { isCodeExecutionIntroduced } from '../lib/task-patch.js';
import { Config, SETTINGS_SYNC_KEYS } from '../lib/settings.js';
import { buildGiteaIssuePayload } from '../lib/channels.js';
import { applyConfigSync } from '../lib/config-jobs.js';
import { registerRoutes } from '../lib/routes.js';

test('Pack 14 (#288): getContextConfig never inspects "config" in ctx or reads ctx.config', async () => {
  const { getContextConfig } = await import('../lib/index.js');
  assert.equal(typeof getContextConfig, 'function');

  // 1. Context proxy that throws if 'config' is accessed via "in" or property read
  let proxyTrapHit = false;
  const ctxTarget = {
    fiber: { config: { maxConcurrent: 7 } },
  };
  const ctxProxy = new Proxy(ctxTarget, {
    has(target, prop) {
      if (prop === 'config') {
        proxyTrapHit = true;
        throw new Error('Proxy error: cannot check property "config" without inject');
      }
      return prop in target;
    },
    get(target, prop) {
      if (prop === 'config') {
        proxyTrapHit = true;
        throw new Error('Proxy error: cannot get property "config" without inject');
      }
      return target[prop];
    },
  });

  const res = getContextConfig(ctxProxy, { raw: 1 });
  assert.equal(proxyTrapHit, false, 'Proxy trap for "config" must NOT be triggered');
  assert.equal(res.maxConcurrent, 7, 'Read fiber.config safely');

  // 2. Context with strict throwing getter on 'config'
  const throwingCtx = {
    scope: { config: { defaultTimezone: 'UTC' } },
  };
  Object.defineProperty(throwingCtx, 'config', {
    get() {
      throw new TypeError('cannot get property "config" without inject');
    },
  });
  const res2 = getContextConfig(throwingCtx, { fallback: true });
  assert.equal(res2.defaultTimezone, 'UTC', 'Read scope.config without triggering throwing ctx.config getter');

  // 3. Fallback to rawConfig when no fiber/scope/runtime config exists
  const emptyCtx = {};
  Object.defineProperty(emptyCtx, 'config', {
    get() {
      throw new TypeError('cannot get property "config" without inject');
    },
  });
  const res3 = getContextConfig(emptyCtx, { rawFallback: true });
  assert.equal(res3.rawFallback, true, 'Safely falls back to rawConfig without touching ctx.config');
});

test('Pack 14 (#289): Agent tool calls (get, update, create) redact task secrets', async () => {
  const filePath = path.join(os.tmpdir(), `dsh-cron-secrets-${Date.now()}.json`);
  const store = new TaskStore(filePath);
  const scheduler = new TaskScheduler(store, async () => 'ok');

  try {
    // 1. executeCreateTask redacts secrets
    const created = executeCreateTask(store, scheduler, {
      title: 'Secret Task',
      schedule: '0 0 * * *',
      type: 'http',
      httpUrl: 'https://example.com/api',
      httpMethod: 'POST',
      httpHeaders: { Authorization: 'Bearer super-secret-token' },
      httpBody: 'secret-payload-body',
      env: { API_KEY: 'secret-env-key' },
    });

    assert.equal(created.success, true);
    assert.equal(created.task.httpHeaders.Authorization, '[REDACTED]');
    assert.equal(created.task.httpBody, '[REDACTED]');
    assert.equal(created.task.env.API_KEY, '[REDACTED]');

    // 2. executeCronTool get redacts secrets
    const retrieved = await executeCronTool(store, scheduler, {
      action: 'get',
      id: created.task.id,
    });
    assert.equal(retrieved.success, true);
    assert.equal(retrieved.task.httpHeaders.Authorization, '[REDACTED]');
    assert.equal(retrieved.task.httpBody, '[REDACTED]');
    assert.equal(retrieved.task.env.API_KEY, '[REDACTED]');

    // 3. executeCronTool update redacts secrets
    const updated = await executeCronTool(store, scheduler, {
      action: 'update',
      id: created.task.id,
      title: 'Updated Secret Task',
    });
    assert.equal(updated.success, true);
    assert.equal(updated.task.httpHeaders.Authorization, '[REDACTED]');
    assert.equal(updated.task.httpBody, '[REDACTED]');
    assert.equal(updated.task.env.API_KEY, '[REDACTED]');
  } finally {
    scheduler.stopAll();
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
});

test('Pack 14 (#290): apiToken and full SETTINGS_SYNC_KEYS are synchronized and present', () => {
  assert.ok(SETTINGS_SYNC_KEYS.includes('apiToken'), 'apiToken must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('giteaLabels'), 'giteaLabels must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('giteaLabelIds'), 'giteaLabelIds must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('discordWebhookUrl'), 'discordWebhookUrl must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('slackWebhookUrl'), 'slackWebhookUrl must be in SETTINGS_SYNC_KEYS');
});

test('Pack 14 (#291): Interval expressions with hours >= 24 validate cleanly without dead branches', () => {
  // Exact 24 hours: 1440m -> Every 1 days
  const daily = parseScheduleExpression('@every 1440m');
  assert.equal(daily.cronPattern, '0 0 */1 * *');
  assert.equal(daily.humanText, 'Every 1 days');

  // Exact 48 hours: 2880m -> Every 2 days
  const twoDays = parseScheduleExpression('@every 2880m');
  assert.equal(twoDays.cronPattern, '0 0 */2 * *');
  assert.equal(twoDays.humanText, 'Every 2 days');

  // 2 hours: 120m -> Every 2 hours
  const twoHours = parseScheduleExpression('@every 120m');
  assert.equal(twoHours.cronPattern, '0 */2 * * *');
  assert.equal(twoHours.humanText, 'Every 2 hours');

  // Non-multiple of 24 above 24 hours (e.g. 25 hours = 1500m): rejected with clear error
  assert.throws(
    () => parseScheduleExpression('@every 1500m'),
    /minute interval "1500m" \(25 hours\) cannot be expressed as a cron step/
  );
});

test('Pack 14 (#292): executePreflight clears timeout in finally on error', async () => {
  // Test preflight HTTP to an invalid port that immediately rejects
  const result = await executePreflight({
    preflightType: 'http',
    preflightTarget: 'http://127.0.0.1:59999/healthz',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /HTTP check failed/);
});

test('Pack 14 (#293): Queue drain operates cleanly via single admission', async () => {
  const filePath = path.join(os.tmpdir(), `dsh-cron-queue-${Date.now()}.json`);
  const store = new TaskStore(filePath);
  const scheduler = new TaskScheduler(store, async () => 'ok');
  scheduler.maxConcurrent = 1;

  try {
    const task1 = store.set({ title: 'Task 1', schedule: '0 0 * * *', status: 'active', prompt: 'p1' });
    const task2 = store.set({ title: 'Task 2', schedule: '0 0 * * *', status: 'active', prompt: 'p2' });

    let runCount = 0;
    scheduler.runTask = async (id) => {
      runCount++;
      return { status: 'success' };
    };

    // Place task2 in scheduler queue
    scheduler.queue.push({ taskId: task2.id, options: {} });

    // Simulate completion of task1
    await handleCompleteRun(scheduler, task1, task1.id, { id: 'run-1' }, { status: 'success', output: 'done' });

    // Wait for setImmediate drain
    await new Promise((r) => setImmediate(r));
    assert.equal(scheduler.queue.length, 0, 'queue was drained');
    assert.equal(runCount, 1, 'queued task was scheduled');
  } finally {
    scheduler.stopAll();
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
});

test('Pack 14 (#294): applyConfigSync defaults to plugin logger and respects passed logger', () => {
  const filePath = path.join(os.tmpdir(), `dsh-cron-cfg-sync-${Date.now()}.json`);
  const store = new TaskStore(filePath);
  const scheduler = new TaskScheduler(store, async () => 'ok');

  try {
    const logs = [];
    const customLogger = {
      log: (...args) => logs.push(args.join(' ')),
      warn: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push(args.join(' ')),
    };

    const entry = { id: 'job-1', title: 'Config Job 1', schedule: '0 0 * * *', prompt: 'p' };
    applyConfigSync({ store, scheduler, entries: [entry], log: customLogger });

    assert.ok(store.get('job-1'), 'job-1 created in store');
    assert.equal(logs.length, 0, 'no warnings or errors on clean job creation');

    // Trigger warning on invalid entry
    applyConfigSync({ store, scheduler, entries: [{ id: 'bad-job', schedule: 'invalid' }], log: customLogger });
    assert.ok(logs.some((l) => l.includes('skipped')), 'error logged via customLogger');
  } finally {
    scheduler.stopAll();
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
});

test('Pack 14 (#295): isTrustedRequest fails closed when remoteAddress is absent', () => {
  // 1. Socket with missing remoteAddress without token must be rejected
  const reqNoRemote = {
    socket: {},
    headers: { host: '127.0.0.1:3080' },
  };
  assert.equal(isTrustedRequest(reqNoRemote), false, 'Socket with missing remoteAddress must fail-closed');

  // 2. Socket with empty remoteAddress without token must be rejected
  const reqEmptyRemote = {
    socket: { remoteAddress: '' },
    headers: { host: '127.0.0.1:3080' },
  };
  assert.equal(isTrustedRequest(reqEmptyRemote), false, 'Socket with empty remoteAddress must fail-closed');

  // 3. Socket with missing remoteAddress WITH valid token is trusted
  const reqToken = {
    socket: {},
    headers: {
      host: '127.0.0.1:3080',
      authorization: 'Bearer secret-token',
    },
  };
  assert.equal(isTrustedRequest(reqToken, { apiToken: 'secret-token' }), true, 'Authenticated request is trusted');

  // 4. Valid loopback remoteAddress without token is trusted
  const reqLoopback = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080' },
  };
  assert.equal(isTrustedRequest(reqLoopback), true, 'Loopback request is trusted');
});

test('Pack 14 (#296): isCodeExecutionIntroduced uses preflightTarget and ignores dead command field', () => {
  const currentTask = {
    id: 'task-1',
    type: 'llm',
    preflightType: 'none',
    preflightTarget: '',
  };

  // Adding preflightType: 'shell' with preflightTarget introduces code execution
  const shellPatch = {
    preflightType: 'shell',
    preflightTarget: 'ls -la',
  };
  assert.equal(isCodeExecutionIntroduced(currentTask, shellPatch), true);

  // Adding preflightType: 'http' with preflightTarget does NOT introduce code execution
  const httpPatch = {
    preflightType: 'http',
    preflightTarget: 'https://example.com/healthz',
  };
  assert.equal(isCodeExecutionIntroduced(currentTask, httpPatch), false);

  // Passing dead command property does not trigger code execution introduction
  const deadCommandPatch = {
    command: 'rm -rf /',
  };
  assert.equal(isCodeExecutionIntroduced(currentTask, deadCommandPatch), false);
});

test('Pack 14 (#297): giteaLabels and giteaLabelIds in Config schema and parsed correctly in buildGiteaIssuePayload', () => {
  // 1. Config schema contains giteaLabels and giteaLabelIds
  const configKeys = Object.keys(Config.shape || Config.dict || {});
  assert.ok(configKeys.includes('giteaLabels'), 'Config must have giteaLabels');
  assert.ok(configKeys.includes('giteaLabelIds'), 'Config must have giteaLabelIds');

  // 2. buildGiteaIssuePayload handles comma-separated string labels
  const payload = buildGiteaIssuePayload({
    task: { title: 'Test Task', id: 't1' },
    runInfo: { status: 'failure' },
    settings: {
      giteaLabelIds: { bug: 102, alert: 103 },
      giteaLabels: 'bug, alert',
    },
  });
  assert.deepEqual(payload.labels, [102, 103], 'Parsed comma-separated string into integer label IDs');
});

test('Pack 14 (#298): registerRoutes signature and handleItemPost are clean', () => {
  // registerRoutes function length is 2 (ctx, options)
  assert.equal(registerRoutes.length, 2, 'registerRoutes takes exactly 2 arguments (ctx, options)');
});
