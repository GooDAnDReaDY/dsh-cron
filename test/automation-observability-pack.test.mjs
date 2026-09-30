import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramTaskKeyboard, answerTelegramCallbackQuery } from '../lib/telegram.js';
import { handleTelegramWebhook } from '../lib/api.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { TaskStore } from '../lib/store.js';
import { parseLlmActionDirectives, executeLlmActionDirectives } from '../lib/llm-actions.js';
import { renderMetrics } from '../lib/metrics.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';

function createTempStore() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-'));
  const filePath = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(filePath);
  store.init();
  return { store, tmpDir };
}

test('1. Telegram: inline keyboard formatting and callback query handling', async () => {
  const task = { id: 'cron_test_1', title: 'Backup DB', status: 'active' };
  const kb = createTelegramTaskKeyboard(task, { status: 'success' });
  assert.ok(kb.inline_keyboard, 'should have inline_keyboard');
  assert.equal(kb.inline_keyboard[0][0].callback_data, 'cron:run:cron_test_1');
  assert.equal(kb.inline_keyboard[0][1].callback_data, 'cron:pause:cron_test_1');
  assert.equal(kb.inline_keyboard[1][0].callback_data, 'cron:log:cron_test_1');

  // Test webhook callback query
  const { store, tmpDir } = createTempStore();
  store.set(task);
  store.saveSettings({ botToken: 'test-bot-token', chatId: 'user_1' });

  let runTriggered = false;
  const mockScheduler = {
    triggerManualRun: async (id) => {
      if (id === 'cron_test_1') runTriggered = true;
    },
    pause: () => {},
    resume: () => {},
  };

  let answerCalled = false;
  const globalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('answerCallbackQuery')) {
      answerCalled = true;
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    const payload = JSON.stringify({
      callback_query: {
        id: 'cb_123',
        from: { id: 'user_1' },
        data: 'cron:run:cron_test_1',
        message: { chat: { id: 'user_1' } },
      },
    });

    const req = Readable.from([Buffer.from(payload)]);
    req.method = 'POST';
    req.headers = { 'content-type': 'application/json' };

    let statusCode = 0;
    let resBody = null;
    const res = {
      writeHead: (code) => { statusCode = code; },
      end: (data) => { resBody = JSON.parse(data || '{}'); },
    };

    await handleTelegramWebhook({ store, scheduler: mockScheduler, req, res });
    assert.equal(statusCode, 200);
    assert.equal(runTriggered, true, 'manual run should have been triggered');
    assert.equal(answerCalled, true, 'answerCallbackQuery should have been called');
  } finally {
    globalThis.fetch = globalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('2. Task Chaining: onSuccess triggers chained task with prevOutput', async () => {
  const { store, tmpDir } = createTempStore();
  const executedRuns = [];

  const task1 = store.set({
    id: 'cron_step_1',
    title: 'Step 1',
    type: 'script',
    status: 'active',
    onSuccess: 'cron_step_2',
  });
  const task2 = store.set({
    id: 'cron_step_2',
    title: 'Step 2',
    type: 'script',
    status: 'active',
  });

  const scheduler = new TaskScheduler(store, async (task, opts) => {
    executedRuns.push({ id: task.id, prevOutput: opts?.prevOutput });
    return { output: `Done ${task.id}` };
  });

  try {
    await scheduler.runNow(task1.id);
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(executedRuns.length, 2, 'both tasks should have executed');
    assert.equal(executedRuns[0].id, 'cron_step_1');
    assert.equal(executedRuns[1].id, 'cron_step_2');
    assert.equal(executedRuns[1].prevOutput, 'Done cron_step_1');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3. Task Chaining: onFailure triggers recovery task and protects against infinite loops', async () => {
  const { store, tmpDir } = createTempStore();
  const executed = [];

  // Create self-looping task to verify depth protection (max 5)
  const loopTask = store.set({
    id: 'cron_loop',
    title: 'Loop task',
    type: 'script',
    status: 'active',
    onFailure: 'cron_loop',
  });

  const scheduler = new TaskScheduler(store, async (task, opts) => {
    executed.push({ id: task.id, depth: opts?.chainDepth || 0 });
    throw new Error('Forced failure');
  });

  try {
    await scheduler.runNow(loopTask.id);
    await new Promise((r) => setTimeout(r, 100));

    // Initial run (depth 0) + chained runs -> at most 5 total runs
    assert.ok(executed.length <= 5, `executed runs (${executed.length}) should not exceed depth limit`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('4. Structured LLM Actions: parse directives and execute when enabled', async () => {
  const textWithFences = `
Here is my analysis of the system status.
\`\`\`json
{
  "dsh_actions": [
    { "type": "trigger_task", "taskId": "cron_step_2" },
    { "type": "notify", "message": "High disk pressure detected" }
  ]
}
\`\`\`
All checks completed.
`;

  const directives = parseLlmActionDirectives(textWithFences);
  assert.equal(directives.length, 2);
  assert.equal(directives[0].type, 'trigger_task');
  assert.equal(directives[0].taskId, 'cron_step_2');
  assert.equal(directives[1].type, 'notify');
  assert.equal(directives[1].message, 'High disk pressure detected');

  // Verify execution when enabled
  let triggeredId = null;
  let notifiedText = null;
  const mockScheduler = {
    runNow: async (id) => { triggeredId = id; },
  };
  const mockFetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    notifiedText = b.text;
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const results = await executeLlmActionDirectives({
    directives,
    task: { id: 'cron_llm', title: 'LLM Auditor' },
    runInfo: { output: 'High disk pressure' },
    scheduler: mockScheduler,
    store: {},
    settings: {
      llmActionsEnabled: true,
      botToken: 'fake_bot_token',
      chatId: '123456',
    },
    fetchFn: mockFetch,
  });

  assert.equal(triggeredId, 'cron_step_2');
  assert.equal(notifiedText, 'High disk pressure detected');
  assert.equal(results.length, 2);

  // When disabled, nothing should execute
  triggeredId = null;
  const disabledResults = await executeLlmActionDirectives({
    directives,
    task: { id: 'cron_llm', title: 'LLM Auditor' },
    runInfo: { output: 'High disk pressure' },
    scheduler: mockScheduler,
    store: {},
    settings: { llmActionsEnabled: false },
  });
  assert.equal(disabledResults.length, 0);
  assert.equal(triggeredId, null);
});

test('5. Store Archive and Stats: getArchivedRuns and getTaskStats', async () => {
  const { store, tmpDir } = createTempStore();
  try {
    const task = store.set({ id: 'cron_stat', title: 'Stats Task', status: 'active' });

    // Record runs
    store.recordRun(task.id, { status: 'success', durationMs: 120, output: 'Run 1 OK' });
    store.recordRun(task.id, { status: 'success', durationMs: 150, output: 'Run 2 OK' });
    store.recordRun(task.id, { status: 'error', durationMs: 200, error: 'DB Connection failed' });

    const stats = store.getTaskStats(task.id);
    assert.equal(stats.totalRuns, 3);
    assert.equal(stats.successRuns, 2);
    assert.equal(stats.errorRuns, 1);
    assert.equal(stats.successRate, 0.67);
    assert.equal(stats.recentDurations.length, 3);

    // Simulate archive entry
    const archivePath = path.join(tmpDir, 'tasks-history-archive.json');
    const archiveData = {
      cron_stat: [
        { at: Date.now() - 10000, status: 'success', durationMs: 110, output: 'Old archive run 1' },
        { at: Date.now() - 20000, status: 'error', durationMs: 310, error: 'Old timeout error' },
      ],
    };
    fs.writeFileSync(archivePath, JSON.stringify(archiveData, null, 2), 'utf-8');

    const archive = store.getArchivedRuns(task.id, { limit: 10, offset: 0 });
    assert.equal(archive.total, 2);
    assert.equal(archive.runs.length, 2);

    // Filter search
    const filtered = store.getArchivedRuns(task.id, { search: 'timeout' });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.runs[0].error, 'Old timeout error');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('6. Prometheus Metrics: enriched with concurrent_running and task tokens/cost', () => {
  const tasks = [
    { id: 'cron_m1', status: 'active', lastDurationMs: 450, lastRunAt: Date.now(), totalTokens: 1500, totalCostUsd: 0.003 },
    { id: 'cron_m2', status: 'paused', lastDurationMs: 0, lastRunAt: null, totalTokens: 0, totalCostUsd: 0 },
  ];
  const scheduler = {
    runningCount: () => 1,
    getRunCounters: () => ({ success: 5, error: 1 }),
  };

  const output = renderMetrics({
    tasks,
    stats: { totalRuns: 6 },
    runCounters: scheduler.getRunCounters(),
    scheduler,
  });

  assert.ok(output.includes('dsh_cron_concurrent_running 1'), 'should export runningCount');
  assert.ok(output.includes('dsh_cron_task_tokens_total{task="cron_m1"} 1500'), 'should export task tokens');
  assert.ok(output.includes('dsh_cron_task_cost_usd_total{task="cron_m1"} 0.003'), 'should export task cost');
  assert.ok(output.includes('dsh_cron_task_last_duration_seconds{task="cron_m1"} 0.45'), 'should export duration');
});
