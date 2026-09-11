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
