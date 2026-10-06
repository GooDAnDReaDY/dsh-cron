import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { executeCronTool } from '../lib/cron-tool.js';
import { redactTaskSecrets } from '../lib/http-utils.js';
import * as runtimes from '../lib/runtimes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assertLosslessJson(val, loc = 'root') {
  if (val === null || typeof val !== 'object') return;
  for (const key of Reflect.ownKeys(val)) {
    assert.notEqual(val[key], undefined, `Key "${String(key)}" at ${loc} has value undefined (not lossless JSON)`);
    if (typeof val[key] === 'object' && val[key] !== null) {
      assertLosslessJson(val[key], `${loc}.${String(key)}`);
    }
  }
}

test('Pack 15 (#308): DOCKER_HOST_ENV_ALLOWLIST is removed from lib/runtimes.js exports', () => {
  assert.equal('DOCKER_HOST_ENV_ALLOWLIST' in runtimes, false);
});

test('Pack 15 (#310 / GH #5): store.set() never leaves undefined properties and ensures provider/model null fallback', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-p15-store-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));

  const task = store.set({
    title: 'Task without provider or model',
    prompt: 'test prompt',
    schedule: '0 9 * * *',
    notifyTelegram: 'inherit',
    onlyOnFailure: null,
  });

  assertLosslessJson(task);
  assert.equal(task.provider, null);
  assert.equal(task.model, null);
  assert.equal('notifyTelegram' in task, false);
  assert.equal('onlyOnFailure' in task, false);

  // Update run state as scheduler does after executing a task
  const updated = store.set({
    id: task.id,
    lastRunAt: Date.now(),
    nextRunAt: Date.now() + 60000,
    lastStatus: 'success',
  });

  assertLosslessJson(updated);
  assert.equal(updated.provider, null);
  assert.equal(updated.model, null);
});

test('Pack 15 (#310 / GH #5): cron tool get/update/create/list return lossless JSON without undefined properties after scheduler run', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-p15-tool-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  const scheduler = new TaskScheduler(store, { executeTask: async () => ({ status: 'success' }) });
  t.after(() => scheduler.stopAll());

  // 1. Create via tool without provider/model
  const createRes = await executeCronTool(store, scheduler, {
    action: 'create',
    title: 'News Summary',
    prompt: 'Summarize news',
    schedule: 'every 1h',
  });

  assert.equal(createRes.success, true);
  assertLosslessJson(createRes.task);

  const taskId = createRes.task.id;

  // 2. Simulate scheduler updating task execution state (which caused GH #5)
  const stored = store.get(taskId);
  store.set({
    ...stored,
    lastRunAt: Date.now(),
    lastStatus: 'success',
    nextRunAt: Date.now() + 3600000,
  });

  // 3. Get action - must return clean lossless JSON
  const getRes = await executeCronTool(store, scheduler, {
    action: 'get',
    id: taskId,
  });

  assert.equal(getRes.success, true);
  assertLosslessJson(getRes.task);
  assert.equal(getRes.task.provider, null);
  assert.equal(getRes.task.model, null);

  // 4. Update action - must return clean lossless JSON
  const updateRes = await executeCronTool(store, scheduler, {
    action: 'update',
    id: taskId,
    title: 'Updated Title',
  });

  assert.equal(updateRes.success, true);
  assertLosslessJson(updateRes.task);

  // 5. List action
  const listRes = await executeCronTool(store, scheduler, {
    action: 'list',
  });

  assert.equal(listRes.success, true);
  for (const t of listRes.tasks) {
    assertLosslessJson(t);
  }
});

test('Pack 15 (#310 / GH #5): redactTaskSecrets sanitizes undefined properties', () => {
  const rawTask = {
    id: 'test_123',
    title: 'Test',
    provider: undefined,
    model: undefined,
    env: { SECRET: 'abc' },
  };
  const redacted = redactTaskSecrets(rawTask);
  assertLosslessJson(redacted);
  assert.equal('provider' in redacted, false);
  assert.equal('model' in redacted, false);
  assert.equal(redacted.env.SECRET, '[REDACTED]');
});

test('Pack 15 (#307): client-src has zero fetch calls without signal/timeout protection', () => {
  const clientSrcDir = path.resolve(__dirname, '../lib/client-src');
  const files = fs.readdirSync(clientSrcDir).filter(f => f.endsWith('.js'));
  let unshieldedFetches = 0;

  for (const f of files) {
    const content = fs.readFileSync(path.join(clientSrcDir, f), 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bfetch\s*\(/.test(line)) {
        // Line has fetch(. Look ahead 5 lines for signal or fetchOpts
        const chunk = lines.slice(i, i + 6).join(' ');
        const isShielded = chunk.includes('signal') || chunk.includes('fetchOpts') || chunk.includes('fetchJsonWithTimeout') || chunk.includes('fetchWithTimeout');
        if (!isShielded) {
          unshieldedFetches++;
        }
      }
    }
  }

  assert.equal(unshieldedFetches, 0, 'Criterion #307 violated: found raw fetch without signal or timeout helper');
});
