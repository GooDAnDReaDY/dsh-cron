import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';

import fs from 'node:fs';

/**
 * Resolve the working directory for a task: explicit cwd, a bound
 * workspace id resolved through the harness, or the process cwd (#31).
 */
export function resolveCwd(task, ctx = null) {
  if (task.cwd) return String(task.cwd);
  if (task.workspaceId) {
    const rawId = String(task.workspaceId).trim();
    if (ctx) {
      const resolved = bestEffort('resolve-workspace-path', () => {
        // Issue #363 / GH #12: host workspace service is 'workspaceRegistry' in DeepSeek Harness
        const registry =
          (typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : null) ||
          ctx.workspaceRegistry ||
          (typeof ctx.get === 'function' ? ctx.get('workspaces') : null) ||
          ctx.workspaces;

        if (registry) {
          // 1. Direct get(id) lookup on WorkspaceRegistry
          if (typeof registry.get === 'function') {
            const ws = registry.get(rawId);
            if (ws && ws.path) return String(ws.path);
          }
          // 2. List lookup if ID, title, or Path was provided ("Workspace id or path")
          if (typeof registry.list === 'function') {
            const list = registry.list();
            if (Array.isArray(list)) {
              const matched = list.find((w) => w && (w.id === rawId || w.path === rawId || w.title === rawId));
              if (matched && matched.path) return String(matched.path);
            }
          }
        }
        return null;
      });
      if (resolved) return resolved;
    }

    // 3. Fallback: if task.workspaceId directly points to an existing directory path on disk
    try {
      if (fs.existsSync(rawId) && fs.statSync(rawId).isDirectory()) {
        return rawId;
      }
    } catch (_fsErr) {
      // ignore filesystem stat error
    }

    // Issue #231: fail-closed if workspaceId was specified but cannot be resolved
    throw new Error(`Workspace "${task.workspaceId}" requested by task could not be resolved`);
  }
  return process.cwd();
}

/**
 * Create an isolated git worktree for a run when task.worktree is requested (#29).
 * Returns the directory path of the worktree.
 */
export async function createTaskWorktree(cwd, task) {
  const { execFile } = await import('node:child_process');
  const { randomUUID } = await import('node:crypto');
  const branch = `cron-${task.id}-${randomUUID().slice(0, 8)}`;
  const wtPath = `${cwd}/.worktrees/${branch}`;
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, 'worktree', 'add', '-b', branch, wtPath, 'HEAD'], (err) => {
      if (err) return reject(new Error(`Failed to create worktree: ${err.message}`));
      resolve(wtPath);
    });
  });
}

/**
 * Clean up the isolated worktree after execution unless keepWorktree is set (#29).
 * Uses best-effort removal without forcing, followed by git worktree prune.
 */
export async function removeTaskWorktree(cwd, wtPath) {
  const { execFile } = await import('node:child_process');
  await new Promise((resolve) => {
    execFile('git', ['-C', cwd, 'worktree', 'remove', wtPath], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        logger.warn(`[dsh-cron] task worktree kept (not removable without force): ${wtPath} — ${String(stderr || err.message).trim()}`);
      }
      execFile('git', ['-C', cwd, 'worktree', 'prune'], () => resolve());
    });
  });
}

