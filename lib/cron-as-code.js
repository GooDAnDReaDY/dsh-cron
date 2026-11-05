import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { bestEffort } from './best-effort.js';

/**
 * Lightweight, robust parser for .dsh/cron.yaml, .dsh/cron.yml, and .dsh/cron.json files (#416).
 * Handles JSON and standard task list YAML without external dependencies.
 */
export function parseCronAsCode(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return { tasks: [] };
  const trimmed = rawContent.trim();
  if (!trimmed) return { tasks: [] };

  // 1. Try standard JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return { tasks: parsed };
      if (parsed && Array.isArray(parsed.tasks)) return parsed;
      return { tasks: [] };
    } catch (_err) {
      void _err;
    }
  }

  // 2. Simple, resilient YAML parser for task documents
  const lines = trimmed.split(/\r?\n/);
  const tasks = [];
  let currentTask = null;
  let inTasksSection = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    if (line.match(/^tasks\s*:/i)) {
      inTasksSection = true;
      continue;
    }

    const itemMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (itemMatch) {
      if (currentTask) tasks.push(currentTask);
      currentTask = {};
      const rest = itemMatch[2].trim();
      if (rest) {
        const kv = parseYamlKeyValue(rest);
        if (kv) currentTask[kv.key] = kv.value;
      }
      continue;
    }

    if (currentTask) {
      const kv = parseYamlKeyValue(line.trim());
      if (kv) {
        currentTask[kv.key] = kv.value;
      }
    }
  }

  if (currentTask) tasks.push(currentTask);
  return { tasks };
}

function parseYamlKeyValue(line) {
  const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
  if (!match) return null;
  const key = match[1].trim();
  let valStr = match[2].trim();

  // Strip wrapping quotes
  if ((valStr.startsWith('"') && valStr.endsWith('"')) || (valStr.startsWith("'") && valStr.endsWith("'"))) {
    valStr = valStr.slice(1, -1);
    return { key, value: valStr };
  }

  if (valStr.toLowerCase() === 'true') return { key, value: true };
  if (valStr.toLowerCase() === 'false') return { key, value: false };
  if (/^-?\d+$/.test(valStr)) return { key, value: parseInt(valStr, 10) };
  if (/^-?\d+\.\d+$/.test(valStr)) return { key, value: parseFloat(valStr) };

  return { key, value: valStr };
}

/**
 * Reconciles tasks declared in a workspace with the store (#416).
 */
export function reconcileWorkspaceCronTasks(store, workspaceId, declaredTasks = []) {
  if (!store || !workspaceId) return { created: 0, updated: 0, deleted: 0 };

  const currentTasks = store.list ? store.list() : (store.tasks ? Object.values(store.tasks) : []);
  const existingManaged = new Map();

  for (const t of currentTasks) {
    if (t && t.workspaceId === workspaceId && t.managedBy === 'cron_as_code') {
      existingManaged.set(t.id, t);
    }
  }

  let created = 0;
  let updated = 0;
  let deleted = 0;
  const seenIds = new Set();

  for (const decl of declaredTasks) {
    if (!decl || typeof decl !== 'object') continue;
    const rawId = decl.id || decl.name || Math.random().toString(36).slice(2, 9);
    const taskId = `cac_${workspaceId}_${rawId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    seenIds.add(taskId);

    const taskType = decl.type || (decl.command ? 'script' : 'llm');
    const taskPrompt = decl.prompt !== undefined ? decl.prompt : (decl.command || '');

    const taskRecord = {
      ...decl,
      id: taskId,
      title: decl.title || decl.name || rawId,
      schedule: decl.schedule || '0 0 * * *',
      status: decl.status || 'active',
      workspaceId,
      managedBy: 'cron_as_code',
      origin: '.dsh/cron.yaml',
      type: taskType,
      prompt: taskPrompt,
    };

    if (existingManaged.has(taskId)) {
      const existing = existingManaged.get(taskId);
      store.set({ ...existing, ...taskRecord });
      updated++;
    } else {
      store.set(taskRecord);
      created++;
    }
  }

  // Delete tasks removed from declaration
  for (const [id, oldTask] of existingManaged.entries()) {
    if (!seenIds.has(id)) {
      if (typeof store.delete === 'function') {
        store.delete(id);
      } else {
        oldTask.status = 'completed';
        store.set(oldTask);
      }
      deleted++;
    }
  }

  return { created, updated, deleted };
}

/**
 * CronAsCodeManager observes workspace directories and auto-synchronizes .dsh/cron.yaml files (#416).
 */
export class CronAsCodeManager {
  constructor(scheduler) {
    this.scheduler = scheduler;
    this.watchers = new Map(); // workspaceId -> { watcher, filePath }
  }

  findConfigFile(workspaceDir) {
    if (!workspaceDir || typeof workspaceDir !== 'string') return null;
    const candidates = [
      path.join(workspaceDir, '.dsh', 'cron.yaml'),
      path.join(workspaceDir, '.dsh', 'cron.yml'),
      path.join(workspaceDir, '.dsh', 'cron.json'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  syncWorkspace(workspaceId, workspaceDir) {
    if (!workspaceId || !workspaceDir || !this.scheduler) return null;
    const filePath = this.findConfigFile(workspaceDir);

    if (!filePath) {
      this.unwatchWorkspace(workspaceId);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { tasks } = parseCronAsCode(content);
      const res = reconcileWorkspaceCronTasks(this.scheduler.store, workspaceId, tasks);
      logger.info(`[dsh-cron] Cron-as-Code synchronized "${filePath}" for workspace ${workspaceId}: +${res.created} ~${res.updated} -${res.deleted}`);

      // Arm watcher if not already watching this file
      const current = this.watchers.get(workspaceId);
      if (!current || current.filePath !== filePath) {
        this.unwatchWorkspace(workspaceId);
        try {
          const watcher = fs.watch(filePath, (event) => {
            if (event === 'change') {
              this.syncWorkspace(workspaceId, workspaceDir);
            }
          });
          this.watchers.set(workspaceId, { watcher, filePath });
        } catch (_err) {
          void _err;
        }
      }

      return res;
    } catch (err) {
      logger.error(`[dsh-cron] Failed to read Cron-as-Code file "${filePath}": ${err.message}`);
      return null;
    }
  }

  unwatchWorkspace(workspaceId) {
    const entry = this.watchers.get(workspaceId);
    if (entry && entry.watcher) {
      bestEffort('cron-as-code-unwatch', () => entry.watcher.close());
      this.watchers.delete(workspaceId);
    }
  }

  stopAll() {
    for (const entry of this.watchers.values()) {
      bestEffort('cron-as-code-stop', () => entry.watcher.close());
    }
    this.watchers.clear();
  }
}
