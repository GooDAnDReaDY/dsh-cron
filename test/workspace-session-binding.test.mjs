import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRunner } from '../lib/runner.js';

test('SessionRunner._getWorkspaceRegistry resolves registry from ctx.get or ctx property', () => {
  const dummyRegistry = { get: () => null, list: () => [] };

  const runnerWithGet = new SessionRunner({
    get: (name) => (name === 'workspaceRegistry' ? dummyRegistry : null),
  });
  assert.equal(runnerWithGet._getWorkspaceRegistry(), dummyRegistry);

  const runnerWithProp = new SessionRunner({
    workspaceRegistry: dummyRegistry,
  });
  assert.equal(runnerWithProp._getWorkspaceRegistry(), dummyRegistry);

  const runnerEmpty = new SessionRunner({});
  assert.equal(runnerEmpty._getWorkspaceRegistry(), null);

  const runnerNull = new SessionRunner(null);
  assert.equal(runnerNull._getWorkspaceRegistry(), null);
});

test('SessionRunner._resolveWorkspace resolves workspace by id, path, or title', () => {
  const ws1 = { id: 'ws-1', title: 'Main Project', path: '/projects/main', attachSession: () => {} };
  const ws2 = { id: 'ws-2', title: 'Secondary', path: '/projects/second', attachSession: () => {} };

  const registry = {
    get: (id) => (id === 'ws-1' ? ws1 : null),
    list: () => [ws1, ws2],
  };
  const runner = new SessionRunner({ workspaceRegistry: registry });

  // Direct get by id
  assert.equal(runner._resolveWorkspace({ workspaceId: 'ws-1' }), ws1);

  // List lookup by path
  assert.equal(runner._resolveWorkspace({ workspaceId: '/projects/second' }), ws2);

  // List lookup by title
  assert.equal(runner._resolveWorkspace({ workspaceId: 'Secondary' }), ws2);

  // Non-matching or empty
  assert.equal(runner._resolveWorkspace({ workspaceId: 'non-existent' }), null);
  assert.equal(runner._resolveWorkspace({ workspaceId: '' }), null);
  assert.equal(runner._resolveWorkspace({}), null);
});

test('SessionRunner registers new session with workspace via attachSession', async () => {
  let attachedSessionId = null;
  const mockWorkspace = {
    id: 'ws-project-a',
    path: '/tmp',
    attachSession: (sid) => {
      attachedSessionId = sid;
    },
  };

  const mockHandle = {
    agent: {
      session: { id: 'session-cron-abc-123' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      create: async () => mockHandle,
    },
    workspaceRegistry: {
      get: (id) => (id === 'ws-project-a' ? mockWorkspace : null),
      archiveSession: async () => {},
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-workspace-attach',
    title: 'Workspace Task',
    prompt: 'Run something in workspace',
    type: 'llm',
    workspaceId: 'ws-project-a',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(attachedSessionId, 'session-cron-abc-123', 'attachSession must be called with session id');
});

test('SessionRunner skips attachSession when run uses isolated worktree', async () => {
  let attachSessionCalled = false;
  const mockWorkspace = {
    id: 'ws-project-wt',
    path: '/tmp',
    attachSession: () => {
      attachSessionCalled = true;
    },
  };

  const mockHandle = {
    agent: {
      session: { id: 'session-worktree-456' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      create: async () => mockHandle,
    },
    workspaceRegistry: {
      get: (id) => (id === 'ws-project-wt' ? mockWorkspace : null),
      archiveSession: async () => {},
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-worktree-attach',
    title: 'Worktree Task',
    prompt: 'Fix bug in worktree',
    type: 'llm',
    workspaceId: 'ws-project-wt',
    worktree: true,
  };

  // Mock worktree methods to avoid actual git execution
  runner.createTaskWorktree = async () => '/tmp';
  runner.removeTaskWorktree = async () => {};

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(attachSessionCalled, false, 'attachSession must be skipped when running in isolated worktree');
});

test('SessionRunner skips attachSession on resumed persistent session', async () => {
  let attachSessionCalled = false;
  const mockWorkspace = {
    id: 'ws-persistent-proj',
    path: '/tmp',
    attachSession: () => {
      attachSessionCalled = true;
    },
  };

  const mockHandle = {
    agent: {
      session: { id: 'persisted-chat-id' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      resume: async () => mockHandle,
      create: async () => { throw new Error('should not create'); },
    },
    workspaceRegistry: {
      get: (id) => (id === 'ws-persistent-proj' ? mockWorkspace : null),
      archiveSession: async () => {},
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-resume-attach',
    title: 'Resumed Task',
    prompt: 'Continue discussion',
    type: 'llm',
    workspaceId: 'ws-persistent-proj',
    targetSessionId: 'persisted-chat-id',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(attachSessionCalled, false, 'attachSession must be skipped when session is resumed');
});

test('SessionRunner archives ephemeral session via workspaceRegistry.archiveSession', async () => {
  let archivedSessionId = null;

  const mockHandle = {
    agent: {
      session: { id: 'ephemeral-session-789' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      create: async () => mockHandle,
    },
    workspaceRegistry: {
      archiveSession: async (sid) => {
        archivedSessionId = sid;
      },
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-archive-ephemeral',
    title: 'Ephemeral Task',
    prompt: 'Do one-off run',
    type: 'llm',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(archivedSessionId, 'ephemeral-session-789', 'ephemeral session must be archived via workspaceRegistry');
});

test('SessionRunner falls back to sessions.archive if workspaceRegistry is unavailable', async () => {
  let fallbackArchivedId = null;

  const mockHandle = {
    agent: {
      session: { id: 'fallback-session-999' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      create: async () => mockHandle,
    },
    get: (serviceName) => {
      if (serviceName === 'sessions') {
        return {
          archive: (sid) => {
            fallbackArchivedId = sid;
          },
        };
      }
      return null;
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-fallback-archive',
    title: 'Fallback Archive Task',
    prompt: 'Test fallback archiving',
    type: 'llm',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(fallbackArchivedId, 'fallback-session-999', 'should fall back to sessions.archive if workspaceRegistry is absent');
});

test('SessionRunner archives rotated persistent session on context overflow via workspaceRegistry', async () => {
  let archivedSessionId = null;
  let attempts = 0;

  const mockHandle = {
    agent: {
      session: { id: 'persistent-full-session' },
      whenIdle: async () => {},
      followup: () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('context window exceeded: prompt too long');
        }
      },
    },
    dispose: async () => {},
  };

  const freshHandle = {
    agent: {
      session: { id: 'persistent-fresh-session' },
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      resume: async () => mockHandle,
      create: async () => freshHandle,
    },
    workspaceRegistry: {
      archiveSession: async (sid) => {
        archivedSessionId = sid;
      },
    },
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-overflow-archive',
    title: 'Context Overflow Task',
    prompt: 'Handle overflow and rotate',
    type: 'llm',
    targetSessionId: 'persistent-full-session',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.equal(archivedSessionId, 'persistent-full-session', 'exhausted session must be archived via workspaceRegistry');
});
