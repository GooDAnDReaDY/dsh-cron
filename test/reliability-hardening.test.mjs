import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { SessionRunner, isContextOverflowError, terminateProcessTree } from '../lib/runner.js';

test('isContextOverflowError identifies context window errors accurately', () => {
  assert.equal(isContextOverflowError(new Error('This model maximum context length is 32768 tokens')), true);
  assert.equal(isContextOverflowError(new Error('Context window exceeded, please reduce prompt length')), true);
  assert.equal(isContextOverflowError(new Error('Too many tokens in conversation')), true);
  assert.equal(isContextOverflowError(new Error('Prompt too long for current model')), true);
  assert.equal(isContextOverflowError('context_length_exceeded: input has 135000 tokens'), true);
  assert.equal(isContextOverflowError(new Error('Connection timed out')), false);
  assert.equal(isContextOverflowError(new Error('Rate limit 429')), false);
  assert.equal(isContextOverflowError(null), false);
});

test('terminateProcessTree issues taskkill on Windows and SIGTERM on POSIX', () => {
  let executedCmd = null;
  let killedSig = null;
  const mockChild = {
    pid: 12345,
    killed: false,
    kill: (sig) => { killedSig = sig; }
  };

  // Test Windows branch
  terminateProcessTree(mockChild, 'SIGTERM', {
    isPosix: false,
    execFn: (cmd) => { executedCmd = cmd; }
  });
  assert.equal(executedCmd, 'taskkill /pid 12345 /T /F');
  assert.equal(killedSig, 'SIGTERM');

  // Test POSIX branch (does not call taskkill)
  let posixCmd = null;
  terminateProcessTree(mockChild, 'SIGTERM', {
    isPosix: true,
    execFn: (cmd) => { posixCmd = cmd; }
  });
  assert.equal(posixCmd, null);
});

test('TaskStore bounds history archive to 1000 items per task (#145)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-store-archive-'));
  const storePath = path.join(tmpDir, 'tasks.json');
  try {
    const store = new TaskStore(storePath);
    const taskId = 'task-archive-test';
    
    // Simulate archiving 1200 runs
    const chunk1 = Array.from({ length: 600 }, (_, i) => ({ id: `run-${i}`, at: Date.now() }));
    const chunk2 = Array.from({ length: 600 }, (_, i) => ({ id: `run-${i + 600}`, at: Date.now() }));
    
    store._archiveHistoryRuns(taskId, chunk1);
    store._archiveHistoryRuns(taskId, chunk2);

    const archiveFile = path.join(tmpDir, 'tasks-history-archive.json');
    assert.ok(fs.existsSync(archiveFile));
    const archiveData = JSON.parse(fs.readFileSync(archiveFile, 'utf-8'));
    assert.ok(Array.isArray(archiveData[taskId]));
    assert.equal(archiveData[taskId].length, 1000);
    // Oldest 200 should be trimmed off, so index 0 is run-200
    assert.equal(archiveData[taskId][0].id, 'run-200');
    assert.equal(archiveData[taskId][999].id, 'run-1199');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TaskStore disaster recovery restores from .bak upon JSON corruption (#145)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-store-disaster-'));
  const storePath = path.join(tmpDir, 'tasks.json');
  const bakPath = path.join(tmpDir, 'tasks.json.bak');
  try {
    const store1 = new TaskStore(storePath);
    store1.set({ id: 'task-1', title: 'Healthy Task', schedule: '0 * * * *', type: 'bash', status: 'active' });
    store1.save();

    assert.ok(fs.existsSync(bakPath), '.bak must be created on save');

    // Corrupt the main tasks.json with invalid JSON
    fs.writeFileSync(storePath, '{"tasks": [broken json...', 'utf-8');

    // Initialize new store from corrupted path
    const store2 = new TaskStore(storePath);
    assert.ok(store2.get('task-1'), 'Store must recover task-1 from .bak');
    assert.equal(store2.get('task-1').title, 'Healthy Task');

    // Verify snapshot of corrupted file exists
    const files = fs.readdirSync(tmpDir);
    const corruptedSnapshots = files.filter(f => f.startsWith('tasks.json.corrupted.'));
    assert.ok(corruptedSnapshots.length > 0, 'Corrupted file snapshot must be created');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Scheduler resets retry attempts after budget exhaustion and on regular runs (#145)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sched-retry-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  try {
    const task = {
      id: 'task-retry-test',
      title: 'Retry Test',
      schedule: '0 * * * *',
      type: 'bash',
      status: 'active',
      maxRetries: 2,
      retryBackoffMs: 10,
      attempts: 2 // Already reached budget limit
    };
    store.set(task);

    let observedAttemptsDuringRun = null;
    const scheduler = new TaskScheduler(store, async () => {
      observedAttemptsDuringRun = store.get(task.id).attempts;
      return { status: 'success', output: 'ok' };
    });

    // 1. When status is error and attempts >= maxRetries: finishRun should reset task.attempts to 0
    scheduler.finishRun(task, task.id, 'error', 0);
    const updated = store.get(task.id);
    assert.equal(updated.attempts, 0, 'Retry budget must be reset to 0 once exhausted');

    // 2. When starting a new scheduled run with !options.isRetry, attempts must be reset to 0 upon entry
    updated.attempts = 1;
    store.set(updated);
    await scheduler.runTask(task.id, { isRetry: false });
    assert.equal(observedAttemptsDuringRun, 0, 'Regular run must reset attempts to 0 before execution');
    assert.equal(store.get(task.id).attempts, 0, 'Attempts must remain 0 on success');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Scheduler eliminates zombie tasks from queue on pause and removal (#145)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sched-queue-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  try {
    const task1 = { id: 't1', title: 'Task 1', schedule: '0 * * * *', type: 'bash', status: 'active', overlapPolicy: 'queue' };
    const task2 = { id: 't2', title: 'Task 2', schedule: '0 * * * *', type: 'bash', status: 'active', overlapPolicy: 'queue' };
    store.set(task1);
    store.set(task2);

    const scheduler = new TaskScheduler(store, async () => ({ status: 'success' }), { maxConcurrent: 1 });
    scheduler.queue.push({ taskId: 't1', priority: 5, queuedAt: Date.now() });
    scheduler.queue.push({ taskId: 't2', priority: 5, queuedAt: Date.now() });
    assert.equal(scheduler.queue.length, 2);

    // Pausing t1 must remove it from queue
    scheduler.pauseTask('t1');
    assert.equal(scheduler.queue.length, 1);
    assert.equal(scheduler.queue[0].taskId, 't2');

    // Removing t2 must remove it from queue
    scheduler.removeTask('t2');
    assert.equal(scheduler.queue.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Persistent session auto-recovers from context overflow by rotating session ID (#145)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-context-'));
  const store = new TaskStore(path.join(tmpDir, 'tasks.json'));
  try {
    const task = {
      id: 'task-context-rot',
      title: 'Context Rotation Task',
      type: 'llm',
      status: 'active',
      prompt: 'Check logs',
      targetSessionId: 'support-agent-session',
      timeoutSeconds: 30
    };
    store.set(task);

    let sessionCalls = 0;
    const archivedSessions = [];
    const mockCtx = {
      get: (key) => {
        if (key === 'sessions') {
          return {
            archive: (sid) => archivedSessions.push(sid)
          };
        }
        return null;
      },
      agents: {
        resume: async ({ sessionId }) => {
          sessionCalls++;
          if (sessionCalls === 1) {
            // First call simulates context window exceeded
            return {
              agent: {
                whenIdle: async () => {
                  throw new Error('context_length_exceeded: maximum context length is 32768 tokens');
                },
                followup: () => {},
                session: { id: sessionId }
              },
              dispose: async () => {}
            };
          }
          throw new Error('session not found');
        },
        create: async ({ sessionId }) => {
          sessionCalls++;
          return {
            agent: {
              whenIdle: async () => {},
              followup: () => {},
              session: { id: sessionId },
              usage: { inputTokens: 50, outputTokens: 20 }
            },
            dispose: async () => {}
          };
        }
      }
    };

    const runner = new SessionRunner(mockCtx, store);
    const result = await runner.execute(task);

    assert.ok(result.output.includes('Agent finished turn'));
    assert.ok(archivedSessions.includes('support-agent-session'), 'Exhausted session must be archived');
    assert.ok(task.targetSessionId.startsWith('support-agent-session-'), 'Session ID must be rotated');
    const stored = store.get(task.id);
    assert.equal(stored.targetSessionId, task.targetSessionId, 'Store must persist rotated session ID');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
