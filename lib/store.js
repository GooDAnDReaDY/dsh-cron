import { logger } from './logger.js';
import { bestEffort } from './best-effort.js';
import fs from 'node:fs';
import path from 'node:path';
import { getDshDefaultTelegramCredentials } from './telegram.js';

/**
 * Where plugin data lives.
 *
 * DSH_DATA_DIR wins when the harness sets it. Otherwise the profile home
 * (DSH_HOME) is authoritative: falling back to ~/.dsh would make an isolated
 * profile — a test contour, a second profile — write its tasks into another
 * home's data directory, which is how an isolated test cycle once leaked a
 * task into the wrong profile.
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
    this._lastBackupTime = 0;
    this._saveTimer = null;
    this._savePromise = Promise.resolve();
    this._saveVersion = 0;
    this._diskVersion = 0;
    this._lastWrittenVersion = 0;
    this.init();
  }

  init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    bestEffort('chmod-dir', () => fs.chmodSync(dir, 0o700));
    const bakPath = `${this.filePath}.bak`;

    const loadData = (raw) => {
      const data = JSON.parse(raw);
      this.tasks.clear();
      this.history.clear();
      if (Array.isArray(data.tasks)) {
        const now = Date.now();
        const cutoff24h = now - 86400000;
        for (const t of data.tasks) {
          if (Array.isArray(t.costLedger) && t.costLedger.length > 0) {
            t.costLedger = t.costLedger.filter(e => e && typeof e.at === 'number' && e.at >= cutoff24h);
          } else {
            // Seed from active history if present (#221)
            const hist = (data.history && Array.isArray(data.history[t.id])) ? data.history[t.id] : [];
            t.costLedger = hist
              .filter(r => r && typeof r.at === 'number' && r.at >= cutoff24h)
              .map(r => ({
                at: r.at,
                costUsd: Number(r.costUsd) || 0,
                tokens: (r.usage?.inputTokens || 0) + (r.usage?.outputTokens || 0) + (r.usage?.cacheReadTokens || 0),
              }));
          }
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
    };

    if (fs.existsSync(this.filePath)) {
      try {
        bestEffort('chmod-store', () => fs.chmodSync(this.filePath, 0o600));
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        loadData(raw);
        if (!fs.existsSync(bakPath)) {
          bestEffort('backup-initial', () => {
            fs.copyFileSync(this.filePath, bakPath);
            fs.chmodSync(bakPath, 0o600);
          });
        } else {
          bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
        }
      } catch (err) {
        logger.error('[dsh-cron] store read error (corrupted file):', err.message);
        try {
          const corruptedPath = `${this.filePath}.corrupted.${Date.now()}`;
          fs.copyFileSync(this.filePath, corruptedPath);
          bestEffort('chmod-corrupted', () => fs.chmodSync(corruptedPath, 0o600));
          logger.warn(`[dsh-cron] corrupted store backed up to ${corruptedPath}`);
        } catch (snapErr) {
          logger.error('[dsh-cron] failed to snapshot corrupted store:', snapErr.message);
        }
        if (fs.existsSync(bakPath)) {
          try {
            bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
            const rawBak = fs.readFileSync(bakPath, 'utf-8');
            loadData(rawBak);
            logger.warn(`[dsh-cron] successfully recovered tasks store from ${bakPath}`);
          } catch (bakErr) {
            logger.error('[dsh-cron] failed to recover tasks store from .bak:', bakErr.message);
          }
        }
      }
    } else if (fs.existsSync(bakPath)) {
      try {
        bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
        const rawBak = fs.readFileSync(bakPath, 'utf-8');
        loadData(rawBak);
        bestEffort('restore-from-bak', () => {
          fs.copyFileSync(bakPath, this.filePath);
          fs.chmodSync(this.filePath, 0o600);
        });
        logger.warn(`[dsh-cron] restored missing tasks store from ${bakPath}`);
      } catch (bakErr) {
        logger.error('[dsh-cron] failed to restore tasks store from .bak:', bakErr.message);
      }
    }
  }

  /**
   * Schedule a debounced save using the asynchronous write queue to avoid
   * blocking the event loop on large task stores (#244).
   */
  scheduleSave(delay = 50) {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveAsync().catch((err) => {
        logger.error('[dsh-cron] debounced save failed:', err.message);
      });
    }, delay);
    if (typeof this._saveTimer.unref === 'function') {
      this._saveTimer.unref();
    }
  }

  /**
   * Synchronously flush any pending debounced save to disk.
   */
  flushSync() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.save();
  }

  /**
   * Asynchronously serialize and write tasks store to disk using fs.promises queue (#244).
   * Safe mode 0600 on files and 0700 on dir (#222).
   */
  async saveAsync() {
    const version = ++this._saveVersion;
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      tasks: Array.from(this.tasks.values()),
      history: Object.fromEntries(this.history.entries()),
      settings: this.settings || {},
    };

    const writeOp = async () => {
      if ((this._diskVersion || 0) >= version || (this._lastSyncVersion || 0) >= version) {
        return;
      }
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
      bestEffort('chmod-dir', () => fs.chmodSync(dir, 0o700));

      const rand = Math.random().toString(36).slice(2, 8);
      const tmp = `${this.filePath}.tmp.${process.pid}_${Date.now()}_${rand}`;
      this._currentAsyncTmp = tmp;

      // Use compact serialization without whitespace indentation to eliminate event loop lag on large stores (#244)
      const payload = JSON.stringify(data);
      await fs.promises.writeFile(tmp, payload, { encoding: 'utf-8', mode: 0o600 });
      bestEffort('chmod-tmp', () => fs.chmodSync(tmp, 0o600));

      if ((this._diskVersion || 0) >= version || (this._lastSyncVersion || 0) >= version || this._saveVersion > version) {
        await fs.promises.unlink(tmp).catch(() => {});
        if (this._currentAsyncTmp === tmp) this._currentAsyncTmp = null;
        return;
      }

      try {
        await fs.promises.rename(tmp, this.filePath);
        bestEffort('chmod-store', () => fs.chmodSync(this.filePath, 0o600));
        this._currentAsyncTmp = null;
        this._diskVersion = version;
        this._lastWrittenVersion = version;
      } catch (err) {
        this._currentAsyncTmp = null;
        // If tmp was unlinked by newer sync save, rename will fail with ENOENT - safely ignore only in that case (#244)
        if (err.code === 'ENOENT' && (this._lastSyncVersion || 0) >= version) {
          return;
        }
        throw err;
      }

      const now = Date.now();
      if (now - this._lastBackupTime > 60000) {
        this._lastBackupTime = now;
        try {
          const bakPath = `${this.filePath}.bak`;
          await fs.promises.copyFile(this.filePath, bakPath);
          bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
        } catch (bakErr) {
          logger.warn('[dsh-cron] async backup copy failed:', bakErr.message);
        }
      }
    };

    this._savePromise = this._savePromise.then(writeOp, writeOp);
    return this._savePromise;
  }

  save() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    const version = ++this._saveVersion;
    this._lastSyncVersion = version;

    // Immediately cancel and unlink any in-flight async tmp file so async rename cannot touch disk (#244)
    if (this._currentAsyncTmp) {
      const inFlightTmp = this._currentAsyncTmp;
      this._currentAsyncTmp = null;
      bestEffort('unlink-async-tmp', () => fs.unlinkSync(inFlightTmp));
    }
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      bestEffort('chmod-dir', () => fs.chmodSync(dir, 0o700));
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
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
      bestEffort('chmod-tmp', () => fs.chmodSync(tmp, 0o600));
      fs.renameSync(tmp, this.filePath);
      bestEffort('chmod-store', () => fs.chmodSync(this.filePath, 0o600));
      this._diskVersion = Math.max(this._diskVersion || 0, version);
      this._lastWrittenVersion = this._diskVersion;

      // Throttled backup (.bak): avoid expensive copyFileSync on every micro-save
      const now = Date.now();
      if (now - this._lastBackupTime > 60000) {
        this._lastBackupTime = now;
        bestEffort('backup-on-save', () => {
          const bakPath = `${this.filePath}.bak`;
          fs.copyFileSync(this.filePath, bakPath);
          fs.chmodSync(bakPath, 0o600);
        });
      }
    } catch (err) {
      logger.error('[dsh-cron] store save error:', err.message);
      throw err;
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
    base.llmActionsEnabled = Boolean(base.llmActionsEnabled);
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
    return ['botToken', 'discordWebhookUrl', 'slackWebhookUrl', 'barkKey', 'apiToken', 'telegramWebhookSecret'];
  }

  saveSettings(newSettings = {}) {
    const patch = { ...newSettings };

    for (const key of TaskStore.FORBIDDEN_SETTING_KEYS) {
      if (key in patch) {
        logger.warn(`[dsh-cron] refusing to store raw secret "${key}" in settings — use a credential reference instead`);
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

    const prevSettings = this.settings;
    this.settings = {
      ...this.settings,
      ...patch,
      botToken: botTokenToSave,
      kanbanBaseUrl: patch.kanbanBaseUrl !== undefined
        ? (patch.kanbanBaseUrl || 'http://127.0.0.1:3000')
        : (this.settings.kanbanBaseUrl || 'http://127.0.0.1:3000'),
      notifyTelegram: patch.notifyTelegram !== undefined ? Boolean(patch.notifyTelegram) : Boolean(this.settings.notifyTelegram),
      onlyOnFailure: patch.onlyOnFailure !== undefined ? Boolean(patch.onlyOnFailure) : Boolean(this.settings.onlyOnFailure),
      llmActionsEnabled: patch.llmActionsEnabled !== undefined ? Boolean(patch.llmActionsEnabled) : Boolean(this.settings.llmActionsEnabled),
    };
    try {
      this.save();
    } catch (err) {
      this.settings = prevSettings;
      throw err;
    }
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
    const existing = this.tasks.get(id);
    const prev = existing || {};
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
      notifyTelegram: task.notifyTelegram !== undefined
        ? (task.notifyTelegram === null || task.notifyTelegram === 'inherit' ? undefined : Boolean(task.notifyTelegram))
        : prev.notifyTelegram,
      onlyOnFailure: task.onlyOnFailure !== undefined
        ? (task.onlyOnFailure === null || task.onlyOnFailure === 'inherit' ? undefined : Boolean(task.onlyOnFailure))
        : prev.onlyOnFailure,
      timeoutSeconds: task.timeoutSeconds !== undefined ? Number(task.timeoutSeconds) : (prev.timeoutSeconds || 1800),
      overlapPolicy: task.overlapPolicy !== undefined ? String(task.overlapPolicy) : (prev.overlapPolicy || 'skip'),
      kanbanMode: task.kanbanMode !== undefined ? String(task.kanbanMode) : (prev.kanbanMode || 'none'), // 'none' | 'on_failure' | 'always'
      onSuccess: task.onSuccess !== undefined ? String(task.onSuccess).trim() : (prev.onSuccess || ''),
      onFailure: task.onFailure !== undefined ? String(task.onFailure).trim() : (prev.onFailure || ''),
      oneShot: task.oneShot !== undefined ? Boolean(task.oneShot) : Boolean(prev.oneShot),
      heartbeatIntervalSeconds: task.heartbeatIntervalSeconds !== undefined ? Number(task.heartbeatIntervalSeconds) : (prev.heartbeatIntervalSeconds || 0),
      gracePeriodSeconds: task.gracePeriodSeconds !== undefined ? Number(task.gracePeriodSeconds) : (prev.gracePeriodSeconds || 300),
      lastPingAt: task.lastPingAt !== undefined ? task.lastPingAt : (prev.lastPingAt || null),
      heartbeatAlerted: task.heartbeatAlerted !== undefined ? Boolean(task.heartbeatAlerted) : (prev.heartbeatAlerted || false),
      preflightType: task.preflightType !== undefined ? String(task.preflightType) : (prev.preflightType || 'none'),
      preflightTarget: task.preflightTarget !== undefined ? String(task.preflightTarget).trim() : (prev.preflightTarget || ''),
      concurrencyGroup: task.concurrencyGroup !== undefined ? String(task.concurrencyGroup).trim() : (prev.concurrencyGroup || 'default'),
      priority: task.priority !== undefined ? Number(task.priority) : (prev.priority || 5),
      selfHealingCommand: task.selfHealingCommand !== undefined ? String(task.selfHealingCommand).trim() : (prev.selfHealingCommand || ''),
      autoDiagnose: task.autoDiagnose !== undefined ? Boolean(task.autoDiagnose) : (prev.autoDiagnose || false),
      agentPreset: task.agentPreset !== undefined ? String(task.agentPreset).trim() : (prev.agentPreset || ''),
      targetSessionId: task.targetSessionId !== undefined ? String(task.targetSessionId).trim() : (prev.targetSessionId || ''),
      targetSessionReset: task.targetSessionReset !== undefined ? String(task.targetSessionReset).trim() : (prev.targetSessionReset || 'never'),
      totalTokens: task.totalTokens !== undefined ? Number(task.totalTokens) : (prev.totalTokens || 0),
      totalCostUsd: task.totalCostUsd !== undefined ? Number(task.totalCostUsd) : (prev.totalCostUsd || 0),
      createdAt: prev.createdAt || task.createdAt || now,
      updatedAt: now,
      lastRunAt: task.lastRunAt !== undefined ? task.lastRunAt : (prev.lastRunAt || null),
      lastStatus: task.lastStatus !== undefined ? task.lastStatus : (prev.lastStatus || null),
      lastDurationMs: task.lastDurationMs !== undefined ? task.lastDurationMs : (prev.lastDurationMs || 0),
      nextRunAt: task.nextRunAt !== undefined ? task.nextRunAt : (prev.nextRunAt || null),
    };
    this.tasks.set(id, record);
    try {
      this.save();
    } catch (err) {
      if (existing) this.tasks.set(id, existing);
      else this.tasks.delete(id);
      throw err;
    }
    return record;
  }

  recordHeartbeat(id) {
    const task = this.tasks.get(id);
    if (!task) return null;
    const now = Date.now();
    const prevPing = task.lastPingAt;
    const prevAlerted = task.heartbeatAlerted;
    const prevUpdated = task.updatedAt;
    const prevStatus = task.lastStatus;
    task.lastPingAt = now;
    task.heartbeatAlerted = false;
    task.updatedAt = now;
    if (task.lastStatus === 'missed') {
      task.lastStatus = 'active';
    }
    try {
      this.save();
    } catch (err) {
      task.lastPingAt = prevPing;
      task.heartbeatAlerted = prevAlerted;
      task.updatedAt = prevUpdated;
      task.lastStatus = prevStatus;
      throw err;
    }
    const interval = (task.heartbeatIntervalSeconds || 0) + (task.gracePeriodSeconds || 300);
    return {
      ok: true,
      id,
      taskId: id,
      lastPingAt: now,
      nextDeadline: now + interval * 1000,
    };
  }

  delete(id) {
    const existing = this.tasks.get(id);
    if (!existing) return false;
    const existingHistory = this.history.get(id);
    this.tasks.delete(id);
    this.history.delete(id);
    try {
      this.save();
    } catch (err) {
      this.tasks.set(id, existing);
      if (existingHistory) this.history.set(id, existingHistory);
      throw err;
    }
    return true;
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

    // Rolling 24h cost ledger preserved across archive rotation and restarts (#221)
    if (!Array.isArray(task.costLedger)) {
      task.costLedger = [];
    }
    task.costLedger.push({
      at: task.lastRunAt,
      costUsd,
      tokens: runTokens,
    });
    const cutoff24h = Date.now() - 86400000;
    task.costLedger = task.costLedger.filter(e => e && typeof e.at === 'number' && e.at >= cutoff24h);

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
      // #44: this run was suppressed by its silent rule, with the reason.
      silentSkip: Boolean(runInfo.silentSkip),
      silentReason: runInfo.silentSkip ? String(runInfo.silentReason || '').slice(0, 500) : '',
      // #43: the failure diagnosis and the prompt change it proposes.
      diagnosis: runInfo.diagnosis ? String(runInfo.diagnosis).slice(0, 1000) : '',
      suggestion: runInfo.suggestion ? String(runInfo.suggestion).slice(0, 2000) : '',
      selfHealing: runInfo.selfHealing || null,
      autoDiagnosis: runInfo.autoDiagnosis ? String(runInfo.autoDiagnosis).slice(0, 1000) : '',
      confidence: runInfo.confidence || '',
    });
    // Keep up to 100 runs in active store; archive older runs to tasks-history-archive.json (#134)
    if (runs.length > 100) {
      const overflow = runs.splice(100);
      this._archiveHistoryRuns(id, overflow);
    }
    this.history.set(id, runs);
    this.scheduleSave();
  }

  /**
   * Append rotated overflow history entries into tasks-history-archive.json (#134).
   */
  _archiveHistoryRuns(id, overflowRuns) {
    if (!Array.isArray(overflowRuns) || overflowRuns.length === 0) return;
    try {
      const dir = path.dirname(this.filePath);
      const archivePath = path.join(dir, 'tasks-history-archive.json');
      let archive = {};
      if (fs.existsSync(archivePath)) {
        archive = bestEffort('parse-history-archive', () => JSON.parse(fs.readFileSync(archivePath, 'utf-8'))) || {};
      }
      if (!Array.isArray(archive[id])) archive[id] = [];
      archive[id].push(...overflowRuns);
      if (archive[id].length > 1000) {
        archive[id] = archive[id].slice(-1000);
      }
      // Write atomically with tmp file using compact JSON (avoiding mega-lines and null, 2 serialization bloat)
      const rand = Math.random().toString(36).slice(2, 8);
      const tmp = `${archivePath}.tmp.${process.pid}_${Date.now()}_${rand}`;
      fs.writeFileSync(tmp, JSON.stringify(archive), { encoding: 'utf-8', mode: 0o600 });
      bestEffort('chmod-tmp', () => fs.chmodSync(tmp, 0o600));
      fs.renameSync(tmp, archivePath);
      bestEffort('chmod-archive', () => fs.chmodSync(archivePath, 0o600));
    } catch (archiveErr) {
      logger.error('[dsh-cron] history archive error:', archiveErr.message);
    }
  }

  getHistory(id, limit = 20) {
    const runs = this.history.get(id) || [];
    return runs.slice(0, limit);
  }

  getArchivedRuns(id, { limit = 50, offset = 0, search = '' } = {}) {
    try {
      const dir = path.dirname(this.filePath);
      const archivePath = path.join(dir, 'tasks-history-archive.json');
      if (!fs.existsSync(archivePath)) return { runs: [], total: 0 };
      const archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8')) || {};
      let runs = Array.isArray(archive[id]) ? [...archive[id]].sort((a, b) => ((b.at || b.timestamp || b.startedAt || 0) - (a.at || a.timestamp || a.startedAt || 0))) : [];
      if (search && search.trim()) {
        const q = search.toLowerCase();
        runs = runs.filter(r => (r.output && r.output.toLowerCase().includes(q)) || (r.error && r.error.toLowerCase().includes(q)));
      }
      const total = runs.length;
      const paged = runs.slice(offset, offset + limit);
      return { runs: paged, total };
    } catch (err) {
      return { runs: [], total: 0, error: err.message };
    }
  }

  getTaskStats(id) {
    const runs = this.history.get(id) || [];
    const total = runs.length;
    let success = 0;
    let error = 0;
    let timeout = 0;
    const recentDurations = [];

    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.status === 'success') success++;
      else if (r.status === 'error') error++;
      else if (r.status === 'timeout') timeout++;

      if (recentDurations.length < 10 && r.durationMs !== undefined) {
        recentDurations.push({
          at: r.at,
          durationMs: r.durationMs,
          status: r.status,
        });
      }
    }

    const successRate = total > 0 ? Number((success / total).toFixed(2)) : 1.0;
    return {
      totalRuns: total,
      successRuns: success,
      errorRuns: error,
      timeoutRuns: timeout,
      successRate,
      recentDurations,
    };
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
