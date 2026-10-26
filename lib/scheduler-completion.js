import { exec } from 'node:child_process';
import { captureGitDiff } from './git-diff.js';
import { resolveBranchTargets } from './branching.js';
import { shouldAutoHeal, applyDoctorFix } from './doctor.js';
import { approvalManager } from './approval.js';
import { validateRunResult } from './validators.js';
import { logger } from './logger.js';
import { checkAndApplyBurnGuard } from './burn-guard.js';
import { bestEffort } from './best-effort.js';
import { parseLlmActionDirectives, executeLlmActionDirectives } from './llm-actions.js';
import { parseChainTargets, sanitizeDependsOn } from './dag.js';
import { applyModelAssists, deliverNotifications } from './scheduler-assists.js';

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

  if (outcome.subtaskRuns) {
    runInfo.subtaskRuns = outcome.subtaskRuns;
    runInfo.swarmStats = outcome.swarmStats;
  }

  // Capture git diff if task runs in a worktree or explicitly opted in (#351, #379, GH #17)
  const explicitCapture = (typeof task.captureGitDiff === 'boolean')
    ? task.captureGitDiff
    : ((typeof task.captureDiff === 'boolean') ? task.captureDiff : null);
  const shouldCaptureDiff = explicitCapture !== null ? explicitCapture : Boolean(task.worktree);
  const diffDir = shouldCaptureDiff ? (task.worktree ? (runInfo.worktreePath || task.cwd) : task.cwd) : null;
  if (diffDir) {
    try {
      const diffResult = await captureGitDiff(diffDir);
      if (diffResult && diffResult.hasChanges) {
        runInfo.gitDiff = diffResult;
      }
    } catch (diffErr) {
      bestEffort('log-diff-error', () => scheduler?.logger?.debug?.(`[dsh-cron] git diff capture failed: ${diffErr?.message}`));
    }
  }

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

  // Chain Checkpoints & Decision Nodes (#319, #328, #352)
  const branchResult = resolveBranchTargets(task, outcome, runInfo);
  if (branchResult && branchResult.decision) {
    runInfo.branchDecision = branchResult.decision;
  }
  const chainedTargets = branchResult
    ? branchResult.targets
    : parseChainTargets(outcome.status === 'success' ? task.onSuccess : task.onFailure);
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

  // 2. Task Chaining & Decision Nodes (#137, #328, #352 Fan-Out / Fan-In)
  const targets = branchResult
    ? branchResult.targets
    : parseChainTargets(isSuccess ? task.onSuccess : (isFailure ? task.onFailure : null));
  const currentDepth = options.chainDepth || 0;

  if (branchResult && branchResult.decision) {
    logger.info(`[dsh-cron] decision node in "${task.title}": routed to ${targets.join(', ') || 'none'} (${branchResult.decision.isElse ? 'fallback else' : (branchResult.decision.matched ? `rule #${branchResult.decision.matchedIndex + 1}` : 'unmatched')})`);
    if (chainRunId && scheduler.store.chainCheckpointManager && Array.isArray(task.branchRules)) {
      for (const rule of task.branchRules) {
        if (rule && rule.targetTask && !targets.includes(rule.targetTask)) {
          scheduler.store.chainCheckpointManager.recordStepSnapshot(chainRunId, rule.targetTask, {
            status: 'skipped',
            skippedReason: 'condition not met',
            durationMs: 0,
          });
        }
      }
    }
  }

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


