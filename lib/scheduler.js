import { bestEffort } from './best-effort.js';
import { Cron } from 'croner';
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
} from './scheduler-lifecycle.js';

export {
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
};

function pad(v) {
  return String(v).padStart(2, '0');
}

export function describeCron(cronPattern) {
  const parts = cronPattern.trim().split(/\s+/);
  if (parts.length === 5) {
    const [m, h, dom, mon, dow] = parts;
    if (m.startsWith('*/')) return `Every ${m.slice(2)} minutes`;
    if (dow === '1-5' && dom === '*' && mon === '*') {
      return `Weekdays at ${pad(h)}:${pad(m)}`;
    }
    if (dow === '*' && dom === '*' && mon === '*') {
      return `Every day at ${pad(h)}:${pad(m)}`;
    }
    if (dow === '5' && dom === '*' && mon === '*') {
      return `Fridays at ${pad(h)}:${pad(m)}`;
    }
  }
  return cronPattern;
}

/** One-shot from an ISO timestamp or an explicit "at:" prefix, else null. */
function parseAtExpression(str) {
  const atPrefixMatch = str.match(/^(?:at:\s*|at\s+)(.+)$/i);
  const candidateIso = atPrefixMatch ? atPrefixMatch[1].trim() : str;
  const parsedDate = new Date(candidateIso);
  if (isNaN(parsedDate.getTime()) || !(candidateIso.includes('-') || candidateIso.includes('T') || atPrefixMatch)) {
    return null;
  }
  const targetMs = parsedDate.getTime();
  return {
    cronPattern: null,
    isOneShot: true,
    targetTimestamp: targetMs,
    humanText: `One-shot at ${parsedDate.toISOString()}`,
    nextRun: targetMs
  };
}

/**
 * Relative one-shot: "in 20m", "in 2h", "in 30s", "in 1d" and the accepted
 * Russian input aliases ("через 15 минут").
 */
function parseRelativeOneShot(str) {
  const match = str.match(/^(?:in\s+|через\s+)(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|мин|минут|часа?|часов)?$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  let delayMs = num * 60 * 1000;
  let unitText = `${num} min`;
  if (unit.startsWith('s')) {
    delayMs = num * 1000;
    unitText = `${num} sec`;
  } else if (unit.startsWith('h') || unit.startsWith('час')) {
    delayMs = num * 3600 * 1000;
    unitText = `${num} h`;
  } else if (unit.startsWith('d')) {
    delayMs = num * 86400 * 1000;
    unitText = `${num} d`;
  }
  const targetMs = Date.now() + delayMs;
  return {
    cronPattern: null,
    isOneShot: true,
    targetTimestamp: targetMs,
    humanText: `One-shot in ${unitText} (at ${new Date(targetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
    nextRun: targetMs
  };
}

/** Repeating interval: "every 5m", "every 2h", "every 1d". */
function parseIntervalExpression(str) {
  const match = str.match(/^every\s+(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  if (unit.startsWith('m')) {
    return { cronPattern: `*/${num} * * * *`, humanText: `Every ${num} minutes`, isInterval: true };
  }
  if (unit.startsWith('h')) {
    return { cronPattern: `0 */${num} * * *`, humanText: `Every ${num} hours`, isInterval: true };
  }
  if (unit.startsWith('d')) {
    return { cronPattern: `0 0 */${num} * *`, humanText: `Every ${num} days`, isInterval: true };
  }
  return null;
}

/**
 * @-shorthands (#15) and the friendly aliases, including the Russian input
 * aliases. Russian keywords are accepted input, not display strings.
 */
function parseAliasExpression(str) {
  const lower = str.toLowerCase();
  if (lower === '@hourly') return { cronPattern: '0 * * * *', humanText: 'Every hour' };
  if (lower === '@daily' || lower === '@midnight') return { cronPattern: '0 0 * * *', humanText: 'Every day at 00:00' };
  if (lower === '@weekly') return { cronPattern: '0 0 * * 0', humanText: 'Every week on Sunday at 00:00' };
  if (lower === '@monthly') return { cronPattern: '0 0 1 * *', humanText: 'Every month on the 1st at 00:00' };
  if (lower === '@yearly' || lower === '@annually') return { cronPattern: '0 0 1 1 *', humanText: 'Every year on Jan 1 at 00:00' };
  const everyAlias = str.match(/^@every\s+(\d+)\s*(sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (everyAlias) {
    return parseIntervalExpression(`every ${everyAlias[1]} ${everyAlias[2]}`);
  }
  if (lower === 'daily' || lower === 'каждый день') {
    return { cronPattern: '0 9 * * *', humanText: 'Every day at 09:00' };
  }
  if (lower === 'weekdays' || lower === 'в будние дни' || lower === 'по будням') {
    return { cronPattern: '0 9 * * 1-5', humanText: 'Weekdays at 09:00' };
  }
  if (lower === 'hourly' || lower === 'каждый час') {
    return { cronPattern: '0 * * * *', humanText: 'Every hour' };
  }
  return null;
}

/** Validate a 5-field cron expression; the only branch that throws. */
function parseCronExpression(str) {
  try {
    const testJob = new Cron(str, { sloppyRanges: true });
    const next = testJob.nextRun();
    return {
      cronPattern: str,
      humanText: describeCron(str),
      nextRun: next ? next.getTime() : null,
    };
  } catch (err) {
    throw new Error('Invalid cron schedule: ' + err.message);
  }
}

/**
 * Turn a typed schedule into a cron pattern or a one-shot target.
 */
export function parseScheduleExpression(input) {
  const str = String(input || '').trim();
  if (!str) throw new Error('Schedule expression must not be empty');

  return parseAtExpression(str)
    || parseRelativeOneShot(str)
    || parseIntervalExpression(str)
    || parseAliasExpression(str)
    || parseCronExpression(str);
}

/**
 * Preview future execution timestamps for a cron or interval schedule.
 */
export function previewSchedule(scheduleStr, options = {}) {
  const str = String(scheduleStr || '').trim();
  if (!str) throw new Error('Schedule expression must not be empty');
  const parsed = parseScheduleExpression(str);
  const count = Math.min(Math.max(Number(options.count) || 5, 1), 10);
  const timezone = options.timezone || undefined;

  if (parsed.isOneShot) {
    return {
      isOneShot: true,
      humanText: parsed.humanText,
      runs: [new Date(parsed.nextRun).toISOString()],
    };
  }

  const job = new Cron(parsed.cronPattern, {
    timezone,
    sloppyRanges: true,
  });
  const runs = [];
  let current = new Date();
  for (let i = 0; i < count; i++) {
    const next = job.nextRun(current);
    if (!next) break;
    runs.push(next.toISOString());
    current = new Date(next.getTime() + 1000);
  }
  return {
    isOneShot: false,
    cronPattern: parsed.cronPattern,
    humanText: describeCron(parsed.cronPattern),
    runs,
  };
}

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
    this.running = new Map();
    this.runCounters = {};
    this.queue = [];
    this.heartbeatTimer = null;
    this.logger = opts.logger || null;
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
    const tasks = this.store.list();
    const now = Date.now();
    for (const task of tasks) {
      if (task.status !== 'active') continue;
      const missed = task.nextRunAt && (now - task.nextRunAt) > 5 * 60 * 1000;
      if (missed) {
        const missedAt = task.nextRunAt;
        const policy = task.misfirePolicy || 'skip';
        console.warn(`[dsh-cron] Task "${task.title}" (${task.id}) missed scheduled run at ${new Date(missedAt).toISOString()} (misfire: ${policy})`);
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
  }

  stopAll() {
    this.stopHeartbeatWatcher();
    for (const [, job] of this.jobs.entries()) {
      bestEffort('stop-job', () => job.stop(), this.logger);
    }
    this.jobs.clear();

    for (const [, timer] of this.timers.entries()) {
      bestEffort('clear-timer', () => clearTimeout(timer), this.logger);
    }
    this.timers.clear();

    for (const [, timer] of this.retryTimers.entries()) {
      bestEffort('clear-retry-timer', () => clearTimeout(timer), this.logger);
    }
    this.retryTimers.clear();

    for (const [, run] of this.running.entries()) {
      bestEffort('abort-running', () => run.controller.abort(new Error('Scheduler stopped')), this.logger);
    }
    this.running.clear();
  }

  clearScheduled(taskId) {
    if (this.jobs.has(taskId)) {
      this.jobs.get(taskId).stop();
      this.jobs.delete(taskId);
    }
    if (this.timers.has(taskId)) {
      clearTimeout(this.timers.get(taskId));
      this.timers.delete(taskId);
    }
  }

  scheduleOneShot(task, parsed) {
    task.oneShot = true;
    task.nextRunAt = parsed.targetTimestamp;
    this.store.set(task);

    const delay = Math.max(0, parsed.targetTimestamp - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(task.id);
      this.runTask(task.id).catch((err) => {
        console.error(`[dsh-cron] one-shot run of task ${task.id} failed:`, (err && err.message) || err);
      });
    }, delay);
    this.timers.set(task.id, timer);
  }

  scheduleCron(task, parsed) {
    const timezone = task.timezone || this.defaultTimezone || undefined;
    const job = new Cron(parsed.cronPattern, {
      protect: true,
      sloppyRanges: true,
      catch: (err) => console.error(`[dsh-cron] scheduled run of "${task.title}" (${task.id}) failed:`, (err && err.message) || err),
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

    try {
      const parsed = parseScheduleExpression(task.schedule);
      if (parsed.isOneShot) {
        this.scheduleOneShot(task, parsed);
        return;
      }
      this.scheduleCron(task, parsed);
    } catch (err) {
      console.error(`[dsh-cron] failed to schedule task ${task.id}:`, err.message);
    }
  }

  beginRun(task, taskId) {
    return beginRun(this, task, taskId);
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
    this.store.recordRun(taskId, {
      at: Date.now(),
      status: 'skipped',
      durationMs: 0,
      output: reason,
      error: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
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

  async runTask(taskId, options = {}) {
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

  finishRun(task, taskId, status, queuedCount) {
    return finishRun(this, task, taskId, status, queuedCount);
  }

  pauseTask(taskId) {
    return pauseTask(this, taskId);
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

