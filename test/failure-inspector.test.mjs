import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { inspectFailure, readDiagnosis, buildInspectPrompt, supportsInspection } from '../lib/failure-inspector.js';
import { resolveTemplateText } from '../lib/templates.js';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-inspect-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  const scheduler = new TaskScheduler(store, async () => { throw new Error('boom'); });
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

const llmTask = {
  id: 'cron_i',
  title: 'Nightly digest',
  type: 'llm',
  schedule: '0 3 * * *',
  prompt: 'Summarise the open tickets',
  inspectOnFailure: true,
};

test('#43: only agent tasks with the flag are inspected', () => {
  assert.equal(supportsInspection({ type: 'llm' }), true);
  assert.equal(supportsInspection({ type: 'skill' }), true);
  assert.equal(supportsInspection({ type: 'script' }), false, 'a shell command has no prompt to revise');
});

test('#43: the prompt carries the task, the error and the output', () => {
  const prompt = buildInspectPrompt(llmTask, { status: 'error', error: 'ECONNREFUSED', output: 'retrying...' });
  assert.match(prompt, /Nightly digest/);
  assert.match(prompt, /Summarise the open tickets/);
  assert.match(prompt, /ECONNREFUSED/);
  assert.match(prompt, /retrying/);
});

test('#43: a diagnosis is read out of prose or fences, and junk is rejected', () => {
  const good = readDiagnosis('Here it is:\n```json\n{"diagnosis":"the API key expired","suggestion":"refresh the key","confidence":"high"}\n```');
  assert.equal(good.ok, true);
  assert.equal(good.diagnosis, 'the API key expired');
  assert.equal(good.suggestion, 'refresh the key');
  assert.equal(good.confidence, 'high');
  assert.equal(readDiagnosis('I cannot tell').ok, false);
  assert.equal(readDiagnosis('{"confidence":"high"}').ok, false, 'a missing diagnosis is not a diagnosis');
  assert.equal(readDiagnosis('{"diagnosis":"x","confidence":"nonsense"}').confidence, 'low', 'an odd confidence is clamped');
});

test('#43: nothing is inspected without the flag, on success, or without a model', async () => {
  let calls = 0;
  const ask = async () => { calls += 1; return { ok: true, text: '{"diagnosis":"x"}' }; };

  const noFlag = await inspectFailure({ task: { ...llmTask, inspectOnFailure: false }, runInfo: { status: 'error' }, ask });
  assert.equal(noFlag.inspected, false);
  const onSuccess = await inspectFailure({ task: llmTask, runInfo: { status: 'success' }, ask });
  assert.equal(onSuccess.inspected, false);
  const scriptTask = await inspectFailure({ task: { ...llmTask, type: 'script' }, runInfo: { status: 'error' }, ask });
  assert.equal(scriptTask.inspected, false);
  assert.equal(calls, 0, 'no model call is made when there is nothing to inspect');

  const noAsk = await inspectFailure({ task: llmTask, runInfo: { status: 'error' } });
  assert.equal(noAsk.inspected, false);
  assert.ok(noAsk.error);
});

test('#43: the inspection never breaks the run', async () => {
  const cases = [
    async () => ({ ok: false, error: 'model down' }),
    async () => ({ ok: true, text: 'no json here' }),
    async () => { throw new Error('kaboom'); },
  ];
  for (const ask of cases) {
    const result = await inspectFailure({ task: llmTask, runInfo: { status: 'error', error: 'x' }, ask });
    assert.equal(result.inspected, false);
    assert.ok(result.error, 'the failure is reported, not thrown');
  }
});

test('#43: a failed run stores its diagnosis, a successful one does not', async (t) => {
  const { store, scheduler } = makeEnv(t);
  scheduler.askModel = async () => ({ ok: true, text: '{"diagnosis":"the provider key expired","suggestion":"rotate the key","confidence":"high"}' });

  const failing = store.set({ ...llmTask, id: 'cron_fail', schedule: '0 3 * * *', status: 'paused' });
  await scheduler.runTask(failing.id);
  const failedRun = store.getHistory('cron_fail')[0];
  assert.equal(failedRun.status, 'error');
  assert.equal(failedRun.diagnosis, 'the provider key expired');
  assert.equal(failedRun.suggestion, 'rotate the key');
  assert.equal(failedRun.confidence, 'high');

  scheduler.executeFn = async () => 'all good';
  const healthy = store.set({ ...llmTask, id: 'cron_ok', schedule: '0 3 * * *', status: 'paused' });
  await scheduler.runTask(healthy.id);
  assert.equal(store.getHistory('cron_ok')[0].diagnosis, '', 'a successful run needs no diagnosis');
});

test('#43: a broken model call leaves the failed run recorded as before', async (t) => {
  const { store, scheduler } = makeEnv(t);
  scheduler.askModel = async () => { throw new Error('model unreachable'); };

  const task = store.set({ ...llmTask, id: 'cron_broken', schedule: '0 3 * * *', status: 'paused' });
  await scheduler.runTask(task.id);
  const run = store.getHistory('cron_broken')[0];
  assert.equal(run.status, 'error');
  assert.equal(run.diagnosis, '');
  assert.match(run.error, /boom/, 'the task error is still the recorded one');
});

test('#43: the {diagnosis} template variable renders the stored diagnosis', () => {
  const text = resolveTemplateText({ template: 'why: {diagnosis}', task: { title: 'T' }, runInfo: { status: 'error', diagnosis: 'key expired' } });
  assert.equal(text, 'why: key expired');
  assert.equal(resolveTemplateText({ template: '[{diagnosis}]', task: { title: 'T' }, runInfo: { status: 'success' } }), '[]');
});
