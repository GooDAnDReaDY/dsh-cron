import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetSessionId, SessionRunner } from '../lib/runner.js';
import { TaskStore } from '../lib/store.js';
import { PATCHABLE_TASK_FIELDS, buildDuplicateTask, buildTaskExport } from '../lib/task-transfer.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('resolveTargetSessionId helper correctly handles policies and date formatting', () => {
  assert.equal(resolveTargetSessionId(null), null);
  assert.equal(resolveTargetSessionId(''), null);
  assert.equal(resolveTargetSessionId('   '), null);

  // 'never' / default
  assert.equal(resolveTargetSessionId('my-session'), 'my-session');
  assert.equal(resolveTargetSessionId('my-session', 'never'), 'my-session');

  // {{date}} token
  const testDate = new Date('2026-09-14T10:00:00Z');
  assert.equal(resolveTargetSessionId('session-{{date}}', 'never', testDate), 'session-2026-09-14');

  // 'daily' policy
  assert.equal(resolveTargetSessionId('standup', 'daily', testDate), 'standup-2026-09-14');

  // 'weekly' policy
  const weeklyResult = resolveTargetSessionId('audit', 'weekly', testDate);
  assert.match(weeklyResult, /^audit-2026-W\d{2}$/);
});

test('SessionRunner resumes existing agent session when targetSessionId is specified', async () => {
  let resumeCalledWith = null;
  let followups = [];
  let disposed = false;
  let archiveCalledWith = null;

  const mockHandle = {
    agent: {
      session: { id: 'persistent-chat-123' },
      whenIdle: async () => {},
      followup: (msg) => followups.push(msg),
    },
    dispose: async () => { disposed = true; },
  };

  const mockCtx = {
    agents: {
      create: async () => {
        throw new Error('should not create if resume succeeds');
      },
      resume: async (opts) => {
        resumeCalledWith = opts;
        return mockHandle;
      },
    },
    get: (serviceName) => {
      if (serviceName === 'sessions') {
        return {
          archive: (sid) => { archiveCalledWith = sid; },
        };
      }
      return null;
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-persistent-1',
    title: 'Persistent Auditor',
    prompt: 'Check logs and continue thread',
    type: 'llm',
    targetSessionId: 'persistent-chat-123',
    targetSessionReset: 'never',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.match(res.output, /resumed: persistent-chat-123/);
  assert.equal(res.sessionId, 'persistent-chat-123');
  assert.equal(resumeCalledWith.sessionId, 'persistent-chat-123');
  assert.equal(followups.length, 1);
  assert.equal(disposed, true, 'handle should be disposed to release listeners while idle');
  assert.equal(archiveCalledWith, null, 'persistent session must NOT be archived');
});

test('SessionRunner creates persistent session when resume fails', async () => {
  let createCalledWith = null;
  let archiveCalledWith = null;

  const mockHandle = {
    agent: {
      session: { id: 'persistent-new-456' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      resume: async () => {
        throw new Error('Session not found in store');
      },
      create: async (opts) => {
        createCalledWith = opts;
        return mockHandle;
      },
    },
    get: (serviceName) => {
      if (serviceName === 'sessions') {
        return {
          archive: (sid) => { archiveCalledWith = sid; },
        };
      }
      return null;
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-persistent-2',
    title: 'New Thread',
    prompt: 'First run in thread',
    type: 'llm',
    targetSessionId: 'persistent-new-456',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(createCalledWith.sessionId, 'persistent-new-456');
  assert.equal(createCalledWith.meta.ephemeral, false, 'persistent session is not ephemeral');
  assert.equal(createCalledWith.meta.internal, false, 'persistent session is not internal');
  assert.equal(archiveCalledWith, null, 'new persistent session must NOT be archived');
});

test('Ephemeral session (without targetSessionId) archives as expected', async () => {
  let createCalledWith = null;
  let archiveCalledWith = null;

  const mockHandle = {
    agent: {
      session: { id: 'cron-exec-task-3-uuid' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      create: async (opts) => {
        createCalledWith = opts;
        return mockHandle;
      },
    },
    get: (serviceName) => {
      if (serviceName === 'sessions') {
        return {
          archive: (sid) => { archiveCalledWith = sid; },
        };
      }
      return null;
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-ephemeral-3',
    title: 'Ephemeral Job',
    prompt: 'Run one-off check',
    type: 'llm',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(createCalledWith.meta.ephemeral, true);
  assert.equal(createCalledWith.meta.internal, true);
  assert.equal(archiveCalledWith, 'cron-exec-task-3-uuid', 'ephemeral session must be archived');
});

test('Presets mount inside setup hook for resumed persistent sessions', async () => {
  let mountedPreset = null;

  const mockHandle = {
    agent: {
      session: { id: 'session-with-preset' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agentPresets: {
      resolve: async (id) => ({ id: id || 'standard' }),
      standingKeyFor: async () => 'mock-key',
      mount: async (agentCtx, presetId) => {
        mountedPreset = presetId;
      },
    },
    agents: {
      create: async () => mockHandle,
      resume: async (opts) => {
        if (opts.setup) await opts.setup({});
        return mockHandle;
      },
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-preset-resume',
    title: 'Preset Resumed Job',
    prompt: 'Check files',
    type: 'llm',
    targetSessionId: 'session-with-preset',
    agentPreset: 'coding',
  };

  await runner.execute(task);
  assert.equal(mountedPreset, 'coding', 'custom preset should be mounted during resume');
});

test('TaskStore and task-transfer preserve targetSessionId and targetSessionReset', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-persist-test-'));
  const filePath = path.join(tmpDir, 'tasks.json');
  try {
    const store = new TaskStore(filePath);

    const created = store.set({
      title: 'Persistent Task',
      schedule: '0 * * * *',
      prompt: 'Echo status',
      type: 'llm',
      targetSessionId: 'daily-audit',
      targetSessionReset: 'daily',
    });

    assert.equal(created.targetSessionId, 'daily-audit');
    assert.equal(created.targetSessionReset, 'daily');

    // Verify retrieval
    const fetched = store.get(created.id);
    assert.equal(fetched.targetSessionId, 'daily-audit');
    assert.equal(fetched.targetSessionReset, 'daily');

    // Transfer checks
    assert.ok(PATCHABLE_TASK_FIELDS.includes('targetSessionId'));
    assert.ok(PATCHABLE_TASK_FIELDS.includes('targetSessionReset'));

    const dup = buildDuplicateTask(created, { id: 'dup-1' });
    assert.equal(dup.targetSessionId, 'daily-audit');
    assert.equal(dup.targetSessionReset, 'daily');

    const expDoc = buildTaskExport([created]);
    assert.equal(expDoc.tasks[0].targetSessionId, 'daily-audit');
    assert.equal(expDoc.tasks[0].targetSessionReset, 'daily');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
