import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as plugin from '../lib/index.js';
import { TaskStore } from '../lib/store.js';
import { Config, unwrapConfig, unwrapConfigValue, applySettingsToScope } from '../lib/settings.js';

function mockReq(chunks) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

function mockPost(url, body, headers = {}) {
  const req = mockReq([Buffer.from(JSON.stringify(body), 'utf8')]);
  req.method = 'POST';
  req.url = url;
  req.headers = { 'content-type': 'application/json', ...headers };
  return req;
}

function mockRes() {
  const res = {
    statusCode: 0,
    payload: null,
    writeHead(code) { this.statusCode = code; },
    setHeader() {},
    end(payload) { this.payload = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

function createDsh017Ctx(options = {}) {
  const warnings = [];
  const errors = [];
  const routes = new Map();
  const tools = new Map();
  const disposers = [];

  const settingsService = options.hasSettings !== false ? {
    configure: (policy, fiber) => {
      options.configuredPolicy = policy;
      return () => {};
    },
    update: async (ns, patch) => {
      options.lastUpdateNs = ns;
      options.lastUpdatePatch = patch;
      if (options.updateError) throw new Error(options.updateError);
    },
    describe: () => []
  } : null;

  const ctx = {
    tools: {
      register: (tool) => { tools.set(tool.name, tool); }
    },
    webServer: {
      register: ({ path: rpath, handler }) => {
        routes.set(rpath, handler);
        return () => { routes.delete(rpath); };
      }
    },
    effect: (cb) => {
      const disposer = typeof cb === 'function' ? cb() : undefined;
      if (typeof disposer === 'function') disposers.push(disposer);
      return typeof disposer === 'function' ? disposer : (() => {});
    },
    inject: (deps, cb) => {
      if (deps.includes('settings')) {
        if (settingsService && typeof cb === 'function') {
          cb({ ...ctx, settings: settingsService });
        }
      } else if (typeof cb === 'function') {
        cb(ctx);
      }
    },
    provide: () => {},
    on: () => {},
    get: (name) => (name === 'agentDefaultModel' ? { currentSelection: () => null } : null),
    logger: {
      info: () => {},
      warn: (msg) => warnings.push(String(msg)),
      error: (msg) => errors.push(String(msg))
    },
    locale: { register: () => {} },
    slots: { inject: () => () => {}, register: () => {} },
  };

  const dispose = () => {
    while (disposers.length > 0) {
      const d = disposers.pop();
      try { d(); } catch {}
    }
  };

  return { ctx, settingsService, warnings, errors, routes, tools, dispose };
}

test('#184: DSH 0.1.7 boots without legacy settings.register warning or error', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-017-boot-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  const origWarn = console.warn;
  const consoleWarnings = [];
  console.warn = (...args) => {
    consoleWarnings.push(args.join(' '));
    origWarn.apply(console, args);
  };
  t.after(() => { console.warn = origWarn; });

  const env = createDsh017Ctx();
  t.after(() => env.dispose());

  assert.doesNotThrow(() => {
    plugin.apply(env.ctx, {});
  });

  // Ensure no warning about settings.register exists
  const regWarnings = consoleWarnings.filter(w => w.includes('settings registration warning') || w.includes('settings.register'));
  assert.equal(regWarnings.length, 0, 'Must have zero settings.register warnings');
});

test('#184: settings service is optional and scheduler starts when settings is absent', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-017-no-settings-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  assert.ok(!plugin.inject.includes('settings'), 'settings must not be in export const inject');

  const env = createDsh017Ctx({ hasSettings: false });
  t.after(() => env.dispose());

  assert.doesNotThrow(() => {
    plugin.apply(env.ctx, {});
  });

  assert.ok(env.tools.has('cron_create_task'), 'tools must be registered');
  assert.ok(env.routes.has('/dsh-cron/settings'), 'settings route must be registered');
});

test('#184: volatile Config schema declaration and unwrap helpers', () => {
  assert.ok(Config && Config.dict, 'Config schema object must be defined');

  // Verify editable keys have volatile metadata
  assert.equal(Config.dict.botToken?.meta?.volatile, true, 'botToken must be volatile');
  assert.equal(Config.dict.chatId?.meta?.volatile, true, 'chatId must be volatile');
  assert.equal(Config.dict.notifyTelegram?.meta?.volatile, true, 'notifyTelegram must be volatile');
  assert.equal(Config.dict.kanbanBaseUrl?.meta?.volatile, true, 'kanbanBaseUrl must be volatile');
  assert.equal(Config.dict.defaultTimezone?.meta?.volatile, true, 'defaultTimezone must be volatile');
  assert.equal(Config.dict.maxConcurrent?.meta?.volatile, true, 'maxConcurrent must be volatile');

  // Declarative jobs are owned by profile config, not live form
  assert.ok(!Config.dict.jobs?.meta?.volatile, 'jobs must not be volatile');

  // Test unwrap helpers
  const mockVolatile = { get: () => 'my-unwrapped-value' };
  assert.equal(unwrapConfigValue(mockVolatile), 'my-unwrapped-value');
  assert.equal(unwrapConfigValue('plain'), 'plain');

  const wrappedConfig = unwrapConfig({
    normal: 123,
    volatileProp: { get: () => 'secret_token' },
    nested: { get: () => ({ enabled: true }) }
  });
  assert.equal(wrappedConfig.normal, 123);
  assert.equal(wrappedConfig.volatileProp, 'secret_token');
  assert.deepEqual(wrappedConfig.nested, { enabled: true });
});

test('#184: POST /dsh-cron/settings updates DSH 0.1.7 profile settings and TaskStore', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-017-save-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  const opts = {};
  const env = createDsh017Ctx(opts);
  plugin.apply(env.ctx, {});
  t.after(() => env.dispose());

  const handler = env.routes.get('/dsh-cron/settings');
  assert.ok(handler, 'GET & POST /dsh-cron/settings route exists');

  // Perform POST using standard mockPost / mockRes
  const reqBody = {
    chatId: '-1001234567',
    notifyTelegram: true,
    onlyOnFailure: true,
    kanbanBaseUrl: 'http://127.0.0.1:4000'
  };

  const req = mockPost('/dsh-cron/settings', reqBody);
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.ok, true);
  assert.equal(res.payload?.settings?.chatId, '-1001234567');
  assert.equal(res.payload?.settings?.notifyTelegram, true);
  assert.equal(res.payload?.settings?.kanbanBaseUrl, 'http://127.0.0.1:4000');

  // Verify DSH 0.1.7 settings.update was called
  assert.equal(opts.lastUpdateNs, 'dsh-cron');
  assert.equal(opts.lastUpdatePatch.chatId, '-1001234567');
  assert.equal(opts.lastUpdatePatch.notifyTelegram, true);
  assert.equal(opts.lastUpdatePatch.kanbanBaseUrl, 'http://127.0.0.1:4000');
});

test('#184: Settings survive restart with persisted profile config', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-017-persist-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  // 1. First boot with profile config
  const env1 = createDsh017Ctx();
  plugin.apply(env1.ctx, {
    chatId: '-10055555',
    notifyTelegram: true,
    defaultTimezone: 'Europe/Paris'
  });
  env1.dispose();

  // 2. Restart with the profile config simulating DSH 0.1.7 restart
  const env2 = createDsh017Ctx();
  plugin.apply(env2.ctx, {
    chatId: '-10055555',
    notifyTelegram: true,
    defaultTimezone: 'Europe/Paris'
  });
  t.after(() => env2.dispose());

  const store = new TaskStore();
  const settings = store.getSettings();
  assert.equal(settings.chatId, '-10055555');
  assert.equal(settings.notifyTelegram, true);
});

test('#184: Existing cron tasks and their execution states are preserved during migration', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-017-tasks-preserve-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  // Pre-populate tasks.json with paused tasks, runs, and budgets
  const preStore = new TaskStore();
  preStore.set({
    id: 'task_active_1',
    title: 'Daily Digest',
    schedule: '0 9 * * *',
    prompt: 'Summarize git activity',
    type: 'llm',
    status: 'paused',
    totalTokens: 15400,
    totalCostUsd: 0.125
  });
  preStore.set({
    id: 'task_paused_2',
    title: 'Weekly Cleanup',
    schedule: '0 0 * * 0',
    prompt: 'Archive logs',
    type: 'script',
    status: 'paused',
    totalTokens: 0,
    totalCostUsd: 0
  });
  preStore.recordRun('task_active_1', {
    at: Date.now() - 3600000,
    status: 'completed',
    output: 'Digest done',
    usage: { inputTokens: 1000, outputTokens: 200 },
    costUsd: 0.015
  });
  preStore.save();

  // Boot plugin with DSH 0.1.7 context
  const env = createDsh017Ctx();
  plugin.apply(env.ctx, {});
  t.after(() => env.dispose());

  // Verify tasks are completely intact
  const postStore = new TaskStore();
  const t1 = postStore.get('task_active_1');
  assert.ok(t1, 'task_active_1 exists');
  assert.equal(t1.title, 'Daily Digest');
  assert.equal(t1.status, 'paused');
  assert.equal(t1.totalTokens, 16600);
  assert.equal(t1.totalCostUsd, 0.14);

  const t2 = postStore.get('task_paused_2');
  assert.ok(t2, 'task_paused_2 exists');
  assert.equal(t2.status, 'paused');

  const history = postStore.getHistory('task_active_1');
  assert.equal(history.length, 1);
  assert.ok(history[0].id.startsWith('run_'));
  assert.equal(history[0].status, 'completed');
  assert.equal(history[0].output, 'Digest done');
});
