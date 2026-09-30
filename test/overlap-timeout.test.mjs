import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { SessionRunner } from '../lib/runner.js';

test('SessionRunner terminates execution when timeoutSeconds is exceeded', async () => {
  const runner = new SessionRunner({});
  const task = {
    id: 'timeout-task',
    title: 'Hanging Script',
    type: 'script',
    prompt: 'sleep 3',
    timeoutSeconds: 1,
  };

  const start = Date.now();
  await assert.rejects(
    async () => {
      await runner.execute(task);
    },
    (err) => {
      assert.ok(err.message.includes('timed out') || err.message.includes('aborted'));
      return true;
    }
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2500, `Expected elapsed < 2500ms, got ${elapsed}ms`);
});

test('TaskScheduler overlapPolicy "skip" skips overlapping run and logs skipped status', async () => {
  const testPath = path.join('/tmp', `dsh-cron-overlap-skip-${Date.now()}.json`);
  const store = new TaskStore(testPath);
  let runCount = 0;

  const scheduler = new TaskScheduler(store, async (task) => {
    runCount++;
    await new Promise((r) => setTimeout(r, 100));
    return 'Done';
  });

  const task = store.set({
    title: 'Overlap Skip Task',
    schedule: 'every 10m',
    prompt: 'echo 1',
    status: 'active',
    overlapPolicy: 'skip',
  });

  // Start first run
  const p1 = scheduler.runTask(task.id);
  // Start second run immediately while first is running
  await scheduler.runTask(task.id);
  await p1;

  assert.equal(runCount, 1);
  const history = store.getHistory(task.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].status, 'success');
  assert.equal(history[1].status, 'skipped');

  scheduler.stopAll();
  try { fs.unlinkSync(testPath); } catch {}
});

test('TaskScheduler overlapPolicy "replace" aborts running task and runs new one', async () => {
  const testPath = path.join('/tmp', `dsh-cron-overlap-replace-${Date.now()}.json`);
  const store = new TaskStore(testPath);
  let firstAborted = false;
  let secondRan = false;

  const scheduler = new TaskScheduler(store, async (task, opts) => {
    if (!firstAborted) {
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          firstAborted = true;
          reject(new Error('Aborted by replace'));
        });
      });
    } else {
      secondRan = true;
      return 'Second complete';
    }
  });

  const task = store.set({
    title: 'Overlap Replace Task',
    schedule: 'every 10m',
    prompt: 'echo 1',
    status: 'active',
    overlapPolicy: 'replace',
  });

  // Start first run (will hang until aborted)
  const p1 = scheduler.runTask(task.id);
  // Give it a few ms to start
  await new Promise((r) => setTimeout(r, 20));

  // Trigger second run which replaces first
  const p2 = scheduler.runTask(task.id);

  await Promise.all([p1, p2]);
  assert.equal(firstAborted, true);
  assert.equal(secondRan, true);

  scheduler.stopAll();
  try { fs.unlinkSync(testPath); } catch {}
});

test('TaskScheduler overlapPolicy "queue" executes queued run after current finishes', async () => {
  const testPath = path.join('/tmp', `dsh-cron-overlap-queue-${Date.now()}.json`);
  const store = new TaskStore(testPath);
  let runs = 0;

  const scheduler = new TaskScheduler(store, async (task) => {
    runs++;
    await new Promise((r) => setTimeout(r, 50));
    return `Run ${runs}`;
  });

  const task = store.set({
    title: 'Overlap Queue Task',
    schedule: 'every 10m',
    prompt: 'echo 1',
    status: 'active',
    overlapPolicy: 'queue',
  });

  // Start first run
  const p1 = scheduler.runTask(task.id);
  // Queue second run
  await scheduler.runTask(task.id);
  await p1;

  // Wait for setImmediate queue to drain
  await new Promise((r) => setTimeout(r, 120));

  assert.equal(runs, 2);
  const history = store.getHistory(task.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].status, 'success');
  assert.equal(history[1].status, 'success');

  scheduler.stopAll();
  try { fs.unlinkSync(testPath); } catch {}
});

test('TaskStore persists timeoutSeconds and overlapPolicy', () => {
  const testPath = path.join('/tmp', `dsh-cron-store-timeout-${Date.now()}.json`);
  const store = new TaskStore(testPath);

  const t = store.set({
    title: 'Custom Task',
    schedule: '0 12 * * *',
    prompt: 'do work',
    timeoutSeconds: 600,
    overlapPolicy: 'replace',
  });

  assert.equal(t.timeoutSeconds, 600);
  assert.equal(t.overlapPolicy, 'replace');

  const reloaded = new TaskStore(testPath);
  const t2 = reloaded.get(t.id);
  assert.equal(t2.timeoutSeconds, 600);
  assert.equal(t2.overlapPolicy, 'replace');

  try { fs.unlinkSync(testPath); } catch {}
});
