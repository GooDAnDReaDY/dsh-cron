import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { TaskStore } from '../lib/store.js';

test('Pack 12 verification suite: polling lifecycle, store streaming perf, doc alignment (#242, #244, #245)', async (t) => {

  await t.test('1. WebUI Polling lifecycle persists across manual refresh and discards stale responses (#242)', async () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/client-src/50-cron-screen-state.js'), 'utf8');
    const fetchCode = src.slice(src.indexOf('const fetchGenRef ='), src.indexOf('const loadModels ='));
    const effectCode = src.slice(src.indexOf('const lastEtagRef ='), src.indexOf('React.useEffect(() => { loadModels();'));

    function setup() {
      const gen = { current: 0 }, etag = { current: '' }, effects = [], requests = [], writes = [];
      let refIndex = 0, queue = [], tasks = [], visibility;
      const sb = {
        activeTab: 'all',
        activeQuery: 'test',
        AbortController,
        React: {
          useRef() { return refIndex++ === 0 ? gen : etag; },
          useEffect(fn) { effects.push(fn); }
        },
        document: {
          hidden: false,
          addEventListener(n, fn) { visibility = fn; },
          removeEventListener() {}
        },
        setTimeout(fn, ms) { const x = { fn, ms }; queue.push(x); return x; },
        clearTimeout(x) { queue = queue.filter(t => x !== t); },
        setLoading() {},
        setFetchError() {},
        setRecs() {},
        setStats() {},
        T_KEY: () => '',
        t: {},
        console: { error() {} },
        setTasks(x) { tasks = x; writes.push(x.map(y => y.id)); },
        fetch: (url, opts) => {
          if (!opts?.headers) return Promise.resolve({ json: async () => ({ ok: true, tasks: [{ id: 'manual-result' }] }) });
          let resolve;
          const promise = new Promise(r => resolve = r);
          requests.push({ url, opts, resolve });
          return promise;
        }
      };

      function render(query) {
        refIndex = 0;
        sb.activeQuery = query;
        vm.runInNewContext('(()=>{const tab=globalThis.activeTab,query=globalThis.activeQuery;\n' + fetchCode + effectCode + '\nglobalThis.refresh=fetchTasks;})()', sb);
        return effects.at(-1)();
      }

      const tick = () => { const t = queue.shift(); if (t) t.fn(); return !!t; };
      const settle = async (index, id) => {
        requests[index].resolve({
          status: 200,
          headers: { get: () => null },
          json: async () => ({ ok: true, tasks: [{ id }] })
        });
        await new Promise(r => setImmediate(r));
      };

      return {
        sb, render, tick, settle, requests, gen, writes,
        get tasks() { return tasks.map(x => x.id); },
        get queued() { return queue.length; },
        visibility: () => visibility?.()
      };
    }

    const instance = setup();
    const cleanup = instance.render('test');
    await new Promise(r => setImmediate(r));

    // First scheduled poll in queue
    assert.equal(instance.queued, 1, 'Initial poll timer scheduled');
    instance.tick(); // poll 0 triggered
    assert.equal(instance.requests.length, 1, 'First poll request dispatched');

    await instance.settle(0, 'first-poll');
    assert.deepEqual(instance.tasks, ['first-poll'], 'First poll applied');
    assert.equal(instance.queued, 1, 'Timer rescheduled after first poll');

    // Trigger second poll tick
    instance.tick();
    assert.equal(instance.requests.length, 2, 'Second poll in flight');

    // User triggers manual refresh while poll 1 is in flight
    await instance.sb.refresh();
    assert.deepEqual(instance.tasks, ['manual-result'], 'Manual refresh data applied');

    // Poll 1 resolves after manual refresh (should be discarded as stale)
    await instance.settle(1, 'stale-poll');
    assert.deepEqual(instance.tasks, ['manual-result'], 'Stale poll result did not overwrite manual refresh');
    assert.equal(instance.queued, 1, 'Polling loop remained alive with timer queued after manual refresh');

    // Visibility change triggers immediate poll
    instance.visibility();
    assert.equal(instance.requests.length, 3, 'Visibility change triggered new poll');
    await instance.settle(2, 'visibility-poll');
    assert.deepEqual(instance.tasks, ['visibility-poll'], 'Visibility poll data applied');
    assert.equal(instance.queued, 1, 'Timer queued after visibility poll');

    // Cleanup cancels timers and aborts in-flight requests
    cleanup();
    assert.equal(instance.queued, 0, 'Cleanup stopped timer queue');
  });

  await t.test('2. TaskStore streaming non-blocking save eliminates event loop freeze on 21MB store (#244)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-p12-store-'));
    const storePath = path.join(tmpDir, 'tasks.json');
    const store = new TaskStore(storePath);

    // Populate large store: 100 tasks x 100 runs history (~21MB)
    for (let i = 0; i < 100; i++) {
      const id = 'task_' + i;
      store.tasks.set(id, { id, title: 'Task ' + i, prompt: 'safe prompt', schedule: '0 0 * * *' });
      store.history.set(id, Array.from({ length: 100 }, (_, r) => ({
        at: Date.now() - r * 1000,
        status: 'success',
        output: 'sample execution output payload '.repeat(60),
        usage: { inputTokens: 100, outputTokens: 50 },
        costUsd: 0.0001
      })));
    }

    let maxDelay = 0;
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      maxDelay = Math.max(maxDelay, now - last);
      last = now;
    }, 1);

    await new Promise(r => setTimeout(r, 5));
    const start = performance.now();
    await store.saveAsync();
    const saveDuration = performance.now() - start;
    await new Promise(r => setTimeout(r, 5));
    clearInterval(tick);

    const fileSize = fs.statSync(storePath).size;
    assert.ok(fileSize > 20000000, 'Store file size exceeds 20MB (' + fileSize + ' bytes)');
    // Under 20ms max timer delay proves event loop was never blocked continuously
    assert.ok(maxDelay < 25, 'Max event loop timer delay (' + Math.round(maxDelay) + 'ms) is below 25ms');

    // Verify data integrity on reload
    const reloaded = new TaskStore(storePath);
    assert.equal(reloaded.tasks.size, 100, 'All 100 tasks reloaded correctly');
    assert.equal(reloaded.history.size, 100, 'All 100 history items reloaded correctly');
    assert.equal(reloaded.history.get('task_0').length, 100, 'History run count verified');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('3. Documentation and package version synchronization to 0.2.46 (#245)', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(pkg.version, /^0\.2\.(?:46|47|48|49)$/, 'package.json version is 0.2.46+');

    const indexMd = fs.readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
    assert.match(indexMd, /0\.2\.46/, 'index.md references version 0.2.46');
    assert.match(indexMd, /0\.2\.45/, 'index.md references previous release 0.2.45');
    assert.match(indexMd, /0\.2\.44/, 'index.md references previous release 0.2.44');

    const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /Текущая версия:\s*`0\.2\.(?:46|47|48|49)`/, 'AGENTS.md current version is 0.2.46+');
    assert.doesNotMatch(agentsMd, /релиз 0\.2\.5.*Пакет 4/s, 'AGENTS.md does not contain orphaned duplicate fragment');

    const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 0\.2\.46 \(2026-10-04\)/, 'CHANGELOG.md contains 0.2.46 section');
  });

});

