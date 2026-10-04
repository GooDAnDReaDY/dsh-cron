import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import * as plugin from '../lib/index.js';
import { plainConfig } from '../lib/settings.js';
import { TaskStore } from '../lib/store.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-p10-'));
}

function makeVolatileBox(val) {
  return {
    get: () => val,
    toString: () => String(val),
    [Symbol.toStringTag]: 'Volatile',
  };
}

// =========================================================================
// Issue #282: plainConfig unwraps Schemastery Volatile boxes around jobs
// =========================================================================
test('Issue #282: plainConfig unwraps Volatile boxes around jobs and config fields', () => {
  const rawConfig = {
    cronDir: makeVolatileBox('/tmp/custom-cron'),
    maxConcurrent: makeVolatileBox(4),
    defaultTimezone: makeVolatileBox('Asia/Tokyo'),
    jobs: makeVolatileBox([
      {
        id: 'job-decl-1',
        title: 'Declarative Job 1',
        schedule: '* * * * *',
        type: 'shell',
        prompt: 'echo 1',
      },
    ]),
  };

  const plain = plainConfig(rawConfig);
  assert.equal(plain.cronDir, '/tmp/custom-cron');
  assert.equal(plain.maxConcurrent, 4);
  assert.equal(plain.defaultTimezone, 'Asia/Tokyo');
  assert.ok(Array.isArray(plain.jobs), 'jobs must be unwrapped to a plain Array');
  assert.equal(plain.jobs.length, 1);
  assert.equal(plain.jobs[0].id, 'job-decl-1');
});

test('Issue #282: plugin.apply() successfully syncs and schedules declarative jobs from Volatile boxed config', (t) => {
  const tmpDir = makeTmpDir();
  const prevDataDir = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = tmpDir;
  let cleanupLifecycle = null;
  t.after(() => {
    if (cleanupLifecycle) cleanupLifecycle();
    if (prevDataDir !== undefined) process.env.DSH_DATA_DIR = prevDataDir;
    else delete process.env.DSH_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const customCronDir = path.join(tmpDir, 'custom-cron');
  fs.mkdirSync(customCronDir, { recursive: true });

  const rawConfig = {
    cronDir: customCronDir,
    maxConcurrent: makeVolatileBox(3),
    defaultTimezone: makeVolatileBox('Europe/Berlin'),
    jobs: makeVolatileBox([
      {
        id: 'decl-task-1',
        title: 'Declarative Task From Box',
        schedule: '0 * * * *',
        type: 'shell',
        prompt: 'echo 42',
      },
    ]),
  };

  let registeredRoutes = [];
  const fakeCtx = {
    tools: { register: () => {} },
    webServer: { register: (r) => registeredRoutes.push(r) },
    effect: (fn) => {
      const res = fn();
      if (typeof res === 'function') cleanupLifecycle = res;
    },
    inject: () => {},
    on: () => {},
    emit: () => {},
    get: () => null,
  };

  plugin.apply(fakeCtx, rawConfig);

  // Store file should exist and contain the declarative job
  const storeFile = path.join(customCronDir, 'tasks.json');
  assert.ok(fs.existsSync(storeFile), 'Store file must be created');
  const store = new TaskStore(storeFile);
  const task = store.get('decl-task-1');
  assert.ok(task, 'Task decl-task-1 must be present in store');
  assert.equal(task.title, 'Declarative Task From Box');
});

// =========================================================================
// Issue #280: Lifecycle disposer cancels heartbeat timer cleanly
// =========================================================================
test('Issue #280: lifecycle disposer cleanly cancels active heartbeat timer', (t) => {
  const tmpDir = makeTmpDir();
  const prevDataDir = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = tmpDir;

  let cleanupLifecycle = null;
  t.after(() => {
    if (cleanupLifecycle) cleanupLifecycle();
    if (prevDataDir !== undefined) process.env.DSH_DATA_DIR = prevDataDir;
    else delete process.env.DSH_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const fakeCtx = {
    tools: { register: () => {} },
    webServer: { register: () => {} },
    effect: (fn) => {
      const res = fn();
      if (typeof res === 'function') cleanupLifecycle = res;
    },
    inject: () => {},
    on: () => {},
    emit: () => {},
    get: () => null,
  };

  plugin.apply(fakeCtx, {
    cronDir: tmpDir,
    heartbeatUrl: 'http://127.0.0.1:9999/snitch',
    heartbeatIntervalSec: 1,
  });

  assert.ok(typeof cleanupLifecycle === 'function', 'Disposer must be registered');
  // Invoking disposer must cancel timer without error
  assert.doesNotThrow(() => cleanupLifecycle());
  cleanupLifecycle = null;
});

// =========================================================================
// Issue #244: saveAsync re-throws ENOENT when no newer sync save occurred
// =========================================================================
test('Issue #244: saveAsync re-throws ENOENT when not caused by newer sync save cancellation', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const storeFile = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(storeFile);

  // Monkey-patch fs.promises.rename to simulate an unexpected ENOENT
  const originalRename = fs.promises.rename;
  fs.promises.rename = async () => {
    const err = new Error('ENOENT: no such file or directory');
    err.code = 'ENOENT';
    throw err;
  };
  t.after(() => { fs.promises.rename = originalRename; });

  store.set({ id: 'task-err', title: 'Unexpected ENOENT' });

  // When no sync save occurred, saveAsync must RE-THROW the ENOENT
  await assert.rejects(
    () => store.saveAsync(),
    (err) => {
      assert.equal(err.code, 'ENOENT');
      return true;
    }
  );
});

// =========================================================================
// Issue #242: fetchJsonWithTimeout does not swallow AbortError on body read
// =========================================================================
test('Issue #242: fetchJsonWithTimeout rethrows AbortError during json body stream reading', async () => {
  const actionsJs = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'lib', 'client-src', '52-cron-screen-actions.js'),
    'utf8'
  );

  assert.ok(actionsJs.includes('if (jsonErr && (jsonErr.name === \'AbortError\' || controller?.signal.aborted))'),
    'Must rethrow jsonErr if aborted');

  // Verify behavior simulation
  const controller = new AbortController();
  const simulateFetchJson = async () => {
    try {
      let data = {};
      try {
        controller.abort();
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      } catch (jsonErr) {
        if (jsonErr && (jsonErr.name === 'AbortError' || controller?.signal.aborted)) {
          throw jsonErr;
        }
      }
      return { data };
    } catch (err) {
      if (err && (err.name === 'AbortError' || controller?.signal.aborted)) {
        throw new Error('Request timed out after 15s');
      }
      throw err;
    }
  };

  await assert.rejects(
    () => simulateFetchJson(),
    /Request timed out/
  );
});

// =========================================================================
// Issue #245: index.md matches package.json and AGENTS.md version
// =========================================================================
test('Issue #245: index.md package version is synchronized with package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  const indexMd = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.md'), 'utf8');

  assert.ok(
    indexMd.includes(`версия \`${pkg.version}\``),
    `index.md must state version ${pkg.version}`
  );
});
