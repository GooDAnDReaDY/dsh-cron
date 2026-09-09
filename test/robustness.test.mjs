import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SessionRunner } from '../lib/runner.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';

test('Robustness #1: Shell task handles large stdout output beyond default 1MB buffer', async () => {
  const runner = new SessionRunner({});
  // Generate 2MB of text output via node child process
  const scriptPrompt = `node -e "process.stdout.write('A'.repeat(2 * 1024 * 1024))"`;
  const task = {
    id: 'test-large-buf',
    title: 'Large Buffer Task',
    type: 'script',
    prompt: scriptPrompt,
    timeoutSeconds: 10,
  };

  const res = await runner.execute(task);
  assert.equal(res.usage.inputTokens, 0);
  assert.ok(res.output.length >= 2 * 1024 * 1024, 'Output size matches 2MB');
});

test('Robustness #2: Store save uses unique PID tmp file eliminating collision', () => {
  const tmpPath = path.join('/tmp', `dsh-cron-test-pid-${Date.now()}.json`);
  const store = new TaskStore(tmpPath);

  store.set({ title: 'Task 1', schedule: '0 9 * * *' });
  store.set({ title: 'Task 2', schedule: '0 10 * * *' });

  assert.equal(store.list().length, 2);
  const reloaded = new TaskStore(tmpPath);
  assert.equal(reloaded.list().length, 2);

  try { fs.unlinkSync(tmpPath); } catch {}
});

test('Robustness #3: Agent session disposes handle and includes ephemeral metadata', async () => {
  let disposed = false;
  let receivedMeta = null;

  const mockCtx = {
    agents: {
      create: async ({ sessionId, meta, agentOptions }) => {
        receivedMeta = meta;
        return {
          agent: {
            whenIdle: async () => {},
            followup: () => {},
            session: { id: sessionId, usage: { inputTokens: 10, outputTokens: 20 } },
          },
          dispose: async () => {
            disposed = true;
          },
        };
      },
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'test-agent-cleanup',
    title: 'Agent Cleanup Task',
    type: 'llm',
    prompt: 'hello test',
    timeoutSeconds: 5,
  };

  const res = await runner.execute(task);
  assert.ok(res.output.includes('Agent finished turn'));
  assert.equal(disposed, true, 'handle.dispose was called');
  assert.equal(receivedMeta.ephemeral, true, 'ephemeral flag present');
  assert.equal(receivedMeta.internal, true, 'internal flag present');
});

test('Robustness #4: Scheduler marks missed runs if nextRunAt was during daemon downtime', () => {
  const tmpPath = path.join('/tmp', `dsh-cron-test-missed-${Date.now()}.json`);
  const store = new TaskStore(tmpPath);

  const pastTimestamp = Date.now() - 30 * 60 * 1000; // 30 minutes ago
  const task = store.set({
    title: 'Missed Offline Task',
    schedule: '0 0 * * *',
    status: 'active',
  });

  task.nextRunAt = pastTimestamp;
  store.set(task);

  const scheduler = new TaskScheduler(store, async () => {});
  scheduler.start();

  const history = store.getHistory(task.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'missed');
  assert.ok(history[0].output.includes('Skipped: the service was offline'));

  scheduler.stopAll();
  try { fs.unlinkSync(tmpPath); } catch {}
});

test('Robustness #5: client.js includes periodic background polling interval', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  assert.ok(code.includes('setInterval('), 'polling interval present');
  assert.ok(code.includes('clearInterval('), 'cleanup timer on unmount present');
  assert.ok(code.includes('lastStatus: \'running\''), 'instant running status in handleRunNow');
});
