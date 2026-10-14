import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculate24hTimeline,
  calculateCostHeatmap,
} from '../lib/timeline.js';

test('1. calculate24hTimeline builds 24 hourly buckets and projects recurring tasks', () => {
  // Fixed timestamp: 2026-10-14 12:00:00 UTC (1728907200000)
  const fromTimestamp = 1728907200000;

  const tasks = [
    // Runs every hour on the hour (24 runs in 24h)
    { id: 'hourly-sync', title: 'Hourly Sync', schedule: '0 * * * *', status: 'active', type: 'script' },
    // Runs daily at 14:00 (1 run in 24h)
    { id: 'daily-report', title: 'Daily Report', schedule: '0 14 * * *', status: 'active', type: 'llm' },
    // Paused task (0 runs)
    { id: 'paused-job', title: 'Paused Job', schedule: '0 * * * *', status: 'paused', type: 'script' },
  ];

  const timeline = calculate24hTimeline({ tasks, maxConcurrent: 2, fromTimestamp, hoursCount: 24 });

  assert.equal(timeline.buckets.length, 24);
  assert.equal(timeline.maxConcurrent, 2);
  assert.ok(timeline.totalRuns >= 24);
  assert.equal(timeline.fromTimestamp, fromTimestamp);
  assert.equal(timeline.toTimestamp, fromTimestamp + 24 * 3600000);

  // Every bucket should have at least 1 run (hourly-sync)
  for (const b of timeline.buckets) {
    assert.ok(b.runs.some((r) => r.taskId === 'hourly-sync'));
  }
});

test('2. calculate24hTimeline places one-shot tasks and detects peak concurrency', () => {
  const fromTimestamp = 1728907200000; // 12:00:00

  // 3 tasks scheduled in hour 2 (14:00 - 15:00)
  const targetRunAt = fromTimestamp + 2 * 3600000 + 15 * 60000; // 14:15:00

  const tasks = [
    { id: 'task-1', title: 'Task 1', oneShot: true, nextRunAt: targetRunAt, status: 'active' },
    { id: 'task-2', title: 'Task 2', oneShot: true, nextRunAt: targetRunAt + 60000, status: 'active' },
    { id: 'task-3', title: 'Task 3', oneShot: true, nextRunAt: targetRunAt + 120000, status: 'active' },
    { id: 'task-4', title: 'Task 4', oneShot: true, nextRunAt: targetRunAt + 180000, status: 'active' },
  ];

  // Max concurrent set to 3 -> 4 tasks in bucket 2 triggers isPeak: true
  const timeline = calculate24hTimeline({ tasks, maxConcurrent: 3, fromTimestamp, hoursCount: 24 });

  assert.equal(timeline.buckets[2].count, 4);
  assert.equal(timeline.buckets[2].isPeak, true);
  assert.ok(timeline.peakHoursCount >= 1);
  assert.ok(timeline.peakHours.includes(timeline.buckets[2].label));

  // Other buckets have 0 runs and are not peak
  assert.equal(timeline.buckets[0].count, 0);
  assert.equal(timeline.buckets[0].isPeak, false);
});

test('3. calculate24hTimeline handles corrupted schedules and empty task fleet safely', () => {
  const emptyTimeline = calculate24hTimeline({ tasks: [] });
  assert.equal(emptyTimeline.totalRuns, 0);
  assert.equal(emptyTimeline.peakHoursCount, 0);
  assert.equal(emptyTimeline.buckets.length, 24);

  const corruptedTasks = [
    { id: 'bad-cron', schedule: 'INVALID_CRON_PATTERN', status: 'active' },
    { id: 'null-task', status: 'active' },
  ];
  const safeTimeline = calculate24hTimeline({ tasks: corruptedTasks });
  assert.equal(safeTimeline.totalRuns, 0);
  assert.equal(safeTimeline.buckets.length, 24);
});

test('4. calculateCostHeatmap builds 7x24 matrix and aggregates spend by day/hour', () => {
  // Wednesday at 14:30:00 (d.getDay() = 3 -> dayOfWeek = (3+6)%7 = 2 (Wednesday))
  const tWed14 = new Date('2026-10-14T14:30:00Z').getTime();
  // Friday at 09:15:00 (d.getDay() = 5 -> dayOfWeek = (5+6)%7 = 4 (Friday))
  const tFri09 = new Date('2026-10-16T09:15:00Z').getTime();

  const costLedger = [
    { timestamp: tWed14, tokens: 5000, costUsd: 0.010, model: 'deepseek-chat', provider: 'deepseek' },
    { timestamp: tWed14, tokens: 2500, costUsd: 0.005, model: 'deepseek-chat', provider: 'deepseek' },
    { timestamp: tFri09, tokens: 10000, costUsd: 0.030, model: 'gpt-4o', provider: 'openai' },
  ];

  const history = [
    { timestamp: tWed14, status: 'success' },
    { timestamp: tFri09, status: 'success' },
  ];

  const heatmap = calculateCostHeatmap({ costLedger, history });

  assert.equal(heatmap.matrix.length, 7); // 7 days
  assert.equal(heatmap.matrix[0].length, 24); // 24 hours
  assert.equal(heatmap.totalCostUsd, 0.045);
  assert.equal(heatmap.totalTokens, 17500);
  assert.equal(heatmap.totalRuns, 2);

  // Wednesday (row 2) Hour 14
  const wed14 = heatmap.matrix[2][14];
  assert.equal(wed14.tokens, 7500);
  assert.equal(wed14.costUsd, 0.015);
  assert.ok(wed14.costIntensity > 0);

  // Friday (row 4) Hour 9 has max cost
  const fri09 = heatmap.matrix[4][9];
  assert.equal(fri09.costUsd, 0.030);
  assert.equal(fri09.tokens, 10000);
  assert.equal(fri09.costIntensity, 1.0); // max cost has intensity 1.0
  assert.equal(heatmap.maxCostHour, 0.030);
});

test('5. calculateCostHeatmap filters correctly by model and provider', () => {
  const tWed14 = new Date('2026-10-14T14:30:00Z').getTime();
  const tFri09 = new Date('2026-10-16T09:15:00Z').getTime();

  const costLedger = [
    { timestamp: tWed14, tokens: 5000, costUsd: 0.010, model: 'deepseek-chat', provider: 'deepseek' },
    { timestamp: tFri09, tokens: 10000, costUsd: 0.030, model: 'gpt-4o', provider: 'openai' },
  ];

  const filtered = calculateCostHeatmap({ costLedger, modelFilter: 'deepseek-chat' });
  assert.equal(filtered.totalCostUsd, 0.010);
  assert.equal(filtered.totalTokens, 5000);
  assert.equal(filtered.matrix[2][14].tokens, 5000);
  assert.equal(filtered.matrix[4][9].tokens, 0); // gpt-4o filtered out
});
