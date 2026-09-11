import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { applyTaskPatch, buildTaskPatch, isCodeTypeSwitch, describeTaskPatch } from '../lib/task-patch.js';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-patch-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

test('#49: a patch keeps the whitelist and re-parses the schedule', () => {
  const current = { id: 'cron_a', title: 'A', schedule: '0 4 * * *', prompt: 'x', type: 'script', status: 'paused' };

  const built = buildTaskPatch(current, { title: 'B', schedule: '*/5 * * * *', totalTokens: 999, running: true });
  assert.equal(built.ok, true);
  assert.equal(built.patch.title, 'B');
  assert.equal(built.patch.schedule, '*/5 * * * *');
  assert.equal(built.patch.scheduleText, 'Every 5 minutes');
  assert.equal(built.patch.totalTokens, undefined, 'server-owned bookkeeping is not patchable');
  assert.equal(built.patch.running, undefined);
});

test('#49: an invalid type change is refused before anything is written', () => {
  const current = { id: 'cron_a', title: 'A', schedule: '0 4 * * *', prompt: 'x', type: 'script', status: 'paused' };
  const built = buildTaskPatch(current, { type: 'docker' });
  assert.equal(built.ok, false);
  assert.match(built.error, /dockerImage/);
});

test('#49: code-executing switches are recognisable for the confirmation gate', () => {
  assert.equal(isCodeTypeSwitch({ type: 'llm' }, 'script'), true);
  assert.equal(isCodeTypeSwitch({ type: 'script' }, 'node'), false, 'already a code type');
  assert.equal(isCodeTypeSwitch({ type: 'script' }, 'llm'), false);
  assert.equal(isCodeTypeSwitch({ type: 'llm' }, undefined), false);
});

test('#49: applying a patch persists it and re-arms or pauses the task', (t) => {
  const { store, scheduler } = makeEnv(t);
  store.set({ id: 'cron_p', title: 'P', schedule: '0 4 * * *', prompt: 'echo p', type: 'script', status: 'paused' });

  const activated = applyTaskPatch({ store, scheduler, id: 'cron_p', body: { status: 'active', title: 'P renamed' } });
  assert.equal(activated.ok, true);
  assert.equal(activated.task.title, 'P renamed');
  assert.equal(store.get('cron_p').status, 'active');
  assert.equal(scheduler.jobs.has('cron_p'), true, 'an active task is armed');

  const paused = applyTaskPatch({ store, scheduler, id: 'cron_p', body: { status: 'paused' } });
  assert.equal(paused.ok, true);
  assert.equal(scheduler.jobs.has('cron_p'), false, 'pausing through a patch disarms it');
});

test('#49: patching a missing task reports it instead of creating one', (t) => {
  const { store, scheduler } = makeEnv(t);
  const result = applyTaskPatch({ store, scheduler, id: 'cron_missing', body: { title: 'x' } });
  assert.equal(result.ok, false);
  assert.equal(result.notFound, true);
  assert.equal(store.list({ status: 'all' }).length, 0, 'nothing was created');
});

test('#49: a patch summary names the changed fields', () => {
  assert.equal(describeTaskPatch({}, { title: 'B', schedule: '0 5 * * *', scheduleText: 'ignored' }), 'title="B", schedule="0 5 * * *"');
  assert.equal(describeTaskPatch({}, {}), 'no changes');
});
