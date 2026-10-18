import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { FileSystemWatcherManager } from '../lib/watcher.js';
import { interpolateTaskPrompt, buildPromptContext, resolveTaskForExecution } from '../lib/prompt-interpolation.js';
import {
  isCredentialUri,
  parseCredentialUri,
  resolveCredentialReference,
  resolveDynamicCredentialsInText,
  resolveDynamicCredentialsInObject,
} from '../lib/secrets.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { TaskStore } from '../lib/store.js';
import { SessionRunner } from '../lib/runner.js';
import { executeCreateTask, sanitizeFileWatch } from '../lib/task-create.js';
import { applyTaskPatch } from '../lib/task-patch.js';
import { SETTINGS_SYNC_KEYS } from '../lib/settings.js';

test('Pack 20 verification suite: #327 (FS Watcher trigger) & #335 (Dynamic credentials)', async (t) => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-pack20-'));

  t.after(() => {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  await t.test('1. FileSystemWatcherManager: safe path validation (#327)', () => {
    const manager = new FileSystemWatcherManager(null);

    // Root paths rejected
    assert.equal(manager.isSafePath('/').safe, false);
    assert.equal(manager.isSafePath('/proc').safe, false);
    assert.equal(manager.isSafePath('/sys').safe, false);
    assert.equal(manager.isSafePath('/etc').safe, false);
    assert.equal(manager.isSafePath('').safe, false);

    // Safe path accepted
    const safeDir = path.join(tmpBase, 'watch-safe');
    fs.mkdirSync(safeDir, { recursive: true });
    const res = manager.isSafePath(safeDir);
    assert.equal(res.safe, true);
    assert.equal(res.resolved, path.resolve(safeDir));
  });

  await t.test('2. FileSystemWatcherManager: pattern matching (#327)', () => {
    const manager = new FileSystemWatcherManager(null);

    assert.equal(manager.matchPattern('test.csv', '*.csv'), true);
    assert.equal(manager.matchPattern('test.json', '*.csv'), false);
    assert.equal(manager.matchPattern('data-123.log', 'data-*.log'), true);
    assert.equal(manager.matchPattern('other.log', 'data-*.log'), false);
    assert.equal(manager.matchPattern('anything.txt', '*'), true);
    assert.equal(manager.matchPattern('foo.csv', '*.csv, *.txt'), true);
    assert.equal(manager.matchPattern('foo.txt', '*.csv, *.txt'), true);
    assert.equal(manager.matchPattern('foo.bin', '*.csv, *.txt'), false);
  });

  await t.test('3. Prompt interpolation with fileWatch context (#327)', () => {
    const task = { id: 'task-fs-1', title: 'Process file' };
    const options = {
      filePath: '/data/incoming/report.csv',
      fileName: 'report.csv',
      fileSize: 2048,
      fileEvent: 'create',
    };

    const ctx = buildPromptContext(task, options);
    assert.equal(ctx.filePath, '/data/incoming/report.csv');
    assert.equal(ctx.fileName, 'report.csv');
    assert.equal(ctx.fileSize, '2048');
    assert.equal(ctx.fileEvent, 'create');

    const prompt1 = 'Process file at {filePath} (size: {fileSize} bytes) on {fileEvent}';
    assert.equal(
      interpolateTaskPrompt(prompt1, ctx),
      'Process file at /data/incoming/report.csv (size: 2048 bytes) on create'
    );

    const prompt2 = 'Handle {{fileName}}';
    assert.equal(interpolateTaskPrompt(prompt2, ctx), 'Handle report.csv');

    const resolved = resolveTaskForExecution({
      prompt: 'Import {filePath}',
      command: 'cat {filePath}',
    }, options);
    assert.equal(resolved.prompt, 'Import /data/incoming/report.csv');
    assert.equal(resolved.command, 'cat /data/incoming/report.csv');
  });

  await t.test('4. Live FS Watcher triggers execution with debounce and event context (#327)', async () => {
    const watchDir = path.join(tmpBase, 'live-watch');
    fs.mkdirSync(watchDir, { recursive: true });

    const storePath = path.join(tmpBase, 'tasks-p20.json');
    const store = new TaskStore(storePath);

    const triggered = [];
    const scheduler = new TaskScheduler(store, async (execTask, opts) => {
      triggered.push({ task: execTask, opts });
      return { output: `Processed ${opts.fileName}` };
    });

    const task = store.set({
      id: 'task-fw-live',
      title: 'Watcher Task',
      schedule: '0 0 * * *',
      status: 'active',
      prompt: 'Got file {filePath} with event {fileEvent}',
      fileWatch: {
        enabled: true,
        path: watchDir,
        pattern: '*.csv',
        events: ['create', 'modify'],
        debounceMs: 80,
      },
    });

    scheduler.scheduleTask(task);

    // Initial state: nothing triggered
    assert.equal(triggered.length, 0);

    // Create a matching file
    const file1 = path.join(watchDir, 'input1.csv');
    fs.writeFileSync(file1, 'col1,col2\n1,2');

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 250));

    assert.equal(triggered.length, 1);
    assert.equal(triggered[0].opts.fileName, 'input1.csv');
    assert.equal(triggered[0].opts.fileEvent, 'create');
    assert.equal(triggered[0].opts.trigger, 'fileWatch');
    assert.equal(triggered[0].task.prompt, `Got file ${file1} with event create`);

    // Modify the file
    fs.appendFileSync(file1, '\n3,4');
    await new Promise((r) => setTimeout(r, 250));

    assert.equal(triggered.length, 2);
    assert.equal(triggered[1].opts.fileName, 'input1.csv');
    assert.equal(triggered[1].opts.fileEvent, 'modify');

    // Create a non-matching file (should NOT trigger)
    const fileIgnored = path.join(watchDir, 'notes.txt');
    fs.writeFileSync(fileIgnored, 'some notes');
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(triggered.length, 2);

    // Pause task -> watcher disarmed
    scheduler.pauseTask('task-fw-live');
    const file2 = path.join(watchDir, 'input2.csv');
    fs.writeFileSync(file2, 'another csv');
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(triggered.length, 2); // No new trigger

    scheduler.stopAll();
  });

  await t.test('5. Task creation & patch sanitizes and stores fileWatch (#327)', () => {
    const storePath = path.join(tmpBase, 'tasks-create-p20.json');
    const store = new TaskStore(storePath);
    const scheduler = new TaskScheduler(store, async () => ({ output: 'ok' }));

    const res = executeCreateTask(store, scheduler, {
      title: 'Watch Task Creation',
      schedule: '0 0 * * *',
      prompt: 'Check file',
      fileWatch: {
        enabled: true,
        path: '/tmp/test',
        pattern: '*.json',
        events: ['create'],
        debounceMs: 200,
      },
    });

    assert.equal(res.success, true);
    const stored = store.get(res.task.id);
    assert.ok(stored.fileWatch);
    assert.equal(stored.fileWatch.enabled, true);
    assert.equal(stored.fileWatch.path, '/tmp/test');
    assert.equal(stored.fileWatch.pattern, '*.json');
    assert.deepEqual(stored.fileWatch.events, ['create']);
    assert.equal(stored.fileWatch.debounceMs, 200);

    // Patch fileWatch
    const patchRes = applyTaskPatch({
      store,
      scheduler,
      id: res.task.id,
      body: {
        fileWatch: {
          enabled: false,
          path: '/tmp/other',
        },
      },
    });

    assert.equal(patchRes.ok, true);
    const patched = store.get(res.task.id);
    assert.equal(patched.fileWatch.enabled, false);
    assert.equal(patched.fileWatch.path, '/tmp/other');

    scheduler.stopAll();
  });

  await t.test('6. Dynamic credential reference parsing (#335)', () => {
    assert.equal(isCredentialUri('credential://dsh/MY_API_KEY'), true);
    assert.equal(isCredentialUri('credential://PLAIN_KEY'), true);
    assert.equal(isCredentialUri('http://example.com'), false);
    assert.equal(isCredentialUri('not_a_uri'), false);

    assert.deepEqual(parseCredentialUri('credential://dsh/MY_API_KEY'), {
      domain: 'dsh',
      key: 'MY_API_KEY',
    });
    assert.deepEqual(parseCredentialUri('credential://SIMPLE_KEY'), {
      domain: null,
      key: 'SIMPLE_KEY',
    });
    assert.equal(parseCredentialUri('invalid'), null);
  });

  await t.test('7. Dynamic credential resolution via mock service and environment (#335)', async () => {
    // 1. Mock context credentials service
    const mockCtx = {
      credentials: {
        resolve: async (ref) => {
          if (ref.domain === 'dsh' && ref.name === 'MY_SECRET') {
            return { value: 'super-secret-value-1234' };
          }
          if (ref === 'STANDALONE_SECRET') {
            return { value: 'standalone-secret-value-5678' };
          }
          return null;
        },
      },
    };

    const res1 = await resolveCredentialReference('credential://dsh/MY_SECRET', mockCtx);
    assert.equal(res1, 'super-secret-value-1234');

    const res2 = await resolveCredentialReference('credential://STANDALONE_SECRET', mockCtx);
    assert.equal(res2, 'standalone-secret-value-5678');

    // 2. Fallback to process.env
    process.env.TEST_PACK20_ENV_KEY = 'env-secret-value-9999';
    try {
      const res3 = await resolveCredentialReference('credential://TEST_PACK20_ENV_KEY', {});
      assert.equal(res3, 'env-secret-value-9999');
    } finally {
      delete process.env.TEST_PACK20_ENV_KEY;
    }

    // 3. String & Object replacement
    const textRes = await resolveDynamicCredentialsInText(
      'Bearer credential://dsh/MY_SECRET and credential://STANDALONE_SECRET',
      mockCtx
    );
    assert.equal(textRes.text, 'Bearer super-secret-value-1234 and standalone-secret-value-5678');
    assert.deepEqual(textRes.resolvedSecrets, ['super-secret-value-1234', 'standalone-secret-value-5678']);

    const objRes = await resolveDynamicCredentialsInObject({
      headers: { Authorization: 'Bearer credential://dsh/MY_SECRET' },
      env: { KEY: 'credential://STANDALONE_SECRET' },
    }, mockCtx);
    assert.equal(objRes.data.headers.Authorization, 'Bearer super-secret-value-1234');
    assert.equal(objRes.data.env.KEY, 'standalone-secret-value-5678');
  });

  await t.test('8. Runner in-memory resolution and zero secret leakage (#335)', async () => {
    const storePath = path.join(tmpBase, 'tasks-runner-p20.json');
    const store = new TaskStore(storePath);

    const mockCtx = {
      credentials: {
        resolve: async (ref) => {
          if (ref.domain === 'dsh' && ref.name === 'LEAK_CHECK_SECRET') {
            return { value: 'top-secret-token-abcdef' };
          }
          return null;
        },
      },
    };

    const runner = new SessionRunner(mockCtx, store);

    // Case A: enableDynamicCredentials is FALSE (default) -> reference is left untouched
    store.saveSettings({ enableDynamicCredentials: false });
    const taskA = {
      id: 'task-cred-a',
      title: 'Secret Task A',
      type: 'script',
      mode: 'no-llm',
      prompt: 'echo credential://dsh/LEAK_CHECK_SECRET',
    };
    const outcomeA = await runner.execute(taskA);
    assert.ok(outcomeA.output.includes('credential://dsh/LEAK_CHECK_SECRET'));
    assert.ok(!outcomeA.output.includes('top-secret-token-abcdef'));

    // Case B: enableDynamicCredentials is TRUE -> resolved in-memory, masked in output
    store.saveSettings({ enableDynamicCredentials: true });
    const taskB = {
      id: 'task-cred-b',
      title: 'Secret Task B',
      type: 'script',
      mode: 'no-llm',
      prompt: 'echo credential://dsh/LEAK_CHECK_SECRET',
    };
    const outcomeB = await runner.execute(taskB);
    // Secret was resolved and passed to shell, but output masking redacts it:
    assert.ok(outcomeB.output.includes('[REDACTED_CREDENTIAL]'));
    assert.ok(!outcomeB.output.includes('top-secret-token-abcdef'));

    // Verify task stored in TaskStore still has the reference and zero raw secrets
    const saved = store.set({ ...taskB, status: 'active', schedule: '0 0 * * *' });
    const reloaded = store.get('task-cred-b');
    assert.equal(reloaded.prompt, 'echo credential://dsh/LEAK_CHECK_SECRET');
  });

  await t.test('9. Settings schema includes enableDynamicCredentials in sync keys (#335)', () => {
    assert.ok(SETTINGS_SYNC_KEYS.includes('enableDynamicCredentials'));
  });

  await t.test('10. Documentation and package version synchronization to 0.3.1', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.ok(pkg.version >= '0.3.1', 'package.json version is >= 0.3.1');

    const indexMd = fs.readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
    assert.match(indexMd, /версия `0\.3\.[0-9]+`/, 'index.md states version');
    assert.match(indexMd, /0\.3\.[01]/, 'index.md states previous version');

    const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /релиз `0\.3\.[0-9]+`/, 'AGENTS.md states current release');
    assert.match(agentsMd, /0\.3\.[01]/, 'AGENTS.md states previous release');

    const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 0\.3\.1 \(2026-10-13\)/, 'CHANGELOG.md has 0.3.1 section');
  });
});
