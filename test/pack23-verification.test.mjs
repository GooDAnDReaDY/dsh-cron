import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizePromptHistory,
  trackPromptEdit,
  recordPromptRunOutcome,
  rollbackPromptVersion,
} from '../lib/prompt-evolver.js';

import {
  buildAnalyticsDigest,
  formatDigestMarkdown,
  sendAnalyticsDigest,
} from '../lib/analytics-digest.js';

test('1. sanitizePromptHistory validates entries, bounds to max 20, and fixes rates', () => {
  assert.deepEqual(sanitizePromptHistory(null), []);
  assert.deepEqual(sanitizePromptHistory('not an array'), []);

  const raw = [
    { version: 1, prompt: 'v1 prompt', note: 'Initial', runs: 10, successes: 8, createdAt: 1000 },
    { version: 2, prompt: 'v2 prompt', runs: 5, successes: 5, successRate: 1.0 },
    { invalid: true },
  ];

  const sanitized = sanitizePromptHistory(raw);
  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].version, 1);
  assert.equal(sanitized[0].prompt, 'v1 prompt');
  assert.equal(sanitized[0].successRate, 0.8);
  assert.equal(sanitized[1].version, 2);
  assert.equal(sanitized[1].successRate, 1.0);

  // Test bound to 20
  const many = Array.from({ length: 30 }, (_, i) => ({
    version: i + 1,
    prompt: `prompt ${i + 1}`,
  }));
  const bounded = sanitizePromptHistory(many);
  assert.equal(bounded.length, 20);
  assert.equal(bounded[0].version, 11);
  assert.equal(bounded[19].version, 30);
});

test('2. trackPromptEdit baselines initial version and increments revisions on change', () => {
  const currentTask = {
    id: 'agent-cron-1',
    title: 'Summarize news',
    prompt: 'Summarize top news in bullet points',
    runs: 20,
    successes: 18,
  };

  // Same prompt -> no version bump
  const same = trackPromptEdit(currentTask, 'Summarize top news in bullet points');
  assert.equal(same.promptVersion, 1);

  // New prompt -> baselines v1 and creates v2
  const edit1 = trackPromptEdit(currentTask, 'Summarize top tech news with source links', 'Refine sources');
  assert.equal(edit1.promptVersion, 2);
  assert.equal(edit1.promptHistory.length, 2);
  assert.equal(edit1.promptHistory[0].version, 1);
  assert.equal(edit1.promptHistory[0].successRate, 0.9);
  assert.equal(edit1.promptHistory[1].version, 2);
  assert.equal(edit1.promptHistory[1].note, 'Refine sources');
  assert.equal(edit1.promptHistory[1].runs, 0);

  // Subsequent edit -> creates v3
  const taskV2 = {
    ...currentTask,
    prompt: edit1.prompt,
    promptVersion: edit1.promptVersion,
    promptHistory: edit1.promptHistory,
  };
  const edit2 = trackPromptEdit(taskV2, 'Translate and summarize tech news', 'Add translation');
  assert.equal(edit2.promptVersion, 3);
  assert.equal(edit2.promptHistory.length, 3);
  assert.equal(edit2.promptHistory[2].version, 3);
  assert.equal(edit2.promptHistory[2].note, 'Add translation');
});

test('3. recordPromptRunOutcome tracks run counters and recalculates success rate', () => {
  const task = {
    id: 'ai-task',
    prompt: 'Active prompt text',
    promptVersion: 2,
    promptHistory: [
      { version: 1, prompt: 'v1', runs: 10, successes: 10, successRate: 1.0 },
      { version: 2, prompt: 'Active prompt text', runs: 0, successes: 0, successRate: 1.0 },
    ],
  };

  recordPromptRunOutcome(task, true);
  assert.equal(task.promptHistory[1].runs, 1);
  assert.equal(task.promptHistory[1].successes, 1);
  assert.equal(task.promptHistory[1].successRate, 1.0);

  recordPromptRunOutcome(task, false);
  assert.equal(task.promptHistory[1].runs, 2);
  assert.equal(task.promptHistory[1].successes, 1);
  assert.equal(task.promptHistory[1].successRate, 0.5);

  recordPromptRunOutcome(task, true);
  assert.equal(task.promptHistory[1].runs, 3);
  assert.equal(task.promptHistory[1].successes, 2);
  assert.equal(task.promptHistory[1].successRate, 0.667);
});

test('4. rollbackPromptVersion safely restores historical prompt as a new revision', () => {
  const task = {
    id: 'ai-task',
    prompt: 'Buggy prompt v2',
    promptVersion: 2,
    promptHistory: [
      { version: 1, prompt: 'Working stable prompt v1', runs: 50, successes: 48, successRate: 0.96 },
      { version: 2, prompt: 'Buggy prompt v2', runs: 10, successes: 4, successRate: 0.40 },
    ],
  };

  assert.throws(() => rollbackPromptVersion(task, 999), /not found/);

  const restored = rollbackPromptVersion(task, 1);
  assert.equal(restored.prompt, 'Working stable prompt v1');
  assert.equal(restored.promptVersion, 3);
  assert.equal(restored.promptHistory.length, 3);
  assert.equal(restored.promptHistory[2].note, 'Rollback to v1');
  assert.equal(restored.promptHistory[2].prompt, 'Working stable prompt v1');
});

test('5. buildAnalyticsDigest aggregates execution counts, tokens, spend, and rankings', () => {
  const now = 1728900000000;
  const day = 86400000;

  const tasks = [
    { id: 'task-a', name: 'Task A', status: 'active' },
    { id: 'task-b', name: 'Task B', status: 'active' },
    { id: 'task-c', name: 'Task C', status: 'paused' },
  ];

  const history = [
    // Task A: 3 runs, 1 failure, 1000 tokens, $0.002
    { taskId: 'task-a', status: 'success', tokens: 500, costUsd: 0.001, timestamp: now - day },
    { taskId: 'task-a', status: 'success', tokens: 500, costUsd: 0.001, timestamp: now - 2 * day },
    { taskId: 'task-a', status: 'failure', error: 'Timeout', tokens: 0, costUsd: 0, timestamp: now - 3 * day },
    // Task B: 2 runs, 2 failures, 2000 tokens, $0.005, 1 healed
    { taskId: 'task-b', status: 'failure', error: 'Network', tokens: 1000, costUsd: 0.0025, timestamp: now - day },
    { taskId: 'task-b', status: 'success', healed: true, tokens: 1000, costUsd: 0.0025, timestamp: now - 2 * day },
    // Out of 7-day window
    { taskId: 'task-a', status: 'success', tokens: 10000, costUsd: 0.1, timestamp: now - 10 * day },
  ];

  const digest = buildAnalyticsDigest({ tasks, history, periodDays: 7, now });

  assert.equal(digest.totalRuns, 5);
  assert.equal(digest.successfulRuns, 3);
  assert.equal(digest.failedRuns, 2);
  assert.equal(digest.successRate, 60.0);
  assert.equal(digest.totalTokens, 3000);
  assert.equal(digest.totalCostUsd, 0.007);
  assert.equal(digest.healedCount, 1);
  assert.equal(digest.activeTasksCount, 2);
  assert.equal(digest.pausedTasksCount, 1);

  // Top unstable: Task B has 1 failure out of 2 (50% SR), Task A has 1 failure out of 3 (66.7% SR)
  assert.equal(digest.topUnstableTasks.length, 2);
  assert.equal(digest.topExpensiveTasks[0].id, 'task-b');
  assert.equal(digest.topExpensiveTasks[0].costUsd, 0.005);
});

test('6. formatDigestMarkdown and sendAnalyticsDigest deliver formatted payload', async () => {
  const digest = {
    periodDays: 7,
    totalRuns: 42,
    successfulRuns: 40,
    failedRuns: 2,
    successRate: 95.2,
    totalTokens: 18500,
    totalCostUsd: 0.037,
    healedCount: 2,
    activeTasksCount: 5,
    pausedTasksCount: 1,
    topUnstableTasks: [
      { id: 'web-scraper', name: 'Web Scraper', runs: 10, failures: 2, successRate: 80.0 },
    ],
    topExpensiveTasks: [
      { id: 'rag-indexer', name: 'RAG Indexer', tokens: 12000, costUsd: 0.024 },
    ],
  };

  const md = formatDigestMarkdown(digest);
  assert.match(md, /DSH Cron Automation Digest/);
  assert.match(md, /95\.2%|95\.2/);
  assert.match(md, /Web Scraper/);
  assert.match(md, /RAG Indexer/);

  let sentTelegram = null;
  let sentWebhook = null;

  const mockChannels = {
    sendTelegram: async (text) => {
      sentTelegram = text;
      return { ok: true, messageId: 12345 };
    },
    sendWebhook: async (url, payload) => {
      sentWebhook = { url, payload };
      return { ok: true, status: 200 };
    },
  };

  const delivery = await sendAnalyticsDigest({
    digest,
    channels: mockChannels,
    deliveryConfig: {
      telegram: true,
      webhookUrl: 'https://example.com/webhook',
    },
  });

  assert.equal(delivery.telegram.ok, true);
  assert.equal(delivery.webhook.ok, true);
  assert.match(sentTelegram, /DSH Cron Automation Digest/);
  assert.equal(sentWebhook.url, 'https://example.com/webhook');
  assert.equal(sentWebhook.payload.event, 'analytics.digest');
});
