import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import * as plugin from '../lib/index.js';
import { TaskStore } from '../lib/store.js';
import { SessionRunner } from '../lib/runner.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-p9-'));
}

function createMockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    payload: null,
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = headers;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    end(data) {
      this.body = data || '';
      try {
        this.payload = JSON.parse(this.body);
      } catch {
        this.payload = this.body;
      }
      return this;
    },
  };
}

// =========================================================================
// Issue #280: apply() obeys config.cronDir / config.storePath
// =========================================================================
test('Issue #280: plugin.apply() routes tasks storage to config.cronDir and isolates from default store', (t) => {
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

  plugin.apply(fakeCtx, { cronDir: customCronDir, defaultTimezone: 'UTC' });

  // Store file should be in customCronDir/tasks.json because settings were saved
  const expectedStoreFile = path.join(customCronDir, 'tasks.json');
  assert.ok(fs.existsSync(expectedStoreFile), 'customCronDir/tasks.json must be created upon apply');

  // Verify default ~/.dsh/data/cron/tasks.json in tmpDir root was NOT touched
  const defaultStoreFile = path.join(tmpDir, 'cron', 'tasks.json');
  assert.ok(!fs.existsSync(defaultStoreFile), 'Default store file must not be created when cronDir is provided');
});

// =========================================================================
// Issue #235: loader/volatile-update handles string array from cordis-plugin-loader
// =========================================================================
test('Issue #235: syncVolatileConfig handles array of changed paths from cordis-plugin-loader', (t) => {
  const tmpDir = makeTmpDir();
  const prevDataDir = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = tmpDir;
  let cleanupLifecycle = null;
  t.after(() => {
    if (prevDataDir !== undefined) process.env.DSH_DATA_DIR = prevDataDir;
    else delete process.env.DSH_DATA_DIR;
    if (cleanupLifecycle) cleanupLifecycle();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const bus = new EventEmitter();
  let registeredRoutes = [];
  const fakeCtx = {
    tools: { register: () => {} },
    webServer: { register: (r) => registeredRoutes.push(r) },
    effect: (fn) => {
      const res = fn();
      if (typeof res === 'function') cleanupLifecycle = res;
    },
    inject: () => {},
    on: (evt, cb) => bus.on(evt, cb),
    emit: (evt, data) => bus.emit(evt, data),
    get: () => null,
    config: {
      maxConcurrent: 5,
      defaultTimezone: 'Europe/Paris',
    },
  };

  plugin.apply(fakeCtx, { cronDir: tmpDir, maxConcurrent: 2, defaultTimezone: 'UTC' });

  const settingsRoute = registeredRoutes.find((r) => r.path === '/dsh-cron/settings');
  assert.ok(settingsRoute, 'Must register /dsh-cron/settings');

  // cordis-plugin-loader emits array of property names: ['maxConcurrent', 'defaultTimezone']
  fakeCtx.config.maxConcurrent = 8;
  fakeCtx.config.defaultTimezone = 'America/New_York';
  bus.emit('loader/volatile-update', ['maxConcurrent', 'defaultTimezone']);

  const res = createMockRes();
  settingsRoute.handler({ method: 'GET' }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.settings.maxConcurrent, 8);
  assert.equal(res.payload.settings.defaultTimezone, 'America/New_York');
});

// =========================================================================
// Issue #227: _executeAgentTurn fails on missing terminal event or empty event log
// =========================================================================
test('Issue #227: _executeAgentTurn fails when event log is present but has no terminal completion event', async (t) => {
  const runner = new SessionRunner({
    get: () => null,
    store: { get: () => null, save: () => {} },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  const task = { id: 'task-test', title: 'Turn Test', type: 'llm' };

  // Case 1: Empty event log before quiescence
  const handleEmpty = {
    agent: {
      session: { seq: 0, snapshotEvents: () => [] },
      whenIdle: async () => {},
      followup: () => {},
    },
  };
  const prepEmpty = {
    model: 'deepseek-chat',
    agentPrompt: 'run',
    raceAbort: (p) => p,
    createUserMessage: (m) => m,
    handle: handleEmpty,
  };

  await assert.rejects(
    () => runner._executeAgentTurn(task, prepEmpty, handleEmpty, false),
    (err) => {
      assert.ok(err.turnFailed);
      assert.match(err.message, /Agent turn produced no events before quiescence/);
      return true;
    }
  );

  // Case 2: Non-empty events, but without terminal event
  const eventsIncomplete = [
    { type: 'message', role: 'assistant', content: 'thinking...' },
    { type: 'thought', content: 'working' },
  ];
  const handleNoTerminal = {
    agent: {
      session: { seq: 0, snapshotEvents: () => eventsIncomplete },
      whenIdle: async () => {},
      followup: () => {},
    },
  };
  const prepNoTerminal = {
    model: 'deepseek-chat',
    agentPrompt: 'run',
    raceAbort: (p) => p,
    createUserMessage: (m) => m,
    handle: handleNoTerminal,
  };

  await assert.rejects(
    () => runner._executeAgentTurn(task, prepNoTerminal, handleNoTerminal, false),
    (err) => {
      assert.ok(err.turnFailed);
      assert.match(err.message, /without terminal completion event/);
      return true;
    }
  );

  // Case 3: Terminal event present -> success
  const eventsSuccess = [
    { type: 'message', role: 'assistant', content: 'done' },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const handleSuccess = {
    agent: {
      session: { seq: 0, snapshotEvents: () => eventsSuccess },
      whenIdle: async () => {},
      followup: () => {},
    },
  };
  const prepSuccess = {
    model: 'deepseek-chat',
    agentPrompt: 'run',
    raceAbort: (p) => p,
    createUserMessage: (m) => m,
    handle: handleSuccess,
  };

  const res = await runner._executeAgentTurn(task, prepSuccess, handleSuccess, false);
  assert.ok(res.output);
});

// =========================================================================
// Issue #244: Store saveAsync unlinks in-flight tmp on sync save collision & compact JSON
// =========================================================================
test('Issue #244: sync save cancels in-flight async save and prevents async overwrite', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const storeFile = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(storeFile);

  store.set({ id: 'task-1', title: 'State v1' });
  const asyncPromise = store.saveAsync();

  // Immediately perform sync save with State v2
  store.set({ id: 'task-1', title: 'State v2 - synchronous win' });
  store.save();

  await asyncPromise;

  // Reading from disk must return State v2
  const reloaded = new TaskStore(storeFile);
  assert.equal(reloaded.get('task-1').title, 'State v2 - synchronous win');
});

test('Issue #244: saveAsync writes compact JSON without multi-line indentation', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const storeFile = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(storeFile);

  store.set({ id: 'task-async', title: 'Async payload' });
  await store.saveAsync();

  const raw = fs.readFileSync(storeFile, 'utf8');
  assert.ok(!raw.includes('\n  "version": 1'), 'Async serialization must be compact without line indentations');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.tasks[0].title, 'Async payload');
});

// =========================================================================
// Issue #242: client actions timeout covers res.json()
// =========================================================================
test('Issue #242: 52-cron-screen-actions.js uses fetchJsonWithTimeout covering json parsing', (t) => {
  const actionsJs = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'lib', 'client-src', '52-cron-screen-actions.js'),
    'utf8'
  );

  assert.ok(actionsJs.includes('const fetchJsonWithTimeout = async'), 'Must define fetchJsonWithTimeout');
  assert.ok(actionsJs.includes('data = await res.json();'), 'Must parse json inside try block');
  assert.ok(actionsJs.includes("jsonErr.name === 'AbortError'"), 'Must rethrow abort errors');
  assert.ok(actionsJs.includes('if (timer) clearTimeout(timer);'), 'Must clear timer in finally block after json parsing');
  assert.ok(actionsJs.includes('await fetchJsonWithTimeout('), 'handleToggleTask & handleRunNow must use fetchJsonWithTimeout');
});

// =========================================================================
// Issue #246 & #245: Publish scripts and AGENTS.md sanity
// =========================================================================
test('Issue #246: scripts/publish-github.sh and publish.sh tag sanitized commit directly', (t) => {
  const pubSh = fs.readFileSync(path.join(import.meta.dirname, '..', 'publish.sh'), 'utf8');
  const pubGh = fs.readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'publish-github.sh'), 'utf8');

  // publish.sh must pass --tag to scripts/publish-github.sh
  assert.ok(pubSh.includes('--tag "v$VERSION"'), 'publish.sh must pass --tag to scripts/publish-github.sh');
  assert.ok(!pubSh.includes('refs/tags/v$VERSION" || true'), 'Must not push local Gitea tag or swallow errors with || true');

  // scripts/publish-github.sh must push $new_commit:refs/tags/$tag
  assert.ok(pubGh.includes('git push "$MIRROR_REMOTE" "$new_commit:refs/tags/$tag"'), 'Must push tag pointing to sanitized new_commit');
});

test('Issue #245: AGENTS.md preserves historical 0.2.8 and documents 0.2.43 status', (t) => {
  const agents = fs.readFileSync(path.join(import.meta.dirname, '..', 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('Исторический релиз `0.2.8`'), 'Must mention historical 0.2.8');
  assert.ok(agents.includes('0.2.43') || agents.includes('0.2.44'), 'Must mention 0.2.43 or 0.2.44 status');
  assert.ok(agents.includes('2026-09-11'), 'Must preserve 2026-09-11 for historical releases');
});
