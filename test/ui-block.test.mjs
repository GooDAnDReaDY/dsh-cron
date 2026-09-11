import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { createCronApiHandler, buildDuplicateTask } from '../lib/index.js';

function mockRes() {
  const res = {
    statusCode: 0,
    payload: null,
    writeHead(code) { this.statusCode = code; },
    end(payload) { this.payload = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-ui-block-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

// ------------------------------------------------------------------ #41

test('#41: a duplicate inherits configuration and resets execution state', () => {
  const source = {
    id: 'cron_source',
    title: 'Nightly digest',
    schedule: '0 3 * * *',
    scheduleText: 'Every day at 03:00',
    prompt: 'summarise',
    type: 'llm',
    status: 'active',
    provider: 'deepseek',
    model: 'deepseek-chat',
    channels: ['discord', 'slack'],
    template: 'DIGEST {title}',
    timeoutSeconds: 900,
    overlapPolicy: 'queue',
    oneShot: false,
    totalTokens: 12345,
    totalCostUsd: 1.5,
    lastRunAt: 1700000000000,
    lastStatus: 'success',
    lastDurationMs: 812,
    nextRunAt: 1800000000000,
    attempts: 2,
  };

  const copy = buildDuplicateTask(source, { id: 'cron_copy' });

  assert.equal(copy.id, 'cron_copy', 'a new id is used');
  assert.equal(copy.title, 'Nightly digest (copy)');
  assert.equal(copy.status, 'paused', 'a copy never starts active');
  assert.equal(copy.schedule, source.schedule);
  assert.equal(copy.scheduleText, source.scheduleText);
  assert.equal(copy.prompt, source.prompt);
  assert.equal(copy.model, source.model);
  assert.equal(copy.timeoutSeconds, 900);
  assert.equal(copy.overlapPolicy, 'queue');
  assert.equal(copy.template, 'DIGEST {title}');
  assert.deepEqual(copy.channels, ['discord', 'slack']);

  assert.equal(copy.totalTokens, undefined, 'token totals are not inherited');
  assert.equal(copy.totalCostUsd, undefined, 'cost totals are not inherited');
  assert.equal(copy.lastRunAt, undefined, 'last run info is not inherited');
  assert.equal(copy.lastStatus, undefined);
  assert.equal(copy.lastDurationMs, undefined);
  assert.equal(copy.nextRunAt, undefined, 'no next run until the user resumes it');
  assert.equal(copy.attempts, undefined, 'retry counter is not inherited');

  // Arrays must be copied, not shared with the source.
  copy.channels.push('ntfy');
  assert.deepEqual(source.channels, ['discord', 'slack'], 'the source is untouched');
  assert.equal(source.status, 'active', 'the source keeps its status');
});

test('#41: duplicating one-shot keeps it inert (no next run inherited)', () => {
  const source = { id: 'cron_os', title: 'One shot', schedule: 'at: 2026-09-05T15:00:00Z', oneShot: true, status: 'active', nextRunAt: 1700000000000 };
  const copy = buildDuplicateTask(source, { id: 'cron_os_copy' });
  assert.equal(copy.oneShot, true, 'a one-shot copy stays one-shot');
  assert.equal(copy.nextRunAt, undefined);
  assert.equal(copy.status, 'paused');
});

test('#41: POST duplicate creates a paused copy with empty history and leaves the source alone', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  const created = store.set({
    id: 'cron_orig',
    title: 'Watch disk',
    schedule: '0 4 * * *',
    prompt: 'df -h',
    type: 'script',
    status: 'active',
    channels: ['discord'],
    totalTokens: 500,
    totalCostUsd: 0.25,
    lastStatus: 'success',
  });
  store.recordRun('cron_orig', { at: Date.now(), status: 'success', durationMs: 12, output: 'ok' });
  assert.equal(store.getHistory('cron_orig').length, 1, 'the source has history');
  const beforeCopy = { ...store.get('cron_orig') };

  const res = mockRes();
  await handler({ method: 'POST', url: '/dsh-cron/tasks/cron_orig/duplicate', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  const copy = res.payload.task;
  assert.notEqual(copy.id, 'cron_orig');
  assert.equal(copy.status, 'paused');
  assert.equal(copy.title, 'Watch disk (copy)');
  assert.deepEqual(copy.channels, ['discord']);
  assert.equal(copy.totalTokens, undefined);
  assert.equal(store.getHistory(copy.id).length, 0, 'the copy starts without history');

  const original = store.get('cron_orig');
  assert.equal(original.status, beforeCopy.status, 'the source keeps its status');
  assert.equal(original.totalTokens, beforeCopy.totalTokens, 'the source keeps its counters');
  assert.equal(original.totalCostUsd, beforeCopy.totalCostUsd);
  assert.equal(original.lastStatus, beforeCopy.lastStatus);
  assert.equal(store.getHistory('cron_orig').length, 1);

  // A paused copy must not be scheduled.
  assert.equal(scheduler.jobs.has(copy.id), false, 'the copy is not armed');
});

test('#41: duplicating a missing task answers 404', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const res = mockRes();
  await handler({ method: 'POST', url: '/dsh-cron/tasks/cron_nope/duplicate', headers: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.error, 'Task not found');
});
