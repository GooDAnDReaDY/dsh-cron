import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRunner } from '../lib/runner.js';
import { PATCHABLE_TASK_FIELDS, buildDuplicateTask, buildTaskExport } from '../lib/task-transfer.js';
import { executeCreateTask } from '../lib/task-create.js';

test('GH #9: SessionRunner passes resumeSessionId to ctx.agents.resume for host 0.2.0-rc.2 compatibility', async () => {
  let resumeOptionsReceived = null;
  let followups = [];

  const mockHandle = {
    agent: {
      session: { id: 'session-ebb4c7f9-test' },
      whenIdle: async () => {},
      followup: (msg) => followups.push(msg),
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      resume: async (options) => {
        // Host 0.2.0-rc.2 requires options.resumeSessionId (options.sessionId alone throws)
        if (!options.resumeSessionId) {
          throw new Error('Host 0.2.0-rc.2 error: resumeSessionId is required');
        }
        resumeOptionsReceived = options;
        return mockHandle;
      },
      create: async () => {
        throw new Error('should not call create when resume succeeds');
      },
    },
    get: () => null,
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-gh9-1',
    title: 'Persistent Worker',
    prompt: 'Execute step',
    type: 'llm',
    targetSessionId: 'session-ebb4c7f9-test',
    targetSessionReset: 'never',
  };

  const result = await runner.execute(task);
  assert.ok(result);
  assert.match(result.output, /resumed: session-ebb4c7f9-test/);
  assert.equal(result.sessionId, 'session-ebb4c7f9-test');
  assert.equal(resumeOptionsReceived.resumeSessionId, 'session-ebb4c7f9-test');
  assert.equal(resumeOptionsReceived.sessionId, 'session-ebb4c7f9-test');
  assert.equal(followups.length, 1);
});

test('GH #9: When resume fails and create throws "already exists", error clarifies underlying resume failure', async () => {
  const mockCtx = {
    agents: {
      resume: async () => {
        throw new Error('Host resume failed: session corrupted');
      },
      create: async () => {
        throw new Error('session "session-ebb4c7f9-test" already exists');
      },
    },
    get: () => null,
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'task-gh9-2',
    title: 'Persistent Worker Failing',
    prompt: 'Execute step',
    type: 'llm',
    targetSessionId: 'session-ebb4c7f9-test',
  };

  await assert.rejects(
    async () => runner.execute(task),
    /could not resume session "session-ebb4c7f9-test" \(Host resume failed: session corrupted\): session "session-ebb4c7f9-test" already exists/
  );
});

test('GH #9: _nameSession assigns sessionTitle via ctx.sessionTitle service', async () => {
  let renamedSession = null;
  let renamedTitle = null;

  const mockSession = { id: 'session-named-1' };
  const mockHandle = {
    agent: {
      session: mockSession,
      whenIdle: async () => {},
      followup: () => {},
    },
    dispose: async () => {},
  };

  const mockCtx = {
    agents: {
      create: async () => mockHandle,
    },
    get: (name) => {
      if (name === 'sessionTitle') {
        return {
          rename: (session, title) => {
            renamedSession = session;
            renamedTitle = title;
          },
        };
      }
      return null;
    },
  };

  const runner = new SessionRunner(mockCtx);

  // 1. Task with explicit sessionTitle
  const task1 = {
    id: 'task-gh9-3',
    title: 'Worker Task',
    sessionTitle: 'Custom Worker Session',
    prompt: 'hello',
    type: 'llm',
  };
  await runner.execute(task1);
  assert.equal(renamedSession.id, 'session-named-1');
  assert.equal(renamedTitle, 'Custom Worker Session');

  // 2. Task with title starting with '[' (e.g. [W] 常驻工人)
  renamedTitle = null;
  const task2 = {
    id: 'task-gh9-4',
    title: '[W] 常驻工人',
    prompt: 'hello',
    type: 'llm',
  };
  await runner.execute(task2);
  assert.equal(renamedTitle, '[W] 常驻工人');

  // 3. Task without sessionTitle gains <YYYY-MM-DD> <title> (#369, GH #15)
  renamedTitle = null;
  const task3 = {
    id: 'task-gh9-5',
    title: 'Plain Task',
    prompt: 'hello',
    type: 'llm',
  };
  await runner.execute(task3);
  const now = new Date();
  const nowYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.equal(renamedTitle, `${nowYmd} Plain Task`);

  // 4. Truly empty task title does not rename session
  renamedTitle = null;
  const task4 = {
    id: 'task-gh9-6',
    title: '',
    prompt: 'hello',
    type: 'llm',
  };
  await runner.execute(task4);
  assert.equal(renamedTitle, null);
});

test('GH #9: sessionTitle is transferable, exportable, and patchable', () => {
  assert.ok(PATCHABLE_TASK_FIELDS.includes('sessionTitle'), 'sessionTitle must be patchable');

  const store = { set: (t) => t, list: () => [] };
  const scheduler = { scheduleTask: () => {} };
  const res = executeCreateTask(store, scheduler, {
    title: 'Named Task',
    prompt: 'echo 1',
    schedule: '0 * * * *',
    sessionTitle: 'Explicit Session Name',
  });
  assert.equal(res.task.sessionTitle, 'Explicit Session Name');

  const dup = buildDuplicateTask(res.task, { id: 'dup-1' });
  assert.equal(dup.sessionTitle, 'Explicit Session Name');

  const exp = buildTaskExport([res.task]);
  assert.equal(exp.tasks[0].sessionTitle, 'Explicit Session Name');
});
