import { DurableJournal } from './durable-journal.js';
import { ChainCheckpointManager } from './chain-checkpoints.js';
import { ArtifactManager } from './artifacts.js';
import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';
import fs from 'node:fs';
import path from 'node:path';

import {
  CURRENT_SCHEMA_VERSION,
  runStoreMigrations,
  getDefaultStorePath,
} from './store-migration.js';

import { initStore } from './store-loader.js';

import {
  isAccessOrIoError,
  cleanOrphanedTmpFiles,
  scheduleSave,
  flushSync,
  createSnapshot,
  waitForDiskVersion,
  notifyDiskVersion,
  saveAsync,
  writeStoreStream,
  save,
} from './store-io.js';

import {
  archiveHistoryRuns,
  listMonthlyArchives,
  getMonthlyArchive,
  pruneOldMonthlyArchives,
  getArchivedRuns,
} from './store-archive.js';

import {
  maskSecretValue,
  FORBIDDEN_SETTING_KEYS,
  MASKED_SETTING_KEYS,
  getSettings,
  getClientSettings,
  saveSettings,
} from './store-settings.js';

import {
  getTaskStats,
  getAggregatedStats,
} from './store-stats.js';

export {
  CURRENT_SCHEMA_VERSION,
  runStoreMigrations,
  getDefaultStorePath,
  isAccessOrIoError,
  maskSecretValue,
};

export class TaskStore {
  constructor(filePath) {
    this.filePath = filePath || getDefaultStorePath();
    this.tasks = new Map();
    this.history = new Map();
    this.settings = {};
    this.chainCheckpoints = {};
    this.artifacts = {};
    const storeDir = path.dirname(this.filePath);
    this.durableJournal = new DurableJournal(this);
    this.chainCheckpointManager = new ChainCheckpointManager(this);
    this.artifactManager = new ArtifactManager(path.join(storeDir, "artifacts"));
    this._lastBackupTime = 0;
    this._saveTimer = null;
    this._savePromise = Promise.resolve();
    this._saveVersion = 0;
    this._diskVersion = 0;
    this._lastWrittenVersion = 0;
    this._readOnly = false;
    this._loadFailed = false;
    this._accessErrorCode = null;
    this._loadError = null;
    this.init();
  }

  init() {
    initStore(this);
  }

  _enterReadOnlyMode(err, operation = 'read', filePath = this.filePath) {
    this._readOnly = true;
    this._loadFailed = true;
    this._loadError = err;
    if (isAccessOrIoError(err)) {
      this._accessErrorCode = err.code;
      logger.error(`[dsh-cron] store access error (operation: ${operation}, code: ${err.code}): cannot access "${filePath}". Check file permissions and ownership.`);
    } else {
      this._accessErrorCode = null;
      logger.error(`[dsh-cron] store read error (operation: ${operation}): cannot load tasks from "${filePath}": ${err?.message || err}. Entering read-only recovery mode to protect existing store.`);
    }
  }

  isReadOnly() {
    return Boolean(this._readOnly);
  }

  hasLoadFailed() {
    return Boolean(this._loadFailed);
  }

  isDegraded() {
    return Boolean(this._readOnly || this._loadFailed);
  }

  getAccessErrorCode() {
    return this._accessErrorCode;
  }

  getLoadError() {
    return this._loadError;
  }

  reload() {
    this._readOnly = false;
    this._loadFailed = false;
    this._accessErrorCode = null;
    this._loadError = null;
    this.init();
    return !this._readOnly && !this._loadFailed;
  }

  scheduleSave(delay = 50) {
    return scheduleSave(this, delay);
  }

  flushSync() {
    return flushSync(this);
  }

  _createSnapshot() {
    return createSnapshot(this);
  }

  _waitForDiskVersion(version) {
    return waitForDiskVersion(this, version);
  }

  _notifyDiskVersion(writtenVersion, err = null) {
    return notifyDiskVersion(this, writtenVersion, err);
  }

  async saveAsync() {
    return saveAsync(this);
  }

  async _writeStoreStream(filePath, data, version) {
    return writeStoreStream(this, filePath, data, version);
  }

  save() {
    return save(this);
  }

  getRun(runId) {
    if (!runId) return null;
    for (const [taskId, runs] of this.history.entries()) {
      if (Array.isArray(runs)) {
        const found = runs.find((r) => r.id === runId);
        if (found) return { ...found, taskId };
      }
    }
    return null;
  }

  recordArtifact(runIdOrRecord, maybeRecord) {
    const runId = maybeRecord ? runIdOrRecord : (runIdOrRecord && runIdOrRecord.runId);
    const artifactRecord = maybeRecord ? maybeRecord : runIdOrRecord;
    if (!runId || !artifactRecord) return;
    this.artifacts = this.artifacts || {};
    this.artifacts[runId] = this.artifacts[runId] || [];
    this.artifacts[runId].push(artifactRecord);
    this.scheduleSave(50);
  }

  getArtifactsForRun(runId) {
    if (!runId || !this.artifacts) return [];
    return this.artifacts[runId] || [];
  }

  getSettings() {
    return getSettings(this);
  }

  getClientSettings() {
    return getClientSettings(this);
  }

  static get FORBIDDEN_SETTING_KEYS() {
    return FORBIDDEN_SETTING_KEYS;
  }

  static get MASKED_SETTING_KEYS() {
    return MASKED_SETTING_KEYS;
  }

  saveSettings(newSettings = {}) {
    return saveSettings(this, newSettings);
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
    if (this._readOnly || this._loadFailed) {
      throw new Error(`Store write blocked: read-only recovery mode (${this.filePath})`);
    }
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
      provider: task.provider !== undefined ? task.provider : (prev.provider || null),
      model: task.model !== undefined ? task.model : (prev.model || null),
      notifyTelegram: task.notifyTelegram !== undefined
        ? (task.notifyTelegram === null || task.notifyTelegram === 'inherit' ? undefined : Boolean(task.notifyTelegram))
        : prev.notifyTelegram,
      onlyOnFailure: task.onlyOnFailure !== undefined
        ? (task.onlyOnFailure === null || task.onlyOnFailure === 'inherit' ? undefined : Boolean(task.onlyOnFailure))
        : prev.onlyOnFailure,
      timeoutSeconds: task.timeoutSeconds !== undefined ? Number(task.timeoutSeconds) : (prev.timeoutSeconds || 1800),
      maxMemoryMb: task.maxMemoryMb !== undefined ? Number(task.maxMemoryMb) : (prev.maxMemoryMb || 0),
      executionTimeoutMs: task.executionTimeoutMs !== undefined ? Number(task.executionTimeoutMs) : (prev.executionTimeoutMs || 0),
      maxLogBytesPerRun: task.maxLogBytesPerRun !== undefined ? Number(task.maxLogBytesPerRun) : (prev.maxLogBytesPerRun || (5 * 1024 * 1024)),
      cpus: task.cpus !== undefined ? Number(task.cpus) : (prev.cpus || 0),
      maxArchiveMonths: task.maxArchiveMonths !== undefined ? Number(task.maxArchiveMonths) : (prev.maxArchiveMonths || 6),
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
      sessionTitle: task.sessionTitle !== undefined ? String(task.sessionTitle).trim() : (prev.sessionTitle || ''),
      webhookEnabled: task.webhookEnabled !== undefined
        ? Boolean(task.webhookEnabled)
        : (prev.webhookEnabled !== undefined ? Boolean(prev.webhookEnabled) : Boolean(task.webhookTrigger?.enabled || prev.webhookTrigger?.enabled || false)),
      webhookToken: task.webhookToken !== undefined ? String(task.webhookToken).trim() : (prev.webhookToken || (task.webhookTrigger?.token ? String(task.webhookTrigger.token).trim() : '')),
      webhookSecret: task.webhookSecret !== undefined ? String(task.webhookSecret).trim() : (prev.webhookSecret || (task.webhookTrigger?.secret ? String(task.webhookTrigger.secret).trim() : '')),
      webhookDebounceMs: task.webhookDebounceMs !== undefined ? Number(task.webhookDebounceMs) : (prev.webhookDebounceMs !== undefined ? Number(prev.webhookDebounceMs) : (Number(task.webhookTrigger?.debounceMs || prev.webhookTrigger?.debounceMs) || 0)),
      totalTokens: task.totalTokens !== undefined ? Number(task.totalTokens) : (prev.totalTokens || 0),
      totalCostUsd: task.totalCostUsd !== undefined ? Number(task.totalCostUsd) : (prev.totalCostUsd || 0),
      createdAt: prev.createdAt || task.createdAt || now,
      updatedAt: now,
      lastRunAt: task.lastRunAt !== undefined ? task.lastRunAt : (prev.lastRunAt || null),
      lastStatus: task.lastStatus !== undefined ? task.lastStatus : (prev.lastStatus || null),
      lastDurationMs: task.lastDurationMs !== undefined ? task.lastDurationMs : (prev.lastDurationMs || 0),
      nextRunAt: task.nextRunAt !== undefined ? task.nextRunAt : (prev.nextRunAt || null),
    };
    // Issue #310 / GH #5: strip any undefined properties to guarantee lossless JSON
    for (const key of Object.keys(record)) {
      if (record[key] === undefined) {
        delete record[key];
      }
    }
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
    if (this._readOnly || this._loadFailed) {
      return null;
    }
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
    if (this._readOnly || this._loadFailed) {
      throw new Error(`Store write blocked: read-only recovery mode (${this.filePath})`);
    }
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
    const existingLedger = Array.isArray(task.costLedger) ? task.costLedger : [];
    const cutoff24h = Date.now() - 86400000;
    task.costLedger = [
      ...existingLedger.filter(e => e && typeof e.at === 'number' && e.at >= cutoff24h),
      {
        at: task.lastRunAt,
        costUsd,
        tokens: runTokens,
      },
    ];

    // Immutable copy-on-write history update (#301)
    const prevRuns = this.history.get(id) || [];
    const runs = [
      {
        id: runInfo.runId || runInfo.id || ('run_' + Math.random().toString(36).slice(2, 9)),
        at: task.lastRunAt,
        status: task.lastStatus,
        durationMs: task.lastDurationMs,
        output: (runInfo.output || '').slice(0, 4000),
        error: runInfo.error ? String(runInfo.error).slice(0, 1000) : null,
        usage,
        costUsd,
        stages: Array.isArray(runInfo.stages) ? runInfo.stages : null,
        stoppedReason: runInfo.stoppedReason || null,
        cost: runInfo.cost || {
          amount: costUsd,
          currency: 'USD',
          kind: costUsd > 0 ? 'exact' : ((task.type === 'llm' || task.type === 'skill' || task.type === 'workflow') ? 'unknown' : 'exact')
        },
        delivery: runInfo.delivery || null,
        validation: runInfo.validation || null,
        idempotencyKey: runInfo.idempotencyKey || null,
        chainRunId: runInfo.chainRunId || null,
        artifacts: runInfo.artifacts || null,
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
        doctorReport: runInfo.doctorReport || null,
        subtaskRuns: Array.isArray(runInfo.subtaskRuns) ? runInfo.subtaskRuns : null,
        swarmStats: runInfo.swarmStats || null,
        gitDiff: runInfo.gitDiff || null,
      },
      ...prevRuns,
    ];
    // Truncate raw diff in older active history entries to bound memory and JSON size (#379, GH #17)
    for (let i = 10; i < runs.length; i++) {
      const r = runs[i];
      if (r && r.gitDiff && r.gitDiff.diff && r.gitDiff.diff.length > 2000) {
        r.gitDiff = {
          ...r.gitDiff,
          diff: r.gitDiff.diff.slice(0, 2000) + '\n... [diff truncated in history]',
          truncated: true,
        };
      }
    }
    // Keep up to 100 runs in active store; archive older runs to tasks-history-archive.json (#134)
    if (runs.length > 100) {
      const overflow = runs.splice(100);
      this._archiveHistoryRuns(id, overflow);
    }
    this.history.set(id, runs);
    this.scheduleSave();
  }

  /**
   * Remove orphaned temporary write files older than 10 minutes (#379, GH #17).
   */
  _cleanOrphanedTmpFiles(dir) {
    return cleanOrphanedTmpFiles(dir);
  }

  _archiveHistoryRuns(id, overflowRuns) {
    return archiveHistoryRuns(this, id, overflowRuns);
  }

  listMonthlyArchives() {
    return listMonthlyArchives(this);
  }

  getMonthlyArchive(month) {
    return getMonthlyArchive(this, month);
  }

  _pruneOldMonthlyArchives(dir, maxMonths = 6) {
    return pruneOldMonthlyArchives(dir, maxMonths);
  }

  getArchivedRuns(id, options = {}) {
    return getArchivedRuns(this, id, options);
  }

  getHistory(id, limit = 20) {
    const runs = this.history.get(id) || [];
    return runs.slice(0, limit);
  }

  getTaskStats(id) {
    return getTaskStats(this, id);
  }

  getAggregatedStats() {
    return getAggregatedStats(this);
  }
}
