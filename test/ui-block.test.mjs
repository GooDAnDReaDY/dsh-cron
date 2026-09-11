import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { createCronApiHandler, buildDuplicateTask, buildTaskExport, validateImportDocument, planImport, TASK_EXPORT_KIND } from '../lib/index.js';

function mockReq(chunks) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

/** A POST request whose JSON body arrives as a stream, like a real one. */
function mockPost(url, body, headers = {}) {
  const req = mockReq([Buffer.from(JSON.stringify(body), 'utf8')]);
  req.method = 'POST';
  req.url = url;
  req.headers = headers;
  return req;
}

const SCRIPT_CONFIRM = { 'x-dsh-cron-confirm': 'script' };

function mockRes() {
  const res = {
    statusCode: 0,
    payload: null,
    writeHead(code) { this.statusCode = code; },
    end(payload) { this.payload = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-ui-block-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

// ------------------------------------------------------------------ #41

test('#41: a duplicate inherits configuration and resets execution state', () => {
  const source = {
    id: 'cron_source',
    title: 'Nightly digest',
    schedule: '0 3 * * *',
    scheduleText: 'Every day at 03:00',
    prompt: 'summarise',
    type: 'llm',
    status: 'active',
    provider: 'deepseek',
    model: 'deepseek-chat',
    channels: ['discord', 'slack'],
    template: 'DIGEST {title}',
    timeoutSeconds: 900,
    overlapPolicy: 'queue',
    oneShot: false,
    totalTokens: 12345,
    totalCostUsd: 1.5,
    lastRunAt: 1700000000000,
    lastStatus: 'success',
    lastDurationMs: 812,
    nextRunAt: 1800000000000,
    attempts: 2,
  };

  const copy = buildDuplicateTask(source, { id: 'cron_copy' });

  assert.equal(copy.id, 'cron_copy', 'a new id is used');
  assert.equal(copy.title, 'Nightly digest (copy)');
  assert.equal(copy.status, 'paused', 'a copy never starts active');
  assert.equal(copy.schedule, source.schedule);
  assert.equal(copy.scheduleText, source.scheduleText);
  assert.equal(copy.prompt, source.prompt);
  assert.equal(copy.model, source.model);
  assert.equal(copy.timeoutSeconds, 900);
  assert.equal(copy.overlapPolicy, 'queue');
  assert.equal(copy.template, 'DIGEST {title}');
  assert.deepEqual(copy.channels, ['discord', 'slack']);

  assert.equal(copy.totalTokens, undefined, 'token totals are not inherited');
  assert.equal(copy.totalCostUsd, undefined, 'cost totals are not inherited');
  assert.equal(copy.lastRunAt, undefined, 'last run info is not inherited');
  assert.equal(copy.lastStatus, undefined);
  assert.equal(copy.lastDurationMs, undefined);
  assert.equal(copy.nextRunAt, undefined, 'no next run until the user resumes it');
  assert.equal(copy.attempts, undefined, 'retry counter is not inherited');

  // Arrays must be copied, not shared with the source.
  copy.channels.push('ntfy');
  assert.deepEqual(source.channels, ['discord', 'slack'], 'the source is untouched');
  assert.equal(source.status, 'active', 'the source keeps its status');
});

test('#41: duplicating one-shot keeps it inert (no next run inherited)', () => {
  const source = { id: 'cron_os', title: 'One shot', schedule: 'at: 2026-09-05T15:00:00Z', oneShot: true, status: 'active', nextRunAt: 1700000000000 };
  const copy = buildDuplicateTask(source, { id: 'cron_os_copy' });
  assert.equal(copy.oneShot, true, 'a one-shot copy stays one-shot');
  assert.equal(copy.nextRunAt, undefined);
  assert.equal(copy.status, 'paused');
});

test('#41: POST duplicate creates a paused copy with empty history and leaves the source alone', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  const created = store.set({
    id: 'cron_orig',
    title: 'Watch disk',
    schedule: '0 4 * * *',
    prompt: 'df -h',
    type: 'script',
    status: 'active',
    channels: ['discord'],
    totalTokens: 500,
    totalCostUsd: 0.25,
    lastStatus: 'success',
  });
  store.recordRun('cron_orig', { at: Date.now(), status: 'success', durationMs: 12, output: 'ok' });
  assert.equal(store.getHistory('cron_orig').length, 1, 'the source has history');
  const beforeCopy = { ...store.get('cron_orig') };

  const res = mockRes();
  await handler({ method: 'POST', url: '/dsh-cron/tasks/cron_orig/duplicate', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  const copy = res.payload.task;
  assert.notEqual(copy.id, 'cron_orig');
  assert.equal(copy.status, 'paused');
  assert.equal(copy.title, 'Watch disk (copy)');
  assert.deepEqual(copy.channels, ['discord']);
  assert.equal(copy.totalTokens, undefined);
  assert.equal(store.getHistory(copy.id).length, 0, 'the copy starts without history');

  const original = store.get('cron_orig');
  assert.equal(original.status, beforeCopy.status, 'the source keeps its status');
  assert.equal(original.totalTokens, beforeCopy.totalTokens, 'the source keeps its counters');
  assert.equal(original.totalCostUsd, beforeCopy.totalCostUsd);
  assert.equal(original.lastStatus, beforeCopy.lastStatus);
  assert.equal(store.getHistory('cron_orig').length, 1);

  // A paused copy must not be scheduled.
  assert.equal(scheduler.jobs.has(copy.id), false, 'the copy is not armed');
});

test('#41: duplicating a missing task answers 404', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const res = mockRes();
  await handler({ method: 'POST', url: '/dsh-cron/tasks/cron_nope/duplicate', headers: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.error, 'Task not found');
});

// ------------------------------------------------------------------ #42

const EXPORTABLE_SOURCE = {
  id: 'cron_a',
  title: 'Watch disk',
  schedule: '0 4 * * *',
  scheduleText: 'Every day at 04:00',
  prompt: 'df -h',
  type: 'script',
  status: 'active',
  channels: ['discord', 'slack'],
  template: 'DISK {title}',
  timeoutSeconds: 600,
  totalTokens: 999,
  totalCostUsd: 0.5,
  lastRunAt: 1700000000000,
  lastStatus: 'success',
  nextRunAt: 1800000000000,
};

test('#42: an export carries configuration only, never run state or status', () => {
  const doc = buildTaskExport([EXPORTABLE_SOURCE]);
  assert.equal(doc.kind, TASK_EXPORT_KIND);
  assert.equal(doc.version, 1);
  assert.ok(doc.exportedAt, 'export is timestamped');
  assert.equal(doc.tasks.length, 1);
  const task = doc.tasks[0];
  assert.equal(task.id, 'cron_a', 'identity is kept for replace-by-id');
  assert.equal(task.title, 'Watch disk');
  assert.equal(task.schedule, '0 4 * * *');
  assert.equal(task.type, 'script');
  assert.equal(task.timeoutSeconds, 600);
  assert.deepEqual(task.channels, ['discord', 'slack']);
  assert.equal(task.status, undefined, 'status is not part of the export');
  assert.equal(task.totalTokens, undefined, 'token totals are not exported');
  assert.equal(task.totalCostUsd, undefined);
  assert.equal(task.lastRunAt, undefined);
  assert.equal(task.lastStatus, undefined);
  assert.equal(task.nextRunAt, undefined);
});

test('#42: a malformed import document is rejected as a whole', () => {
  assert.equal(validateImportDocument(null).ok, false);
  assert.match(validateImportDocument({}).error, /kind marker/);
  assert.match(validateImportDocument({ kind: TASK_EXPORT_KIND, version: 99, tasks: [] }).error, /newer than this plugin/);
  assert.match(validateImportDocument({ kind: TASK_EXPORT_KIND, version: 1 }).error, /no tasks array/);
  assert.match(validateImportDocument({ kind: TASK_EXPORT_KIND, version: 1, tasks: [{}] }).error, /no title/);
  assert.match(validateImportDocument({ kind: TASK_EXPORT_KIND, version: 1, tasks: [{ title: 'a' }] }).error, /no schedule/);
  assert.match(validateImportDocument({ kind: TASK_EXPORT_KIND, version: 1, tasks: [{ title: 'a', schedule: '0 4 * * *' }] }).error, /no prompt/);
  const badType = validateImportDocument({ kind: TASK_EXPORT_KIND, version: 1, tasks: [{ title: 'a', schedule: '0 4 * * *', prompt: 'x', type: 'http', httpUrl: 'not a url' }] });
  assert.equal(badType.ok, false);
  assert.match(badType.error, /Invalid HTTP URL/);
});

test('#42: a valid document is accepted and unknown channels are dropped', () => {
  const checked = validateImportDocument({
    kind: TASK_EXPORT_KIND,
    version: 1,
    tasks: [{ title: 'a', schedule: '0 4 * * *', prompt: 'x', type: 'script', channels: ['discord', 'email'] }],
  });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.tasks[0].channels, ['discord'], 'a channel that no longer exists is dropped');
  assert.equal(checked.tasks[0].type, 'script');
});

test('#42: the import plan honours add / replace / skip', () => {
  const incoming = [{ id: 'cron_a', title: 'A' }, { id: 'cron_b', title: 'B' }];
  const existing = ['cron_a'];

  const skip = planImport(incoming, existing, 'skip');
  assert.deepEqual(skip.add.map((t) => t.id), ['cron_b']);
  assert.deepEqual(skip.replace, []);
  assert.deepEqual(skip.skip.map((t) => t.id), ['cron_a']);

  const replace = planImport(incoming, existing, 'replace');
  assert.deepEqual(replace.add.map((t) => t.id), ['cron_b']);
  assert.deepEqual(replace.replace.map((t) => t.id), ['cron_a']);
  assert.deepEqual(replace.skip, []);

  const add = planImport(incoming, existing, 'add');
  assert.deepEqual(add.add.map((t) => t.id), [undefined, 'cron_b'], 'a colliding id is dropped so a new one is generated');
  assert.deepEqual(add.replace, []);
  assert.deepEqual(add.skip, []);

  assert.equal(planImport(incoming, existing, 'nonsense').strategy, 'skip', 'an unknown strategy falls back to the safe one');
});

test('#42: export and import round-trip through the API', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  store.set({ id: 'cron_a', title: 'Watch disk', schedule: '0 4 * * *', prompt: 'df -h', type: 'script', status: 'paused', channels: ['discord'], totalTokens: 42 });
  store.recordRun('cron_a', { at: Date.now(), status: 'success', durationMs: 5, output: 'ok' });

  const exportRes = mockRes();
  await handler({ method: 'GET', url: '/dsh-cron/tasks/export', headers: {} }, exportRes);
  assert.equal(exportRes.statusCode, 200);
  assert.equal(exportRes.payload.count, 1);
  const document_ = exportRes.payload.document;
  assert.equal(document_.tasks[0].totalTokens, undefined);

  // Dry run reports the plan without touching the store.
  const dryRes = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: document_, dryRun: true, strategy: 'skip' }, SCRIPT_CONFIRM), dryRes);
  assert.equal(dryRes.statusCode, 200);
  assert.deepEqual(dryRes.payload.summary, { add: 0, replace: 0, skip: 1 });
  assert.equal(store.list({ status: 'all' }).length, 1, 'a dry run changes nothing');

  // Skip leaves the existing task alone.
  const skipRes = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: document_, strategy: 'skip' }, SCRIPT_CONFIRM), skipRes);
  assert.equal(skipRes.payload.imported, 0);
  assert.equal(store.list({ status: 'all' }).length, 1);

  // Add creates a second task with a fresh id.
  const addRes = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: document_, strategy: 'add' }, SCRIPT_CONFIRM), addRes);
  assert.equal(addRes.payload.imported, 1);
  const all = store.list({ status: 'all' });
  assert.equal(all.length, 2);
  const imported = all.find((x) => x.id !== 'cron_a');
  assert.ok(imported.id, 'the imported task has an id');
  assert.equal(imported.title, 'Watch disk');
  assert.equal(imported.totalTokens, 0, 'run counters start clean');
  assert.equal(store.getHistory(imported.id).length, 0);

  // A broken document is refused without side effects.
  const badRes = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: { kind: 'other' }, strategy: 'add' }), badRes);
  assert.equal(badRes.statusCode, 400);
  assert.equal(store.list({ status: 'all' }).length, 2, 'the store is untouched after a rejected import');
});

// ------------------------------------- #42 hardening (independent review findings)

function exportDoc(tasks) {
  return { kind: TASK_EXPORT_KIND, version: 1, exportedAt: new Date().toISOString(), tasks };
}

test('#42: importing code-executing tasks needs the confirm header', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const doc = exportDoc([{ title: 'node job', schedule: '0 4 * * *', prompt: 'console.log(1)', type: 'node' }]);

  const denied = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: doc, strategy: 'add' }), denied);
  assert.equal(denied.statusCode, 403, 'a hand-edited file cannot bypass the code-execution gate');
  assert.match(denied.payload.error, /x-dsh-cron-confirm/);
  assert.equal(store.list({ status: 'all' }).length, 0, 'nothing was written');

  const allowed = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: doc, strategy: 'add' }, SCRIPT_CONFIRM), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(store.list({ status: 'all' }).length, 1);
});

test('#42: an imported task is always paused and keeps only whitelisted fields', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  // A tampered file: it claims to be active and carries run state plus junk keys.
  const doc = exportDoc([{
    id: 'cron_tampered',
    title: 'sneaky',
    schedule: '0 4 * * *',
    prompt: 'echo hi',
    type: 'script',
    status: 'active',
    totalTokens: 999999,
    totalCostUsd: 42,
    lastStatus: 'success',
    nextRunAt: Date.now() + 1000,
    attempts: 7,
    running: true,
    unexpectedField: 'x',
  }]);

  const res = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: doc, strategy: 'add' }, SCRIPT_CONFIRM), res);
  assert.equal(res.statusCode, 200);
  const task = store.get('cron_tampered');
  assert.ok(task, 'the task was imported');
  assert.equal(task.status, 'paused', 'the file cannot make a task active');
  assert.equal(task.totalTokens, 0, 'the tampered token counter was not carried over');
  assert.notEqual(task.totalTokens, 999999);
  assert.notEqual(task.totalCostUsd, 42, 'the tampered cost was not carried over');
  assert.notEqual(task.lastStatus, 'success', 'the tampered last status was not carried over');
  assert.ok(!task.attempts, 'the tampered retry counter was not carried over');
  assert.equal(task.running, undefined, 'unknown keys are dropped');
  assert.equal(task.unexpectedField, undefined);
  assert.equal(scheduler.jobs.has('cron_tampered'), false, 'an imported task is never armed');
  assert.equal(store.getHistory('cron_tampered').length, 0);
});

test('#42: reserved ids are refused on import and on create', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  const importRes = mockRes();
  await handler(
    mockPost('/dsh-cron/tasks/import', { document: exportDoc([{ id: 'export', title: 't', schedule: '0 4 * * *', prompt: 'x', type: 'script' }]), strategy: 'add' }, SCRIPT_CONFIRM),
    importRes,
  );
  assert.equal(importRes.statusCode, 400);
  assert.match(importRes.payload.error, /reserved id/);

  const createRes = mockRes();
  await handler(
    mockPost('/dsh-cron/tasks', { id: 'import', title: 't', schedule: '0 4 * * *', prompt: 'x', type: 'script' }, SCRIPT_CONFIRM),
    createRes,
  );
  assert.equal(createRes.statusCode, 400, 'a task cannot shadow the collection routes');
  assert.match(createRes.payload.error, /reserved/);
  assert.equal(store.list({ status: 'all' }).length, 0);
});

test('#42: a failed write rolls the import back', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });
  const doc = exportDoc([
    { id: 'cron_one', title: 'one', schedule: '0 4 * * *', prompt: 'x', type: 'script' },
    { id: 'cron_two', title: 'two', schedule: '0 5 * * *', prompt: 'y', type: 'script' },
  ]);

  const originalSet = store.set.bind(store);
  let calls = 0;
  store.set = (task) => {
    calls += 1;
    if (calls === 2) throw new Error('disk full');
    return originalSet(task);
  };

  const res = mockRes();
  await handler(mockPost('/dsh-cron/tasks/import', { document: doc, strategy: 'add' }, SCRIPT_CONFIRM), res);
  store.set = originalSet;

  assert.equal(res.statusCode, 500);
  assert.match(res.payload.error, /rolled back/);
  assert.equal(store.list({ status: 'all' }).length, 0, 'the first write was undone');
});
