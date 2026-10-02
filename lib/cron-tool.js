import { executeCreateTask } from './task-create.js';
import { applyTaskPatch, describeTaskPatch } from './task-patch.js';
import { isConfigOwned, configOwnedMessage } from './config-jobs.js';
import { TASK_TYPES } from './runtimes.js';
import { CHANNEL_IDS } from './channels.js';

export const LEGACY_TOOL_NAMES = [
  'cron_create_task',
  'cron_schedule_task',
  'cron_list_tasks',
  'cron_pause_task',
  'cron_resume_task',
  'cron_delete_task',
  'cron_get_task',
  'cron_update_task',
  'cron_run_task',
];

export const LEGACY_ACTION_MAP = {
  cron_create_task: 'create',
  create_task: 'create',
  cron_schedule_task: 'create',
  schedule_task: 'create',
  schedule: 'create',
  cron_list_tasks: 'list',
  list_tasks: 'list',
  cron_get_task: 'get',
  get_task: 'get',
  cron_update_task: 'update',
  update_task: 'update',
  cron_pause_task: 'pause',
  pause_task: 'pause',
  cron_resume_task: 'resume',
  resume_task: 'resume',
  cron_run_task: 'run',
  run_task: 'run',
  cron_delete_task: 'delete',
  delete_task: 'delete',
};

export function rejectLegacyTool(toolName) {
  const mapped = LEGACY_ACTION_MAP[toolName] || 'list';
  return {
    success: false,
    message: `Tool "${toolName}" has been removed and consolidated into the unified "cron" tool. Please call "cron" with action: "${mapped}" instead. For simple in-chat reminders, use the built-in "schedule_create" tool.`,
  };
}

export const cronToolParameters = {
  action: {
    type: 'string',
    enum: ['create', 'list', 'get', 'update', 'pause', 'resume', 'run', 'delete'],
    description: 'Operation to perform: "create", "list", "get", "update", "pause", "resume", "run", or "delete". For simple reminders in the current chat, use the built-in "schedule_create" tool instead.',
    required: true,
  },
  id: {
    type: 'string',
    description: 'Task ID (required for get, update, pause, resume, run, delete)',
  },
  title: {
    type: 'string',
    description: 'Short task name (for create and update)',
  },
  schedule: {
    type: 'string',
    description: 'Schedule expression: cron ("0 9 * * *"), shorthand ("@daily", "@every 30m"), interval ("every 2h"), or one-shot ("in 30m", "at: 2026-09-05T15:00:00Z")',
  },
  prompt: {
    type: 'string',
    description: 'Prompt/instruction for the agent at run time or command to execute',
  },
  type: {
    type: 'string',
    enum: TASK_TYPES,
    description: 'Task runtime type: llm | script | node | python | http | ssh | docker | skill | workflow',
  },
  status: {
    type: 'string',
    enum: ['all', 'active', 'paused', 'completed'],
    description: 'Filter tasks by status (for list action)',
  },
  confirmCodeSwitch: {
    type: 'boolean',
    description: 'Explicit confirmation required when updating a task into a code-executing type (script/node/python/ssh/docker)',
  },
  delivery: {
    type: 'string',
    enum: ['current', 'isolated'],
    description: 'Run mode: current (in current chat) or isolated (separate session)',
  },
  provider: {
    type: 'string',
    description: 'Model provider (optional)',
  },
  model: {
    type: 'string',
    description: 'Model identifier (optional)',
  },
  fallbackModel: {
    type: 'string',
    description: 'Model tried once more when the primary model fails',
  },
  fallbackProvider: {
    type: 'string',
    description: 'Provider for the fallback model (defaults to task provider)',
  },
  inspectOnFailure: {
    type: 'boolean',
    description: 'Diagnose failed runs with a model and store the diagnosis with the run',
  },
  silentRule: {
    type: 'string',
    description: 'Plain-language condition for staying silent on a successful run',
  },
  timezone: {
    type: 'string',
    description: 'IANA time zone for the schedule, e.g. "Europe/Berlin"',
  },
  notifyTelegram: {
    type: 'boolean',
    description: 'Send the run report to Telegram',
  },
  onlyOnFailure: {
    type: 'boolean',
    description: 'Send reports only for failures',
  },
  timeoutSeconds: {
    type: 'number',
    description: 'Execution time limit in seconds',
  },
  overlapPolicy: {
    type: 'string',
    enum: ['skip', 'queue', 'replace'],
    description: 'Overlap policy: skip | queue | replace',
  },
  misfirePolicy: {
    type: 'string',
    enum: ['skip', 'runOnce', 'catchUpAll'],
    description: 'What to do with a run missed during downtime: skip | runOnce | catchUpAll',
  },
  maxRetries: {
    type: 'number',
    description: 'Automatic retry attempts on failure (0 = off)',
  },
  retryBackoffMs: {
    type: 'number',
    description: 'Base backoff between retries in ms, doubled per attempt',
  },
  permissionPreset: {
    type: 'string',
    enum: ['default', 'read-only', 'workspace-write', 'full'],
    description: 'Permission preset applied to the task session',
  },
  kanbanMode: {
    type: 'string',
    enum: ['none', 'on_failure', 'always'],
    description: 'Create a dsh-kanban card for runs: none | on_failure | always',
  },
  channels: {
    type: 'array',
    items: { type: 'string', enum: CHANNEL_IDS },
    description: 'Notification channels for this task',
  },
  template: {
    type: 'string',
    description: 'Notification template with {title} {status} {output} {error} {duration} placeholders',
  },
  env: {
    type: 'object',
    additionalProperties: true,
    description: 'Environment variables for external runtimes (KEY: value)',
  },
  cwd: {
    type: 'string',
    description: 'Working directory for the run',
  },
  workspaceId: {
    type: 'string',
    description: 'Workspace bound to the task',
  },
  worktree: {
    type: 'boolean',
    description: 'Run code-modifying agent tasks in an isolated git worktree',
  },
  keepWorktree: {
    type: 'boolean',
    description: 'Keep the created worktree after the run',
  },
  nodePath: {
    type: 'string',
    description: 'Node.js binary for node tasks',
  },
  pythonPath: {
    type: 'string',
    description: 'Python interpreter for python tasks',
  },
  httpMethod: {
    type: 'string',
    description: 'HTTP method for http tasks',
  },
  httpUrl: {
    type: 'string',
    description: 'URL for http tasks',
  },
  httpHeaders: {
    type: 'object',
    additionalProperties: true,
    description: 'Headers for http tasks',
  },
  httpBody: {
    type: 'string',
    description: 'Request body for http tasks',
  },
  sshProfileId: {
    type: 'string',
    description: 'dsh-remote-workspace profile id',
  },
  sshTarget: {
    type: 'string',
    description: 'Fallback user@host when no remote-workspace profile is used',
  },
  sshPort: {
    type: 'number',
    description: 'SSH port',
  },
  sshKeyPath: {
    type: 'string',
    description: 'Private key path',
  },
  dockerImage: {
    type: 'string',
    description: 'Container image for docker tasks',
  },
  skillName: {
    type: 'string',
    description: 'DSH skill name for skill tasks',
  },
  workflowName: {
    type: 'string',
    description: 'DSH workflow name for workflow tasks',
  },
  costLimitUsd: {
    type: 'number',
    description: 'Maximum allowed total cost in USD before auto-pausing',
  },
  dailyCostLimitUsd: {
    type: 'number',
    description: 'Maximum allowed daily cost in USD before auto-pausing',
  },
  tokenLimit: {
    type: 'number',
    description: 'Maximum allowed token usage before auto-pausing',
  },
  agentPreset: {
    type: 'string',
    description: 'Agent preset name applied to the task session',
  },
  targetSessionId: {
    type: 'string',
    description: 'Persistent session ID for context continuity',
  },
  targetSessionReset: {
    type: 'string',
    enum: ['never', 'daily', 'weekly'],
    description: 'Context rotation policy for target session: never | daily | weekly',
  },
  onSuccess: {
    type: 'string',
    description: 'Task ID to trigger on successful run',
  },
  onFailure: {
    type: 'string',
    description: 'Task ID to trigger on failed run',
  },
  heartbeatIntervalSeconds: {
    type: 'number',
    description: 'Expected heartbeat interval in seconds (0 = disabled)',
  },
  gracePeriodSeconds: {
    type: 'number',
    description: 'Grace period before alerting on missed heartbeat',
  },
  preflightType: {
    type: 'string',
    enum: ['none', 'http', 'shell', 'command', 'disk'],
    description: 'Pre-flight health check type: none | http | shell | disk',
  },
  preflightTarget: {
    type: 'string',
    description: 'Pre-flight check target: URL, shell command, or path:minPercent / path:minMb',
  },
  concurrencyGroup: {
    type: 'string',
    description: 'Named concurrency group to serialize related tasks',
  },
  priority: {
    type: 'number',
    description: 'Task priority (1 = highest, 10 = lowest, default 5)',
  },
  selfHealingCommand: {
    type: 'string',
    description: 'Shell command executed to recover from run failure',
  },
  autoDiagnose: {
    type: 'boolean',
    description: 'Automatically run AI failure diagnosis and store in runbook',
  },
};

export const cronToolOutput = {
  schema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      count: { type: 'number' },
      task: { type: 'object', additionalProperties: true },
      tasks: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
  },
  render: (_args, val) => [{ type: 'text', text: val.message || (val.success ? 'Success' : 'Failed') }],
};

export async function executeCronTool(store, scheduler, args = {}) {
  const action = args.action;

  if (!action) {
    if (args.schedule && args.prompt) {
      return {
        success: false,
        message: 'Missing "action" parameter. The 9 separate cron tools have been consolidated into "cron". Did you mean action: "create"?',
      };
    }
    return {
      success: false,
      message: 'Parameter "action" is required: "create", "list", "get", "update", "pause", "resume", "run", or "delete". Note: For simple in-chat reminders, use built-in "schedule_create".',
    };
  }

  if (LEGACY_ACTION_MAP[action]) {
    const suggested = LEGACY_ACTION_MAP[action];
    return {
      success: false,
      message: `Action "${action}" is deprecated. The 9 separate tools have been consolidated into the unified "cron" tool. Please use action: "${suggested}".`,
    };
  }

  switch (action) {
    case 'create': {
      if (!args.title || !args.schedule || !args.prompt) {
        return {
          success: false,
          message: 'Fields "title", "schedule", and "prompt" are required to create a task.',
        };
      }
      try {
        return executeCreateTask(store, scheduler, args);
      } catch (err) {
        return { success: false, message: err.message };
      }
    }

    case 'list': {
      const tasks = store.list({ status: args.status || 'all' });
      return {
        success: true,
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          schedule: t.scheduleText || t.schedule,
          status: t.status,
          nextRunAt: t.nextRunAt ? new Date(t.nextRunAt).toISOString() : null,
          lastStatus: t.lastStatus,
          totalTokens: t.totalTokens || 0,
          totalCostUsd: t.totalCostUsd || 0,
          oneShot: Boolean(t.oneShot),
        })),
        message: `Total tasks: ${tasks.length}`,
      };
    }

    case 'get': {
      if (!args.id) return { success: false, message: 'Field "id" is required for get action' };
      const task = store.get(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      const summary = [
        `Task "${task.title}" (${task.id})`,
        `type: ${task.type || 'llm'}`,
        `schedule: ${task.scheduleText || task.schedule}`,
        `status: ${task.status}`,
        task.type === 'llm' || !task.type ? `model: ${task.model || '(default)'}${task.fallbackModel ? ` (fallback: ${task.fallbackModel})` : ''}` : null,
        `channels: ${Array.isArray(task.channels) && task.channels.length ? task.channels.join(', ') : '(legacy flags)'}`,
        `prompt: ${String(task.prompt || '').slice(0, 500)}`,
      ].filter(Boolean).join('\n');
      return { success: true, message: summary, task };
    }

    case 'update': {
      if (!args.id) return { success: false, message: 'Field "id" is required for update action' };
      const { id, confirmCodeSwitch, action: _act, ...patch } = args;
      const result = applyTaskPatch({
        store,
        scheduler,
        id,
        body: patch,
        allowCodeSwitch: confirmCodeSwitch === true,
      });
      if (!result.ok) return { success: false, message: result.error };
      return {
        success: true,
        message: `Task "${result.task.title}" updated (${result.task.scheduleText || result.task.schedule}). Changed: ${describeTaskPatch(result.task, result.patch)}`,
        task: result.task,
      };
    }

    case 'pause': {
      if (!args.id) return { success: false, message: 'Field "id" is required for pause action' };
      if (isConfigOwned(store.get(args.id))) return { success: false, message: configOwnedMessage(args.id) };
      const task = scheduler.pauseTask(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      return { success: true, message: `Task "${task.title}" paused` };
    }

    case 'resume': {
      if (!args.id) return { success: false, message: 'Field "id" is required for resume action' };
      if (isConfigOwned(store.get(args.id))) return { success: false, message: configOwnedMessage(args.id) };
      const task = scheduler.resumeTask(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      return { success: true, message: `Task "${task.title}" resumed (${task.scheduleText})` };
    }

    case 'run': {
      if (!args.id) return { success: false, message: 'Field "id" is required for run action' };
      const task = store.get(args.id);
      if (!task) return { success: false, message: 'Task not found' };
      scheduler.triggerManualRun(args.id);
      return { success: true, message: `Manual run started for task "${task.title}"` };
    }

    case 'delete': {
      if (!args.id) return { success: false, message: 'Field "id" is required for delete action' };
      if (isConfigOwned(store.get(args.id))) return { success: false, message: configOwnedMessage(args.id) };
      scheduler.pauseTask(args.id);
      const ok = store.delete(args.id);
      return { success: ok, message: ok ? 'Task deleted' : 'Task not found' };
    }

    default:
      return {
        success: false,
        message: `Unknown action "${action}". Allowed actions: create, list, get, update, pause, resume, run, delete.`,
      };
  }
}
