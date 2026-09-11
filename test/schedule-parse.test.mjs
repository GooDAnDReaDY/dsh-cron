import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleExpression } from '../lib/scheduler.js';

/**
 * #97: the parser was split into per-branch helpers, so these tests pin the
 * branch precedence and the error paths that the split must not have changed.
 */

test('#97: an empty schedule is refused before any branch is tried', () => {
  assert.throws(() => parseScheduleExpression(''), /must not be empty/);
  assert.throws(() => parseScheduleExpression('   '), /must not be empty/);
  assert.throws(() => parseScheduleExpression(undefined), /must not be empty/);
});

test('#97: a timestamp wins over the cron fallback', () => {
  const parsed = parseScheduleExpression('2030-01-02T03:04:05Z');
  assert.equal(parsed.isOneShot, true);
  assert.equal(parsed.cronPattern, null);
  assert.equal(parsed.targetTimestamp, Date.parse('2030-01-02T03:04:05Z'));
});

test('#97: a range in a cron expression is not mistaken for a date', () => {
  const parsed = parseScheduleExpression('0 4 * * 1-5');
  assert.equal(parsed.cronPattern, '0 4 * * 1-5');
  assert.equal(parsed.isOneShot, undefined);
  assert.equal(parsed.humanText, 'Weekdays at 04:00');
});

test('#97: intervals and aliases resolve to the documented cron patterns', () => {
  assert.equal(parseScheduleExpression('every 5m').cronPattern, '*/5 * * * *');
  assert.equal(parseScheduleExpression('every 2h').cronPattern, '0 */2 * * *');
  assert.equal(parseScheduleExpression('every 1d').cronPattern, '0 0 */1 * *');
  assert.equal(parseScheduleExpression('@every 10m').cronPattern, '*/10 * * * *');
  assert.equal(parseScheduleExpression('каждый день').cronPattern, '0 9 * * *');
  assert.equal(parseScheduleExpression('по будням').cronPattern, '0 9 * * 1-5');
  assert.equal(parseScheduleExpression('каждый час').cronPattern, '0 * * * *');
});

test('#97: a relative one-shot keeps its delay and human text', () => {
  const parsed = parseScheduleExpression('in 30s');
  assert.equal(parsed.isOneShot, true);
  assert.ok(parsed.targetTimestamp > Date.now(), 'the target is in the future');
  assert.match(parsed.humanText, /One-shot in 30 sec/);
});

test('#97: an unparseable string fails through the cron branch', () => {
  assert.throws(() => parseScheduleExpression('not a schedule'), /Invalid cron schedule/);
  assert.throws(() => parseScheduleExpression('99 99 99 99 99'), /Invalid cron schedule/);
});
