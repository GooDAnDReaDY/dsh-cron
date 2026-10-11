import { logger } from './logger.js';

/**
 * Global & Provider/Model Budgets and Rate Limits (#320).
 * Manages shared expenditure windows and concurrent reservations
 * across all scheduled tasks.
 */

export class GlobalBudgetManager {
  constructor() {
    this.reservations = new Map(); // reservationId -> { provider, model, costUsd, at }
  }

  /**
   * Calculate total expenditure from store history across all tasks
   * filtered by provider/model and window.
   */
  calculateUsage(store, { provider = null, model = null, windowMs = 86400000, now = Date.now() } = {}) {
    const cutoff = now - windowMs;
    let totalCostUsd = 0;
    let totalTokens = 0;
    let runCount = 0;

    const allTasks = store.list ? store.list() : [];
    for (const task of allTasks) {
      if (provider && task.provider && task.provider !== provider) continue;
      if (model && task.model && task.model !== model) continue;

      const runs = (store.history && store.history.get(task.id)) || [];
      for (const r of runs) {
        if (r && typeof r.at === 'number' && r.at >= cutoff) {
          totalCostUsd += Number(r.costUsd) || 0;
          if (typeof r.tokens === 'number') {
            totalTokens += r.tokens;
          } else if (r.usage) {
            totalTokens += (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0) + (r.usage.cacheReadTokens || 0);
          }
          runCount++;
        }
      }
    }

    return {
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      totalTokens,
      runCount,
    };
  }

  /**
   * Check if global or provider budget limits are exceeded.
   */
  checkBudget(store, task, settings = {}, now = Date.now()) {
    // 1. Global Monthly / Daily Cost Limit
    const globalDailyCostLimit = Number(settings.globalDailyCostLimitUsd) || 0;
    if (globalDailyCostLimit > 0) {
      const usage = this.calculateUsage(store, { windowMs: 86400000, now });
      const pendingReservationsCost = this.getActiveReservationsCost();
      if ((usage.totalCostUsd + pendingReservationsCost) >= globalDailyCostLimit) {
        return {
          exceeded: true,
          type: 'globalDailyCostLimitUsd',
          reason: `Global daily budget exceeded: $${(usage.totalCostUsd + pendingReservationsCost).toFixed(4)} >= $${globalDailyCostLimit.toFixed(4)}`,
          current: usage.totalCostUsd,
          limit: globalDailyCostLimit,
        };
      }
    }

    // 2. Provider Rate Limit (max runs per minute / hour)
    const provider = task.provider || 'default';
    const providerHourlyLimit = (settings.providerHourlyRunLimits && Number(settings.providerHourlyRunLimits[provider])) || 0;
    if (providerHourlyLimit > 0) {
      const pUsage = this.calculateUsage(store, { provider, windowMs: 3600000, now });
      if (pUsage.runCount >= providerHourlyLimit) {
        return {
          exceeded: true,
          type: 'providerHourlyLimit',
          reason: `Provider "${provider}" hourly run limit reached: ${pUsage.runCount} >= ${providerHourlyLimit}`,
          current: pUsage.runCount,
          limit: providerHourlyLimit,
        };
      }
    }

    // 3. Model Rate Limit
    const model = task.model || 'default';
    const modelHourlyLimit = (settings.modelHourlyRunLimits && Number(settings.modelHourlyRunLimits[model])) || 0;
    if (modelHourlyLimit > 0) {
      const mUsage = this.calculateUsage(store, { model, windowMs: 3600000, now });
      if (mUsage.runCount >= modelHourlyLimit) {
        return {
          exceeded: true,
          type: 'modelHourlyLimit',
          reason: `Model "${model}" hourly run limit reached: ${mUsage.runCount} >= ${modelHourlyLimit}`,
          current: mUsage.runCount,
          limit: modelHourlyLimit,
        };
      }
    }

    return { exceeded: false };
  }

  reserve(task, estimatedCostUsd = 0.05) {
    const id = 'res_' + Math.random().toString(36).slice(2, 9);
    this.reservations.set(id, {
      taskId: task.id,
      provider: task.provider || 'default',
      model: task.model || 'default',
      costUsd: Number(estimatedCostUsd) || 0,
      at: Date.now(),
    });
    return id;
  }

  settle(reservationId) {
    if (reservationId) {
      this.reservations.delete(reservationId);
    }
  }

  getActiveReservationsCost() {
    let sum = 0;
    const cutoff = Date.now() - 300000; // 5 min TTL on stale reservations
    for (const [id, r] of this.reservations.entries()) {
      if (r.at < cutoff) {
        this.reservations.delete(id);
      } else {
        sum += r.costUsd;
      }
    }
    return sum;
  }
}

export const globalBudgetManager = new GlobalBudgetManager();
