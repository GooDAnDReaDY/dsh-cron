import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseCronAsCode,
  reconcileWorkspaceCronTasks,
  CronAsCodeManager,
} from '../lib/cron-as-code.js';

test('parseCronAsCode parses JSON and YAML configurations correctly', () => {
  // 1. JSON
  const jsonRaw = JSON.stringify({
    tasks: [
      { id: 'build', title: 'Build Project', schedule: '0 * * * *', command: 'npm run build' }
    ]
  });
  const jsonRes = parseCronAsCode(jsonRaw);
  assert.equal(jsonRes.tasks.length, 1);
  assert.equal(jsonRes.tasks[0].id, 'build');
  assert.equal(jsonRes.tasks[0].command, 'npm run build');

  // 2. YAML
  const yamlRaw = `
# Workspace automated cron tasks
tasks:
  - id: test-suite
    title: Run Tests
    schedule: "0 2 * * *"
    type: script
    command: npm test
  - id: cleanup
    title: Log Cleanup
    schedule: "0 4 * * *"
    timeBoxMinutes: 15
`;
  const yamlRes = parseCronAsCode(yamlRaw);
  assert.equal(yamlRes.tasks.length, 2);
  assert.equal(yamlRes.tasks[0].id, 'test-suite');
  assert.equal(yamlRes.tasks[0].schedule, '0 2 * * *');
  assert.equal(yamlRes.tasks[1].id, 'cleanup');
  assert.equal(yamlRes.tasks[1].timeBoxMinutes, 15);
});

test('reconcileWorkspaceCronTasks creates, updates and deletes without touching user GUI tasks', () => {
  const storeData = new Map();
  // Existing manual GUI task (not managed by cron_as_code)
  storeData.set('manual-1', {
    id: 'manual-1',
    title: 'Manual Task',
    workspaceId: 'ws-123',
    managedBy: undefined,
  });

  const mockStore = {
    list: () => Array.from(storeData.values()),
    set: (t) => storeData.set(t.id, t),
    delete: (id) => storeData.delete(id),
  };

  // Reconcile initial declaration
  const decl1 = [
    { id: 'job-1', title: 'Job 1', schedule: '*/5 * * * *' },
    { id: 'job-2', title: 'Job 2', schedule: '0 0 * * *' },
  ];
  const res1 = reconcileWorkspaceCronTasks(mockStore, 'ws-123', decl1);
  assert.equal(res1.created, 2);
  assert.equal(res1.updated, 0);
  assert.equal(res1.deleted, 0);

  // Manual task should still be untouched
  assert.ok(storeData.has('manual-1'));

  // Reconcile update: remove job-1, update job-2, add job-3
  const decl2 = [
    { id: 'job-2', title: 'Job 2 Updated', schedule: '0 1 * * *' },
    { id: 'job-3', title: 'Job 3', schedule: '0 2 * * *' },
  ];
  const res2 = reconcileWorkspaceCronTasks(mockStore, 'ws-123', decl2);
  assert.equal(res2.created, 1);
  assert.equal(res2.updated, 1);
  assert.equal(res2.deleted, 1);

  // Check state
  const job2 = storeData.get('cac_ws-123_job-2');
  assert.ok(job2);
  assert.equal(job2.title, 'Job 2 Updated');
  assert.equal(job2.managedBy, 'cron_as_code');

  // Job 1 should have been deleted
  assert.equal(storeData.has('cac_ws-123_job-1'), false);
  // Manual task must remain untouched
  assert.ok(storeData.has('manual-1'));
});

test('CronAsCodeManager discovers .dsh/cron.yaml and synchronizes workspace', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cac-test-'));
  const dshDir = path.join(tmpDir, '.dsh');
  fs.mkdirSync(dshDir, { recursive: true });

  const yamlPath = path.join(dshDir, 'cron.yaml');
  fs.writeFileSync(yamlPath, `
tasks:
  - id: nightly-audit
    title: Nightly Code Audit
    schedule: "0 3 * * *"
`);

  const storeData = new Map();
  const mockScheduler = {
    store: {
      list: () => Array.from(storeData.values()),
      set: (t) => storeData.set(t.id, t),
      delete: (id) => storeData.delete(id),
    },
  };

  const manager = new CronAsCodeManager(mockScheduler);
  try {
    const res = manager.syncWorkspace('ws-test', tmpDir);
    assert.ok(res);
    assert.equal(res.created, 1);
    assert.ok(storeData.has('cac_ws-test_nightly-audit'));
  } finally {
    manager.stopAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('reconcileWorkspaceCronTasks properly maps command to prompt and type script', () => {
  const storeData = new Map();
  const mockStore = {
    list: () => Array.from(storeData.values()),
    set: (t) => storeData.set(t.id, t),
    delete: (id) => storeData.delete(id),
  };

  const decl = [
    { id: 'run-lint', command: 'npm run lint', schedule: '0 1 * * *' }
  ];

  const res = reconcileWorkspaceCronTasks(mockStore, 'ws-abc', decl);
  assert.equal(res.created, 1);

  const task = storeData.get('cac_ws-abc_run-lint');
  assert.ok(task);
  assert.equal(task.type, 'script');
  assert.equal(task.prompt, 'npm run lint');
});
