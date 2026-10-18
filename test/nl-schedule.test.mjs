import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalSchedule, parseTimeString } from '../lib/nl-schedule.js';
import { parseScheduleExpression, previewSchedule } from '../lib/scheduler.js';
import { executeCronTool } from '../lib/cron-tool.js';

test('parseTimeString parses various 24h, 12h, and Russian qualifiers', () => {
  assert.deepEqual(parseTimeString('9:00'), { hour: 9, minute: 0 });
  assert.deepEqual(parseTimeString('14:30'), { hour: 14, minute: 30 });
  assert.deepEqual(parseTimeString('23:59'), { hour: 23, minute: 59 });
  assert.deepEqual(parseTimeString('9am'), { hour: 9, minute: 0 });
  assert.deepEqual(parseTimeString('9:30am'), { hour: 9, minute: 30 });
  assert.deepEqual(parseTimeString('6pm'), { hour: 18, minute: 0 });
  assert.deepEqual(parseTimeString('11:45pm'), { hour: 23, minute: 45 });
  assert.deepEqual(parseTimeString('12am'), { hour: 0, minute: 0 });
  assert.deepEqual(parseTimeString('12pm'), { hour: 12, minute: 0 });
  assert.deepEqual(parseTimeString('9 утра'), { hour: 9, minute: 0 });
  assert.deepEqual(parseTimeString('2 дня'), { hour: 14, minute: 0 });
  assert.deepEqual(parseTimeString('6 вечера'), { hour: 18, minute: 0 });
  assert.deepEqual(parseTimeString('11 вечера'), { hour: 23, minute: 0 });
  assert.deepEqual(parseTimeString('1 ночи'), { hour: 1, minute: 0 });
  assert.deepEqual(parseTimeString('14'), { hour: 14, minute: 0 });
  assert.equal(parseTimeString('invalid'), null);
  assert.equal(parseTimeString('25:00'), null);
});

test('parseNaturalSchedule parses daily expressions (EN and RU)', () => {
  const ru1 = parseNaturalSchedule('каждый день в 9:00');
  assert.ok(ru1);
  assert.equal(ru1.cronPattern, '0 9 * * *');
  assert.equal(ru1.humanText, 'Every day at 09:00');
  assert.ok(ru1.nextRun > 0);

  const ru2 = parseNaturalSchedule('ежедневно в 14:30');
  assert.equal(ru2?.cronPattern, '30 14 * * *');

  const en1 = parseNaturalSchedule('every day at 9am');
  assert.equal(en1?.cronPattern, '0 9 * * *');

  const en2 = parseNaturalSchedule('daily at 6pm');
  assert.equal(en2?.cronPattern, '0 18 * * *');

  const rev1 = parseNaturalSchedule('в 18:30 каждый день');
  assert.equal(rev1?.cronPattern, '30 18 * * *');
});

test('parseNaturalSchedule parses weekdays and weekends (EN and RU)', () => {
  const wd1 = parseNaturalSchedule('по будням в 10:00');
  assert.equal(wd1?.cronPattern, '0 10 * * 1-5');
  assert.equal(wd1?.humanText, 'Weekdays at 10:00');

  const wd2 = parseNaturalSchedule('в будние дни в 18:30');
  assert.equal(wd2?.cronPattern, '30 18 * * 1-5');

  const wd3 = parseNaturalSchedule('every weekday at 6:30pm');
  assert.equal(wd3?.cronPattern, '30 18 * * 1-5');

  const wd4 = parseNaturalSchedule('weekdays at 9am');
  assert.equal(wd4?.cronPattern, '0 9 * * 1-5');

  const we1 = parseNaturalSchedule('по выходным в 12:00');
  assert.equal(we1?.cronPattern, '0 12 * * 0,6');

  const we2 = parseNaturalSchedule('every weekend at 10am');
  assert.equal(we2?.cronPattern, '0 10 * * 0,6');
});

test('parseNaturalSchedule parses specific days of the week', () => {
  assert.equal(parseNaturalSchedule('по понедельникам в 9:00')?.cronPattern, '0 9 * * 1');
  assert.equal(parseNaturalSchedule('каждую пятницу в 18:00')?.cronPattern, '0 18 * * 5');
  assert.equal(parseNaturalSchedule('every Monday at 9am')?.cronPattern, '0 9 * * 1');
  assert.equal(parseNaturalSchedule('on fridays at 6pm')?.cronPattern, '0 18 * * 5');
  assert.equal(parseNaturalSchedule('every sunday at 11:30am')?.cronPattern, '30 11 * * 0');
  assert.equal(parseNaturalSchedule('по средам')?.cronPattern, '0 9 * * 3');
});

test('parseNaturalSchedule parses intervals, hourly, midnight, and noon', () => {
  assert.equal(parseNaturalSchedule('каждый час')?.cronPattern, '0 * * * *');
  assert.equal(parseNaturalSchedule('every hour')?.cronPattern, '0 * * * *');
  assert.equal(parseNaturalSchedule('в полночь')?.cronPattern, '0 0 * * *');
  assert.equal(parseNaturalSchedule('at midnight')?.cronPattern, '0 0 * * *');
  assert.equal(parseNaturalSchedule('в полдень')?.cronPattern, '0 12 * * *');
  assert.equal(parseNaturalSchedule('at noon')?.cronPattern, '0 12 * * *');
  assert.equal(parseNaturalSchedule('каждые 15 минут')?.cronPattern, '*/15 * * * *');
  assert.equal(parseNaturalSchedule('каждые 2 часа')?.cronPattern, '0 */2 * * *');
  assert.equal(parseNaturalSchedule('каждые полчаса')?.cronPattern, '*/30 * * * *');
});

test('parseNaturalSchedule parses monthly expressions', () => {
  assert.equal(parseNaturalSchedule('каждое 1 число в 9:00')?.cronPattern, '0 9 1 * *');
  assert.equal(parseNaturalSchedule('on the 15th of every month at 10:00')?.cronPattern, '0 10 15 * *');
  assert.equal(parseNaturalSchedule('15 числа каждого месяца в 12:00')?.cronPattern, '0 12 15 * *');
});

test('parseScheduleExpression transparently parses natural language expressions', () => {
  const p1 = parseScheduleExpression('каждый день в 9:00');
  assert.equal(p1.cronPattern, '0 9 * * *');
  assert.equal(p1.humanText, 'Every day at 09:00');

  const p2 = parseScheduleExpression('every weekday at 10:00');
  assert.equal(p2.cronPattern, '0 10 * * 1-5');

  const p3 = parseScheduleExpression('через 20 минут');
  assert.equal(p3.isOneShot, true);

  const preview = previewSchedule('каждый день в 9:00', { count: 3 });
  assert.equal(preview.isOneShot, false);
  assert.equal(preview.cronPattern, '0 9 * * *');
  assert.equal(preview.runs.length, 3);
});

test('executeCronTool accepts natural language schedule on task create', async () => {
  const fakeTasks = new Map();
  const fakeStore = {
    get(id) { return fakeTasks.get(id); },
    set(rec) { fakeTasks.set(rec.id, rec); return rec; },
  };
  const scheduled = [];
  const fakeScheduler = {
    scheduleTask(t) { scheduled.push(t); },
  };

  const result = await executeCronTool(fakeStore, fakeScheduler, {
    action: 'create',
    title: 'Morning Report',
    schedule: 'каждый день в 9:00',
    prompt: 'Check logs and notify channel',
  });

  assert.equal(result.success, true);
  assert.ok(result.task);
  assert.equal(result.task.schedule, '0 9 * * *');
  assert.equal(result.task.scheduleText, 'Every day at 09:00');
  assert.equal(scheduled.length, 1);
});
