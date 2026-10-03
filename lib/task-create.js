import { normalizeTaskType } from './runtimes.js';
import { validateTaskType } from './task-transfer.js';
import { parseScheduleExpression } from './scheduler.js';
import { CHANNEL_IDS } from './channels.js';

export function executeCreateTask(store, scheduler, args) {
  const taskType = normalizeTaskType(args.type);
  const typeError = validateTaskType(taskType, args);
  if (typeError) throw new Error(typeError);
  const parsed = parseScheduleExpression(args.schedule);
  const task = store.set({
    title: args.title,
    schedule: parsed.cronPattern || args.schedule,
    scheduleText: parsed.humanText,
    prompt: args.prompt,
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
    onSuccess: args.onSuccess ? String(args.onSuccess).trim() : '',
    onFailure: args.onFailure ? String(args.onFailure).trim() : '',
    heartbeatIntervalSeconds: Number(args.heartbeatIntervalSeconds) || 0,
    gracePeriodSeconds: Number(args.gracePeriodSeconds) || 300,
    preflightType: args.preflightType ? String(args.preflightType).trim().toLowerCase() : 'none',
    preflightTarget: args.preflightTarget ? String(args.preflightTarget).trim() : '',
    concurrencyGroup: args.concurrencyGroup ? String(args.concurrencyGroup).trim() : 'default',
    priority: Number(args.priority) || 5,
    selfHealingCommand: args.selfHealingCommand ? String(args.selfHealingCommand).trim() : '',
    autoDiagnose: Boolean(args.autoDiagnose),
    notifyTelegram: Boolean(args.notifyTelegram),
    onlyOnFailure: Boolean(args.onlyOnFailure),
    timeoutSeconds: Number(args.timeoutSeconds) || 1800,
    overlapPolicy: args.overlapPolicy || 'skip',
    timezone: args.timezone ? String(args.timezone).trim() : '',
    misfirePolicy: ['skip', 'runOnce', 'catchUpAll'].includes(args.misfirePolicy) ? args.misfirePolicy : 'skip',
    maxRetries: Number(args.maxRetries) > 0 ? Number(args.maxRetries) : 0,
    retryBackoffMs: Number(args.retryBackoffMs) > 0 ? Number(args.retryBackoffMs) : 30000,
    permissionPreset: ['default', 'read-only', 'workspace-write', 'full'].includes(args.permissionPreset) ? args.permissionPreset : 'default',
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
  });
  scheduler.scheduleTask(task);
  return {
    success: true,
    message: `Task "${task.title}" scheduled successfully (${task.scheduleText})`,
    task
  };
}

