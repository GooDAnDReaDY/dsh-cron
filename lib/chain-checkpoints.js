/**
 * Chain Checkpoint and Step Replay Manager (#319)
 */

export class ChainCheckpointManager {
  constructor(store) {
    this.store = store;
    this.activeRetries = new Set();
  }

  /**
   * Records a snapshot of a completed or failed chain step
   */
  recordStepSnapshot(chainRunId, stepTaskId, snapshot) {
    if (!chainRunId || !stepTaskId) return;
    this.store.chainCheckpoints = this.store.chainCheckpoints || {};
    this.store.chainCheckpoints[chainRunId] = this.store.chainCheckpoints[chainRunId] || [];

    const list = this.store.chainCheckpoints[chainRunId];
    const existingIndex = list.findIndex((s) => s.stepTaskId === stepTaskId);

    const record = {
      chainRunId,
      stepTaskId,
      status: snapshot.status || 'completed',
      input: snapshot.input || {},
      output: snapshot.output || '',
      at: Date.now(),
      durationMs: snapshot.durationMs || 0,
      retryCount: (existingIndex >= 0 ? (list[existingIndex].retryCount || 0) + 1 : 0),
    };

    if (existingIndex >= 0) {
      list[existingIndex] = record;
    } else {
      list.push(record);
    }

    this.store.scheduleSave(50);
    return record;
  }

  /**
   * Retrieves all step snapshots for a given chain run
   */
  getChainSnapshots(chainRunId) {
    if (!chainRunId || !this.store.chainCheckpoints) return [];
    return this.store.chainCheckpoints[chainRunId] || [];
  }

  /**
   * Checks whether a step can be retried in a chain run
   */
  canRetryFromStep(chainRunId, stepTaskId) {
    if (!chainRunId || !stepTaskId) return { ok: false, error: 'Missing chainRunId or stepTaskId' };

    const lockKey = `${chainRunId}:${stepTaskId}`;
    if (this.activeRetries.has(lockKey)) {
      return { ok: false, error: 'Retry already in progress for this step' };
    }

    const snapshots = this.getChainSnapshots(chainRunId);
    const stepSnapshot = snapshots.find((s) => s.stepTaskId === stepTaskId);
    if (!stepSnapshot) {
      return { ok: false, error: `No checkpoint found for step "${stepTaskId}" in chain "${chainRunId}"` };
    }

    if (stepSnapshot.status === 'success' || stepSnapshot.status === 'completed') {
      return { ok: false, error: 'Step already completed successfully; cannot retry a successful step' };
    }

    const task = this.store.get(stepTaskId);
    if (!task) {
      return { ok: false, error: `Task "${stepTaskId}" was deleted or no longer exists` };
    }

    return { ok: true, task, stepSnapshot };
  }

  /**
   * Retries chain execution from the specified failed step (#319)
   * Reuses upstream outputs without re-executing successful upstream steps.
   */
  async retryChainFromStep(scheduler, chainRunId, stepTaskId) {
    const check = this.canRetryFromStep(chainRunId, stepTaskId);
    if (!check.ok) return check;

    const lockKey = `${chainRunId}:${stepTaskId}`;
    this.activeRetries.add(lockKey);

    try {
      const snapshots = this.getChainSnapshots(chainRunId);
      // Find the nearest successful preceding step snapshot
      const stepIndex = snapshots.findIndex((s) => s.stepTaskId === stepTaskId);
      let prevSnapshot = null;
      for (let i = stepIndex - 1; i >= 0; i--) {
        if (snapshots[i].status === 'success' || snapshots[i].status === 'completed') {
          prevSnapshot = snapshots[i];
          break;
        }
      }

      const prevOutput = prevSnapshot ? prevSnapshot.output : '';
      const prevTaskId = prevSnapshot ? prevSnapshot.stepTaskId : '';

      // Execute only the failed step, passing reconstructed chain context
      const runFn = (scheduler.runTask || scheduler.runNow).bind(scheduler);
      const res = await runFn(stepTaskId, {
        chainRunId,
        chainPrevOutput: prevOutput,
        chainPrevTaskId: prevTaskId,
        isRetry: true,
      });

      return {
        ok: true,
        chainRunId,
        stepTaskId,
        result: res,
      };
    } finally {
      this.activeRetries.delete(lockKey);
    }
  }
}
