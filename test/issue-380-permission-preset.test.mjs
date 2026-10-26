import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionRunner } from '../lib/runner.js';
import { cronToolParameters } from '../lib/cron-tool.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { executeCreateTask } from '../lib/task-create.js';
import { buildTaskPatch } from '../lib/task-patch.js';
import { buildTaskRecord } from '../lib/api-collection.js';

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-test380-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => {
    try { fs.rmSync(filePath, { force: true }); } catch (e) { void e; }
  });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

test('Issue #380 (GH #18): _applyPermissionPreset maps "full" to "danger-full-access"', () => {
  let appliedPreset = null;
  let targetSession = null;
  let policyTarget = null;
  let policyValue = null;

  const mockPresets = {
    set(session, preset) {
      targetSession = session;
      appliedPreset = preset;
    },
  };

  const mockApproval = {
    setPolicy(agent, policy) {
      policyTarget = agent;
      policyValue = policy;
    },
  };

  const fakeCtx = {
    get(name) {
      if (name === 'permissionPresets') return mockPresets;
      if (name === 'approval') return mockApproval;
      return undefined;
    },
  };

  const runner = new SessionRunner(fakeCtx, { get() { return null; } });
  const mockHandle = {
    agent: {
      session: { id: 'sess-perm-1' },
    },
  };

  // 1. permissionPreset: "full" maps to "danger-full-access"
  appliedPreset = null;
  targetSession = null;
  policyTarget = null;
  policyValue = null;
  runner._applyPermissionPreset({ id: 't1', permissionPreset: 'full' }, mockHandle);
  assert.equal(appliedPreset, 'danger-full-access', 'full must map to danger-full-access');
  assert.equal(targetSession?.id, 'sess-perm-1');
  assert.equal(policyValue, 'never', 'approval policy must be set to never');

  // 2. permissionPreset: "danger-full-access" is passed directly
  appliedPreset = null;
  policyValue = null;
  runner._applyPermissionPreset({ id: 't2', permissionPreset: 'danger-full-access' }, mockHandle);
  assert.equal(appliedPreset, 'danger-full-access');
  assert.equal(policyValue, 'never');

  // 3. permissionPreset: "read-only" is passed directly
  appliedPreset = null;
  policyValue = null;
  runner._applyPermissionPreset({ id: 't3', permissionPreset: 'read-only' }, mockHandle);
  assert.equal(appliedPreset, 'read-only');
  assert.equal(policyValue, 'never');

  // 4. permissionPreset: "workspace-write" is passed directly
  appliedPreset = null;
  policyValue = null;
  runner._applyPermissionPreset({ id: 't4', permissionPreset: 'workspace-write' }, mockHandle);
  assert.equal(appliedPreset, 'workspace-write');
  assert.equal(policyValue, 'never');

  // 5. permissionPreset: "default" pins approval policy to never without calling presets.set
  appliedPreset = null;
  policyValue = null;
  runner._applyPermissionPreset({ id: 't5', permissionPreset: 'default' }, mockHandle);
  assert.equal(appliedPreset, null, 'default preset should not invoke presets.set');
  assert.equal(policyValue, 'never', 'default preset in unattended cron must still pin approval to never');

  // 6. When presets.set throws, it logs warning and does not crash, and approval is still pinned
  const throwingPresets = {
    set() {
      throw new Error('Host sandbox mode not supported');
    },
  };
  const throwingCtx = {
    get(name) {
      if (name === 'permissionPresets') return throwingPresets;
      if (name === 'approval') return mockApproval;
      return undefined;
    },
  };
  const runnerThrowing = new SessionRunner(throwingCtx, { get() { return null; } });
  policyValue = null;
  assert.doesNotThrow(() => {
    runnerThrowing._applyPermissionPreset({ id: 't6', permissionPreset: 'workspace-write' }, mockHandle);
  });
  assert.equal(policyValue, 'never', 'Approval policy should still be set even if preset threw');
});

test('Issue #380 (GH #18): Schemas and validators accept danger-full-access and preserve full alias', (t) => {
  const { store, scheduler } = makeEnv(t);

  // 1. cronToolParameters enum
  const presetEnum = cronToolParameters.permissionPreset.enum;
  assert.ok(presetEnum.includes('danger-full-access'), 'enum must include danger-full-access');
  assert.ok(presetEnum.includes('full'), 'enum must preserve full alias');
  assert.ok(presetEnum.includes('workspace-write'));
  assert.ok(presetEnum.includes('read-only'));
  assert.ok(presetEnum.includes('default'));

  // 2. executeCreateTask accepts danger-full-access and full
  const task1 = executeCreateTask(store, scheduler, { title: 'T1', type: 'llm', prompt: 'hi', schedule: '0 0 * * *', permissionPreset: 'danger-full-access' });
  assert.equal(task1.task.permissionPreset, 'danger-full-access');
  const task2 = executeCreateTask(store, scheduler, { title: 'T2', type: 'llm', prompt: 'hi', schedule: '0 0 * * *', permissionPreset: 'full' });
  assert.equal(task2.task.permissionPreset, 'full');
  const task3 = executeCreateTask(store, scheduler, { title: 'T3', type: 'llm', prompt: 'hi', schedule: '0 0 * * *', permissionPreset: 'invalid-val' });
  assert.equal(task3.task.permissionPreset, 'default');

  // 3. buildTaskPatch accepts danger-full-access
  const { patch: patch1 } = buildTaskPatch({ type: 'llm' }, { permissionPreset: 'danger-full-access' });
  assert.equal(patch1.permissionPreset, 'danger-full-access');
  const { patch: patch2 } = buildTaskPatch({ type: 'llm' }, { permissionPreset: 'full' });
  assert.equal(patch2.permissionPreset, 'full');

  // 4. buildTaskRecord accepts danger-full-access
  const rec1 = buildTaskRecord(store, { title: 'R1', permissionPreset: 'danger-full-access' }, 'llm', { cronPattern: '0 0 * * *' });
  assert.equal(rec1.permissionPreset, 'danger-full-access');
  const rec2 = buildTaskRecord(store, { title: 'R2', permissionPreset: 'full' }, 'llm', { cronPattern: '0 0 * * *' });
  assert.equal(rec2.permissionPreset, 'full');
});