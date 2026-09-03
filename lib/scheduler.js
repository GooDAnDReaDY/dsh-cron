import { Cron } from 'croner';

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
    this.jobs = new Map();
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
  }

  scheduleTask(task) {
    if (this.jobs.has(task.id)) {
      this.jobs.get(task.id).stop();
      this.jobs.delete(task.id);
    }

    if (task.status !== 'active') return;

    try {
      const parsed = parseScheduleExpression(task.schedule);
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

    const start = Date.now();
    let status = 'success';
    let output = '';
    let error = null;

    try {
      if (typeof this.executeFn === 'function') {
        output = await this.executeFn(task);
      }
    } catch (err) {
      status = 'error';
      error = err.message || String(err);
    } finally {
      const durationMs = Date.now() - start;
      this.store.recordRun(taskId, {
        at: start,
        status,
        durationMs,
        output,
        error,
      });

      const job = this.jobs.get(taskId);
      if (job) {
        const next = job.nextRun();
        task.nextRunAt = next ? next.getTime() : null;
        this.store.set(task);
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
    return this.store.delete(taskId);
  }

  getNextRun(schedule) {
    try {
      const parsed = parseScheduleExpression(schedule);
      const tempJob = new Cron(parsed.cronPattern);
      const next = tempJob.nextRun();
      return next ? next.getTime() : null;
    } catch {
      return null;
    }
  }
}