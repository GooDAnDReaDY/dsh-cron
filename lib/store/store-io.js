import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';
import { CURRENT_SCHEMA_VERSION } from './store-migration.js';

export function isAccessOrIoError(err) {
  if (!err) return false;
  const codes = ['EACCES', 'EPERM', 'EIO', 'EBUSY', 'EROFS', 'EMFILE', 'ENFILE'];
  return Boolean(err.code && codes.includes(err.code));
}

export function cleanOrphanedTmpFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith('tasks.json.tmp.') || f.startsWith('tasks-history-archive.json.tmp.')) {
        const full = path.join(dir, f);
        bestEffort('clean-tmp-file', () => {
          const stat = fs.statSync(full);
          if (now - stat.mtimeMs > 10 * 60 * 1000) {
            fs.unlinkSync(full);
            logger.info(`[dsh-cron] cleaned orphaned temporary store file: ${f}`);
          }
        });
      }
    }
  } catch (err) {
    bestEffort('log-clean-err', () => logger.debug?.(`[dsh-cron] clean tmp files error: ${err.message}`));
  }
}

export function scheduleSave(store, delay = 50) {
  if (store._readOnly || store._loadFailed) {
    return;
  }
  if (store._saveTimer) return;
  store._saveTimer = setTimeout(() => {
    store._saveTimer = null;
    store.saveAsync().catch((err) => {
      logger.error('[dsh-cron] debounced save failed:', err.message);
    });
  }, delay);
  if (typeof store._saveTimer.unref === 'function') {
    store._saveTimer.unref();
  }
}

export function flushSync(store) {
  if (store._saveTimer) {
    clearTimeout(store._saveTimer);
    store._saveTimer = null;
  }
  if (store._readOnly || store._loadFailed) {
    return;
  }
  store.save();
}

export function createSnapshot(store) {
  const tasksSnapshot = Array.from(store.tasks.values()).map((t) => ({
    ...t,
    costLedger: Array.isArray(t.costLedger) ? t.costLedger.slice() : t.costLedger,
  }));
  const historySnapshot = {};
  for (const [id, runs] of store.history.entries()) {
    historySnapshot[id] = Array.isArray(runs) ? runs.slice() : runs;
  }
  return {
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    tasks: tasksSnapshot,
    history: historySnapshot,
    settings: store.settings ? { ...store.settings } : {},
    chainCheckpoints: store.chainCheckpoints ? { ...store.chainCheckpoints } : {},
    artifacts: store.artifacts ? { ...store.artifacts } : {},
  };
}

export function waitForDiskVersion(store, version) {
  if ((store._diskVersion || 0) >= version || (store._lastSyncVersion || 0) >= version) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (!store._diskWaiters) store._diskWaiters = [];
    store._diskWaiters.push({ version, resolve, reject });
  });
}

export function notifyDiskVersion(store, writtenVersion, err = null) {
  if (!store._diskWaiters || store._diskWaiters.length === 0) return;
  const remaining = [];
  for (const waiter of store._diskWaiters) {
    if (err) {
      waiter.reject(err);
    } else if ((store._diskVersion || 0) >= waiter.version || (store._lastSyncVersion || 0) >= waiter.version) {
      waiter.resolve();
    } else {
      remaining.push(waiter);
    }
  }
  store._diskWaiters = remaining;
}

export async function saveAsync(store) {
  if (store._readOnly || store._loadFailed) {
    const reason = store._accessErrorCode
      ? `access error (${store._accessErrorCode})`
      : (store._loadError ? store._loadError.message : 'unrecovered read failure');
    logger.error(`[dsh-cron] saveAsync blocked: store is in read-only recovery mode due to ${reason} on "${store.filePath}". File on disk was preserved.`);
    return Promise.reject(new Error(`Store write blocked: read-only recovery mode (${store.filePath})`));
  }
  if (store._saveTimer) {
    clearTimeout(store._saveTimer);
    store._saveTimer = null;
  }
  const version = ++store._saveVersion;
  const data = store._createSnapshot();

  const writeOp = async () => {
    if ((store._diskVersion || 0) >= version || (store._lastSyncVersion || 0) >= version) {
      store._notifyDiskVersion(version);
      return;
    }
    const dir = path.dirname(store.filePath);
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    bestEffort('chmod-dir', () => fs.chmodSync(dir, 0o700));

    const rand = Math.random().toString(36).slice(2, 8);
    const tmp = `${store.filePath}.tmp.${process.pid}_${Date.now()}_${rand}`;
    store._currentAsyncTmp = tmp;

    try {
      await store._writeStoreStream(tmp, data, version);
      bestEffort('chmod-tmp', () => fs.chmodSync(tmp, 0o600));
    } catch (writeErr) {
      await bestEffort('store-unlink-tmp', () => fs.promises.unlink(tmp), store?.logger || logger);
      if (store._currentAsyncTmp === tmp) store._currentAsyncTmp = null;
      store._notifyDiskVersion(null, writeErr);
      throw writeErr;
    }

    if ((store._diskVersion || 0) >= version || (store._lastSyncVersion || 0) >= version || store._saveVersion > version) {
      await bestEffort('store-unlink-stale-tmp', () => fs.promises.unlink(tmp), store?.logger || logger);
      if (store._currentAsyncTmp === tmp) store._currentAsyncTmp = null;
      return;
    }

    try {
      await fs.promises.rename(tmp, store.filePath);
      bestEffort('chmod-store', () => fs.chmodSync(store.filePath, 0o600));
      store._currentAsyncTmp = null;
      store._diskVersion = Math.max(store._diskVersion || 0, version);
      store._lastWrittenVersion = store._diskVersion;
      store._notifyDiskVersion(store._diskVersion);
    } catch (err) {
      store._currentAsyncTmp = null;
      if (err.code === 'ENOENT' && (store._lastSyncVersion || 0) >= version) {
        store._notifyDiskVersion(version);
        return;
      }
      store._notifyDiskVersion(null, err);
      throw err;
    }

    const now = Date.now();
    if (now - store._lastBackupTime > 60000) {
      store._lastBackupTime = now;
      try {
        const bakPath = `${store.filePath}.bak`;
        await fs.promises.copyFile(store.filePath, bakPath);
        bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
      } catch (bakErr) {
        logger.warn('[dsh-cron] async backup copy failed:', bakErr.message);
      }
    }
  };

  store._savePromise = store._savePromise.then(writeOp, writeOp);
  await store._savePromise;
  await store._waitForDiskVersion(version);
}

export async function writeStoreStream(store, filePath, data, version) {
  const isCanceled = () => {
    return (
      (store._diskVersion || 0) >= version ||
      (store._lastSyncVersion || 0) >= version ||
      store._saveVersion > version
    );
  };

  if (isCanceled()) {
    return;
  }

  const ac = new AbortController();
  let ws;
  try {
    ws = fs.createWriteStream(filePath, { encoding: 'utf-8', mode: 0o600 });
  } catch (createErr) {
    if (isCanceled()) return;
    throw createErr;
  }

  async function* generateChunks() {
    await new Promise((r) => setImmediate(r));
    if (isCanceled()) {
      ac.abort();
      return;
    }

    yield '{"version":' + JSON.stringify(data.version || 1);
    yield ',"schemaVersion":' + JSON.stringify(data.schemaVersion || CURRENT_SCHEMA_VERSION);
    yield ',"updatedAt":' + JSON.stringify(data.updatedAt || new Date().toISOString());
    yield ',"settings":' + JSON.stringify(data.settings || {});

    yield ',"tasks":[';
    const tasks = data.tasks || [];
    for (let i = 0; i < tasks.length; i++) {
      if (isCanceled()) {
        ac.abort();
        return;
      }
      if (i > 0) yield ',';
      yield JSON.stringify(tasks[i]);
      if ((i + 1) % 10 === 0) {
        await new Promise((r) => setImmediate(r));
      }
    }
    yield ']';

    yield ',"history":{';
    const historyEntries = Object.entries(data.history || {});
    for (let i = 0; i < historyEntries.length; i++) {
      if (isCanceled()) {
        ac.abort();
        return;
      }
      if (i > 0) yield ',';
      const [taskId, runs] = historyEntries[i];
      yield JSON.stringify(taskId) + ':[';
      if (Array.isArray(runs)) {
        for (let j = 0; j < runs.length; j++) {
          if (isCanceled()) {
            ac.abort();
            return;
          }
          if (j > 0) yield ',';
          yield JSON.stringify(runs[j]);
          if ((j + 1) % 15 === 0) {
            await new Promise((r) => setImmediate(r));
          }
        }
      } else {
        yield JSON.stringify(runs);
      }
      yield ']';
      await new Promise((r) => setImmediate(r));
    }
    yield '}';
    yield ',"chainCheckpoints":' + JSON.stringify(data.chainCheckpoints || {});
    yield ',"artifacts":' + JSON.stringify(data.artifacts || {});
    yield '}';
  }

  try {
    await pipeline(generateChunks(), ws, { signal: ac.signal });
  } catch (err) {
    if (ac.signal.aborted || isCanceled()) {
      return;
    }
    throw err;
  }
}

export function save(store) {
  if (store._readOnly || store._loadFailed) {
    const reason = store._accessErrorCode
      ? `access error (${store._accessErrorCode})`
      : (store._loadError ? store._loadError.message : 'unrecovered read failure');
    logger.error(`[dsh-cron] save blocked: store is in read-only recovery mode due to ${reason} on "${store.filePath}". File on disk was preserved.`);
    throw new Error(`Store write blocked: read-only recovery mode (${store.filePath})`);
  }
  if (store._saveTimer) {
    clearTimeout(store._saveTimer);
    store._saveTimer = null;
  }
  const version = ++store._saveVersion;
  store._lastSyncVersion = version;

  if (store._currentAsyncTmp) {
    const inFlightTmp = store._currentAsyncTmp;
    store._currentAsyncTmp = null;
    bestEffort('unlink-async-tmp', () => fs.unlinkSync(inFlightTmp));
  }
  try {
    const dir = path.dirname(store.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    bestEffort('chmod-dir', () => fs.chmodSync(dir, 0o700));
    const data = store._createSnapshot();
    const rand = Math.random().toString(36).slice(2, 8);
    const tmp = `${store.filePath}.tmp.${process.pid}_${Date.now()}_${rand}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    bestEffort('chmod-tmp', () => fs.chmodSync(tmp, 0o600));
    fs.renameSync(tmp, store.filePath);
    bestEffort('chmod-store', () => fs.chmodSync(store.filePath, 0o600));
    store._diskVersion = Math.max(store._diskVersion || 0, version);
    store._lastWrittenVersion = store._diskVersion;
    store._notifyDiskVersion(store._diskVersion);

    const now = Date.now();
    if (now - store._lastBackupTime > 60000) {
      store._lastBackupTime = now;
      bestEffort('backup-on-save', () => {
        const bakPath = `${store.filePath}.bak`;
        fs.copyFileSync(store.filePath, bakPath);
        fs.chmodSync(bakPath, 0o600);
      });
    }
  } catch (err) {
    logger.error('[dsh-cron] store save error:', err.message);
    throw err;
  }
}
