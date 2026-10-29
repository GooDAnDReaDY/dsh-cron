import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskStore, CURRENT_SCHEMA_VERSION, runStoreMigrations } from '../lib/store.js';

test('store-migrations: CURRENT_SCHEMA_VERSION is 2', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 2);
});

test('store-migrations: runStoreMigrations populates v2 defaults on legacy task', () => {
  const v1Data = {
    version: 1,
    tasks: [
      {
        id: 'legacy-task-1',
        title: 'Legacy task',
        type: 'shell',
        schedule: '0 9 * * *',
        timeoutSeconds: 300,
      },
      {
        id: 'legacy-task-2',
        title: 'Legacy task 2',
        type: 'python',
        schedule: '0 12 * * *',
      },
    ],
    history: {},
  };

  const migrated = runStoreMigrations(v1Data, 1, 2);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.tasks.length, 2);

  const t1 = migrated.tasks[0];
  assert.equal(t1.maxMemoryMb, 0);
  assert.equal(t1.executionTimeoutMs, 300000); // 300s * 1000
  assert.equal(t1.maxLogBytesPerRun, 5 * 1024 * 1024);
  assert.equal(t1.cpus, 0);
  assert.equal(t1.maxArchiveMonths, 6);

  const t2 = migrated.tasks[1];
  assert.equal(t2.maxMemoryMb, 0);
  assert.equal(t2.executionTimeoutMs, 900000); // default 15m
  assert.equal(t2.maxLogBytesPerRun, 5 * 1024 * 1024);
  assert.equal(t2.cpus, 0);
  assert.equal(t2.maxArchiveMonths, 6);
});

test('store-migrations: TaskStore automatically migrates unversioned store and creates backup', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-mig-test-'));
  const filePath = path.join(tmpDir, 'tasks.json');

  const legacyStore = {
    version: 1,
    tasks: [
      {
        id: 'cron_old_1',
        title: 'Legacy Store Task',
        schedule: '*/5 * * * *',
        type: 'shell',
        timeoutSeconds: 60,
      },
    ],
    history: {
      cron_old_1: [],
    },
    settings: {
      kanbanBaseUrl: 'http://127.0.0.1:3000',
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(legacyStore, null, 2), { encoding: 'utf-8', mode: 0o600 });

  const store = new TaskStore(filePath);
  const task = store.get('cron_old_1');
  assert.ok(task, 'Task should exist after loading');
  assert.equal(task.executionTimeoutMs, 60000);
  assert.equal(task.maxLogBytesPerRun, 5 * 1024 * 1024);
  assert.equal(task.maxArchiveMonths, 6);

  // Verify pre-migration backup was created
  const files = fs.readdirSync(tmpDir);
  const backupFile = files.find((f) => f.startsWith('tasks.json.bak-v1-'));
  assert.ok(backupFile, 'Pre-migration backup file should be created');
  const backupRaw = fs.readFileSync(path.join(tmpDir, backupFile), 'utf-8');
  assert.ok(backupRaw.includes('Legacy Store Task'));

  // Save and verify disk has schemaVersion: 2
  store.flushSync();
  const savedRaw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.equal(savedRaw.schemaVersion, 2);

  // Reload again to verify idempotency (no second backup file)
  const store2 = new TaskStore(filePath);
  const filesAfter = fs.readdirSync(tmpDir);
  const backupFilesAfter = filesAfter.filter((f) => f.startsWith('tasks.json.bak-v1-'));
  assert.equal(backupFilesAfter.length, 1, 'Should not create another backup for schemaVersion: 2');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
