import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseScheduleExpression, TaskScheduler } from '../lib/scheduler.js';
import { TaskStore } from '../lib/store.js';
import { SessionRunner } from '../lib/runner.js';

function makeEnv(t, options = {}) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-engine-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  const scheduler = new TaskScheduler(store, options.executeFn || (async () => 'ok'), options);
  return { store, scheduler };
}

test('#15: @-shorthand schedules parse to cron patterns', () => {
  assert.equal(parseScheduleExpression('@hourly').cronPattern, '0 * * * *');
  assert.equal(parseScheduleExpression('@daily').cronPattern, '0 0 * * *');
  assert.equal(parseScheduleExpression('@weekly').cronPattern, '0 0 * * 0');
  assert.equal(parseScheduleExpression('@monthly').cronPattern, '0 0 1 * *');
  assert.equal(parseScheduleExpression('@yearly').cronPattern, '0 0 1 1 *');
  const every = parseScheduleExpression('@every 5m');
  assert.equal(every.cronPattern, '*/5 * * * *');
  assert.equal(every.humanText, 'Every 5 minutes');
});

test('#13: scheduleTask accepts an IANA time zone on the task', (t) => {
  const { store, scheduler } = makeEnv(t);
  const task = store.set({
    title: 'TZ task',
    schedule: '0 9 * * *',
    prompt: 'p',
    status: 'active',
    timezone: 'Europe/Berlin',
  });
  scheduler.scheduleTask(task);
  assert.ok(task.nextRunAt > Date.now(), 'next run scheduled with timezone');
  scheduler.stopAll();
});

test('#13: an invalid time zone does not crash scheduling', (t) => {
  const { store, scheduler } = makeEnv(t);
  const task = store.set({
    title: 'Bad TZ task',
    schedule: '0 9 * * *',
    prompt: 'p',
    status: 'active',
    timezone: 'Mars/Olympus',
  });
  scheduler.scheduleTask(task);
  assert.equal(scheduler.jobs.has(task.id), false, 'job not armed for invalid tz');
  scheduler.stopAll();
});

test('#12: misfire runOnce runs the task late after downtime', async (t) => {
  let runs = 0;
  const { store, scheduler } = makeEnv(t, { executeFn: async () => { runs++; return 'late run'; } });
  const task = store.set({
    title: 'Late task',
    schedule: 'every 10m',
    prompt: 'p',
    status: 'active',
    misfirePolicy: 'runOnce',
    nextRunAt: Date.now() - 30 * 60 * 1000, // missed 30 minutes ago
  });
  scheduler.start();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(runs, 1, 'missed run executed once on start');
  const history = store.getHistory(task.id);
  assert.equal(history.length, 2); // missed entry + late execution
  scheduler.stopAll();
});

test('#12: misfire skip retires a missed one-shot instead of running it', (t) => {
  const { store, scheduler } = makeEnv(t);
  const task = store.set({
    title: 'Gone reminder',
    schedule: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    prompt: 'p',
    status: 'active',
    oneShot: true,
    misfirePolicy: 'skip',
    nextRunAt: Date.now() - 30 * 60 * 1000,
  });
  scheduler.start();
  const updated = store.get(task.id);
  assert.equal(updated.status, 'completed', 'missed one-shot retired without execution');
  scheduler.stopAll();
});

test('#18: failed task retries once and then resets attempts on success', async (t) => {
  let attempts = 0;
  const { store, scheduler } = makeEnv(t, {
    executeFn: async () => {
      attempts++;
      if (attempts === 1) throw new Error('transient failure');
      return 'recovered';
    },
  });
  const task = store.set({
    title: 'Retry task',
    schedule: 'every 10m',
    prompt: 'p',
    status: 'active',
    maxRetries: 2,
    retryBackoffMs: 1000,
  });
  scheduler.scheduleTask(task);
  scheduler.runTask(task.id); // first attempt fails
  await new Promise((r) => setTimeout(r, 1300)); // backoff 1000ms
  const history = store.getHistory(task.id, 5);
  assert.equal(history[0].status, 'success', 'second attempt succeeded');
  const updated = store.get(task.id);
  assert.equal(updated.attempts, 0, 'attempts reset after success');
  scheduler.stopAll();
});

test('#52: a run beyond the concurrency limit is skipped and recorded', async (t) => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  const { store, scheduler } = makeEnv(t, {
    maxConcurrent: 1,
    executeFn: async () => { await gate; return 'done'; },
  });
  const a = store.set({ title: 'A', schedule: 'every 10m', prompt: 'p', status: 'active' });
  const b = store.set({ title: 'B', schedule: 'every 10m', prompt: 'p', status: 'active' });
  const first = scheduler.runTask(a.id);
  const second = scheduler.runTask(b.id);
  await second; // throttled immediately, recorded as skipped
  const historyB = store.getHistory(b.id, 1);
  assert.equal(historyB[0].status, 'skipped');
  assert.match(historyB[0].output, /concurrency limit/);
  release();
  await first;
  assert.equal(store.getHistory(a.id, 1)[0].status, 'success');
  scheduler.stopAll();
});

test('#30/#32/#37: preset applied, session archived, sessionId returned', async (t) => {
  const archived = [];
  const presets = [];
  const handle = {
    agent: {
      whenIdle: async () => {},
      followup: () => {},
      session: { id: 'sess-123' },
    },
    dispose: async () => {},
  };
  const ctx = {
    agents: { create: async () => handle },
    get: (name) => {
      if (name === 'permissionPresets') return { set: (session, preset) => presets.push([session, preset]) };
      if (name === 'sessions') return { archive: (sid) => archived.push(sid) };
      return null;
    },
  };
  const runner = new SessionRunner(ctx);
  const res = await runner.execute({
    id: 'p',
    title: 'Permed',
    type: 'llm',
    prompt: 'p',
    permissionPreset: 'read-only',
  });
  assert.equal(res.sessionId, 'sess-123');
  assert.equal(presets.length, 1);
  assert.equal(presets[0][1], 'read-only');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(archived, ['sess-123'], 'ephemeral session archived after dispose');
});
