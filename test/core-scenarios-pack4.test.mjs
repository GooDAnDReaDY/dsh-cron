import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { TaskStore } from '../lib/store.js';
import { createCronApiHandler } from '../lib/api.js';
import { createExternalApiHandler } from '../lib/external-api.js';
import { executeCreateTask } from '../lib/task-create.js';
import { cronToolParameters } from '../lib/cron-tool.js';
import { isFailed, isFailureStatus, shouldSendToChannel } from '../lib/channels.js';
import { shouldNotifyTask } from '../lib/telegram.js';
import { shouldCreateKanbanCard } from '../lib/integrations.js';
import { executePreflight } from '../lib/scheduler-execution.js';
import { isCodeExecutingTask } from '../lib/task-transfer.js';

function createMockScheduler(store) {
  return {
    store,
    isRunning: () => false,
    runningSince: () => null,
    scheduleTask: () => {},
    pauseTask: () => {},
    resumeTask: () => {},
    removeTask: () => {},
    triggerManualRun: async () => {},
  };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, h = {}) { this.statusCode = code; Object.assign(this.headers, h); },
    end(data) { if (data) this.body += data; },
  };
}

function mockReq({ method = 'GET', url = '/', headers = {}, body = null, remoteAddress = '127.0.0.1' } = {}) {
  const req = new Readable({
    read() {
      if (body) {
        this.push(typeof body === 'string' ? body : JSON.stringify(body));
      }
      this.push(null);
    }
  });
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1', ...headers };
  req.socket = { remoteAddress };
  return req;
}

function makeTempFile(prefix) {
  return join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('Issue #209: HTTP POST task creation and editing preserves all 13 reliability & session fields', async () => {
  const filePath = makeTempFile('dsh-cron-pack4-209');
  try {
    const store = new TaskStore(filePath);
    const scheduler = createMockScheduler(store);
    const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

    const createPayload = {
      title: 'Persistent Session Task',
      schedule: '0 12 * * *',
      prompt: 'Execute data sync',
      type: 'llm',
      agentPreset: 'dev-preset',
      targetSessionId: 'sess_prod_123',
      targetSessionReset: 'weekly',
      onSuccess: 'task_succ_456',
      onFailure: 'task_fail_789',
      heartbeatIntervalSeconds: 120,
      gracePeriodSeconds: 60,
      preflightType: 'http',
      preflightTarget: 'https://127.0.0.1:8080/health',
      priority: 2,
      concurrencyGroup: 'sync-group',
      selfHealingCommand: 'echo healed',
      autoDiagnose: true,
    };

    // 1. Create task via HTTP POST to /dsh-cron/tasks
    const reqCreate = mockReq({
      method: 'POST',
      url: '/dsh-cron/tasks',
      headers: {
        'content-type': 'application/json',
        'x-dsh-cron-confirm': 'script', // confirmed for selfHealingCommand
      },
      body: createPayload,
    });
    const resCreate = mockRes();
    await handler(reqCreate, resCreate);

    assert.equal(resCreate.statusCode, 200, 'Creation should succeed: ' + resCreate.body);
    const created = JSON.parse(resCreate.body);
    assert.equal(created.ok, true);
    const taskId = created.task.id;

    // Verify all 13 fields on created task
    assert.equal(created.task.agentPreset, 'dev-preset');
    assert.equal(created.task.targetSessionId, 'sess_prod_123');
    assert.equal(created.task.targetSessionReset, 'weekly');
    assert.equal(created.task.onSuccess, 'task_succ_456');
    assert.equal(created.task.onFailure, 'task_fail_789');
    assert.equal(created.task.heartbeatIntervalSeconds, 120);
    assert.equal(created.task.gracePeriodSeconds, 60);
    assert.equal(created.task.preflightType, 'http');
    assert.equal(created.task.preflightTarget, 'https://127.0.0.1:8080/health');
    assert.equal(created.task.priority, 2);
    assert.equal(created.task.concurrencyGroup, 'sync-group');
    assert.equal(created.task.selfHealingCommand, 'echo healed');
    assert.equal(created.task.autoDiagnose, true);

    // 2. Edit task via HTTP POST (update mode with body.id)
    const updatePayload = {
      ...createPayload,
      id: taskId,
      agentPreset: 'updated-preset',
      priority: 1,
      targetSessionReset: 'daily',
    };
    const reqUpdate = mockReq({
      method: 'POST',
      url: '/dsh-cron/tasks',
      headers: {
        'content-type': 'application/json',
        'x-dsh-cron-confirm': 'script',
      },
      body: updatePayload,
    });
    const resUpdate = mockRes();
    await handler(reqUpdate, resUpdate);

    assert.equal(resUpdate.statusCode, 200);
    const updated = JSON.parse(resUpdate.body);
    assert.equal(updated.task.agentPreset, 'updated-preset');
    assert.equal(updated.task.priority, 1);
    assert.equal(updated.task.targetSessionReset, 'daily');

    // 3. Reload from disk and verify persistence
    const reloadedStore = new TaskStore(filePath);
    const stored = reloadedStore.get(taskId);
    assert.equal(stored.agentPreset, 'updated-preset');
    assert.equal(stored.targetSessionId, 'sess_prod_123');
    assert.equal(stored.targetSessionReset, 'daily');
    assert.equal(stored.onSuccess, 'task_succ_456');
    assert.equal(stored.onFailure, 'task_fail_789');
    assert.equal(stored.heartbeatIntervalSeconds, 120);
    assert.equal(stored.gracePeriodSeconds, 60);
    assert.equal(stored.preflightType, 'http');
    assert.equal(stored.preflightTarget, 'https://127.0.0.1:8080/health');
    assert.equal(stored.priority, 1);
    assert.equal(stored.concurrencyGroup, 'sync-group');
    assert.equal(stored.selfHealingCommand, 'echo healed');
    assert.equal(stored.autoDiagnose, true);
  } finally {
    try { rmSync(filePath, { force: true }); } catch {}
  }
});

test('Issue #210: executeCreateTask and cronToolParameters record fallback, silent rule, and advanced fields', () => {
  const filePath = makeTempFile('dsh-cron-pack4-210');
  try {
    const store = new TaskStore(filePath);
    const scheduler = createMockScheduler(store);

    const taskArgs = {
      title: 'Tool Created Task',
      schedule: '0 8 * * *',
      prompt: 'Summarize news',
      type: 'llm',
      fallbackModel: 'deepseek-chat',
      fallbackProvider: 'deepseek',
      silentRule: 'Do not speak if no news',
      inspectOnFailure: true,
      agentPreset: 'analyst',
      targetSessionId: 'analyst_sess',
      targetSessionReset: 'daily',
      onSuccess: 'succ_task',
      onFailure: 'fail_task',
      heartbeatIntervalSeconds: 60,
      gracePeriodSeconds: 30,
      preflightType: 'shell',
      preflightTarget: 'test -f /tmp/lock',
      concurrencyGroup: 'news-group',
      priority: 3,
      selfHealingCommand: 'touch /tmp/lock',
      autoDiagnose: true,
    };

    const result = executeCreateTask(store, scheduler, taskArgs);
    assert.equal(result.success, true);
    const created = store.get(result.task.id);

    assert.equal(created.fallbackModel, 'deepseek-chat');
    assert.equal(created.fallbackProvider, 'deepseek');
    assert.equal(created.silentRule, 'Do not speak if no news');
    assert.equal(created.inspectOnFailure, true);
    assert.equal(created.agentPreset, 'analyst');
    assert.equal(created.targetSessionId, 'analyst_sess');
    assert.equal(created.targetSessionReset, 'daily');
    assert.equal(created.onSuccess, 'succ_task');
    assert.equal(created.onFailure, 'fail_task');
    assert.equal(created.heartbeatIntervalSeconds, 60);
    assert.equal(created.gracePeriodSeconds, 30);
    assert.equal(created.preflightType, 'shell');
    assert.equal(created.preflightTarget, 'test -f /tmp/lock');
    assert.equal(created.concurrencyGroup, 'news-group');
    assert.equal(created.priority, 3);
    assert.equal(created.selfHealingCommand, 'touch /tmp/lock');
    assert.equal(created.autoDiagnose, true);

    // Verify parameter definitions in schema
    assert.ok(cronToolParameters.fallbackModel, 'cronToolParameters.fallbackModel missing');
    assert.ok(cronToolParameters.fallbackProvider, 'cronToolParameters.fallbackProvider missing');
    assert.ok(cronToolParameters.silentRule, 'cronToolParameters.silentRule missing');
    assert.ok(cronToolParameters.inspectOnFailure, 'cronToolParameters.inspectOnFailure missing');
    assert.ok(cronToolParameters.agentPreset, 'cronToolParameters.agentPreset missing');
    assert.ok(cronToolParameters.targetSessionId, 'cronToolParameters.targetSessionId missing');
    assert.ok(cronToolParameters.targetSessionReset, 'cronToolParameters.targetSessionReset missing');
    assert.ok(cronToolParameters.onSuccess, 'cronToolParameters.onSuccess missing');
    assert.ok(cronToolParameters.onFailure, 'cronToolParameters.onFailure missing');
    assert.ok(cronToolParameters.heartbeatIntervalSeconds, 'cronToolParameters.heartbeatIntervalSeconds missing');
    assert.ok(cronToolParameters.gracePeriodSeconds, 'cronToolParameters.gracePeriodSeconds missing');
    assert.ok(cronToolParameters.preflightType, 'cronToolParameters.preflightType missing');
    assert.ok(cronToolParameters.preflightTarget, 'cronToolParameters.preflightTarget missing');
    assert.ok(cronToolParameters.concurrencyGroup, 'cronToolParameters.concurrencyGroup missing');
    assert.ok(cronToolParameters.priority, 'cronToolParameters.priority missing');
    assert.ok(cronToolParameters.selfHealingCommand, 'cronToolParameters.selfHealingCommand missing');
    assert.ok(cronToolParameters.autoDiagnose, 'cronToolParameters.autoDiagnose missing');
  } finally {
    try { rmSync(filePath, { force: true }); } catch {}
  }
});

test('Issue #211: External API allows create and schedule preview with valid Bearer token from remote IP', async () => {
  const filePath = makeTempFile('dsh-cron-pack4-211');
  try {
    const store = new TaskStore(filePath);
    const scheduler = createMockScheduler(store);
    const validToken = 'secret-external-token-xyz';
    const extHandler = createExternalApiHandler({
      store,
      scheduler,
      getToken: () => validToken,
    });

    // 1. External create from non-loopback IP (203.0.113.50) with valid Bearer token
    const reqCreate = mockReq({
      method: 'POST',
      url: '/dsh-cron/api/tasks',
      headers: {
        authorization: 'Bearer ' + validToken,
        'content-type': 'application/json',
      },
      remoteAddress: '203.0.113.50',
      body: {
        title: 'Remote External Task',
        schedule: '0 0 * * *',
        prompt: 'Run maintenance',
        type: 'llm',
      },
    });
    const resCreate = mockRes();
    await extHandler(reqCreate, resCreate);

    assert.equal(resCreate.statusCode, 200, 'Remote create should succeed with valid token: ' + resCreate.body);
    const created = JSON.parse(resCreate.body);
    assert.equal(created.ok, true);
    assert.ok(created.task.id);

    // 2. External schedule preview from non-loopback IP with valid Bearer token
    const reqPreview = mockReq({
      method: 'POST',
      url: '/dsh-cron/api/schedule/preview',
      headers: {
        authorization: 'Bearer ' + validToken,
        'content-type': 'application/json',
      },
      remoteAddress: '203.0.113.50',
      body: {
        schedule: 'every 2h',
        count: 3,
      },
    });
    const resPreview = mockRes();
    await extHandler(reqPreview, resPreview);

    assert.equal(resPreview.statusCode, 200, 'Remote preview should succeed: ' + resPreview.body);
    const preview = JSON.parse(resPreview.body);
    assert.equal(preview.ok, true);
    assert.equal(preview.runs.length, 3);

    // 3. Unauthorized request (invalid token) from remote IP is rejected with 401
    const reqBad = mockReq({
      method: 'POST',
      url: '/dsh-cron/api/tasks',
      headers: {
        authorization: 'Bearer wrong-token',
        'content-type': 'application/json',
      },
      remoteAddress: '203.0.113.50',
      body: { title: 'T', schedule: '0 0 * * *', prompt: 'P' },
    });
    const resBad = mockRes();
    await extHandler(reqBad, resBad);
    assert.equal(resBad.statusCode, 401);
  } finally {
    try { rmSync(filePath, { force: true }); } catch {}
  }
});

test('Issue #232: onlyOnFailure mode correctly alerts on missed heartbeats across all channels', () => {
  const missedRun = {
    status: 'missed',
    error: 'Heartbeat deadline exceeded',
    at: Date.now(),
    durationMs: 0,
    output: 'Heartbeat missed',
  };

  assert.equal(isFailureStatus('missed'), true, 'missed is a failure status');
  assert.equal(isFailed('missed'), true, 'isFailed includes missed');

  // Telegram notification check
  const taskTelegram = { notifyTelegram: true, onlyOnFailure: true };
  assert.equal(shouldNotifyTask(taskTelegram, missedRun, {}), true, 'Telegram must notify on missed heartbeat when onlyOnFailure=true');

  // Channels notification check
  const taskChannels = { channels: ['discord', 'slack'], onlyOnFailure: true };
  assert.equal(shouldSendToChannel('discord', taskChannels, missedRun, {}), true, 'Discord must deliver missed heartbeat when onlyOnFailure=true');
  assert.equal(shouldSendToChannel('slack', taskChannels, missedRun, {}), true, 'Slack must deliver missed heartbeat when onlyOnFailure=true');

  // Kanban card check
  const taskKanban = { kanbanMode: 'on_failure' };
  assert.equal(shouldCreateKanbanCard(taskKanban, missedRun), true, 'Kanban card must be created on missed heartbeat when kanbanMode=on_failure');

  // Successful run check (does not alert when onlyOnFailure)
  const successRun = { status: 'success', output: 'ok' };
  assert.equal(shouldNotifyTask(taskTelegram, successRun, {}), false);
  assert.equal(shouldSendToChannel('discord', taskChannels, successRun, {}), false);
  assert.equal(shouldCreateKanbanCard(taskKanban, successRun), false);
});

test('Issue #238: Preflight checks shell, command, disk formats fail-closed and blocks execution', async () => {
  // 1. Shell false blocks
  const taskShellFail = { preflightType: 'shell', preflightTarget: 'exit 1' };
  const resShellFail = await executePreflight(taskShellFail);
  assert.equal(resShellFail.ok, false);
  assert.match(resShellFail.reason, /Preflight command failed/);

  // 2. Shell true passes
  const taskShellPass = { preflightType: 'shell', preflightTarget: 'exit 0' };
  const resShellPass = await executePreflight(taskShellPass);
  assert.equal(resShellPass.ok, true);

  // 3. Command type also works identically
  const taskCmdFail = { preflightType: 'command', preflightTarget: 'false' };
  const resCmdFail = await executePreflight(taskCmdFail);
  assert.equal(resCmdFail.ok, false);

  // 4. Invalid preflight type is rejected fail-closed
  const taskInvalidType = { preflightType: 'magic_wand', preflightTarget: 'abc' };
  const resInvalidType = await executePreflight(taskInvalidType);
  assert.equal(resInvalidType.ok, false);
  assert.match(resInvalidType.reason, /Unknown preflight type/);

  // 5. Missing target is rejected fail-closed
  const taskMissingTarget = { preflightType: 'shell', preflightTarget: '' };
  const resMissingTarget = await executePreflight(taskMissingTarget);
  assert.equal(resMissingTarget.ok, false);
  assert.match(resMissingTarget.reason, /Preflight target is required/);

  // 6. Disk space check: path:minPercent format on current directory
  const currentDir = process.cwd();
  const taskDiskPercentPass = { preflightType: 'disk', preflightTarget: currentDir + ':0.001%' };
  const resDiskPercentPass = await executePreflight(taskDiskPercentPass);
  assert.equal(resDiskPercentPass.ok, true);

  const taskDiskPercentFail = { preflightType: 'disk', preflightTarget: currentDir + ':100%' };
  const resDiskPercentFail = await executePreflight(taskDiskPercentFail);
  assert.equal(resDiskPercentFail.ok, false);
  assert.match(resDiskPercentFail.reason, /below required 100%/);

  // 7. Disk space check: nonexistent filesystem fails closed
  const taskDiskMissing = { preflightType: 'disk', preflightTarget: '/nonexistent_mount_xyz_123:10%' };
  const resDiskMissing = await executePreflight(taskDiskMissing);
  assert.equal(resDiskMissing.ok, false);
  assert.match(resDiskMissing.reason, /Preflight disk check failed/);

  // 8. Security verification: shell preflight is recognized as code-executing task
  assert.equal(isCodeExecutingTask({ preflightType: 'shell' }), true);
  assert.equal(isCodeExecutingTask({ preflightType: 'command' }), true);
  assert.equal(isCodeExecutingTask({ preflightType: 'http' }), false);
});
