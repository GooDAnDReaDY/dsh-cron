import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';
import { CURRENT_SCHEMA_VERSION, runStoreMigrations } from './store-migration.js';
import { isAccessOrIoError, cleanOrphanedTmpFiles } from './store-io.js';
import { pruneOldMonthlyArchives } from './store-archive.js';

export function loadStoreData(store, raw) {
  let data = JSON.parse(raw);
  const storedVersion = Number(data.schemaVersion) || 1;
  if (storedVersion < CURRENT_SCHEMA_VERSION) {
    // Pre-migration backup (#390)
    try {
      const preBakPath = `${store.filePath}.bak-v${storedVersion}-${Date.now()}`;
      fs.writeFileSync(preBakPath, raw, { encoding: 'utf-8', mode: 0o600 });
      bestEffort('chmod-pre-bak', () => fs.chmodSync(preBakPath, 0o600));
      logger.info(`[dsh-cron] pre-migration backup saved to ${preBakPath}`);
    } catch (bakErr) {
      logger.warn('[dsh-cron] failed to write pre-migration backup:', bakErr.message);
    }
    data = runStoreMigrations(data, storedVersion, CURRENT_SCHEMA_VERSION);
    store._needsMigrationFlush = true;
  }
  store.tasks.clear();
  store.history.clear();
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
      store.tasks.set(t.id, t);
    }
  }
  if (data.history && typeof data.history === 'object') {
    for (const [k, v] of Object.entries(data.history)) {
      store.history.set(k, Array.isArray(v) ? v : []);
    }
  }
  if (data.settings && typeof data.settings === 'object') {
    store.settings = data.settings;
  }
  if (data.chainCheckpoints && typeof data.chainCheckpoints === 'object') {
    store.chainCheckpoints = data.chainCheckpoints;
  }
  if (data.artifacts && typeof data.artifacts === 'object') {
    store.artifacts = data.artifacts;
  }
}

export function initStore(store) {
  const dir = path.dirname(store.filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  bestEffort('chmod-dir', () => fs.chmodSync(dir, 0o700));
  cleanOrphanedTmpFiles(dir);
  const bakPath = `${store.filePath}.bak`;

  if (fs.existsSync(store.filePath)) {
    try {
      bestEffort('chmod-store', () => fs.chmodSync(store.filePath, 0o600));
      const raw = fs.readFileSync(store.filePath, 'utf-8');
      loadStoreData(store, raw);
      store._readOnly = false;
      store._loadFailed = false;
      store._accessErrorCode = null;
      store._loadError = null;

      if (!fs.existsSync(bakPath)) {
        bestEffort('backup-initial', () => {
          fs.copyFileSync(store.filePath, bakPath);
          fs.chmodSync(bakPath, 0o600);
        });
      } else {
        bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
      }
    } catch (err) {
      if (isAccessOrIoError(err)) {
        // File exists on disk but is inaccessible due to OS permissions/IO error (#435)
        store._enterReadOnlyMode(err, 'read', store.filePath);
      } else {
        // Genuine corruption or invalid data structure
        logger.error(`[dsh-cron] store read error (corrupted file): ${err.message}`);
        try {
          const corruptedPath = `${store.filePath}.corrupted.${Date.now()}`;
          fs.copyFileSync(store.filePath, corruptedPath);
          bestEffort('chmod-corrupted', () => fs.chmodSync(corruptedPath, 0o600));
          logger.warn(`[dsh-cron] corrupted store backed up to ${corruptedPath}`);
        } catch (snapErr) {
          logger.error('[dsh-cron] failed to snapshot corrupted store:', snapErr.message);
        }
        if (fs.existsSync(bakPath)) {
          try {
            bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
            const rawBak = fs.readFileSync(bakPath, 'utf-8');
            loadStoreData(store, rawBak);
            store._readOnly = false;
            store._loadFailed = false;
            store._accessErrorCode = null;
            store._loadError = null;
            logger.warn(`[dsh-cron] successfully recovered tasks store from ${bakPath}`);
          } catch (bakErr) {
            if (isAccessOrIoError(bakErr)) {
              store._enterReadOnlyMode(bakErr, 'read', bakPath);
            } else {
              logger.error('[dsh-cron] failed to recover tasks store from .bak:', bakErr.message);
              store._enterReadOnlyMode(bakErr, 'parse', bakPath);
            }
          }
        } else {
          store._enterReadOnlyMode(err, 'parse', store.filePath);
        }
      }
    }
  } else if (fs.existsSync(bakPath)) {
    try {
      bestEffort('chmod-bak', () => fs.chmodSync(bakPath, 0o600));
      const rawBak = fs.readFileSync(bakPath, 'utf-8');
      loadStoreData(store, rawBak);
      store._readOnly = false;
      store._loadFailed = false;
      store._accessErrorCode = null;
      store._loadError = null;
      bestEffort('restore-from-bak', () => {
        fs.copyFileSync(bakPath, store.filePath);
        fs.chmodSync(store.filePath, 0o600);
      });
      logger.warn(`[dsh-cron] restored missing tasks store from ${bakPath}`);
    } catch (bakErr) {
      if (isAccessOrIoError(bakErr)) {
        store._enterReadOnlyMode(bakErr, 'read', bakPath);
      } else {
        logger.error('[dsh-cron] failed to restore tasks store from .bak:', bakErr.message);
        store._enterReadOnlyMode(bakErr, 'parse', bakPath);
      }
    }
  } else {
    // Clean initial start: neither primary nor backup exists yet (#435)
    store._readOnly = false;
    store._loadFailed = false;
    store._accessErrorCode = null;
    store._loadError = null;
  }

  if (store._needsMigrationFlush && !store._readOnly && !store._loadFailed) {
    store._needsMigrationFlush = false;
    store.scheduleSave(100);
  }
  if (!store._readOnly && !store._loadFailed) {
    bestEffort('prune-old-archives', () => pruneOldMonthlyArchives(dir, 6));
  }
}
