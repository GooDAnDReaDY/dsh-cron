import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { applySilentRule, buildSilentRulePrompt, readVerdict, supportsSilentRule } from '../lib/silent-rule.js';
import { parseJsonAnswer, resolveAskTarget } from '../lib/llm-ask.js';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-silent-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  const scheduler = new TaskScheduler(store, async () => ({ output: 'disk is at 12%' }));
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

const scriptTask = {
  id: 'cron_s',
  title: 'Disk check',
  type: 'script',
  schedule: '0 * * * *',
  prompt: 'df -h',
  silentRule: 'Stay silent when no filesystem is above 80%',
};

test('#44: the rule only applies to output-producing runtimes', () => {
  assert.equal(supportsSilentRule({ type: 'script' }), true);
  assert.equal(supportsSilentRule({ type: 'http' }), true);
  assert.equal(supportsSilentRule({ type: 'llm' }), false);
  assert.equal(supportsSilentRule({}), true, 'a script without a type is judged as a script');
});

test('#44: the prompt carries the rule and the output', () => {
  const prompt = buildSilentRulePrompt(scriptTask, { status: 'success', output: 'Filesystem 12% used' });
  assert.match(prompt, /no filesystem is above 80%/);
  assert.match(prompt, /Filesystem 12% used/);
  assert.match(prompt, /Exit status: success/);
});

test('#44: a "stay silent" verdict skips delivery', async () => {
  const result = await applySilentRule({
    task: scriptTask,
    runInfo: { status: 'success', output: 'Filesystem 12% used' },
    ask: async () => ({ ok: true, text: '{"notify": false, "reason": "disk is comfortable"}' }),
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'disk is comfortable');
});

test('#44: a "notify" verdict delivers', async () => {
  const result = await applySilentRule({
    task: scriptTask,
    runInfo: { status: 'success', output: 'Filesystem 96% used' },
    ask: async () => ({ ok: true, text: '{"notify": true, "reason": "disk almost full"}' }),
  });
  assert.equal(result.skipped, false);
});

test('#44: broken answers fail open', async () => {
  const cases = [
    async () => ({ ok: false, error: 'model down' }),
    async () => ({ ok: true, text: 'I think it is fine' }),
    async () => ({ ok: true, text: '{"notify": "maybe"}' }),
    async () => { throw new Error('boom'); },
  ];
  for (const ask of cases) {
    const result = await applySilentRule({ task: scriptTask, runInfo: { status: 'success', output: 'x' }, ask });
    assert.equal(result.skipped, false, 'anything unusable must deliver the report');
    assert.ok(result.verdictError, 'and the reason is reported');
  }
});

test('#44: a rule never judges failed runs and no rule means no call', async () => {
  let called = 0;
  const ask = async () => { called += 1; return { ok: true, text: '{"notify": false}' }; };

  const failed = await applySilentRule({ task: scriptTask, runInfo: { status: 'error', output: 'boom' }, ask });
  assert.equal(failed.skipped, false, 'failures always reach the channels');
  assert.equal(called, 0);

  const noRule = await applySilentRule({ task: { ...scriptTask, silentRule: '' }, runInfo: { status: 'success', output: 'x' }, ask });
  assert.equal(noRule.skipped, false);
  assert.equal(called, 0, 'no rule means no model call at all');
});

test('#44: a silent run is recorded once, with its reason, and nothing is delivered', async (t) => {
  const { store, scheduler } = makeEnv(t);
  let delivered = 0;
  scheduler.askModel = async () => ({ ok: true, text: '{"notify": false, "reason": "nothing to report"}' });
  scheduler.deliver = async () => { delivered += 1; return { delivered: [{ channel: 'telegram' }], skipped: [], failures: [] }; };

  const task = store.set({ ...scriptTask, id: 'cron_quiet', schedule: '0 * * * *', status: 'paused' });
  await scheduler.runTask(task.id);

  const history = store.getHistory('cron_quiet');
  assert.equal(history.length, 1, 'the run is recorded exactly once');
  assert.equal(history[0].silentSkip, true);
  assert.equal(history[0].silentReason, 'nothing to report');
  assert.equal(delivered, 0, 'no channel was asked to deliver');
  assert.equal(store.get('cron_quiet').totalTokens, 0, 'cost accounting is not duplicated');
});

test('#44: a loud verdict still delivers', async (t) => {
  const { store, scheduler } = makeEnv(t);
  let delivered = 0;
  scheduler.askModel = async () => ({ ok: true, text: '{"notify": true, "reason": "disk full"}' });
  scheduler.deliver = async () => { delivered += 1; return { delivered: [{ channel: 'telegram' }], skipped: [], failures: [] }; };

  const task = store.set({ ...scriptTask, id: 'cron_loud', schedule: '0 * * * *', status: 'paused' });
  await scheduler.runTask(task.id);

  assert.equal(delivered, 1);
  assert.equal(store.getHistory('cron_loud')[0].silentSkip, false);
});

test('#44: without a model available the report is delivered', async (t) => {
  const { store, scheduler } = makeEnv(t);
  let delivered = 0;
  scheduler.deliver = async () => { delivered += 1; return { delivered: [{ channel: 'telegram' }], skipped: [], failures: [] }; };

  const task = store.set({ ...scriptTask, id: 'cron_nomodel', schedule: '0 * * * *', status: 'paused' });
  await scheduler.runTask(task.id);

  assert.equal(delivered, 1, 'a missing model must never silence a report');
});

test('#44: answer parsing survives prose and fences', () => {
  assert.deepEqual(parseJsonAnswer('nonsense'), null);
  assert.deepEqual(readVerdict('```json\n{"notify": false, "reason": "ok"}\n```'), { ok: true, notify: false, reason: 'ok' });
  assert.equal(readVerdict('Here you go: {"notify": true}').notify, true);
  assert.equal(readVerdict('{"reason":"no verdict"}').ok, false);
});

test('#44: the ask target prefers the task provider/model', () => {
  const ctx = { get: () => ({ currentSelection: () => ({ provider: 'default-p', model: 'default-m' }) }) };
  assert.deepEqual(resolveAskTarget(ctx, { provider: 'task-p', model: 'task-m' }), { provider: 'task-p', model: 'task-m' });
  assert.deepEqual(resolveAskTarget(ctx, {}), { provider: 'default-p', model: 'default-m' });
  assert.deepEqual(resolveAskTarget(ctx, {}, 'rule-model'), { provider: 'default-p', model: 'rule-model' });
});
