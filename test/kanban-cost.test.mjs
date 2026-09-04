import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokenCost, shouldCreateKanbanCard, createKanbanCard } from '../lib/integrations.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('estimateTokenCost calculates accurate USD costs for models', () => {
  // 1. deepseek-chat: 100k input ($0.014), 20k output ($0.0056) -> $0.0196
  const usage1 = { inputTokens: 100_000, outputTokens: 20_000, cacheReadTokens: 0 };
  const cost1 = estimateTokenCost('deepseek-chat', usage1);
  assert.equal(cost1, 0.0196);

  // 2. deepseek-v4-flash
  const usage2 = { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 2_000_000 };
  const cost2 = estimateTokenCost('deepseek-v4-flash', usage2);
  // input: 1.0 * 0.10 = 0.10, output: 0.5 * 0.20 = 0.10, cache: 2.0 * 0.01 = 0.02 -> 0.22
  assert.equal(cost2, 0.22);

  // 3. empty usage
  assert.equal(estimateTokenCost('gpt-4o', null), 0);
  assert.equal(estimateTokenCost('gpt-4o', {}), 0);
});

test('shouldCreateKanbanCard respects kanbanMode', () => {
  const taskNone = { kanbanMode: 'none' };
  const taskAlways = { kanbanMode: 'always' };
  const taskFailure = { kanbanMode: 'on_failure' };

  assert.equal(shouldCreateKanbanCard(taskNone, { status: 'error' }), false);
  assert.equal(shouldCreateKanbanCard(taskNone, { status: 'success' }), false);

  assert.equal(shouldCreateKanbanCard(taskAlways, { status: 'success' }), true);
  assert.equal(shouldCreateKanbanCard(taskAlways, { status: 'error' }), true);

  assert.equal(shouldCreateKanbanCard(taskFailure, { status: 'success' }), false);
  assert.equal(shouldCreateKanbanCard(taskFailure, { status: 'error' }), true);
  assert.equal(shouldCreateKanbanCard(taskFailure, { status: 'timeout' }), true);
});

test('createKanbanCard makes correct HTTP request', async () => {
  let calledUrl = '';
  let calledBody = null;

  const mockFetch = async (url, options) => {
    calledUrl = url;
    calledBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ task: { id: 'task-123', title: calledBody.title } })
    };
  };

  const res = await createKanbanCard({
    title: 'Alert: Cron Failed',
    body: 'Details here',
    board: 'main',
    column: 'backlog',
    labels: ['cron', 'bug'],
    fetchFn: mockFetch,
    kanbanBaseUrl: 'http://127.0.0.1:3000'
  });

  assert.equal(res.success, true);
  assert.equal(calledUrl, 'http://127.0.0.1:3000/dsh-kanban/task');
  assert.equal(calledBody.title, 'Alert: Cron Failed');
  assert.equal(calledBody.column, 'backlog');
  assert.deepEqual(calledBody.labels, ['cron', 'bug']);
});

test('TaskStore accumulates totalTokens and totalCostUsd and stats', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-cost-test-'));
  const storePath = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(storePath);

  const task = store.set({
    title: 'Cost Task',
    schedule: '0 9 * * *',
    prompt: 'echo 1',
    kanbanMode: 'on_failure'
  });

  assert.equal(task.kanbanMode, 'on_failure');
  assert.equal(task.totalTokens, 0);
  assert.equal(task.totalCostUsd, 0);

  // Record first run
  store.recordRun(task.id, {
    status: 'success',
    durationMs: 120,
    output: 'ok',
    usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500 },
    costUsd: 0.00015
  });

  const updated1 = store.get(task.id);
  assert.equal(updated1.totalTokens, 1700);
  assert.equal(updated1.totalCostUsd, 0.00015);

  // Record second run
  store.recordRun(task.id, {
    status: 'success',
    durationMs: 150,
    output: 'ok 2',
    usage: { inputTokens: 2000, outputTokens: 300, cacheReadTokens: 1000 },
    costUsd: 0.00030
  });

  const updated2 = store.get(task.id);
  assert.equal(updated2.totalTokens, 5000);
  assert.equal(updated2.totalCostUsd, 0.00045);

  const stats = store.getAggregatedStats();
  assert.equal(stats.activeTasks, 1);
  assert.equal(stats.totalRuns, 2);
  assert.equal(stats.totalTokens, 5000);
  assert.ok(stats.totalCostUsd >= 0.0004 && stats.totalCostUsd <= 0.0005);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
