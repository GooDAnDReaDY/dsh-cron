import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('client.js registers with window.__ModuleLoader__ without error', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  let loadedId = null;
  let loadedFactory = null;

  const context = {
    window: {
      __ModuleLoader__: {
        load: ({ id, factory }) => {
          loadedId = id;
          loadedFactory = factory;
        }
      }
    },
    document: {
      head: { appendChild: () => {} },
      getElementById: () => null,
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    },
    console,
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  assert.equal(loadedId, '@goodandready/dsh-cron');
  assert.equal(typeof loadedFactory, 'function');
});

test('Issue #85/#87/#91: slot key matches settings namespace, locale registered, styles marked', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');

  // The settings.plugin.item slot key must equal the server-side settings
  // namespace (register('dsh-cron', ...) in lib/index.js) (#85). Mount
  // points are populated via ctx.slots.inject — a direct register never
  // appears in the settings surface.
  assert.ok(code.includes("const NS = 'dsh-cron';"), 'NS must be dsh-cron');
  assert.ok(code.includes("key: NS"), 'settings.plugin.item slot must use the namespace key');
  assert.ok(code.includes("registerIntoMount(ctx, 'settings.plugin.item'"), 'card registered through the mount inject contract');
  assert.ok(!code.includes('settings.section'), 'no top-level section fallback (#102)');

  // Issue #102: the card checks the settings snapshot status and never
  // renders phantom inputs before it arrives.
  assert.ok(code.includes("loadState !== 'ready'"), 'card checks snapshot status before rendering inputs');
  assert.ok(code.includes("settings.retry"), 'unavailable state offers a retry');

  // Issue #100: the settings card follows the canonical collapsible card
  // contract — collapsed by default, head is the toggle.
  assert.ok(code.includes("const [cardOpen, setCardOpen] = React.useState(false);"), 'card collapsed by default');
  assert.ok(code.includes("'aria-expanded': cardOpen ? 'true' : 'false'"), 'head exposes aria-expanded');
  assert.ok(code.includes('dsh-cron-card-head-btn'), 'head is a toggle button');
  assert.ok(code.includes('dsh-cron-chev-open'), 'chevron rotates when open');

  // English canonical strings live in a locale dictionary that is registered
  // with the DSH locale service (#87)
  assert.ok(code.includes('const STRINGS = {'), 'locale dictionary present');
  assert.ok(code.includes('en: {'), 'English source strings present');
  assert.ok(code.includes('ctx.locale.register(NS, STRINGS)'), 'locale registered with the locale service');

  // Dynamic style tags carry the stable plugin marker (#91)
  assert.ok(code.includes("dataset.dshPlugin = 'dsh-cron'"), 'style tag marked with data-dsh-plugin');

  // Issue #80 regression guards
  assert.ok(code.includes('const [loading, setLoading] = React.useState(false);'), 'setLoading state declared');
  assert.ok(code.includes('const [fetchError, setFetchError] = React.useState(null);'), 'fetchError state declared');
  assert.ok(!code.includes('setRecommendations('), 'no undefined setRecommendations called');
  assert.ok(code.includes('setRecs('), 'setRecs used for recommendations');

  // Background polling regression guard (#82)
  assert.ok(code.includes('setInterval('), 'polling interval present');
  assert.ok(code.includes('clearInterval('), 'cleanup timer on unmount present');
  assert.ok(code.includes("lastStatus: 'running'"), 'instant running status in handleRunNow');
});
