// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Normalize an array or string of input paths to watch/hash.
 *
 * @param {string[]|string|null|undefined} paths
 * @returns {string[]}
 */
export function normalizeInputHashPaths(paths) {
  if (!paths) return [];
  const list = Array.isArray(paths)
    ? paths
    : String(paths).split(/[\n,]+/).map((p) => p.trim());
  return list.filter((p) => typeof p === 'string' && p.length > 0);
}

/**
 * Compute a SHA-256 hash or signature of a file or directory tree.
 * Deterministic and skips noisy or non-tracked artifacts (.git, node_modules).
 *
 * @param {string} targetPath
 * @returns {string}
 */
export function hashPath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 'nonexistent';
  }

  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch (_err) {
    return 'error';
  }

  if (stat.isFile()) {
    try {
      const content = fs.readFileSync(targetPath);
      return crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
    } catch (_err) {
      return `stat:${stat.size}:${stat.mtimeMs}`;
    }
  }

  if (stat.isDirectory()) {
    const hash = crypto.createHash('sha256');
    function walk(dir, depth = 0) {
      if (depth > 8) return; // Prevent infinite recursion on deep/circular trees
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_err) {
        return;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const ent of entries) {
        if (ent.name === '.git' || ent.name === 'node_modules') continue;
        const fullPath = path.join(dir, ent.name);
        if (ent.isFile()) {
          try {
            const st = fs.statSync(fullPath);
            hash.update(`${ent.name}:${st.size}:${st.mtimeMs}:`);
            if (st.size < 2 * 1024 * 1024) {
              const fileBuf = fs.readFileSync(fullPath);
              hash.update(fileBuf);
            }
          } catch (_err) { void _err; }
        } else if (ent.isDirectory()) {
          hash.update(`dir:${ent.name}:`);
          walk(fullPath, depth + 1);
        }
      }
    }
    walk(targetPath);
    return hash.digest('hex').slice(0, 32);
  }

  return 'other';
}

/**
 * Compute the combined input hash for a task based on its configured inputHashPaths.
 * Returns null if no inputHashPaths are configured or valid.
 *
 * @param {string|null|undefined} cwd
 * @param {string[]|string|null|undefined} inputHashPaths
 * @returns {Promise<string|null>}
 */
export async function computeTaskInputHash(cwd, inputHashPaths) {
  const normPaths = normalizeInputHashPaths(inputHashPaths);
  if (normPaths.length === 0) return null;

  const combined = crypto.createHash('sha256');
  const baseDir = cwd || process.cwd();

  for (const relOrAbs of normPaths) {
    const resolved = path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(baseDir, relOrAbs);
    const h = hashPath(resolved);
    combined.update(`${relOrAbs}=${h};`);
  }

  return 'sha256:' + combined.digest('hex').slice(0, 16);
}
