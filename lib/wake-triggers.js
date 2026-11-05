import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { bestEffort } from './best-effort.js';

const DISALLOWED_ROOTS = [
  '/proc',
  '/sys',
  '/dev',
  '/etc',
  '/boot',
  '/run',
  '/var/run',
  'c:\\windows',
  'c:\\windows\\system32',
  'c:\\program files',
  'c:\\program files (x86)',
];

/**
 * Validates that a path does not target sensitive system locations or escape root.
 */
export function isSafeWakePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return { safe: false, error: 'Path must be a non-empty string' };
  }
  const trimmed = targetPath.trim();
  if (trimmed.indexOf('\0') !== -1) {
    return { safe: false, error: 'Path must not contain null bytes' };
  }
  const rawLower = trimmed.toLowerCase().split('\\').join('/');
  if (
    rawLower === 'c:' ||
    rawLower === 'c:/' ||
    rawLower.startsWith('c:/windows') ||
    rawLower.startsWith('c:/program files')
  ) {
    return { safe: false, error: `Path "${targetPath}" targets a disallowed system location` };
  }

  const resolved = path.resolve(trimmed);

  // Filesystem root check ('/' on POSIX, 'C:\' on Windows)
  if (resolved === path.parse(resolved).root) {
    return { safe: false, error: `Path "${resolved}" is a filesystem root` };
  }

  const lower = resolved.toLowerCase().split('\\').join('/');

  for (const root of DISALLOWED_ROOTS) {
    const normRoot = root.toLowerCase().split('\\').join('/');
    const rootWithSlash = normRoot.endsWith('/') ? normRoot : normRoot + '/';
    if (lower === normRoot || lower.startsWith(rootWithSlash)) {
      return { safe: false, error: `Path "${resolved}" targets a disallowed system location` };
    }
  }

  return { safe: true, resolved };
}

/**
 * Normalizes wake trigger configuration. Returns null if invalid or disabled.
 */
export function normalizeWakeTrigger(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const enabled = cfg.enabled !== false;
  const type = String(cfg.type || '').trim().toLowerCase();

  if (!['file_count', 'marker_file', 'process_exit'].includes(type)) {
    return null;
  }

  const normalized = {
    enabled,
    type,
    pollIntervalMs: Math.max(20, Number(cfg.pollIntervalMs) || 3000),
  };

  if (type === 'file_count') {
    normalized.path = String(cfg.path || '').trim();
    normalized.minCount = Math.max(1, parseInt(cfg.minCount, 10) || 1);
    normalized.pattern = String(cfg.pattern || '*').trim() || '*';
  } else if (type === 'marker_file') {
    normalized.markerPath = String(cfg.markerPath || cfg.path || '').trim();
    normalized.consumeMarker = cfg.consumeMarker !== false;
  } else if (type === 'process_exit') {
    if (cfg.pid !== undefined && cfg.pid !== null && cfg.pid !== '') {
      const pidNum = parseInt(cfg.pid, 10);
      if (Number.isInteger(pidNum) && pidNum > 1) {
        normalized.pid = pidNum;
      }
    }
    normalized.pidFile = String(cfg.pidFile || '').trim();
    normalized.consumeMarker = Boolean(cfg.consumeMarker);
    if (!normalized.pid && !normalized.pidFile) {
      return null;
    }
  }

  return normalized;
}

/**
 * Checks if an OS process is currently running.
 */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Matches a filename against a glob pattern (wildcards * and ?, comma-separated).
 */
export function matchPattern(filename, pattern) {
  if (!pattern || pattern.trim() === '' || pattern === '*') return true;
  const parts = pattern.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return true;

  return parts.some((p) => {
    const regexStr = '^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    try {
      return new RegExp(regexStr, 'i').test(filename);
    } catch (_err) {
      void _err;
      return false;
    }
  });
}

/**
 * Counts non-directory files in a directory matching pattern.
 */
export function countMatchingFiles(dir, pattern = '*') {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const matched = [];
    for (const entry of entries) {
      if (entry.isFile() || entry.isSymbolicLink()) {
        if (matchPattern(entry.name, pattern)) {
          matched.push(entry.name);
        }
      }
    }
    return { count: matched.length, files: matched };
  } catch (_err) {
    void _err;
    return { count: 0, files: [] };
  }
}

/**
 * WakeTriggerManager manages background observation and event-driven waking of tasks (#410).
 */
export class WakeTriggerManager {
  constructor(scheduler) {
    this.scheduler = scheduler;
    this.watchers = new Map(); // taskId -> { timer, config, state }
  }

  syncTasks(tasks) {
    if (!Array.isArray(tasks)) return;
    const activeTaskIds = new Set();
    for (const task of tasks) {
      if (task && task.id && task.status === 'active' && task.wakeTrigger) {
        const norm = normalizeWakeTrigger(task.wakeTrigger);
        if (norm && norm.enabled) {
          activeTaskIds.add(task.id);
          this.registerTask(task);
        }
      }
    }

    // Stop watchers for tasks that are no longer active or have no wake trigger
    for (const taskId of this.watchers.keys()) {
      if (!activeTaskIds.has(taskId)) {
        this.unregisterTask(taskId);
      }
    }
  }

  registerTask(task) {
    if (!task || !task.id) return;
    const norm = normalizeWakeTrigger(task.wakeTrigger);

    if (!norm || !norm.enabled || task.status !== 'active') {
      this.unregisterTask(task.id);
      return;
    }

    const current = this.watchers.get(task.id);
    const configSig = JSON.stringify(norm);

    if (current && current.sig === configSig) {
      return; // Already registered with same config
    }

    this.unregisterTask(task.id);

    const state = {
      triggered: false,
      lastCount: 0,
      processSeenAlive: false,
      monitoredPid: norm.pid || null,
    };

    const runCheck = async () => {
      if (!this.scheduler || this.scheduler.isStopped) return;
      try {
        if (norm.type === 'file_count') {
          await this._checkFileCount(task, norm, state);
        } else if (norm.type === 'marker_file') {
          await this._checkMarkerFile(task, norm, state);
        } else if (norm.type === 'process_exit') {
          await this._checkProcessExit(task, norm, state);
        }
      } catch (err) {
        logger.error(`[dsh-cron] Wake trigger check failed for task "${task.title}" (${task.id}): ${err.message}`);
      }
    };

    const timer = setInterval(runCheck, norm.pollIntervalMs);
    if (timer.unref) timer.unref();

    this.watchers.set(task.id, {
      timer,
      sig: configSig,
      config: norm,
      state,
    });

    // Run first check promptly
    setImmediate(runCheck);
    logger.info(`[dsh-cron] Wake trigger (${norm.type}) registered for task "${task.title}" (${task.id})`);
  }

  unregisterTask(taskId) {
    const entry = this.watchers.get(taskId);
    if (entry) {
      if (entry.timer) clearInterval(entry.timer);
      this.watchers.delete(taskId);
    }
  }

  stopAll() {
    for (const entry of this.watchers.values()) {
      if (entry.timer) clearInterval(entry.timer);
    }
    this.watchers.clear();
  }

  async _checkFileCount(task, cfg, state) {
    const check = isSafeWakePath(cfg.path);
    if (!check.safe) return;
    if (!fs.existsSync(check.resolved)) return;

    const { count, files } = countMatchingFiles(check.resolved, cfg.pattern);

    if (count >= cfg.minCount) {
      // Trigger if not triggered yet, or if new files arrived since last trigger
      if (!state.triggered || count > state.lastCount) {
        state.triggered = true;
        state.lastCount = count;
        logger.info(`[dsh-cron] Wake trigger file_count (${count} >= ${cfg.minCount}) fired for task "${task.title}" (${task.id})`);
        await this._triggerTask(task, {
          type: 'file_count',
          path: check.resolved,
          fileCount: count,
          minCount: cfg.minCount,
          pattern: cfg.pattern,
          matchedFiles: files,
        });
      }
    } else {
      // Reset trigger state when file count drops below threshold
      state.triggered = false;
      state.lastCount = count;
    }
  }

  async _checkMarkerFile(task, cfg, state) {
    const check = isSafeWakePath(cfg.markerPath);
    if (!check.safe) return;
    if (!fs.existsSync(check.resolved)) {
      state.triggered = false;
      return;
    }

    if (state.triggered) return; // Wait for marker to disappear / re-appear

    state.triggered = true;

    if (cfg.consumeMarker) {
      try {
        fs.unlinkSync(check.resolved);
      } catch (_err) {
        void _err;
      }
    }

    logger.info(`[dsh-cron] Wake trigger marker_file (${check.resolved}) fired for task "${task.title}" (${task.id})`);
    await this._triggerTask(task, {
      type: 'marker_file',
      markerPath: check.resolved,
      consumed: Boolean(cfg.consumeMarker),
      triggeredAt: Date.now(),
    });
  }

  async _checkProcessExit(task, cfg, state) {
    // If tracking via pidFile, attempt to read PID
    if (cfg.pidFile) {
      const check = isSafeWakePath(cfg.pidFile);
      if (check.safe && fs.existsSync(check.resolved)) {
        try {
          const content = fs.readFileSync(check.resolved, 'utf8').trim();
          const parsed = parseInt(content, 10);
          if (Number.isInteger(parsed) && parsed > 1) {
            state.monitoredPid = parsed;
          }
        } catch (_err) {
          void _err;
        }
      } else {
        // pidFile does not exist yet or was removed
        if (!state.monitoredPid) return;
      }
    }

    if (!state.monitoredPid) return;

    const alive = isProcessAlive(state.monitoredPid);

    if (alive) {
      state.processSeenAlive = true;
    } else if (state.processSeenAlive && !alive) {
      // Process was alive and has now exited!
      const exitedPid = state.monitoredPid;
      state.processSeenAlive = false;
      state.monitoredPid = null;

      if (cfg.consumeMarker && cfg.pidFile) {
        const check = isSafeWakePath(cfg.pidFile);
        if (check.safe && fs.existsSync(check.resolved)) {
          bestEffort('unlink-pid-file', () => fs.unlinkSync(check.resolved));
        }
      }

      logger.info(`[dsh-cron] Wake trigger process_exit (PID ${exitedPid}) fired for task "${task.title}" (${task.id})`);
      await this._triggerTask(task, {
        type: 'process_exit',
        pid: exitedPid,
        pidFile: cfg.pidFile || '',
        exitTime: Date.now(),
      });
    }
  }

  async _triggerTask(task, wakeContext) {
    if (!this.scheduler || this.scheduler.isStopped) return;
    try {
      await this.scheduler.runTask(task.id, {
        wakeTrigger: wakeContext,
        trigger: `wakeTrigger:${wakeContext.type}`,
      });
    } catch (err) {
      logger.error(`[dsh-cron] Wake trigger execution failed for task ${task.id}: ${err.message}`);
    }
  }
}
