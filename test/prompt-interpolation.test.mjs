import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildPromptContext,
  interpolateTaskPrompt,
  resolveTaskForExecution,
} from '../lib/prompt-interpolation.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { TaskStore } from '../lib/store.js';

test('1. buildPromptContext generates expected temporal and task variables', () => {
  const fixedDate = new Date('2026-09-20T14:30:15.123Z');
  const task = { id: 'task_alpha', title: 'Daily Report' };
  const ctx = buildPromptContext(task, {
    now: fixedDate,
    prevOutput: 'All systems green',
    prevStatus: 'success',
    prevTaskId: 'task_prev',
    prevDurationMs: 2500,
    prevCostUsd: 0.005,
  });

  assert.equal(ctx.date, '2026-09-20');
  assert.equal(ctx.time, '14:30:15');
  assert.equal(ctx.now, fixedDate.toISOString());
  assert.equal(ctx.timestamp, String(fixedDate.getTime()));
  assert.equal(ctx['task.id'], 'task_alpha');
  assert.equal(ctx['task.title'], 'Daily Report');
  assert.equal(ctx['prev.output'], 'All systems green');
  assert.equal(ctx['prev_output'], 'All systems green');
  assert.equal(ctx['prev.status'], 'success');
  assert.equal(ctx['prev.taskId'], 'task_prev');
  assert.equal(ctx['prev.duration'], '2.5 s');
  assert.equal(ctx['prev.cost'], '$0.0050');
});

test('2. interpolateTaskPrompt replaces variables and preserves unknown tokens', () => {
  const context = {
    'prev.output': 'Build succeeded',
    'date': '2026-09-20',
    'task.id': 'cron_deploy',
  };

  const template = 'Task {{task.id}} on {{date}}: Result is {{prev.output}}. Unknown: {{unknown_var}} and {single_brace}';
  const result = interpolateTaskPrompt(template, context);

  assert.equal(result, 'Task cron_deploy on 2026-09-20: Result is Build succeeded. Unknown: {{unknown_var}} and {single_brace}');
});

test('3. interpolateTaskPrompt handles special characters, dollar signs, and empty inputs', () => {
  assert.equal(interpolateTaskPrompt(''), '');
  assert.equal(interpolateTaskPrompt(null), null);
  assert.equal(interpolateTaskPrompt(undefined), undefined);

  const context = {
    'prev.output': 'Error: file $HOME/test.txt contains special $100 & <div>',
  };
  const template = 'Log: {{prev.output}}';
  const result = interpolateTaskPrompt(template, context);

  assert.equal(result, 'Log: Error: file $HOME/test.txt contains special $100 & <div>');
});

test('4. resolveTaskForExecution interpolates prompt, script, command, and url without mutating original', () => {
  const task = {
    id: 't_backup',
    title: 'Backup Task',
    prompt: 'Backup for {{task.id}} on {{date}}',
    command: 'pg_dump db_{{date}} > backup.sql',
    script: 'echo {{date}}',
    url: 'https://example.com/api/{{task.id}}',
  };

  const fixedDate = new Date('2026-09-20T10:00:00.000Z');
  const resolved = resolveTaskForExecution(task, { now: fixedDate });

  assert.notEqual(resolved, task, 'returns a new object clone');
  assert.equal(resolved.prompt, 'Backup for t_backup on 2026-09-20');
  assert.equal(resolved.command, 'pg_dump db_2026-09-20 > backup.sql');
  assert.equal(resolved.script, 'echo 2026-09-20');
  assert.equal(resolved.url, 'https://example.com/api/t_backup');

  // Verify original task is untouched
  assert.equal(task.prompt, 'Backup for {{task.id}} on {{date}}');
  assert.equal(task.command, 'pg_dump db_{{date}} > backup.sql');
});

test('5. Task chaining interpolates prev.output in end-to-end scheduler execution', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-chain-'));
  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  const storeFile = path.join(tmpDir, 'cron-tasks.json');
  const store = new TaskStore(storeFile);

  const executedPrompts = [];
  const executeFn = async (task) => {
    executedPrompts.push({ id: task.id, prompt: task.prompt });
    if (task.id === 'step1') {
      return { status: 'success', output: 'Found 42 security warnings' };
    }
    return { status: 'success', output: 'Processed step2' };
  };

  const scheduler = new TaskScheduler(store, executeFn);

  // Setup Step 1 that triggers Step 2 on success
  store.set({
    id: 'step1',
    title: 'Security Scan',
    schedule: '0 0 * * *',
    prompt: 'Run scanner',
    type: 'llm',
    status: 'active',
    onSuccess: 'step2',
  });

  // Setup Step 2 that consumes {{prev.output}} and {{prev.taskId}}
  store.set({
    id: 'step2',
    title: 'Analyze Scan',
    schedule: '0 0 * * *',
    prompt: 'Analyze report from {{prev.taskId}}: {{prev.output}}',
    type: 'llm',
    status: 'active',
  });

  // Run Step 1
  await scheduler.runTask('step1');

  // Allow chained task to trigger
  await new Promise((r) => setTimeout(r, 100));

  assert.equal(executedPrompts.length, 2, 'both step1 and step2 should have executed');
  assert.equal(executedPrompts[0].id, 'step1');
  assert.equal(executedPrompts[0].prompt, 'Run scanner');
  assert.equal(executedPrompts[1].id, 'step2');
  assert.equal(executedPrompts[1].prompt, 'Analyze report from step1: Found 42 security warnings');

  // Verify persisted store task still retains the original template
  const step2InStore = store.get('step2');
  assert.equal(step2InStore.prompt, 'Analyze report from {{prev.taskId}}: {{prev.output}}');
});
