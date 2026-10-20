import { exec } from 'node:child_process';
import fs from 'node:fs';
import { executeSwarmTask } from './swarm.js';
import { logger } from './logger.js';
import { resolveTaskForExecution } from './prompt-interpolation.js';

/** Task types that talk to a model and can therefore use a fallback model. */
export const AGENT_TASK_TYPES = ['llm', 'skill', 'workflow'];

/** Sum two usage records, so a fallback attempt is not lost in accounting. */
export function addUsage(a, b) {
  return {
    inputTokens: (a?.inputTokens || 0) + (b?.inputTokens || 0),
    outputTokens: (a?.outputTokens || 0) + (b?.outputTokens || 0),
    cacheReadTokens: (a?.cacheReadTokens || 0) + (b?.cacheReadTokens || 0),
  };
}

/**
 * Execute pre-flight check gate before running task body.
 */
export async function executePreflight(task) {
  const type = String(task.preflightType || 'none').trim().toLowerCase();
  const target = String(task.preflightTarget || '').trim();
  if (!type || type === 'none') {
    return { ok: true };
  }

  const KNOWN_PREFLIGHT_TYPES = ['http', 'command', 'shell', 'disk'];
  if (!KNOWN_PREFLIGHT_TYPES.includes(type)) {
    return { ok: false, reason: `Unknown preflight type "${type}"` };
  }

  if (!target) {
    return { ok: false, reason: `Preflight target is required for type "${type}"` };
  }

  if (type === 'http') {
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(target, { signal: controller.signal });
      if (res.ok) return { ok: true };
      return { ok: false, reason: `HTTP check returned status ${res.status}` };
    } catch (err) {
      return { ok: false, reason: `HTTP check failed: ${err.message}` };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (type === 'command' || type === 'shell') {
    return new Promise((resolve) => {
      exec(target, { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, reason: `Preflight command failed (code ${err.code || 1}): ${(stderr || stdout || err.message).trim().slice(0, 150)}` });
        } else {
          resolve({ ok: true });
        }
      });
    });
  }

  if (type === 'disk') {
    let diskPath = task.cwd || process.cwd();
    let requirement = target;

    // Check for "path:requirement", taking care not to split Windows drive letters (e.g. C:\:10%)
    const lastColon = target.lastIndexOf(':');
    if (lastColon > 0) {
      const candidatePath = target.slice(0, lastColon).trim();
      const candidateReq = target.slice(lastColon + 1).trim();
      if (candidateReq) {
        diskPath = candidatePath;
        requirement = candidateReq;
      }
    }

    const isPercent = requirement.endsWith('%');
    const numericVal = parseFloat(requirement);
    if (isNaN(numericVal) || numericVal <= 0) {
      return { ok: false, reason: `Invalid preflight disk target requirement: "${requirement}"` };
    }

    try {
      if (typeof fs.statfsSync !== 'function') {
        return { ok: false, reason: 'statfsSync is not available on this platform' };
      }
      const stats = fs.statfsSync(diskPath);
      if (isPercent) {
        const freePercent = stats.blocks > 0 ? (stats.bavail / stats.blocks) * 100 : 0;
        if (freePercent < numericVal) {
          return { ok: false, reason: `Free disk space on "${diskPath}" (${freePercent.toFixed(1)}%) is below required ${numericVal}%` };
        }
      } else {
        const freeMb = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
        if (freeMb < numericVal) {
          return { ok: false, reason: `Free disk space on "${diskPath}" (${freeMb} MB) is below required ${numericVal} MB` };
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: `Preflight disk check failed: filesystem "${diskPath}" not accessible (${err.message})` };
    }
  }

  return { ok: false, reason: `Unsupported preflight type "${type}"` };
}

/** Only agent-mediated types use a model, and only a failed run falls back. */
export function shouldUseFallback(task, outcome) {
  if (!task || !task.fallbackModel) return false;
  if (!AGENT_TASK_TYPES.includes(task.type || 'llm')) return false;
  return outcome.status === 'error' || outcome.status === 'timeout';
}

/** Run the task body once and normalise whatever the executor returned. */
export async function executeOnce(scheduler, task, signal, options = {}) {
  const result = {
    status: 'success',
    output: '',
    error: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    costUsd: 0,
    sessionId: null,
    model: task.model || '',
    fallback: false,
  };
  if (task.type === 'swarm') {
    try {
      const swarmRes = await executeSwarmTask(task, {
        executeFn: (subtask) => scheduler.executeFn(subtask, { signal, ...options }),
        askModel: scheduler.askModel,
        signal,
        logger,
      });
      result.output = swarmRes.output || '';
      result.status = swarmRes.status;
      result.subtaskRuns = swarmRes.subtaskRuns || [];
      result.swarmStats = swarmRes.stats;
      return result;
    } catch (err) {
      result.error = err.message || String(err);
      result.status = 'error';
      return result;
    }
  }
  if (typeof scheduler.executeFn !== 'function') return result;
  const executableTask = resolveTaskForExecution(task, options);
  try {
    const res = await scheduler.executeFn(executableTask, { signal, ...options });
    if (typeof res === 'object' && res !== null) {
      result.output = res.output || '';
      result.usage = res.usage || result.usage;
      result.costUsd = res.costUsd || 0;
      result.sessionId = res.sessionId || null;
      if (res.model) result.model = res.model;
    } else {
      result.output = String(res || '');
    }
  } catch (err) {
    result.error = err.message || String(err);
    const timedOut = result.error.toLowerCase().includes('timed out') || result.error.toLowerCase().includes('timeout');
    result.status = timedOut ? 'timeout' : 'error';
    if (err.usage) result.usage = err.usage;
    if (typeof err.costUsd === 'number') result.costUsd = err.costUsd;
    if (err.sessionId) result.sessionId = err.sessionId;
  }
  return result;
}

/**
 * Run the task, retrying once on the configured fallback model when the primary attempt failed (#45).
 */
export async function executeWithFallback(scheduler, task, signal, options = {}) {
  const primary = await scheduler.executeOnce(task, signal, options);
  if (!scheduler.shouldUseFallback(task, primary)) return primary;

  const fallbackTask = {
    ...task,
    provider: task.fallbackProvider || task.provider,
    model: task.fallbackModel,
  };
  logger.info(`[dsh-cron] task "${task.title}" failed on ${task.model || 'the default model'}, retrying once on ${task.fallbackModel}`);
  const secondary = await scheduler.executeOnce(fallbackTask, signal, options);
  return {
    ...secondary,
    fallback: true,
    usage: addUsage(primary.usage, secondary.usage),
    costUsd: Number((primary.costUsd + secondary.costUsd).toFixed(6)),
    primaryModel: task.model || '',
  };
}

