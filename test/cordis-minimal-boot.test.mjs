import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, inject, name as pluginName } from '../lib/index.js';

test('Issue #385: plugin boots cleanly in minimal Cordis context where only tools and webServer exist', () => {
  assert.equal(pluginName, '@goodandready/dsh-cron');
  assert.deepEqual(inject, ['tools', 'webServer'], 'inject must contain only tools and webServer');

  const disposers = [];
  const mockTools = {
    register: () => {},
    defineTool: () => {}
  };
  const mockWebServer = {
    register: () => () => {},
    port: 3080
  };

  const services = {
    tools: mockTools,
    webServer: mockWebServer,
    effect: (fn) => {
      const res = fn();
      if (typeof res === 'function') disposers.push(res);
      return res;
    },
    on: () => () => {},
    emit: () => {},
    inject: () => {},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    },
    get: (name) => {
      if (name === 'tools') return mockTools;
      if (name === 'webServer') return mockWebServer;
      return undefined;
    }
  };

  const strictContext = new Proxy(services, {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop);
      if (prop in target) return target[prop];
      throw new Error(`cannot get property "${String(prop)}" without inject`);
    }
  });

  // Calling apply with strictContext must not throw
  assert.doesNotThrow(() => {
    apply(strictContext, {});
  }, 'apply(ctx) must succeed in minimal Cordis context without throwing on optional services');

  // Dispose effects (stops scheduler and timers)
  for (const d of disposers) {
    try { d(); } catch {}
  }
});
