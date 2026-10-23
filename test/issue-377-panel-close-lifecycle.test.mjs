import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('client.css has resolved attribute selectors and no unexpanded template literals', () => {
  const css = fs.readFileSync(new URL('../lib/client.css', import.meta.url), 'utf-8');
  assert.match(css, /\[data-dsh-cron-view\]/, 'Contains [data-dsh-cron-view]');
  assert.match(css, /html\[data-dsh-cron-active\]/, 'Contains html[data-dsh-cron-active]');
  assert.doesNotMatch(css, /\$\{VIEW_ATTR\}/, 'No unexpanded ${VIEW_ATTR}');
  assert.doesNotMatch(css, /\$\{ACTIVE_ATTR\}/, 'No unexpanded ${ACTIVE_ATTR}');
});

test('client.js: mountCronScreen lifecycle, gated ensure, teardownPanel on close (GH #16, Issue #377)', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');

  let factory = null;
  const mockModuleLoader = {
    load: ({ id, factory: f }) => {
      if (id === '@goodandready/dsh-cron') factory = f;
    }
  };

  // Mock DOM
  let containerRemoved = false;
  let rootUnmounted = false;
  let appendedElement = null;

  class MockElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.attributes = {};
      this.dataset = {};
      this.children = [];
      this.parentElement = null;
      this.isConnected = true;
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] || null; }
    removeAttribute(k) { delete this.attributes[k]; }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      child.isConnected = true;
      appendedElement = child;
      return child;
    }
    remove() {
      containerRemoved = true;
      this.isConnected = false;
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx >= 0) this.parentElement.children.splice(idx, 1);
        this.parentElement = null;
      }
    }
    closest(selector) {
      if (selector.includes('sessionRow') && this.attributes['data-session']) return this;
      return null;
    }
  }

  const documentElement = new MockElement('html');
  const head = new MockElement('head');
  const body = new MockElement('body');
  const conversationCol = new MockElement('div');
  conversationCol.attributes['class'] = 'pI_x6G_centerCol';
  body.appendChild(conversationCol);

  const eventListeners = new Map();
  let observerCallback = null;

  class MockMutationObserver {
    constructor(cb) {
      observerCallback = cb;
    }
    observe() {}
    disconnect() {
      observerCallback = null;
    }
  }

  const mockDocument = {
    documentElement,
    head,
    body,
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => null,
    querySelector: (sel) => {
      if (sel.includes('centerCol') || sel.includes('conversation')) return conversationCol;
      return null;
    },
    querySelectorAll: (sel) => [],
    addEventListener: (type, fn) => {
      if (!eventListeners.has(type)) eventListeners.set(type, new Set());
      eventListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (eventListeners.has(type)) eventListeners.get(type).delete(fn);
    },
    dispatchEvent: (ev) => {
      const fns = eventListeners.get(ev.type);
      if (fns) {
        for (const fn of fns) fn(ev);
      }
    }
  };

  class MockCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  }

  const mockReactDOM = {
    createRoot: (container) => ({
      render: (el) => {
        container.__rendered = el;
      },
      unmount: () => {
        rootUnmounted = true;
      }
    })
  };

  const mockReact = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (init) => [init, () => {}],
    useEffect: (fn) => fn(),
  };

  const context = {
    window: {
      __ModuleLoader__: mockModuleLoader,
      MutationObserver: MockMutationObserver,
      CustomEvent: MockCustomEvent,
      React: mockReact,
      ReactDOM: mockReactDOM,
    },
    document: mockDocument,
    MutationObserver: MockMutationObserver,
    CustomEvent: MockCustomEvent,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ tasks: [] }) }),
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    console,
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  assert.equal(typeof factory, 'function', 'Factory function loaded');

  // Load the plugin module
  const mockCtx = {
    slots: { inject: () => true, register: () => {} },
    locale: { register: () => {}, bind: () => (k) => k },
    effect: (fn) => fn()
  };

  let capturedToggle = null;
  // Capture toggle by inspecting slots.inject
  mockCtx.slots.inject = (mount, cb) => {
    mockCtx.slots.register = (entry) => {
      if (entry && entry.inject) {
        const injected = entry.inject();
        if (injected && injected.toggle) capturedToggle = injected.toggle;
      }
    };
    cb();
    return true;
  };

  const mod = factory((id) => {
    if (id === 'react') return mockReact;
    if (id === 'react-dom/client') return mockReactDOM;
    return {};
  });

  mod.apply(mockCtx);
  assert.ok(capturedToggle, 'Captured toggle instance');

  // 1. Initially toggle is closed: ensure() must NOT mount the panel!
  assert.equal(capturedToggle.isOpen(), false, 'Toggle is initially false');
  assert.equal(conversationCol.children.length, 0, 'No container mounted when closed');
  assert.equal(documentElement.attributes['data-dsh-cron-active'], undefined, 'No active attribute on html');

  // 2. MutationObserver triggering when closed must NOT mount the panel
  assert.ok(observerCallback, 'MutationObserver callback registered');
  observerCallback();
  assert.equal(conversationCol.children.length, 0, 'Container still not mounted after DOM mutation');

  // 3. Opening the panel (toggle.set(true))
  capturedToggle.set(true);
  assert.equal(capturedToggle.isOpen(), true, 'Toggle is now true');
  assert.equal(documentElement.attributes['data-dsh-cron-active'], '', 'data-dsh-cron-active added to html');
  assert.equal(conversationCol.children.length, 1, 'Container mounted into conversation column');
  const mountedContainer = conversationCol.children[0];
  assert.equal(mountedContainer.attributes['data-dsh-cron-view'], '', 'Container has data-dsh-cron-view');
  assert.ok(mountedContainer.__rendered, 'React component rendered into container');

  // 4. Closing the panel via toggle.set(false) ("Back to chat" click)
  containerRemoved = false;
  rootUnmounted = false;
  capturedToggle.set(false);
  assert.equal(capturedToggle.isOpen(), false, 'Toggle is now false');
  assert.equal(documentElement.attributes['data-dsh-cron-active'], undefined, 'data-dsh-cron-active removed from html');
  assert.equal(rootUnmounted, true, 'ReactDOM root.unmount() called');
  assert.equal(containerRemoved, true, 'Container element remove() called');
  assert.equal(conversationCol.children.length, 0, 'Container removed from column');

  // 5. Subsequent DOM mutations after close must NOT resurrect the container
  observerCallback();
  assert.equal(conversationCol.children.length, 0, 'Container does not remount on DOM mutation');

  // 6. Repeat calls to toggle.set(false) still trigger listeners and enforce teardown
  let listenerCalled = false;
  capturedToggle.subscribe(() => { listenerCalled = true; });
  capturedToggle.set(false);
  assert.equal(listenerCalled, true, 'Listener notified even on repeat false value');

  // 7. Open again, then test external panel activation closes it
  capturedToggle.set(true);
  assert.equal(conversationCol.children.length, 1, 'Container remounted on open');
  mockDocument.dispatchEvent(new MockCustomEvent('dsh-panel-activate', { detail: 'other-panel' }));
  assert.equal(capturedToggle.isOpen(), false, 'Panel closed on other activate');
  assert.equal(conversationCol.children.length, 0, 'Container torn down on other activate');

  // 8. Open again, then test sidebar session row click closes it
  capturedToggle.set(true);
  assert.equal(conversationCol.children.length, 1, 'Container remounted on open');
  const sessionRow = new MockElement('div');
  sessionRow.attributes['data-session'] = '123';
  sessionRow.attributes['class'] = 'sessionRow';
  const clickEvent = { target: sessionRow };
  const clickListeners = eventListeners.get('click');
  assert.ok(clickListeners, 'Click listeners registered');
  for (const fn of clickListeners) fn(clickEvent);
  assert.equal(capturedToggle.isOpen(), false, 'Panel closed on sidebar click');
  assert.equal(conversationCol.children.length, 0, 'Container torn down on sidebar click');
});
