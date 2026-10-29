import z from '@deepseek-ai/schemastery';
import { normalizeTaskType } from './runtimes.js';
import { validateTaskType, PATCHABLE_TASK_FIELDS } from './task-transfer.js';
import { CHANNEL_IDS } from './channels.js';

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().required(),
  schedule: z.string().required(),
  scheduleText: z.string(),
  type: z.string().default('llm'),
  prompt: z.string().default(''),
  delivery: z.string().default('isolated'),
  status: z.string().default('active'),
  provider: z.string(),
  model: z.string(),
  fallbackProvider: z.string(),
  fallbackModel: z.string(),
  silentRule: z.string().default(''),
  inspectOnFailure: z.boolean().default(false),
  agentPreset: z.string().default(''),
  targetSessionId: z.string().default(''),
  targetSessionReset: z.string().default('never'),
  sessionTitle: z.string().default(''),
  timezone: z.string().default(''),
  misfirePolicy: z.string().default('skip'),
  maxRetries: z.number().default(0),
  retryBackoffMs: z.number().default(30000),
  permissionPreset: z.string().default('default'),
  captureGitDiff: z.boolean(),
  kanbanMode: z.string().default('none'),
  channels: z.array(z.string()).default([]),
  template: z.string().default(''),
  env: z.any(),
  cwd: z.string().default(''),
  workspaceId: z.string().default(''),
  worktree: z.boolean().default(false),
  keepWorktree: z.boolean().default(false),
  httpMethod: z.string().default('GET'),
  httpUrl: z.string().default(''),
  httpHeaders: z.any(),
  httpBody: z.string().default(''),
  sshProfileId: z.string().default(''),
  sshTarget: z.string().default(''),
  sshPort: z.number().default(0),
  sshKeyPath: z.string().default(''),
  dockerImage: z.string().default(''),
  pythonPath: z.string().default(''),
  nodePath: z.string().default(''),
  skillName: z.string().default(''),
  workflowName: z.string().default(''),
  webhookEnabled: z.boolean().default(false),
  webhookToken: z.string(),
  webhookSecret: z.string(),
  webhookDebounceMs: z.number(),
  webhookTrigger: z.any(),
  onSuccess: z.string().default(''),
  onFailure: z.string().default(''),
  heartbeatIntervalSeconds: z.number().default(0),
  gracePeriodSeconds: z.number().default(300),
  preflightType: z.string().default('none'),
  preflightTarget: z.string().default(''),
  preflightCommand: z.string(),
  preflightScript: z.string(),
  concurrencyGroup: z.string().default('default'),
  priority: z.number().default(5),
  selfHealingCommand: z.string().default(''),
  autoDiagnose: z.boolean().default(false),
  notifyTelegram: z.boolean(),
  onlyOnFailure: z.boolean(),
  timeoutSeconds: z.number().default(1800),
  overlapPolicy: z.string().default('skip'),
  oneShot: z.boolean().default(false),
  targetTimestamp: z.number(),
  nextRunAt: z.number(),
  costLimitUsd: z.number(),
  dailyCostLimitUsd: z.number(),
  tokenLimit: z.number(),
  pausedReason: z.string(),
  validators: z.any(),
  requireApproval: z.boolean().default(false),
  fileWatch: z.any(),
  dependsOn: z.array(z.string()).default([]),
  joinPolicy: z.string().default('all_success'),
  adaptive: z.any(),
  adaptiveState: z.any(),
  promptVersion: z.number(),
  promptHistory: z.any(),
  branchRules: z.any(),
  elseTask: z.string(),
  autoHeal: z.boolean(),
  selfHealing: z.any(),
  revisions: z.any(),
  previousPrompt: z.string(),
  previousScript: z.string(),
  swarm: z.any(),
  gitDiff: z.any(),
  maxMemoryMb: z.number().min(0).default(0),
  executionTimeoutMs: z.number().min(0).default(900000),
  maxLogBytesPerRun: z.number().min(0).default(5 * 1024 * 1024),
  cpus: z.number().min(0).default(0),
  maxArchiveMonths: z.number().min(1).default(6),
  schemaVersion: z.number().default(2),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export function validateTaskRecord(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('Task record must be an object');
  }
  if (data.title !== undefined && typeof data.title !== 'string') {
    throw new Error('Task schema validation failed: title must be a string');
  }
  const title = String(data.title || '').trim();
  if (!title) {
    throw new Error('Task title cannot be empty');
  }
  if (data.schedule !== undefined && typeof data.schedule !== 'string') {
    throw new Error('Task schema validation failed: schedule must be a string');
  }
  const schedule = String(data.schedule || '').trim();
  if (!schedule) {
    throw new Error('Task schedule cannot be empty');
  }

  const cleanType = normalizeTaskType(data.type);
  const typeError = validateTaskType(cleanType, data);
  if (typeError) {
    throw new Error(typeError);
  }

  let validated;
  try {
    validated = TaskSchema({
      ...data,
      title,
      schedule,
      type: cleanType,
    });
  } catch (err) {
    throw new Error(`Task schema validation failed: ${err.message}`);
  }

  // Filter channels to known channel ids if present
  if (Array.isArray(validated.channels)) {
    validated.channels = validated.channels.filter((c) => CHANNEL_IDS.includes(c));
  }

  // Strip undefined keys
  for (const k of Object.keys(validated)) {
    if (validated[k] === undefined) {
      delete validated[k];
    }
  }

  return validated;
}

export function safeValidateTaskRecord(data) {
  try {
    const task = validateTaskRecord(data);
    return { ok: true, task };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function validateTaskPatch(patch) {
  if (!patch || typeof patch !== 'object') {
    return { ok: false, error: 'Task patch must be an object' };
  }
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (PATCHABLE_TASK_FIELDS.includes(key)) {
      clean[key] = value;
    }
  }
  return { ok: true, patch: clean };
}
