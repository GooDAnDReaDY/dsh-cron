import { Cron } from 'croner';
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

export function parseScheduleExpression(input) {
  const str = String(input || '').trim();
  if (!str) throw new Error('Schedule expression must not be empty');

  // 1. One-shot ISO 8601 timestamp or explicit "at: <ISO/datetime>"
  const atPrefixMatch = str.match(/^(?:at:\s*|at\s+)(.+)$/i);
  const candidateIso = atPrefixMatch ? atPrefixMatch[1].trim() : str;
  const parsedDate = new Date(candidateIso);
  if (!isNaN(parsedDate.getTime()) && (candidateIso.includes('-') || candidateIso.includes('T') || atPrefixMatch)) {
    const targetMs = parsedDate.getTime();
    return {
      cronPattern: null,
      isOneShot: true,
      targetTimestamp: targetMs,
      humanText: `One-shot at ${parsedDate.toISOString()}`,
      nextRun: targetMs
    };
  }

  // 2. Relative one-shot: "in 20m", "in 2h", "in 30s", "in 1d", "через 15 минут"
  //    Russian keywords are accepted input aliases, not display strings.
  const inRelMatch = str.match(/^(?:in\s+|через\s+)(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|мин|минут|часа?|часов)?$/i);
  if (inRelMatch) {
    const num = parseInt(inRelMatch[1], 10);
    const unit = (inRelMatch[2] || 'm').toLowerCase();
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

  // 3. Repeating Interval: "every 5m", "every 2h", "every 1d"
  const intervalMatch = str.match(/^every\s+(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/i);
  if (intervalMatch) {
    const num = parseInt(intervalMatch[1], 10);
    const unit = (intervalMatch[2] || 'm').toLowerCase();
    if (unit.startsWith('m')) {
      return {
        cronPattern: `*/${num} * * * *`,
        humanText: `Every ${num} minutes`,
        isInterval: true,
      };
    }
    if (unit.startsWith('h')) {
      return {
        cronPattern: `0 */${num} * * *`,
        humanText: `Every ${num} hours`,
        isInterval: true,
      };
    }
    if (unit.startsWith('d')) {
      return {
        cronPattern: `0 0 */${num} * *`,
        humanText: `Every ${num} days`,
        isInterval: true,
      };
    }
  }

  // 4. Standard @-shorthands (#15)
  const lower = str.toLowerCase();
  if (lower === '@hourly') return { cronPattern: '0 * * * *', humanText: 'Every hour' };
  if (lower === '@daily' || lower === '@midnight') return { cronPattern: '0 0 * * *', humanText: 'Every day at 00:00' };
  if (lower === '@weekly') return { cronPattern: '0 0 * * 0', humanText: 'Every week on Sunday at 00:00' };
  if (lower === '@monthly') return { cronPattern: '0 0 1 * *', humanText: 'Every month on the 1st at 00:00' };
  if (lower === '@yearly' || lower === '@annually') return { cronPattern: '0 0 1 1 *', humanText: 'Every year on Jan 1 at 00:00' };
  const everyAlias = str.match(/^@every\s+(\d+)\s*(sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (everyAlias) {
    return parseScheduleExpression(`every ${everyAlias[1]} ${everyAlias[2]}`);
  }

  // 5. Friendly recurring aliases (English plus accepted Russian input aliases)
  if (lower === 'daily' || lower === 'каждый день') {
    return { cronPattern: '0 9 * * *', humanText: 'Every day at 09:00' };
  }
  if (lower === 'weekdays' || lower === 'в будние дни' || lower === 'по будням') {
    return { cronPattern: '0 9 * * 1-5', humanText: 'Weekdays at 09:00' };
  }
  if (lower === 'hourly' || lower === 'каждый час') {
    return { cronPattern: '0 * * * *', humanText: 'Every hour' };
  }

  // 5. Standard 5-field cron expression
  try {
    const testJob = new Cron(str);
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

export class TaskScheduler {
  constructor(store, executeFn, options = {}) {
    this.store = store;
    this.executeFn = executeFn;
    this.maxConcurrent = Number(options.maxConcurrent) > 0 ? Number(options.maxConcurrent) : 0; // 0 = unlimited (#52)
    this.defaultTimezone = options.defaultTimezone || ''; // #13
    this.resolveSecrets = typeof options.resolveSecrets === 'function' ? options.resolveSecrets : null; // #51
    this.deliver = typeof options.deliver === 'function' ? options.deliver : null; // #26 channel router
    this.jobs = new Map(); // taskId -> Cron instance
    this.timers = new Map(); // taskId -> setTimeout handle (for one-shot tasks)
    this.retryTimers = new Map(); // taskId -> setTimeout handle (for #18 retries)
    this.running = new Map(); // taskId -> { controller, startedAt, queueCount }
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
  }

  stopAll() {
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

  scheduleTask(task) {
    // Clear any existing job or timer for this task
    if (this.jobs.has(task.id)) {
      this.jobs.get(task.id).stop();
      this.jobs.delete(task.id);
    }
    if (this.timers.has(task.id)) {
      clearTimeout(this.timers.get(task.id));
      this.timers.delete(task.id);
    }

    if (task.status !== 'active') return;
    this.clearRetryTimer(task.id);

    try {
      const parsed = parseScheduleExpression(task.schedule);
      const timezone = task.timezone || this.defaultTimezone || undefined;

      // Handle One-shot task
      if (parsed.isOneShot) {
        task.oneShot = true;
        const now = Date.now();
        const delay = Math.max(0, parsed.targetTimestamp - now);
        task.nextRunAt = parsed.targetTimestamp;
        this.store.set(task);

        // If target is in the past, or when delay triggers:
        const timer = setTimeout(() => {
          this.timers.delete(task.id);
          this.runTask(task.id).catch((err) => {
            console.error(`[dsh-cron] one-shot run of task ${task.id} failed:`, (err && err.message) || err);
          });
        }, delay);

        this.timers.set(task.id, timer);
        return;
      }

      // Handle Recurring Cron job
      const job = new Cron(parsed.cronPattern, {
        protect: true,
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

  /** Record a run that never started, with the reason in the history entry. */
  recordSkipped(taskId, reason) {
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
  async executeOnce(task, signal) {
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
      const res = await this.executeFn(task, { signal });
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
  async executeWithFallback(task, signal) {
    const primary = await this.executeOnce(task, signal);
    if (!this.shouldUseFallback(task, primary)) return primary;

    const fallbackTask = {
      ...task,
      provider: task.fallbackProvider || task.provider,
      model: task.fallbackModel,
    };
    console.log(`[dsh-cron] task "${task.title}" failed on ${task.model || 'the default model'}, retrying once on ${task.fallbackModel}`);
    const secondary = await this.executeOnce(fallbackTask, signal);
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


  async runTask(taskId) {
    const task = this.store.get(taskId);
    if (!task) return;

    const currentRun = this.beginRun(task, taskId);
    if (currentRun === null) return;

    const start = Date.now();
    const outcome = await this.executeWithFallback(task, currentRun.controller.signal);
    await this.completeRun(task, taskId, currentRun, outcome, start);
  }

  /**
   * Record the run, release the run slot and hand the result to delivery and
   * bookkeeping. Kept separate from runTask so the run flow reads in steps.
   */
  async completeRun(task, taskId, currentRun, outcome, start) {
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

    // #43: a failed run may be diagnosed before it is recorded, so the history
    // entry carries the diagnosis from the start.
    const inspection = await this.inspectFailureRun(task, runInfo);
    if (inspection.inspected) {
      runInfo.diagnosis = inspection.diagnosis;
      runInfo.suggestion = inspection.suggestion;
      runInfo.confidence = inspection.confidence;
      console.log(`[dsh-cron] task "${task.title}" failure diagnosed (${inspection.confidence}): ${inspection.diagnosis}`);
    } else if (inspection.error) {
      // Only worth reporting for a failed run that asked for a diagnosis.
      const failed = runInfo.status === 'error' || runInfo.status === 'timeout';
      if (failed && task.inspectOnFailure) {
        console.warn(`[dsh-cron] failure inspection for "${task.title}" not applied: ${inspection.error}`);
      }
    }

    // #44: decide silence BEFORE recording, so the run is written once and
    // carries the verdict that suppressed it.
    const silent = await this.applySilentRuleToRun(task, runInfo);
    if (silent.skipped) {
      runInfo.silentSkip = true;
      runInfo.silentReason = silent.reason;
      console.log(`[dsh-cron] task "${task.title}" stayed silent by rule: ${silent.reason || 'no reason given'}`);
    } else if (silent.verdictError) {
      console.warn(`[dsh-cron] silent rule for "${task.title}" not applied: ${silent.verdictError}`);
    }

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

  triggerManualRun(taskId) {
    return this.runTask(taskId);
  }
}
