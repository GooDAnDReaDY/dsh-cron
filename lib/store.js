import fs from 'node:fs';
import path from 'node:path';
import { getDshDefaultTelegramCredentials } from './telegram.js';

/**
 * Where plugin data lives.
 *
 * DSH_DATA_DIR wins when the harness sets it. Otherwise the profile home
 * (DSH_HOME) is authoritative: falling back to ~/.dsh would make an isolated
 * profile — a test contour, a second profile — write its tasks into another
 * home's data directory, which is how the MiniPC test cycle leaked a task into
 * the non-test profile.
 */
export function getDefaultStorePath() {
  const base = process.env.DSH_DATA_DIR
    || (process.env.DSH_HOME
      ? path.join(process.env.DSH_HOME, 'data')
      : path.join(process.env.HOME || '.', '.dsh', 'data'));
  return path.join(base, 'cron', 'tasks.json');
}

/** Mask a secret for transport to the browser, keeping a readable hint. */
function maskSecretValue(value) {
  const s = String(value == null ? '' : value);
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-3);
}

export class TaskStore {
  constructor(filePath) {
    this.filePath = filePath || getDefaultStorePath();
    this.tasks = new Map();
    this.history = new Map();
    this.settings = {};
    this._savePromise = Promise.resolve();
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
        if (data.settings && typeof data.settings === 'object') {
          this.settings = data.settings;
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
        settings: this.settings || {},
      };
      // Unique tmp file per save call with process PID and random token to eliminate file collision
      const rand = Math.random().toString(36).slice(2, 8);
      const tmp = `${this.filePath}.tmp.${process.pid}_${Date.now()}_${rand}`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[dsh-cron] store save error:', err.message);
    }
  }

  getSettings() {
    const defaults = getDshDefaultTelegramCredentials();
    const base = { ...this.settings };
    base.botToken = base.botToken !== undefined ? base.botToken : (defaults.botToken || '');
    base.botTokenRef = base.botTokenRef || '';
    base.chatId = base.chatId !== undefined ? base.chatId : (defaults.chatId || '');
    base.notifyTelegram = Boolean(base.notifyTelegram);
    base.onlyOnFailure = Boolean(base.onlyOnFailure);
    base.kanbanBaseUrl = base.kanbanBaseUrl || 'http://127.0.0.1:3000';
    base.hasDefaultCredentials = Boolean(defaults.botToken && defaults.chatId);
    return base;
  }

  getClientSettings() {
    const raw = this.getSettings();
    const isCustom = Boolean(this.settings.botToken);
    const hasToken = Boolean(raw.botToken);
    const masked = hasToken ? (raw.botToken.length > 8 ? raw.botToken.slice(0, 4) + '••••••••' + raw.botToken.slice(-3) : '••••••••') : '';
    const { botToken, ...rest } = raw;
    const out = {
      ...rest,
      botToken: masked,
      botTokenMasked: masked,
      hasBotToken: hasToken,
      hasCustomBotToken: isCustom,
    };
    // Webhook URLs and the Bark device key carry an embedded secret, so they
    // are never sent to the browser in clear text either.
    for (const key of TaskStore.MASKED_SETTING_KEYS) {
      if (key === 'botToken') continue;
      out[key] = maskSecretValue(raw[key]);
    }
    return out;
  }

  /**
   * Raw secret values that must not be stored in plugin settings; the
   * corresponding *Ref credential names are the supported way to configure
   * these channels.
   */
  static get FORBIDDEN_SETTING_KEYS() {
    return ['giteaToken', 'ntfyToken', 'pushplusToken', 'discordToken', 'slackToken'];
  }

  /**
   * Settings that hold a secret and are therefore masked on read: tokens and
   * webhook URLs (the URL embeds the auth token), plus the Bark device key.
   * These are stored in the plugin settings file; the credential-reference
   * fields (botTokenRef, ntfyTokenRef, …) take precedence over them.
   */
  static get MASKED_SETTING_KEYS() {
    return ['botToken', 'discordWebhookUrl', 'slackWebhookUrl', 'barkKey'];
  }

  saveSettings(newSettings = {}) {
    const patch = { ...newSettings };

    for (const key of TaskStore.FORBIDDEN_SETTING_KEYS) {
      if (key in patch) {
        console.warn(`[dsh-cron] refusing to store raw secret "${key}" in settings — use a credential reference instead`);
        delete patch[key];
      }
    }

    let botTokenToSave = this.settings.botToken || '';
    if (patch.botToken !== undefined) {
      const val = String(patch.botToken).trim();
      // If client sends masked token or empty string while custom token existed, don't overwrite with dots
      if (val && !val.includes('••') && !val.includes('****')) {
        botTokenToSave = val;
      } else if (val === '') {
        botTokenToSave = '';
      }
      delete patch.botToken;
    }

    // A masked value echoed back by the UI must never overwrite the real one.
    for (const key of TaskStore.MASKED_SETTING_KEYS) {
      if (key === 'botToken') continue;
      const val = patch[key];
      if (typeof val === 'string' && (val.includes('••') || val.includes('****'))) {
        delete patch[key];
      }
    }

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete patch[key];
      else if (typeof value === 'string') patch[key] = value.trim();
    }

    this.settings = {
      ...this.settings,
      ...patch,
      botToken: botTokenToSave,
      kanbanBaseUrl: patch.kanbanBaseUrl !== undefined
        ? (patch.kanbanBaseUrl || 'http://127.0.0.1:3000')
        : (this.settings.kanbanBaseUrl || 'http://127.0.0.1:3000'),
      notifyTelegram: patch.notifyTelegram !== undefined ? Boolean(patch.notifyTelegram) : Boolean(this.settings.notifyTelegram),
      onlyOnFailure: patch.onlyOnFailure !== undefined ? Boolean(patch.onlyOnFailure) : Boolean(this.settings.onlyOnFailure),
    };
    this.save();
    return this.getSettings();
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
      title: task.title !== undefined ? task.title : (prev.title || 'New task'),
      schedule: task.schedule !== undefined ? task.schedule : (prev.schedule || '0 9 * * *'),
      scheduleText: task.scheduleText !== undefined ? task.scheduleText : (prev.scheduleText || task.schedule),
      prompt: task.prompt !== undefined ? task.prompt : (prev.prompt || ''),
      type: task.type !== undefined ? task.type : (prev.type || 'llm'),
      status: task.status !== undefined ? task.status : (prev.status || 'active'),
      delivery: task.delivery !== undefined ? task.delivery : (prev.delivery || 'isolated'),
      provider: task.provider !== undefined ? task.provider : prev.provider,
      model: task.model !== undefined ? task.model : prev.model,
      notifyTelegram: task.notifyTelegram !== undefined ? Boolean(task.notifyTelegram) : (prev.notifyTelegram || false),
      onlyOnFailure: task.onlyOnFailure !== undefined ? Boolean(task.onlyOnFailure) : (prev.onlyOnFailure || false),
      timeoutSeconds: task.timeoutSeconds !== undefined ? Number(task.timeoutSeconds) : (prev.timeoutSeconds || 1800),
      overlapPolicy: task.overlapPolicy !== undefined ? String(task.overlapPolicy) : (prev.overlapPolicy || 'skip'),
      kanbanMode: task.kanbanMode !== undefined ? String(task.kanbanMode) : (prev.kanbanMode || 'none'), // 'none' | 'on_failure' | 'always'
      oneShot: task.oneShot !== undefined ? Boolean(task.oneShot) : Boolean(prev.oneShot),
      totalTokens: prev.totalTokens || 0,
      totalCostUsd: prev.totalCostUsd || 0,
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
    
    // Track usage and cost
    const usage = runInfo.usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    const costUsd = Number(runInfo.costUsd) || 0;
    const runTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.cacheReadTokens || 0);

    task.totalTokens = (task.totalTokens || 0) + runTokens;
    task.totalCostUsd = Number(((task.totalCostUsd || 0) + costUsd).toFixed(6));
    task.updatedAt = Date.now();

    const runs = this.history.get(id) || [];
    runs.unshift({
      id: 'run_' + Math.random().toString(36).slice(2, 9),
      at: task.lastRunAt,
      status: task.lastStatus,
      durationMs: task.lastDurationMs,
      output: (runInfo.output || '').slice(0, 4000),
      error: runInfo.error ? String(runInfo.error).slice(0, 1000) : null,
      usage,
      costUsd,
      sessionId: runInfo.sessionId || null,
      // #45: which model produced the run, and whether it only finished thanks
      // to the configured fallback.
      model: runInfo.model || '',
      fallback: Boolean(runInfo.fallback),
    });
    if (runs.length > 50) runs.length = 50;
    this.history.set(id, runs);
    this.save();
  }

  getHistory(id, limit = 20) {
    const runs = this.history.get(id) || [];
    return runs.slice(0, limit);
  }

  getAggregatedStats() {
    let totalRuns = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let activeTasks = 0;

    for (const t of this.tasks.values()) {
      if (t.status === 'active') activeTasks++;
      totalTokens += (t.totalTokens || 0);
      totalCostUsd += (t.totalCostUsd || 0);
      const h = this.history.get(t.id) || [];
      totalRuns += h.length;
    }

    return {
      activeTasks,
      totalRuns,
      totalTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
    };
  }
}
