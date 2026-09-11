import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import {
  buildConfigJob,
  diffConfigJob,
  planConfigSync,
  applyConfigSync,
  MANAGED_BY_CONFIG,
} from '../lib/config-jobs.js';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), 'dsh-cron-configjobs-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch (err) {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

function quietLog() {
  const lines = { log: [], warn: [], error: [] };
  return {
    lines,
    log: (m) => lines.log.push(String(m)),
    warn: (m) => lines.warn.push(String(m)),
    error: (m) => lines.error.push(String(m)),
  };
}

const JOB = { id: 'cron_nightly', title: 'Nightly report', schedule: '0 3 * * *', prompt: 'summarise', type: 'llm' };

// ------------------------------------------------------------- validation

test('#50: a declared job is normalised into a config-owned task', () => {
  const built = buildConfigJob(JOB, 0);
  assert.equal(built.ok, true);
  assert.equal(built.job.id, 'cron_nightly');
  assert.equal(built.job.type, 'llm');
  assert.equal(built.job.status, 'active');
  assert.equal(built.job.schedule, '0 3 * * *');
  assert.equal(built.job.scheduleText, 'Every day at 03:00');
  assert.equal(built.job.managedBy, MANAGED_BY_CONFIG);
});

test('#50: one broken entry is rejected with its index and a reason', () => {
  assert.match(buildConfigJob({ title: 'x', schedule: '0 3 * * *' }, 2).error, /config\.jobs\[2\]: id is required/);
  assert.match(buildConfigJob({ id: 'a', schedule: '0 3 * * *' }, 0).error, /title is required/);
  assert.match(buildConfigJob({ id: 'a', title: 'A' }, 0).error, /schedule is required/);
  assert.match(buildConfigJob({ ...JOB, schedule: 'not a schedule' }, 0).error, /invalid schedule/);
  assert.match(buildConfigJob({ ...JOB, channels: ['telegram', 'email'] }, 0).error, /unknown channel ids: email/);
  assert.equal(buildConfigJob(null, 0).ok, false);
});

test('#50: a job may be staged as paused and may use a one-shot schedule', () => {
  const paused = buildConfigJob({ ...JOB, status: 'paused' }, 0);
  assert.equal(paused.job.status, 'paused');

  const once = buildConfigJob({ ...JOB, schedule: '2030-01-02T03:04:05Z' }, 0);
  assert.equal(once.ok, true);
  assert.equal(once.job.oneShot, true);
  assert.equal(once.job.schedule, '2030-01-02T03:04:05Z');
});

test('#50: an entry keeps its id declared even when the rest is invalid', (t) => {
  const { store, scheduler } = makeEnv(t);
  const log = quietLog();
  applyConfigSync({ store, scheduler, entries: [JOB], log });
  assert.equal(store.get('cron_nightly').managedBy, MANAGED_BY_CONFIG);

  // A typo in one field must not read as "the job left the config": the
  // working task and its history have to survive.
  const summary = applyConfigSync({
    store,
    scheduler,
    entries: [{ ...JOB, schedule: 'nonsense' }],
    log,
  });
  assert.equal(summary.removed, 0);
  assert.equal(summary.skipped, 1);
  assert.ok(store.get('cron_nightly'), 'the previously synced task is still there');

  const plan = planConfigSync([{ id: 'cron_nightly', schedule: 'nonsense' }], [{ id: 'cron_nightly', managedBy: MANAGED_BY_CONFIG }]);
  assert.deepEqual(plan.remove, [], 'an invalid entry is not a removal');
});

test('#50: a job whose payload is the prompt cannot declare an empty one', () => {
  assert.match(buildConfigJob({ ...JOB, type: 'script', prompt: undefined }, 0).error, /script jobs require a non-empty prompt/);
  assert.match(buildConfigJob({ ...JOB, type: 'script', prompt: '   ' }, 0).error, /non-empty prompt/);
  assert.equal(buildConfigJob({ ...JOB, type: 'script', prompt: 'echo hi' }, 0).ok, true);
  // ssh and docker describe how to connect, not what to run: without a prompt
  // the runner would execute `true` and report success.
  assert.match(buildConfigJob({ type: 'ssh', id: 'a', title: 'A', schedule: '0 4 * * *', sshTarget: 'user@host' }, 0).error, /ssh jobs require a non-empty prompt/);
  assert.match(buildConfigJob({ type: 'docker', id: 'a', title: 'A', schedule: '0 4 * * *', dockerImage: 'image' }, 0).error, /docker jobs require a non-empty prompt/);
  assert.equal(buildConfigJob({ type: 'ssh', id: 'a', title: 'A', schedule: '0 4 * * *', sshTarget: 'user@host', prompt: 'uptime' }, 0).ok, true);
  // http carries its payload in httpUrl, so the prompt stays optional there.
  assert.equal(buildConfigJob({ ...JOB, type: 'http', prompt: undefined, httpUrl: 'http://127.0.0.1:9/ping' }, 0).ok, true);
});

test('#50: a runtime type keeps its own required fields', () => {
  const docker = buildConfigJob({ ...JOB, type: 'docker' }, 0);
  assert.equal(docker.ok, false);
  assert.match(docker.error, /dockerImage/);
});

// ----------------------------------------------------------------- plan

test('#50: the plan creates, updates, skips and removes by ownership', () => {
  const stored = [
    { id: 'cron_same', managedBy: MANAGED_BY_CONFIG, title: 'Same', type: 'llm', schedule: '0 3 * * *', scheduleText: 'Every day at 03:00', prompt: 'summarise', status: 'active', oneShot: false },
    { id: 'cron_stale', managedBy: MANAGED_BY_CONFIG, title: 'Stale', type: 'llm', status: 'active' },
    { id: 'cron_user', managedBy: undefined, title: 'User task', type: 'llm', status: 'active' },
  ];
  const plan = planConfigSync([
    { id: 'cron_same', title: 'Same', schedule: '0 3 * * *', prompt: 'summarise', type: 'llm' },
    { id: 'cron_new', title: 'New', schedule: '*/15 * * * *', prompt: 'check', type: 'llm' },
    { id: 'cron_user', title: 'Trying to take over', schedule: '0 4 * * *', prompt: 'x', type: 'llm' },
  ], stored);

  assert.deepEqual(plan.create.map((job) => job.id), ['cron_new']);
  assert.deepEqual(plan.update, [], 'a job that already matches is not rewritten');
  assert.deepEqual(plan.remove, ['cron_stale'], 'a config job that vanished from the file is removed');
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].error, /not managed by the config/);
});

test('#50: a changed field turns into an update, not a rewrite', () => {
  const stored = [{ id: 'cron_a', managedBy: MANAGED_BY_CONFIG, title: 'Old', type: 'llm', schedule: '0 3 * * *', scheduleText: 'Every day at 03:00', prompt: 'p', status: 'active', oneShot: false }];
  const plan = planConfigSync([{ id: 'cron_a', title: 'New', schedule: '0 3 * * *', prompt: 'p', type: 'llm' }], stored);
  assert.equal(plan.update.length, 1);
  assert.deepEqual(plan.update[0].changed, ['title']);

  const identical = planConfigSync([{ id: 'cron_a', title: 'Old', schedule: '0 3 * * *', prompt: 'p', type: 'llm' }], stored);
  assert.deepEqual(identical.update, []);
});

test('#50: a code-executing config job is announced, not hidden', () => {
  const plan = planConfigSync([{ id: 'cron_s', title: 'S', schedule: '0 3 * * *', prompt: 'echo hi', type: 'script' }], []);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /executes code \(script\)/);
});

// ---------------------------------------------------------------- apply

test('#50: applying the plan creates, arms, updates and removes', (t) => {
  const { store, scheduler } = makeEnv(t);
  const log = quietLog();

  const first = applyConfigSync({ store, scheduler, entries: [JOB], log });
  assert.deepEqual(first, { created: 1, updated: 0, removed: 0, skipped: 0 });
  assert.equal(store.get('cron_nightly').managedBy, MANAGED_BY_CONFIG);
  assert.equal(scheduler.jobs.has('cron_nightly'), true, 'a declared job is armed');

  const second = applyConfigSync({ store, scheduler, entries: [{ ...JOB, title: 'Renamed' }], log });
  assert.equal(second.updated, 1);
  assert.equal(store.get('cron_nightly').title, 'Renamed');
  assert.equal(store.list({ status: 'all' }).length, 1, 'an update does not duplicate');

  const third = applyConfigSync({ store, scheduler, entries: [], log });
  assert.equal(third.removed, 1);
  assert.equal(store.get('cron_nightly'), undefined);
  assert.equal(scheduler.jobs.has('cron_nightly'), false, 'a removed job is disarmed');
});

test('#50: a user task keeps its id, and a paused job stays paused', (t) => {
  const { store, scheduler } = makeEnv(t);
  const log = quietLog();
  store.set({ id: 'cron_mine', title: 'Mine', schedule: '0 5 * * *', prompt: 'p', type: 'llm', status: 'active' });

  const summary = applyConfigSync({
    store,
    scheduler,
    entries: [
      { id: 'cron_mine', title: 'Takeover', schedule: '0 4 * * *', prompt: 'x', type: 'llm' },
      { ...JOB, id: 'cron_staged', status: 'paused' },
    ],
    log,
  });
  assert.equal(summary.created, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(store.get('cron_mine').title, 'Mine', 'the user task is untouched');
  assert.equal(store.get('cron_staged').status, 'paused');
  assert.equal(scheduler.jobs.has('cron_staged'), false, 'a staged job is not armed');
  assert.ok(log.lines.error.some((line) => line.includes('not managed by the config')));
});

test('#50: a broken entry does not stop the other jobs from syncing', (t) => {
  const { store, scheduler } = makeEnv(t);
  const log = quietLog();
  const summary = applyConfigSync({
    store,
    scheduler,
    entries: [{ id: 'broken', title: 'Broken', schedule: 'nonsense', prompt: 'x', type: 'llm' }, JOB],
    log,
  });
  assert.deepEqual(summary, { created: 1, updated: 0, removed: 0, skipped: 1 });
  assert.equal(store.get('cron_nightly').managedBy, MANAGED_BY_CONFIG);
  assert.equal(store.get('broken'), undefined);
  assert.ok(log.lines.error.some((line) => line.includes('invalid schedule')));
});

test('#50: the field diff ignores identity and ownership', () => {
  assert.deepEqual(diffConfigJob({ id: 'a', managedBy: 'config', title: 'A' }, { id: 'a', managedBy: 'config', title: 'A' }), []);
  assert.deepEqual(diffConfigJob({ id: 'a', managedBy: 'config', channels: ['slack'] }, { id: 'a', managedBy: 'config', channels: ['slack'] }), []);
  assert.deepEqual(diffConfigJob({ id: 'a', managedBy: 'config', channels: ['slack'] }, { id: 'a', managedBy: 'config', channels: ['ntfy'] }), ['channels']);
});
