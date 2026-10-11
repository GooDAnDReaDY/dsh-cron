import fs from 'node:fs';
import path from 'node:path';

export const VALIDATOR_TYPES = ['json', 'regex', 'text', 'exitCode', 'file'];

/**
 * Validates run output/result against declarative task validators.
 * Pure and deterministic: never uses eval or dynamic code execution (#316).
 *
 * @param {object} task Task record (may have task.validators)
 * @param {object} runInfo Run result ({ output, stdout, stderr, exitCode, error, status })
 * @param {object} [options] Context options ({ cwd, workspaceDir })
 * @returns {{ ok: boolean, status: 'passed' | 'failed' | 'error' | 'skipped', error?: string, details: Array<{ type: string, passed: boolean, message: string }> }}
 */
export function validateRunResult(task, runInfo, options = {}) {
  const validators = Array.isArray(task?.validators) ? task.validators : [];
  if (validators.length === 0) {
    return { ok: true, status: 'skipped', details: [] };
  }

  const details = [];
  const baseDir = options.workspaceDir || options.cwd || task?.cwd || process.cwd();

  for (let i = 0; i < validators.length; i++) {
    const v = validators[i];
    if (!v || typeof v !== 'object') continue;
    const type = String(v.type || '').trim().toLowerCase();

    try {
      if (type === 'exitCode') {
        const expected = Number(v.expected !== undefined ? v.expected : 0);
        const actual = Number(runInfo.exitCode !== undefined ? runInfo.exitCode : 0);
        const passed = actual === expected;
        const message = passed
          ? `Exit code matches expected (${expected})`
          : `Expected exit code ${expected}, got ${actual}`;
        details.push({ type: 'exitCode', passed, message });
        if (!passed) {
          return { ok: false, status: 'failed', error: message, details };
        }
      } else if (type === 'json') {
        const text = String(runInfo.output || runInfo.stdout || '').trim();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch (jsonErr) {
          const message = `Output is not valid JSON: ${jsonErr.message}`;
          details.push({ type: 'json', passed: false, message });
          return { ok: false, status: 'failed', error: message, details };
        }

        if (v.statusKey) {
          const val = parsed[v.statusKey];
          const expected = v.expected;
          const passed = expected !== undefined ? String(val) === String(expected) : Boolean(val);
          const message = passed
            ? `JSON field "${v.statusKey}" matches expected (${String(expected)})`
            : `JSON field "${v.statusKey}" value (${JSON.stringify(val)}) does not match expected (${JSON.stringify(expected)})`;
          details.push({ type: 'json', passed, message });
          if (!passed) {
            return { ok: false, status: 'failed', error: message, details };
          }
        }

        if (v.path) {
          const parts = String(v.path).split('.');
          let cur = parsed;
          let found = true;
          for (const p of parts) {
            if (cur && typeof cur === 'object' && p in cur) {
              cur = cur[p];
            } else {
              found = false;
              break;
            }
          }
          if (v.mustExist && !found) {
            const message = `JSON path "${v.path}" not found in output`;
            details.push({ type: 'json', passed: false, message });
            return { ok: false, status: 'failed', error: message, details };
          }
          if (v.minCount !== undefined && Array.isArray(cur) && cur.length < Number(v.minCount)) {
            const message = `JSON path "${v.path}" array length (${cur.length}) is less than minCount (${v.minCount})`;
            details.push({ type: 'json', passed: false, message });
            return { ok: false, status: 'failed', error: message, details };
          }
        }

        details.push({ type: 'json', passed: true, message: 'Valid JSON output' });
      } else if (type === 'text') {
        const targetStr = getTargetText(runInfo, v.target);
        const sub = String(v.text || '');
        const contains = targetStr.includes(sub);
        const passed = v.negate ? !contains : contains;
        const message = passed
          ? `Text check passed for "${sub}"`
          : (v.negate ? `Output unexpectedly contains forbidden text "${sub}"` : `Output does not contain required text "${sub}"`);
        details.push({ type: 'text', passed, message });
        if (!passed) {
          return { ok: false, status: 'failed', error: message, details };
        }
      } else if (type === 'regex') {
        const targetStr = getTargetText(runInfo, v.target);
        const pattern = String(v.pattern || '');
        let reg;
        try {
          reg = new RegExp(pattern, v.flags || 'i');
        } catch (regErr) {
          const message = `Invalid regex pattern "${pattern}": ${regErr.message}`;
          details.push({ type: 'regex', passed: false, message });
          return { ok: false, status: 'error', error: message, details };
        }
        const matches = reg.test(targetStr);
        const passed = v.negate ? !matches : matches;
        const message = passed
          ? `Regex match passed for /${pattern}/`
          : (v.negate ? `Output matches forbidden pattern /${pattern}/` : `Output does not match required pattern /${pattern}/`);
        details.push({ type: 'regex', passed, message });
        if (!passed) {
          return { ok: false, status: 'failed', error: message, details };
        }
      } else if (type === 'file') {
        const relPath = String(v.path || '').trim();
        if (!relPath) {
          details.push({ type: 'file', passed: false, message: 'File path cannot be empty' });
          return { ok: false, status: 'failed', error: 'File path cannot be empty', details };
        }
        // Guard against directory traversal escaping baseDir
        const resolvedPath = path.resolve(baseDir, relPath);
        const resolvedBase = path.resolve(baseDir);
        if (!resolvedPath.startsWith(resolvedBase)) {
          const message = `File path "${relPath}" escapes allowed directory boundary`;
          details.push({ type: 'file', passed: false, message });
          return { ok: false, status: 'failed', error: message, details };
        }

        const exists = fs.existsSync(resolvedPath);
        if (v.mustExist !== false && !exists) {
          const message = `Required file not found: "${relPath}"`;
          details.push({ type: 'file', passed: false, message });
          return { ok: false, status: 'failed', error: message, details };
        }

        if (exists && v.minBytes !== undefined) {
          const stats = fs.statSync(resolvedPath);
          if (stats.size < Number(v.minBytes)) {
            const message = `File "${relPath}" size (${stats.size} bytes) is below minimum (${v.minBytes} bytes)`;
            details.push({ type: 'file', passed: false, message });
            return { ok: false, status: 'failed', error: message, details };
          }
        }
        details.push({ type: 'file', passed: true, message: `File check passed for "${relPath}"` });
      } else {
        const message = `Unknown validator type "${type}"`;
        details.push({ type: 'unknown', passed: false, message });
        return { ok: false, status: 'failed', error: message, details };
      }
    } catch (valErr) {
      const message = `Validator error in ${type}: ${valErr.message}`;
      details.push({ type, passed: false, message });
      return { ok: false, status: 'error', error: message, details };
    }
  }

  return { ok: true, status: 'passed', details };
}

function getTargetText(runInfo, target) {
  if (target === 'stdout') return String(runInfo.stdout ?? runInfo.output ?? '');
  if (target === 'stderr') return String(runInfo.stderr ?? '');
  return String(runInfo.output ?? '');
}

/**
 * Sanitize and validate validator list for persistence.
 */
export function sanitizeValidators(validators) {
  if (!Array.isArray(validators)) return [];
  return validators.filter((v) => v && typeof v === 'object' && VALIDATOR_TYPES.includes(String(v.type).toLowerCase())).map((v) => ({
    type: String(v.type).toLowerCase(),
    ...(v.pattern !== undefined ? { pattern: String(v.pattern) } : {}),
    ...(v.text !== undefined ? { text: String(v.text) } : {}),
    ...(v.flags !== undefined ? { flags: String(v.flags) } : {}),
    ...(v.negate !== undefined ? { negate: Boolean(v.negate) } : {}),
    ...(v.statusKey !== undefined ? { statusKey: String(v.statusKey) } : {}),
    ...(v.expected !== undefined ? { expected: v.expected } : {}),
    ...(v.path !== undefined ? { path: String(v.path) } : {}),
    ...(v.mustExist !== undefined ? { mustExist: Boolean(v.mustExist) } : {}),
    ...(v.minBytes !== undefined ? { minBytes: Number(v.minBytes) } : {}),
    ...(v.target !== undefined ? { target: String(v.target) } : {}),
  }));
}
