import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIntervalMs,
  formatInterval,
  sanitizeAdaptiveConfig,
  evaluateAdaptiveRun,
  calculateNextAdaptiveState,
} from '../lib/adaptive.js';
import { logStreamer, LogStreamer } from '../lib/log-streamer.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { EventEmitter } from 'node:events';

test('Pack 22: parseIntervalMs and formatInterval handle human strings and numbers', () => {
  assert.equal(parseIntervalMs('30s'), 30000);
  assert.equal(parseIntervalMs('5m'), 300000);
  assert.equal(parseIntervalMs('2h'), 7200000);
  assert.equal(parseIntervalMs('1d'), 86400000);
  assert.equal(parseIntervalMs(15000), 15000);
  assert.equal(parseIntervalMs('invalid', 60000), 60000);

  assert.equal(formatInterval(30000), '30s');
  assert.equal(formatInterval(300000), '5m');
  assert.equal(formatInterval(7200000), '2h');
  assert.equal(formatInterval(7320000), '2h 2m');
});

test('Pack 22: sanitizeAdaptiveConfig validates and supplies defaults', () => {
  const nullRes = sanitizeAdaptiveConfig(null);
  assert.equal(nullRes, null);

  const defaults = sanitizeAdaptiveConfig({ enabled: true });
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.minInterval, '5m');
  assert.equal(defaults.maxInterval, '2h');
  assert.equal(defaults.backoffFactor, 1.5);
  assert.equal(defaults.idleRunsThreshold, 3);
  assert.equal(defaults.detectUnchangedOutput, true);

  const custom = sanitizeAdaptiveConfig({
    enabled: true,
    minInterval: '1m',
    maxInterval: '30m',
    backoffFactor: 2,
    idleRunsThreshold: 2,
    detectUnchangedOutput: false,
  });
  assert.equal(custom.minInterval, '1m');
  assert.equal(custom.maxInterval, '30m');
  assert.equal(custom.backoffFactor, 2);
  assert.equal(custom.idleRunsThreshold, 2);
  assert.equal(custom.detectUnchangedOutput, false);
});

test('Pack 22: evaluateAdaptiveRun detects idle vs active runs', () => {
  const task = { adaptive: { detectUnchangedOutput: true } };

  // 1. Silent skip
  const resSilent = evaluateAdaptiveRun(task, { status: 'silentSkip' }, { silentSkip: true }, null);
  assert.equal(resSilent.isIdle, true);
  assert.equal(resSilent.reason, 'silent_rule');

  // 2. Unchanged output
  const resUnchanged = evaluateAdaptiveRun(
    task,
    { status: 'success', output: 'no news today' },
    {},
    { output: 'no news today' }
  );
  assert.equal(resUnchanged.isIdle, true);
  assert.equal(resUnchanged.reason, 'unchanged_output');

  // 3. Changed / active output
  const resActive = evaluateAdaptiveRun(
    task,
    { status: 'success', output: 'breaking news!' },
    {},
    { output: 'no news today' }
  );
  assert.equal(resActive.isIdle, false);
  assert.equal(resActive.reason, 'active_output');
});

test('Pack 22: calculateNextAdaptiveState scales exponentially after threshold and resets instantly on change', () => {
  const task = {
    adaptive: {
      enabled: true,
      minInterval: '1m', // 60,000 ms
      maxInterval: '10m', // 600,000 ms
      backoffFactor: 2,
      idleRunsThreshold: 2,
    },
    adaptiveState: null,
  };

  // Run 1: idle run 1 (< threshold 2)
  let state = calculateNextAdaptiveState(task, true);
  assert.equal(state.idleCount, 1);
  assert.equal(state.backedOff, false);
  assert.equal(state.currentIntervalMs, 60000);
  task.adaptiveState = state;

  // Run 2: idle run 2 (reaches threshold 2 -> triggers backoff: 60s * 2 = 120s)
  state = calculateNextAdaptiveState(task, true);
  assert.equal(state.idleCount, 2);
  assert.equal(state.backedOff, true);
  assert.equal(state.currentIntervalMs, 120000);
  task.adaptiveState = state;

  // Run 3: idle run 3 -> 120s * 2 = 240s
  state = calculateNextAdaptiveState(task, true);
  assert.equal(state.idleCount, 3);
  assert.equal(state.backedOff, true);
  assert.equal(state.currentIntervalMs, 240000);
  task.adaptiveState = state;

  // Run 4: idle run 4 -> 240s * 2 = 480s
  state = calculateNextAdaptiveState(task, true);
  assert.equal(state.idleCount, 4);
  assert.equal(state.currentIntervalMs, 480000);
  task.adaptiveState = state;

  // Run 5: idle run 5 -> 480s * 2 = 960s -> capped at maxInterval 10m (600,000 ms)
  state = calculateNextAdaptiveState(task, true);
  assert.equal(state.idleCount, 5);
  assert.equal(state.currentIntervalMs, 600000);
  task.adaptiveState = state;

  // Run 6: REAL CHANGE DETECTED (isIdle = false) -> instant reset to minInterval (60,000 ms)
  state = calculateNextAdaptiveState(task, false);
  assert.equal(state.idleCount, 0);
  assert.equal(state.backedOff, false);
  assert.equal(state.currentIntervalMs, 60000);
  assert.equal(state.effectiveIntervalStr, '1m');
});

test('Pack 22: LogStreamer captures stdout/stderr ring buffer and broadcasts to SSE subscribers', () => {
  const streamer = new LogStreamer();
  const taskId = 'task-stream-test';

  const entry = streamer.startStream(taskId, 'run-123');
  assert.equal(entry.taskId, taskId);
  assert.equal(entry.runId, 'run-123');

  // Append logs
  streamer.appendLog(taskId, 'Step 1: starting build\n', 'stdout');
  streamer.appendLog(taskId, 'Warning: low disk\n', 'stderr');

  assert.equal(entry.buffer.length, 2);
  assert.equal(entry.buffer[0].chunk, 'Step 1: starting build\n');
  assert.equal(entry.buffer[0].stream, 'stdout');
  assert.equal(entry.buffer[1].chunk, 'Warning: low disk\n');
  assert.equal(entry.buffer[1].stream, 'stderr');

  // Test SSE subscription
  const written = [];
  const mockRes = {
    writeHead: () => {},
    write: (data) => written.push(data),
    end: () => written.push('END'),
  };
  const mockReq = new EventEmitter();

  streamer.handleSseRequest(taskId, mockReq, mockRes);

  // Initial event sent
  assert.ok(written.length >= 1);
  assert.ok(written[0].includes('event: init'));
  assert.ok(written[0].includes('run-123'));

  // Live log chunk broadcast
  streamer.appendLog(taskId, 'Step 2: build passed\n', 'stdout');
  assert.ok(written.some((w) => w.includes('Step 2: build passed')));

  // Complete stream
  streamer.completeStream(taskId, { status: 'success', exitCode: 0 });
  assert.ok(written.some((w) => w.includes('event: complete')));
  assert.ok(written.includes('END'));
});

test('Pack 22: LogStreamer ring buffer drops oldest entries past 500 lines', () => {
  const streamer = new LogStreamer();
  const taskId = 'task-ring-overflow';

  streamer.startStream(taskId, 'run-overflow');
  for (let i = 0; i < 550; i++) {
    streamer.appendLog(taskId, `line ${i}\n`, 'stdout');
  }

  const stream = streamer.getStream(taskId);
  assert.equal(stream.buffer.length, 500);
  assert.equal(stream.buffer[0].chunk, 'line 50\n');
  assert.equal(stream.buffer[499].chunk, 'line 549\n');
});
