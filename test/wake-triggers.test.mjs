import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  normalizeWakeTrigger,
  isSafeWakePath,
  isProcessAlive,
  matchPattern,
  countMatchingFiles,
  WakeTriggerManager,
} from '../lib/wake-triggers.js';

test('normalizeWakeTrigger normalizes valid configs and rejects invalid ones', () => {
  assert.equal(normalizeWakeTrigger(null), null);
  assert.equal(normalizeWakeTrigger({}), null);
  assert.equal(normalizeWakeTrigger({ type: 'unknown' }), null);

  const fc = normalizeWakeTrigger({
    type: 'file_count',
    path: 'incoming/',
    minCount: 5,
    pattern: '*.csv',
    pollIntervalMs: 1000,
  });
  assert.equal(fc.type, 'file_count');
  assert.equal(fc.path, 'incoming/');
  assert.equal(fc.minCount, 5);
  assert.equal(fc.pattern, '*.csv');
  assert.equal(fc.pollIntervalMs, 1000);

  const mf = normalizeWakeTrigger({
    type: 'marker_file',
    markerPath: '.ready',
    consumeMarker: true,
  });
  assert.equal(mf.type, 'marker_file');
  assert.equal(mf.markerPath, '.ready');
  assert.equal(mf.consumeMarker, true);

  const pe = normalizeWakeTrigger({
    type: 'process_exit',
    pidFile: 'job.pid',
  });
  assert.equal(pe.type, 'process_exit');
  assert.equal(pe.pidFile, 'job.pid');
});

test('isSafeWakePath protects against system roots and invalid characters', () => {
  assert.equal(isSafeWakePath(null).safe, false);
  assert.equal(isSafeWakePath('a\0b').safe, false);
  assert.equal(isSafeWakePath('/').safe, false);
  assert.equal(isSafeWakePath('/etc').safe, false);
  assert.equal(isSafeWakePath('/proc').safe, false);

  const valid = isSafeWakePath('./local/dir');
  assert.equal(valid.safe, true);
  assert.ok(valid.resolved);
});

test('matchPattern and countMatchingFiles match glob wildcards and count entries', () => {
  assert.equal(matchPattern('file.txt', '*.txt'), true);
  assert.equal(matchPattern('file.json', '*.txt'), false);
  assert.equal(matchPattern('run_01.csv', 'run_*.csv'), true);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-wake-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello');
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'world');
    fs.writeFileSync(path.join(tmpDir, 'c.json'), '{}');

    const res = countMatchingFiles(tmpDir, '*.txt');
    assert.equal(res.count, 2);
    assert.deepEqual(res.files.sort(), ['a.txt', 'b.txt']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('isProcessAlive checks PID validity accurately', () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(0), false);
  assert.equal(isProcessAlive(-5), false);
  assert.equal(isProcessAlive(99999999), false);
});

test('WakeTriggerManager triggers on marker_file and unlinks marker', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-wake-marker-'));
  const marker = path.join(tmpDir, 'wake.flag');
  let triggeredContext = null;

  const mockScheduler = {
    isStopped: false,
    async runTask(taskId, options) {
      triggeredContext = options;
    },
  };

  const mgr = new WakeTriggerManager(mockScheduler);
  const task = {
    id: 'task-marker-1',
    title: 'Marker Task',
    status: 'active',
    wakeTrigger: {
      type: 'marker_file',
      markerPath: marker,
      consumeMarker: true,
      pollIntervalMs: 50,
    },
  };

  try {
    mgr.registerTask(task);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(triggeredContext, null, 'Should not trigger without marker file');

    // Create marker file
    fs.writeFileSync(marker, 'ready');
    await new Promise((r) => setTimeout(r, 120));

    assert.ok(triggeredContext, 'Task should have been triggered');
    assert.equal(triggeredContext.wakeTrigger.type, 'marker_file');
    assert.equal(triggeredContext.wakeTrigger.markerPath, marker);
    assert.equal(fs.existsSync(marker), false, 'Marker should have been consumed');
  } finally {
    mgr.stopAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WakeTriggerManager triggers on file_count threshold', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-wake-count-'));
  let triggeredContext = null;

  const mockScheduler = {
    isStopped: false,
    async runTask(taskId, options) {
      triggeredContext = options;
    },
  };

  const mgr = new WakeTriggerManager(mockScheduler);
  const task = {
    id: 'task-count-1',
    title: 'Count Task',
    status: 'active',
    wakeTrigger: {
      type: 'file_count',
      path: tmpDir,
      minCount: 2,
      pattern: '*.log',
      pollIntervalMs: 50,
    },
  };

  try {
    mgr.registerTask(task);
    fs.writeFileSync(path.join(tmpDir, '1.log'), 'test');
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(triggeredContext, null, 'Should not trigger with only 1 file');

    fs.writeFileSync(path.join(tmpDir, '2.log'), 'test');
    await new Promise((r) => setTimeout(r, 120));

    assert.ok(triggeredContext, 'Task should have been triggered when reaching 2 files');
    assert.equal(triggeredContext.wakeTrigger.fileCount, 2);
    assert.equal(triggeredContext.wakeTrigger.minCount, 2);
  } finally {
    mgr.stopAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WakeTriggerManager triggers on process_exit when tracked process terminates', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-wake-proc-'));
  const pidFile = path.join(tmpDir, 'job.pid');
  let triggeredContext = null;

  const mockScheduler = {
    isStopped: false,
    async runTask(taskId, options) {
      triggeredContext = options;
    },
  };

  // Spawn short-lived child process
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 300)']);
  fs.writeFileSync(pidFile, String(child.pid));

  const mgr = new WakeTriggerManager(mockScheduler);
  const task = {
    id: 'task-proc-1',
    title: 'Process Exit Task',
    status: 'active',
    wakeTrigger: {
      type: 'process_exit',
      pidFile,
      consumeMarker: true,
      pollIntervalMs: 50,
    },
  };

  try {
    mgr.registerTask(task);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(triggeredContext, null, 'Should not trigger while child is alive');

    // Wait for child to exit
    await new Promise((r) => child.on('exit', r));
    await new Promise((r) => setTimeout(r, 120));

    assert.ok(triggeredContext, 'Task should trigger after process exit');
    assert.equal(triggeredContext.wakeTrigger.type, 'process_exit');
    assert.equal(triggeredContext.wakeTrigger.pid, child.pid);
  } finally {
    mgr.stopAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


import { resolveTaskForExecution } from '../lib/prompt-interpolation.js';

test('resolveTaskForExecution exposes wake trigger context in variables and env', () => {
  const task = {
    id: 't-wake-ctx',
    prompt: 'Process {{trigger.fileCount}} files from {{trigger.type}} at {{trigger.markerPath}}',
    env: { EXISTING: '1' },
  };
  const options = {
    wakeTrigger: {
      type: 'marker_file',
      markerPath: 'output/ready.done',
      fileCount: 10,
    },
  };

  const resolved = resolveTaskForExecution(task, options);
  assert.equal(resolved.prompt, 'Process 10 files from marker_file at output/ready.done');
  assert.equal(resolved.env.EXISTING, '1');
  assert.equal(resolved.env.DSH_CRON_WAKE_TYPE, 'marker_file');
  assert.equal(resolved.env.DSH_CRON_WAKE_MARKER, 'output/ready.done');
});

test('isSafeWakePath strictly blocks subpaths inside disallowed roots (CVE hardening)', () => {
  // Direct roots
  assert.equal(isSafeWakePath('/etc').safe, false);
  assert.equal(isSafeWakePath('/proc').safe, false);
  assert.equal(isSafeWakePath('/sys').safe, false);
  assert.equal(isSafeWakePath('/dev').safe, false);

  // Subpaths inside disallowed roots
  assert.equal(isSafeWakePath('/etc/passwd').safe, false);
  assert.equal(isSafeWakePath('/etc/shadow').safe, false);
  assert.equal(isSafeWakePath('/etc/cron.d/job').safe, false);
  assert.equal(isSafeWakePath('/proc/cpuinfo').safe, false);
  assert.equal(isSafeWakePath('/sys/kernel/debug').safe, false);
  assert.equal(isSafeWakePath('C:\\Windows\\System32\\cmd.exe').safe, false);
  assert.equal(isSafeWakePath('C:\\Program Files\\secret.txt').safe, false);

  // Normal / relative paths
  assert.equal(isSafeWakePath('./local/file.marker').safe, true);
  assert.equal(isSafeWakePath('output/build.flag').safe, true);
});
