import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';

/**
 * Start heartbeat watcher timer.
 */
export function startHeartbeatWatcher(scheduler, intervalMs = 30000) {
  stopHeartbeatWatcher(scheduler);
  scheduler.heartbeatTimer = setInterval(() => scheduler.checkHeartbeats(), intervalMs);
  if (scheduler.heartbeatTimer && typeof scheduler.heartbeatTimer.unref === 'function') {
    scheduler.heartbeatTimer.unref();
  }
}

/**
 * Stop heartbeat watcher timer.
 */
export function stopHeartbeatWatcher(scheduler) {
  if (scheduler.heartbeatTimer) {
    clearInterval(scheduler.heartbeatTimer);
    scheduler.heartbeatTimer = null;
  }
}

/**
 * Check active tasks for missed heartbeats.
 */
export async function checkHeartbeats(scheduler) {
  const now = Date.now();
  const tasks = typeof scheduler.store.list === 'function' ? scheduler.store.list({ status: 'active' }) : Array.from(scheduler.store.tasks.values());
  for (const task of tasks) {
    if (task.status !== 'active' || !task.heartbeatIntervalSeconds || task.heartbeatIntervalSeconds <= 0) {
      continue;
    }
    const grace = task.gracePeriodSeconds !== undefined ? task.gracePeriodSeconds : 300;
    const last = task.lastPingAt || task.createdAt || now;
    const deadline = last + (task.heartbeatIntervalSeconds + grace) * 1000;

    if (now > deadline && !task.heartbeatAlerted) {
      task.heartbeatAlerted = true;
      task.lastStatus = 'missed';
      task.updatedAt = now;
      scheduler.store.save();

      logger.warn(`[dsh-cron] Heartbeat missed for "${task.title}" (${task.id})!`);
      const runInfo = {
        at: now,
        status: 'missed',
        durationMs: 0,
        output: `Heartbeat missed: expected ping within ${task.heartbeatIntervalSeconds + grace}s, last ping was at ${new Date(last).toISOString()}`,
        error: 'Heartbeat deadline exceeded',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
        costUsd: 0,
      };

      bestEffort('record-run', () => scheduler.store.recordRun(task.id, runInfo), scheduler.logger);

      await scheduler.deliverNotifications(task, runInfo);

      if (task.onFailure && String(task.onFailure).trim()) {
        const targetId = task.onFailure.trim();
        scheduler.runNow(targetId, {
          chainDepth: 1,
          prevOutput: runInfo.output,
          prevTaskId: task.id,
        }).catch((err) => logger.warn('[dsh-cron] heartbeat onFailure trigger error:', err.message));
      }
    }
  }
}

/**
 * Pause a task and abort any active execution.
 */
export function pauseTask(scheduler, taskId, reason = null) {
  const task = scheduler.store.get(taskId);
  if (!task) return null;
  task.status = 'paused';
  if (task.oneShot) {
    task.targetTimestamp = task.targetTimestamp || task.nextRunAt;
  }
  task.nextRunAt = null;
  if (reason) {
    task.pausedReason = reason;
  }
  scheduler.clearRetryTimer(taskId);
  if (scheduler.jobs.has(taskId)) {
    scheduler.jobs.get(taskId).stop();
    scheduler.jobs.delete(taskId);
  }
  if (scheduler.timers.has(taskId)) {
    clearTimeout(scheduler.timers.get(taskId));
    scheduler.timers.delete(taskId);
  }
  if (scheduler.watcherManager) {
    scheduler.watcherManager.unwatchTask(taskId);
  }
  const running = scheduler.running.get(taskId);
  if (running) {
    bestEffort('abort-paused-task', () => running.controller.abort(new Error('Task paused')), scheduler.logger);
    scheduler.running.delete(taskId);
  }
  scheduler.queue = scheduler.queue.filter((item) => item.taskId !== taskId);
  scheduler.store.set(task);
  return task;
}

/**
 * Remove a scheduled task from timers, jobs, and run queue.
 */
export function removeTask(scheduler, taskId) {
  scheduler.clearRetryTimer(taskId);
  if (scheduler.jobs.has(taskId)) {
    scheduler.jobs.get(taskId).stop();
    scheduler.jobs.delete(taskId);
  }
  if (scheduler.timers.has(taskId)) {
    clearTimeout(scheduler.timers.get(taskId));
    scheduler.timers.delete(taskId);
  }
  if (scheduler.watcherManager) {
    scheduler.watcherManager.unwatchTask(taskId);
  }
  const running = scheduler.running.get(taskId);
  if (running) {
    bestEffort('abort-deleted-task', () => running.controller.abort(new Error('Task deleted')), scheduler.logger);
    scheduler.running.delete(taskId);
  }
  scheduler.queue = scheduler.queue.filter((item) => item.taskId !== taskId);
}

/**
 * Resume a paused task and re-arm schedule.
 */
export function resumeTask(scheduler, taskId) {
  const task = scheduler.store.get(taskId);
  if (!task) return null;
  task.status = 'active';
  delete task.pausedReason;
  scheduler.scheduleTask(task);
  scheduler.store.set(task);
  return task;
}

/**
 * Toggle task state between active and paused.
 */
export function toggleTask(scheduler, taskId) {
  const task = scheduler.store.get(taskId);
  if (!task) return null;
  if (task.status === 'active') {
    return scheduler.pauseTask(taskId);
  } else {
    return scheduler.resumeTask(taskId);
  }
}

export function handleStopAll(scheduler) {
  scheduler.isStopped = true;
  scheduler.generation = (scheduler.generation || 0) + 1;
  scheduler.stopHeartbeatWatcher();
  if (scheduler.watcherManager) {
    scheduler.watcherManager.stopAll();
  }
  if (scheduler.wakeTriggerManager) {
    scheduler.wakeTriggerManager.stopAll();
  }
  if (scheduler.cronAsCodeManager) {
    scheduler.cronAsCodeManager.stopAll();
  }

  // Clear concurrency queue (#217)
  scheduler.queue = [];

  for (const [, job] of scheduler.jobs.entries()) {
    bestEffort('stop-job', () => job.stop(), scheduler.logger);
  }
  scheduler.jobs.clear();

  for (const [, timer] of scheduler.timers.entries()) {
    bestEffort('clear-timer', () => clearTimeout(timer), scheduler.logger);
  }
  scheduler.timers.clear();

  for (const [, timer] of scheduler.retryTimers.entries()) {
    bestEffort('clear-retry-timer', () => clearTimeout(timer), scheduler.logger);
  }
  scheduler.retryTimers.clear();

  for (const [, timer] of scheduler.adaptiveTimers.entries()) {
    bestEffort('clear-adaptive-timer', () => clearTimeout(timer), scheduler.logger);
  }
  scheduler.adaptiveTimers.clear();

  for (const [, run] of scheduler.running.entries()) {
    bestEffort('abort-running', () => run.controller.abort(new Error('Scheduler stopped')), scheduler.logger);
  }
  scheduler.running.clear();

  if (scheduler.store && typeof scheduler.store.flushSync === 'function') {
    bestEffort('store-flush-on-stop', () => scheduler.store.flushSync(), scheduler.logger);
  }
}

export function handleClearScheduled(scheduler, taskId) {
  scheduler.clearAdaptiveTimer(taskId);
  scheduler.clearDeferredTimer(taskId);
  if (scheduler.wakeTriggerManager) {
    scheduler.wakeTriggerManager.unregisterTask(taskId);
  }
  if (scheduler.watcherManager) {
    scheduler.watcherManager.unwatchTask(taskId);
  }
  if (scheduler.jobs.has(taskId)) {
    scheduler.jobs.get(taskId).stop();
    scheduler.jobs.delete(taskId);
  }
  if (scheduler.timers.has(taskId)) {
    clearTimeout(scheduler.timers.get(taskId));
    scheduler.timers.delete(taskId);
  }
}
