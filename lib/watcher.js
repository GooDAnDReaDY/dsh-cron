import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { bestEffort } from './best-effort.js';

const DISALLOWED_ROOTS = [
  '/',
  '/proc',
  '/sys',
  '/dev',
  '/etc',
  '/boot',
  '/run',
  '/var/run',
  'c:\\',
  'c:\\windows',
  'c:\\windows\\system32',
  'c:\\program files',
  'c:\\program files (x86)',
];

/**
 * FileSystemWatcherManager handles fs.watch instances for tasks configured with fileWatch (#327).
 * Provides safe path validation, debounce event filtering, pattern glob matching, and task triggers.
 */
export class FileSystemWatcherManager {
  constructor(scheduler) {
    this.scheduler = scheduler;
    this.watchers = new Map(); // taskId -> { watcher, config, dir }
    this.debounceTimers = new Map(); // `${taskId}:${filename}` -> timer
    this.knownFiles = new Map(); // taskId -> Set(filename)
  }

  isSafePath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      return { safe: false, error: 'Path must be a non-empty string' };
    }
    const resolved = path.resolve(targetPath.trim());
    const lower = resolved.toLowerCase();

    for (const root of DISALLOWED_ROOTS) {
      if (lower === root || lower === root.replace(/\\/g, '/')) {
        return { safe: false, error: `Watched path "${resolved}" is a disallowed system root directory` };
      }
    }

    if (resolved === path.parse(resolved).root) {
      return { safe: false, error: `Watched path "${resolved}" is a filesystem root` };
    }

    return { safe: true, resolved };
  }

  matchPattern(filename, pattern) {
    if (!pattern || pattern.trim() === '' || pattern === '*') return true;
    const parts = pattern.split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return true;

    return parts.some((p) => {
      const regexStr = '^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
      try {
        return new RegExp(regexStr, 'i').test(filename);
      } catch {
        return false;
      }
    });
  }

  watchTask(task) {
    if (!task || !task.id) return;
    const fw = task.fileWatch;

    if (!fw || !fw.enabled || task.status !== 'active') {
      this.unwatchTask(task.id);
      return;
    }

    const check = this.isSafePath(fw.path);
    if (!check.safe) {
      logger.warn(`[dsh-cron] Unsafe fileWatch path for task "${task.title}" (${task.id}): ${check.error}`);
      this.unwatchTask(task.id);
      return;
    }

    const watchDir = check.resolved;
    if (!fs.existsSync(watchDir)) {
      logger.warn(`[dsh-cron] Watched directory does not exist for task "${task.title}" (${task.id}): ${watchDir}`);
      this.unwatchTask(task.id);
      return;
    }

    const current = this.watchers.get(task.id);
    const configSig = JSON.stringify({
      dir: watchDir,
      pattern: fw.pattern || '*',
      events: fw.events || ['create', 'modify'],
      debounceMs: fw.debounceMs || 500,
      recursive: Boolean(fw.recursive),
    });

    if (current && current.sig === configSig) {
      return; // Already watching with exact configuration
    }

    this.unwatchTask(task.id);

    // Initial snapshot of known files in directory
    const known = new Set();
    try {
      const entries = fs.readdirSync(watchDir);
      for (const entry of entries) {
        known.add(entry);
      }
    } catch {
      // ignore readdir errors
    }
    this.knownFiles.set(task.id, known);

    try {
      const watcher = fs.watch(watchDir, { recursive: Boolean(fw.recursive) }, (rawEvent, filename) => {
        if (!filename) return;
        // Ignore dotfiles / temp files unless pattern specifically targets them
        if (filename.startsWith('.') && (!fw.pattern || !fw.pattern.startsWith('.'))) return;

        const debounceMs = Math.max(50, Number(fw.debounceMs) || 500);
        const timerKey = `${task.id}:${filename}`;

        if (this.debounceTimers.has(timerKey)) {
          clearTimeout(this.debounceTimers.get(timerKey));
        }

        const timer = setTimeout(() => {
          this.debounceTimers.delete(timerKey);
          this._handleEvent(task, watchDir, filename, rawEvent);
        }, debounceMs);

        if (timer.unref) timer.unref();
        this.debounceTimers.set(timerKey, timer);
      });

      watcher.on('error', (err) => {
        logger.error(`[dsh-cron] Watcher error for task "${task.title}" (${task.id}): ${err.message}`);
      });

      this.watchers.set(task.id, { watcher, sig: configSig, dir: watchDir });
      logger.info(`[dsh-cron] File watcher active on "${watchDir}" for task "${task.title}" (${task.id})`);
    } catch (err) {
      logger.error(`[dsh-cron] Failed to start file watcher for task "${task.title}" (${task.id}): ${err.message}`);
    }
  }

  _handleEvent(task, watchDir, filename, rawEvent) {
    if (!this.scheduler || this.scheduler.isStopped) return;
    const fw = task.fileWatch || {};
    if (!fw.enabled) return;

    if (!this.matchPattern(filename, fw.pattern)) {
      return;
    }

    const fullFilePath = path.join(watchDir, filename);
    const exists = fs.existsSync(fullFilePath);
    let event = 'modify';
    let fileSize = 0;

    const taskKnown = this.knownFiles.get(task.id) || new Set();

    if (!exists) {
      event = 'delete';
      fileSize = 0;
      taskKnown.delete(filename);
    } else {
      try {
        const stat = fs.statSync(fullFilePath);
        if (stat.isDirectory()) return; // skip directories
        fileSize = stat.size;
        if (taskKnown.has(filename)) {
          event = 'modify';
        } else {
          event = 'create';
          taskKnown.add(filename);
        }
      } catch {
        return; // Stat failed (e.g. temporary file disappeared)
      }
    }

    const allowedEvents = Array.isArray(fw.events) && fw.events.length > 0
      ? fw.events
      : ['create', 'modify'];

    if (!allowedEvents.includes(event)) {
      return;
    }

    logger.info(`[dsh-cron] fileWatch triggered: "${event}" on "${filename}" for task "${task.title}" (${task.id})`);
    this.scheduler.runTask(task.id, {
      filePath: fullFilePath,
      fileName: filename,
      fileSize,
      fileEvent: event,
      trigger: 'fileWatch',
    }).catch((err) => {
      logger.error(`[dsh-cron] File watcher triggered execution error for task ${task.id}: ${err.message}`);
    });
  }

  unwatchTask(taskId) {
    const entry = this.watchers.get(taskId);
    if (entry) {
      bestEffort('watcher-close', () => entry.watcher.close());
      this.watchers.delete(taskId);
    }
    this.knownFiles.delete(taskId);
    for (const [key, timer] of this.debounceTimers.entries()) {
      if (key.startsWith(`${taskId}:`)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }
  }

  stopAll() {
    for (const [taskId] of this.watchers.entries()) {
      this.unwatchTask(taskId);
    }
    this.watchers.clear();
    for (const [, timer] of this.debounceTimers.entries()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.knownFiles.clear();
  }

  syncAll(tasks = []) {
    const activeTaskIds = new Set();
    for (const task of tasks) {
      if (task && task.id && task.status === 'active' && task.fileWatch?.enabled) {
        activeTaskIds.add(task.id);
        this.watchTask(task);
      }
    }
    for (const [taskId] of this.watchers.entries()) {
      if (!activeTaskIds.has(taskId)) {
        this.unwatchTask(taskId);
      }
    }
  }
}
