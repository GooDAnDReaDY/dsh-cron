import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDigestMetrics,
  formatDigestReport,
  dispatchDigest,
} from '../lib/digest.js';
import { executeOnce } from '../lib/scheduler/scheduler-preflight.js';

test('collectDigestMetrics handles empty store gracefully', () => {
  const emptyStore = { tasks: new Map(), history: new Map() };
  const res = collectDigestMetrics(emptyStore);

  assert.equal(res.totalRuns, 0);
  assert.equal(res.successRuns, 0);
  assert.equal(res.failedRuns, 0);
  assert.equal(res.totalCostUsd, 0);
  assert.equal(res.totalTokens, 0);
  assert.equal(res.failures.length, 0);
  assert.equal(res.taskBreakdown.length, 0);
});

test('collectDigestMetrics accurately aggregates runs, tokens, and cost within window', () => {
  const now = Date.now();
  const mockStore = {
    tasks: [
      { id: 'task-a', title: 'Task Alpha' },
      { id: 'task-b', title: 'Task Beta' },
    ],
    history: new Map([
      ['task-a', [
        {
          id: 'run-1',
          taskId: 'task-a',
          status: 'success',
          finishedAt: now - 3600000, // 1h ago
          usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 100 },
          costUsd: 0.005,
        },
        {
          id: 'run-2',
          taskId: 'task-a',
          status: 'error',
          error: 'Connection timeout',
          diagnosis: 'High network latency',
          finishedAt: now - 1800000, // 30m ago
          usage: { inputTokens: 500, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0.001,
        },
        {
          id: 'run-old',
          taskId: 'task-a',
          status: 'success',
          finishedAt: now - 100000000, // >24h ago
          usage: { inputTokens: 5000, outputTokens: 1000, cacheReadTokens: 0 },
          costUsd: 0.05,
        },
      ]],
      ['task-b', [
        {
          id: 'run-3',
          taskId: 'task-b',
          status: 'skipped',
          finishedAt: now - 7200000, // 2h ago
          costUsd: 0,
        },
      ]],
    ]),
  };

  const metrics = collectDigestMetrics(mockStore, { windowMs: 86400000 });

  assert.equal(metrics.totalRuns, 3); // run-1, run-2, run-3 (run-old excluded)
  assert.equal(metrics.successRuns, 1);
  assert.equal(metrics.failedRuns, 1);
  assert.equal(metrics.skippedRuns, 1);
  assert.equal(metrics.inputTokens, 1500);
  assert.equal(metrics.outputTokens, 200);
  assert.equal(metrics.cacheReadTokens, 100);
  assert.equal(metrics.totalTokens, 1800);
  assert.equal(metrics.totalCostUsd, 0.006);
  assert.equal(metrics.failures.length, 1);
  assert.equal(metrics.failures[0].error, 'Connection timeout');
  assert.equal(metrics.failures[0].diagnosis, 'High network latency');

  const report = formatDigestReport(metrics);
  assert.ok(report.includes('DSH-Cron Daily Digest'));
  assert.ok(report.includes('**Total Runs**: 3'));
  assert.ok(report.includes('Task Alpha'));
  assert.ok(report.includes('Connection timeout'));
});

test('executeOnce handles type: "digest" returning formatted summary', async () => {
  const now = Date.now();
  const mockScheduler = {
    store: {
      tasks: [{ id: 't-1', title: 'Worker 1' }],
      history: new Map([
        ['t-1', [{ id: 'r-1', taskId: 't-1', status: 'success', finishedAt: now - 1000 }]],
      ]),
    },
  };
  const task = {
    id: 'digest-task',
    title: 'Daily Digest Task',
    type: 'digest',
  };

  const res = await executeOnce(mockScheduler, task, null, {});
  assert.equal(res.status, 'success');
  assert.ok(res.output.includes('Daily Digest'));
  assert.ok(res.output.includes('**Total Runs**: 1'));
});
