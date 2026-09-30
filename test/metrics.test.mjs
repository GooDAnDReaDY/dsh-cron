import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { renderMetrics, createMetricsHandler, escapeLabel, METRICS_CONTENT_TYPE } from '../lib/metrics.js';

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);
const Q = '"';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), 'dsh-cron-metrics-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch (err) {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: null,
    body: null,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers || null; },
    end(payload) { this.body = payload === undefined ? null : String(payload); },
  };
}

test('#53: metrics carry task counts, durations and run counters', () => {
  const body = renderMetrics({
    tasks: [
      { id: 'cron_a', status: 'active', lastDurationMs: 2500, lastRunAt: 1 },
      { id: 'cron_b', status: 'paused' },
      { id: 'cron_c', status: 'active', lastDurationMs: 0, lastRunAt: 2 },
      { id: 'cron_never', status: 'active', lastDurationMs: 0 },
    ],
    stats: { totalRuns: 7 },
    runCounters: { success: 4, error: 1 },
  });
  assert.ok(body.includes('# TYPE dsh_cron_tasks_total gauge'), 'the task counter is typed');
  assert.ok(body.includes('dsh_cron_tasks_total{status=' + Q + 'active' + Q + '} 3'));
  assert.ok(body.includes('dsh_cron_tasks_total{status=' + Q + 'paused' + Q + '} 1'));
  assert.ok(body.includes('dsh_cron_task_last_duration_seconds{task=' + Q + 'cron_a' + Q + '} 2.5'));
  assert.ok(body.includes('dsh_cron_task_last_duration_seconds{task=' + Q + 'cron_c' + Q + '} 0'));
  assert.ok(!body.includes('{task=' + Q + 'cron_b' + Q + '}'), 'no duration sample without a finished run');
  assert.ok(!body.includes('{task=' + Q + 'cron_never' + Q + '}'), 'a task that never ran has no duration');
  assert.ok(body.includes('# TYPE dsh_cron_runs_total counter'));
  assert.ok(body.includes('dsh_cron_runs_total{status=' + Q + 'success' + Q + '} 4'));
  assert.ok(body.includes('dsh_cron_runs_total{status=' + Q + 'error' + Q + '} 1'));
  assert.ok(body.includes('dsh_cron_runs_total{status=' + Q + 'missed' + Q + '} 0'), 'a status with no runs is exported');
  assert.ok(body.includes('dsh_cron_run_records 7'));
  assert.ok(body.endsWith(NL), 'the exposition ends with a newline');
});

test('#53: label values are escaped for the text format', () => {
  assert.equal(escapeLabel('plain'), 'plain');
  assert.equal(escapeLabel('a' + BS + 'b'), 'a' + BS + BS + 'b');
  assert.equal(escapeLabel('say ' + Q + 'hi' + Q), 'say ' + BS + Q + 'hi' + BS + Q);
  const body = renderMetrics({ tasks: [{ id: 'cron_' + Q + 'x' + Q, status: 'active', lastDurationMs: 1, lastRunAt: 1 }] });
  assert.ok(body.includes('{task=' + Q + 'cron_' + BS + Q + 'x' + BS + Q + Q + '}'), 'a quote cannot break the exposition');
});

test('#53: the endpoint answers GET and refuses writes', async (t) => {
  const { store, scheduler } = makeEnv(t);
  store.set({ id: 'cron_g', title: 'G', schedule: '0 4 * * *', prompt: 'echo g', type: 'script', status: 'active', lastDurationMs: 120, lastRunAt: Date.now() });
  const handler = createMetricsHandler({ store, scheduler });

  const ok = mockRes();
  await handler({ method: 'GET', url: '/dsh-cron/metrics', headers: {} }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['Content-Type'], METRICS_CONTENT_TYPE);
  assert.ok(ok.body.includes('dsh_cron_tasks_total{status=' + Q + 'active' + Q + '} 1'));
  assert.ok(ok.body.includes('dsh_cron_task_last_duration_seconds{task=' + Q + 'cron_g' + Q + '} 0.12'));
  assert.ok(!ok.body.includes('echo g'), 'run output and prompts never reach the metrics');

  const denied = mockRes();
  await handler({ method: 'POST', url: '/dsh-cron/metrics', headers: {} }, denied);
  assert.equal(denied.statusCode, 405);

  const head = mockRes();
  await handler({ method: 'HEAD', url: '/dsh-cron/metrics', headers: {} }, head);
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, null, 'HEAD answers without a body');
});

test('#53: the scheduler counts finished and skipped runs', (t) => {
  const { store, scheduler } = makeEnv(t);
  const task = store.set({ id: 'cron_s', title: 'S', schedule: '0 4 * * *', prompt: 'echo s', type: 'script', status: 'paused' });

  scheduler.recordSkipped('cron_s', 'overlap');
  scheduler.finishRun(task, 'cron_s', 'success', 0);
  scheduler.finishRun(task, 'cron_s', 'error', 0);

  assert.deepEqual(scheduler.getRunCounters(), { skipped: 1, success: 1, error: 1 });
  const counters = scheduler.getRunCounters();
  counters.success = 999;
  assert.equal(scheduler.getRunCounters().success, 1, 'callers get a copy, not the live counters');
});
