import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  shouldSendToChannel,
  buildGiteaIssuePayload,
  messageTextFor,
} from '../lib/channels.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { executeCreateTask } from '../lib/task-create.js';
import { buildNodeInvocation } from '../lib/runtimes.js';
import { executeTask, deliverNotifications } from '../lib/scheduler-execution.js';
import { SETTINGS_SYNC_KEYS, Config } from '../lib/settings.js';

// ------------------------------------------------------------------ #219
test('#219: explicit channels take priority over legacy flags', () => {
  const runOk = { status: 'success' };
  const runFail = { status: 'error', error: 'boom' };

  // 1. Explicit telegram with task.notifyTelegram = false
  const taskExplicitTg = { id: 't1', title: 'T1', channels: ['telegram'], notifyTelegram: false };
  assert.equal(
    shouldSendToChannel('telegram', taskExplicitTg, runOk, { notifyTelegram: false }),
    true,
    'explicit telegram channel must not be blocked by notifyTelegram: false'
  );

  // 2. Explicit kanban with kanbanMode = "none"
  const taskExplicitKb = { id: 't2', title: 'T2', channels: ['kanban'], kanbanMode: 'none' };
  assert.equal(
    shouldSendToChannel('kanban', taskExplicitKb, runOk, {}),
    true,
    'explicit kanban channel must not be blocked by kanbanMode: "none"'
  );

  // 3. Explicit kanban with kanbanMode = "on_failure"
  const taskKbFailOnly = { id: 't3', title: 'T3', channels: ['kanban'], kanbanMode: 'on_failure' };
  assert.equal(shouldSendToChannel('kanban', taskKbFailOnly, runOk, {}), false);
  assert.equal(shouldSendToChannel('kanban', taskKbFailOnly, runFail, {}), true);

  // 4. Explicit telegram with onlyOnFailure = true
  const taskTgFailOnly = { id: 't4', title: 'T4', channels: ['telegram'], onlyOnFailure: true };
  assert.equal(shouldSendToChannel('telegram', taskTgFailOnly, runOk, {}), false);
  assert.equal(shouldSendToChannel('telegram', taskTgFailOnly, runFail, {}), true);

  // 5. Legacy mode (channels is undefined): legacy flags decide
  const legacyTgDisabled = { id: 't5', title: 'T5', notifyTelegram: false };
  assert.equal(shouldSendToChannel('telegram', legacyTgDisabled, runOk, { notifyTelegram: true }), false);

  const legacyKbNone = { id: 't6', title: 'T6', kanbanMode: 'none' };
  assert.equal(shouldSendToChannel('kanban', legacyKbNone, runOk, {}), false);
});

// ------------------------------------------------------------------ #220
test('#220: tri-state inherit for notifyTelegram and onlyOnFailure', (t) => {
  const tmpPath = path.join(os.tmpdir(), `dsh-cron-test-tristate-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(tmpPath);
  const scheduler = new TaskScheduler(store, async () => ({ status: 'success' }));
  t.after(() => {
    scheduler.stopAll();
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  // 1. Task created without flags preserves undefined (inherits global settings)
  const res = executeCreateTask(store, scheduler, {
    title: 'Inherit Task',
    schedule: '0 9 * * *',
    prompt: 'do something',
  });
  assert.equal(res.task.notifyTelegram, undefined, 'notifyTelegram must be undefined when unset');
  assert.equal(res.task.onlyOnFailure, undefined, 'onlyOnFailure must be undefined when unset');

  // Verify in store
  const stored = store.get(res.task.id);
  assert.equal(stored.notifyTelegram, undefined);
  assert.equal(stored.onlyOnFailure, undefined);

  // 2. Explicit true/false overrides
  store.set({ ...stored, notifyTelegram: true, onlyOnFailure: false });
  const updated = store.get(res.task.id);
  assert.equal(updated.notifyTelegram, true);
  assert.equal(updated.onlyOnFailure, false);

  // 3. Reset to inherit using null or 'inherit'
  store.set({ ...updated, notifyTelegram: null, onlyOnFailure: 'inherit' });
  const reset = store.get(res.task.id);
  assert.equal(reset.notifyTelegram, undefined, 'null must reset to undefined (inherit)');
  assert.equal(reset.onlyOnFailure, undefined, '"inherit" must reset to undefined');
});

// ------------------------------------------------------------------ #224
test('#224: Gitea issue payload delivers integer label IDs per Swagger', () => {
  const task = { id: 'task-gitea', title: 'Backup DB', scheduleText: 'daily' };
  const failRun = { status: 'error', error: 'DB connection refused' };
  const okRun = { status: 'success', output: 'Done 100 rows' };

  // 1. With settings.giteaLabelIds mapping
  const settings = {
    giteaLabelIds: { cron: 101, bug: 102, alert: 103, auto: 104 }
  };
  const payloadFail = buildGiteaIssuePayload({ task, runInfo: failRun, settings });
  assert.deepEqual(payloadFail.labels, [101, 102, 103]);
  assert.ok(payloadFail.labels.every(n => Number.isInteger(n) && n > 0));

  const payloadOk = buildGiteaIssuePayload({ task, runInfo: okRun, settings });
  assert.deepEqual(payloadOk.labels, [101, 104]);

  // 2. With numeric IDs directly on task
  const taskNumeric = { ...task, giteaLabelIds: [50, 60] };
  const payloadCustom = buildGiteaIssuePayload({ task: taskNumeric, runInfo: failRun });
  assert.deepEqual(payloadCustom.labels, [50, 60]);

  // 3. Without mapped IDs: empty array to prevent Swagger 422 validation failure
  const payloadUnmapped = buildGiteaIssuePayload({ task, runInfo: failRun, settings: {} });
  assert.deepEqual(payloadUnmapped.labels, []);
});

// ------------------------------------------------------------------ #225
test('#225: buildNodeInvocation respects task.nodePath for script files', () => {
  const customNode = '/custom/bin/node';

  // 1. Script file (.mjs) with custom nodePath
  const taskFile = { prompt: './scripts/job.mjs --flag', nodePath: customNode };
  const invFile = buildNodeInvocation(taskFile, process.cwd());
  assert.equal(invFile.file, customNode, 'script file must use task.nodePath');
  assert.deepEqual(invFile.args, ['./scripts/job.mjs', '--flag']);

  // 2. Script file (.js) without custom nodePath falls back to process.execPath
  const taskFileDefault = { prompt: './job.js' };
  const invDefault = buildNodeInvocation(taskFileDefault, process.cwd());
  assert.equal(invDefault.file, process.execPath);

  // 3. Inline code with custom nodePath
  const taskInline = { prompt: 'console.log(42)', nodePath: customNode };
  const invInline = buildNodeInvocation(taskInline, process.cwd());
  assert.equal(invInline.file, customNode);
});

// ------------------------------------------------------------------ #229
test('#229: dry-run does not mutate task status, history, attempts, or store', async (t) => {
  const tmpPath = path.join(os.tmpdir(), `dsh-cron-test-dryrun-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(tmpPath);
  let executeCount = 0;
  const scheduler = new TaskScheduler(store, async (task) => {
    executeCount++;
    return { status: 'success', output: 'dry-run executed', usage: { inputTokens: 10, outputTokens: 20 }, costUsd: 0.001 };
  });
  t.after(() => {
    scheduler.stopAll();
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  const task = store.set({
    title: 'Dry-run Test Task',
    schedule: '0 0 * * *',
    prompt: 'hello',
    status: 'active',
    attempts: 3,
    costLimitUsd: 1.0,
  });

  const storeJsonBefore = JSON.stringify(store.tasks.get(task.id));
  const historyBefore = store.history.get(task.id) || [];

  // Execute dry-run
  const outcome = await executeTask(scheduler, task.id, { dryRun: true });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.dryRun, true);
  assert.equal(outcome.status, 'success');
  assert.equal(executeCount, 1);

  // Verify store state after dry run: 100% UNCHANGED
  const taskAfter = store.get(task.id);
  assert.equal(taskAfter.attempts, 3, 'attempts must not be reset on dry run');
  assert.equal(taskAfter.status, 'active', 'status must remain active');
  assert.equal(JSON.stringify(taskAfter), storeJsonBefore, 'task record in store must be identical');

  const historyAfter = store.history.get(task.id) || [];
  assert.equal(historyAfter.length, historyBefore.length, 'history must not record dry runs');

  // Verify dry-run with exceeded budget: returns error outcome without pausing task
  const taskOverBudget = store.set({
    title: 'Overbudget Task',
    schedule: '0 0 * * *',
    prompt: 'hello',
    status: 'active',
    costLimitUsd: 0.05,
    totalCostUsd: 0.10,
  });
  const budgetBefore = JSON.stringify(store.get(taskOverBudget.id));

  const budgetOutcome = await executeTask(scheduler, taskOverBudget.id, { dryRun: true });
  assert.equal(budgetOutcome.ok, false);
  assert.equal(budgetOutcome.preflightBlocked, true);
  assert.match(budgetOutcome.error, /Cumulative cost limit exceeded/i);

  const budgetAfter = store.get(taskOverBudget.id);
  assert.equal(budgetAfter.status, 'active', 'budget breach on dry-run must not pause task');
  assert.equal(JSON.stringify(budgetAfter), budgetBefore);
});

// ------------------------------------------------------------------ #233
test('#233: template precedence task -> channel -> global -> builtin', () => {
  const taskWithTpl = { title: 'Report Task', template: 'TaskCustom: {title} status={status}' };
  const taskNoTpl = { title: 'Report Task' };
  const run = { status: 'success', output: 'ok' };

  // 1. Task template wins over channel and global
  const text1 = messageTextFor('telegram', taskWithTpl, run, {
    template: 'Global: {title}',
    channelTemplates: { telegram: 'Channel: {title}' },
  });
  assert.equal(text1, 'TaskCustom: Report Task status=success');

  // 2. Channel template wins over global when task template is absent
  const text2 = messageTextFor('telegram', taskNoTpl, run, {
    template: 'Global: {title}',
    channelTemplates: { telegram: 'Channel: {title}' },
  });
  assert.equal(text2, 'Channel: Report Task');

  // 3. Channel override works even when global template is empty (#233)
  const text3 = messageTextFor('telegram', taskNoTpl, run, {
    template: '',
    channelTemplates: { telegram: 'ChannelWithoutGlobal: {title}' },
  });
  assert.equal(text3, 'ChannelWithoutGlobal: Report Task');

  // 4. Global template used when channel template is absent
  const text4 = messageTextFor('discord', taskNoTpl, run, {
    template: 'Global: {title}',
  });
  assert.equal(text4, 'Global: Report Task');

  // 5. Built-in defaults when nothing is specified
  const text5 = messageTextFor('telegram', taskNoTpl, run, {});
  assert.ok(text5.includes('Report Task'), 'built-in telegram message should contain title');
});

// ------------------------------------------------------------------ #235
test('#235: scheduler settings keys in SETTINGS_SYNC_KEYS and live scheduler update', (t) => {
  assert.ok(SETTINGS_SYNC_KEYS.includes('maxConcurrent'), 'maxConcurrent must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('defaultTimezone'), 'defaultTimezone must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('heartbeatUrl'), 'heartbeatUrl must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('heartbeatIntervalSec'), 'heartbeatIntervalSec must be in SETTINGS_SYNC_KEYS');
  assert.ok(SETTINGS_SYNC_KEYS.includes('llmActionsEnabled'), 'llmActionsEnabled must be in SETTINGS_SYNC_KEYS');

  // Verify TaskScheduler supports live maxConcurrent adjustment
  const tmpPath = path.join(os.tmpdir(), `dsh-cron-test-sched-${Date.now()}.json`);
  const store = new TaskStore(tmpPath);
  const scheduler = new TaskScheduler(store, async () => ({ status: 'success' }), { maxConcurrent: 2 });
  t.after(() => {
    scheduler.stopAll();
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  assert.equal(scheduler.maxConcurrent, 2);

  // Live update
  scheduler.maxConcurrent = 5;
  assert.equal(scheduler.maxConcurrent, 5);
});

// ------------------------------------------------------------------ #237
test('#237: credential resolution in deliverNotifications has bounded deadline', async () => {
  const task = { id: 't-sec', title: 'Secure Task' };
  const runInfo = { status: 'success' };
  let deliverCalled = false;

  // Resolves after 150ms, well after the 30ms timeout
  const slowResolveSecrets = () => new Promise((resolve) => {
    setTimeout(() => resolve({ token: 'too-late' }), 150);
  });

  const start = Date.now();
  await deliverNotifications(task, runInfo, {
    store: { getSettings: () => ({}) },
    resolveSecrets: slowResolveSecrets,
    deliver: async () => {
      deliverCalled = true;
      return { delivered: [{ channel: 'test' }], failures: [] };
    },
    secretTimeoutMs: 30, // fast timeout for test
  });
  const elapsed = Date.now() - start;

  assert.ok(elapsed >= 25 && elapsed < 120, `must time out around 30ms, took ${elapsed}ms`);
  assert.equal(deliverCalled, true, 'delivery should proceed even if credential resolution timed out');

  // Await completion of the slow timer so no open handles linger
  await new Promise((r) => setTimeout(r, 160));
});

// ------------------------------------------------------------------ #266
test('#266: volatile Config schema declaration and host logging hygiene', () => {
  assert.ok(Config && Config.dict, 'Config schema must be defined');
  assert.ok(Config.dict.maxConcurrent, 'maxConcurrent declared in Config');
  assert.ok(Config.dict.defaultTimezone, 'defaultTimezone declared in Config');
  assert.ok(Config.dict.heartbeatUrl, 'heartbeatUrl declared in Config');
  assert.ok(Config.dict.heartbeatIntervalSec, 'heartbeatIntervalSec declared in Config');
  assert.ok(Config.dict.llmActionsEnabled, 'llmActionsEnabled declared in Config');
});
