import { Cron } from 'croner';
import { shouldNotifyTask, formatTaskTelegramMessage, sendTelegramMessage } from './telegram.js';
import { createKanbanCard, shouldCreateKanbanCard } from './integrations.js';

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
        const timer = setTimeout(async () => {
          this.timers.delete(task.id);
          await this.runTask(task.id);
        }, delay);

        this.timers.set(task.id, timer);
        return;
      }

      // Handle Recurring Cron job
      const job = new Cron(parsed.cronPattern, { protect: true, ...(timezone ? { timezone } : {}) }, async () => {
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

  async runTask(taskId) {
    const task = this.store.get(taskId);
    if (!task) return;

    // Global concurrency throttle (#52): a run that would exceed the limit is
    // skipped and recorded; already-running tasks are never throttled against
    // themselves.
    if (!this.running.has(taskId) && this.maxConcurrent > 0 && this.running.size >= this.maxConcurrent) {
      console.log(`[dsh-cron] Task "${task.title}" (${taskId}) skipped: concurrency limit (${this.maxConcurrent})`);
      this.store.recordRun(taskId, {
        at: Date.now(),
        status: 'skipped',
        durationMs: 0,
        output: `Skipped: concurrency limit reached (${this.maxConcurrent} parallel runs)`,
        error: null,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
        costUsd: 0,
      });
      return;
    }

    const overlapPolicy = task.overlapPolicy || 'skip';

    // Check overlap with currently running task
    const active = this.running.get(taskId);
    if (active) {
      if (overlapPolicy === 'skip') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, skipping run (overlapPolicy: skip)`);
        this.store.recordRun(taskId, {
          at: Date.now(),
          status: 'skipped',
          durationMs: 0,
          output: 'Skipped: the previous run is still in progress (overlapPolicy: skip)',
          error: null,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        });
        return;
      }
      if (overlapPolicy === 'replace') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, canceling current run (overlapPolicy: replace)`);
        active.controller.abort(new Error('Aborted by overlap policy: replace'));
      }
      if (overlapPolicy === 'queue') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, queueing next run (overlapPolicy: queue)`);
        active.queueCount = (active.queueCount || 0) + 1;
        return;
      }
    }

    const controller = new AbortController();
    const currentRun = {
      controller,
      startedAt: Date.now(),
      queueCount: 0,
    };
    this.running.set(taskId, currentRun);

    const start = Date.now();
    let status = 'success';
    let output = '';
    let error = null;
    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let costUsd = 0;
    let sessionId = null;

    try {
      if (typeof this.executeFn === 'function') {
        const res = await this.executeFn(task, { signal: controller.signal });
        if (typeof res === 'object' && res !== null) {
          output = res.output || '';
          usage = res.usage || usage;
          costUsd = res.costUsd || 0;
          sessionId = res.sessionId || null;
        } else {
          output = String(res || '');
        }
      }
    } catch (err) {
      error = err.message || String(err);
      if (error.toLowerCase().includes('timed out') || error.toLowerCase().includes('timeout')) {
        status = 'timeout';
      } else {
        status = 'error';
      }
    } finally {
      const durationMs = Date.now() - start;
      const runInfo = {
        at: start,
        status,
        durationMs,
        output,
        error,
        usage,
        costUsd,
        sessionId,
      };
      this.store.recordRun(taskId, runInfo);

      // Clean up running map
      const finishedRun = this.running.get(taskId);
      if (finishedRun === currentRun) {
        this.running.delete(taskId);
      }

      const queuedCount = finishedRun?.queueCount || 0;

      // 1. Telegram notification delivery
      try {
        const settings = typeof this.store.getSettings === 'function' ? this.store.getSettings() : {};
        if (shouldNotifyTask(task, runInfo, settings)) {
          const botToken = settings.botToken;
          const chatId = settings.chatId;
          if (botToken && chatId) {
            const text = formatTaskTelegramMessage(task, runInfo);
            sendTelegramMessage({ botToken, chatId, text }).catch((err) => {
              console.error(`[dsh-cron] telegram delivery failed for task "${task.title}":`, err.message);
            });
          }
        }
      } catch (notifyErr) {
        console.error('[dsh-cron] notification error:', notifyErr.message);
      }

      // 2. Kanban card creation
      try {
        if (shouldCreateKanbanCard(task, runInfo)) {
          const settings = typeof this.store.getSettings === 'function' ? this.store.getSettings() : {};
          const isErr = runInfo.status === 'error' || runInfo.status === 'timeout';
          const cardTitle = isErr ? `[Cron failure] ${task.title}` : `[Cron completed] ${task.title}`;
          const cardBody = [
            `**Cron task:** ${task.title} (\`${task.id}\`)`,
            `**Schedule:** ${task.scheduleText || task.schedule}`,
            `**Status:** ${runInfo.status}`,
            `**Started at:** ${new Date(runInfo.at).toISOString()}`,
            runInfo.error ? `\n**Error:**\n\`\`\`\n${runInfo.error}\n\`\`\`` : '',
            runInfo.output ? `\n**Log / Output:**\n\`\`\`\n${runInfo.output.slice(0, 1000)}\n\`\`\`` : '',
          ].filter(Boolean).join('\n\n');

          createKanbanCard({
            title: cardTitle,
            body: cardBody,
            board: 'main',
            column: isErr ? 'backlog' : 'done',
            labels: isErr ? ['cron', 'bug', 'alert'] : ['cron', 'auto'],
            kanbanBaseUrl: settings.kanbanBaseUrl || 'http://127.0.0.1:3000'
          }).then((res) => {
            if (res.success) {
              console.log(`[dsh-cron] created kanban card for task "${task.title}"`);
            }
          }).catch((kErr) => {
            console.error('[dsh-cron] kanban card error:', kErr.message);
          });
        }
      } catch (kanbanErr) {
        console.error('[dsh-cron] kanban error:', kanbanErr.message);
      }

      // 3. Reschedule or mark completed for one-shot
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

      // 4. Retry with exponential backoff on failure (#18)
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

      if (queuedCount > 0) {
        setImmediate(() => {
          this.runTask(taskId);
        });
      }
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
