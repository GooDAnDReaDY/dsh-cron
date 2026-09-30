import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleExpression, TaskScheduler } from '../lib/scheduler.js';
import { TaskStore } from '../lib/store.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('parseScheduleExpression handles ISO 8601 timestamps and relative delays', () => {
  // 1. ISO 8601 timestamp
  const isoStr = '2026-09-05T12:00:00.000Z';
  const parsedIso = parseScheduleExpression(isoStr);
  assert.equal(parsedIso.isOneShot, true);
  assert.equal(parsedIso.cronPattern, null);
  assert.equal(parsedIso.targetTimestamp, new Date(isoStr).getTime());

  // 2. Explicit "at: 2026-09-05T18:30:00Z"
  const atIso = 'at: 2026-09-05T18:30:00Z';
  const parsedAt = parseScheduleExpression(atIso);
  assert.equal(parsedAt.isOneShot, true);
  assert.equal(parsedAt.targetTimestamp, new Date('2026-09-05T18:30:00Z').getTime());

  // 3. Relative delay: "in 20m"
  const in20m = parseScheduleExpression('in 20m');
  assert.equal(in20m.isOneShot, true);
  const diffMin = (in20m.targetTimestamp - Date.now()) / 60000;
  assert.ok(diffMin >= 19.9 && diffMin <= 20.1);

  // 4. Relative delay: "через 2 часа"
  const in2h = parseScheduleExpression('через 2 часа');
  assert.equal(in2h.isOneShot, true);
  const diffHours = (in2h.targetTimestamp - Date.now()) / 3600000;
  assert.ok(diffHours >= 1.99 && diffHours <= 2.01);
});

test('One-shot task transitions to completed status after single execution', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-oneshot-test-'));
  const storePath = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(storePath);

  let executedCount = 0;
  const scheduler = new TaskScheduler(store, async (task) => {
    executedCount++;
    return 'Done once';
  });

  // Schedule task in 50ms
  const targetTime = Date.now() + 50;
  const isoTime = new Date(targetTime).toISOString();

  const task = store.set({
    title: 'One-shot test task',
    schedule: isoTime,
    prompt: 'echo 42',
    status: 'active'
  });

  scheduler.scheduleTask(task);

  // Wait 120ms for execution
  await new Promise((r) => setTimeout(r, 120));

  assert.equal(executedCount, 1);
  const updated = store.get(task.id);
  assert.equal(updated.status, 'completed');
  assert.equal(updated.lastStatus, 'success');
  assert.equal(updated.nextRunAt, null);

  scheduler.stopAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
