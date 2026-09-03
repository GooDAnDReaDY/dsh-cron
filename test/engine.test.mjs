import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { parseScheduleExpression, describeCron, TaskScheduler } from '../lib/scheduler.js';

test('parseScheduleExpression handles intervals and friendly names', () => {
  const p1 = parseScheduleExpression('every 2m');
  assert.equal(p1.cronPattern, '*/2 * * * *');
  assert.equal(p1.humanText, 'Каждые 2 минут');

  const p2 = parseScheduleExpression('every 3h');
  assert.equal(p2.cronPattern, '0 */3 * * *');
  assert.equal(p2.humanText, 'Каждые 3 часов');

  const p3 = parseScheduleExpression('daily');
  assert.equal(p3.cronPattern, '0 9 * * *');

  const p4 = parseScheduleExpression('0 8 * * 1-5');
  assert.equal(p4.humanText, 'В будние дни в 08:00');
});

test('TaskStore CRUD and run recording', () => {
  const testPath = path.join('/tmp', `dsh-cron-test-${Date.now()}.json`);
  const store = new TaskStore(testPath);

  const t1 = store.set({
    title: 'Тестовая задача',
    schedule: '0 9 * * *',
    prompt: 'Сделай проверку',
  });
  assert.ok(t1.id);
  assert.equal(t1.title, 'Тестовая задача');

  const list = store.list();
  assert.equal(list.length, 1);

  store.recordRun(t1.id, {
    status: 'success',
    durationMs: 120,
    output: 'Все в порядке',
  });

  const updated = store.get(t1.id);
  assert.equal(updated.lastStatus, 'success');
  assert.equal(updated.lastDurationMs, 120);

  const history = store.getHistory(t1.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].output, 'Все в порядке');

  store.delete(t1.id);
  assert.equal(store.list().length, 0);

  try { fs.unlinkSync(testPath); } catch {}
});

test('TaskScheduler pause, resume and runTask execution', async () => {
  const testPath = path.join('/tmp', `dsh-cron-sched-${Date.now()}.json`);
  const store = new TaskStore(testPath);
  let ran = 0;

  const scheduler = new TaskScheduler(store, async (task) => {
    ran++;
    return 'Done ' + task.id;
  });

  const t = store.set({
    title: 'Periodic',
    schedule: 'every 10m',
    prompt: 'Check',
    status: 'active',
  });

  scheduler.scheduleTask(t);
  assert.ok(t.nextRunAt > Date.now());

  await scheduler.runTask(t.id);
  assert.equal(ran, 1);

  const paused = scheduler.pauseTask(t.id);
  assert.equal(paused.status, 'paused');

  const resumed = scheduler.resumeTask(t.id);
  assert.equal(resumed.status, 'active');

  scheduler.stopAll();
  try { fs.unlinkSync(testPath); } catch {}
});