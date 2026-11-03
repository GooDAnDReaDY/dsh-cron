import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  normalizeInputHashPaths,
  hashPath,
  computeTaskInputHash,
} from '../lib/input-hash.js';
import { TaskScheduler } from '../lib/scheduler/scheduler.js';

test('normalizeInputHashPaths handles string and array inputs', () => {
  assert.deepEqual(normalizeInputHashPaths(null), []);
  assert.deepEqual(normalizeInputHashPaths(''), []);
  assert.deepEqual(normalizeInputHashPaths(['src/', 'package.json']), ['src/', 'package.json']);
  assert.deepEqual(normalizeInputHashPaths('src/\ndocs/\n'), ['src/', 'docs/']);
  assert.deepEqual(normalizeInputHashPaths('src, data.json'), ['src', 'data.json']);
});

test('hashPath and computeTaskInputHash produce stable hashes that detect file changes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-input-hash-'));
  try {
    const file1 = path.join(tmpDir, 'data.txt');
    fs.writeFileSync(file1, 'hello world');

    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'index.js'), 'console.log("hello");');

    const hash1 = await computeTaskInputHash(tmpDir, ['data.txt', 'src/']);
    assert.match(hash1, /^sha256:[a-f0-9]{16}$/);

    // Identical computation produces same hash
    const hash2 = await computeTaskInputHash(tmpDir, ['data.txt', 'src/']);
    assert.equal(hash1, hash2);

    // Mutating a file changes the computed hash
    fs.writeFileSync(file1, 'hello world updated');
    const hash3 = await computeTaskInputHash(tmpDir, ['data.txt', 'src/']);
    assert.notEqual(hash1, hash3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TaskScheduler skips run when input hash matches lastInputHash and updates hash on run', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sched-hash-'));
  const testFile = path.join(tmpDir, 'file.txt');
  fs.writeFileSync(testFile, 'initial content');

  const tasks = new Map();
  const history = new Map();
  let executionCount = 0;

  const mockStore = {
    get: (id) => tasks.get(id),
    getSettings: () => ({}),
    history: {
      get: (id) => history.get(id) || [],
    },
    recordRun: (id, run) => {
      const list = history.get(id) || [];
      list.push(run);
      history.set(id, list);
    },
    patch: (id, updates) => {
      const current = tasks.get(id);
      if (current) Object.assign(current, updates);
    },
    set: (t) => tasks.set(t.id, t),
  };

  const executeFn = async (task) => {
    executionCount++;
    return { status: 'ok', output: `Processed ${task.id}` };
  };

  const scheduler = new TaskScheduler(mockStore, executeFn);

  const task = {
    id: 'task-hash-check',
    title: 'Hash Checker Task',
    status: 'active',
    cwd: tmpDir,
    inputHashPaths: ['file.txt'],
    skipIfUnchanged: true,
    lastInputHash: '',
  };
  tasks.set('task-hash-check', task);

  // First run: lastInputHash is empty, so it executes and records new hash
  const res1 = await scheduler.runTask('task-hash-check');
  assert.ok(res1.status === 'ok' || res1.status === 'success');
  assert.equal(executionCount, 1);
  assert.match(task.lastInputHash, /^sha256:[a-f0-9]{16}$/);

  // Second run: input file unchanged -> should skip execution!
  const res2 = await scheduler.runTask('task-hash-check');
  assert.equal(res2.status, 'skipped');
  assert.equal(res2.skippedReason, 'inputs unchanged');
  assert.equal(executionCount, 1, 'Execution count should not increment on skipped run');

  // Third run: modify file -> should execute!
  fs.writeFileSync(testFile, 'modified content');
  const res3 = await scheduler.runTask('task-hash-check');
  assert.ok(res3.status === 'ok' || res3.status === 'success');
  assert.equal(executionCount, 2, 'Execution count should increment on changed input');

  // Fourth run with forceRun option -> executes even if unchanged
  const res4 = await scheduler.runTask('task-hash-check', { forceRun: true });
  assert.ok(res4.status === 'ok' || res4.status === 'success');
  assert.equal(executionCount, 3, 'Execution count should increment when forceRun is specified');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
