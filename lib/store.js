import fs from 'node:fs';
import path from 'node:path';

export function getDefaultStorePath() {
  const base = process.env.DSH_DATA_DIR || path.join(process.env.HOME || '.', '.dsh', 'data');
  return path.join(base, 'cron', 'tasks.json');
}

export class TaskStore {
  constructor(filePath) {
    this.filePath = filePath || getDefaultStorePath();
    this.tasks = new Map();
    this.history = new Map();
    this.init();
  }

  init() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tasks)) {
          for (const t of data.tasks) {
            this.tasks.set(t.id, t);
          }
        }
        if (data.history && typeof data.history === 'object') {
          for (const [k, v] of Object.entries(data.history)) {
            this.history.set(k, Array.isArray(v) ? v : []);
          }
        }
      }
    } catch (err) {
      console.error('[dsh-cron] store read error:', err.message);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        version: 1,
        updatedAt: new Date().toISOString(),
        tasks: Array.from(this.tasks.values()),
        history: Object.fromEntries(this.history.entries()),
      };
      const tmp = this.filePath + '.tmp.' + Date.now();
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[dsh-cron] store save error:', err.message);
    }
  }

  list(filter = {}) {
    let all = Array.from(this.tasks.values());
    if (filter.status && filter.status !== 'all') {
      all = all.filter((t) => t.status === filter.status);
    }
    if (filter.query) {
      const q = filter.query.toLowerCase();
      all = all.filter((t) => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.prompt && t.prompt.toLowerCase().includes(q)) ||
        (t.schedule && t.schedule.toLowerCase().includes(q))
      );
    }
    return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  get(id) {
    return this.tasks.get(id);
  }

  set(task) {
    const now = Date.now();
    const id = task.id || ('cron_' + Math.random().toString(36).slice(2, 9));
    const prev = this.tasks.get(id) || {};
    const record = {
      ...prev,
      ...task,
      id,
      title: task.title !== undefined ? task.title : (prev.title || 'Новая задача'),
      schedule: task.schedule !== undefined ? task.schedule : (prev.schedule || '0 9 * * *'),
      scheduleText: task.scheduleText !== undefined ? task.scheduleText : (prev.scheduleText || task.schedule),
      prompt: task.prompt !== undefined ? task.prompt : (prev.prompt || ''),
      type: task.type !== undefined ? task.type : (prev.type || 'llm'),
      status: task.status !== undefined ? task.status : (prev.status || 'active'),
      delivery: task.delivery !== undefined ? task.delivery : (prev.delivery || 'isolated'),
      provider: task.provider !== undefined ? task.provider : prev.provider,
      model: task.model !== undefined ? task.model : prev.model,
      createdAt: prev.createdAt || task.createdAt || now,
      updatedAt: now,
      lastRunAt: task.lastRunAt !== undefined ? task.lastRunAt : (prev.lastRunAt || null),
      lastStatus: task.lastStatus !== undefined ? task.lastStatus : (prev.lastStatus || null),
      lastDurationMs: task.lastDurationMs !== undefined ? task.lastDurationMs : (prev.lastDurationMs || 0),
      nextRunAt: task.nextRunAt !== undefined ? task.nextRunAt : (prev.nextRunAt || null),
    };
    this.tasks.set(id, record);
    this.save();
    return record;
  }

  delete(id) {
    const existed = this.tasks.delete(id);
    this.history.delete(id);
    if (existed) this.save();
    return existed;
  }

  recordRun(id, runInfo) {
    const task = this.tasks.get(id);
    if (!task) return;
    task.lastRunAt = runInfo.at || Date.now();
    task.lastStatus = runInfo.status || 'success';
    task.lastDurationMs = runInfo.durationMs || 0;
    task.updatedAt = Date.now();

    const runs = this.history.get(id) || [];
    runs.unshift({
      id: 'run_' + Math.random().toString(36).slice(2, 9),
      at: task.lastRunAt,
      status: task.lastStatus,
      durationMs: task.lastDurationMs,
      output: (runInfo.output || '').slice(0, 4000),
      error: runInfo.error ? String(runInfo.error).slice(0, 1000) : null,
    });
    if (runs.length > 50) runs.length = 50;
    this.history.set(id, runs);
    this.save();
  }

  getHistory(id, limit = 20) {
    const runs = this.history.get(id) || [];
    return runs.slice(0, limit);
  }
}