import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRunner } from '../lib/runner.js';
import { PATCHABLE_TASK_FIELDS, DUPLICATE_TASK_FIELDS } from '../lib/task-transfer.js';
import { TaskStore } from '../lib/store.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('PATCHABLE_TASK_FIELDS includes agentPreset', () => {
  assert.ok(PATCHABLE_TASK_FIELDS.includes('agentPreset'), 'agentPreset must be patchable');
  assert.ok(DUPLICATE_TASK_FIELDS.includes('agentPreset'), 'agentPreset must be duplicateable');
});

test('TaskStore persists and loads agentPreset', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-preset-test-'));
  const storePath = path.join(tmpDir, 'tasks.json');
  try {
    const store = new TaskStore(storePath);
    const task = store.set({
      title: 'Coding Task',
      schedule: '0 9 * * *',
      prompt: 'Refactor code',
      type: 'llm',
      agentPreset: 'cordis',
    });
    assert.equal(task.agentPreset, 'cordis', 'agentPreset set on creation');

    const fetched = store.get(task.id);
    assert.equal(fetched.agentPreset, 'cordis', 'agentPreset read from store');

    // Reload store from disk
    const reloaded = new TaskStore(storePath);
    const reloadedTask = reloaded.get(task.id);
    assert.equal(reloadedTask.agentPreset, 'cordis', 'agentPreset persisted across reloads');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SessionRunner mounts default agent preset into agent session (#GH-1)', async () => {
  let resolvedWith = null;
  let standingKeyId = null;
  let mountedWith = null;
  let createPayload = null;

  const mockPresets = {
    async resolve(id) {
      resolvedWith = id;
      return { id: id || 'standard' };
    },
    async standingKeyFor(id) {
      standingKeyId = id;
    },
    async mount(agentCtx, id) {
      mountedWith = { agentCtx, id };
    }
  };

  const mockAgent = {
    session: { id: 'sess-1', usage: { inputTokens: 10, outputTokens: 5 } },
    whenIdle: async () => {},
    followup: () => {},
  };

  const mockAgents = {
    async create(payload) {
      createPayload = payload;
      // Simulate cordis / dsh-agent factory calling setup
      if (typeof payload.setup === 'function') {
        await payload.setup({ agentId: 'agent-1' });
      }
      return {
        agent: mockAgent,
      };
    }
  };

  const mockCtx = {
    agentPresets: mockPresets,
    agents: mockAgents,
    get(name) {
      if (name === 'agentPresets') return mockPresets;
      if (name === 'agents') return mockAgents;
      return null;
    }
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'test_task_1',
    title: 'Default Preset Task',
    type: 'llm',
    prompt: 'Check files',
  };

  const res = await runner.execute(task);
  assert.ok(res.output, 'Task executed successfully');

  // Verify resolve was called with undefined (to pick configured default)
  assert.equal(resolvedWith, undefined, 'resolvedWith should be undefined for default');
  assert.equal(standingKeyId, 'standard', 'standingKeyFor called with resolved preset id');

  // Verify agents.create received agentPreset in meta
  assert.ok(createPayload, 'create called');
  assert.equal(createPayload.meta?.agentPreset, 'standard', 'meta.agentPreset set in session header');

  // Verify setup was provided and called presets.mount
  assert.ok(typeof createPayload.setup === 'function', 'setup hook provided');
  assert.ok(mountedWith, 'presets.mount was called in setup hook');
  assert.equal(mountedWith.id, 'standard', 'mounted with resolved preset id');
  assert.equal(mountedWith.agentCtx.agentId, 'agent-1', 'mounted with agentCtx');
});

test('SessionRunner mounts custom task-specified agent preset (#GH-1)', async () => {
  let resolvedWith = null;
  let mountedWith = null;
  let createPayload = null;

  const mockPresets = {
    async resolve(id) {
      resolvedWith = id;
      return { id: id || 'standard' };
    },
    async standingKeyFor() {},
    async mount(agentCtx, id) {
      mountedWith = { agentCtx, id };
    }
  };

  const mockAgent = {
    session: { id: 'sess-2', usage: {} },
    whenIdle: async () => {},
    followup: () => {},
  };

  const mockAgents = {
    async create(payload) {
      createPayload = payload;
      if (typeof payload.setup === 'function') {
        await payload.setup({ agentId: 'agent-2' });
      }
      return { agent: mockAgent };
    }
  };

  const mockCtx = {
    agentPresets: mockPresets,
    agents: mockAgents,
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'test_task_custom',
    title: 'Custom Preset Task',
    type: 'llm',
    prompt: 'Run tools',
    agentPreset: 'minimal',
  };

  const res = await runner.execute(task);
  assert.ok(res.output);
  assert.equal(resolvedWith, 'minimal', 'custom agentPreset passed to resolve');
  assert.equal(createPayload.meta?.agentPreset, 'minimal', 'meta.agentPreset set to custom');
  assert.equal(mountedWith?.id, 'minimal', 'presets.mount called with custom preset');
});

test('SessionRunner gracefully degrades when agentPresets service is missing (#GH-1)', async () => {
  let createPayload = null;
  const mockAgent = {
    session: { id: 'sess-3' },
    whenIdle: async () => {},
    followup: () => {},
  };

  const mockAgents = {
    async create(payload) {
      createPayload = payload;
      return { agent: mockAgent };
    }
  };

  const mockCtx = {
    agents: mockAgents,
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'test_task_no_presets',
    title: 'No Presets Service Task',
    type: 'llm',
    prompt: 'Echo test',
  };

  const res = await runner.execute(task);
  assert.ok(res.output);
  assert.ok(createPayload, 'agents.create called');
  assert.equal(createPayload.meta?.agentPreset, undefined, 'no agentPreset set in meta');
  assert.equal(createPayload.setup, undefined, 'no setup hook when presets missing');
});
