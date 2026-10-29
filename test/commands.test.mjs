import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCronCommand, registerCommands, formatTaskList, formatSchedulerStatus } from '../lib/commands.js';

test('formatTaskList handles empty and populated task lists', () => {
  assert.match(formatTaskList([]), /No scheduled tasks/);

  const formatted = formatTaskList([
    { id: 'task-1', title: 'Daily Backup', schedule: '0 0 * * *', paused: false, nextRunAt: Date.now() + 3600000, type: 'node' },
    { id: 'task-2', title: 'Health Check', schedule: 'every 5m', paused: true, type: 'http' },
  ]);
  assert.match(formatted, /Cron Tasks \(2 total\)/);
  assert.match(formatted, /\[ACTIVE\] task-1 · "Daily Backup"/);
  assert.match(formatted, /\[PAUSED\] task-2 · "Health Check"/);
});

test('formatSchedulerStatus reports active count, queue depth, and 24h spend', () => {
  const mockStore = {
    list: () => [
      { id: 't1', title: 'T1', paused: false },
      { id: 't2', title: 'T2', paused: true },
    ],
    getSettings: () => ({ globalDailyCostLimitUsd: 10 }),
    history: new Map([
      ['t1', [{ at: Date.now() - 1000, costUsd: 0.05, tokens: 1200 }]],
    ]),
  };

  const mockScheduler = {
    runningCount: () => 1,
    running: new Map([['t1', { startedAt: Date.now() - 5000 }]]),
    queue: ['t2'],
    maxConcurrent: 3,
    defaultTimezone: 'UTC',
  };

  const status = formatSchedulerStatus(mockStore, mockScheduler);
  assert.match(status, /=== Cron Scheduler Status ===/);
  assert.match(status, /Active Tasks:\s+1 \(Paused: 1, Total: 2\)/);
  assert.match(status, /Currently Running:\s+1 \/ 3 max concurrent/);
  assert.match(status, /Queue Depth:\s+1/);
  assert.match(status, /24h Expenditure:\s+\$0\.0500 \/ \$10\.00/);
  assert.match(status, /Timezone:\s+UTC/);
});

test('executeCronCommand handles list, status, run, pause, resume, help', async () => {
  let manualTriggered = null;
  let pausedId = null;
  let resumedId = null;

  const mockStore = {
    tasks: new Map([
      ['task-abc', { id: 'task-abc', title: 'Scraper', schedule: '0 * * * *', paused: false }],
    ]),
    list: () => Array.from(mockStore.tasks.values()),
    get: (id) => mockStore.tasks.get(id),
    getSettings: () => ({}),
  };

  const mockScheduler = {
    runningCount: () => 0,
    queue: [],
    maxConcurrent: 2,
    triggerManualRun: (id) => { manualTriggered = id; },
    pauseTask: (id) => { pausedId = id; },
    resumeTask: (id) => { resumedId = id; },
  };

  // 1. list
  const listRes = await executeCronCommand(mockStore, mockScheduler, 'list');
  assert.match(listRes, /task-abc/);

  // 2. status
  const statRes = await executeCronCommand(mockStore, mockScheduler, 'status');
  assert.match(statRes, /Cron Scheduler Status/);

  // 3. run
  const runNoId = await executeCronCommand(mockStore, mockScheduler, 'run');
  assert.match(runNoId, /Error: Task ID is required/);

  const runNotFound = await executeCronCommand(mockStore, mockScheduler, 'run nonexistent');
  assert.match(runNotFound, /Error: Task "nonexistent" not found/);

  const runOk = await executeCronCommand(mockStore, mockScheduler, 'run task-abc');
  assert.match(runOk, /Triggered manual execution for task "Scraper" \(task-abc\)/);
  assert.equal(manualTriggered, 'task-abc');

  // 4. pause
  const pauseOk = await executeCronCommand(mockStore, mockScheduler, 'pause task-abc');
  assert.match(pauseOk, /Task "Scraper" \(task-abc\) is now paused/);
  assert.equal(pausedId, 'task-abc');

  // 5. resume
  const resumeOk = await executeCronCommand(mockStore, mockScheduler, 'resume task-abc');
  assert.match(resumeOk, /Task "Scraper" \(task-abc\) has been resumed/);
  assert.equal(resumedId, 'task-abc');

  // 6. help
  const helpRes = await executeCronCommand(mockStore, mockScheduler, 'unknown');
  assert.match(helpRes, /Cron Automation Commands:/);
});

test('registerCommands registers /cron command through ctx.inject', async () => {
  let registeredDef = null;
  let disposed = false;
  let effectCleanup = null;

  const mockService = {
    register: (def) => {
      registeredDef = def;
      return () => { disposed = true; };
    },
  };

  const mockCtx = {
    inject: (deps, cb) => {
      assert.deepEqual(deps, ['commands']);
      cb({ commands: mockService });
    },
    effect: (fn) => {
      effectCleanup = fn();
    },
  };

  registerCommands(mockCtx, {
    store: { list: () => [], get: () => null, getSettings: () => ({}) },
    scheduler: { runningCount: () => 0, queue: [] },
  });

  assert.ok(registeredDef);
  assert.equal(registeredDef.name, 'cron');
  assert.equal(registeredDef.definitionId, '@goodandready/dsh-cron');
  assert.equal(typeof registeredDef.handler, 'function');
  assert.equal(typeof registeredDef.execute, 'function');

  // Test handler invocation
  const handlerRes = await registeredDef.handler({ input: 'help' });
  assert.equal(handlerRes.kind, 'text');
  assert.match(handlerRes.text, /Cron Automation Commands:/);

  // Test execute invocation
  const execRes = await registeredDef.execute('status');
  assert.match(execRes, /Cron Scheduler Status/);

  // Effect disposal
  assert.equal(disposed, false);
  effectCleanup();
  assert.equal(disposed, true);
});
