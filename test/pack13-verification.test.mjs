import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';

test('#301: recordRun during streamed save does not produce duplicates or mixed history', async (t) => {
  const filePath = path.join(os.tmpdir(), `dsh-cron-pack13-parity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => {
    try { fs.rmSync(filePath, { force: true }); } catch {}
  });

  const task = store.set({
    title: 'Snapshot Test Task',
    schedule: '0 0 * * *',
    prompt: 'test prompt',
    status: 'active',
  });

  // Populate 100 history entries old-0 .. old-99
  const initialRuns = [];
  for (let i = 0; i < 100; i++) {
    initialRuns.push({
      id: `run_old_${i}`,
      at: Date.now() - (100 - i) * 1000,
      status: 'success',
      durationMs: 100,
      output: `output-${i}`.repeat(50), // sizable payload to force multiple streaming chunks
      costUsd: 0.001,
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
    });
  }
  store.history.set(task.id, initialRuns);

  // Start async save
  const savePromise = store.saveAsync();

  // Interleave recordRun while saveAsync is chunking through setImmediate yields
  await new Promise((r) => setImmediate(r));
  store.recordRun(task.id, {
    status: 'success',
    durationMs: 50,
    output: 'NEW_CONCURRENT_RUN',
    costUsd: 0.005,
    usage: { inputTokens: 50, outputTokens: 50, cacheReadTokens: 0 },
  });

  await savePromise;

  // Verify disk contents
  assert.ok(fs.existsSync(filePath), 'store file was written');
  const diskData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const diskRuns = diskData.history[task.id];

  assert.equal(diskRuns.length, 100, 'saved history has exactly 100 runs');
  const diskIds = diskRuns.map((r) => r.id);
  const uniqueIds = new Set(diskIds);
  assert.equal(uniqueIds.size, 100, 'all 100 runs in first snapshot are strictly unique (no duplicates)');
  assert.equal(diskIds.includes('run_old_0'), true, 'oldest run in snapshot is preserved');
  assert.equal(diskIds.includes('run_old_99'), true, 'newest old run is preserved');

  // Verify memory has the new run and total 100 after 100-run limit rotation
  const memRuns = store.getHistory(task.id, 105);
  assert.equal(memRuns.length, 100, 'memory history rotated to 100 runs');
  assert.equal(memRuns[0].output, 'NEW_CONCURRENT_RUN', 'memory has newest run at head');

  // Second save writes the new run cleanly to disk
  await store.saveAsync();
  const diskData2 = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const diskRuns2 = diskData2.history[task.id];
  assert.equal(diskRuns2.length, 100, 'second save has 100 runs');
  assert.equal(diskRuns2[0].output, 'NEW_CONCURRENT_RUN', 'second save includes new run at head');
  const uniqueIds2 = new Set(diskRuns2.map((r) => r.id));
  assert.equal(uniqueIds2.size, 100, 'second save has 100 unique runs');
});

test('#301: task metadata mutations (costLedger, totalTokens) do not corrupt snapshot', async (t) => {
  const filePath = path.join(os.tmpdir(), `dsh-cron-pack13-meta-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => {
    try { fs.rmSync(filePath, { force: true }); } catch {}
  });

  const task = store.set({
    title: 'Meta Test Task',
    schedule: '0 0 * * *',
    prompt: 'test prompt',
    status: 'active',
  });

  // Pre-fill cost ledger
  task.costLedger = [
    { at: Date.now() - 10000, costUsd: 0.01, tokens: 100 },
    { at: Date.now() - 5000, costUsd: 0.02, tokens: 200 },
  ];

  const savePromise = store.saveAsync();

  // Mutate costLedger and token counters in-memory during save
  await new Promise((r) => setImmediate(r));
  task.costLedger.push({ at: Date.now(), costUsd: 0.05, tokens: 500 });
  task.totalTokens = 99999;

  await savePromise;

  const diskData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const diskTask = diskData.tasks.find((t) => t.id === task.id);
  assert.ok(diskTask, 'task found on disk');
  // Snapshot should have had 2 cost ledger entries at time of saveAsync call
  assert.equal(diskTask.costLedger.length, 2, 'snapshot captured isolated costLedger array');
});

test('#303: native stream open error on directory cleanly rejects without process crash', async (t) => {
  // Test native open error in an isolated child process to verify exit code and absence of Unhandled 'error'
  const script = `
    import { TaskStore } from './lib/store.js';
    import fs from 'node:fs';
    import os from 'node:os';
    import path from 'node:path';

    async function main() {
      const dirPath = path.join(os.tmpdir(), 'dsh-cron-eisdir-test-' + Date.now());
      fs.mkdirSync(dirPath, { recursive: true });
      const store = new TaskStore('/dev/null');

      try {
        await store._writeStoreStream(dirPath, { version: 1 }, 1);
        process.exit(2); // Unexpected success
      } catch (err) {
        if (err.code === 'EISDIR') {
          fs.rmdirSync(dirPath);
          process.exit(0); // Clean rejection handled
        }
        process.exit(3); // Unexpected error code
      }
    }
    main();
  `;

  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve('.'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(exitCode, 0, `child exited cleanly with 0, stderr: ${stderr}`);
  assert.equal(stderr.includes('Unhandled'), false, 'no unhandled error event in stderr');
});

test('#303: mid-stream stream error causes clean rejection and no false resolve', async (t) => {
  const filePath = path.join(os.tmpdir(), `dsh-cron-pack13-stream-err-${Date.now()}.json`);
  const store = new TaskStore(filePath);
  t.after(() => {
    try { fs.rmSync(filePath, { force: true }); } catch {}
  });

  // Pass an object whose serialization throws mid-stream
  const cyclic = {};
  cyclic.self = cyclic;

  const badData = {
    version: 1,
    tasks: [{ id: 'bad', title: 'bad', cyclic }],
    history: {},
    settings: {},
  };

  let rejected = false;
  try {
    await store._writeStoreStream(filePath, badData, 1);
  } catch (err) {
    rejected = true;
    assert.match(err.message, /circular/i);
  }
  assert.equal(rejected, true, 'pipeline rejected cleanly on serialization error');
});

test('#302: scheduler timers are guaranteed to stop via makeEnv t.after teardown', (t) => {
  const filePath = path.join(os.tmpdir(), `dsh-cron-teardown-${Date.now()}.json`);
  const store = new TaskStore(filePath);
  let stopped = false;

  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => {
    scheduler.stopAll();
    stopped = true;
    try { fs.rmSync(filePath, { force: true }); } catch {}
  });

  const task = store.set({
    title: 'Scheduled Timer Task',
    schedule: 'every 10m',
    prompt: 'p',
    status: 'active',
  });
  scheduler.scheduleTask(task);
  assert.equal(scheduler.jobs.has(task.id), true, 'job was armed');

  // Verify stopAll flushes jobs cleanly
  scheduler.stopAll();
  assert.equal(scheduler.jobs.size, 0, 'all scheduler jobs stopped');
});
