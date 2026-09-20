import { bestEffort } from './best-effort.js';

/**
 * Resolve the working directory for a task: explicit cwd, a bound
 * workspace id resolved through the harness, or the process cwd (#31).
 */
export function resolveCwd(task, ctx = null) {
  if (task.cwd) return String(task.cwd);
  if (task.workspaceId && ctx && typeof ctx.get === 'function') {
    const resolved = bestEffort('resolve-workspace-path', () => {
      const workspaces = ctx.get('workspaces');
      if (workspaces && typeof workspaces.get === 'function') {
        const ws = workspaces.get(task.workspaceId);
        return ws && ws.path ? String(ws.path) : null;
      }
      return null;
    });
    if (resolved) return resolved;
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
        console.warn(`[dsh-cron] task worktree kept (not removable without force): ${wtPath} — ${String(stderr || err.message).trim()}`);
      }
      execFile('git', ['-C', cwd, 'worktree', 'prune'], () => resolve());
    });
  });
}

