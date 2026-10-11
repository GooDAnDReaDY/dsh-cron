import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { apply } from '../lib/index.js';
import { TaskStore } from '../lib/store.js';

test('Pack 11 verification suite: native Cordis, polling abort, store yield, docs sync', async (t) => {

  await t.test('1. Native Cordis Context without config inject does not throw and reads ctx.fiber.config (#235)', async (t2) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-p11-ctx-'));
    let cleanupLifecycle = null;
    t2.after(() => {
      if (cleanupLifecycle) cleanupLifecycle();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const strictCtx = {
      fiber: {
        config: {
          cronDir: tmpDir,
          maxConcurrent: 1,
          defaultTimezone: 'Asia/Tokyo',
          llmActionsEnabled: true,
          heartbeatUrl: 'http://127.0.0.1:9999/beat',
          heartbeatIntervalSec: 60,
        }
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      on: (event, handler) => {
        strictCtx._handler = handler;
      },
      inject: (deps, fn) => {
        // dynamic inject helper in Cordis Context
      },
      effect: (fn) => {
        const disposer = fn();
        if (typeof disposer === 'function') {
          cleanupLifecycle = disposer;
        }
        return disposer;
      },
      tools: {
        register: () => {}
      },
      webServer: {
        register: ({ path: rPath, handler }) => {
          strictCtx._routes = strictCtx._routes || {};
          strictCtx._routes[rPath] = handler;
        }
      }
    };

    // Define strict getter that throws when ctx.config is accessed directly
    Object.defineProperty(strictCtx, 'config', {
      get() {
        throw new TypeError('cannot get property "config" without inject');
      },
      configurable: true
    });

    const rawConfig = { cronDir: tmpDir, maxConcurrent: 2, defaultTimezone: 'UTC' };

    // apply() must succeed without throwing
    assert.doesNotThrow(() => {
      apply(strictCtx, rawConfig);
    });

    // Test GET /dsh-cron/settings
    const getSettingsHandler = strictCtx._routes['/dsh-cron/settings'];
    assert.equal(typeof getSettingsHandler, 'function');

    let responsePayload = null;
    let responseStatus = 0;
    const req = { method: 'GET' };
    const res = {
      writeHead: (status) => { responseStatus = status; },
      end: (data) => { responsePayload = JSON.parse(data); }
    };

    await getSettingsHandler(req, res);
    assert.equal(responseStatus, 200);
    assert.equal(responsePayload.ok, true);
    assert.equal(responsePayload.settings.maxConcurrent, 1);
    assert.equal(responsePayload.settings.defaultTimezone, 'Asia/Tokyo');
    assert.equal(responsePayload.settings.llmActionsEnabled, true);

    // Simulate loader/volatile-update event
    strictCtx.fiber.config.maxConcurrent = 5;
    strictCtx.fiber.config.defaultTimezone = 'Europe/Berlin';
    if (strictCtx._handler) {
      assert.doesNotThrow(() => {
        strictCtx._handler(['maxConcurrent', 'defaultTimezone']);
      });
    }

    // Verify GET /settings reflects the live updated config
    await getSettingsHandler(req, res);
    assert.equal(responseStatus, 200);
    assert.equal(responsePayload.settings.maxConcurrent, 5);
    assert.equal(responsePayload.settings.defaultTimezone, 'Europe/Berlin');
  });

  await t.test('2. Fallback to rawConfig when neither ctx.fiber nor ctx.config is available (#235)', async (t2) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-p11-fallback-'));
    let cleanupLifecycle = null;
    t2.after(() => {
      if (cleanupLifecycle) cleanupLifecycle();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const minimalCtx = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      on: () => {},
      inject: () => {},
      effect: (fn) => {
        const disposer = fn();
        if (typeof disposer === 'function') cleanupLifecycle = disposer;
        return disposer;
      },
      tools: { register: () => {} },
      webServer: { register: () => {} }
    };

    let liveMax = 3;
    const rawConfigWithGetter = {
      cronDir: tmpDir,
      get maxConcurrent() { return liveMax; },
      defaultTimezone: 'UTC'
    };

    assert.doesNotThrow(() => {
      apply(minimalCtx, rawConfigWithGetter);
    });
  });

  await t.test('3. TaskStore.saveAsync() yields to event loop before/after stringify (#244)', async (t2) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-p11-store-'));
    t2.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const storePath = path.join(tmpDir, 'tasks.json');
    const store = new TaskStore(storePath);

    // Add test tasks into store map
    store.tasks.set('t1', { id: 't1', title: 'Task 1', schedule: '0 * * * *', type: 'shell', command: 'echo 1' });
    store.tasks.set('t2', { id: 't2', title: 'Task 2', schedule: '0 0 * * *', type: 'shell', command: 'echo 2' });

    let eventLoopTicked = false;
    setImmediate(() => {
      eventLoopTicked = true;
    });

    const savePromise = store.saveAsync();
    assert.equal(typeof savePromise.then, 'function');
    await savePromise;

    // Verify event loop had a chance to tick
    assert.equal(eventLoopTicked, true);
    assert.equal(fs.existsSync(storePath), true);
    const diskContent = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(diskContent.tasks.length, 2);
  });

  await t.test('4. WebUI Polling contract includes AbortController and generation guard (#242)', async () => {
    const clientStateSrc = fs.readFileSync(
      path.resolve(import.meta.dirname, '../lib/client-src/50-cron-screen-state.js'),
      'utf8'
    );

    // Assert AbortController is instantiated in polling
    assert.match(clientStateSrc, /pollController\s*=\s*\(typeof AbortController !== 'undefined'\)\s*\?\s*new AbortController\(\)\s*:\s*null/);
    // Assert signal is passed into fetch
    assert.match(clientStateSrc, /if \(pollController\) fetchOpts\.signal = pollController\.signal/);
    // Assert pollController.abort() on cleanup
    assert.match(clientStateSrc, /if \(pollController\) pollController\.abort\(\)/);
    // Assert currentGen check protects state updates
    assert.match(clientStateSrc, /if \(isDestroyed \|\| (?:currentGen|pollGen) !== fetchGenRef\.current\) return;/);
  });

  await t.test('5. Documentation and package version synchronization to 0.2.45 (#245)', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(pkg.version, /^0\.2\.(?:45|46|47|48|49|50|51|52)$/);

    const indexMd = fs.readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
    assert.match(indexMd, /0\.2\.45/);
    assert.doesNotMatch(indexMd, /Статус\*\*:\s*active,\s*релиз\s*`0\.2\.8`/);

    const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /Текущая версия:\s*`0\.2\.(?:45|46|47|48|49|50|51|52)`/);
    assert.match(agentsMd, /Текущий статус:\s*active,\s*релиз\s*`0\.2\.(?:45|46|47|48|49|50|51|52)`/);

    const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 0\.2\.45 \(2026-10-04\)/);
  });

});
