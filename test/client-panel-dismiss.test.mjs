/**
 * Fork delta (#266): the panel closes on any click outside its own controls.
 *
 * Upstream only closed it for session rows of one class naming, so selecting a
 * workspace, opening another panel or expanding a scenario heading left the
 * panel covering the conversation column with nothing happening.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const PANEL_OWNED_SELECTOR = '[data-dsh-cron-view], [data-dsh-plugin="dsh-cron"]';

/** Load the built client bundle and return its plugin module. */
function loadClient() {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  const clicks = [];
  const observers = [];
  const intervals = [];
  const registered = [];
  const attributes = new Map();
  const elements = new Map();

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      const index = observers.indexOf(this);
      if (index !== -1) observers.splice(index, 1);
    }
  }

  const mockDocument = {
    head: { appendChild: (el) => { if (el.id) elements.set(el.id, el); return el } },
    body: { appendChild: () => {}, removeChild: () => {}, querySelector: () => null },
    documentElement: {
      appendChild: (el) => el,
      setAttribute: (name) => { attributes.set(name, '') },
      removeAttribute: (name) => { attributes.delete(name) },
      getAttribute: (name) => (attributes.has(name) ? '' : null),
    },
    getElementById: (id) => elements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), id: '', dataset: {}, style: {}, setAttribute: () => {}, getAttribute: () => null, appendChild: () => {}, addEventListener: () => {} }),
    addEventListener: (type, handler, capture) => { if (type === 'click' && capture === true) clicks.push(handler) },
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };

  const context = {
    window: { MutationObserver: MockMutationObserver, __ModuleLoader__: { load: ({ factory }) => { context.factory = factory } } },
    document: mockDocument,
    console,
    MutationObserver: MockMutationObserver,
    setInterval: (fn) => { const id = { fn }; intervals.push(id); return id },
    clearInterval: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, tasks: [] }) }),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  vm.createContext(context);
  vm.runInContext(code, context);

  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const clientPlugin = context.factory((name) => (name === 'react' ? React : {}));
  const ctx = {
    locale: { register: () => {}, bind: () => () => '' },
    slots: { inject: (mount, register) => { register(); return true }, register: (entry, component) => { registered.push({ entry, component }) } },
    effect: (fn) => fn(),
  };
  clientPlugin.apply(ctx);

  return {
    clientPlugin,
    clicks,
    attributes,
    chip: registered.find(row => row.entry.name === 'conversation.session.header.utilities')?.component,
  };
}

test('#266: the dismiss rule keeps the panel for its own controls and leaves otherwise', () => {
  const { clientPlugin } = loadClient();
  const rule = clientPlugin.panelDismissRule;
  assert.equal(typeof rule, 'function', 'the rule is exposed for this suite');

  const owned = { closest: (selector) => (selector === PANEL_OWNED_SELECTOR ? {} : null) };
  const sidebarRow = { closest: () => null };
  assert.equal(rule(owned), false, 'a click inside the panel keeps it open');
  assert.equal(rule(sidebarRow), true, 'a click on another surface dismisses it');
  assert.equal(rule(null), false, 'a synthetic click without a target is ignored');
  assert.equal(rule({}), false, 'a target without closest() is ignored');
});

test('#266: a real outside click closes the open panel, an owned click does not', () => {
  const { clicks, attributes, chip } = loadClient();
  assert.equal(clicks.length, 1, 'one capture-phase click listener is installed');
  assert.equal(typeof chip, 'function', 'the session-header chip is registered');

  const openPanel = () => chip({ t: (key) => key }).props.onClick();
  const click = (target) => clicks[0]({ target });

  assert.equal(attributes.has('data-dsh-cron-active'), false, 'the panel starts closed');
  openPanel();
  assert.equal(attributes.has('data-dsh-cron-active'), true, 'the chip opens the panel');

  click({ closest: (selector) => (selector === PANEL_OWNED_SELECTOR ? {} : null) });
  assert.equal(attributes.has('data-dsh-cron-active'), true, 'clicking the panel keeps it open');

  click({ closest: () => null });
  assert.equal(attributes.has('data-dsh-cron-active'), false, 'clicking another menu closes the panel');

  click({ closest: () => null });
  assert.equal(attributes.has('data-dsh-cron-active'), false, 'a click while closed stays closed');
});

test('#266: the sidebar job list re-asserts its seat under the entry', () => {
  const { clientPlugin } = loadClient();
  const seat = clientPlugin.sidebarJobsSeatIsCurrent;
  assert.equal(typeof seat, 'function', 'the seat check is exposed for this suite');

  const entry = {}
  const connectedRoot = { isConnected: true, previousElementSibling: entry }
  assert.equal(seat({ root: connectedRoot }, entry), true, 'a list directly under the entry is in place');
  assert.equal(seat({ root: connectedRoot }, {}), false, 'another row between them means the seat moved');
  assert.equal(seat({ root: undefined }, entry), false, 'an unmounted list has no seat');
  assert.equal(seat({ root: { ...connectedRoot, isConnected: false } }, entry), false, 'a detached list must be re-placed');
  assert.equal(seat({ root: connectedRoot }, null), false, 'a missing entry cannot host the list');
});

test('#266: the built bundle no longer dismisses on sidebar class names alone', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  assert.ok(!code.includes('SESSION_ROW_SELECTOR'), 'the session-row heuristic is gone');
  assert.ok(code.includes('shouldDismissPanel'), 'the outside-click rule is wired');
  assert.ok(code.includes("'data-dsh-plugin': 'dsh-cron'"), 'the header chip is a panel-owned control');
  assert.ok(code.includes('sidebarJobsSeatIsCurrent'), 'the job list re-asserts its seat under the entry');
});
