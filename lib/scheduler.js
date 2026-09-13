import { Cron } from 'croner';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import { parseLlmActionDirectives, executeLlmActionDirectives } from './llm-actions.js';
import { applySilentRule } from './silent-rule.js';
import { inspectFailure } from './failure-inspector.js';

/** Task types that talk to a model and can therefore use a fallback model. */
export const AGENT_TASK_TYPES = ['llm', 'skill', 'workflow'];

/** Sum two usage records, so a fallback attempt is not lost in accounting. */
export function addUsage(a, b) {
  return {
    inputTokens: (a?.inputTokens || 0) + (b?.inputTokens || 0),
    outputTokens: (a?.outputTokens || 0) + (b?.outputTokens || 0),
    cacheReadTokens: (a?.cacheReadTokens || 0) + (b?.cacheReadTokens || 0),
  };
}

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
    // "@every N unit" is another spelling of the interval branch.
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
    // #117: croner 10 made numeric-prefix steps (0/10, 30/30) a parse error,
    // but stored schedules created under croner 9 use them. sloppyRanges
    // restores the croner 9 range behaviour so existing tasks keep firing.
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
 * Turn a typed schedule into a cron pattern or a one-shot target. The branch
 * order is the contract: a timestamp, a relative one-shot, an interval and an
 * alias are all more specific than a raw cron expression.
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

/**
 * Execute pre-flight check gate before running task body.
 */
export async function executePreflight(task) {
  const type = String(task.preflightType || 'none').toLowerCase();
  const target = String(task.preflightTarget || '').trim();
  if (!type || type === 'none' || !target) {
    return { ok: true };
  }

  if (type === 'http') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(target, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return { ok: true };
      return { ok: false, reason: `HTTP check returned status ${res.status}` };
    } catch (err) {
      return { ok: false, reason: `HTTP check failed: ${err.message}` };
    }
  }

  if (type === 'command') {
    return new Promise((resolve) => {
      exec(target, { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, reason: `Preflight command failed (code ${err.code || 1}): ${(stderr || stdout || err.message).trim().slice(0, 150)}` });
        } else {
          resolve({ ok: true });
        }
      });
    });
  }

  if (type === 'disk') {
    const requiredMb = Number(target) || 100;
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(process.cwd());
        const freeMb = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
        if (freeMb < requiredMb) {
          return { ok: false, reason: `Free disk space (${freeMb} MB) is below required ${requiredMb} MB` };
        }
      }
      return { ok: true };
    } catch {
      return { ok: true }; // Fail-open
    }
  }

  return { ok: true };
}

export class TaskScheduler {
  constructor(store, executeFn, options = {}) {
    this.store = store;
    this.executeFn = executeFn;
    this.maxConcurrent = options.maxConcurrent !== undefined && Number(options.maxConcurrent) >= 0 ? Number(options.maxConcurrent) : 2; // default 2 parallel runs (#134, #52)
    this.defaultTimezone = options.defaultTimezone || ''; // #13
    this.resolveSecrets = typeof options.resolveSecrets === 'function' ? options.resolveSecrets : null; // #51
    this.deliver = typeof options.deliver === 'function' ? options.deliver : null; // #26 channel router
    this.jobs = new Map(); // taskId -> Cron instance
    this.timers = new Map(); // taskId -> setTimeout handle (for one-shot tasks)
    this.retryTimers = new Map(); // taskId -> setTimeout handle (for #18 retries)
    this.running = new Map(); // taskId -> { controller, startedAt, queueCount }
    this.runCounters = {}; // status -> finished runs since start (#53, /dsh-cron/metrics)
    this.queue = []; // [{ taskId, priority, queuedAt, options }]
    this.heartbeatTimer = null;
  }

  isRunning(taskId) {
    return this.running.has(taskId);
  }

  runningCount() {
    return this.running.size;
  }

  runningSince(taskId) {
    const run = this.running.get(taskId);
    return run ? run.startedAt : null;
  }

  clearRetryTimer(taskId) {
    const timer = this.retryTimers.get(taskId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.retryTimers.delete(taskId);
    }
  }

  startHeartbeatWatcher(intervalMs = 30000) {
    this.stopHeartbeatWatcher();
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), intervalMs);
    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeatWatcher() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async checkHeartbeats() {
    const now = Date.now();
    const tasks = typeof this.store.list === 'function' ? this.store.list({ status: 'active' }) : Array.from(this.store.tasks.values());
    for (const task of tasks) {
      if (task.status !== 'active' || !task.heartbeatIntervalSeconds || task.heartbeatIntervalSeconds <= 0) {
        continue;
      }
      const grace = task.gracePeriodSeconds !== undefined ? task.gracePeriodSeconds : 300;
      const last = task.lastPingAt || task.createdAt || now;
      const deadline = last + (task.heartbeatIntervalSeconds + grace) * 1000;

      if (now > deadline && !task.heartbeatAlerted) {
        task.heartbeatAlerted = true;
        task.lastStatus = 'missed';
        task.updatedAt = now;
        this.store.save();

        console.warn(`[dsh-cron] Heartbeat missed for "${task.title}" (${task.id})!`);
        const runInfo = {
          at: now,
          status: 'missed',
          durationMs: 0,
          output: `Heartbeat missed: expected ping within ${task.heartbeatIntervalSeconds + grace}s, last ping was at ${new Date(last).toISOString()}`,
          error: 'Heartbeat deadline exceeded',
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        };

        try {
          this.store.recordRun(task.id, runInfo);
        } catch {}

        await this.deliverNotifications(task, runInfo);

        if (task.onFailure && String(task.onFailure).trim()) {
          const targetId = task.onFailure.trim();
          this.runNow(targetId, {
            chainDepth: 1,
            prevOutput: runInfo.output,
            prevTaskId: task.id,
          }).catch((err) => console.warn(`[dsh-cron] heartbeat onFailure trigger error:`, err.message));
        }
      }
    }
  }

  start() {
    const tasks = this.store.list();
    const now = Date.now();
    for (const task of tasks) {
      if (task.status !== 'active') continue;
      // Detect missed execution if daemon was offline (threshold: > 5 minutes)
      const missed = task.nextRunAt && (now - task.nextRunAt) > 5 * 60 * 1000;
      if (missed) {
        const missedAt = task.nextRunAt;
        const policy = task.misfirePolicy || 'skip'; // #12: skip | runOnce | catchUpAll
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
          // A missed one-shot has no future slot left: retire it instead of
          // arming a timer in the past.
          if (task.oneShot) {
            task.status = 'completed';
            this.store.set(task);
            continue;
          }
          this.scheduleTask(task);
          continue;
        }
        // runOnce / catchUpAll: run late exactly once, then resume the schedule.
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
    for (const [id, job] of this.jobs.entries()) {
      try {
        job.stop();
      } catch {}
    }
    this.jobs.clear();

    for (const [id, timer] of this.timers.entries()) {
      try {
        clearTimeout(timer);
      } catch {}
    }
    this.timers.clear();

    for (const [id, timer] of this.retryTimers.entries()) {
      try {
        clearTimeout(timer);
      } catch {}
    }
    this.retryTimers.clear();

    for (const [, run] of this.running.entries()) {
      try {
        run.controller.abort(new Error('Scheduler stopped'));
      } catch {}
    }
    this.running.clear();
  }

  /** Drop an armed job or one-shot timer before re-scheduling a task. */
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

  /** Arm a one-shot task; a target already in the past fires immediately. */
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

  /** Arm a recurring cron job and persist the next run timestamp. */
  scheduleCron(task, parsed) {
    const timezone = task.timezone || this.defaultTimezone || undefined;
    const job = new Cron(parsed.cronPattern, {
      protect: true,
      sloppyRanges: true, // #117: keep croner 9 range syntax working
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

  /**
   * Pre-flight guards for a run: the global concurrency throttle (#52) and the
   * per-task overlap policy. Returns the run token to continue with, or null
   * when this tick must not execute (the reason is already recorded).
   */
  beginRun(task, taskId) {
    // Global concurrency throttle (#52): a run that would exceed the limit is
    // skipped and recorded; already-running tasks are never throttled against
    // themselves.
    if (!this.running.has(taskId) && this.maxConcurrent > 0 && this.running.size >= this.maxConcurrent) {
      if (task.overlapPolicy === 'queue') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) queued by concurrency limit (${this.maxConcurrent})`);
        this.queue.push({ taskId, priority: task.priority !== undefined ? task.priority : 5, queuedAt: Date.now() });
        this.queue.sort((a, b) => (a.priority - b.priority) || (a.queuedAt - b.queuedAt));
        return null;
      }
      console.log(`[dsh-cron] Task "${task.title}" (${taskId}) skipped: concurrency limit (${this.maxConcurrent})`);
      this.recordSkipped(taskId, `Skipped: concurrency limit reached (${this.maxConcurrent} parallel runs)`);
      return null;
    }

    const overlapPolicy = task.overlapPolicy || 'skip';
    const active = this.running.get(taskId);
    if (active) {
      if (overlapPolicy === 'skip') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, skipping run (overlapPolicy: skip)`);
        this.recordSkipped(taskId, 'Skipped: the previous run is still in progress (overlapPolicy: skip)');
        return null;
      }
      if (overlapPolicy === 'replace') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, canceling current run (overlapPolicy: replace)`);
        active.controller.abort(new Error('Aborted by overlap policy: replace'));
      }
      if (overlapPolicy === 'queue') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, queueing next run (overlapPolicy: queue)`);
        active.queueCount = (active.queueCount || 0) + 1;
        return null;
      }
    }

    const controller = new AbortController();
    const currentRun = { controller, startedAt: Date.now(), queueCount: 0 };
    this.running.set(taskId, currentRun);
    return currentRun;
  }

  /** Count a finished run for the metrics endpoint (#53). */
  countRun(status) {
    const key = status || 'unknown';
    this.runCounters[key] = (this.runCounters[key] || 0) + 1;
  }

  /** Snapshot of the run counters; the caller must not mutate it. */
  getRunCounters() {
    return { ...this.runCounters };
  }

  /** Record a run that never started, with the reason in the history entry. */
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

  /** Run the task body once and normalise whatever the executor returned. */
  async executeOnce(task, signal, options = {}) {
    const result = {
      status: 'success',
      output: '',
      error: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      sessionId: null,
      model: task.model || '',
      fallback: false,
    };
    if (typeof this.executeFn !== 'function') return result;
    try {
      const res = await this.executeFn(task, { signal, ...options });
      if (typeof res === 'object' && res !== null) {
        result.output = res.output || '';
        result.usage = res.usage || result.usage;
        result.costUsd = res.costUsd || 0;
        result.sessionId = res.sessionId || null;
        if (res.model) result.model = res.model;
      } else {
        result.output = String(res || '');
      }
    } catch (err) {
      result.error = err.message || String(err);
      const timedOut = result.error.toLowerCase().includes('timed out') || result.error.toLowerCase().includes('timeout');
      result.status = timedOut ? 'timeout' : 'error';
    }
    return result;
  }

  /**
   * Run the task, retrying once on the configured fallback model when the
   * primary attempt failed (#45).
   *
   * The point is cost: a task can default to the cheap model and still finish
   * on the strong one when the cheap model cannot do the job. Exactly one
   * fallback attempt is made — the ordinary retry backoff still applies
   * afterwards — and usage and cost of BOTH attempts are summed, because both
   * were really spent.
   */
  async executeWithFallback(task, signal, options = {}) {
    const primary = await this.executeOnce(task, signal, options);
    if (!this.shouldUseFallback(task, primary)) return primary;

    const fallbackTask = {
      ...task,
      provider: task.fallbackProvider || task.provider,
      model: task.fallbackModel,
    };
    console.log(`[dsh-cron] task "${task.title}" failed on ${task.model || 'the default model'}, retrying once on ${task.fallbackModel}`);
    const secondary = await this.executeOnce(fallbackTask, signal, options);
    return {
      ...secondary,
      fallback: true,
      usage: addUsage(primary.usage, secondary.usage),
      costUsd: Number((primary.costUsd + secondary.costUsd).toFixed(6)),
      primaryModel: task.model || '',
    };
  }

  /** Only agent-mediated types use a model, and only a failed run falls back. */
  shouldUseFallback(task, outcome) {
    if (!task || !task.fallbackModel) return false;
    if (!AGENT_TASK_TYPES.includes(task.type || 'llm')) return false;
    return outcome.status === 'error' || outcome.status === 'timeout';
  }


  async runTask(taskId, options = {}) {
    const task = this.store.get(taskId);
    if (!task) return null;

    if (options.dryRun) {
      const start = Date.now();
      const outcome = await this.executeWithFallback(task, AbortSignal.timeout(Math.min((task.timeoutSeconds || 1800) * 1000, 30000)), options);
      return {
        ok: true,
        dryRun: true,
        status: outcome.status,
        output: outcome.output,
        error: outcome.error,
        durationMs: Date.now() - start,
        usage: outcome.usage,
        costUsd: outcome.costUsd,
        model: outcome.model || task.model || '',
      };
    }

    const currentRun = this.beginRun(task, taskId);
    if (currentRun === null) return null;

    const preflight = await executePreflight(task);
    if (!preflight.ok) {
      console.log(`[dsh-cron] task "${task.title}" (${taskId}) skipped: ${preflight.reason}`);
      this.running.delete(taskId);
      this.recordSkipped(taskId, `Preflight check skipped: ${preflight.reason}`);
      return null;
    }

    const start = Date.now();
    const outcome = await this.executeWithFallback(task, currentRun.controller.signal, options);
    await this.completeRun(task, taskId, currentRun, outcome, start, options);
    return outcome;
  }

  /**
   * Record the run, release the run slot and hand the result to delivery and
   * bookkeeping. Kept separate from runTask so the run flow reads in steps.
   */
  async completeRun(task, taskId, currentRun, outcome, start, options = {}) {
    const isSuccess = outcome.status === 'success';
    const isFailure = outcome.status === 'error' || outcome.status === 'timeout';
    const runInfo = {
      at: start,
      status: outcome.status,
      durationMs: Date.now() - start,
      output: outcome.output,
      error: outcome.error,
      usage: outcome.usage,
      costUsd: outcome.costUsd,
      sessionId: outcome.sessionId,
      // #45: which model actually produced this result, and whether the run
      // only finished thanks to the configured fallback.
      model: outcome.model || task.model || '',
      fallback: Boolean(outcome.fallback),
    };

    // #43/#44 decide before the run is recorded, so the single history entry
    // already carries the diagnosis and the silence verdict.
    // 3. Self-healing & Auto-diagnose (#139)
    if (isFailure && task.selfHealingCommand) {
      console.log(`[dsh-cron] running self-healing command for task "${task.title}": ${task.selfHealingCommand}`);
      try {
        await new Promise((resolve) => {
          exec(task.selfHealingCommand, { timeout: 30000 }, (shErr, stdout, stderr) => {
            runInfo.selfHealing = {
              command: task.selfHealingCommand,
              success: !shErr,
              output: (stdout + (stderr ? '\n' + stderr : '')).trim().slice(0, 500),
            };
            resolve();
          });
        });
      } catch (shErr) {
        runInfo.selfHealing = { command: task.selfHealingCommand, success: false, error: shErr.message };
      }
    }

    if (isFailure && task.autoDiagnose && typeof this.executeFn === 'function') {
      try {
        const diagRes = await this.executeFn({
          type: 'llm',
          prompt: `Diagnose this task failure in 1-2 concise sentences. Error: ${outcome.error || 'unknown'}. Recent output: ${(outcome.output || '').slice(-300)}`,
          model: task.fallbackModel || task.model,
        }, { signal: AbortSignal.timeout(10000) });
        if (diagRes && diagRes.output) {
          runInfo.autoDiagnosis = diagRes.output.trim();
        }
      } catch {
        // Fail-open
      }
    }

    const silent = await this.applyModelAssists(task, runInfo);

    try {
      this.store.recordRun(taskId, runInfo);
    } catch (recordErr) {
      console.error(`[dsh-cron] failed to record the run of task ${taskId}:`, recordErr.message);
    }

    // Release the slot before delivery so a long notification never blocks the
    // next tick of this task.
    const finishedRun = this.running.get(taskId);
    if (finishedRun === currentRun) this.running.delete(taskId);
    const queuedCount = finishedRun?.queueCount || 0;

    if (!silent.skipped) await this.deliverNotifications(task, runInfo);
    this.finishRun(task, taskId, outcome.status, queuedCount);

    if (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
      const nextItem = this.queue.shift();
      if (nextItem) {
        setImmediate(() => {
          this.runTask(nextItem.taskId).catch(() => {});
        });
      }
    }

    // 1. Structured LLM Actions (#137)
    if (task.type === 'llm' && outcome.status === 'success' && outcome.output) {
      try {
        const settings = typeof this.store.getSettings === 'function' ? this.store.getSettings() : {};
        if (settings.llmActionsEnabled) {
          const directives = parseLlmActionDirectives(outcome.output);
          if (directives.length > 0) {
            await executeLlmActionDirectives({
              directives,
              task,
              runInfo,
              scheduler: this,
              store: this.store,
              settings,
            });
          }
        }
      } catch (actErr) {
        console.warn(`[dsh-cron] structured action error for ${taskId}:`, actErr.message);
      }
    }

    

    // 2. Task Chaining (#137)
    const nextTaskId = isSuccess ? task.onSuccess : (isFailure ? task.onFailure : null);

    if (nextTaskId && typeof nextTaskId === 'string' && nextTaskId.trim()) {
      const currentDepth = options.chainDepth || 0;
      if (currentDepth < 4) {
        const targetId = nextTaskId.trim();
        const nextTask = this.store.get(targetId);
        if (nextTask) {
          console.log(`[dsh-cron] triggering chained task "${nextTask.title}" (${targetId}) from "${task.title}" (depth ${currentDepth + 1})`);
          this.runNow(targetId, {
            chainDepth: currentDepth + 1,
            prevOutput: outcome.output || outcome.error || '',
            prevTaskId: task.id,
          }).catch(err => {
            console.warn(`[dsh-cron] chained task ${targetId} failed to trigger:`, err.message);
          });
        } else {
          console.warn(`[dsh-cron] chained task target not found: ${targetId}`);
        }
      } else {
        console.warn(`[dsh-cron] chained task depth limit (5) reached for task ${task.id} -> ${nextTaskId}. Loop prevented.`);
      }
    }
  }

  /**
   * Run the model-assisted steps for a finished run: diagnose a failure (#43)
   * and decide whether a successful run should stay silent (#44). Both are
   * fail-open and write their outcome into `runInfo`.
   */
  async applyModelAssists(task, runInfo) {
    const inspection = await this.inspectFailureRun(task, runInfo);
    if (inspection.inspected) {
      runInfo.diagnosis = inspection.diagnosis;
      runInfo.suggestion = inspection.suggestion;
      runInfo.confidence = inspection.confidence;
      console.log(`[dsh-cron] task "${task.title}" failure diagnosed (${inspection.confidence}): ${inspection.diagnosis}`);
    } else if (inspection.error && task.inspectOnFailure) {
      console.warn(`[dsh-cron] failure inspection for "${task.title}" not applied: ${inspection.error}`);
    }

    const silent = await this.applySilentRuleToRun(task, runInfo);
    if (silent.skipped) {
      runInfo.silentSkip = true;
      runInfo.silentReason = silent.reason;
      console.log(`[dsh-cron] task "${task.title}" stayed silent by rule: ${silent.reason || 'no reason given'}`);
    } else if (silent.verdictError) {
      console.warn(`[dsh-cron] silent rule for "${task.title}" not applied: ${silent.verdictError}`);
    }
    return silent;
  }

  /** Ask the model to diagnose a failed run (#43). Never throws. */
  async inspectFailureRun(task, runInfo) {
    if (typeof this.askModel !== 'function') return { inspected: false, error: 'no model is available' };
    const settings = this.readSettings();
    try {
      return await inspectFailure({
        task,
        runInfo,
        ask: this.askModel,
        preferredModel: String(settings.inspectorModel || ''),
        timeoutMs: this.inspectTimeoutMs || 25000,
      });
    } catch (err) {
      return { inspected: false, error: err.message };
    }
  }

  /** Settings snapshot, or an empty object when the store has none. */
  readSettings() {
    try {
      return typeof this.store.getSettings === 'function' ? this.store.getSettings() : {};
    } catch {
      return {};
    }
  }

  /**
   * Ask the silent rule whether this run should be delivered (#44).
   * Never throws: any problem means "deliver".
   */
  async applySilentRuleToRun(task, runInfo) {
    if (typeof this.askModel !== 'function') return { skipped: false, reason: '' };
    const preferredModel = String(this.readSettings().silentRuleModel || '');
    try {
      return await applySilentRule({
        task,
        runInfo,
        ask: this.askModel,
        preferredModel,
        timeoutMs: this.silentRuleTimeoutMs || 20000,
      });
    } catch (err) {
      return { skipped: false, reason: '', verdictError: err.message };
    }
  }

  /**
   * Deliver a finished run to every configured channel (#26).
   * Never throws: a broken or slow channel is reported, not propagated, so the
   * cron callback (and therefore the next tick) is never blocked by delivery.
   */
  async deliverNotifications(task, runInfo) {
    try {
      let settings = typeof this.store.getSettings === 'function' ? this.store.getSettings() : {};
      // #51: resolve delivery credentials through the credentials service
      // (credential reference → legacy token → gateway file → env).
      if (this.resolveSecrets) {
        try {
          settings = { ...settings, ...(await this.resolveSecrets(settings)) };
        } catch (secErr) {
          console.warn('[dsh-cron] credential resolution failed:', secErr.message);
        }
      }
      if (typeof this.deliver !== 'function') return;
      const result = await this.deliver(task, runInfo, settings);
      if (result && Array.isArray(result.delivered) && result.delivered.length) {
        console.log(`[dsh-cron] delivered "${task.title}" to: ${result.delivered.map((d) => d.channel).join(', ')}`);
      }
      if (result && Array.isArray(result.failures) && result.failures.length) {
        console.warn(`[dsh-cron] delivery failures for "${task.title}": ${result.failures.map((f) => `${f.channel}: ${f.error}`).join('; ')}`);
      }
    } catch (notifyErr) {
      console.error('[dsh-cron] notification error:', notifyErr.message);
    }
  }

  /**
   * Post-run bookkeeping: one-shot completion, next-run timestamp, retry
   * backoff and draining a queued run. Each part is guarded so a store error
   * cannot reject the cron callback.
   */
  finishRun(task, taskId, status, queuedCount) {
    this.countRun(status);
    try {
      if (task.oneShot) {
        task.status = 'completed';
        task.nextRunAt = null;
        this.store.set(task);
      } else {
        const job = this.jobs.get(taskId);
        if (job) {
          const next = job.nextRun();
          task.nextRunAt = next ? next.getTime() : null;
          this.store.set(task);
        }
      }
    } catch (err) {
      console.error('[dsh-cron] failed to persist the next run of task', taskId + ':', err.message);
    }

    try {
      // Retry with exponential backoff on failure (#18)
      const failed = status === 'error' || status === 'timeout';
      const maxRetries = Number(task.maxRetries) > 0 ? Number(task.maxRetries) : 0;
      if (failed && maxRetries > 0 && (task.attempts || 0) < maxRetries && task.status !== 'paused') {
        task.attempts = (task.attempts || 0) + 1;
        const backoffMs = (Number(task.retryBackoffMs) > 0 ? Number(task.retryBackoffMs) : 30000) * Math.pow(2, task.attempts - 1);
        const attempt = task.attempts;
        this.store.set(task);
        this.clearRetryTimer(taskId);
        this.retryTimers.set(taskId, setTimeout(() => {
          this.retryTimers.delete(taskId);
          this.runTask(taskId);
        }, backoffMs));
        console.log(`[dsh-cron] retry ${attempt}/${maxRetries} for task "${task.title}" in ${backoffMs}ms`);
      } else if (!failed && task.attempts) {
        task.attempts = 0;
        this.store.set(task);
      }
    } catch (err) {
      console.error('[dsh-cron] retry bookkeeping failed for task', taskId + ':', err.message);
    }

    if (queuedCount > 0) {
      setImmediate(() => {
        this.runTask(taskId);
      });
    }
  }

  pauseTask(taskId) {
    const task = this.store.get(taskId);
    if (!task) return null;
    task.status = 'paused';
    task.nextRunAt = null;
    this.clearRetryTimer(taskId);
    if (this.jobs.has(taskId)) {
      this.jobs.get(taskId).stop();
      this.jobs.delete(taskId);
    }
    if (this.timers.has(taskId)) {
      clearTimeout(this.timers.get(taskId));
      this.timers.delete(taskId);
    }
    const running = this.running.get(taskId);
    if (running) {
      try {
        running.controller.abort(new Error('Task paused'));
      } catch {}
      this.running.delete(taskId);
    }
    this.store.set(task);
    return task;
  }

  resumeTask(taskId) {
    const task = this.store.get(taskId);
    if (!task) return null;
    task.status = 'active';
    this.scheduleTask(task);
    this.store.set(task);
    return task;
  }

  toggleTask(taskId) {
    const task = this.store.get(taskId);
    if (!task) return null;
    if (task.status === 'active') {
      return this.pauseTask(taskId);
    } else {
      return this.resumeTask(taskId);
    }
  }

  triggerManualRun(taskId, options = {}) {
    return this.runTask(taskId, options);
  }

  runNow(taskId, options = {}) {
    return this.runTask(taskId, options);
  }
}
