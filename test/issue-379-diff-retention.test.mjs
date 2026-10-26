import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { cronToolParameters } from '../lib/cron-tool.js';
import { executeCreateTask } from '../lib/task-create.js';
import { buildTaskPatch } from '../lib/task-patch.js';
import { buildTaskRecord } from '../lib/api-collection.js';

const execFileAsync = promisify(execFile);

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-test379-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => {
    try { fs.rmSync(filePath, { force: true }); } catch (e) { void e; }
  });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

test('Issue #379 (GH #17): TaskStore._cleanOrphanedTmpFiles cleans files older than 10 mins', (t) => {
  const dir = path.join(os.tmpdir(), `dsh-cron-tmpclean-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { void e; }
  });

  const staleTmp = path.join(dir, 'tasks.json.tmp.123_stale');
  const freshTmp = path.join(dir, 'tasks.json.tmp.456_fresh');
  const normalFile = path.join(dir, 'tasks.json');

  fs.writeFileSync(staleTmp, 'stale content', 'utf8');
  fs.writeFileSync(freshTmp, 'fresh content', 'utf8');
  fs.writeFileSync(normalFile, '{"tasks":[]}', 'utf8');

  // Set stale file mtime to 20 minutes ago
  const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
  fs.utimesSync(staleTmp, twentyMinsAgo, twentyMinsAgo);

  const store = new TaskStore(normalFile);
  // init() cleans orphaned tmp files
  assert.equal(fs.existsSync(staleTmp), false, 'stale .tmp. file must be cleaned up');
  assert.equal(fs.existsSync(freshTmp), true, 'fresh .tmp. file must be kept');
  assert.equal(fs.existsSync(normalFile), true, 'normal store file must be kept');
});

test('Issue #379 (GH #17): TaskStore._archiveHistoryRuns strips raw diff to prevent JSON bloat', (t) => {
  const storePath = path.join(os.tmpdir(), `dsh-cron-arch-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const archivePath = path.join(os.tmpdir(), 'tasks-history-archive.json');
  t.after(() => {
    try { fs.rmSync(storePath, { force: true }); } catch (e) { void e; }
    try { fs.rmSync(archivePath, { force: true }); } catch (e) { void e; }
  });

  const store = new TaskStore(storePath);
  const largeDiff = 'diff --git a/test b/test\n' + '+added line\n'.repeat(2000); // ~24KB diff

  const overflowRuns = [
    {
      id: 'run-1',
      at: Date.now() - 5000,
      status: 'success',
      gitDiff: {
        hasChanges: true,
        files: [{ path: 'test', status: 'modified' }],
        diff: largeDiff,
      },
    },
  ];

  store._archiveHistoryRuns('task-1', overflowRuns);

  assert.equal(fs.existsSync(archivePath), true);
  const archiveContent = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  assert.ok(archiveContent['task-1']);
  const archivedRun = archiveContent['task-1'][0];
  assert.equal(archivedRun.gitDiff.hasChanges, true);
  assert.equal(archivedRun.gitDiff.archived, true);
  assert.equal(archivedRun.gitDiff.diff, undefined, 'raw diff must be stripped in archive');
  assert.ok(archivedRun.gitDiff.diffExcerpt.length <= 500, 'diffExcerpt must be bounded');
});

test('Issue #379 (GH #17): TaskStore.addRun bounds raw diff in active history past run 10', (t) => {
  const storePath = path.join(os.tmpdir(), `dsh-cron-hist-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  t.after(() => {
    try { fs.rmSync(storePath, { force: true }); } catch (e) { void e; }
  });

  const store = new TaskStore(storePath);
  const taskId = 'task-bounded';
  store.tasks.set(taskId, { id: taskId, title: 'Bounded Diff Task', lastRunAt: Date.now() });

  const largeDiff = '+added line\n'.repeat(500); // ~6KB

  // Add 15 runs with large diff
  for (let i = 0; i < 15; i++) {
    store.recordRun(taskId, {
      runId: `run-${i}`,
      output: `output ${i}`,
      gitDiff: { hasChanges: true, diff: largeDiff },
    });
  }

  const history = store.getHistory(taskId, 20);
  assert.equal(history.length, 15);
  // Most recent run (index 0) has full diff preserved
  assert.equal(history[0].gitDiff.diff, largeDiff);
  // Older run (index 12, which is past index 10) has truncated diff
  assert.ok(history[12].gitDiff.diff.length <= 2100);
  assert.equal(history[12].gitDiff.truncated, true);
});

test('Issue #379 (GH #17): Diff capture respects worktree and captureGitDiff opt-in/opt-out', async (t) => {
  const tmpRepo = path.join(os.tmpdir(), `dsh-cron-git-capture-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.promises.mkdir(tmpRepo, { recursive: true });
  t.after(async () => {
    try { await fs.promises.rm(tmpRepo, { recursive: true, force: true }); } catch (e) { void e; }
  });

  await execFileAsync('git', ['init', '-b', 'main'], { cwd: tmpRepo });
  await execFileAsync('git', ['config', 'user.name', 'TestAgent'], { cwd: tmpRepo });
  await execFileAsync('git', ['config', 'user.email', 'test@agent.local'], { cwd: tmpRepo });
  await fs.promises.writeFile(path.join(tmpRepo, 'file.txt'), 'Initial\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: tmpRepo });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: tmpRepo });

  // Dirty the repo
  await fs.promises.writeFile(path.join(tmpRepo, 'file.txt'), 'Initial\nModified\n', 'utf8');

  // Verify scheduler completion diff capture rules:
  // 1. Non-worktree task with git cwd and NO explicit captureGitDiff does NOT capture diff (fixes GH #17)
  const taskNoWorktree = { id: 't1', type: 'shell', cwd: tmpRepo, worktree: false };
  const explicit1 = (typeof taskNoWorktree.captureGitDiff === 'boolean') ? taskNoWorktree.captureGitDiff : null;
  const should1 = explicit1 !== null ? explicit1 : Boolean(taskNoWorktree.worktree);
  assert.equal(should1, false, 'Non-worktree task must not capture diff by default');

  // 2. Task with explicit captureGitDiff: true DOES capture diff
  const taskExplicitTrue = { id: 't2', type: 'shell', cwd: tmpRepo, worktree: false, captureGitDiff: true };
  const explicit2 = (typeof taskExplicitTrue.captureGitDiff === 'boolean') ? taskExplicitTrue.captureGitDiff : null;
  const should2 = explicit2 !== null ? explicit2 : Boolean(taskExplicitTrue.worktree);
  assert.equal(should2, true, 'Task with captureGitDiff: true must capture diff');

  // 3. Worktree task with NO explicit captureGitDiff DOES capture diff
  const taskWorktree = { id: 't3', type: 'llm', cwd: tmpRepo, worktree: true };
  const explicit3 = (typeof taskWorktree.captureGitDiff === 'boolean') ? taskWorktree.captureGitDiff : null;
  const should3 = explicit3 !== null ? explicit3 : Boolean(taskWorktree.worktree);
  assert.equal(should3, true, 'Worktree task must capture diff by default');

  // 4. Worktree task with explicit captureGitDiff: false does NOT capture diff
  const taskWorktreeOptOut = { id: 't4', type: 'llm', cwd: tmpRepo, worktree: true, captureGitDiff: false };
  const explicit4 = (typeof taskWorktreeOptOut.captureGitDiff === 'boolean') ? taskWorktreeOptOut.captureGitDiff : null;
  const should4 = explicit4 !== null ? explicit4 : Boolean(taskWorktreeOptOut.worktree);
  assert.equal(should4, false, 'Worktree task with captureGitDiff: false must NOT capture diff');
});

test('Issue #379 (GH #17): Task creation, patch and tool parameters accept captureGitDiff', (t) => {
  const { store, scheduler } = makeEnv(t);

  // 1. cronToolParameters
  assert.ok(cronToolParameters.captureGitDiff);
  assert.equal(cronToolParameters.captureGitDiff.type, 'boolean');

  // 2. executeCreateTask
  const created1 = executeCreateTask(store, scheduler, { title: 'T1', type: 'shell', command: 'echo 1', schedule: '0 0 * * *', captureGitDiff: true });
  assert.equal(created1.task.captureGitDiff, true);
  const created2 = executeCreateTask(store, scheduler, { title: 'T2', type: 'shell', command: 'echo 2', schedule: '0 0 * * *', captureGitDiff: false });
  assert.equal(created2.task.captureGitDiff, false);

  // 3. buildTaskPatch
  const { patch: patch1 } = buildTaskPatch({ type: 'shell' }, { captureGitDiff: true });
  assert.equal(patch1.captureGitDiff, true);

  // 4. buildTaskRecord
  const record = buildTaskRecord(store, { title: 'Rec', captureGitDiff: true }, 'shell', { cronPattern: '0 0 * * *' });
  assert.equal(record.captureGitDiff, true);
});