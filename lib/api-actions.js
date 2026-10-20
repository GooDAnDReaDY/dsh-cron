import { randomUUID } from 'node:crypto';
import { captureGitDiff, discardGitChanges, applyGitDiff } from './git-diff.js';
import { applyDoctorFix, revertDoctorFix, diagnoseFailure } from './doctor.js';
import { rollbackPromptVersion } from './prompt-evolver.js';
import { approvalManager } from './approval.js';
import { MANAGED_BY_CONFIG } from './config-jobs.js';
import { sendJson, readBody, redactTaskSecrets } from './http-utils.js';
import { buildDuplicateTask } from './task-transfer.js';
import { refuseConfigOwned, NOT_FOUND } from './api-collection.js';

export async function handleItemPost({ store, scheduler, req, res, url, id, action, subAction }) {
  if (action === 'git-diff' && (subAction === 'discard' || subAction === 'revert')) {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const targetDir = task.cwd;
    if (!targetDir) {
      sendJson(res, 400, { ok: false, error: 'Task does not define a working directory (cwd)' });
      return true;
    }
    const result = await discardGitChanges(targetDir);
    sendJson(res, result.ok ? 200 : 500, result);
    return true;
  }

  if (action === 'git-diff' && subAction === 'apply') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBody(req, res);
    const bodyData = (body && body.body) || {};
    let patch = bodyData.diff || bodyData.patch;
    if (!patch) {
      const runs = store.getHistory(id, 5);
      const targetRun = runs.find((r) => r.gitDiff?.diff);
      patch = targetRun?.gitDiff?.diff;
    }
    if (!patch) {
      sendJson(res, 400, { ok: false, error: 'No diff patch provided or found in run history' });
      return true;
    }
    const targetDir = task.cwd;
    if (!targetDir) {
      sendJson(res, 400, { ok: false, error: 'Task does not define a working directory (cwd)' });
      return true;
    }
    const result = await applyGitDiff(targetDir, patch);
    sendJson(res, result.ok ? 200 : 500, result);
    return true;
  }

  if ((action === 'doctor' && subAction === 'apply') || action === 'doctor-apply') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBody(req, res);
    const bodyData = (body && body.body) || {};
    let fix = bodyData.fix || bodyData.doctorReport;
    if (!fix) {
      const runs = store.getHistory(id, 5);
      const reportRun = runs.find((r) => r.doctorReport);
      fix = reportRun?.doctorReport;
    }
    if (!fix || !fix.suggestedFix) {
      sendJson(res, 400, { ok: false, error: 'No doctor fix found to apply' });
      return true;
    }
    try {
      const result = await applyDoctorFix(task, fix, { store, user: bodyData.user || 'operator' });
      if (!result.ok) {
        sendJson(res, 400, { ok: false, error: result.error });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        taskId: id,
        task: redactTaskSecrets(task),
        revision: result.revision,
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  if ((action === 'doctor' && subAction === 'revert') || action === 'doctor-revert') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBody(req, res);
    const bodyData = (body && body.body) || {};
    try {
      const result = await revertDoctorFix(task, { store, user: bodyData.user || 'operator' });
      if (!result.ok) {
        sendJson(res, 400, { ok: false, error: result.error });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        taskId: id,
        task: redactTaskSecrets(task),
        revertedCode: result.revertedCode,
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  if ((action === 'doctor' && subAction === 'diagnose') || action === 'doctor-diagnose') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBody(req, res);
    const bodyData = (body && body.body) || {};
    const runId = bodyData.runId;
    const runs = store.getHistory(id, 10);
    const targetRun = runId ? runs.find((r) => r.id === runId) : runs[0];
    if (!targetRun) {
      sendJson(res, 404, { ok: false, error: 'No run history found to diagnose' });
      return true;
    }
    try {
      const doctorReport = await diagnoseFailure({
        task,
        runInfo: targetRun,
        ask: scheduler?.askModel,
      });
      targetRun.doctorReport = doctorReport;
      sendJson(res, 200, { ok: true, taskId: id, doctorReport });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }
  if (action === 'prompt-rollback') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBodyJson(req).catch(() => ({}));
    const targetVersion = Number(body.version || url.searchParams.get('version'));
    if (!targetVersion || targetVersion < 1) {
      sendJson(res, 400, { ok: false, error: 'A valid target prompt version is required' });
      return true;
    }
    try {
      rollbackPromptVersion(task, targetVersion);
      store.set(task);
      sendJson(res, 200, {
        ok: true,
        task: redactTaskSecrets(task),
        promptVersion: task.promptVersion,
        promptHistory: task.promptHistory,
      });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    }
    return true;
  }
  if (action === 'retry-delivery') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBodyJson(req).catch(() => ({}));
    const runId = body.runId || url.searchParams.get('runId');
    const runs = store.history.get(id) || [];
    const run = runId ? runs.find(r => r.id === runId) : runs[0];
    if (!run) {
      sendJson(res, 404, { ok: false, error: 'Run not found' });
      return true;
    }
    const delivery = await scheduler.deliverNotifications(task, run);
    run.delivery = delivery;
    if (Array.isArray(run.stages)) {
      const deliveryStage = run.stages.find(s => s.name === 'delivery');
      if (deliveryStage) {
        deliveryStage.status = delivery?.status || 'delivered';
        deliveryStage.delivered = delivery?.delivered;
        deliveryStage.failures = delivery?.failures;
      }
    }
    store.scheduleSave();
    sendJson(res, 200, { ok: true, delivery, run });
    return true;
  }
  if (action === 'approve' || action === 'reject') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBodyJson(req).catch(() => ({}));
    const proposalId = body.proposalId || url.searchParams.get('proposalId');
    const proposal = proposalId
      ? approvalManager.getProposal(proposalId)
      : approvalManager.getPendingProposalForTask(id);

    if (!proposal) {
      sendJson(res, 404, { ok: false, error: 'No pending approval proposal found for this task' });
      return true;
    }

    const decision = action === 'approve' ? 'approve' : 'reject';
    const result = approvalManager.decide(proposal.id, decision, {
      decidedBy: body.decidedBy || 'web-user',
      reason: body.reason || '',
    });

    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }

    if (decision === 'approve') {
      scheduler.runTask(id, { approvedBy: body.decidedBy || 'web-user' }).catch(() => {});
    }

    sendJson(res, 200, { ok: true, proposal: result.proposal });
    return true;
  }
  if (action === 'resolve-uncertain') {
    const task = store.get(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const body = await readBody(req).then(b => JSON.parse(b || '{}')).catch(() => ({}));
    const runId = body.runId || url.searchParams.get('runId');
    if (!runId) {
      sendJson(res, 400, { ok: false, error: 'runId is required' });
      return true;
    }
    const result = store.durableJournal.resolveUncertain(id, runId, {
      decision: body.decision || 'mark_failed',
      note: body.note || '',
      resolvedBy: body.resolvedBy || 'user',
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }
  if (action === 'run') {
    if (!store.get(id)) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    await scheduler.triggerManualRun(id);
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(store.get(id)) });
    return true;
  }
  if (action === 'duplicate') {
    const source = store.get(id);
    if (!source) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    const copy = buildDuplicateTask(source, { id: randomUUID() });
    try {
      store.set(copy);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: 'Failed to persist duplicate task: ' + err.message });
      return true;
    }
    // A copy starts paused: it must never fire on its own before the user
    // reviews the schedule (a duplicated one-shot may point at a past time).
    scheduler.pauseTask(copy.id);
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(copy) });
    return true;
  }
  if (action === 'pause' || action === 'resume') {
    if (store.get(id) && store.get(id).managedBy === MANAGED_BY_CONFIG) {
      refuseConfigOwned(res, id);
      return true;
    }
    const task = action === 'pause' ? scheduler.pauseTask(id) : scheduler.resumeTask(id);
    if (!task) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(task) });
    return true;
  }
  if (action === 'toggle' || (!action && url.searchParams.get('action') === 'toggle')) {
    const stored = store.get(id);
    if (!stored) {
      sendJson(res, 404, NOT_FOUND);
      return true;
    }
    if (stored.managedBy === MANAGED_BY_CONFIG) {
      refuseConfigOwned(res, id);
      return true;
    }
    const task = scheduler.toggleTask(id);
    sendJson(res, 200, { ok: true, task: redactTaskSecrets(task) });
    return true;
  }
  return false;
}


