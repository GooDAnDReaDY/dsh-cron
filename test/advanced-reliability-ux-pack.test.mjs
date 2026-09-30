import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler, previewSchedule, executePreflight } from '../lib/scheduler.js';
import { handleHeartbeatPing, handleSchedulePreview, handleDryRunTask } from '../lib/api.js';

function createTempStore() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-139-'));
  const filePath = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(filePath);
  return { store, tmpDir };
}

test('1. Heartbeat monitoring: recording pings and detecting missed deadlines', async () => {
  const { store, tmpDir } = createTempStore();
  try {
    const task = store.set({
      id: 'cron_heartbeat_1',
      title: 'Database Backup Snitch',
      schedule: '0 0 * * *',
      prompt: 'noop',
      status: 'active',
      heartbeatIntervalSeconds: 3600,
      gracePeriodSeconds: 300,
    });

    // 1.1 Record heartbeat via store method
    const pingResult = store.recordHeartbeat('cron_heartbeat_1');
    assert.ok(pingResult);
    assert.equal(pingResult.ok, true);
    assert.ok(pingResult.lastPingAt > 0);
    assert.ok(pingResult.nextDeadline > pingResult.lastPingAt);

    // 1.2 Handle heartbeat via API handler
    let statusCode = 0;
    let resBody = null;
    const res = {
      writeHead: (code) => { statusCode = code; },
      end: (data) => { resBody = JSON.parse(data || '{}'); },
    };
    handleHeartbeatPing({ store, req: { method: 'POST' }, res, taskId: 'cron_heartbeat_1' });
    assert.equal(statusCode, 200);
    assert.equal(resBody.ok, true);
    assert.equal(resBody.taskId, 'cron_heartbeat_1');

    // 1.3 Heartbeat missed detection and notification in scheduler
    let notificationDelivered = false;
    let failureTriggered = false;

    const recoveryTask = store.set({
      id: 'cron_recovery_1',
      title: 'Alert Recovery',
      schedule: '0 0 * * *',
      prompt: 'alert',
      status: 'active',
    });

    const monitoredTask = store.set({
      id: 'cron_hb_fail',
      title: 'Failing Snitch',
      schedule: '0 0 * * *',
      prompt: 'noop',
      status: 'active',
      heartbeatIntervalSeconds: 60,
      gracePeriodSeconds: 30,
      lastPingAt: Date.now() - 100000, // 100s ago, deadline was 90s ago
      heartbeatAlerted: false,
      onFailure: 'cron_recovery_1',
    });

    const scheduler = new TaskScheduler(store, async () => ({ output: 'ok' }), {
      deliver: async () => { notificationDelivered = true; }
    });

    scheduler.runNow = async (id) => {
      if (id === 'cron_recovery_1') failureTriggered = true;
    };

    await scheduler.checkHeartbeats();

    const updatedTask = store.get('cron_hb_fail');
    assert.equal(updatedTask.heartbeatAlerted, true, 'heartbeatAlerted should be true');
    assert.equal(updatedTask.lastStatus, 'missed', 'lastStatus should be missed');
    assert.equal(notificationDelivered, true, 'deliverNotification should have been called');
    assert.equal(failureTriggered, true, 'onFailure recovery task should have been triggered');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('2. Pre-flight checks: HTTP, command and disk space gates', async () => {
  // 2.1 HTTP preflight
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (url.includes('health-ok')) return { ok: true, status: 200 };
      return { ok: false, status: 503 };
    };

    const passTask = { preflightType: 'http', preflightTarget: 'https://service.test/health-ok' };
    const passResult = await executePreflight(passTask);
    assert.equal(passResult.ok, true);

    const failTask = { preflightType: 'http', preflightTarget: 'https://service.test/health-down' };
    const failResult = await executePreflight(failTask);
    assert.equal(failResult.ok, false);
    assert.match(failResult.reason, /HTTP check returned status 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 2.2 Command preflight
  const passCmd = { preflightType: 'command', preflightTarget: 'node -e "process.exit(0)"' };
  const passCmdRes = await executePreflight(passCmd);
  assert.equal(passCmdRes.ok, true);

  const failCmd = { preflightType: 'command', preflightTarget: 'node -e "process.stderr.write(\'disk full\'); process.exit(1)"' };
  const failCmdRes = await executePreflight(failCmd);
  assert.equal(failCmdRes.ok, false);
  assert.match(failCmdRes.reason, /Preflight command failed/);

  // 2.3 Scheduler skips execution when preflight fails
  const { store, tmpDir } = createTempStore();
  try {
    const task = store.set({
      id: 'cron_preflight_task',
      title: 'Preflight Task',
      schedule: '0 0 * * *',
      prompt: 'echo hello',
      status: 'active',
      preflightType: 'command',
      preflightTarget: 'node -e "process.exit(2)"',
    });

    let executed = false;
    const scheduler = new TaskScheduler(store, async () => {
      executed = true;
      return { output: 'ran' };
    });

    await scheduler.runTask('cron_preflight_task');
    assert.equal(executed, false, 'task body should NOT execute when preflight fails');
    const updated = store.get('cron_preflight_task');
    assert.equal(updated.lastStatus, 'skipped');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3. Dry-Run execution: runs without recording history or sending notifications', async () => {
  const { store, tmpDir } = createTempStore();
  try {
    const task = store.set({
      id: 'cron_dryrun_test',
      title: 'Dry Run Task',
      schedule: '0 0 * * *',
      prompt: 'echo dry run test',
      status: 'active',
    });

    let deliverCalled = false;
    const scheduler = new TaskScheduler(store, async (t) => {
      return { output: 'computed result: 42', usage: { inputTokens: 10, outputTokens: 5 } };
    }, {
      deliver: async () => { deliverCalled = true; }
    });

    const result = await scheduler.runTask('cron_dryrun_test', { dryRun: true });
    assert.ok(result);
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.output, 'computed result: 42');
    assert.equal(deliverCalled, false, 'deliver should NOT be called in dry run');

    // History and task lastRunAt in store must be untouched
    const fresh = store.get('cron_dryrun_test');
    assert.equal(fresh.lastRunAt, null, 'store lastRunAt must stay null');
    const history = store.getHistory('cron_dryrun_test');
    assert.equal(history.length, 0, 'history must remain empty');

    // API endpoint dry-run test
    let resCode = 0;
    let resData = null;
    const res = {
      writeHead: (code) => { resCode = code; },
      end: (data) => { resData = JSON.parse(data || '{}'); },
    };
    await handleDryRunTask({ store, scheduler, req: { method: 'POST' }, res, id: 'cron_dryrun_test' });
    assert.equal(resCode, 200);
    assert.equal(resData.dryRun, true);
    assert.equal(resData.output, 'computed result: 42');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('4. Schedule simulator (previewSchedule) calculates next execution runs', () => {
  // Recurring cron
  const preview = previewSchedule('0 9 * * 1-5', { count: 3 });
  assert.equal(preview.isOneShot, false);
  assert.equal(preview.runs.length, 3);
  for (const dateStr of preview.runs) {
    const d = new Date(dateStr);
    assert.equal(isNaN(d.getTime()), false);
  }

  // One-shot
  const oneShotPreview = previewSchedule('at: 2028-01-01T12:00:00Z');
  assert.equal(oneShotPreview.isOneShot, true);
  assert.equal(oneShotPreview.runs.length, 1);
  assert.equal(new Date(oneShotPreview.runs[0]).toISOString(), '2028-01-01T12:00:00.000Z');
});

test('5. Priority Queueing respects priority order when concurrency limit is reached', async () => {
  const { store, tmpDir } = createTempStore();
  try {
    store.set({ id: 't_slow', title: 'Slow Task', schedule: '0 0 * * *', status: 'active', overlapPolicy: 'queue' });
    store.set({ id: 't_low_prio', title: 'Low Prio Task', schedule: '0 0 * * *', status: 'active', priority: 10, overlapPolicy: 'queue' });
    store.set({ id: 't_high_prio', title: 'High Prio Task', schedule: '0 0 * * *', status: 'active', priority: 1, overlapPolicy: 'queue' });

    let resolveSlow;
    const slowPromise = new Promise((r) => { resolveSlow = r; });

    const executionOrder = [];
    const scheduler = new TaskScheduler(store, async (t) => {
      executionOrder.push(t.id);
      if (t.id === 't_slow') {
        await slowPromise;
      }
      return { output: 'done ' + t.id };
    }, { maxConcurrent: 1 });

    // Start slow task to occupy slot
    const run1 = scheduler.runTask('t_slow');

    // Attempt to run low priority task (should be queued)
    scheduler.runTask('t_low_prio');

    // Attempt to run high priority task (should be queued ahead of low priority)
    scheduler.runTask('t_high_prio');

    assert.equal(scheduler.queue.length, 2);
    assert.equal(scheduler.queue[0].taskId, 't_high_prio', 'High priority task must be at the front of the queue');
    assert.equal(scheduler.queue[1].taskId, 't_low_prio', 'Low priority task must be second');

    // Release slow task
    resolveSlow();
    await run1;

    // Allow queue drainage
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(executionOrder[0], 't_slow');
    assert.equal(executionOrder[1], 't_high_prio', 'High priority must execute before low priority');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('6. Self-Healing Runbook executes command upon task failure', async () => {
  const { store, tmpDir } = createTempStore();
  try {
    const task = store.set({
      id: 'cron_healing_task',
      title: 'Faulty Service Task',
      schedule: '0 0 * * *',
      prompt: 'fail',
      status: 'active',
      selfHealingCommand: 'node -e "console.log(\\\"HEALED_OK\\\")"',
    });

    const scheduler = new TaskScheduler(store, async () => {
      throw new Error('Connection refused to backend database');
    });

    await scheduler.runTask('cron_healing_task');

    const history = store.getHistory('cron_healing_task');
    assert.equal(history.length, 1);
    const lastRun = history[0];
    assert.equal(lastRun.status, 'error');
    assert.ok(lastRun.selfHealing, 'selfHealing field should be recorded');
    assert.equal(lastRun.selfHealing.success, true);
    assert.match(lastRun.selfHealing.output, /HEALED_OK/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
