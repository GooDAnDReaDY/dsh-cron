import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';

/**
 * Append rotated overflow history entries into tasks-history-archive.json (#134, #379, GH #17).
 */
export function archiveHistoryRuns(store, id, overflowRuns) {
  if (!Array.isArray(overflowRuns) || overflowRuns.length === 0) return;
  try {
    const dir = path.dirname(store.filePath);
    const archivePath = path.join(dir, 'tasks-history-archive.json');
    let archive = {};
    if (fs.existsSync(archivePath)) {
      archive = bestEffort('parse-history-archive', () => JSON.parse(fs.readFileSync(archivePath, 'utf-8'))) || {};
    }
    if (!Array.isArray(archive[id])) archive[id] = [];

    // Strip full raw diff payload from archived overflow runs to prevent runaway JSON growth (#379, GH #17)
    const sanitizedOverflow = overflowRuns.map((r) => {
      if (!r || !r.gitDiff) return r;
      const { diff, ...gitDiffMeta } = r.gitDiff;
      return {
        ...r,
        gitDiff: {
          ...gitDiffMeta,
          diffExcerpt: diff ? diff.slice(0, 500) : '',
          hasChanges: Boolean(gitDiffMeta.hasChanges),
          archived: true,
        },
      };
    });

    archive[id].push(...sanitizedOverflow);
    if (archive[id].length > 1000) {
      archive[id] = archive[id].slice(-1000);
    }

    // Enforce total archive size budget (max 15MB) across tasks (#379, GH #17)
    const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;
    let serialized = JSON.stringify(archive);
    if (serialized.length > MAX_ARCHIVE_BYTES) {
      for (const taskId of Object.keys(archive)) {
        if (Array.isArray(archive[taskId]) && archive[taskId].length > 100) {
          archive[taskId] = archive[taskId].slice(-100);
        }
      }
      serialized = JSON.stringify(archive);
    }

    // Write atomically with tmp file using compact JSON (avoiding mega-lines and null, 2 serialization bloat)
    const rand = Math.random().toString(36).slice(2, 8);
    const tmp = `${archivePath}.tmp.${process.pid}_${Date.now()}_${rand}`;
    fs.writeFileSync(tmp, serialized, { encoding: 'utf-8', mode: 0o600 });
    bestEffort('chmod-tmp', () => fs.chmodSync(tmp, 0o600));
    fs.renameSync(tmp, archivePath);
    bestEffort('chmod-archive', () => fs.chmodSync(archivePath, 0o600));

    // Partition runs into monthly buckets for compressed archives (#391)
    const monthlyBuckets = new Map();
    for (const run of sanitizedOverflow) {
      const at = run.at || run.timestamp || run.startedAt || Date.now();
      const date = new Date(at);
      const monthKey = !isNaN(date.getTime())
        ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
        : new Date().toISOString().slice(0, 7);
      if (!monthlyBuckets.has(monthKey)) {
        monthlyBuckets.set(monthKey, []);
      }
      monthlyBuckets.get(monthKey).push(run);
    }

    for (const [monthKey, runsForMonth] of monthlyBuckets.entries()) {
      const gzPath = path.join(dir, `tasks-history-${monthKey}.json.gz`);
      let monthArchive = {};
      if (fs.existsSync(gzPath)) {
        try {
          const rawGz = fs.readFileSync(gzPath);
          const decompressed = gunzipSync(rawGz).toString('utf-8');
          monthArchive = JSON.parse(decompressed) || {};
        } catch (gzReadErr) {
          logger.warn(`[dsh-cron] failed to read existing gzip archive for ${monthKey}:`, gzReadErr.message);
          monthArchive = {};
        }
      }
      if (!Array.isArray(monthArchive[id])) {
        monthArchive[id] = [];
      }
      monthArchive[id].push(...runsForMonth);
      const compressed = gzipSync(Buffer.from(JSON.stringify(monthArchive), 'utf-8'), { level: 9 });
      const randGz = Math.random().toString(36).slice(2, 8);
      const tmpGz = `${gzPath}.tmp.${process.pid}_${Date.now()}_${randGz}`;
      fs.writeFileSync(tmpGz, compressed, { mode: 0o600 });
      bestEffort('chmod-tmp-gz', () => fs.chmodSync(tmpGz, 0o600));
      fs.renameSync(tmpGz, gzPath);
      bestEffort('chmod-archive-gz', () => fs.chmodSync(gzPath, 0o600));
    }

    pruneOldMonthlyArchives(dir, 6);
  } catch (archiveErr) {
    logger.error('[dsh-cron] history archive error:', archiveErr.message);
  }
}

export function listMonthlyArchives(store) {
  try {
    const dir = path.dirname(store.filePath);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    const archives = [];
    for (const file of files) {
      const match = file.match(/^tasks-history-(\d{4}-\d{2})\.json\.gz$/);
      if (match) {
        const month = match[1];
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          archives.push({
            month,
            filename: file,
            sizeBytes: stat.size,
            mtime: stat.mtime.toISOString(),
            path: fullPath,
          });
        } catch (_err) {
          // ignore unreadable stat
        }
      }
    }
    return archives.sort((a, b) => b.month.localeCompare(a.month));
  } catch (err) {
    logger.error('[dsh-cron] listMonthlyArchives error:', err.message);
    return [];
  }
}

export function getMonthlyArchive(store, month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  try {
    const dir = path.dirname(store.filePath);
    const gzPath = path.join(dir, `tasks-history-${month}.json.gz`);
    if (!fs.existsSync(gzPath)) return null;
    const rawGz = fs.readFileSync(gzPath);
    const decompressed = gunzipSync(rawGz).toString('utf-8');
    return JSON.parse(decompressed);
  } catch (err) {
    logger.error(`[dsh-cron] getMonthlyArchive error for ${month}:`, err.message);
    return null;
  }
}

export function pruneOldMonthlyArchives(dir, maxMonths = 6) {
  try {
    if (!fs.existsSync(dir) || maxMonths < 0) return;
    const files = fs.readdirSync(dir);
    const monthlyFiles = [];
    for (const file of files) {
      const match = file.match(/^tasks-history-(\d{4}-\d{2})\.json\.gz$/);
      if (match) {
        monthlyFiles.push({ month: match[1], file, fullPath: path.join(dir, file) });
      }
    }
    monthlyFiles.sort((a, b) => b.month.localeCompare(a.month));
    if (monthlyFiles.length > maxMonths) {
      const toDelete = monthlyFiles.slice(maxMonths);
      for (const item of toDelete) {
        bestEffort('delete-old-archive', () => fs.unlinkSync(item.fullPath));
        logger.info(`[dsh-cron] pruned old monthly history archive: ${item.file}`);
      }
    }
  } catch (err) {
    bestEffort('log-prune-err', () => logger.debug?.(`[dsh-cron] prune old monthly archives error: ${err.message}`));
  }
}

export function getArchivedRuns(store, id, { limit = 50, offset = 0, search = '' } = {}) {
  try {
    const dir = path.dirname(store.filePath);
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
