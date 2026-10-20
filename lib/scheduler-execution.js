import { recordPromptRunOutcome } from './prompt-evolver.js';
import { evaluateAdaptiveRun, calculateNextAdaptiveState } from './adaptive.js';
import { globalBudgetManager } from './global-budgets.js';
import { logger } from './logger.js';
import { checkAndApplyBurnGuard, checkTaskBudgetLimits } from './burn-guard.js';
import { resolveTaskForExecution } from './prompt-interpolation.js';
import { approvalManager } from './approval.js';
import {
  AGENT_TASK_TYPES,
  addUsage,
  executePreflight,
  shouldUseFallback,
  executeOnce,
  executeWithFallback,
} from './scheduler-preflight.js';
import {
  inspectFailureRun,
  applySilentRuleToRun,
  applyModelAssists,
  deliverNotifications,
} from './scheduler-assists.js';
import { handleCompleteRun } from './scheduler-completion.js';

export {
  AGENT_TASK_TYPES,
  addUsage,
  executePreflight,
  shouldUseFallback,
  executeOnce,
  executeWithFallback,
  inspectFailureRun,
  applySilentRuleToRun,
  applyModelAssists,
  deliverNotifications,
  handleCompleteRun,
};

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
 * Post-run bookkeeping: one-shot completion, next-run timestamp, retry backoff, draining.
 */
export function finishRun(scheduler, taskSnapshot, taskId, status, queuedCount, meta = {}) {
  scheduler.countRun(status);

  // Track prompt version success rate outcome (#331)
  if (taskSnapshot && taskSnapshot.prompt && (taskSnapshot.promptVersion || taskSnapshot.promptHistory)) {
    const isSuccess = status === 'success';
    recordPromptRunOutcome(taskSnapshot, isSuccess);
    if (scheduler.store && typeof scheduler.store.set === 'function') {
      scheduler.store.set(taskSnapshot);
    }
  }

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

