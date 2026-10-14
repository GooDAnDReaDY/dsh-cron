import { evaluateAdaptiveRun, calculateNextAdaptiveState } from './adaptive.js';
import { approvalManager } from './approval.js';
import { globalBudgetManager } from './global-budgets.js';
import { validateRunResult } from './validators.js';
import { logger } from './logger.js';
import { checkAndApplyBurnGuard, checkTaskBudgetLimits } from './burn-guard.js';
import { resolveTaskForExecution } from './prompt-interpolation.js';
import { bestEffort } from './best-effort.js';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import { parseLlmActionDirectives, executeLlmActionDirectives } from './llm-actions.js';
import { applySilentRule } from './silent-rule.js';
import { inspectFailure } from './failure-inspector.js';
import { parseChainTargets, sanitizeDependsOn } from './dag.js';

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

/**
 * Begin a task run with concurrency and overlap policy checks.
 */
export function beginRun(scheduler, task, taskId, options = {}) {
  if (scheduler.isStopped) return null;
  if (!scheduler.running.has(taskId) && scheduler.maxConcurrent > 0 && scheduler.running.size >= scheduler.maxConcurrent) {
    if (task.overlapPolicy === 'queue') {
      logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) queued by concurrency limit (${scheduler.maxConcurrent})`);
      scheduler.queue.push({
        taskId,
        options: { ...options },
        priority: task.priority !== undefined ? task.priority : 5,
        queuedAt: Date.now(),
      });
      scheduler.queue.sort((a, b) => (a.priority - b.priority) || (a.queuedAt - b.queuedAt));
      return null;
    }
    logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) skipped: concurrency limit (${scheduler.maxConcurrent})`);
    scheduler.recordSkipped(taskId, `Skipped: concurrency limit reached (${scheduler.maxConcurrent} parallel runs)`);
    return null;
  }

  const group = task.concurrencyGroup && task.concurrencyGroup !== 'default' ? String(task.concurrencyGroup).trim() : null;
  const groupLimit = scheduler.getGroupLimit ? scheduler.getGroupLimit(group) : (group ? 1 : 0);
  if (group && groupLimit > 0 && !scheduler.running.has(taskId)) {
    const runningInGroup = scheduler.getRunningGroupCount ? scheduler.getRunningGroupCount(group) : 0;
    if (runningInGroup >= groupLimit) {
      if (task.overlapPolicy === 'queue') {
        logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) queued by group "${group}" limit (${groupLimit})`);
        scheduler.queue.push({
          taskId,
          options: { ...options },
          priority: task.priority !== undefined ? task.priority : 5,
          queuedAt: Date.now(),
        });
        scheduler.queue.sort((a, b) => (a.priority - b.priority) || (a.queuedAt - b.queuedAt));
        return null;
      }
      logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) skipped: concurrency group "${group}" limit reached (${groupLimit})`);
      scheduler.recordSkipped(taskId, `Skipped: concurrency group "${group}" limit reached (${groupLimit} parallel runs)`);
      return null;
    }
  }

  const overlapPolicy = task.overlapPolicy || 'skip';
  const active = scheduler.running.get(taskId);
  if (active) {
    if (overlapPolicy === 'skip') {
      logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, skipping run (overlapPolicy: skip)`);
      scheduler.recordSkipped(taskId, 'Skipped: the previous run is still in progress (overlapPolicy: skip)');
      return null;
    }
    if (overlapPolicy === 'replace') {
      logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, canceling current run (overlapPolicy: replace)`);
      active.controller.abort(new Error('Aborted by overlap policy: replace'));
    }
    if (overlapPolicy === 'queue') {
      logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) is already running, queueing next run (overlapPolicy: queue)`);
      active.queuedRuns = active.queuedRuns || [];
      active.queuedRuns.push({ options: { ...options }, queuedAt: Date.now() });
      active.queueCount = active.queuedRuns.length;
      return null;
    }
  }

  const controller = new AbortController();
  const runId = 'run_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now();
  const pendingOverlap = Array.isArray(options?.pendingOverlapQueue) ? options.pendingOverlapQueue : [];
  const currentRun = {
    id: runId,
    controller,
    startedAt: Date.now(),
    queuedRuns: pendingOverlap,
    queueCount: pendingOverlap.length,
    concurrencyGroup: group || 'default',
  };
  scheduler.running.set(taskId, currentRun);
  return currentRun;
}

/**
 * Run task by ID.
 */
export async function executeTask(scheduler, taskId, options = {}) {
  if (scheduler.isStopped) return null;
  const task = scheduler.store.get(taskId);
  if (!task) return null;

  // Dry-run path: read-only evaluation without mutating store, history, attempts, or triggering alerts (#229)
  if (options.dryRun) {
    const runs = (scheduler.store.history && scheduler.store.history.get(taskId)) || [];
    const guard = checkTaskBudgetLimits(task, runs);
    if (guard.exceeded) {
      return {
        ok: false,
        dryRun: true,
        status: 'error',
        error: guard.reason,
        preflightBlocked: true,
      };
    }
    const preflight = await executePreflight(task);
    if (!preflight.ok) {
      return {
        ok: false,
        dryRun: true,
        status: 'skipped',
        error: `Preflight check skipped: ${preflight.reason}`,
        preflightBlocked: true,
      };
    }
    const start = Date.now();
    const outcome = await scheduler.executeWithFallback(
      task,
      AbortSignal.timeout(Math.min((task.timeoutSeconds || 1800) * 1000, 30000)),
      options
    );
    return {
      ok: outcome.status !== 'error' && outcome.status !== 'timeout',
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
  // 0. Idempotency Check (#317): deduplicate runs with an already completed idempotency key
  if (options.idempotencyKey && scheduler.store.durableJournal) {
    const existing = scheduler.store.durableJournal.isIdempotencyKeyExecuted(taskId, options.idempotencyKey);
    if (existing) {
      logger.info(`[dsh-cron] Idempotency key "${options.idempotencyKey}" already executed for task "${taskId}", returning cached run`);
      return {
        ok: existing.status === 'completed' || existing.status === 'success',
        idempotentReplay: true,
        runId: existing.id,
        status: existing.status,
        output: existing.output,
        costUsd: existing.costUsd,
        durationMs: existing.durationMs,
      };
    }
  }


  // 1. Approval Gate (#318): Human-in-the-loop check before executing actions requiring approval
  if (task.requireApproval && !options.approvedBy) {
    let pending = approvalManager.getPendingProposalForTask(taskId);
    if (!pending) {
      pending = approvalManager.createProposal(taskId, null, {
        actionType: 'run',
        summary: `Execution of task "${task.title}" requires human approval`,
        details: { prompt: task.prompt, type: task.type, model: task.model }
      });
    }
    logger.info(`[dsh-cron] Task "${task.title}" (${taskId}) paused awaiting human approval (${pending.id})`);
    scheduler.recordSkipped(taskId, `Awaiting human approval: proposal ${pending.id}`);
    return { ok: false, status: 'waiting_approval', proposalId: pending.id, stoppedReason: 'Awaiting human approval' };
  }

  // 2. Global & Provider/Model Budgets (#320)
  const settings = typeof scheduler.store.getSettings === 'function' ? scheduler.store.getSettings() : {};
  const globalBudget = globalBudgetManager.checkBudget(scheduler.store, task, settings);
  if (globalBudget.exceeded) {
    logger.warn(`[dsh-cron] Global budget limit blocked task "${task.title}" (${taskId}): ${globalBudget.reason}`);
    scheduler.recordSkipped(taskId, `Budget limit reached: ${globalBudget.reason}`);
    return { ok: false, status: 'error', error: globalBudget.reason, budgetBlocked: true };
  }

  // Pre-flight Burn Guard check (#181): prevent executing task if budget already breached
  const runs = (scheduler.store.history && scheduler.store.history.get(taskId)) || [];
  const guard = checkTaskBudgetLimits(task, runs);
  if (guard.exceeded) {
    logger.warn(`[dsh-cron] Burn Guard pre-flight blocked task "${task.title}" (${taskId}): ${guard.reason}`);
    scheduler.pauseTask(taskId, guard.reason);
    scheduler.recordSkipped(taskId, `Burn Guard pre-flight pause: ${guard.reason}`);
    checkAndApplyBurnGuard(scheduler, taskId, { status: 'error', costUsd: 0, durationMs: 0 }).catch(() => {});
    return { ok: false, status: 'error', error: guard.reason, preflightBlocked: true };
  }

  if (!options.isRetry && task.attempts) {
    task.attempts = 0;
    scheduler.store.set(task);
  }

  const currentRun = scheduler.beginRun(task, taskId, options);
  if (currentRun === null) return null;

  const preflightStart = Date.now();
  const preflight = await executePreflight(task);
  const preflightDurationMs = Date.now() - preflightStart;
  if (!preflight.ok) {
    logger.info(`[dsh-cron] task "${task.title}" (${taskId}) skipped: ${preflight.reason}`);
    scheduler.running.delete(taskId);
    scheduler.recordSkipped(taskId, `Preflight check skipped: ${preflight.reason}`);
    return null;
  }

  const start = Date.now();
  const reservationId = globalBudgetManager.reserve(task);
  let outcome;
  try {
    outcome = await scheduler.executeWithFallback(task, currentRun.controller.signal, options);
  } finally {
    globalBudgetManager.settle(reservationId);
  }
  await scheduler.completeRun(task, taskId, currentRun, outcome, start, {
    ...options,
    preflightDurationMs,
  });
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
    logger.info(`[dsh-cron] task "${task.title}" failure diagnosed (${inspection.confidence}): ${inspection.diagnosis}`);
  } else if (inspection.error && task.inspectOnFailure) {
    logger.warn(`[dsh-cron] failure inspection for "${task.title}" not applied: ${inspection.error}`);
  }

  const silent = await applySilentRuleToRun(task, runInfo, options);
  if (silent.skipped) {
    runInfo.silentSkip = true;
    runInfo.silentReason = silent.reason;
    logger.info(`[dsh-cron] task "${task.title}" stayed silent by rule: ${silent.reason || 'no reason given'}`);
  } else if (silent.verdictError) {
    logger.warn(`[dsh-cron] silent rule for "${task.title}" not applied: ${silent.verdictError}`);
  }
  return silent;
}

/**
 * Deliver a finished run to every configured channel (#26).
 */
export async function deliverNotifications(task, runInfo, { store, resolveSecrets, deliver, secretTimeoutMs = 5000 }) {
  try {
    let settings = typeof store?.getSettings === 'function' ? store.getSettings() : {};
    if (resolveSecrets) {
      try {
        let timer;
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`credential resolution timed out after ${secretTimeoutMs}ms`)), secretTimeoutMs);
          if (typeof timer.unref === 'function') timer.unref();
        });
        const resolved = await Promise.race([
          Promise.resolve(resolveSecrets(settings)).finally(() => {
            if (timer) clearTimeout(timer);
          }),
          deadline,
        ]);
        settings = { ...settings, ...(resolved || {}) };
      } catch (secErr) {
        logger.warn('[dsh-cron] credential resolution failed:', secErr.message);
      }
    }
    if (typeof deliver !== 'function') return { status: 'skipped', delivered: [], failures: [] };
    const result = await deliver(task, runInfo, settings);
    if (result && Array.isArray(result.delivered) && result.delivered.length) {
      logger.info(`[dsh-cron] delivered "${task.title}" to: ${result.delivered.map((d) => d.channel).join(', ')}`);
    }
    if (result && Array.isArray(result.failures) && result.failures.length) {
      logger.warn(`[dsh-cron] delivery failures for "${task.title}": ${result.failures.map((f) => `${f.channel}: ${f.error}`).join('; ')}`);
    }
    const delivered = Array.isArray(result?.delivered) ? result.delivered : [];
    const failures = Array.isArray(result?.failures) ? result.failures : [];
    let status = 'skipped';
    if (delivered.length > 0 && failures.length === 0) status = 'delivered';
    else if (delivered.length > 0 && failures.length > 0) status = 'partial';
    else if (delivered.length === 0 && failures.length > 0) status = 'failed';
    return { status, delivered, failures };
  } catch (notifyErr) {
    logger.error('[dsh-cron] notification error:', notifyErr.message);
    return { status: 'failed', delivered: [], failures: [{ channel: 'all', error: notifyErr.message }] };
  }
}

/**
 * Post-run bookkeeping: one-shot completion, next-run timestamp, retry backoff, draining.
 */
export function finishRun(scheduler, taskSnapshot, taskId, status, queuedCount, meta = {}) {
  scheduler.countRun(status);

  // Adaptive polling backoff (#329)
  if (taskSnapshot && taskSnapshot.adaptive && taskSnapshot.adaptive.enabled && !taskSnapshot.oneShot && taskSnapshot.status === 'active' && !scheduler.isStopped) {
    const history = scheduler.store.getHistory ? scheduler.store.getHistory(taskId, 2) : [];
    const prevRun = history.length > 1 ? history[1] : null;
    const outcomeForEval = meta?.outcome || { status };
    const runInfoForEval = meta?.runInfo || {};
    const evalRes = evaluateAdaptiveRun(taskSnapshot, outcomeForEval, runInfoForEval, prevRun);
    const nextAdaptiveState = calculateNextAdaptiveState(taskSnapshot, evalRes.isIdle);
    taskSnapshot.adaptiveState = nextAdaptiveState;
    scheduler.store.set(taskSnapshot);

    if (nextAdaptiveState.backedOff) {
      logger.info(`[dsh-cron] adaptive backoff active for "${taskSnapshot.title}" (${taskSnapshot.id}): interval scaled to ${nextAdaptiveState.effectiveIntervalStr} (idle count: ${nextAdaptiveState.idleCount})`);
      scheduler.armAdaptiveTimer(taskId, nextAdaptiveState.currentIntervalMs);
    } else {
      scheduler.clearAdaptiveTimer(taskId);
      if (!scheduler.jobs.has(taskId)) {
        scheduler.scheduleTask(taskSnapshot);
      }
    }
  }

  // If this run was superseded by a newer run or scheduler is stopped, skip updating task
  if (meta.isCurrentRun === false || scheduler.isStopped) {
    return;
  }

  // Refetch live task from store to avoid resurrecting deleted task or overwriting edits (#215)
  const current = scheduler.store.get(taskId);
  if (!current) {
    logger.info(`[dsh-cron] finishRun: task "${taskId}" no longer exists in store; skipping completion write`);
    return;
  }

  try {
    if (current.oneShot) {
      current.status = 'completed';
      current.nextRunAt = null;
      scheduler.store.set(current);
    } else {
      const job = scheduler.jobs.get(taskId);
      if (job) {
        const next = job.nextRun();
        current.nextRunAt = next ? next.getTime() : null;
        scheduler.store.set(current);
      }
    }
  } catch (err) {
    logger.error('[dsh-cron] failed to persist the next run of task', taskId + ':', err.message);
  }

  try {
    const failed = status === 'error' || status === 'timeout';
    const maxRetries = Number(current.maxRetries) > 0 ? Number(current.maxRetries) : 0;
    if (failed && maxRetries > 0 && (current.attempts || 0) < maxRetries && current.status !== 'paused' && !scheduler.isStopped) {
      current.attempts = (current.attempts || 0) + 1;
      const backoffMs = (Number(current.retryBackoffMs) > 0 ? Number(current.retryBackoffMs) : 30000) * Math.pow(2, current.attempts - 1);
      const attempt = current.attempts;
      scheduler.store.set(current);
      scheduler.clearRetryTimer(taskId);
      scheduler.retryTimers.set(taskId, setTimeout(() => {
        scheduler.retryTimers.delete(taskId);
        if (!scheduler.isStopped) {
          scheduler.runTask(taskId, { isRetry: true });
        }
      }, backoffMs));
      logger.info(`[dsh-cron] retry ${attempt}/${maxRetries} for task "${current.title}" in ${backoffMs}ms`);
    } else if (!failed && current.attempts) {
      current.attempts = 0;
      scheduler.store.set(current);
    } else if (failed && maxRetries > 0 && (current.attempts || 0) >= maxRetries) {
      current.attempts = 0;
      scheduler.store.set(current);
    }
  } catch (err) {
    logger.error('[dsh-cron] retry bookkeeping failed for task', taskId + ':', err.message);
  }

  if (queuedCount > 0 && !scheduler.isStopped) {
    const queuedRuns = Array.isArray(meta?.queuedRuns) ? [...meta.queuedRuns] : [];
    const nextItem = queuedRuns.shift();
    const nextOptions = {
      ...(nextItem?.options || {}),
      ...(queuedRuns.length > 0 ? { pendingOverlapQueue: queuedRuns } : {}),
    };
    setImmediate(() => {
      if (!scheduler.isStopped) {
        scheduler.runTask(taskId, nextOptions);
      }
    });
  }
}

/**
 * Handle complete run lifecycle: metrics, self-healing, diagnosis, silent rule, storage, delivery, chaining.
 */
function computeStoppedReason(status, valRes, error) {
  if (status === 'validation_failed') return `Validation failed: ${valRes?.error || 'Check failed'}`;
  if (status === 'validator_error') return `Validator configuration error: ${valRes?.error || 'Check failed'}`;
  if (status === 'timeout') return 'Execution timed out';
  if (status === 'error') return error ? `Execution error: ${error}` : 'Execution error';
  if (status === 'success') return 'Completed successfully';
  if (status === 'skipped') return error || 'Run skipped';
  return null;
}

export async function handleCompleteRun(scheduler, task, taskId, currentRun, outcome, start, options = {}) {
  // Post-execution declarative validation (#316)
  let valRes = { ok: true, skipped: true };
  let valDurationMs = 0;
  if (outcome.status === 'success' && Array.isArray(task.validators) && task.validators.length > 0) {
    const vStart = Date.now();
    valRes = validateRunResult(task, outcome, { cwd: task.cwd });
    valDurationMs = Date.now() - vStart;
    if (!valRes.ok) {
      outcome.status = valRes.status === 'error' ? 'validator_error' : 'validation_failed';
      outcome.error = valRes.error || 'Validation failed';
    }
  }

  const isSuccess = outcome.status === 'success';
  const isFailure = outcome.status === 'error' || outcome.status === 'timeout' || outcome.status === 'validation_failed' || outcome.status === 'validator_error';
  const executionMs = Date.now() - start;
  const queueWaitMs = (currentRun && currentRun.startedAt && currentRun.queuedAt) ? (currentRun.startedAt - currentRun.queuedAt) : 0;
  const preflightMs = options.preflightDurationMs || 0;

  const runInfo = {
    runId: currentRun?.id || ('run_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now()),
    at: start,
    status: outcome.status,
    durationMs: executionMs,
    output: outcome.output,
    error: outcome.error,
    usage: outcome.usage,
    costUsd: outcome.costUsd,
    sessionId: outcome.sessionId,
    model: outcome.model || task.model || '',
    fallback: Boolean(outcome.fallback),
    validation: valRes.skipped ? null : valRes,
  };

  if (isFailure && task.selfHealingCommand) {
    logger.info(`[dsh-cron] running self-healing command for task "${task.title}": ${task.selfHealingCommand}`);
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

  let deliveryResult = { status: 'skipped', delivered: [], failures: [] };
  let delivStart = Date.now();
  if (!silent.skipped) {
    deliveryResult = (await scheduler.deliverNotifications(task, runInfo)) || deliveryResult;
  }
  const delivDurationMs = Date.now() - delivStart;

  const stages = [
    {
      name: 'queue',
      status: 'success',
      durationMs: queueWaitMs,
    },
    {
      name: 'preflight',
      status: 'success',
      durationMs: preflightMs,
      error: null,
    },
    {
      name: 'execution',
      status: (outcome.status === 'error' || outcome.status === 'timeout') ? 'failed' : 'success',
      durationMs: executionMs,
      error: (outcome.status === 'error' || outcome.status === 'timeout') ? (outcome.error || null) : null,
    },
    {
      name: 'validation',
      status: valRes.skipped ? 'skipped' : (valRes.ok ? 'success' : 'failed'),
      durationMs: valDurationMs,
      error: valRes.ok ? null : (valRes.error || null),
    },
    {
      name: 'delivery',
      status: deliveryResult?.status || 'skipped',
      durationMs: delivDurationMs,
      error: (deliveryResult?.failures && deliveryResult.failures.length > 0)
        ? deliveryResult.failures.map(f => `${f.channel}: ${f.error}`).join('; ')
        : null,
      delivered: deliveryResult?.delivered || [],
      failures: deliveryResult?.failures || [],
    },
  ];

  runInfo.stages = stages;
  runInfo.delivery = deliveryResult;
  runInfo.cost = {
    amount: Number(outcome.costUsd) || 0,
    currency: 'USD',
    kind: (Number(outcome.costUsd) > 0) ? 'exact' : ((task.type === 'llm' || task.type === 'skill' || task.type === 'workflow') ? 'unknown' : 'exact'),
  };
  runInfo.stoppedReason = computeStoppedReason(outcome.status, valRes, outcome.error);
  // Durable journal & Idempotency (#317)
  runInfo.idempotencyKey = options.idempotencyKey || currentRun?.idempotencyKey || null;

  // Artifacts capture (#321)
  if (Array.isArray(outcome.artifacts) && scheduler.store.artifactManager) {
    for (const art of outcome.artifacts) {
      if (art && art.name && (art.content || art.data)) {
        try {
          scheduler.store.artifactManager.saveArtifact(runInfo.runId, taskId, art.name, art.content || art.data);
        } catch (artErr) {
          logger.warn(`[dsh-cron] failed to save artifact ${art.name}:`, artErr.message);
        }
      }
    }
  }
  if (scheduler.store.getArtifactsForRun) {
    runInfo.artifacts = scheduler.store.getArtifactsForRun(runInfo.runId);
  }

  // Chain Checkpoints (#319, #328)
  const chainedTargets = parseChainTargets(outcome.status === 'success' ? task.onSuccess : task.onFailure);
  let hasDependents = false;
  if (scheduler.store?.tasks) {
    for (const t of Object.values(scheduler.store.tasks)) {
      if (t && sanitizeDependsOn(t.dependsOn).includes(taskId)) {
        hasDependents = true;
        break;
      }
    }
  }
  const chainRunId = options.chainRunId || ((chainedTargets.length > 0 || hasDependents) ? ('chain_' + Math.random().toString(36).slice(2, 10)) : null);
  if (chainRunId) {
    runInfo.chainRunId = chainRunId;
    if (scheduler.store.chainCheckpointManager) {
      scheduler.store.chainCheckpointManager.recordStepSnapshot(chainRunId, taskId, {
        status: outcome.status,
        input: { prompt: task.prompt, prevOutput: options.prevOutput || options.chainPrevOutput || '', prevOutputs: options.prevOutputs || {} },
        output: outcome.output || outcome.error || '',
        durationMs: executionMs,
      });
    }
  }

  // Update Durable Journal (#317)
  if (scheduler.store.durableJournal) {
    const journalState = outcome.status === 'success' ? 'completed' : (outcome.status === 'uncertain' ? 'uncertain' : 'failed');
    scheduler.store.durableJournal.transition(taskId, runInfo.runId, journalState, runInfo);
  }


  try {
    scheduler.store.recordRun(taskId, runInfo);
  } catch (recordErr) {
    logger.error(`[dsh-cron] failed to record the run of task ${taskId}:`, recordErr.message);
  }

  const finishedRun = scheduler.running.get(taskId);
  const isCurrentRun = (finishedRun === currentRun);
  if (isCurrentRun) scheduler.running.delete(taskId);
  const queuedRuns = isCurrentRun ? (finishedRun?.queuedRuns || []) : [];
  const queuedCount = isCurrentRun ? (finishedRun?.queueCount || 0) : 0;

  scheduler.finishRun(task, taskId, outcome.status, queuedCount, {
    isCurrentRun,
    runId: currentRun?.id,
    queuedRuns,
    outcome,
    runInfo,
    silent,
  });

  if (scheduler.isStopped) return;

  const guard = await checkAndApplyBurnGuard(scheduler, taskId, outcome);
  if (guard && guard.exceeded) return;

  if (!scheduler.isStopped && scheduler.queue.length > 0 && (scheduler.maxConcurrent === 0 || scheduler.running.size < scheduler.maxConcurrent)) {
    let admittedIndex = -1;
    for (let i = 0; i < scheduler.queue.length; i++) {
      const candidate = scheduler.queue[i];
      const queuedTask = scheduler.store.get(candidate.taskId);
      if (!queuedTask || queuedTask.status !== 'active') {
        scheduler.queue.splice(i, 1);
        i--;
        continue;
      }
      const qGroup = queuedTask.concurrencyGroup && queuedTask.concurrencyGroup !== 'default'
        ? String(queuedTask.concurrencyGroup).trim()
        : null;
      const qLimit = scheduler.getGroupLimit ? scheduler.getGroupLimit(qGroup) : (qGroup ? 1 : 0);
      if (qGroup && qLimit > 0) {
        const inGroup = scheduler.getRunningGroupCount ? scheduler.getRunningGroupCount(qGroup) : 0;
        if (inGroup >= qLimit) {
          continue;
        }
      }
      admittedIndex = i;
      break;
    }

    if (admittedIndex !== -1) {
      const nextItem = scheduler.queue.splice(admittedIndex, 1)[0];
      setImmediate(() => {
        if (!scheduler.isStopped) {
          scheduler.runTask(nextItem.taskId, nextItem.options || {}).catch((runErr) => {
            bestEffort('drain-queued-task', () => {}, scheduler.logger);
          });
        }
      });
    }
  }

  // 1. Structured LLM Actions (#137)
  if (task.type === 'llm' && outcome.status === 'success' && outcome.output) {
    try {
      const settings = typeof scheduler.store.getSettings === 'function' ? scheduler.store.getSettings() : {};
      if (settings.llmActionsEnabled) {
        const directives = parseLlmActionDirectives(outcome.output);
        if (directives.length > 0) {
          const actionResults = await executeLlmActionDirectives({
            directives,
            task,
            runInfo,
            scheduler,
            store: scheduler.store,
            settings,
            options,
          });
          if (actionResults && actionResults.length > 0) {
            runInfo.actionResults = actionResults;
          }
        }
      }
    } catch (actErr) {
      logger.warn(`[dsh-cron] structured action error for ${taskId}:`, actErr.message);
    }
  }

  // 2. Task Chaining (#137, #328 Fan-Out / Fan-In)
  const targets = parseChainTargets(isSuccess ? task.onSuccess : (isFailure ? task.onFailure : null));
  const currentDepth = options.chainDepth || 0;

  if (currentDepth < 4) {
    // 2.1 Trigger explicit targets (Fan-Out)
    for (const targetId of targets) {
      const nextTask = scheduler.store.get(targetId);
      if (!nextTask) {
        logger.warn(`[dsh-cron] chained task target not found: ${targetId}`);
        continue;
      }
      const deps = sanitizeDependsOn(nextTask.dependsOn);
      if (deps.length > 0 && scheduler.store.chainCheckpointManager) {
        const barrier = scheduler.store.chainCheckpointManager.checkJoinBarrier(chainRunId, nextTask);
        if (barrier.ready && scheduler.store.chainCheckpointManager.canTriggerBarrier(chainRunId, nextTask.id)) {
          scheduler.store.chainCheckpointManager.markBarrierTriggered(chainRunId, nextTask.id);
          logger.info(`[dsh-cron] triggering joined task "${nextTask.title}" (${targetId}) (barrier satisfied)`);
          scheduler.runNow(targetId, {
            chainRunId,
            chainDepth: currentDepth + 1,
            prevOutputs: barrier.outputs,
            prevOutput: barrier.latestOutput,
            prevTaskId: task.id,
            prevStatus: outcome.status,
            prevDurationMs: Date.now() - start,
            prevCostUsd: outcome.costUsd || 0,
          }).catch((err) => {
            logger.warn(`[dsh-cron] chained joined task ${targetId} failed to trigger:`, err.message);
          });
        } else if (barrier.pending) {
          logger.info(`[dsh-cron] task "${nextTask.title}" (${targetId}) waiting for dependencies: ${barrier.waitingFor?.join(', ')}`);
        } else if (barrier.failed) {
          logger.warn(`[dsh-cron] task "${nextTask.title}" (${targetId}) barrier failed due to dependency: ${barrier.failedDep}`);
        }
      } else {
        logger.info(`[dsh-cron] triggering chained task "${nextTask.title}" (${targetId}) from "${task.title}" (depth ${currentDepth + 1})`);
        scheduler.runNow(targetId, {
          chainRunId,
          chainDepth: currentDepth + 1,
          prevOutput: outcome.output || outcome.error || '',
          prevTaskId: task.id,
          prevStatus: outcome.status,
          prevDurationMs: Date.now() - start,
          prevCostUsd: outcome.costUsd || 0,
        }).catch((err) => {
          logger.warn(`[dsh-cron] chained task ${targetId} failed to trigger:`, err.message);
        });
      }
    }

    // 2.2 Trigger any other tasks in store that depend on this task via dependsOn (Fan-In join step)
    if (chainRunId && scheduler.store?.tasks && scheduler.store.chainCheckpointManager) {
      for (const candidate of Object.values(scheduler.store.tasks)) {
        if (!candidate || candidate.id === taskId || targets.includes(candidate.id)) continue;
        const deps = sanitizeDependsOn(candidate.dependsOn);
        if (deps.includes(taskId)) {
          const barrier = scheduler.store.chainCheckpointManager.checkJoinBarrier(chainRunId, candidate);
          if (barrier.ready && scheduler.store.chainCheckpointManager.canTriggerBarrier(chainRunId, candidate.id)) {
            scheduler.store.chainCheckpointManager.markBarrierTriggered(chainRunId, candidate.id);
            logger.info(`[dsh-cron] triggering dependent joined task "${candidate.title}" (${candidate.id}) (barrier satisfied)`);
            scheduler.runNow(candidate.id, {
              chainRunId,
              chainDepth: currentDepth + 1,
              prevOutputs: barrier.outputs,
              prevOutput: barrier.latestOutput,
              prevTaskId: task.id,
              prevStatus: outcome.status,
              prevDurationMs: Date.now() - start,
              prevCostUsd: outcome.costUsd || 0,
            }).catch((err) => {
              logger.warn(`[dsh-cron] dependent joined task ${candidate.id} failed to trigger:`, err.message);
            });
          } else if (barrier.pending) {
            logger.info(`[dsh-cron] task "${candidate.title}" (${candidate.id}) waiting for dependencies: ${barrier.waitingFor?.join(', ')}`);
          } else if (barrier.failed) {
            logger.warn(`[dsh-cron] task "${candidate.title}" (${candidate.id}) barrier failed due to dependency: ${barrier.failedDep}`);
          }
        }
      }
    }
  } else {
    logger.warn(`[dsh-cron] chained task depth limit (5) reached for task ${task.id}. Loop prevented.`);
  }
}

