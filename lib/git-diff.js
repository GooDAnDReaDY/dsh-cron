/**
 * Git Diff and Patch Review Engine (#351)
 *
 * Provides safe collection, parsing, inspection, and manipulation of Git diffs
 * generated during task execution (e.g. scripts modifying workspace or worktree).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export const MAX_DIFF_SIZE = 256 * 1024; // 256 KiB safety ceiling

/**
 * Checks if a given directory is inside a git working tree.
 *
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
export async function isGitRepository(cwd) {
  if (!cwd) return false;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      timeout: 3000,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Parses git status --porcelain output into structured file items.
 *
 * @param {string} porcelainOutput
 * @returns {Array<Object>}
 */
export function parsePorcelainStatus(porcelainOutput) {
  if (!porcelainOutput || typeof porcelainOutput !== 'string') return [];
  const lines = porcelainOutput.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const files = [];

  for (const line of lines) {
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const filePath = line.slice(3).trim();

    let status = 'modified';
    if (x === 'A' || y === 'A' || (x === '?' && y === '?')) status = 'added';
    else if (x === 'D' || y === 'D') status = 'deleted';
    else if (x === 'R' || y === 'R') status = 'renamed';

    files.push({
      path: filePath,
      rawCode: `${x}${y}`.trim(),
      status,
    });
  }

  return files;
}

/**
 * Parses git diff --stat output into structured totals.
 *
 * @param {string} statOutput
 * @returns {{ filesCount: number, insertions: number, deletions: number }}
 */
export function parseGitStatSummary(statOutput) {
  if (!statOutput || typeof statOutput !== 'string') {
    return { filesCount: 0, insertions: 0, deletions: 0 };
  }

  const match = statOutput.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i);
  if (!match) {
    return { filesCount: 0, insertions: 0, deletions: 0 };
  }

  return {
    filesCount: Number(match[1] || 0),
    insertions: Number(match[2] || 0),
    deletions: Number(match[3] || 0),
  };
}

/**
 * Captures the current Git diff in the specified directory.
 *
 * @param {string} cwd Target repository directory
 * @param {Object} [options]
 * @param {number} [options.maxSize=262144] Maximum diff size before truncation
 * @returns {Promise<Object>} { hasChanges: boolean, stat: string, diff: string, files: Array, summary: Object, truncated: boolean }
 */
export async function captureGitDiff(cwd, { maxSize = MAX_DIFF_SIZE } = {}) {
  if (!cwd) {
    return { hasChanges: false, error: 'No working directory specified' };
  }

  const isRepo = await isGitRepository(cwd);
  if (!isRepo) {
    return { hasChanges: false, isRepo: false };
  }

  try {
    // 1. Check if there are any changes
    const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], { cwd, timeout: 5000 });
    const cleanStatus = statusOut.trim();
    if (!cleanStatus) {
      return { hasChanges: false, stat: '', diff: '', files: [], summary: { filesCount: 0, insertions: 0, deletions: 0 } };
    }

    const files = parsePorcelainStatus(cleanStatus);

    // 2. Fetch diff stat
    let stat = '';
    try {
      const { stdout: statOut } = await execFileAsync('git', ['diff', '--stat', 'HEAD'], { cwd, timeout: 5000 });
      stat = statOut.trim();
    } catch {
      // Fallback without HEAD (e.g. unborn branch)
      try {
        const { stdout: statOut } = await execFileAsync('git', ['diff', '--stat'], { cwd, timeout: 5000 });
        stat = statOut.trim();
      } catch {
        stat = `${files.length} file(s) changed`;
      }
    }

    const summary = parseGitStatSummary(stat);
    if (summary.filesCount === 0 && files.length > 0) {
      summary.filesCount = files.length;
    }

    // 3. Fetch full unified diff
    let rawDiff = '';
    try {
      const { stdout: diffOut } = await execFileAsync('git', ['diff', 'HEAD'], { cwd, timeout: 8000, maxBuffer: 10 * 1024 * 1024 });
      rawDiff = diffOut;
    } catch {
      try {
        const { stdout: diffOut } = await execFileAsync('git', ['diff'], { cwd, timeout: 8000, maxBuffer: 10 * 1024 * 1024 });
        rawDiff = diffOut;
      } catch (err) {
        rawDiff = `[Diff unavailable: ${err.message}]`;
      }
    }

    let truncated = false;
    let diff = rawDiff;
    if (Buffer.byteLength(diff, 'utf8') > maxSize) {
      diff = diff.slice(0, maxSize) + '\n\n[... Diff truncated: exceeds 256 KiB limit ...]';
      truncated = true;
    }

    return {
      hasChanges: true,
      isRepo: true,
      stat,
      diff,
      files,
      summary,
      truncated,
    };
  } catch (err) {
    return {
      hasChanges: false,
      error: err.message || String(err),
    };
  }
}

/**
 * Discards all uncommitted changes (tracked and untracked) in the target git directory.
 *
 * @param {string} cwd Target repository directory
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function discardGitChanges(cwd) {
  if (!cwd) return { ok: false, error: 'No working directory specified' };
  const isRepo = await isGitRepository(cwd);
  if (!isRepo) return { ok: false, error: 'Not a git repository' };

  try {
    // Reset tracked modifications
    await execFileAsync('git', ['reset', '--hard', 'HEAD'], { cwd, timeout: 10000 });
    // Clean untracked files and directories
    await execFileAsync('git', ['clean', '-fd'], { cwd, timeout: 10000 });
    return { ok: true, discarded: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Applies a git patch string to the target repository directory.
 *
 * @param {string} cwd Target repository directory
 * @param {string} patchContent Unified diff / patch text
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function applyGitDiff(cwd, patchContent) {
  if (!cwd || !patchContent) return { ok: false, error: 'Missing directory or patch content' };
  const isRepo = await isGitRepository(cwd);
  if (!isRepo) return { ok: false, error: 'Not a git repository' };

  const tmpPath = path.join(os.tmpdir(), `dsh-cron-patch-${Date.now()}-${Math.random().toString(36).slice(2)}.diff`);
  try {
    await fs.writeFile(tmpPath, patchContent, 'utf8');
    await execFileAsync('git', ['apply', '--whitespace=fix', tmpPath], { cwd, timeout: 10000 });
    return { ok: true, applied: true };
  } catch (err) {
    return { ok: false, error: `Failed to apply git diff: ${err.message || err}` };
  } finally {
    try {
      await fs.unlink(tmpPath);
    } catch (_e) {
      /* ignore temp file cleanup error */
    }
  }
}
