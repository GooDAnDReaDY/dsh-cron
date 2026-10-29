import { validateTaskRecord } from './task-schema.js';
import { sanitizeSwarmConfig } from './swarm.js';
import { sanitizeBranchRules } from './branching.js';
import { sanitizePromptHistory } from './prompt-evolver.js';
import { sanitizeAdaptiveConfig } from './adaptive.js';
import { sanitizeValidators } from './validators.js';
import { normalizeTaskType, EXTERNAL_RUNTIMES } from './runtimes.js';
import { validateTaskType } from './task-transfer.js';
import { parseScheduleExpression } from './scheduler.js';
import { CHANNEL_IDS } from './channels.js';
import { redactTaskSecrets } from './http-utils.js';
import { sanitizeDependsOn, sanitizeJoinPolicy, validateDAG } from './dag.js';

export function sanitizeFileWatch(fw) {
  if (!fw || typeof fw !== 'object') return undefined;
  const p = String(fw.path || '').trim();
  if (!p) return undefined;
  return {
    enabled: Boolean(fw.enabled !== false),
    path: p,
    pattern: fw.pattern ? String(fw.pattern).trim() : '*',
    events: Array.isArray(fw.events) && fw.events.length > 0
      ? fw.events.map(String).filter((e) => ['create', 'modify', 'delete'].includes(e))
      : ['create', 'modify'],
    debounceMs: Math.max(50, Number(fw.debounceMs) || 500),
    recursive: Boolean(fw.recursive),
  };
}

export function executeCreateTask(store, scheduler, args) {
  const taskType = normalizeTaskType(args.type);
  const typeError = validateTaskType(taskType, args);
  if (typeError) throw new Error(typeError);
  const parsed = parseScheduleExpression(args.schedule);
  const taskData = {
    title: args.title,
    schedule: parsed.cronPattern || args.schedule,
    scheduleText: parsed.humanText,
    prompt: args.prompt,
    promptVersion: args.prompt ? 1 : undefined,
    promptHistory: args.prompt ? [{ version: 1, prompt: args.prompt, note: 'Initial creation', runs: 0, successes: 0, successRate: 1.0, createdAt: Date.now(), lastRunAt: null }] : undefined,
    type: taskType,
    delivery: args.delivery || 'isolated',
    status: 'active',
    provider: args.provider,
    model: args.model,
    fallbackProvider: args.fallbackProvider ? String(args.fallbackProvider).trim() : undefined,
    fallbackModel: args.fallbackModel ? String(args.fallbackModel).trim() : undefined,
    silentRule: args.silentRule !== undefined ? String(args.silentRule) : '',
    inspectOnFailure: args.inspectOnFailure !== undefined ? Boolean(args.inspectOnFailure) : false,
    agentPreset: args.agentPreset ? String(args.agentPreset).trim() : '',
    targetSessionId: args.targetSessionId ? String(args.targetSessionId).trim() : '',
    targetSessionReset: args.targetSessionReset ? String(args.targetSessionReset).trim() : 'never',
    sessionTitle: args.sessionTitle ? String(args.sessionTitle).trim() : '',
    webhookEnabled: args.webhookEnabled !== undefined ? Boolean(args.webhookEnabled) : (args.webhookTrigger?.enabled !== undefined ? Boolean(args.webhookTrigger.enabled) : false),
    webhookToken: args.webhookToken ? String(args.webhookToken).trim() : (args.webhookTrigger?.token ? String(args.webhookTrigger.token).trim() : undefined),
    webhookSecret: args.webhookSecret ? String(args.webhookSecret).trim() : (args.webhookTrigger?.secret ? String(args.webhookTrigger.secret).trim() : undefined),
    webhookDebounceMs: args.webhookDebounceMs !== undefined ? Number(args.webhookDebounceMs) : (args.webhookTrigger?.debounceMs !== undefined ? Number(args.webhookTrigger.debounceMs) : undefined),
    onSuccess: args.onSuccess ? String(args.onSuccess).trim() : '',
    onFailure: args.onFailure ? String(args.onFailure).trim() : '',
    branchRules: args.branchRules !== undefined ? sanitizeBranchRules(args.branchRules) : undefined,
    swarm: args.swarm !== undefined ? sanitizeSwarmConfig(args.swarm) : undefined,
    elseTask: args.elseTask ? String(args.elseTask).trim() : undefined,
    autoHeal: args.autoHeal !== undefined ? Boolean(args.autoHeal) : undefined,
    selfHealing: args.selfHealing && typeof args.selfHealing === 'object' ? {
      autoApply: Boolean(args.selfHealing.autoApply),
      lastPatchedAt: Number(args.selfHealing.lastPatchedAt) || 0,
      autoPatchesCount: Number(args.selfHealing.autoPatchesCount) || 0,
    } : undefined,
    dependsOn: args.dependsOn !== undefined ? sanitizeDependsOn(args.dependsOn) : undefined,
    joinPolicy: args.joinPolicy !== undefined ? sanitizeJoinPolicy(args.joinPolicy) : undefined,
    adaptive: args.adaptive !== undefined ? sanitizeAdaptiveConfig(args.adaptive) : undefined,
    heartbeatIntervalSeconds: Number(args.heartbeatIntervalSeconds) || 0,
    gracePeriodSeconds: Number(args.gracePeriodSeconds) || 300,
    preflightType: args.preflightType ? String(args.preflightType).trim().toLowerCase() : 'none',
    preflightTarget: args.preflightTarget ? String(args.preflightTarget).trim() : '',
    concurrencyGroup: args.concurrencyGroup ? String(args.concurrencyGroup).trim() : 'default',
    priority: Number(args.priority) || 5,
    selfHealingCommand: args.selfHealingCommand ? String(args.selfHealingCommand).trim() : '',
    autoDiagnose: Boolean(args.autoDiagnose),
    notifyTelegram: args.notifyTelegram !== undefined ? Boolean(args.notifyTelegram) : undefined,
    onlyOnFailure: args.onlyOnFailure !== undefined ? Boolean(args.onlyOnFailure) : undefined,
    timeoutSeconds: Number(args.timeoutSeconds) || 1800,
    overlapPolicy: args.overlapPolicy || 'skip',
    timezone: args.timezone ? String(args.timezone).trim() : '',
    misfirePolicy: ['skip', 'runOnce', 'catchUpAll'].includes(args.misfirePolicy) ? args.misfirePolicy : 'skip',
    maxRetries: Number(args.maxRetries) > 0 ? Number(args.maxRetries) : 0,
    retryBackoffMs: Number(args.retryBackoffMs) > 0 ? Number(args.retryBackoffMs) : 30000,
    permissionPreset: !EXTERNAL_RUNTIMES.includes(taskType) && ['default', 'read-only', 'workspace-write', 'danger-full-access', 'full'].includes(args.permissionPreset) ? args.permissionPreset : 'default',
    captureGitDiff: typeof args.captureGitDiff === 'boolean' ? args.captureGitDiff : (typeof args.captureDiff === 'boolean' ? args.captureDiff : undefined),
    kanbanMode: args.kanbanMode || 'none',
    channels: Array.isArray(args.channels) ? args.channels.filter((c) => CHANNEL_IDS.includes(c)) : undefined,
    template: args.template ? String(args.template) : '',
    env: args.env && typeof args.env === 'object' ? args.env : undefined,
    cwd: args.cwd ? String(args.cwd).trim() : '',
    workspaceId: args.workspaceId ? String(args.workspaceId).trim() : '',
    worktree: Boolean(args.worktree),
    keepWorktree: Boolean(args.keepWorktree),
    httpMethod: args.httpMethod ? String(args.httpMethod).toUpperCase() : 'GET',
    httpUrl: args.httpUrl ? String(args.httpUrl).trim() : '',
    httpHeaders: args.httpHeaders,
    httpBody: args.httpBody !== undefined ? String(args.httpBody) : '',
    sshProfileId: args.sshProfileId ? String(args.sshProfileId).trim() : '',
    sshTarget: args.sshTarget ? String(args.sshTarget).trim() : '',
    sshPort: Number(args.sshPort) || 0,
    sshKeyPath: args.sshKeyPath ? String(args.sshKeyPath).trim() : '',
    dockerImage: args.dockerImage ? String(args.dockerImage).trim() : '',
    pythonPath: args.pythonPath ? String(args.pythonPath).trim() : '',
    nodePath: args.nodePath ? String(args.nodePath).trim() : '',
    skillName: args.skillName ? String(args.skillName).trim() : '',
    workflowName: args.workflowName ? String(args.workflowName).trim() : '',
    oneShot: Boolean(parsed.isOneShot),
    targetTimestamp: parsed.isOneShot ? parsed.targetTimestamp : undefined,
    nextRunAt: parsed.isOneShot ? parsed.targetTimestamp : (parsed.nextRun || undefined),
    costLimitUsd: Number(args.costLimitUsd) > 0 ? Number(args.costLimitUsd) : undefined,
    dailyCostLimitUsd: Number(args.dailyCostLimitUsd) > 0 ? Number(args.dailyCostLimitUsd) : undefined,
    tokenLimit: Number(args.tokenLimit) > 0 ? Number(args.tokenLimit) : undefined,
    validators: Array.isArray(args.validators) ? sanitizeValidators(args.validators) : undefined,
    requireApproval: Boolean(args.requireApproval),
    fileWatch: args.fileWatch && typeof args.fileWatch === 'object' ? sanitizeFileWatch(args.fileWatch) : undefined,
  };

  // Issue #310 / GH #5: strip any undefined properties before store.set()
  for (const k of Object.keys(taskData)) {
    if (taskData[k] === undefined) {
      delete taskData[k];
    }
  }

  // DAG cycle validation (#328)
  const dagCheck = validateDAG(store?.tasks || {}, taskData);
  if (!dagCheck.ok) {
    throw new Error(dagCheck.error);
  }

  const validTask = validateTaskRecord(taskData);
  const task = store.set(validTask);
  scheduler.scheduleTask(task);
  return {
    success: true,
    message: `Task "${task.title}" scheduled successfully (${task.scheduleText})`,
    task: redactTaskSecrets(task),
  };
}
