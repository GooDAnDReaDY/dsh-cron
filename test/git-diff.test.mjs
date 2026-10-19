import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  isGitRepository,
  parsePorcelainStatus,
  parseGitStatSummary,
  captureGitDiff,
  discardGitChanges,
  applyGitDiff,
} from '../lib/git-diff.js';

const execFileAsync = promisify(execFile);

test('Git Diff (#351) - parsePorcelainStatus and parseGitStatSummary extract metrics', () => {
  const porcelain = [
    ' M src/index.js',
    'A  docs/readme.md',
    ' D legacy.txt',
    '?? new-file.sh',
  ].join('\n');

  const files = parsePorcelainStatus(porcelain);
  assert.equal(files.length, 4);
  assert.equal(files[0].status, 'modified');
  assert.equal(files[1].status, 'added');
  assert.equal(files[2].status, 'deleted');
  assert.equal(files[3].status, 'added');

  const stat = ' 3 files changed, 25 insertions(+), 4 deletions(-)\n';
  const summary = parseGitStatSummary(stat);
  assert.equal(summary.filesCount, 3);
  assert.equal(summary.insertions, 25);
  assert.equal(summary.deletions, 4);
});

test('Git Diff (#351) - captureGitDiff, discardGitChanges, and applyGitDiff in real git workspace', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `dsh-cron-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  t.after(async () => {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  // 1. Initialize temporary git repo
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.name', 'TestAgent'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.email', 'test@agent.local'], { cwd: tmpDir });

  assert.equal(await isGitRepository(tmpDir), true);

  const initFile = path.join(tmpDir, 'file.txt');
  await fs.writeFile(initFile, 'Line 1\nLine 2\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });

  // 2. Initial clean state has no diff
  const cleanCapture = await captureGitDiff(tmpDir);
  assert.equal(cleanCapture.hasChanges, false);

  // 3. Make modifications and verify captureGitDiff
  await fs.writeFile(initFile, 'Line 1\nLine 2 modified\nLine 3 added\n', 'utf8');
  const modCapture = await captureGitDiff(tmpDir);
  assert.equal(modCapture.hasChanges, true);
  assert.equal(modCapture.files.length, 1);
  assert.ok(modCapture.diff.includes('+Line 2 modified'));
  assert.ok(modCapture.diff.includes('-Line 2'));

  const savedDiff = modCapture.diff;

  // 4. Discard changes
  const discardRes = await discardGitChanges(tmpDir);
  assert.equal(discardRes.ok, true);

  const postDiscardCapture = await captureGitDiff(tmpDir);
  assert.equal(postDiscardCapture.hasChanges, false);
  const revertedContent = await fs.readFile(initFile, 'utf8');
  assert.equal(revertedContent, 'Line 1\nLine 2\n');

  // 5. Apply saved diff back
  const applyRes = await applyGitDiff(tmpDir, savedDiff);
  assert.equal(applyRes.ok, true);

  const postApplyCapture = await captureGitDiff(tmpDir);
  assert.equal(postApplyCapture.hasChanges, true);
  const reAppliedContent = await fs.readFile(initFile, 'utf8');
  assert.ok(reAppliedContent.includes('Line 2 modified'));
});
