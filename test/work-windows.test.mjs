import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHoursRange,
  normalizeWorkWindow,
  isInsideWorkWindow,
  getNextWindowStart,
} from '../lib/work-windows.js';

test('parseHoursRange handles day and overnight ranges correctly', () => {
  assert.equal(parseHoursRange(null), null);
  assert.equal(parseHoursRange('invalid'), null);
  assert.equal(parseHoursRange('25:00-05:00'), null);

  const day = parseHoursRange('09:00-18:00');
  assert.equal(day.startMinute, 540);
  assert.equal(day.endMinute, 1080);
  assert.equal(day.spansMidnight, false);

  const night = parseHoursRange('22:00-06:00');
  assert.equal(night.startMinute, 1320);
  assert.equal(night.endMinute, 360);
  assert.equal(night.spansMidnight, true);

  const short = parseHoursRange('23-7');
  assert.equal(short.startMinute, 1380);
  assert.equal(short.endMinute, 420);
  assert.equal(short.spansMidnight, true);
});

test('normalizeWorkWindow applies sensible defaults and offPeak preset', () => {
  assert.equal(normalizeWorkWindow(null), null);

  const norm = normalizeWorkWindow({
    offPeakOnly: true,
    outsidePolicy: 'DEFER',
    timeBoxMinutes: 45,
  });
  assert.equal(norm.enabled, true);
  assert.equal(norm.hours, '22:00-07:00');
  assert.equal(norm.outsidePolicy, 'defer');
  assert.equal(norm.timeBoxMinutes, 45);
});

test('isInsideWorkWindow checks day and overnight hours in UTC', () => {
  const dayWindow = { hours: '08:00-17:00', outsidePolicy: 'skip' };
  
  // 12:00 UTC
  const noon = new Date(Date.UTC(2026, 10, 3, 12, 0, 0));
  assert.equal(isInsideWorkWindow(dayWindow, noon, 'UTC').inside, true);

  // 20:00 UTC
  const evening = new Date(Date.UTC(2026, 10, 3, 20, 0, 0));
  assert.equal(isInsideWorkWindow(dayWindow, evening, 'UTC').inside, false);

  const nightWindow = { hours: '22:00-06:00', outsidePolicy: 'skip' };
  // 23:30 UTC -> inside
  const lateNight = new Date(Date.UTC(2026, 10, 3, 23, 30, 0));
  assert.equal(isInsideWorkWindow(nightWindow, lateNight, 'UTC').inside, true);

  // 03:15 UTC -> inside
  const earlyMorning = new Date(Date.UTC(2026, 10, 3, 3, 15, 0));
  assert.equal(isInsideWorkWindow(nightWindow, earlyMorning, 'UTC').inside, true);

  // 14:00 UTC -> outside
  const afternoon = new Date(Date.UTC(2026, 10, 3, 14, 0, 0));
  assert.equal(isInsideWorkWindow(nightWindow, afternoon, 'UTC').inside, false);
});

test('isInsideWorkWindow respects daysOfWeek filtering', () => {
  // 2026-11-03 is Tuesday (day 2 in 0=Sun..6=Sat)
  const tuesday = new Date(Date.UTC(2026, 10, 3, 12, 0, 0));
  
  // Only Monday (1) allowed
  const mondayOnly = { daysOfWeek: [1] };
  assert.equal(isInsideWorkWindow(mondayOnly, tuesday, 'UTC').inside, false);

  // Tuesday (2) and Thursday (4) allowed
  const tueThu = { daysOfWeek: [2, 4] };
  assert.equal(isInsideWorkWindow(tueThu, tuesday, 'UTC').inside, true);
});

test('getNextWindowStart finds future opening timestamp', () => {
  const window = { hours: '22:00-06:00' };
  // 12:00 UTC -> next opening should be 22:00 UTC on same day
  const noon = new Date(Date.UTC(2026, 10, 3, 12, 0, 0));
  const nextStart = getNextWindowStart(window, noon, 'UTC');

  assert.ok(nextStart > noon.getTime(), 'Next start should be in future');
  const nextDate = new Date(nextStart);
  assert.equal(isInsideWorkWindow(window, nextDate, 'UTC').inside, true);
});
