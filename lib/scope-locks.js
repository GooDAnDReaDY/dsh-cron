// @ts-check
import path from 'node:path';

/**
 * Normalize an array or string of relative scopes.
 * Leading slashes or './' are stripped, backslashes replaced with '/',
 * trailing slashes removed (except root), empty strings filtered.
 *
 * @param {string[]|string|null|undefined} scopes
 * @returns {string[]}
 */
export function normalizeScopes(scopes) {
  if (!scopes) return [];
  const list = Array.isArray(scopes)
    ? scopes
    : String(scopes).split(/[\n,]+/).map((s) => s.trim());

  const result = new Set();
  for (let s of list) {
    if (!s || typeof s !== 'string') continue;
    let norm = s.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    norm = norm.replace(/\/+$/, '');
    if (norm.length > 0) {
      result.add(norm);
    }
  }
  return Array.from(result);
}

/**
 * Check if two path scopes overlap.
 * Overlap means:
 * - A is equal to B ('src' === 'src')
 * - A is parent of B ('src' is parent of 'src/components')
 * - B is parent of A ('src/components' has parent 'src')
 * - Either is root '.' or '*'
 *
 * @param {string} scopeA
 * @param {string} scopeB
 * @returns {boolean}
 */
export function scopesOverlap(scopeA, scopeB) {
  if (!scopeA || !scopeB) return false;
  const a = scopeA.replace(/\/+$/, '');
  const b = scopeB.replace(/\/+$/, '');
  if (a === '.' || a === '*' || b === '.' || b === '*') return true;
  if (a === b) return true;
  if (b.startsWith(a + '/')) return true;
  if (a.startsWith(b + '/')) return true;
  return false;
}

/**
 * Check if any scope in scopes1 overlaps with any scope in scopes2.
 *
 * @param {string[]|string} scopes1
 * @param {string[]|string} scopes2
 * @returns {{ conflict: true, scopeA: string, scopeB: string } | null}
 */
export function hasScopeConflict(scopes1, scopes2) {
  const norm1 = normalizeScopes(scopes1);
  const norm2 = normalizeScopes(scopes2);
  if (norm1.length === 0 || norm2.length === 0) return null;
  for (const s1 of norm1) {
    for (const s2 of norm2) {
      if (scopesOverlap(s1, s2)) {
        return { conflict: true, scopeA: s1, scopeB: s2 };
      }
    }
  }
  return null;
}

/**
 * ScopeLockManager
 * Tracks active write scopes per workspace to prevent concurrent conflicts.
 */
export class ScopeLockManager {
  constructor() {
    /** @type {Map<string, Map<string, Set<string>>>} */
    this.locks = new Map();
  }

  /**
   * Determine key for scoping (workspaceId or cwd).
   *
   * @param {any} task
   * @returns {string}
   */
  getWorkspaceKey(task) {
    if (task?.workspaceId && String(task.workspaceId).trim()) {
      return 'ws:' + String(task.workspaceId).trim();
    }
    if (task?.cwd && String(task.cwd).trim()) {
      return 'cwd:' + path.normalize(String(task.cwd).trim());
    }
    return 'default';
  }

  /**
   * Check if task writeScopes can be acquired without conflict.
   *
   * @param {any} task
   * @param {string} taskId
   * @returns {{ ok: true } | { ok: false, conflictTaskId: string, conflictingScope: string, heldScope: string, workspaceKey: string }}
   */
  canAcquire(task, taskId) {
    const scopes = normalizeScopes(task?.writeScopes);
    if (scopes.length === 0) return { ok: true };

    // Isolated worktrees don't conflict with main workspace files
    if (task?.worktree) return { ok: true };

    const wsKey = this.getWorkspaceKey(task);
    const activeTasks = this.locks.get(wsKey);
    if (!activeTasks || activeTasks.size === 0) return { ok: true };

    for (const [activeTaskId, activeScopes] of activeTasks.entries()) {
      if (activeTaskId === taskId) continue;
      const conflict = hasScopeConflict(scopes, Array.from(activeScopes));
      if (conflict) {
        return {
          ok: false,
          conflictTaskId: activeTaskId,
          conflictingScope: conflict.scopeA,
          heldScope: conflict.scopeB,
          workspaceKey: wsKey,
        };
      }
    }
    return { ok: true };
  }

  /**
   * Register active write scopes for a running task.
   *
   * @param {any} task
   * @param {string} taskId
   * @returns {boolean}
   */
  acquire(task, taskId) {
    const scopes = normalizeScopes(task?.writeScopes);
    if (scopes.length === 0 || task?.worktree) return true;

    const wsKey = this.getWorkspaceKey(task);
    if (!this.locks.has(wsKey)) {
      this.locks.set(wsKey, new Map());
    }
    this.locks.get(wsKey).set(taskId, new Set(scopes));
    return true;
  }

  /**
   * Release active write scopes when a task finishes.
   *
   * @param {any} task
   * @param {string} taskId
   */
  release(task, taskId) {
    const wsKey = this.getWorkspaceKey(task);
    const activeTasks = this.locks.get(wsKey);
    if (activeTasks) {
      activeTasks.delete(taskId);
      if (activeTasks.size === 0) {
        this.locks.delete(wsKey);
      }
    }
  }

  /**
   * Get active locks for inspection.
   *
   * @param {string} workspaceKey
   * @returns {Array<{ taskId: string, scopes: string[] }>}
   */
  getActiveScopes(workspaceKey) {
    const activeTasks = this.locks.get(workspaceKey);
    if (!activeTasks) return [];
    const all = [];
    for (const [taskId, scopes] of activeTasks.entries()) {
      all.push({ taskId, scopes: Array.from(scopes) });
    }
    return all;
  }

  clear() {
    this.locks.clear();
  }
}
