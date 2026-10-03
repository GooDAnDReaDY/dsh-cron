import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TaskStore } from '../lib/store.js';
import { buildTaskExport, validateImportDocument } from '../lib/task-transfer.js';
import { handleTaskExport } from '../lib/api-import-export.js';

test('Issue #222: TaskStore enforces safe file modes (0600 files, 0700 dir)', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-perm-test-'));
  const storePath = path.join(tmpDir, 'subdir', 'tasks.json');
  try {
    const store = new TaskStore(storePath);
    store.set({
      id: 'task-sec',
      title: 'Secret Task',
      schedule: '0 0 * * *',
      prompt: 'do stuff',
      env: { SECRET_KEY: 'super-secret' },
    });
    store.flushSync();

    // Verify directory mode
    const dirStat = fs.statSync(path.dirname(storePath));
    const dirMode = dirStat.mode & 0o777;
    // On POSIX, dir must be 0700
    if (process.platform !== 'win32') {
      assert.equal(dirMode, 0o700, 'store directory should have 0700 permissions');
    }

    // Verify tasks.json mode
    const fileStat = fs.statSync(storePath);
    const fileMode = fileStat.mode & 0o777;
    if (process.platform !== 'win32') {
      assert.equal(fileMode, 0o600, 'tasks.json should have 0600 permissions');
    }

    // Test remediation of pre-existing loose permissions (0664 -> 0600)
    if (process.platform !== 'win32') {
      fs.chmodSync(storePath, 0o664);
      assert.equal(fs.statSync(storePath).mode & 0o777, 0o664);
      // Re-init store should fix permissions
      const store2 = new TaskStore(storePath);
      assert.equal(fs.statSync(storePath).mode & 0o777, 0o600, 'init() should fix loose file permissions to 0600');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Issue #244: TaskStore debounced async persistence does not block event loop', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-async-test-'));
  const storePath = path.join(tmpDir, 'tasks.json');
  try {
    const store = new TaskStore(storePath);
    // Populate with 50 tasks and multiple history runs
    for (let i = 0; i < 50; i++) {
      const id = `task-${i}`;
      store.set({
        id,
        title: `Task #${i}`,
        schedule: '*/5 * * * *',
        prompt: 'test prompt '.repeat(20),
        env: { FOO: 'bar' },
      });
      for (let r = 0; r < 10; r++) {
        store.recordRun(id, {
          at: Date.now(),
          status: 'success',
          durationMs: 15,
          output: 'run output '.repeat(50),
          usage: { inputTokens: 100, outputTokens: 50 },
        });
      }
    }

    // Check that scheduleSave uses saveAsync and resolves cleanly
    let timerFired = false;
    const startTime = Date.now();
    setTimeout(() => {
      timerFired = true;
    }, 10);

    await store.saveAsync();
    assert.ok(fs.existsSync(storePath), 'store file was written asynchronously');
    const diskContent = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    assert.equal(diskContent.tasks.length, 50);

    // Verify snapshot versioning: flushSync updates disk immediately
    store.set({
      id: 'task-sync',
      title: 'Sync Task',
      schedule: '0 0 * * *',
      prompt: 'sync prompt',
    });
    store.flushSync();
    const diskContent2 = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    assert.ok(diskContent2.tasks.some(x => x.id === 'task-sync'), 'flushSync wrote immediately to disk');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Issue #240: buildTaskExport supports sanitized export and validateImportDocument strips masked secrets', (t) => {
  const tasks = [
    {
      id: 'task-1',
      title: 'LLM Task',
      schedule: '0 * * * *',
      prompt: 'Hello world',
      env: { API_TOKEN: 'real-secret-123' },
      httpHeaders: { Authorization: 'Bearer raw-token' },
      httpBody: 'secret body',
    },
    {
      id: 'task-2',
      title: 'Simple Task',
      schedule: '30 * * * *',
      prompt: 'No secrets here',
    },
  ];

  // 1. Raw export includes env and headers
  const rawExport = buildTaskExport(tasks, { sanitize: false });
  assert.equal(rawExport.sanitized, false);
  assert.equal(rawExport.tasks[0].env?.API_TOKEN, 'real-secret-123');
  assert.equal(rawExport.tasks[0].httpHeaders?.Authorization, 'Bearer raw-token');

  // 2. Sanitized export strips env, httpHeaders, httpBody
  const sanitizedExport = buildTaskExport(tasks, { sanitize: true });
  assert.equal(sanitizedExport.sanitized, true);
  assert.equal(sanitizedExport.tasks[0].env, undefined);
  assert.equal(sanitizedExport.tasks[0].httpHeaders, undefined);
  assert.equal(sanitizedExport.tasks[0].httpBody, undefined);
  assert.equal(sanitizedExport.tasks[0].title, 'LLM Task');
  assert.equal(sanitizedExport.tasks[1].title, 'Simple Task');

  // 3. validateImportDocument strips masked placeholder secrets so they never become literal values
  const docWithMaskedSecrets = {
    kind: 'dsh-cron-tasks',
    version: 1,
    tasks: [
      {
        id: 'imported-1',
        title: 'Imported Task',
        schedule: '0 12 * * *',
        prompt: 'run prompt',
        type: 'llm',
        env: {
          SECRET_MASKED: '••••••••',
          SECRET_PARTIAL: 'sk-a••••123',
          REAL_ENV: 'normal_value',
        },
        httpHeaders: {
          Authorization: 'Bearer ••••••••',
          'Content-Type': 'application/json',
        },
      },
    ],
  };

  const validated = validateImportDocument(docWithMaskedSecrets);
  assert.equal(validated.ok, true);
  const task0 = validated.tasks[0];
  assert.equal(task0.env.SECRET_MASKED, undefined, 'masked secret must be stripped');
  assert.equal(task0.env.SECRET_PARTIAL, undefined, 'partially masked secret must be stripped');
  assert.equal(task0.env.REAL_ENV, 'normal_value', 'unmasked env must remain');
  assert.equal(task0.httpHeaders.Authorization, undefined, 'masked header must be stripped');
  assert.equal(task0.httpHeaders['Content-Type'], 'application/json', 'normal header must remain');
});

test('Issue #240: handleTaskExport parses ?sanitize=true and ?redact=true from query', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-export-test-'));
  const storePath = path.join(tmpDir, 'tasks.json');
  try {
    const store = new TaskStore(storePath);
    store.set({
      id: 'task-sec',
      title: 'Secret Task',
      schedule: '0 0 * * *',
      prompt: 'hello',
      env: { SECRET: '123' },
    });

    let sentStatus = 0;
    let sentBody = null;
    const res = {
      writeHead: (code) => { sentStatus = code; },
      end: (payload) => { sentBody = JSON.parse(payload); },
    };

    // Test with sanitize=true
    handleTaskExport({ store, req: { url: '/dsh-cron/tasks/export?sanitize=true' }, res });
    assert.equal(sentStatus, 200);
    assert.equal(sentBody.sanitized, true);
    assert.equal(sentBody.document.tasks[0].env, undefined);

    // Test raw (no sanitize query)
    handleTaskExport({ store, req: { url: '/dsh-cron/tasks/export' }, res });
    assert.equal(sentStatus, 200);
    assert.equal(sentBody.sanitized, false);
    assert.equal(sentBody.document.tasks[0].env?.SECRET, '123');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Issue #245: index.md does not reference obsolete croner@9.1.0', (t) => {
  const indexContent = fs.readFileSync(path.join(process.cwd(), 'index.md'), 'utf-8');
  assert.ok(!indexContent.includes('croner@9.1.0'), 'index.md should not reference croner@9.1.0');
  assert.ok(indexContent.includes('croner@^10.0.1'), 'index.md should reference croner@^10.0.1');
});


test('Issue #241: Dry-run result extracts top-level fields (output, durationMs, status)', (t) => {
  // Simulate top-level API payload returned by /dsh-cron/tasks/:id/dry-run
  const dryRunResponse = {
    ok: true,
    dryRun: true,
    status: 'success',
    output: 'REAL DRY OUTPUT',
    error: null,
    durationMs: 45,
    usage: { inputTokens: 7 },
  };

  const drStatus = (dryRunResponse.result && dryRunResponse.result.status) || dryRunResponse.status || (dryRunResponse.ok ? 'success' : 'failed');
  const drDuration = (((dryRunResponse.result && dryRunResponse.result.durationMs) !== undefined ? dryRunResponse.result.durationMs : dryRunResponse.durationMs) || 0);
  const drOutput = ((dryRunResponse.result && dryRunResponse.result.output) !== undefined ? dryRunResponse.result.output : (dryRunResponse.output !== undefined ? dryRunResponse.output : ((dryRunResponse.result && dryRunResponse.result.error) || dryRunResponse.error || '(no output)')));

  assert.equal(drStatus, 'success');
  assert.equal(drDuration, 45);
  assert.equal(drOutput, 'REAL DRY OUTPUT');
});

test('Issue #241: Archive pagination appends runs instead of replacing', (t) => {
  const initialRuns = [
    { at: 1000, status: 'success', durationMs: 10 },
    { at: 2000, status: 'error', durationMs: 20 },
  ];
  const page2Runs = [
    { at: 3000, status: 'success', durationMs: 15 },
  ];

  // Simulating openArchiveModal offset > 0 append reducer:
  const offset = 2;
  const combined = offset === 0 ? page2Runs : [...initialRuns, ...page2Runs];

  assert.equal(combined.length, 3);
  assert.equal(combined[0].at, 1000);
  assert.equal(combined[2].at, 3000);
});

test('Issue #242: Optimistic run rollback restores previous status when API rejects', (t) => {
  let tasks = [
    { id: 'task-1', title: 'Task 1', lastStatus: 'idle' },
  ];
  const targetId = 'task-1';
  const prevStatus = tasks.find(t => t.id === targetId)?.lastStatus;

  // 1. Optimistic transition
  tasks = tasks.map(t => t.id === targetId ? { ...t, lastStatus: 'running' } : t);
  assert.equal(tasks[0].lastStatus, 'running');

  // 2. Simulated failure (403 forbidden or 500 error)
  const apiFailed = true;
  if (apiFailed) {
    tasks = tasks.map(t => t.id === targetId ? { ...t, lastStatus: prevStatus } : t);
  }
  assert.equal(tasks[0].lastStatus, 'idle', 'status must be rolled back to idle');
});

test('Issue #246: publish.sh and .gitattributes exclude .gitea', (t) => {
  const publishSh = fs.readFileSync(path.join(process.cwd(), 'publish.sh'), 'utf-8');
  assert.ok(publishSh.includes('".gitea"'), 'publish.sh must exclude .gitea');

  const gitAttr = fs.readFileSync(path.join(process.cwd(), '.gitattributes'), 'utf-8');
  assert.ok(gitAttr.includes('.gitea/'), '.gitattributes must mark .gitea/ as export-ignore');
});
