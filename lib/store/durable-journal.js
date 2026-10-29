import { createHash, randomUUID } from 'node:crypto';

/**
 * States for durable task execution lifecycle (#317)
 */
export const JOURNAL_STATES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  UNCERTAIN: 'uncertain',
};

export class DurableJournal {
  constructor(store) {
    this.store = store;
  }

  /**
   * Generates a deterministic idempotency key for a task run
   */
  generateIdempotencyKey(taskId, scheduleTick) {
    const raw = `${taskId}:${scheduleTick || Date.now()}`;
    return 'idem_' + createHash('sha256').update(raw).digest('hex').slice(0, 24);
  }

  /**
   * Checks whether a run with this idempotency key was already completed
   */
  isIdempotencyKeyExecuted(taskId, idempotencyKey) {
    if (!idempotencyKey) return null;
    const history = this.store.getHistory(taskId) || [];
    return history.find(
      (r) => r.idempotencyKey === idempotencyKey &&
             (r.status === JOURNAL_STATES.COMPLETED || r.status === 'success')
    ) || null;
  }

  /**
   * Pre-allocates a durable run entry before execution starts (#317)
   */
  createRunRecord(taskId, { idempotencyKey, chainRunId, trigger = 'scheduler', scheduleTick } = {}) {
    const runId = 'run_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const key = idempotencyKey || this.generateIdempotencyKey(taskId, scheduleTick);

    const record = {
      id: runId,
      taskId,
      at: Date.now(),
      status: JOURNAL_STATES.QUEUED,
      trigger,
      idempotencyKey: key,
      chainRunId: chainRunId || null,
      stages: [
        { name: 'queue', status: 'success', startedAt: Date.now(), finishedAt: Date.now() },
        { name: 'preflight', status: 'pending' },
        { name: 'execution', status: 'pending' },
        { name: 'validation', status: 'pending' },
        { name: 'delivery', status: 'pending' },
      ],
      stoppedReason: null,
      createdAt: Date.now(),
    };

    // Record initial queued entry into history/store
    this.store.recordRun(taskId, record);
    return record;
  }

  /**
   * Transitions a run record to a new state and updates history entry
   */
  transition(taskId, runId, toState, metadata = {}) {
    const runs = this.store.history.get(taskId) || [];
    const index = runs.findIndex((r) => r.id === runId);
    if (index === -1) return null;

    const existing = runs[index];
    const updated = {
      ...existing,
      ...metadata,
      status: toState,
      updatedAt: Date.now(),
    };

    if (
      toState === JOURNAL_STATES.COMPLETED ||
      toState === JOURNAL_STATES.FAILED ||
      toState === JOURNAL_STATES.CANCELLED ||
      toState === JOURNAL_STATES.UNCERTAIN
    ) {
      updated.finishedAt = Date.now();
      if (updated.startedAt && !updated.durationMs) {
        updated.durationMs = updated.finishedAt - updated.startedAt;
      }
    }

    runs[index] = updated;
    this.store.history.set(taskId, runs);
    this.store.scheduleSave(50);
    return updated;
  }

  /**
   * Recovers uncompleted / in-flight runs on daemon restart (#317)
   */
  recoverPendingRuns(scheduler) {
    const tasks = this.store.list();
    const recovered = { uncertain: [], requeued: [] };

    for (const task of tasks) {
      const history = this.store.history.get(task.id) || [];
      let historyChanged = false;

      for (let i = 0; i < history.length; i++) {
        const run = history[i];
        if (run.status === JOURNAL_STATES.RUNNING) {
          // Crash during execution -> transition to UNCERTAIN to prevent blind rerun
          history[i] = {
            ...run,
            status: JOURNAL_STATES.UNCERTAIN,
            stoppedReason: 'interrupted_by_restart',
            uncertainAt: Date.now(),
          };
          historyChanged = true;
          recovered.uncertain.push({ taskId: task.id, runId: run.id });
        } else if (run.status === JOURNAL_STATES.QUEUED) {
          // Queued run that didn't start yet: if task is still active and recent (<1 hour), re-enqueue
          const ageMs = Date.now() - (run.createdAt || run.at);
          if (task.status === 'active' && ageMs < 3600000 && scheduler && typeof scheduler.runTask === 'function') {
            scheduler.queue = scheduler.queue || [];
            if (!scheduler.queue.includes(task.id)) {
              scheduler.queue.push(task.id);
              recovered.requeued.push({ taskId: task.id, runId: run.id });
            }
          } else {
            // Expired or cancelled queued run
            history[i] = {
              ...run,
              status: JOURNAL_STATES.CANCELLED,
              stoppedReason: 'Queued run expired or cancelled across restart',
            };
            historyChanged = true;
          }
        }
      }

      if (historyChanged) {
        this.store.scheduleSave(50);
      }
    }

    return recovered;
  }

  /**
   * Manually resolves an uncertain run record (#317)
   */
  resolveUncertain(taskId, runId, { decision, note, resolvedBy = 'user' } = {}) {
    const runs = this.store.history.get(taskId) || [];
    const index = runs.findIndex((r) => r.id === runId);
    if (index === -1) return { ok: false, error: 'Run not found' };

    const run = runs[index];
    if (run.status !== JOURNAL_STATES.UNCERTAIN) {
      return { ok: false, error: `Run is in status "${run.status}", not uncertain` };
    }

    let nextStatus = JOURNAL_STATES.FAILED;
    if (decision === 'completed' || decision === 'mark_completed') nextStatus = JOURNAL_STATES.COMPLETED;
    else if (decision === 'failed' || decision === 'mark_failed') nextStatus = JOURNAL_STATES.FAILED;
    else if (decision === 'cancel' || decision === 'cancelled') nextStatus = JOURNAL_STATES.CANCELLED;

    const resolved = {
      ...run,
      status: nextStatus,
      stoppedReason: `Uncertain run resolved by ${resolvedBy}: ${note || decision}`,
      resolvedBy,
      resolvedAt: Date.now(),
    };

    runs[index] = resolved;
    this.store.history.set(taskId, runs);
    this.store.scheduleSave(50);
    return { ok: true, run: resolved };
  }
}
