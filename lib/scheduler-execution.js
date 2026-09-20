import { checkAndApplyBurnGuard } from './burn-guard.js';
import { resolveTaskForExecution } from './prompt-interpolation.js';
import { bestEffort } from './best-effort.js';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import { parseLlmActionDirectives, executeLlmActionDirectives } from './llm-actions.js';
import { applySilentRule } from './silent-rule.js';
import { inspectFailure } from './failure-inspector.js';

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
  const type = String(task.preflightType || 'none').toLowerCase();
  const target = String(task.preflightTarget || '').trim();
  if (!type || type === 'none' || !target) {
    return { ok: true };
  }

  if (type === 'http') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(target, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return { ok: true };
      return { ok: false, reason: `HTTP check returned status ${res.status}` };
    } catch (err) {
      return { ok: false, reason: `HTTP check failed: ${err.message}` };
    }
  }

  if (type === 'command') {
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
    const requiredMb = Number(target) || 100;
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(process.cwd());
        const freeMb = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
        if (freeMb < requiredMb) {
          return { ok: false, reason: `Free disk space (${freeMb} MB) is below required ${requiredMb} MB` };
        }
      }
      return { ok: true };
    } catch (err) {
      bestEffort('statfsSync', () => {}, null);
      return { ok: true }; // Fail-open
    }
  }

  return { ok: true };
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
  console.log(`[dsh-cron] task "${task.title}" failed on ${task.model || 'the default model'}, retrying once on ${task.fallbackModel}`);
  const secondary = await scheduler.executeOnce(fallbackTask, signal, options);
  return {
    ...secondary,
    fallback: true,
    usage: addUsage(primary.usage, secondary.usage),
    costUsd: Number((primary.costUsd + secondary.costUsd).toFixed(6)),
    primaryModel: task.model || '',
  };
}

/**
 * Begin a task run with concurrency and overlap policy checks.
 */
export function beginRun(scheduler, task, taskId) {
  if (!scheduler.running.has(taskId) && scheduler.maxConcurrent > 0 && scheduler.running.size >= scheduler.maxConcurrent) {
    if (task.overlapPolicy === 'queue') {
      console.log(`[dsh-cron] Task "${task.title}" (${taskId}) queued by concurrency limit (${scheduler.maxConcurrent})`);
      scheduler.queue.push({ taskId, priority: task.priority !== undefined ? task.priority : 5, queuedAt: Date.now() });
      scheduler.queue.sort((a, b) => (a.priority - b.priority) || (a.queuedAt - b.queuedAt));
      return null;
    }
    console.log(`[dsh-cron] Task "${task.title}" (${taskId}) skipped: concurrency limit (${scheduler.maxConcurrent})`);
    scheduler.recordSkipped(taskId, `Skipped: concurrency limit reached (${scheduler.maxConcurrent} parallel runs)`);
    return null;
  }

  const overlapPolicy = task.overlapPolicy || 'skip';
  const active = scheduler.running.get(taskId);
  if (active) {
    if (overlapPolicy === 'skip') {
      console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, skipping run (overlapPolicy: skip)`);
      scheduler.recordSkipped(taskId, 'Skipped: the previous run is still in progress (overlapPolicy: skip)');
      return null;
    }
    if (overlapPolicy === 'replace') {
      console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, canceling current run (overlapPolicy: replace)`);
      active.controller.abort(new Error('Aborted by overlap policy: replace'));
    }
    if (overlapPolicy === 'queue') {
      console.log(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, queueing next run (overlapPolicy: queue)`);
      active.queueCount = (active.queueCount || 0) + 1;
      return null;
    }
  }

  const controller = new AbortController();
  const currentRun = { controller, startedAt: Date.now(), queueCount: 0 };
  scheduler.running.set(taskId, currentRun);
  return currentRun;
}

/**
 * Run task by ID.
 */
export async function executeTask(scheduler, taskId, options = {}) {
  const task = scheduler.store.get(taskId);
  if (!task) return null;

  if (!options.isRetry && task.attempts) {
    task.attempts = 0;
    scheduler.store.set(task);
  }

  if (options.dryRun) {
    const start = Date.now();
    const outcome = await scheduler.executeWithFallback(task, AbortSignal.timeout(Math.min((task.timeoutSeconds || 1800) * 1000, 30000)), options);
    return {
      ok: true,
      dryRun: true,
      status: outcome.status,
      output: outcome.output,
      error: outcome.error,
      durationMs: Date.now() - start,
      usage: outcome.usage,
      costUsd: outcome.costUsd,
      model: outcome.model || task.model || '',
    };
  }

  const currentRun = scheduler.beginRun(task, taskId);
  if (currentRun === null) return null;

  const preflight = await executePreflight(task);
  if (!preflight.ok) {
    console.log(`[dsh-cron] task "${task.title}" (${taskId}) skipped: ${preflight.reason}`);
    scheduler.running.delete(taskId);
    scheduler.recordSkipped(taskId, `Preflight check skipped: ${preflight.reason}`);
    return null;
  }

  const start = Date.now();
  const outcome = await scheduler.executeWithFallback(task, currentRun.controller.signal, options);
  await scheduler.completeRun(task, taskId, currentRun, outcome, start, options);
  return outcome;
}

/**
 * Ask the model to diagnose a failed run (#43). Never throws.
 */
export async function inspectFailureRun(task, runInfo, { askModel, readSettingsFn, inspectTimeoutMs }) {
  if (typeof askModel !== 'function') return { inspected: false, error: 'no model is available' };
  const settings = readSettingsFn ? readSettingsFn() : {};
  try {
    return await inspectFailure({
      task,
      runInfo,
      ask: askModel,
      preferredModel: String(settings.inspectorModel || ''),
      timeoutMs: inspectTimeoutMs || 25000,
    });
  } catch (err) {
    return { inspected: false, error: err.message };
  }
}

/**
 * Ask the silent rule whether this run should be delivered (#44).
 * Never throws: any problem means "deliver".
 */
export async function applySilentRuleToRun(task, runInfo, { askModel, readSettingsFn, silentRuleTimeoutMs }) {
  if (typeof askModel !== 'function') return { skipped: false, reason: '' };
  const preferredModel = String((readSettingsFn ? readSettingsFn() : {}).silentRuleModel || '');
  try {
    return await applySilentRule({
      task,
      runInfo,
      ask: askModel,
      preferredModel,
      timeoutMs: silentRuleTimeoutMs || 20000,
    });
  } catch (err) {
    return { skipped: false, reason: '', verdictError: err.message };
  }
}

/**
 * Run the model-assisted steps for a finished run.
 */
export async function applyModelAssists(task, runInfo, options) {
  const inspection = await inspectFailureRun(task, runInfo, options);
  if (inspection.inspected) {
    runInfo.diagnosis = inspection.diagnosis;
    runInfo.suggestion = inspection.suggestion;
    runInfo.confidence = inspection.confidence;
    console.log(`[dsh-cron] task "${task.title}" failure diagnosed (${inspection.confidence}): ${inspection.diagnosis}`);
  } else if (inspection.error && task.inspectOnFailure) {
    console.warn(`[dsh-cron] failure inspection for "${task.title}" not applied: ${inspection.error}`);
  }

  const silent = await applySilentRuleToRun(task, runInfo, options);
  if (silent.skipped) {
    runInfo.silentSkip = true;
    runInfo.silentReason = silent.reason;
    console.log(`[dsh-cron] task "${task.title}" stayed silent by rule: ${silent.reason || 'no reason given'}`);
  } else if (silent.verdictError) {
    console.warn(`[dsh-cron] silent rule for "${task.title}" not applied: ${silent.verdictError}`);
  }
  return silent;
}

/**
 * Deliver a finished run to every configured channel (#26).
 */
export async function deliverNotifications(task, runInfo, { store, resolveSecrets, deliver }) {
  try {
    let settings = typeof store?.getSettings === 'function' ? store.getSettings() : {};
    if (resolveSecrets) {
      try {
        settings = { ...settings, ...(await resolveSecrets(settings)) };
      } catch (secErr) {
        console.warn('[dsh-cron] credential resolution failed:', secErr.message);
      }
    }
    if (typeof deliver !== 'function') return;
    const result = await deliver(task, runInfo, settings);
    if (result && Array.isArray(result.delivered) && result.delivered.length) {
      console.log(`[dsh-cron] delivered "${task.title}" to: ${result.delivered.map((d) => d.channel).join(', ')}`);
    }
    if (result && Array.isArray(result.failures) && result.failures.length) {
      console.warn(`[dsh-cron] delivery failures for "${task.title}": ${result.failures.map((f) => `${f.channel}: ${f.error}`).join('; ')}`);
    }
  } catch (notifyErr) {
    console.error('[dsh-cron] notification error:', notifyErr.message);
  }
}

/**
 * Post-run bookkeeping: one-shot completion, next-run timestamp, retry backoff, draining.
 */
export function finishRun(scheduler, task, taskId, status, queuedCount) {
  scheduler.countRun(status);
  try {
    if (task.oneShot) {
      task.status = 'completed';
      task.nextRunAt = null;
      scheduler.store.set(task);
    } else {
      const job = scheduler.jobs.get(taskId);
      if (job) {
        const next = job.nextRun();
        task.nextRunAt = next ? next.getTime() : null;
        scheduler.store.set(task);
      }
    }
  } catch (err) {
    console.error('[dsh-cron] failed to persist the next run of task', taskId + ':', err.message);
  }

  try {
    const failed = status === 'error' || status === 'timeout';
    const maxRetries = Number(task.maxRetries) > 0 ? Number(task.maxRetries) : 0;
    if (failed && maxRetries > 0 && (task.attempts || 0) < maxRetries && task.status !== 'paused') {
      task.attempts = (task.attempts || 0) + 1;
      const backoffMs = (Number(task.retryBackoffMs) > 0 ? Number(task.retryBackoffMs) : 30000) * Math.pow(2, task.attempts - 1);
      const attempt = task.attempts;
      scheduler.store.set(task);
      scheduler.clearRetryTimer(taskId);
      scheduler.retryTimers.set(taskId, setTimeout(() => {
        scheduler.retryTimers.delete(taskId);
        scheduler.runTask(taskId, { isRetry: true });
      }, backoffMs));
      console.log(`[dsh-cron] retry ${attempt}/${maxRetries} for task "${task.title}" in ${backoffMs}ms`);
    } else if (!failed && task.attempts) {
      task.attempts = 0;
      scheduler.store.set(task);
    } else if (failed && maxRetries > 0 && (task.attempts || 0) >= maxRetries) {
      task.attempts = 0;
      scheduler.store.set(task);
    }
  } catch (err) {
    console.error('[dsh-cron] retry bookkeeping failed for task', taskId + ':', err.message);
  }

  if (queuedCount > 0) {
    setImmediate(() => {
      scheduler.runTask(taskId);
    });
  }
}

/**
 * Handle complete run lifecycle: metrics, self-healing, diagnosis, silent rule, storage, delivery, chaining.
 */
export async function handleCompleteRun(scheduler, task, taskId, currentRun, outcome, start, options = {}) {
  const isSuccess = outcome.status === 'success';
  const isFailure = outcome.status === 'error' || outcome.status === 'timeout';
  const runInfo = {
    at: start,
    status: outcome.status,
    durationMs: Date.now() - start,
    output: outcome.output,
    error: outcome.error,
    usage: outcome.usage,
    costUsd: outcome.costUsd,
    sessionId: outcome.sessionId,
    model: outcome.model || task.model || '',
    fallback: Boolean(outcome.fallback),
  };

  if (isFailure && task.selfHealingCommand) {
    console.log(`[dsh-cron] running self-healing command for task "${task.title}": ${task.selfHealingCommand}`);
    try {
      await new Promise((resolve) => {
        exec(task.selfHealingCommand, { timeout: 30000 }, (shErr, stdout, stderr) => {
          runInfo.selfHealing = {
            command: task.selfHealingCommand,
            success: !shErr,
            output: (stdout + (stderr ? '\n' + stderr : '')).trim().slice(0, 500),
          };
          resolve();
        });
      });
    } catch (shErr) {
      runInfo.selfHealing = { command: task.selfHealingCommand, success: false, error: shErr.message };
    }
  }

  if (isFailure && task.autoDiagnose && typeof scheduler.executeFn === 'function') {
    try {
      const diagRes = await scheduler.executeFn({
        type: 'llm',
        prompt: `Diagnose this task failure in 1-2 concise sentences. Error: ${outcome.error || 'unknown'}. Recent output: ${(outcome.output || '').slice(-300)}`,
        model: task.fallbackModel || task.model,
      }, { signal: AbortSignal.timeout(10000) });
      if (diagRes && diagRes.output) {
        runInfo.autoDiagnosis = diagRes.output.trim();
      }
    } catch (diagErr) {
      bestEffort('auto-diagnose', () => {}, scheduler.logger);
    }
  }

  const silent = await scheduler.applyModelAssists(task, runInfo);

  try {
    scheduler.store.recordRun(taskId, runInfo);
  } catch (recordErr) {
    console.error(`[dsh-cron] failed to record the run of task ${taskId}:`, recordErr.message);
  }

  const finishedRun = scheduler.running.get(taskId);
  if (finishedRun === currentRun) scheduler.running.delete(taskId);
  const queuedCount = finishedRun?.queueCount || 0;

  if (!silent.skipped) await scheduler.deliverNotifications(task, runInfo);
  scheduler.finishRun(task, taskId, outcome.status, queuedCount);

  const guard = await checkAndApplyBurnGuard(scheduler, taskId, outcome);
  if (guard && guard.exceeded) return;

  while (scheduler.queue.length > 0 && scheduler.running.size < scheduler.maxConcurrent) {
    const nextItem = scheduler.queue.shift();
    if (!nextItem) break;
    const queuedTask = scheduler.store.get(nextItem.taskId);
    if (queuedTask && queuedTask.status === 'active') {
      setImmediate(() => {
        scheduler.runTask(nextItem.taskId).catch((runErr) => {
          bestEffort('drain-queued-task', () => {}, scheduler.logger);
        });
      });
      break;
    }
  }

  // 1. Structured LLM Actions (#137)
  if (task.type === 'llm' && outcome.status === 'success' && outcome.output) {
    try {
      const settings = typeof scheduler.store.getSettings === 'function' ? scheduler.store.getSettings() : {};
      if (settings.llmActionsEnabled) {
        const directives = parseLlmActionDirectives(outcome.output);
        if (directives.length > 0) {
          await executeLlmActionDirectives({
            directives,
            task,
            runInfo,
            scheduler,
            store: scheduler.store,
            settings,
          });
        }
      }
    } catch (actErr) {
      console.warn(`[dsh-cron] structured action error for ${taskId}:`, actErr.message);
    }
  }

  // 2. Task Chaining (#137)
  const nextTaskId = isSuccess ? task.onSuccess : (isFailure ? task.onFailure : null);
  if (nextTaskId && typeof nextTaskId === 'string' && nextTaskId.trim()) {
    const currentDepth = options.chainDepth || 0;
    if (currentDepth < 4) {
      const targetId = nextTaskId.trim();
      const nextTask = scheduler.store.get(targetId);
      if (nextTask) {
        console.log(`[dsh-cron] triggering chained task "${nextTask.title}" (${targetId}) from "${task.title}" (depth ${currentDepth + 1})`);
        scheduler.runNow(targetId, {
          chainDepth: currentDepth + 1,
          prevOutput: outcome.output || outcome.error || '',
          prevTaskId: task.id,
          prevStatus: outcome.status,
          prevDurationMs: Date.now() - start,
          prevCostUsd: outcome.costUsd || 0,
        }).catch((err) => {
          console.warn(`[dsh-cron] chained task ${targetId} failed to trigger:`, err.message);
        });
      } else {
        console.warn(`[dsh-cron] chained task target not found: ${targetId}`);
      }
    } else {
      console.warn(`[dsh-cron] chained task depth limit (5) reached for task ${task.id} -> ${nextTaskId}. Loop prevented.`);
    }
  }
}

