import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler, parseScheduleExpression } from '../lib/scheduler.js';
import { Config } from '../lib/settings.js';
import { createCronApiHandler } from '../lib/api.js';
import { applyTaskPatch } from '../lib/task-patch.js';

function createTempStore(t) {
  const tmpPath = path.join(os.tmpdir(), `dsh-cron-pack5-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(tmpPath);
  t.after(() => {
    try { fs.rmSync(tmpPath, { force: true }); } catch (err) {}
  });
  return { store, tmpPath };
}

// ============================================================================
// Issue #213: One-shot >24.85 days timer overflow
// ============================================================================
test('Issue #213: One-shot scheduled >24.85 days in the future does not execute immediately', async (t) => {
  const { store } = createTempStore(t);
  let executed = false;
  const scheduler = new TaskScheduler(store, async () => {
    executed = true;
    return 'ok';
  });
  t.after(() => scheduler.stopAll());

  // 30 days in the future (> 2,147,483,647 ms, which would overflow a signed 32-bit int)
  const targetMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const task = store.set({
    id: 'far-future-oneshot',
    title: 'Far future',
    schedule: new Date(targetMs).toISOString(),
    prompt: 'say hi',
    type: 'llm',
    status: 'active',
  });

  scheduler.scheduleTask(task);

  // Give any immediate timer bug (overflow -> 1ms) a chance to fire
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(executed, false, 'Task scheduled 30 days in the future must not execute immediately');
  assert.equal(scheduler.timers.has('far-future-oneshot'), true, 'Timer must be actively set');
  const stored = store.get('far-future-oneshot');
  assert.equal(stored.status, 'active', 'Task must remain active waiting for its schedule');
});

test('Issue #213: Past one-shot executes immediately', async (t) => {
  const { store } = createTempStore(t);
  let executed = false;
  const scheduler = new TaskScheduler(store, async () => {
    executed = true;
    return 'ok';
  });
  t.after(() => scheduler.stopAll());

  const targetMs = Date.now() - 5000; // 5s in the past
  const task = store.set({
    id: 'past-oneshot',
    title: 'Past oneshot',
    schedule: new Date(targetMs).toISOString(),
    prompt: 'say hi',
    type: 'llm',
    status: 'active',
  });

  scheduler.scheduleTask(task);

  // Wait a moment for execution
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(executed, true, 'Overdue one-shot should execute immediately');
});

// ============================================================================
// Issue #214: Rearming relative one-shot preserves saved deadline
// ============================================================================
test('Issue #214: scheduleTask preserves saved nextRunAt on rearm/restart', (t) => {
  const { store } = createTempStore(t);
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());

  // Task created with in 30m
  const parsed = parseScheduleExpression('in 30m');
  const originalDeadline = parsed.targetTimestamp;

  const task = store.set({
    id: 'relative-task-1',
    title: 'Remind me',
    schedule: 'in 30m',
    prompt: 'ping',
    type: 'llm',
    status: 'active',
    oneShot: true,
    targetTimestamp: originalDeadline,
    nextRunAt: originalDeadline,
  });

  scheduler.scheduleTask(task);
  assert.equal(store.get('relative-task-1').nextRunAt, originalDeadline, 'First schedule sets deadline');

  // Advance time by 5 minutes in perspective (wait slightly)
  // Re-arm task (e.g. server restart)
  scheduler.scheduleTask(store.get('relative-task-1'));

  const afterRestart = store.get('relative-task-1');
  assert.equal(afterRestart.nextRunAt, originalDeadline, 'Restart must not shift the original deadline');
  assert.equal(afterRestart.targetTimestamp, originalDeadline, 'targetTimestamp must remain identical');
});

test('Issue #214: Non-schedule patch (title, prompt) does not shift deadline, schedule edit calculates new one', (t) => {
  const { store } = createTempStore(t);
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());

  const parsed = parseScheduleExpression('in 45m');
  const originalDeadline = parsed.targetTimestamp;

  const task = store.set({
    id: 'relative-patch-task',
    title: 'Original Title',
    schedule: 'in 45m',
    prompt: 'ping',
    type: 'llm',
    status: 'active',
    oneShot: true,
    targetTimestamp: originalDeadline,
    nextRunAt: originalDeadline,
  });

  scheduler.scheduleTask(task);

  // Patch title only
  const patchResult = applyTaskPatch({
    store,
    scheduler,
    id: 'relative-patch-task',
    body: { title: 'Updated Title' },
  });
  assert.equal(patchResult.ok, true);
  assert.equal(store.get('relative-patch-task').nextRunAt, originalDeadline, 'Patching title must not move deadline');

  // Patch schedule explicitly to in 10m
  const editResult = applyTaskPatch({
    store,
    scheduler,
    id: 'relative-patch-task',
    body: { schedule: 'in 10m' },
  });
  assert.equal(editResult.ok, true);
  const newDeadline = store.get('relative-patch-task').nextRunAt;
  assert.notEqual(newDeadline, originalDeadline, 'Explicit schedule change must calculate new deadline');
  assert.ok(Math.abs(newDeadline - (Date.now() + 10 * 60000)) < 2000, 'New deadline is ~10m from now');
});

test('Issue #214: Pause preserves targetTimestamp and Resume re-arms with remaining time', (t) => {
  const { store } = createTempStore(t);
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());

  const parsed = parseScheduleExpression('in 20m');
  const deadline = parsed.targetTimestamp;

  const task = store.set({
    id: 'pause-resume-oneshot',
    title: 'Pause Test',
    schedule: 'in 20m',
    prompt: 'ping',
    type: 'llm',
    status: 'active',
    oneShot: true,
    targetTimestamp: deadline,
    nextRunAt: deadline,
  });

  scheduler.scheduleTask(task);
  assert.equal(scheduler.timers.has('pause-resume-oneshot'), true);

  // Pause
  scheduler.pauseTask('pause-resume-oneshot');
  assert.equal(scheduler.timers.has('pause-resume-oneshot'), false, 'Timer cleared on pause');
  const paused = store.get('pause-resume-oneshot');
  assert.equal(paused.status, 'paused');
  assert.equal(paused.nextRunAt, null, 'nextRunAt is null while paused');
  assert.equal(paused.targetTimestamp, deadline, 'targetTimestamp is preserved across pause');

  // Resume
  scheduler.resumeTask('pause-resume-oneshot');
  const resumed = store.get('pause-resume-oneshot');
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.nextRunAt, deadline, 'nextRunAt restored to original target deadline');
  assert.equal(scheduler.timers.has('pause-resume-oneshot'), true, 'Timer re-armed for remaining time');
});

// ============================================================================
// Issue #234: every 90m interval validation and cron compatibility
// ============================================================================
test('Issue #234: parseScheduleExpression rejects irregular intervals >59m with descriptive error', () => {
  assert.throws(() => parseScheduleExpression('every 90m'), /exceeds 59 minutes and is not a multiple of 60/);
  assert.throws(() => parseScheduleExpression('every 75 minutes'), /exceeds 59 minutes and is not a multiple of 60/);
  assert.throws(() => parseScheduleExpression('every 36h'), /exceeds 23 hours and is not a multiple of 24/);
  assert.throws(() => parseScheduleExpression('every 40d'), /must be between 1 and 31 days/);
});

test('Issue #234: parseScheduleExpression converts clean multiples of 60m into hours and days', () => {
  const p60 = parseScheduleExpression('every 60m');
  assert.equal(p60.cronPattern, '0 */1 * * *');
  assert.equal(p60.humanText, 'Every 1 hours');

  const p120 = parseScheduleExpression('every 120m');
  assert.equal(p120.cronPattern, '0 */2 * * *');
  assert.equal(p120.humanText, 'Every 2 hours');

  const p24h = parseScheduleExpression('every 24h');
  assert.equal(p24h.cronPattern, '0 0 */1 * *');
  assert.equal(p24h.humanText, 'Every 1 days');
});

test('Issue #234: API returns 400 Bad Request on every 90m without saving active task', async (t) => {
  const { store } = createTempStore(t);
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());

  const handler = createCronApiHandler(store, scheduler, {});

  let responseStatus = null;
  let responseData = null;

  const mockRes = {
    setHeader: () => {},
    writeHead: (status) => { responseStatus = status; },
    end: (body) => { responseData = JSON.parse(body); },
  };

  const mockReq = {
    method: 'POST',
    url: '/dsh-cron/tasks',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'content-type': 'application/json',
    },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({
        title: 'Invalid 90m task',
        schedule: 'every 90m',
        prompt: 'test',
        type: 'llm',
      })));
      if (evt === 'end') cb();
    },
  };

  await handler(mockReq, mockRes);

  assert.equal(responseStatus, 400, 'HTTP status must be 400 Bad Request');
  assert.equal(responseData.ok, false);
  assert.match(responseData.error, /exceeds 59 minutes and is not a multiple of 60/);
  assert.equal(store.list().length, 0, 'No active unscheduled task should be saved to store');
});

// ============================================================================
// Issue #236: maxConcurrent safe default is 2
// ============================================================================
test('Issue #236: Config and TaskScheduler default maxConcurrent to 2', () => {
  const resolved = Config(undefined);
  assert.equal(resolved.maxConcurrent, 2, 'Config schema default must be 2');
  assert.equal(Config.dict.maxConcurrent?.meta?.default, 2, 'Config.dict default must be 2');

  const defaultScheduler = new TaskScheduler(null, async () => 'ok');
  assert.equal(defaultScheduler.maxConcurrent, 2, 'TaskScheduler default maxConcurrent must be 2');

  const unlimitedScheduler = new TaskScheduler(null, async () => 'ok', { maxConcurrent: 0 });
  assert.equal(unlimitedScheduler.maxConcurrent, 0, 'Explicit maxConcurrent 0 means unlimited');
});

// ============================================================================
// Issue #239: concurrencyGroup enforcement and pool isolation
// ============================================================================
test('Issue #239: Same concurrencyGroup limits parallel execution (cap 1)', async (t) => {
  const { store } = createTempStore(t);
  let resolveTask1;
  const task1Promise = new Promise((r) => { resolveTask1 = r; });

  const scheduler = new TaskScheduler(store, async (task) => {
    if (task.id === 'task-group-1') {
      await task1Promise;
    }
    return 'done';
  }, { maxConcurrent: 5 }); // Global cap allows 5
  t.after(() => {
    resolveTask1();
    scheduler.stopAll();
  });

  const t1 = store.set({
    id: 'task-group-1',
    title: 'Group A - 1',
    schedule: '0 0 * * *',
    prompt: 'run 1',
    type: 'llm',
    status: 'active',
    concurrencyGroup: 'groupA',
    overlapPolicy: 'skip',
  });

  const t2 = store.set({
    id: 'task-group-2',
    title: 'Group A - 2',
    schedule: '0 0 * * *',
    prompt: 'run 2',
    type: 'llm',
    status: 'active',
    concurrencyGroup: 'groupA',
    overlapPolicy: 'skip',
  });

  // Start task 1
  const run1Promise = scheduler.runTask('task-group-1');
  assert.equal(scheduler.running.has('task-group-1'), true, 'Task 1 should be running');
  assert.equal(scheduler.getRunningGroupCount('groupA'), 1, 'Group A should have 1 active run');

  // Trigger task 2 in the same group -> must be skipped because groupA limit is 1
  await scheduler.runTask('task-group-2');

  assert.equal(scheduler.running.has('task-group-2'), false, 'Task 2 must not start while groupA is busy');
  const t2Runs = store.getHistory('task-group-2');
  assert.equal(t2Runs.length, 1, 'Skip must be recorded in history');
  assert.equal(t2Runs[0].status, 'skipped');
  assert.match(t2Runs[0].output, /concurrency group "groupA" limit reached/);

  // Complete task 1
  resolveTask1();
  await run1Promise;
  assert.equal(scheduler.getRunningGroupCount('groupA'), 0, 'Group A count drops to 0 after finish');
});

test('Issue #239: Different concurrencyGroups run concurrently up to maxConcurrent', async (t) => {
  const { store } = createTempStore(t);
  let resolveAll;
  const blockPromise = new Promise((r) => { resolveAll = r; });

  const scheduler = new TaskScheduler(store, async () => {
    await blockPromise;
    return 'done';
  }, { maxConcurrent: 2 });
  t.after(() => {
    resolveAll();
    scheduler.stopAll();
  });

  store.set({
    id: 'task-ga',
    title: 'Group A',
    schedule: '0 0 * * *',
    prompt: 'ga',
    type: 'llm',
    status: 'active',
    concurrencyGroup: 'groupA',
  });

  store.set({
    id: 'task-gb',
    title: 'Group B',
    schedule: '0 0 * * *',
    prompt: 'gb',
    type: 'llm',
    status: 'active',
    concurrencyGroup: 'groupB',
  });

  // Start both
  const pA = scheduler.runTask('task-ga');
  const pB = scheduler.runTask('task-gb');

  assert.equal(scheduler.running.size, 2, 'Both tasks in different groups run concurrently');
  assert.equal(scheduler.getRunningGroupCount('groupA'), 1);
  assert.equal(scheduler.getRunningGroupCount('groupB'), 1);

  resolveAll();
  await Promise.all([pA, pB]);
  assert.equal(scheduler.running.size, 0);
});

test('Issue #239: Queue overlapPolicy in concurrencyGroup queues and drains when group is free', async (t) => {
  const { store } = createTempStore(t);
  let resolveTask1;
  const task1Promise = new Promise((r) => { resolveTask1 = r; });

  let task2Executed = false;
  const scheduler = new TaskScheduler(store, async (task) => {
    if (task.id === 'task-q1') {
      await task1Promise;
    }
    if (task.id === 'task-q2') {
      task2Executed = true;
    }
    return 'done';
  }, { maxConcurrent: 5 });
  t.after(() => {
    resolveTask1();
    scheduler.stopAll();
  });

  store.set({
    id: 'task-q1',
    title: 'Queued test 1',
    schedule: '0 0 * * *',
    prompt: 'q1',
    type: 'llm',
    status: 'active',
    concurrencyGroup: 'deployGroup',
    overlapPolicy: 'queue',
  });

  store.set({
    id: 'task-q2',
    title: 'Queued test 2',
    schedule: '0 0 * * *',
    prompt: 'q2',
    type: 'llm',
    status: 'active',
    concurrencyGroup: 'deployGroup',
    overlapPolicy: 'queue',
  });

  const p1 = scheduler.runTask('task-q1');
  assert.equal(scheduler.running.has('task-q1'), true);

  // Trigger task-q2 while deployGroup is occupied
  await scheduler.runTask('task-q2');
  assert.equal(scheduler.queue.length, 1, 'Task 2 should be in concurrency queue');
  assert.equal(scheduler.queue[0].taskId, 'task-q2');

  // Finish task 1
  resolveTask1();
  await p1;

  // Give event loop tick for setImmediate drain
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(task2Executed, true, 'Task 2 should be admitted and executed once deployGroup was freed');
  assert.equal(scheduler.queue.length, 0, 'Queue should be empty');
});
