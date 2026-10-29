/**
 * dsh-commands registration for /cron slash commands (#388).
 */

import { GlobalBudgetManager } from './global-budgets.js';

export function formatTaskList(tasks = []) {
  if (!tasks.length) {
    return 'No scheduled tasks configured. Create one in the Cron panel or via cron tool.';
  }
  const lines = [
    `Cron Tasks (${tasks.length} total):`,
    '',
  ];
  for (const t of tasks) {
    const statusIcon = t.paused || t.status === 'paused' ? '[PAUSED]' : (t.status === 'completed' ? '[DONE]' : '[ACTIVE]');
    const nextStr = t.nextRunAt ? new Date(t.nextRunAt).toISOString().replace('T', ' ').slice(0, 16) : 'none';
    const scheduleStr = t.scheduleText || t.schedule || 'manual';
    lines.push(`  ${statusIcon} ${t.id} · "${t.title}"`);
    lines.push(`       Schedule: ${scheduleStr} · Next: ${nextStr} · Type: ${t.type || 'llm'}`);
  }
  return lines.join('\n');
}

export function formatSchedulerStatus(store, scheduler) {
  const allTasks = store?.list ? store.list() : [];
  const activeCount = allTasks.filter((t) => !t.paused && t.status !== 'paused' && t.status !== 'completed').length;
  const pausedCount = allTasks.filter((t) => t.paused || t.status === 'paused').length;
  const runningCount = typeof scheduler?.runningCount === 'function' ? scheduler.runningCount() : (scheduler?.running?.size || 0);
  const queueDepth = Array.isArray(scheduler?.queue) ? scheduler.queue.length : 0;
  const maxConcurrent = scheduler?.maxConcurrent ?? 2;

  const budgetMgr = new GlobalBudgetManager();
  const usage24h = budgetMgr.calculateUsage(store, { windowMs: 86400000 });
  const settings = store?.getSettings?.() || {};
  const dailyLimit = Number(settings.globalDailyCostLimitUsd) || 0;
  const budgetStr = dailyLimit > 0
    ? `$${usage24h.totalCostUsd.toFixed(4)} / $${dailyLimit.toFixed(2)}`
    : `$${usage24h.totalCostUsd.toFixed(4)} (unlimited)`;

  const lines = [
    '=== Cron Scheduler Status ===',
    `Active Tasks:       ${activeCount} (Paused: ${pausedCount}, Total: ${allTasks.length})`,
    `Currently Running:  ${runningCount} / ${maxConcurrent} max concurrent`,
    `Queue Depth:        ${queueDepth}`,
    `24h Expenditure:    ${budgetStr} (${usage24h.runCount} runs, ${usage24h.totalTokens} tokens)`,
    `Timezone:           ${scheduler?.defaultTimezone || 'Server Local'}`,
  ];

  if (runningCount > 0 && scheduler?.running) {
    lines.push('', 'Active Runs:');
    for (const [id, runInfo] of scheduler.running.entries()) {
      const task = store?.get?.(id);
      const elapsedSec = runInfo?.startedAt ? Math.round((Date.now() - runInfo.startedAt) / 1000) : 0;
      lines.push(`  - ${task ? task.title : id} (${id}) running for ${elapsedSec}s`);
    }
  }

  return lines.join('\n');
}

export async function executeCronCommand(store, scheduler, rawInput = '') {
  const args = String(rawInput || '').trim().split(/\s+/).filter(Boolean);
  const subcmd = (args[0] || 'list').toLowerCase();
  const targetId = args[1];

  switch (subcmd) {
    case 'list':
    case 'ls': {
      const tasks = store.list ? store.list() : [];
      return formatTaskList(tasks);
    }

    case 'status':
    case 'stat': {
      return formatSchedulerStatus(store, scheduler);
    }

    case 'run':
    case 'trigger': {
      if (!targetId) {
        return 'Error: Task ID is required. Example: /cron run <task-id>';
      }
      const task = store.get ? store.get(targetId) : null;
      if (!task) {
        return `Error: Task "${targetId}" not found. Run "/cron list" to view available task IDs.`;
      }
      if (typeof scheduler?.triggerManualRun === 'function') {
        scheduler.triggerManualRun(task.id);
      } else if (typeof scheduler?.runNow === 'function') {
        await scheduler.runNow(task.id);
      } else {
        return 'Error: Scheduler does not support manual run triggering.';
      }
      return `Triggered manual execution for task "${task.title}" (${task.id}).`;
    }

    case 'pause': {
      if (!targetId) {
        return 'Error: Task ID is required. Example: /cron pause <task-id>';
      }
      const task = store.get ? store.get(targetId) : null;
      if (!task) {
        return `Error: Task "${targetId}" not found. Run "/cron list" to view available task IDs.`;
      }
      if (typeof scheduler?.pauseTask === 'function') {
        scheduler.pauseTask(task.id);
      } else if (store?.update) {
        store.update(task.id, { paused: true, status: 'paused' });
      }
      return `Task "${task.title}" (${task.id}) is now paused.`;
    }

    case 'resume': {
      if (!targetId) {
        return 'Error: Task ID is required. Example: /cron resume <task-id>';
      }
      const task = store.get ? store.get(targetId) : null;
      if (!task) {
        return `Error: Task "${targetId}" not found. Run "/cron list" to view available task IDs.`;
      }
      if (typeof scheduler?.resumeTask === 'function') {
        scheduler.resumeTask(task.id);
      } else if (store?.update) {
        store.update(task.id, { paused: false, status: 'active' });
      }
      return `Task "${task.title}" (${task.id}) has been resumed.`;
    }

    case 'help':
    default: {
      return [
        'Cron Automation Commands:',
        '  /cron list          - List all scheduled tasks with next execution time',
        '  /cron status        - View scheduler queue, active runs, and 24h spend',
        '  /cron run <id>      - Manually trigger an immediate run for a task',
        '  /cron pause <id>    - Pause scheduled executions for a task',
        '  /cron resume <id>   - Resume scheduled executions for a task',
      ].join('\n');
    }
  }
}

export function registerCommands(ctx, { store, scheduler }) {
  if (typeof ctx?.inject !== 'function') return;
  ctx.inject(['commands'], (cmdCtx) => {
    let commandsService;
    try {
      commandsService = cmdCtx?.commands || cmdCtx?.get?.('commands');
    } catch {
      commandsService = undefined;
    }
    if (!commandsService || typeof commandsService.register !== 'function') return;

    const commandHandler = async (invocation) => {
      try {
        const rawArgs = typeof invocation === 'string'
          ? invocation
          : (invocation?.rawArgs || invocation?.input || '');
        const text = await executeCronCommand(store, scheduler, rawArgs);
        return {
          kind: 'text',
          text,
          toString() { return text; },
        };
      } catch (err) {
        const errText = `Cron command error: ${err?.message || err}`;
        return {
          kind: 'error',
          text: errText,
          toString() { return errText; },
        };
      }
    };

    const commandExecute = async (rawArgs, invocation = null) => {
      const res = await commandHandler(invocation || rawArgs);
      return res.text;
    };

    try {
      const unregister = commandsService.register({
        definitionId: '@goodandready/dsh-cron',
        name: 'cron',
        description: 'Manage scheduled tasks and background automation (/cron [list|status|run <id>|pause <id>|resume <id>])',
        input: { hint: '[list|status|run <id>|pause <id>|resume <id>]' },
        handler: commandHandler,
        execute: commandExecute,
      });

      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          try { unregister?.(); } catch { /* explicit cleanup fallback */ }
        }, 'dsh-cron: slash command');
      }
    } catch (err) {
      ctx?.logger?.warn?.('[dsh-cron] Could not register /cron slash command: ' + (err?.message || err));
    }
  });
}
