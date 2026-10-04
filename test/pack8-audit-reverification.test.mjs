import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { SessionRunner } from '../lib/runner.js';
import { Config, unwrapConfig } from '../lib/settings.js';
import { handleTelegramWebhook } from '../lib/api-webhook.js';
import { runViaRemoteWorkspace } from '../lib/runner-external.js';
import * as plugin from '../lib/index.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-pack8-'));
}

function createMockReq(options = {}) {
  const body = options.body || {};
  const headers = options.headers || {};
  const method = options.method || 'POST';
  const req = new EventEmitter();
  req.method = method;
  req.headers = headers;
  process.nextTick(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
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
    }
  };
}

// =========================================================================
// Issue #275: Plugin lifecycle dispose executes bestEffort without ReferenceError
// =========================================================================
test('Issue #275: Plugin lifecycle dispose executes bestEffort without ReferenceError', async (t) => {
  const tmpDir = makeTmpDir();
  const prevDataDir = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = tmpDir;
  t.after(() => {
    if (prevDataDir !== undefined) process.env.DSH_DATA_DIR = prevDataDir;
    else delete process.env.DSH_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const effects = [];
  const fakeCtx = {
    tools: { register: () => {} },
    webServer: { register: () => {} },
    effect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        effects.push(cleanup);
      }
    },
    inject: () => {},
    on: () => {},
    emit: () => {},
    get: () => null,
  };

  plugin.apply(fakeCtx, { cronDir: tmpDir });
  assert.ok(effects.length > 0, 'Must register lifecycle effects');

  for (const cleanup of effects) {
    assert.doesNotThrow(() => {
      cleanup();
    }, 'Disposer must execute cleanly without ReferenceError');
  }
});

// =========================================================================
// Issue #276: Schemastery 3.18.4 volatile Config unwrap and default maxConcurrent = 2
// =========================================================================
test('Issue #276: Schemastery 3.18.4 volatile Config unwrap and default maxConcurrent = 2', () => {
  const mockVolatileRef = {
    get: () => 2,
    [Symbol('cosmokit.volatile.write')]: () => {},
  };
  const mockConfig = {
    maxConcurrent: mockVolatileRef,
  };

  const unwrapped = unwrapConfig(mockConfig);
  assert.equal(unwrapped.maxConcurrent, 2, 'unwrapConfig must unwrap cosmokit volatile ref');

  const resolved = Config(undefined);
  const effectiveMax = (typeof resolved.maxConcurrent === 'object' && resolved.maxConcurrent !== null && typeof resolved.maxConcurrent.get === 'function')
    ? resolved.maxConcurrent.get()
    : unwrapConfig(resolved).maxConcurrent;
  assert.equal(effectiveMax, 2, 'Default maxConcurrent must resolve to 2');
});

// =========================================================================
// Issue #273: SSH task with sshProfileId resolves profile via settings.describe()
// =========================================================================
test('Issue #273: SSH task with sshProfileId resolves profile via settings.describe() without settings.get()', async () => {
  const mockProfile = { id: 'prof-prod-1', host: 'prod.example.com', username: 'deploy' };
  let remoteSshCalled = false;

  const fakeCtx = {
    get: (svc) => {
      if (svc === 'remoteSsh') {
        return {
          exec: async (profile, cmd, cwd) => {
            remoteSshCalled = true;
            assert.equal(profile.id, 'prof-prod-1');
            return { code: 0, stdout: 'remote-ok', stderr: '' };
          }
        };
      }
      if (svc === 'settings') {
        return {
          describe: () => [
            { ns: 'dsh-remote-workspace', value: { profiles: [mockProfile] } }
          ],
        };
      }
      return null;
    }
  };

  const task = { id: 'task-ssh-1', title: 'Remote SSH Task', sshProfileId: 'prof-prod-1', prompt: 'uptime' };
  const res = await runViaRemoteWorkspace(task, null, fakeCtx);
  assert.ok(res, 'Must successfully execute via remoteSsh');
  assert.equal(remoteSshCalled, true);
  assert.equal(res.output, 'remote-ok');
});

// =========================================================================
// Issue #208: Fail-closed on unset secret token in Telegram webhook
// =========================================================================
test('Issue #208: Telegram webhook rejects requests with 401 when webhookSecret is unset (fail-closed)', async () => {
  const store = {
    getSettings: () => ({ chatId: '12345' }), // chatId configured, but NO webhookSecret
    get: () => null,
  };
  const scheduler = {};

  const req = createMockReq({
    body: { message: { text: '/run job-1', chat: { id: 12345 } } }
  });
  const res = createMockRes();

  await handleTelegramWebhook({ store, scheduler, req, res });
  assert.equal(res.statusCode, 401, 'Must reject with 401 Unauthorized when webhookSecret is unset');
  assert.equal(res.payload.ok, false);
  assert.match(res.payload.error, /secret is not configured/);
});

// =========================================================================
// Issue #227: LLM runner settlement: turn/end blocked and missing terminal are failures
// =========================================================================
test('Issue #227: _executeAgentTurn fails on turn/end blocked and missing terminal event', async () => {
  const runner = new SessionRunner({ get: () => null });

  // 1. turn/end with reason.kind = 'blocked' must throw
  const eventsBlocked = [
    { type: 'assistant/chunk', data: { turn: 1, step: 0, chunk: { type: 'text', text: 'Partial' } } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'blocked' } } }
  ];
  const handleBlocked = {
    agent: {
      session: { seq: 0, snapshotEvents: () => eventsBlocked },
      whenIdle: async () => {},
      followup: () => {},
    }
  };
  const task = { id: 't1', title: 'Blocked Task', type: 'llm' };
  const prepBlocked = { model: 'deepseek-chat', agentPrompt: 'run', raceAbort: (p) => p, createUserMessage: (m) => m, handle: handleBlocked };

  await assert.rejects(
    () => runner._executeAgentTurn(task, prepBlocked, handleBlocked, false),
    (err) => {
      assert.ok(err.turnFailed);
      assert.equal(err.reasonKind, 'blocked');
      return true;
    }
  );

  // 2. Events present but missing terminal completion event must throw
  const eventsIncomplete = [
    { type: 'assistant/chunk', data: { turn: 1, step: 0, chunk: { type: 'text', text: 'Hanging...' } } }
  ];
  const handleIncomplete = {
    agent: {
      session: { seq: 0, snapshotEvents: () => eventsIncomplete },
      whenIdle: async () => {},
      followup: () => {},
    }
  };
  const prepIncomplete = { model: 'deepseek-chat', agentPrompt: 'run', raceAbort: (p) => p, createUserMessage: (m) => m, handle: handleIncomplete };

  await assert.rejects(
    () => runner._executeAgentTurn(task, prepIncomplete, handleIncomplete, false),
    (err) => {
      assert.ok(err.turnFailed);
      assert.match(err.message, /without terminal completion event/);
      return true;
    }
  );
});

// =========================================================================
// Issue #228: Token accounting includes assistant/attempt stream chunks and attaches usage on failure
// =========================================================================
test('Issue #228: _extractUsage sums assistant/attempt stream chunks and attaches usage to errors', async () => {
  const runner = new SessionRunner({ get: () => null });

  const turnEvents = [
    {
      type: 'assistant/attempt',
      data: {
        turn: 1,
        step: 0,
        stream: [
          { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 5 } } }
        ]
      }
    },
    {
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 0,
        usage: { inputTokens: 120, outputTokens: 40, cacheReadTokens: 10 }
      }
    },
    {
      type: 'turn/end',
      data: {
        turn: 1,
        reason: { kind: 'error', message: 'Model rate limit' }
      }
    }
  ];

  const handle = {
    agent: {
      session: { seq: 0, snapshotEvents: () => turnEvents },
      whenIdle: async () => {},
      followup: () => {},
    }
  };
  const task = { id: 't-usage', title: 'Usage Failure Task', type: 'llm' };
  const prep = { model: 'deepseek-chat', agentPrompt: 'run', raceAbort: (p) => p, createUserMessage: (m) => m, handle };

  await assert.rejects(
    () => runner._executeAgentTurn(task, prep, handle, false),
    (err) => {
      assert.ok(err.turnFailed);
      assert.ok(err.usage, 'Error must carry usage object for Burn Guard');
      assert.equal(err.usage.inputTokens, 220); // 100 from attempt stream + 120 from message
      assert.equal(err.usage.outputTokens, 50); // 10 from attempt stream + 40 from message
      assert.ok(err.costUsd > 0, 'Error must carry calculated costUsd');
      return true;
    }
  );
});

// =========================================================================
// Issue #235: loader/volatile-update live synchronization
// =========================================================================
test('Issue #235: loader/volatile-update updates active scheduler settings and store live', (t) => {
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
    webServer: {
      register: (route) => registeredRoutes.push(route),
    },
    effect: (fn) => {
      const res = fn();
      if (typeof res === 'function') cleanupLifecycle = res;
    },
    inject: () => {},
    on: (evt, cb) => bus.on(evt, cb),
    emit: (evt, data) => bus.emit(evt, data),
    get: () => null,
  };

  plugin.apply(fakeCtx, { cronDir: tmpDir, maxConcurrent: 2, defaultTimezone: 'UTC' });

  const settingsRoute = registeredRoutes.find((r) => r.path === '/dsh-cron/settings');
  assert.ok(settingsRoute, 'Must register /dsh-cron/settings');

  bus.emit('loader/volatile-update', {
    maxConcurrent: 1,
    defaultTimezone: 'Asia/Tokyo',
    llmActionsEnabled: true,
  });

  const req = { method: 'GET' };
  const res = createMockRes();
  settingsRoute.handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.settings.maxConcurrent, 1);
  assert.equal(res.payload.settings.defaultTimezone, 'Asia/Tokyo');
  assert.equal(res.payload.settings.llmActionsEnabled, true);
});

// =========================================================================
// Issue #244: Monotonic write queue and async/sync save race prevention
// =========================================================================
test('Issue #244: Monotonic save ordering prevents older async rename from overwriting newer sync save', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const storeFile = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(storeFile);

  store.set({ id: 'task-1', title: 'Before' });

  // Trigger async save (version 1)
  const savePromise = store.saveAsync();

  // Concurrently before async rename finishes, perform a synchronous save with newer state (version 2)
  store.set({ id: 'task-1', title: 'After' });
  store.save();

  // Wait for async save to settle
  await savePromise;

  // Verify disk file retains 'After', and lastWrittenVersion does not regress
  const diskData = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const storedTask = diskData.tasks.find((t) => t.id === 'task-1');
  assert.equal(storedTask.title, 'After', 'Disk data must retain After from newer sync save');
  assert.ok(store._lastWrittenVersion >= 2, 'lastWrittenVersion must not regress to 1');
});

// =========================================================================
// Issue #246: publish.sh delegates to scripts/publish-github.sh and excludes .gitea
// =========================================================================
test('Issue #246: publish.sh delegates to scripts/publish-github.sh allowlist builder', () => {
  const publishShPath = path.resolve('publish.sh');
  const content = fs.readFileSync(publishShPath, 'utf8');
  assert.ok(content.includes('scripts/publish-github.sh'), 'publish.sh must delegate to scripts/publish-github.sh');
  assert.ok(content.includes('.gitea'), 'publish.sh must document .gitea exclusion');
});
