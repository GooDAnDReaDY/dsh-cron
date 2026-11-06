import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { registerRoutes } from '../lib/routes.js';

test('history-zlib-rotation: rotates overflow runs into tasks-history-YYYY-MM.json.gz', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-gz-test-'));
  const filePath = path.join(tmpDir, 'tasks.json');

  const store = new TaskStore(filePath);
  const task = store.set({
    id: 'task_gz_1',
    title: 'Gzip Test Task',
    type: 'shell',
    schedule: '* * * * *',
  });

  // Record 105 runs across two distinct months (e.g. 2026-05 and 2026-06)
  const dMay = new Date('2026-05-15T12:00:00.000Z').getTime();
  const dJune = new Date('2026-06-15T12:00:00.000Z').getTime();

  for (let i = 0; i < 55; i++) {
    store.recordRun('task_gz_1', {
      runId: `run_may_${i}`,
      at: dMay + i * 1000,
      status: 'success',
      output: `output may ${i}`,
    });
  }

  for (let i = 0; i < 55; i++) {
    store.recordRun('task_gz_1', {
      runId: `run_june_${i}`,
      at: dJune + i * 1000,
      status: 'success',
      output: `output june ${i}`,
    });
  }

  // Active runs capped at 100 in memory
  const activeRuns = store.getHistory('task_gz_1', 200);
  assert.equal(activeRuns.length, 100);

  // Check listMonthlyArchives
  const archives = store.listMonthlyArchives();
  assert.ok(archives.length > 0, 'Should find at least 1 monthly archive');
  assert.ok(archives[0].month, 'Archive entry has month');
  assert.ok(archives[0].sizeBytes > 0, 'Archive file has positive size');

  // Check getMonthlyArchive
  const mayArchive = store.getMonthlyArchive('2026-05');
  assert.ok(mayArchive, 'May archive should be readable');
  assert.ok(Array.isArray(mayArchive['task_gz_1']), 'May archive contains runs for task');
  assert.ok(mayArchive['task_gz_1'].length > 0);

  // Check pruning
  store._pruneOldMonthlyArchives(tmpDir, 0); // prune all
  const prunedArchives = store.listMonthlyArchives();
  assert.equal(prunedArchives.length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('history-zlib-rotation: routes /dsh-cron/history/archives and /history/archive/:month work', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-gz-routes-'));
  const filePath = path.join(tmpDir, 'tasks.json');

  const store = new TaskStore(filePath);
  store.set({ id: 't_rot', title: 'Route Rot Task', type: 'shell', schedule: '* * * * *' });

  // Add 105 runs to trigger rotation
  const dApril = new Date('2026-04-10T10:00:00.000Z').getTime();
  for (let i = 0; i < 105; i++) {
    store.recordRun('t_rot', { runId: `r_${i}`, at: dApril + i * 10, status: 'success', output: `out ${i}` });
  }

  // Set up mock cordis webServer
  const registered = new Map();
  const mockCtx = {
    webServer: {
      register: (opts) => {
        registered.set(opts.path, opts.handler);
        return () => registered.delete(opts.path);
      },
    },
    effect: (fn) => fn(),
  };

  registerRoutes(mockCtx, {
    store,
    scheduler: { reload: () => {} },
    runner: null,
    pkgVersion: '0.3.24',
  });

  const archivesHandler = registered.get('/dsh-cron/history/archives');
  assert.ok(archivesHandler, 'Archives collection handler should be registered');

  // Test unauthenticated access rejected (#425)
  let unauthStatus = 0;
  archivesHandler({ method: 'GET', url: '/dsh-cron/history/archives' }, {
    writeHead: (st) => { unauthStatus = st; },
    end: () => {},
  });
  assert.equal(unauthStatus, 401, 'Unauthenticated history archives request must be rejected with 401');

  const makeMockReq = (url) => ({
    method: 'GET',
    url,
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  });

  // Test /history/archives GET
  let resStatus = 0;
  let resHeaders = {};
  let resBody = '';
  const mockRes = {
    writeHead: (st, hdrs) => { resStatus = st; resHeaders = hdrs; },
    end: (b) => { resBody = b; },
  };

  archivesHandler(makeMockReq('/dsh-cron/history/archives'), mockRes);
  assert.equal(resStatus, 200);
  const parsedArchives = JSON.parse(resBody);
  assert.equal(parsedArchives.ok, true);
  assert.ok(Array.isArray(parsedArchives.archives));
  assert.ok(parsedArchives.archives.some((a) => a.month === '2026-04'));

  // Test /history/archive/2026-04 GET
  const archiveMonthHandler = registered.get('/dsh-cron/history/archive/');
  assert.ok(archiveMonthHandler, 'Single archive handler should be registered');

  let resMonthBody = '';
  const mockResMonth = {
    writeHead: (st, hdrs) => { resStatus = st; resHeaders = hdrs; },
    end: (b) => { resMonthBody = b; },
  };

  archiveMonthHandler(makeMockReq('/dsh-cron/history/archive/2026-04'), mockResMonth);
  assert.equal(resStatus, 200);
  const parsedMonth = JSON.parse(resMonthBody);
  assert.equal(parsedMonth.ok, true);
  assert.equal(parsedMonth.month, '2026-04');
  assert.ok(parsedMonth.archive['t_rot']);

  // Test 404 for missing month
  archiveMonthHandler(makeMockReq('/dsh-cron/history/archive/1999-01'), mockResMonth);
  assert.equal(resStatus, 404);

  // Test 400 for bad format
  archiveMonthHandler(makeMockReq('/dsh-cron/history/archive/invalid-month'), mockResMonth);
  assert.equal(resStatus, 400);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
