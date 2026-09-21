import { bestEffort } from './best-effort.js';

/**
 * Token & Cost Burn Guard (#173).
 * Monitors task execution cost and token usage to prevent runaway costs
 * by automatically pausing the offending task and sending an alert.
 */

/**
 * Calculate the rolling sum of run costs within the given time window (default 24h).
 * @param {Array} runs
 * @param {number} windowMs
 * @param {number} now
 * @returns {number}
 */
export function calculateRollingCost(runs = [], windowMs = 86400000, now = Date.now()) {
  const cutoff = now - windowMs;
  let total = 0;
  for (const r of runs) {
    if (r && typeof r.at === 'number' && r.at >= cutoff) {
      total += Number(r.costUsd) || 0;
    }
  }
  return Number(total.toFixed(6));
}

/**
 * Calculate the rolling sum of tokens within the given time window.
 * @param {Array} runs
 * @param {number} windowMs
 * @param {number} now
 * @returns {number}
 */
export function calculateRollingTokens(runs = [], windowMs = 86400000, now = Date.now()) {
  const cutoff = now - windowMs;
  let total = 0;
  for (const r of runs) {
    if (r && typeof r.at === 'number' && r.at >= cutoff) {
      const u = r.usage;
      const tokens = (u?.inputTokens || 0) + (u?.outputTokens || 0) + (u?.cacheReadTokens || 0);
      total += tokens;
    }
  }
  return total;
}

/**
 * Check if a task has exceeded any of its configured budget limits.
 * @param {object} task
 * @param {Array} runs
 * @param {number} now
 * @returns {{ exceeded: boolean, type?: string, reason?: string, current?: number, limit?: number }}
 */
export function checkTaskBudgetLimits(task, runs = [], now = Date.now()) {
  if (!task) return { exceeded: false };

  // 1. Total cumulative cost limit in USD
  const costLimit = Number(task.costLimitUsd);
  if (costLimit > 0) {
    const totalCost = Number(task.totalCostUsd || 0);
    if (totalCost >= costLimit) {
      return {
        exceeded: true,
        type: 'costLimitUsd',
        reason: `Cumulative cost limit exceeded: $${totalCost.toFixed(4)} >= $${costLimit.toFixed(4)}`,
        current: totalCost,
        limit: costLimit,
      };
    }
  }

  // 2. Rolling 24h daily cost limit in USD
  const dailyCostLimit = Number(task.dailyCostLimitUsd);
  if (dailyCostLimit > 0) {
    const dailyCost = calculateRollingCost(runs, 86400000, now);
    if (dailyCost >= dailyCostLimit) {
      return {
        exceeded: true,
        type: 'dailyCostLimitUsd',
        reason: `24h daily cost limit exceeded: $${dailyCost.toFixed(4)} >= $${dailyCostLimit.toFixed(4)}`,
        current: dailyCost,
        limit: dailyCostLimit,
      };
    }
  }

  // 3. Total cumulative token limit
  const tokenLimit = Number(task.tokenLimit);
  if (tokenLimit > 0) {
    const totalTokens = Number(task.totalTokens || 0);
    if (totalTokens >= tokenLimit) {
      return {
        exceeded: true,
        type: 'tokenLimit',
        reason: `Token limit exceeded: ${totalTokens} >= ${tokenLimit}`,
        current: totalTokens,
        limit: tokenLimit,
      };
    }
  }

  return { exceeded: false };
}

/**
 * Format a human-readable alert message for Telegram and notification channels.
 * @param {object} task
 * @param {object} guard
 * @returns {string}
 */
export function formatBurnGuardAlert(task, guard) {
  const title = task?.title || task?.id || 'Unknown task';
  return `⚠️ [dsh-cron] Task "${title}" auto-paused by Burn Guard: ${guard.reason}`;
}

/**
 * Check task budget limits after a run completes. If exceeded, pause the task and alert.
 * @param {object} scheduler
 * @param {string} taskId
 * @param {object} outcome
 * @returns {Promise<object|null>}
 */
export async function checkAndApplyBurnGuard(scheduler, taskId, outcome) {
  const task = scheduler.store.get(taskId);
  if (!task || task.status !== 'active') return null;

  const runs = (scheduler.store.history && scheduler.store.history.get(taskId)) || [];
  const guard = checkTaskBudgetLimits(task, runs);
  if (!guard.exceeded) return null;

  console.warn(`[dsh-cron] Burn Guard triggered for task "${task.title}" (${taskId}): ${guard.reason}`);
  scheduler.pauseTask(taskId, guard.reason);

  const alertMessage = formatBurnGuardAlert(task, guard);
  await bestEffort('burn-guard-notify', async () => {
    if (typeof scheduler.deliverNotifications === 'function') {
      const alertRunInfo = {
        output: alertMessage,
        error: guard.reason,
        status: 'error',
        costUsd: outcome?.costUsd || 0,
        durationMs: outcome?.durationMs || 0,
        model: task.model || '',
      };
      await scheduler.deliverNotifications({ ...task, status: 'paused', pausedReason: guard.reason }, alertRunInfo);
    }
  }, scheduler.logger);

  return guard;
}

