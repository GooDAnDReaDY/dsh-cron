import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TaskScheduler } from '../lib/scheduler.js';
import { TaskStore } from '../lib/store.js';
import {
  calculateRollingCost,
  calculateRollingTokens,
  checkTaskBudgetLimits,
  formatBurnGuardAlert,
} from '../lib/burn-guard.js';

test('1. calculateRollingCost and calculateRollingTokens respect time window', () => {
  const now = 100000000;
  const runs = [
    { at: now - 1000, costUsd: 0.015, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0 } },
    { at: now - 3600000, costUsd: 0.025, usage: { inputTokens: 200, outputTokens: 80, cacheReadTokens: 20 } },
    // Older than 24 hours (86400000 ms)
    { at: now - 90000000, costUsd: 0.100, usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0 } },
  ];

  const rollingCost = calculateRollingCost(runs, 86400000, now);
  assert.equal(rollingCost, 0.04);

  const rollingTokens = calculateRollingTokens(runs, 86400000, now);
  assert.equal(rollingTokens, 450); // (100+50) + (200+80+20) = 450
});

test('2. checkTaskBudgetLimits checks cumulative cost, daily cost, and token limits', () => {
  const now = 200000000;

  // No limits set
  const taskNoLimits = { id: 't1', totalCostUsd: 10.0, totalTokens: 50000 };
  assert.equal(checkTaskBudgetLimits(taskNoLimits, [], now).exceeded, false);

  // Cumulative cost limit exceeded
  const taskCostExceeded = { id: 't2', totalCostUsd: 5.5, costLimitUsd: 5.0 };
  const guardCost = checkTaskBudgetLimits(taskCostExceeded, [], now);
  assert.equal(guardCost.exceeded, true);
  assert.equal(guardCost.type, 'costLimitUsd');
  assert.match(guardCost.reason, /Cumulative cost limit exceeded: \$5.5000 >= \$5.0000/);

  // Cumulative cost limit NOT exceeded
  const taskCostOk = { id: 't2', totalCostUsd: 4.5, costLimitUsd: 5.0 };
  assert.equal(checkTaskBudgetLimits(taskCostOk, [], now).exceeded, false);

  // Daily cost limit exceeded
  const taskDaily = { id: 't3', dailyCostLimitUsd: 0.10 };
  const runsDaily = [
    { at: now - 1000, costUsd: 0.06 },
    { at: now - 5000, costUsd: 0.05 },
  ];
  const guardDaily = checkTaskBudgetLimits(taskDaily, runsDaily, now);
  assert.equal(guardDaily.exceeded, true);
  assert.equal(guardDaily.type, 'dailyCostLimitUsd');
  assert.match(guardDaily.reason, /24h daily cost limit exceeded: \$0.1100 >= \$0.1000/);

  // Token limit exceeded
  const taskTokens = { id: 't4', totalTokens: 120000, tokenLimit: 100000 };
  const guardTokens = checkTaskBudgetLimits(taskTokens, [], now);
  assert.equal(guardTokens.exceeded, true);
  assert.equal(guardTokens.type, 'tokenLimit');
  assert.match(guardTokens.reason, /Token limit exceeded: 120000 >= 100000/);
});

test('3. formatBurnGuardAlert formats user-friendly alert message', () => {
  const task = { id: 'cron_123', title: 'Daily Report Generator' };
  const alert = formatBurnGuardAlert(task, { reason: 'Cumulative cost limit exceeded: $2.0000 >= $1.5000' });
  assert.equal(alert, '⚠️ [dsh-cron] Task "Daily Report Generator" auto-paused by Burn Guard: Cumulative cost limit exceeded: $2.0000 >= $1.5000');
});

test('4. pauseTask sets pausedReason and resumeTask clears it', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'burn-guard-store-'));
  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  const scheduler = new TaskScheduler(store);
  t.after(() => scheduler.stopAll());

  const task = store.set({
    title: 'Monitored Task',
    schedule: '0 * * * *',
    type: 'llm',
    status: 'active',
  });

  scheduler.pauseTask(task.id, 'Budget limit reached');
  const paused = store.get(task.id);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pausedReason, 'Budget limit reached');
  assert.equal(paused.nextRunAt, null);

  scheduler.resumeTask(task.id);
  const resumed = store.get(task.id);
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.pausedReason, undefined);
});

test('5. End-to-end: Burn Guard auto-pauses task exceeding costLimitUsd and suppresses chained tasks', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'burn-guard-e2e-'));
  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  let chainedTriggered = false;

  const chained = store.set({
    id: 'chained_step',
    title: 'Downstream Step',
    schedule: '0 0 * * *',
    type: 'llm',
    status: 'active',
  });

  const primary = store.set({
    id: 'primary_task',
    title: 'Cost Sensitive Task',
    schedule: '0 * * * *',
    type: 'llm',
    status: 'active',
    costLimitUsd: 0.05,
    onSuccess: chained.id,
  });

  const executeFn = async (task) => {
    if (task.id === chained.id) {
      chainedTriggered = true;
    }
    return {
      status: 'success',
      output: 'Heavy run completed',
      costUsd: 0.08,
      usage: { inputTokens: 5000, outputTokens: 2000 },
    };
  };

  const scheduler = new TaskScheduler(store, executeFn);
  t.after(() => scheduler.stopAll());

  const outcome = await scheduler.runTask(primary.id);
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.costUsd, 0.08);

  const updatedPrimary = store.get(primary.id);
  assert.equal(updatedPrimary.status, 'paused');
  assert.match(updatedPrimary.pausedReason, /Cumulative cost limit exceeded: \$0.0800 >= \$0.0500/);

  // Allow any microtasks/chained tasks to resolve
  await new Promise((r) => setTimeout(r, 50));

  // Downstream chained task should NOT have run because primary was auto-paused
  assert.equal(chainedTriggered, false);
});

