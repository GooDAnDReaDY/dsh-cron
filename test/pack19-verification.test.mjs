import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import { JOURNAL_STATES } from '../lib/durable-journal.js';

test('Pack 19: 1. Resilient queue & durable journal with idempotency keys and restart recovery (#317)', async (t) => {
  const tmpDir = path.join(process.cwd(), '.tmp-pack19-journal-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));

  store.set({
    id: 'task-1',
    name: 'Task 1',
    schedule: '0 0 * * *',
    prompt: 'hello',
    status: 'active',
  });

  await t.test('Idempotency key generation and caching', () => {
    const key1 = store.durableJournal.generateIdempotencyKey('task-1');
    assert.ok(key1 && typeof key1 === 'string', 'Generated idempotency key is non-empty string');

    const rec = store.durableJournal.createRunRecord('task-1', { idempotencyKey: key1 });
    assert.equal(rec.status, JOURNAL_STATES.QUEUED, 'Record initially queued');
    assert.equal(store.durableJournal.isIdempotencyKeyExecuted('task-1', key1), null, 'Not completed yet');

    store.durableJournal.transition('task-1', rec.id, JOURNAL_STATES.RUNNING);
    assert.equal(store.durableJournal.isIdempotencyKeyExecuted('task-1', key1), null, 'Not completed while running');

    store.durableJournal.transition('task-1', rec.id, JOURNAL_STATES.COMPLETED, {
      output: 'success result',
      costUsd: 0.002,
    });
    const cached = store.durableJournal.isIdempotencyKeyExecuted('task-1', key1);
    assert.ok(cached, 'Completed run is cached by idempotency key');
    assert.equal(cached.output, 'success result');
  });

  await t.test('Restart recovery marks in-flight running tasks as uncertain', () => {
    store.set({
      id: 'task-crash',
      name: 'Crash Task',
      schedule: '0 0 * * *',
      status: 'active',
    });

    const runRec = store.durableJournal.createRunRecord('task-crash', {});
    store.durableJournal.transition('task-crash', runRec.id, JOURNAL_STATES.RUNNING);

    const fakeScheduler = { store };
    const recovered = store.durableJournal.recoverPendingRuns(fakeScheduler);
    assert.ok(recovered.uncertain.length >= 1, 'In-flight run recovered as uncertain');

    const history = store.getHistory('task-crash');
    const updated = history.find((r) => r.id === runRec.id);
    assert.ok(updated, 'Run exists in history');
    assert.equal(updated.status, JOURNAL_STATES.UNCERTAIN, 'Status marked uncertain');
    assert.equal(updated.stoppedReason, 'interrupted_by_restart', 'Stopped reason set');
  });

  await t.test('Manual resolution of uncertain status', () => {
    const history = store.getHistory('task-crash');
    const uncertainRun = history.find((r) => r.status === JOURNAL_STATES.UNCERTAIN);
    assert.ok(uncertainRun, 'Found uncertain run');

    const res = store.durableJournal.resolveUncertain('task-crash', uncertainRun.id, {
      decision: JOURNAL_STATES.COMPLETED,
      note: 'Manually inspected output in logs',
    });
    assert.equal(res.ok, true, 'resolveUncertain returns ok');

    const updatedHistory = store.getHistory('task-crash');
    const resolvedRun = updatedHistory.find((r) => r.id === uncertainRun.id);
    assert.equal(resolvedRun.status, JOURNAL_STATES.COMPLETED, 'Run marked completed');
  });

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('Pack 19: 2. Chain retry from failed step preserving checkpoints (#319)', async (t) => {
  const tmpDir = path.join(process.cwd(), '.tmp-pack19-checkpoints-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));

  store.set({ id: 'step-1', name: 'Step 1', prompt: 'step 1 prompt', status: 'active' });
  store.set({ id: 'step-2', name: 'Step 2', prompt: 'step 2 prompt', status: 'active' });

  const chainRunId = 'chain-run-xyz-' + Date.now();

  await t.test('Record step snapshots and verify integrity', () => {
    store.chainCheckpointManager.recordStepSnapshot(chainRunId, 'step-1', {
      status: 'success',
      input: { prompt: 'Step 1 prompt' },
      output: 'Step 1 computed data',
      durationMs: 150,
    });

    store.chainCheckpointManager.recordStepSnapshot(chainRunId, 'step-2', {
      status: 'error',
      input: { prompt: 'Step 2 prompt', prevOutput: 'Step 1 computed data' },
      output: 'Network timeout',
      durationMs: 300,
    });

    const snapshots = store.chainCheckpointManager.getChainSnapshots(chainRunId);
    assert.equal(snapshots.length, 2, 'Two snapshots recorded');
    assert.equal(snapshots[0].stepTaskId, 'step-1');
    assert.equal(snapshots[1].stepTaskId, 'step-2');
  });

  await t.test('canRetryFromStep permits retrying failed step and guards against double-retry', () => {
    const check2 = store.chainCheckpointManager.canRetryFromStep(chainRunId, 'step-2');
    assert.equal(check2.ok, true, 'Step 2 failed and can be retried');

    const check1 = store.chainCheckpointManager.canRetryFromStep(chainRunId, 'step-1');
    assert.equal(check1.ok, false, 'Step 1 succeeded, cannot retry from step 1');
  });

  await t.test('retryChainFromStep reconstructs upstream context without rerun', async () => {
    let executedTaskId = null;
    let executedOptions = null;

    const fakeScheduler = {
      runNow: async (taskId, options) => {
        executedTaskId = taskId;
        executedOptions = options;
        return { ok: true, runId: 'retry-run-123' };
      },
    };

    const result = await store.chainCheckpointManager.retryChainFromStep(fakeScheduler, chainRunId, 'step-2');
    assert.equal(result.ok, true, 'Retry initiated successfully');
    assert.equal(executedTaskId, 'step-2', 'Directly ran step-2 without re-running step-1');
    assert.equal(executedOptions.chainPrevOutput, 'Step 1 computed data', 'Upstream output reused');
    assert.equal(executedOptions.chainRunId, chainRunId, 'Reused same chainRunId');
  });

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('Pack 19: 3. Run artifacts management, directory isolation and safe preview (#321)', async (t) => {
  const tmpDir = path.join(process.cwd(), '.tmp-pack19-artifacts-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));

  let savedArt = null;

  await t.test('Save and read artifacts safely', () => {
    savedArt = store.artifactManager.saveArtifact('run-art-1', 'task-art', 'report.json', JSON.stringify({ summary: 'ok' }));
    assert.ok(savedArt.id, 'Artifact has id');
    assert.equal(savedArt.name, 'report.json');
    assert.match(savedArt.mimeType, /application\/json/);

    store.recordArtifact(savedArt);
    const retrieved = store.getArtifactsForRun('run-art-1');
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].name, 'report.json');

    const read = store.artifactManager.readArtifact(savedArt.id, 'report.json');
    assert.ok(read, 'Artifact read successfully');
    assert.equal(read.toString(), JSON.stringify({ summary: 'ok' }));
  });

  await t.test('Strict rejection of path traversal attempts', () => {
    assert.throws(() => {
      store.artifactManager.getFilePath('art-test', '../../etc/passwd');
    }, /traversal|invalid/i, 'Directory traversal attempt is blocked');
  });

  await t.test('Safe preview generation', () => {
    const preview = store.artifactManager.generatePreview(savedArt.id, 'report.json');
    assert.equal(preview.ok, true);
    assert.match(preview.mimeType, /application\/json/);
    assert.ok(preview.content.includes('summary'));
  });

  await t.test('Quota and retention cleanup', () => {
    for (let i = 0; i < 5; i++) {
      const art = store.artifactManager.saveArtifact(`run-quota-${i}`, 'task-art', `data-${i}.txt`, Buffer.alloc(1024, 'a'));
      store.recordArtifact(art);
    }
    const cleaned = store.artifactManager.cleanupArtifacts(store, { maxTotalBytes: 2048 });
    assert.ok(typeof cleaned.removedCount === 'number', 'Cleaned up excess artifacts');
  });

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('Pack 19: 4. Documentation and package version synchronization to 0.3.0 (#317, #319, #321)', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.match(pkg.version, /^0\.3\.[0-9]+$/, 'package.json version is 0.3.x');

  const indexMd = fs.readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
  assert.match(indexMd, /0\.3\.0/, 'index.md references version 0.3.0');
  assert.match(indexMd, /0\.2\.52/, 'index.md references previous release 0.2.52');

  const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /0\.3\.[0-9]+/, 'AGENTS.md current version is 0.3.x');

  const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## 0\.3\.0 \(2026-10-11\)/, 'CHANGELOG.md contains 0.3.0 section');

  const designMd = fs.readFileSync(path.join(repoRoot, 'docs', 'design', 'DESIGN.md'), 'utf8');
  assert.match(designMd, /0\.3\.0/, 'DESIGN.md contains 0.3.0 contract');
});
