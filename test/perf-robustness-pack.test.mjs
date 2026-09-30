import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { SessionRunner, isTransientError } from '../lib/runner.js';
import { createCronApiHandler } from '../lib/api.js';
import { listRecipes } from '../lib/recipes.js';

function makeTempStore(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-'));
  const filePath = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(filePath);
  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });
  return { store, tmpDir, filePath };
}

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    payload: null,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    writeHead(status, head) { this.statusCode = status; if (head) Object.assign(headers, head); },
    end(payload) {
      if (!payload) return;
      try { this.payload = JSON.parse(payload); } catch (_) { this.payload = payload; }
    },
  };
}

test('#134 Area 1 & 3: isTransientError and runner retry', () => {
  assert.equal(isTransientError(429), true);
  assert.equal(isTransientError(502), true);
  assert.equal(isTransientError(503), true);
  assert.equal(isTransientError(504), true);
  assert.equal(isTransientError(400), false);
  assert.equal(isTransientError(404), false);
  assert.equal(isTransientError(new Error('Rate limit 429 too many requests')), true);
  assert.equal(isTransientError(new Error('ECONNRESET connection reset')), true);
  assert.equal(isTransientError(new Error('SyntaxError: unexpected token')), false);
});

test('#134 Area 1: runner terminates external process on abort without hanging', async () => {
  const runner = new SessionRunner({});
  const controller = new AbortController();

  const task = {
    id: 'test_sleep',
    title: 'Sleep task',
    type: 'script',
    prompt: 'sleep 30',
    timeoutSeconds: 10,
  };

  const start = Date.now();
  await assert.rejects(
    async () => {
      // Abort after 200ms
      setTimeout(() => controller.abort(new Error('Aborted test')), 200);
      await runner.execute(task, { signal: controller.signal });
    },
    (err) => {
      assert.match(err.message, /aborted|killed|timed out/i);
      return true;
    }
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `Process must terminate quickly, took ${elapsed}ms`);
});

test('#134 Area 2: scheduler concurrency throttling default 2', async (t) => {
  const { store } = makeTempStore(t);
  const scheduler = new TaskScheduler(store, {
    executeFn: async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { output: 'ok' };
    },
  });

  // Default maxConcurrent must be 2
  assert.equal(scheduler.maxConcurrent, 2);

  store.set({ id: 't1', title: 'Task 1', schedule: '* * * * *', prompt: 'p1' });
  store.set({ id: 't2', title: 'Task 2', schedule: '* * * * *', prompt: 'p2' });
  store.set({ id: 't3', title: 'Task 3', schedule: '* * * * *', prompt: 'p3' });

  // Start t1 and t2
  const r1 = scheduler.beginRun(store.get('t1'), 't1');
  const r2 = scheduler.beginRun(store.get('t2'), 't2');
  assert.ok(r1, 't1 started');
  assert.ok(r2, 't2 started');

  // t3 must be throttled because running == 2
  const r3 = scheduler.beginRun(store.get('t3'), 't3');
  assert.equal(r3, null, 't3 must be skipped due to concurrency throttling');

  const history = store.getHistory('t3');
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'skipped');
  assert.match(history[0].output, /concurrency limit/i);
});

test('#134 Area 4: ETag and 304 Not Modified support on /tasks', async (t) => {
  const { store } = makeTempStore(t);
  const scheduler = new TaskScheduler(store);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  store.set({ id: 't1', title: 'Task 1', schedule: '0 9 * * *', prompt: 'hello' });

  // First request without ETag
  const res1 = mockRes();
  await handler({ method: 'GET', url: '/dsh-cron/tasks?status=all', headers: {} }, res1);
  assert.equal(res1.statusCode, 200);
  const etag = res1.headers['etag'];
  assert.ok(etag, 'ETag must be returned');
  assert.equal(res1.payload.tasks.length, 1);

  // Second request with If-None-Match matching etag
  const res2 = mockRes();
  await handler({ method: 'GET', url: '/dsh-cron/tasks?status=all', headers: { 'if-none-match': etag } }, res2);
  assert.equal(res2.statusCode, 304);
  assert.equal(res2.payload, null, '304 must not send body');

  // Request with mismatched etag returns 200
  const res3 = mockRes();
  await handler({ method: 'GET', url: '/dsh-cron/tasks?status=all', headers: { 'if-none-match': 'W/"stale123"' } }, res3);
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.payload.tasks.length, 1);
});

test('#134 Area 5: History rotation at 100 entries and archive file generation', async (t) => {
  const { store, tmpDir } = makeTempStore(t);

  store.set({ id: 't_hist', title: 'History Task', schedule: '* * * * *', prompt: 'p' });

  // Record 110 runs
  for (let i = 1; i <= 110; i++) {
    store.recordRun('t_hist', {
      at: Date.now() + i,
      status: 'success',
      output: `run output #${i}`,
    });
  }

  // Active store must contain exactly 100 runs
  const activeRuns = store.getHistory('t_hist', 200);
  assert.equal(activeRuns.length, 100);

  // tasks-history-archive.json must exist and contain the 10 overflow runs
  const archivePath = path.join(tmpDir, 'tasks-history-archive.json');
  assert.ok(fs.existsSync(archivePath), 'Archive file must be created');

  const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
  assert.ok(Array.isArray(archiveData['t_hist']));
  assert.equal(archiveData['t_hist'].length, 10);
  assert.match(archiveData['t_hist'][0].output, /run output/);
});

test('#134 Area 6: Autonomous PR Reviewer recipe (#33)', () => {
  const recipes = listRecipes();
  const prReviewer = recipes.find((r) => r.id === 'recipe_pr_reviewer');
  assert.ok(prReviewer, 'recipe_pr_reviewer must exist in catalog');
  assert.equal(prReviewer.category, 'ci');
  assert.equal(prReviewer.type, 'llm');
  assert.match(prReviewer.prompt, /Pull Requests/i);
  assert.ok(prReviewer.channels.includes('gitea'));
});
