import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as plugin from '../lib/index.js';

/**
 * Smoke test for the plugin entry point (#97 follow-up).
 *
 * Every other test drives a module directly, so a broken import inside apply()
 * — for example a re-export that the plugin body then calls — passes the whole
 * suite and only explodes when a real harness loads the plugin. This calls
 * apply() against a stub context, which is the cheapest way to catch that.
 */

function fakeCtx() {
  const ctx = {
    tools: { register: () => {} },
    webServer: { register: () => (() => {}) },
    effect: (cb) => {
      const disposer = typeof cb === 'function' ? cb() : undefined;
      return typeof disposer === 'function' ? disposer : (() => {});
    },
    inject: (deps, cb) => { if (typeof cb === 'function') cb(ctx); },
    provide: () => {},
    on: () => {},
    get: (name) => (name === 'agentDefaultModel' ? { currentSelection: () => null } : null),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    locale: { register: () => {} },
    slots: { inject: (mount, cb) => { if (typeof cb === 'function') cb(); return () => {}; }, register: () => {} },
  };
  return ctx;
}

test('#97: the plugin entry point exposes the documented API', () => {
  for (const name of ['apply', 'name', 'inject', 'Config', 'createCronApiHandler', 'executeCreateTask', 'applySettingsToScope', 'sanitizeSettingsPayload']) {
    assert.ok(plugin[name] !== undefined, `lib/index.js must export ${name}`);
  }
  assert.equal(typeof plugin.apply, 'function');
  assert.equal(typeof plugin.createCronApiHandler, 'function');
});

test('#97: apply() loads the whole plugin without throwing', (t) => {
  // Keep the plugin store out of the real user home.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-wiring-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  const ctx = fakeCtx();
  let dispose;
  assert.doesNotThrow(() => { dispose = plugin.apply(ctx, {}); });
  if (typeof dispose === 'function') assert.doesNotThrow(() => dispose());
});

test('#50: the agent tools refuse to change a config-owned task', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-wiring-config-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  const tools = new Map();
  const ctx = fakeCtx();
  ctx.tools = { register: (tool) => { tools.set(tool.name, tool); } };
  // Declaring the job is the supported way to create a config-owned task, so
  // this also exercises the startup sync together with the tool guards. The
  // job is staged as paused on purpose: an armed cron timer would outlive the
  // test and keep the runner waiting.
  const dispose = plugin.apply(ctx, {
    jobs: [{ id: 'cron_cfg', title: 'From config', schedule: '0 4 * * *', prompt: 'summarise', type: 'llm', status: 'paused' }],
  });
  t.after(() => { if (typeof dispose === 'function') dispose(); });

  for (const name of ['cron_pause_task', 'cron_resume_task', 'cron_delete_task', 'cron_update_task']) {
    const tool = tools.get(name);
    assert.ok(tool, name + ' is registered');
    const result = await tool.execute({ id: 'cron_cfg', title: 'Renamed', status: 'paused' });
    assert.equal(result.success, false, name + ' refuses a config-owned task');
    assert.match(result.message || '', /declared in the profile config/);
  }

  const read = await tools.get('cron_get_task').execute({ id: 'cron_cfg' });
  assert.equal(read.success, true, 'reading a config-owned task stays possible');
  assert.equal(read.task.title, 'From config', 'and nothing was changed by the refusals');
  assert.ok(tools.get('cron_run_task'), 'a manual run stays available for a config-owned task');
});

test('#50: dropping the jobs section retires the tasks it used to own', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-wiring-retire-'));
  const previous = process.env.DSH_DATA_DIR;
  process.env.DSH_DATA_DIR = dataDir;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_DATA_DIR;
    else process.env.DSH_DATA_DIR = previous;
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  const toolsWithJobs = new Map();
  const ctxA = fakeCtx();
  ctxA.tools = { register: (tool) => { toolsWithJobs.set(tool.name, tool); } };
  plugin.apply(ctxA, {
    jobs: [{ id: 'cron_retire', title: 'Retire me', schedule: '0 4 * * *', prompt: 'summarise', type: 'llm', status: 'paused' }],
  });

  // A restart without the section: the config no longer owns the task, so the
  // sync must retire it instead of leaving an orphan behind.
  const toolsAfter = new Map();
  const ctxB = fakeCtx();
  ctxB.tools = { register: (tool) => { toolsAfter.set(tool.name, tool); } };
  plugin.apply(ctxB, {});

  const read = await toolsAfter.get('cron_get_task').execute({ id: 'cron_retire' });
  assert.equal(read.success, false, 'the orphaned config task was retired');
});
