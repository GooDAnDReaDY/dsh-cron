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
    if (m.startsWith('*/')) return `Каждые ${m.slice(2)} минут`;
    if (dow === '1-5' && dom === '*' && mon === '*') {
      return `В будние дни в ${pad(h)}:${pad(m)}`;
    }
    if (dow === '*' && dom === '*' && mon === '*') {
      return `Каждый день в ${pad(h)}:${pad(m)}`;
    }
    if (dow === '5' && dom === '*' && mon === '*') {
      return `Пятницы в ${pad(h)}:${pad(m)}`;
    }
  }
  return cronPattern;
}

export function parseScheduleExpression(input) {
  const str = String(input || '').trim();
  if (!str) throw new Error('Строка расписания не должна быть пустой');

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
      humanText: `Разово: ${parsedDate.toLocaleString('ru-RU')}`,
      nextRun: targetMs
    };
  }

  // 2. Relative one-shot: "in 20m", "in 2h", "in 30s", "in 1d", "через 15 минут"
  const inRelMatch = str.match(/^(?:in\s+|через\s+)(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|мин|минут|часа?|часов)?$/i);
  if (inRelMatch) {
    const num = parseInt(inRelMatch[1], 10);
    const unit = (inRelMatch[2] || 'm').toLowerCase();
    let delayMs = num * 60 * 1000;
    let unitText = `${num} мин`;
    if (unit.startsWith('s')) {
      delayMs = num * 1000;
      unitText = `${num} сек`;
    } else if (unit.startsWith('h') || unit.startsWith('час')) {
      delayMs = num * 3600 * 1000;
      unitText = `${num} ч`;
    } else if (unit.startsWith('d')) {
      delayMs = num * 86400 * 1000;
      unitText = `${num} дн`;
    }
    const targetMs = Date.now() + delayMs;
    return {
      cronPattern: null,
      isOneShot: true,
      targetTimestamp: targetMs,
      humanText: `Разово через ${unitText} (${new Date(targetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
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
        humanText: `Каждые ${num} минут`,
        isInterval: true,
      };
    }
    if (unit.startsWith('h')) {
      return {
        cronPattern: `0 */${num} * * *`,
        humanText: `Каждые ${num} часов`,
        isInterval: true,
      };
    }
    if (unit.startsWith('d')) {
      return {
        cronPattern: `0 0 */${num} * *`,
        humanText: `Каждые ${num} дней`,
        isInterval: true,
      };
    }
  }

  // 4. Friendly recurring aliases
  const lower = str.toLowerCase();
  if (lower === 'daily' || lower === 'каждый день') {
    return { cronPattern: '0 9 * * *', humanText: 'Каждый день в 09:00' };
  }
  if (lower === 'weekdays' || lower === 'в будние дни' || lower === 'по будням') {
    return { cronPattern: '0 9 * * 1-5', humanText: 'В будние дни в 09:00' };
  }
  if (lower === 'hourly' || lower === 'каждый час') {
    return { cronPattern: '0 * * * *', humanText: 'Каждый час' };
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
    throw new Error('Некорректное расписание cron: ' + err.message);
  }
}

export class TaskScheduler {
  constructor(store, executeFn) {
    this.store = store;
    this.executeFn = executeFn;
    this.jobs = new Map(); // taskId -> Cron instance
    this.timers = new Map(); // taskId -> setTimeout handle (for one-shot tasks)
    this.running = new Map(); // taskId -> { controller, startedAt, queueCount }
  }

  start() {
    const tasks = this.store.list();
    for (const task of tasks) {
      if (task.status === 'active') {
        this.scheduleTask(task);
      }
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

    for (const [, run] of this.running.entries()) {
      try {
        run.controller.abort(new Error('Планировщик остановлен'));
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

    try {
      const parsed = parseScheduleExpression(task.schedule);

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
      const job = new Cron(parsed.cronPattern, { protect: true }, async () => {
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
          output: 'Запуск пропущен: предыдущий процесс ещё не завершился (overlapPolicy: skip)',
          error: null,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        });
        return;
      }
      if (overlapPolicy === 'replace') {
        console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, canceling current run (overlapPolicy: replace)`);
        active.controller.abort(new Error('Прервано из-за политики overlap: replace'));
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

    try {
      if (typeof this.executeFn === 'function') {
        const res = await this.executeFn(task, { signal: controller.signal });
        if (typeof res === 'object' && res !== null) {
          output = res.output || '';
          usage = res.usage || usage;
          costUsd = res.costUsd || 0;
        } else {
          output = String(res || '');
        }
      }
    } catch (err) {
      status = 'error';
      error = err.message || String(err);
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
          const cardTitle = isErr ? `[Сбой cron] ${task.title}` : `[Cron завершен] ${task.title}`;
          const cardBody = [
            `**Задача cron:** ${task.title} (\`${task.id}\`)`,
            `**Расписание:** ${task.scheduleText || task.schedule}`,
            `**Статус:** ${runInfo.status}`,
            `**Время запуска:** ${new Date(runInfo.at).toLocaleString('ru-RU')}`,
            runInfo.error ? `\n**Ошибка:**\n\`\`\`\n${runInfo.error}\n\`\`\`` : '',
            runInfo.output ? `\n**Лог / Вывод:**\n\`\`\`\n${runInfo.output.slice(0, 1000)}\n\`\`\`` : '',
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
        running.controller.abort(new Error('Задача приостановлена'));
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

  removeTask(taskId) {
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
        running.controller.abort(new Error('Задача удалена'));
      } catch {}
      this.running.delete(taskId);
    }
    return this.store.delete(taskId);
  }

  triggerManualRun(taskId) {
    return this.runTask(taskId);
  }

  getNextRun(schedule) {
    try {
      const parsed = parseScheduleExpression(schedule);
      if (parsed.isOneShot) {
        return parsed.targetTimestamp;
      }
      const tempJob = new Cron(parsed.cronPattern);
      const next = tempJob.nextRun();
      return next ? next.getTime() : null;
    } catch {
      return null;
    }
  }
}
