/**
 * Self-Healing Doctor Engine (#353)
 *
 * Provides autonomous failure classification, root-cause diagnosis,
 * code/prompt fix proposals with unified diff previews, and safe 1-click & auto-apply healing.
 */

import { parseJsonAnswer } from './llm-ask.js';

/**
 * Standard failure categories for structured diagnosis.
 */
export const FAILURE_CATEGORIES = {
  SYNTAX_ERROR: 'syntax_error',
  DEPENDENCY_MISSING: 'dependency_missing',
  RATE_LIMIT: 'rate_limit',
  AUTH_FAILED: 'auth_failed',
  SCHEMA_CHANGE: 'schema_change',
  TIMEOUT: 'timeout',
  NETWORK_ERROR: 'network_error',
  RUNTIME_ERROR: 'runtime_error',
  VALIDATION_FAILED: 'validation_failed',
};

/**
 * Classifies an error and execution traces into a standard failure category using deterministic pattern matching.
 *
 * @param {Object} task
 * @param {Object} runInfo
 * @returns {{ category: string, matchedRule: string }}
 */
export function classifyFailure(task, runInfo = {}) {
  const text = [
    String(runInfo.error || ''),
    String(runInfo.stderr || ''),
    String(runInfo.output || ''),
    String(runInfo.status || ''),
  ].join(' ').toLowerCase();

  const exitCode = runInfo.exitCode ?? null;

  // 1. Timeout
  if (runInfo.status === 'timeout' || text.includes('timed out') || text.includes('etimedout') || text.includes('sigterm') && exitCode === 143) {
    return { category: FAILURE_CATEGORIES.TIMEOUT, matchedRule: 'timeout_detector' };
  }

  // 2. Auth / Permissions
  if (text.includes('401 unauthorized') || text.includes('403 forbidden') || text.includes('permission denied') || text.includes('invalid api key') || text.includes('token expired')) {
    return { category: FAILURE_CATEGORIES.AUTH_FAILED, matchedRule: 'auth_forbidden_detector' };
  }

  // 3. Rate Limit / Quota
  if (text.includes('429') || text.includes('rate limit') || text.includes('too many requests') || text.includes('quota exceeded') || text.includes('tpm') || text.includes('rpm')) {
    return { category: FAILURE_CATEGORIES.RATE_LIMIT, matchedRule: 'rate_limit_detector' };
  }

  // 4. Missing Dependencies / Commands
  if (text.includes('command not found') || text.includes('no such file or directory') || text.includes('modulenotfounderror') || text.includes('cannot find module') || text.includes('not recognized as an internal or external command')) {
    return { category: FAILURE_CATEGORIES.DEPENDENCY_MISSING, matchedRule: 'missing_dependency_detector' };
  }

  // 5. Syntax Error
  if (text.includes('syntaxerror') || text.includes('indentationerror') || text.includes('unexpected token') || text.includes('syntax error near') || text.includes('parse error')) {
    return { category: FAILURE_CATEGORIES.SYNTAX_ERROR, matchedRule: 'syntax_error_detector' };
  }

  // 6. Schema / JSON / Parsing mismatch
  if (text.includes('json.parse') || text.includes('unexpected end of json') || text.includes('cannot read property') || text.includes('cannot read properties of undefined') || text.includes('keyerror')) {
    return { category: FAILURE_CATEGORIES.SCHEMA_CHANGE, matchedRule: 'schema_mismatch_detector' };
  }

  // 7. Network / Connection
  if (text.includes('econnrefused') || text.includes('enotfound') || text.includes('network is unreachable') || text.includes('connection reset')) {
    return { category: FAILURE_CATEGORIES.NETWORK_ERROR, matchedRule: 'network_failure_detector' };
  }

  // 8. Validation Failed
  if (runInfo.status === 'validation_failed' || text.includes('validation_failed')) {
    return { category: FAILURE_CATEGORIES.VALIDATION_FAILED, matchedRule: 'validation_rule_detector' };
  }

  return { category: FAILURE_CATEGORIES.RUNTIME_ERROR, matchedRule: 'fallback_runtime_detector' };
}

/**
 * Generates a clean text unified diff between original and proposed code.
 *
 * @param {string} originalText
 * @param {string} newText
 * @param {string} [filename]
 * @returns {string}
 */
export function generateUnifiedDiff(originalText = '', newText = '', filename = 'task_script') {
  const origLines = String(originalText).split('\n');
  const newLines = String(newText).split('\n');

  if (originalText === newText) {
    return `--- a/${filename}\n+++ b/${filename}\n (no changes)`;
  }

  const diffLines = [
    `--- a/${filename}`,
    `+++ b/${filename}`,
    `@@ -1,${origLines.length} +1,${newLines.length} @@`,
  ];

  // Simple line-by-line diff representation
  let i = 0;
  let j = 0;
  while (i < origLines.length || j < newLines.length) {
    if (i < origLines.length && j < newLines.length) {
      if (origLines[i] === newLines[j]) {
        diffLines.push(` ${origLines[i]}`);
        i++;
        j++;
      } else {
        diffLines.push(`-${origLines[i]}`);
        diffLines.push(`+${newLines[j]}`);
        i++;
        j++;
      }
    } else if (i < origLines.length) {
      diffLines.push(`-${origLines[i]}`);
      i++;
    } else if (j < newLines.length) {
      diffLines.push(`+${newLines[j]}`);
      j++;
    }
  }

  return diffLines.join('\n');
}

/**
 * Builds the diagnostic prompt for the model.
 *
 * @param {Object} task
 * @param {Object} runInfo
 * @param {string} category
 * @returns {string}
 */
export function buildDoctorPrompt(task, runInfo, category) {
  const currentCode = String(task.prompt || '').slice(0, 4000);
  const errorText = [
    String(runInfo.error || ''),
    String(runInfo.stderr || ''),
    String(runInfo.output || '').slice(0, 2000),
  ].filter(Boolean).join('\n---\n');

  return [
    `Task: ${task.title || 'Task'} (type: ${task.type || 'prompt'})`,
    `Schedule: ${task.scheduleText || task.schedule || ''}`,
    `Failure Category: ${category}`,
    `Exit Code: ${runInfo.exitCode ?? 'N/A'}`,
    '',
    'Execution Error & Traces:',
    '```',
    errorText || '(no error output)',
    '```',
    '',
    'Current Code / Prompt:',
    '```',
    currentCode,
    '```',
    '',
    'Instructions:',
    '1. Explain what caused the failure in 1-2 concise sentences.',
    '2. Provide the complete fixed code/prompt in `suggestedFix`. Make sure it preserves existing logic and fixes the specific failure.',
    '3. Provide confidence level: "high", "medium", or "low".',
  ].join('\n');
}

const DOCTOR_SYSTEM_PROMPT = [
  'You are the autonomous Self-Healing Doctor for background scheduled tasks.',
  'Analyze the failure and output ONLY a JSON object with this exact schema:',
  '{',
  '  "cause": "short 1-2 sentence description of root cause",',
  '  "category": "syntax_error"|"dependency_missing"|"rate_limit"|"auth_failed"|"schema_change"|"timeout"|"network_error"|"runtime_error"|"validation_failed",',
  '  "suggestedFix": "the exact new code or prompt that completely replaces the current code and resolves the issue",',
  '  "confidence": "high"|"medium"|"low",',
  '  "explanation": "brief explanation of what was fixed"',
  '}',
  'Do not include markdown fences outside the JSON. Return only the JSON.',
].join(' ');

/**
 * Diagnoses a failed run and produces a doctor report.
 * Uses deterministic analysis if no model is available, or model-assisted analysis when ask is supplied.
 *
 * @param {Object} params
 * @param {Object} params.task Current task
 * @param {Object} params.runInfo Run details
 * @param {Function} [params.ask] Model querying function (optional)
 * @param {string} [params.preferredModel] Preferred LLM model
 * @param {number} [params.timeoutMs] Query timeout in ms
 * @returns {Promise<Object>} Doctor diagnosis report
 */
export async function diagnoseFailure({ task, runInfo, ask, preferredModel, timeoutMs = 25000 }) {
  if (!task) return { ok: false, error: 'No task provided' };

  const currentCode = String(task.prompt || '');
  const { category } = classifyFailure(task, runInfo);

  // If a model querying function is available, ask the model for diagnosis and fix
  if (typeof ask === 'function') {
    try {
      const prompt = buildDoctorPrompt(task, runInfo, category);
      const res = await ask({
        task,
        prompt,
        system: DOCTOR_SYSTEM_PROMPT,
        preferredModel,
        maxTokens: 1200,
        timeoutMs,
      });

      if (res && res.ok && res.text) {
        const parsed = parseJsonAnswer(res.text);
        if (parsed && (parsed.suggestedFix || parsed.cause)) {
          const suggestedFix = String(parsed.suggestedFix || currentCode);
          const diff = generateUnifiedDiff(currentCode, suggestedFix, task.type === 'script' ? 'script.sh' : 'prompt.txt');
          const confidence = ['high', 'medium', 'low'].includes(String(parsed.confidence).toLowerCase())
            ? String(parsed.confidence).toLowerCase()
            : 'medium';

          return {
            ok: true,
            category: parsed.category || category,
            cause: String(parsed.cause || 'Task encountered an unhandled execution failure').slice(0, 1000),
            explanation: String(parsed.explanation || '').slice(0, 1000),
            suggestedFix,
            diff,
            confidence,
            timestamp: Date.now(),
            applied: false,
            autoHealed: false,
          };
        }
      }
    } catch {
      // Fall through to deterministic rules
    }
  }

  // Deterministic fallback heuristics when LLM is unavailable or unparseable
  let cause = `Task failed with ${category}`;
  let suggestedFix = currentCode;
  let confidence = 'low';

  if (category === FAILURE_CATEGORIES.TIMEOUT) {
    cause = 'Execution exceeded timeout limit. Suggested increasing timeout or adding fast-fail flags.';
    confidence = 'medium';
  } else if (category === FAILURE_CATEGORIES.RATE_LIMIT) {
    cause = 'Rate limit (429) hit. Suggested adding backoff delay between requests.';
    confidence = 'medium';
  } else if (category === FAILURE_CATEGORIES.SYNTAX_ERROR) {
    cause = 'Syntax error detected in script or prompt syntax.';
    confidence = 'low';
  } else if (category === FAILURE_CATEGORIES.AUTH_FAILED) {
    cause = 'Authentication failed (401/403). Required credentials or tokens are invalid/expired.';
    confidence = 'medium';
  }

  const diff = generateUnifiedDiff(currentCode, suggestedFix);

  return {
    ok: true,
    category,
    cause,
    explanation: 'Generated via deterministic heuristics',
    suggestedFix,
    diff,
    confidence,
    timestamp: Date.now(),
    applied: false,
    autoHealed: false,
  };
}

/**
 * Checks whether a task should be automatically healed by the Doctor.
 * Enforces safe boundaries:
 * 1. `task.autoHeal === true` or `task.selfHealing?.autoApply === true`
 * 2. High confidence requirement
 * 3. Daily quota: at most 1 auto-patch per 24 hours to prevent loops
 *
 * @param {Object} task
 * @param {Object} doctorReport
 * @returns {boolean}
 */
export function shouldAutoHeal(task, doctorReport) {
  if (!task || !doctorReport) return false;

  const isAutoEnabled = Boolean(task.autoHeal || task.selfHealing?.autoApply);
  if (!isAutoEnabled) return false;

  if (doctorReport.confidence !== 'high') return false;

  const lastPatchedAt = task.selfHealing?.lastPatchedAt || 0;
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - lastPatchedAt < oneDayMs) {
    return false; // Daily patch limit reached
  }

  // Don't auto-patch if fix is identical
  if (doctorReport.suggestedFix === task.prompt) {
    return false;
  }

  return true;
}

/**
 * Applies a doctor fix to the task in store, creating backups and updating revision history.
 *
 * @param {Object} task
 * @param {Object} doctorReport
 * @param {Object} options
 * @param {Object} options.store Store instance
 * @param {string} [options.user] Applying user / system identity
 * @param {boolean} [options.isAutoHeal] Whether applied automatically
 * @returns {Promise<{ ok: boolean, error?: string, revision?: Object }>}
 */
export async function applyDoctorFix(task, doctorReport, { store, user = 'operator', isAutoHeal = false } = {}) {
  if (!task || !doctorReport || !doctorReport.suggestedFix) {
    return { ok: false, error: 'Invalid task or doctor report' };
  }

  const previousCode = String(task.prompt || '');
  const newCode = String(doctorReport.suggestedFix);

  const revision = {
    timestamp: Date.now(),
    author: isAutoHeal ? 'doctor:auto' : `user:${user}`,
    category: doctorReport.category || 'unknown',
    cause: doctorReport.cause || '',
    previousCode,
    newCode,
  };

  const revisions = Array.isArray(task.revisions) ? [...task.revisions] : [];
  revisions.unshift(revision);
  if (revisions.length > 10) revisions.length = 10; // Keep up to 10 historical revisions

  const updates = {
    prompt: newCode,
    previousPrompt: previousCode,
    revisions,
    updatedAt: Date.now(),
  };

  if (isAutoHeal) {
    updates.selfHealing = {
      ...(task.selfHealing || {}),
      lastPatchedAt: Date.now(),
      autoPatchesCount: ((task.selfHealing && task.selfHealing.autoPatchesCount) || 0) + 1,
    };
  }

  // Update in store
  if (store && typeof store.updateTask === 'function') {
    await store.updateTask(task.id, updates);
  } else if (store && store.tasks && store.tasks[task.id]) {
    Object.assign(store.tasks[task.id], updates);
  }

  Object.assign(task, updates);
  doctorReport.applied = true;
  if (isAutoHeal) {
    doctorReport.autoHealed = true;
  }

  return { ok: true, revision };
}

/**
 * Reverts a task to its previous prompt/code from the last revision.
 *
 * @param {Object} task
 * @param {Object} options
 * @param {Object} options.store Store instance
 * @param {string} [options.user] Reverting user identity
 * @returns {Promise<{ ok: boolean, error?: string, revertedCode?: string }>}
 */
export async function revertDoctorFix(task, { store, user = 'operator' } = {}) {
  if (!task) return { ok: false, error: 'No task provided' };

  let revertCode = null;
  const revisions = Array.isArray(task.revisions) ? [...task.revisions] : [];

  if (revisions.length > 0) {
    const lastRev = revisions[0];
    revertCode = lastRev.previousCode;
  } else if (task.previousPrompt) {
    revertCode = task.previousPrompt;
  }

  if (revertCode === null || revertCode === undefined) {
    return { ok: false, error: 'No previous revision or backup found to revert to' };
  }

  const currentCode = String(task.prompt || '');
  const revertRevision = {
    timestamp: Date.now(),
    author: `revert:${user}`,
    category: 'revert',
    cause: 'Reverted to previous version',
    previousCode: currentCode,
    newCode: revertCode,
  };

  revisions.unshift(revertRevision);
  if (revisions.length > 10) revisions.length = 10;

  const updates = {
    prompt: revertCode,
    previousPrompt: currentCode,
    revisions,
    updatedAt: Date.now(),
  };

  if (store && typeof store.updateTask === 'function') {
    await store.updateTask(task.id, updates);
  } else if (store && store.tasks && store.tasks[task.id]) {
    Object.assign(store.tasks[task.id], updates);
  }

  Object.assign(task, updates);
  return { ok: true, revertedCode: revertCode };
}

