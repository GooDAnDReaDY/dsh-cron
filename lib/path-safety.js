/**
 * Single source of truth for "is this path safe to touch?" checks.
 *
 * File watchers (`lib/watcher.js`) and wake triggers (`lib/wake-triggers.js`)
 * used to keep two drifting copies of the disallowed-root list: one compared
 * only exact matches (so `/etc/ssh` slipped through), the other compared
 * subtrees but only after `path.resolve()`, so POSIX roots never matched on a
 * Windows host (`/etc` becomes `C:\etc`). Both now delegate here.
 */

import path from 'node:path';

/** Sensitive locations, written POSIX-style and compared case-insensitively. */
export const DISALLOWED_ROOTS = Object.freeze([
  '/proc',
  '/sys',
  '/dev',
  '/etc',
  '/boot',
  '/run',
  '/var/run',
  'c:/windows',
  'c:/windows/system32',
  'c:/program files',
  'c:/program files (x86)',
]);

function normalize(value) {
  return String(value).split('\\').join('/').replace(/\/+$/, '').toLowerCase();
}

function matchesDisallowedRoot(candidate) {
  for (const root of DISALLOWED_ROOTS) {
    if (candidate === root || candidate.startsWith(root + '/')) return root;
  }
  return null;
}

/**
 * Validates that a path does not target a sensitive system location or a
 * filesystem root.
 *
 * Both the path as written and its resolved form are compared, so a POSIX-style
 * input is rejected on Windows too, and a Windows-style input is rejected
 * regardless of the current drive.
 *
 * @param {string} targetPath
 * @param {string} [label] — prefix used in error messages ("Path", "Watched path").
 * @returns {{ safe: boolean, resolved?: string, error?: string }}
 */
export function isSafePath(targetPath, label = 'Path') {
  if (!targetPath || typeof targetPath !== 'string') {
    return { safe: false, error: 'Path must be a non-empty string' };
  }
  const trimmed = targetPath.trim();
  if (!trimmed) {
    return { safe: false, error: 'Path must be a non-empty string' };
  }
  if (trimmed.indexOf('\0') !== -1) {
    return { safe: false, error: 'Path must not contain null bytes' };
  }

  if (matchesDisallowedRoot(normalize(trimmed))) {
    return { safe: false, error: `${label} "${targetPath}" targets a disallowed system location` };
  }

  const resolved = path.resolve(trimmed);
  if (resolved === path.parse(resolved).root) {
    return { safe: false, error: `${label} "${resolved}" is a filesystem root` };
  }
  if (matchesDisallowedRoot(normalize(resolved))) {
    return { safe: false, error: `${label} "${resolved}" targets a disallowed system location` };
  }

  return { safe: true, resolved };
}
