import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';
import { Cron } from 'croner';
import { FileSystemWatcherManager } from '../watcher.js';
import { parseNaturalSchedule } from '../nl-schedule.js';
import { ScopeLockManager } from '../scope-locks.js';
import { WakeTriggerManager } from '../wake-triggers.js';
import { CronAsCodeManager } from '../cron-as-code.js';

const MAX_TIMEOUT_MS = 2147483647; // 2^31 - 1 ms (~24.85 days)
import {
  AGENT_TASK_TYPES,
  addUsage,
  executePreflight,
  shouldUseFallback,
  executeOnce,
  executeWithFallback,
  beginRun,
  executeTask,
  inspectFailureRun,
  applySilentRuleToRun,
  applyModelAssists,
  deliverNotifications,
  finishRun,
  handleCompleteRun,
} from './scheduler-execution.js';
import {
  startHeartbeatWatcher,
  stopHeartbeatWatcher,
  checkHeartbeats,
  pauseTask,
  removeTask,
  resumeTask,
  toggleTask,
  handleStopAll,
  handleClearScheduled,
} from './scheduler-lifecycle.js';

import {
  describeCron,
  parseScheduleExpression,
  previewSchedule,
} from './scheduler-parser.js';

export {
  describeCron,
  parseScheduleExpression,
  previewSchedule,
  parseNaturalSchedule,
  executePreflight,
  AGENT_TASK_TYPES,
  addUsage,
  shouldUseFallback,
  executeOnce,
  executeWithFallback,
  beginRun,
  executeTask,
  inspectFailureRun,
  applySilentRuleToRun,
  applyModelAssists,
  deliverNotifications,
  finishRun,
  handleCompleteRun,
  startHeartbeatWatcher,
  stopHeartbeatWatcher,
  checkHeartbeats,
  pauseTask,
  removeTask,
  resumeTask,
  toggleTask,
  FileSystemWatcherManager,
};

export class TaskScheduler {
  constructor(store, executeFn, options = {}) {
    const opts = (typeof executeFn === 'object' && executeFn !== null && typeof executeFn !== 'function') ? executeFn : (options || {});
    this.store = store;
    this.executeFn = typeof executeFn === 'function' ? executeFn : (opts.executeFn || null);
    this.maxConcurrent = opts.maxConcurrent !== undefined && Number(opts.maxConcurrent) >= 0 ? Number(opts.maxConcurrent) : 2;
    this.defaultTimezone = opts.defaultTimezone || '';
    this.resolveSecrets = typeof opts.resolveSecrets === 'function' ? opts.resolveSecrets : null;
    this.deliver = typeof opts.deliver === 'function' ? opts.deliver : null;
    this.askModel = typeof opts.askModel === 'function' ? opts.askModel : null;
    this.inspectTimeoutMs = opts.inspectTimeoutMs;
    this.silentRuleTimeoutMs = opts.silentRuleTimeoutMs;
    this.jobs = new Map();
    this.timers = new Map();
    this.retryTimers = new Map();
    this.adaptiveTimers = new Map();
    this.deferredTimers = new Map();
    this.running = new Map();
    this.runCounters = {};
    this.queue = [];
    this.groupLimits = opts.groupLimits instanceof Map ? opts.groupLimits : new Map(Object.entries(opts.groupLimits || {}));
    this.heartbeatTimer = null;
    this.watcherManager = new FileSystemWatcherManager(this);
    this.scopeLocks = new ScopeLockManager();
    this.wakeTriggerManager = new WakeTriggerManager(this);
    this.cronAsCodeManager = new CronAsCodeManager(this);
    this.logger = opts.logger || null;
    this.isStopped = false;
    this.generation = 0;
  }

  isRunning(taskId) {
    return this.running.has(taskId);
  }

  runningCount() {
    return this.running.size;
  }

  runningSince(taskId) {
    const r = this.running.get(taskId);
    return r ? r.startedAt : null;
  }

  clearRetryTimer(taskId) {
    const t = this.retryTimers.get(taskId);
    if (t) {
      clearTimeout(t);
      this.retryTimers.delete(taskId);
    }
  }

  armDeferredTimer(taskId, delayMs, options = {}) {
    this.clearDeferredTimer(taskId);
    const timer = setTimeout(() => {
      this.deferredTimers.delete(taskId);
      if (!this.isStopped) {
        this.runTask(taskId, options).catch((_err) => { void _err; });
      }
    }, delayMs);
    if (timer.unref) timer.unref();
    this.deferredTimers.set(taskId, timer);
  }

  syncWorkspaceCronAsCode(workspaceId, workspaceDir) {
    if (this.cronAsCodeManager) {
      return this.cronAsCodeManager.syncWorkspace(workspaceId, workspaceDir);
    }
    return null;
  }

  clearDeferredTimer(taskId) {
    const t = this.deferredTimers.get(taskId);
    if (t) {
      clearTimeout(t);
      this.deferredTimers.delete(taskId);
    }
  }

  clearAdaptiveTimer(taskId) {
    const t = this.adaptiveTimers.get(taskId);
    if (t) {
      clearTimeout(t);
      this.adaptiveTimers.delete(taskId);
    }
  }

  armAdaptiveTimer(taskId, delayMs) {
    this.clearAdaptiveTimer(taskId);
    this.clearDeferredTimer(taskId);
    if (this.wakeTriggerManager) {
      this.wakeTriggerManager.unregisterTask(taskId);
    }
    if (this.jobs.has(taskId)) {
      this.jobs.get(taskId).stop();
      this.jobs.delete(taskId);
    }
    const task = this.store.get(taskId);
    if (task) {
      task.nextRunAt = Date.now() + delayMs;
      this.store.set(task);
    }
    const timer = setTimeout(() => {
      this.adaptiveTimers.delete(taskId);
      if (!this.isStopped) {
        this.runTask(taskId, { isAdaptive: true }).catch((err) => {
          logger.error(`[dsh-cron] adaptive run of task ${taskId} failed:`, (err && err.message) || err);
        });
      }
    }, delayMs);
    if (timer.unref) timer.unref();
    this.adaptiveTimers.set(taskId, timer);
  }

  startHeartbeatWatcher(intervalMs = 30000) {
    return startHeartbeatWatcher(this, intervalMs);
  }

  stopHeartbeatWatcher() {
    return stopHeartbeatWatcher(this);
  }

  checkHeartbeats() {
    return checkHeartbeats(this);
  }

  start() {
    this.isStopped = false;
    this.generation = (this.generation || 0) + 1;

    if (this.store && (this.store.isReadOnly?.() || this.store.hasLoadFailed?.())) {
      const accessCode = this.store.getAccessErrorCode?.();
      const codeInfo = accessCode ? ` (code: ${accessCode})` : '';
      logger.warn(`[dsh-cron] scheduler started in read-only recovery mode${codeInfo}: tasks store could not be loaded. Task scheduling and automatic executions are suspended.`);
      return;
    }

    // Recovery & cleanup on restart (#317, #321)
    if (this.store && this.store.durableJournal) {
      try {
        const recovered = this.store.durableJournal.recoverPendingRuns(this);
        if (recovered.uncertain.length > 0) {
          logger.warn(`[dsh-cron] Recovered ${recovered.uncertain.length} in-flight run(s) interrupted by restart -> status marked uncertain`);
        }
      } catch (recErr) {
        logger.error('[dsh-cron] restart recovery failed:', recErr.message);
      }
    }
    if (this.store && this.store.artifactManager) {
      try {
        this.store.artifactManager.cleanupArtifacts(this.store);
      } catch (cleanErr) {
        logger.warn('[dsh-cron] artifact cleanup failed:', cleanErr.message);
      }
    }

    const tasks = this.store.list();
    const now = Date.now();
    for (const task of tasks) {
      if (task.status !== 'active') continue;
      const missed = task.nextRunAt && (now - task.nextRunAt) > 5 * 60 * 1000;
      if (missed) {
        const missedAt = task.nextRunAt;
        const policy = task.misfirePolicy || 'skip';
        logger.warn(`[dsh-cron] Task "${task.title}" (${task.id}) missed scheduled run at ${new Date(missedAt).toISOString()} (misfire: ${policy})`);
        this.countRun('missed');
        this.store.recordRun(task.id, {
          at: missedAt,
          status: 'missed',
          durationMs: 0,
          output: `Skipped: the service was offline or restarting at the scheduled time (${new Date(missedAt).toISOString()})`,
          error: null,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        });
        if (policy === 'skip') {
          if (task.oneShot) {
            task.status = 'completed';
            this.store.set(task);
            continue;
          }
          this.scheduleTask(task);
          continue;
        }
        this.scheduleTask(task);
        setImmediate(() => this.runTask(task.id));
        continue;
      }
      this.scheduleTask(task);
    }
    this.startHeartbeatWatcher();
    if (this.watcherManager) {
      this.watcherManager.syncAll(tasks);
    }
    if (this.wakeTriggerManager) {
      this.wakeTriggerManager.syncTasks(tasks);
    }
  }

  stopAll() {
    return handleStopAll(this);
  }

  clearScheduled(taskId) {
    return handleClearScheduled(this, taskId);
  }
  scheduleOneShot(task, parsed) {
    task.oneShot = true;
    task.targetTimestamp = parsed.targetTimestamp;
    task.nextRunAt = parsed.targetTimestamp;
    this.store.set(task);

    const armTimer = () => {
      const remaining = parsed.targetTimestamp - Date.now();
      if (remaining <= 0) {
        this.timers.delete(task.id);
        this.runTask(task.id).catch((err) => {
          logger.error(`[dsh-cron] one-shot run of task ${task.id} failed:`, (err && err.message) || err);
        });
        return;
      }
      const delay = Math.min(remaining, MAX_TIMEOUT_MS);
      const timer = setTimeout(() => {
        if (Date.now() >= parsed.targetTimestamp) {
          this.timers.delete(task.id);
          this.runTask(task.id).catch((err) => {
            logger.error(`[dsh-cron] one-shot run of task ${task.id} failed:`, (err && err.message) || err);
          });
        } else {
          armTimer();
        }
      }, delay);
      this.timers.set(task.id, timer);
    };

    armTimer();
  }

  scheduleCron(task, parsed) {
    const timezone = task.timezone || this.defaultTimezone || undefined;
    const job = new Cron(parsed.cronPattern, {
      sloppyRanges: true,
      catch: (err) => logger.error(`[dsh-cron] scheduled run of "${task.title}" (${task.id}) failed:`, (err && err.message) || err),
      ...(timezone ? { timezone } : {}),
    }, async () => {
      await this.runTask(task.id);
    });

    this.jobs.set(task.id, job);
    const next = job.nextRun();
    if (next) {
      task.nextRunAt = next.getTime();
      this.store.set(task);
    }
  }

  scheduleTask(task) {
    this.clearScheduled(task.id);
    if (task.status !== 'active') return;
    this.clearRetryTimer(task.id);
    if (this.watcherManager) {
      this.watcherManager.watchTask(task);
    }
    if (this.wakeTriggerManager) {
      this.wakeTriggerManager.registerTask(task);
    }

    try {
      const parsed = parseScheduleExpression(task.schedule);
      if (parsed.isOneShot) {
        const existingTarget = task.targetTimestamp || task.nextRunAt;
        if (existingTarget && typeof existingTarget === 'number' && !isNaN(existingTarget)) {
          parsed.targetTimestamp = existingTarget;
          parsed.nextRun = existingTarget;
        }
        this.scheduleOneShot(task, parsed);
        return;
      }
      this.scheduleCron(task, parsed);
    } catch (err) {
      logger.error(`[dsh-cron] failed to schedule task ${task.id}:`, err.message);
    }
  }

  getGroupLimit(group) {
    if (!group || group === 'default') return 0;
    if (this.groupLimits && this.groupLimits.has(group)) {
      return Number(this.groupLimits.get(group)) || 0;
    }
    return 1;
  }

  getRunningGroupCount(group) {
    if (!group || group === 'default') return 0;
    let count = 0;
    for (const [, run] of this.running.entries()) {
      if (run.concurrencyGroup === group) {
        count++;
      }
    }
    return count;
  }

  beginRun(task, taskId, options = {}) {
    return beginRun(this, task, taskId, options);
  }

  countRun(status) {
    const key = status || 'unknown';
    this.runCounters[key] = (this.runCounters[key] || 0) + 1;
  }

  getRunCounters() {
    return { ...this.runCounters };
  }

  recordSkipped(taskId, reason) {
    this.countRun('skipped');
    const runId = 'run_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now();
    this.store.recordRun(taskId, {
      runId,
      at: Date.now(),
      status: 'skipped',
      durationMs: 0,
      output: reason,
      error: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      stoppedReason: reason,
      stages: [
        { name: 'queue', status: 'skipped', durationMs: 0 },
        { name: 'preflight', status: 'skipped', durationMs: 0, error: reason },
        { name: 'execution', status: 'skipped', durationMs: 0 },
        { name: 'validation', status: 'skipped', durationMs: 0 },
        { name: 'delivery', status: 'skipped', durationMs: 0 },
      ],
      cost: { amount: 0, currency: 'USD', kind: 'exact' },
      delivery: { status: 'skipped', delivered: [], failures: [] },
    });
  }

  async executeOnce(task, signal, options = {}) {
    return executeOnce(this, task, signal, options);
  }

  async executeWithFallback(task, signal, options = {}) {
    return executeWithFallback(this, task, signal, options);
  }

  shouldUseFallback(task, outcome) {
    return shouldUseFallback(task, outcome);
  }

  drainQueue() {
    if (this.isStopped || this.queue.length === 0) return;
    if (this.maxConcurrent > 0 && this.running.size >= this.maxConcurrent) return;

    let admittedIndex = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const candidate = this.queue[i];
      const queuedTask = this.store.get(candidate.taskId);
      if (!queuedTask || queuedTask.status !== 'active') {
        this.queue.splice(i, 1);
        i--;
        continue;
      }
      const qGroup = queuedTask.concurrencyGroup && queuedTask.concurrencyGroup !== 'default'
        ? String(queuedTask.concurrencyGroup).trim()
        : null;
      const qLimit = this.getGroupLimit ? this.getGroupLimit(qGroup) : (qGroup ? 1 : 0);
      if (qGroup && qLimit > 0) {
        const inGroup = this.getRunningGroupCount ? this.getRunningGroupCount(qGroup) : 0;
        if (inGroup >= qLimit) {
          continue;
        }
      }

      if (this.scopeLocks && !this.scopeLocks.canAcquire(queuedTask, candidate.taskId).ok) {
        continue;
      }

      admittedIndex = i;
      break;
    }

    if (admittedIndex !== -1) {
      const nextItem = this.queue.splice(admittedIndex, 1)[0];
      setImmediate(() => {
        if (!this.isStopped) {
          this.runTask(nextItem.taskId, nextItem.options || {}).catch((_runErr) => {
            bestEffort('drain-queued-task', () => {}, this.logger);
          });
        }
      });
    }
  }

  async runTask(taskId, options = {}) {
    if (this.isStopped) return null;
    if (this.store && (this.store.isReadOnly?.() || this.store.hasLoadFailed?.())) {
      logger.warn(`[dsh-cron] skipping task run ${taskId}: store is in read-only recovery mode`);
      return null;
    }
    return executeTask(this, taskId, options);
  }

  async completeRun(task, taskId, currentRun, outcome, start, options = {}) {
    return handleCompleteRun(this, task, taskId, currentRun, outcome, start, options);
  }

  async applyModelAssists(task, runInfo) {
    return applyModelAssists(task, runInfo, {
      askModel: this.askModel,
      readSettingsFn: () => this.readSettings(),
      inspectTimeoutMs: this.inspectTimeoutMs,
      silentRuleTimeoutMs: this.silentRuleTimeoutMs,
    });
  }

  async inspectFailureRun(task, runInfo) {
    return inspectFailureRun(task, runInfo, {
      askModel: this.askModel,
      readSettingsFn: () => this.readSettings(),
      inspectTimeoutMs: this.inspectTimeoutMs || 25000,
    });
  }

  readSettings() {
    try {
      return typeof this.store.getSettings === 'function' ? this.store.getSettings() : {};
    } catch (err) {
      bestEffort('readSettings', () => {}, this.logger);
      return {};
    }
  }

  async applySilentRuleToRun(task, runInfo) {
    return applySilentRuleToRun(task, runInfo, {
      askModel: this.askModel,
      readSettingsFn: () => this.readSettings(),
      silentRuleTimeoutMs: this.silentRuleTimeoutMs || 20000,
    });
  }

  async deliverNotifications(task, runInfo) {
    return deliverNotifications(task, runInfo, {
      store: this.store,
      resolveSecrets: this.resolveSecrets,
      deliver: this.deliver,
    });
  }

  finishRun(task, taskId, status, queuedCount, meta) {
    return finishRun(this, task, taskId, status, queuedCount, meta);
  }

  pauseTask(taskId, reason) {
    return pauseTask(this, taskId, reason);
  }

  removeTask(taskId) {
    return removeTask(this, taskId);
  }

  resumeTask(taskId) {
    return resumeTask(this, taskId);
  }

  toggleTask(taskId) {
    return toggleTask(this, taskId);
  }

  triggerManualRun(taskId, options = {}) {
    return this.runTask(taskId, options);
  }

  runNow(taskId, options = {}) {
    return this.runTask(taskId, options);
  }
}

