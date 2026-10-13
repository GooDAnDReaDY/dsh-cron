/**
 * Chain Checkpoint, Step Replay, and DAG Barrier Manager (#319, #328)
 */

import { sanitizeDependsOn, sanitizeJoinPolicy } from './dag.js';

export class ChainCheckpointManager {
  constructor(store) {
    this.store = store;
    this.activeRetries = new Set();
    this.triggeredBarriers = new Set();
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
   * Checks whether all prerequisites for a task are satisfied (DAG Join Barrier, #328).
   *
   * @param {string} chainRunId
   * @param {Object} task
   * @returns {{ ready: boolean, pending?: boolean, failed?: boolean, outputs: Record<string, string>, latestOutput: string, waitingFor?: string[], failedDep?: string }}
   */
  checkJoinBarrier(chainRunId, task) {
    if (!task) return { ready: false, outputs: {}, latestOutput: '' };
    const deps = sanitizeDependsOn(task.dependsOn);
    if (!deps.length) {
      return { ready: true, outputs: {}, latestOutput: '' };
    }

    const snapshots = this.getChainSnapshots(chainRunId);
    const snapMap = new Map();
    for (const s of snapshots) {
      if (s?.stepTaskId) snapMap.set(s.stepTaskId, s);
    }

    const policy = sanitizeJoinPolicy(task.joinPolicy);
    const outputs = {};
    let latestOutput = '';
    const waitingFor = [];
    let hasSuccess = false;
    let failedDep = null;

    for (const depId of deps) {
      const snap = snapMap.get(depId);
      if (!snap) {
        waitingFor.push(depId);
        continue;
      }
      const isOk = snap.status === 'completed' || snap.status === 'success';
      if (isOk) {
        hasSuccess = true;
        outputs[depId] = String(snap.output || '');
        latestOutput = String(snap.output || '');
      } else {
        failedDep = depId;
      }
    }

    if (policy === 'any_success') {
      if (hasSuccess) {
        return { ready: true, outputs, latestOutput };
      }
      if (waitingFor.length === 0) {
        return { ready: false, failed: true, failedDep: failedDep || deps[0], outputs, latestOutput };
      }
      return { ready: false, pending: true, waitingFor, outputs, latestOutput };
    }

    // Default: 'all_success'
    if (waitingFor.length > 0) {
      return { ready: false, pending: true, waitingFor, outputs, latestOutput };
    }
    if (failedDep) {
      return { ready: false, failed: true, failedDep, outputs, latestOutput };
    }

    return { ready: true, outputs, latestOutput };
  }

  /**
   * Barrier idempotency guard: returns true if barrier has not yet fired for this task in this run.
   */
  canTriggerBarrier(chainRunId, taskId) {
    if (!chainRunId || !taskId) return false;
    return !this.triggeredBarriers.has(`${chainRunId}:${taskId}`);
  }

  /**
   * Marks a barrier as triggered for this chain run to prevent duplicate executions.
   */
  markBarrierTriggered(chainRunId, taskId) {
    if (!chainRunId || !taskId) return;
    this.triggeredBarriers.add(`${chainRunId}:${taskId}`);
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
   * Retries chain execution from the specified failed step (#319, #328)
   * Reuses upstream outputs without re-executing successful upstream steps.
   */
  async retryChainFromStep(scheduler, chainRunId, stepTaskId) {
    const check = this.canRetryFromStep(chainRunId, stepTaskId);
    if (!check.ok) return check;

    const lockKey = `${chainRunId}:${stepTaskId}`;
    this.activeRetries.add(lockKey);

    try {
      const snapshots = this.getChainSnapshots(chainRunId);

      // Collect upstream outputs from checkpoints
      const prevOutputs = {};
      let prevOutput = '';
      let prevTaskId = '';

      for (const s of snapshots) {
        if (s.stepTaskId !== stepTaskId && (s.status === 'success' || s.status === 'completed')) {
          prevOutputs[s.stepTaskId] = String(s.output || '');
          prevOutput = String(s.output || '');
          prevTaskId = s.stepTaskId;
        }
      }

      // Reset barrier locks for stepTaskId and downstream dependents so they can re-trigger
      this.triggeredBarriers.delete(`${chainRunId}:${stepTaskId}`);
      if (this.store?.tasks) {
        for (const t of Object.values(this.store.tasks)) {
          const deps = sanitizeDependsOn(t?.dependsOn);
          if (deps.includes(stepTaskId)) {
            this.triggeredBarriers.delete(`${chainRunId}:${t.id}`);
          }
        }
      }

      // Execute only the failed step, passing reconstructed chain context
      const runFn = (scheduler.runTask || scheduler.runNow).bind(scheduler);
      const res = await runFn(stepTaskId, {
        chainRunId,
        prevOutputs,
        chainPrevOutput: prevOutput,
        prevOutput,
        chainPrevTaskId: prevTaskId,
        prevTaskId,
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
