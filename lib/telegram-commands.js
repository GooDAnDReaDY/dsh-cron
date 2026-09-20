import { sendTelegramMessage } from './telegram.js';
import { calculateRollingCost, calculateRollingTokens } from './burn-guard.js';
import { bestEffort } from './best-effort.js';

/**
 * Parse a text string into a Telegram bot command and its arguments (#175).
 * Strips leading slash and bot username suffix (e.g. /status@bot_name -> status).
 * @param {string} text
 * @returns {{ command: string, args: string[], raw: string } | null}
 */
export function parseTelegramCommand(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const [cmdToken, ...args] = trimmed.split(/\s+/);
  const command = cmdToken.slice(1).split('@')[0].toLowerCase();
  if (!command) return null;

  return { command, args, raw: trimmed };
}

/**
 * Format status message for /status command.
 */
export function formatStatusMessage({ store, scheduler }) {
  const tasks = (typeof store?.list === 'function' ? store.list() : []) || [];
  const active = tasks.filter((t) => t.status === 'active').length;
  const paused = tasks.filter((t) => t.status === 'paused').length;
  const running = typeof scheduler?.runningCount === 'function' ? scheduler.runningCount() : 0;

  const runningNames = [];
  if (scheduler?.running) {
    for (const id of scheduler.running.keys()) {
      const t = store.get(id);
      runningNames.push(t ? t.title : id);
    }
  }

  let dailyCost = 0;
  let dailyTokens = 0;
  const now = Date.now();
  if (store?.history) {
    for (const [, runs] of store.history.entries()) {
      dailyCost += calculateRollingCost(runs, 86400000, now);
      dailyTokens += calculateRollingTokens(runs, 86400000, now);
    }
  }

  const stats = typeof store?.getAggregatedStats === 'function' ? store.getAggregatedStats() : {};

  const lines = [
    '📊 *DSH Cron — Scheduler Status*',
    '',
    '⚙️ *Tasks:*',
    `• Total: ${tasks.length}`,
    `• Active: 🟢 ${active}`,
    `• Paused: ⏸ ${paused}`,
    `• Running now: 🔄 ${running}${runningNames.length ? ' (' + runningNames.join(', ') + ')' : ''}`,
    '',
    '💰 *Cost & Tokens (last 24 hours):*',
    `• Estimated cost: $${dailyCost.toFixed(4)}`,
    `• Tokens: ${dailyTokens.toLocaleString()}`,
    '',
    '📈 *History totals:*',
    `• Total runs: ${stats.totalRuns || 0}`,
    `• Succeeded: ${stats.successfulRuns || 0}`,
    `• Failed: ${stats.failedRuns || 0}`,
  ];

  return lines.join('\n');
}

/**
 * Format tasks list message for /tasks command.
 */
export function formatTasksMessage(tasks, scheduler) {
  if (!tasks || !tasks.length) {
    return '📋 *DSH Cron Tasks:*\n\nTask list is empty.';
  }

  const items = tasks.slice(0, 20).map((t) => {
    const isRunning = typeof scheduler?.isRunning === 'function' && scheduler.isRunning(t.id);
    const statusIcon = isRunning ? '🔄' : (t.status === 'active' ? '🟢' : '⏸');
    const next = t.nextRunAt
      ? new Date(t.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : (t.status === 'paused' ? 'paused' : '—');
    const reason = t.pausedReason ? ` (${t.pausedReason.slice(0, 40)})` : '';
    return `${statusIcon} *${t.title || 'Untitled'}* (\`${t.id}\`)\n   ⏰ ${t.scheduleText || t.schedule || '—'} | next: ${next}${reason}`;
  });

  const lines = [
    '📋 *DSH Cron Tasks:*',
    '',
    ...items,
  ];

  if (tasks.length > 20) {
    lines.push('', `_...and ${tasks.length - 20} more tasks_`);
  }

  return lines.join('\n\n');
}

/**
 * Find a task by id or partial match.
 */
function findTask(store, query) {
  if (!query || typeof store?.get !== 'function') return null;
  const q = String(query).trim();
  const direct = store.get(q);
  if (direct) return direct;

  const list = typeof store.list === 'function' ? store.list() : [];
  return list.find((t) => t.id.toLowerCase() === q.toLowerCase() || t.title.toLowerCase() === q.toLowerCase()) || null;
}

/**
 * Dispatch and handle a Telegram text command.
 */
export async function handleTelegramCommand({
  store,
  scheduler,
  text,
  chatId,
  botToken,
  fetchFn = globalThis.fetch,
}) {
  const parsed = parseTelegramCommand(text);
  if (!parsed) return { ok: false, error: 'Not a command' };

  const { command, args } = parsed;

  const reply = async (msgText, replyMarkup) => {
    if (!botToken || !chatId) return;
    try {
      await sendTelegramMessage({
        botToken,
        chatId,
        text: msgText,
        parseMode: 'Markdown',
        replyMarkup,
        fetchFn,
      });
    } catch (err) {
      bestEffort('telegram-cmd-reply', () => {}, scheduler?.logger);
    }
  };

  switch (command) {
    case 'start':
    case 'help': {
      const help = [
        '🤖 *DSH Cron Control Commands:*',
        '',
        '• `/status` — summary of daemon status, tasks and 24h cost',
        '• `/tasks` — list of configured tasks and schedules',
        '• `/run <id>` — trigger immediate manual execution',
        '• `/pause <id>` — pause a scheduled task',
        '• `/resume <id>` — resume a paused task',
        '• `/log <id>` — show output from the last execution',
        '• `/help` — this help reference',
      ].join('\n');
      await reply(help);
      return { ok: true, command };
    }

    case 'status': {
      const statusText = formatStatusMessage({ store, scheduler });
      await reply(statusText);
      return { ok: true, command };
    }

    case 'tasks': {
      const tasks = typeof store?.list === 'function' ? store.list() : [];
      const tasksText = formatTasksMessage(tasks, scheduler);
      await reply(tasksText);
      return { ok: true, command };
    }

    case 'run': {
      const targetId = args[0];
      if (!targetId) {
        await reply('⚠️ *Please specify task ID:*\n`/run <task_id>`');
        return { ok: false, error: 'Missing task id' };
      }
      const task = findTask(store, targetId);
      if (!task) {
        await reply(`❌ Task \`${targetId}\` not found.`);
        return { ok: false, error: 'Task not found' };
      }
      try {
        await scheduler.triggerManualRun(task.id);
        await reply(`🚀 Triggered immediate execution for *${task.title}* (\`${task.id}\`)`);
        return { ok: true, command, taskId: task.id };
      } catch (err) {
        await reply(`❌ Execution error for *${task.title}*: ${err.message}`);
        return { ok: false, error: err.message };
      }
    }

    case 'pause': {
      const targetId = args[0];
      if (!targetId) {
        await reply('⚠️ *Please specify task ID:*\n`/pause <task_id>`');
        return { ok: false, error: 'Missing task id' };
      }
      const task = findTask(store, targetId);
      if (!task) {
        await reply(`❌ Task \`${targetId}\` not found.`);
        return { ok: false, error: 'Task not found' };
      }
      scheduler.pauseTask(task.id, 'Paused via Telegram');
      await reply(`⏸ Task *${task.title}* (\`${task.id}\`) paused.`);
      return { ok: true, command, taskId: task.id };
    }

    case 'resume': {
      const targetId = args[0];
      if (!targetId) {
        await reply('⚠️ *Please specify task ID:*\n`/resume <task_id>`');
        return { ok: false, error: 'Missing task id' };
      }
      const task = findTask(store, targetId);
      if (!task) {
        await reply(`❌ Task \`${targetId}\` not found.`);
        return { ok: false, error: 'Task not found' };
      }
      scheduler.resumeTask(task.id);
      await reply(`▶️ Task *${task.title}* (\`${task.id}\`) resumed.`);
      return { ok: true, command, taskId: task.id };
    }

    case 'log': {
      const targetId = args[0];
      if (!targetId) {
        await reply('⚠️ *Please specify task ID:*\n`/log <task_id>`');
        return { ok: false, error: 'Missing task id' };
      }
      const task = findTask(store, targetId);
      if (!task) {
        await reply(`❌ Task \`${targetId}\` not found.`);
        return { ok: false, error: 'Task not found' };
      }
      const history = typeof store.getHistory === 'function' ? store.getHistory(task.id, 1) : [];
      const lastRun = history && history[0];
      if (!lastRun) {
        await reply(`ℹ️ No recorded runs for task *${task.title}*.`);
        return { ok: true, command, empty: true };
      }

      const isSuccess = lastRun.status === 'success';
      const statusIcon = isSuccess ? '✅' : '❌';
      const costStr = lastRun.costUsd > 0 ? ` | $${lastRun.costUsd.toFixed(4)}` : '';
      const content = lastRun.error || lastRun.output || 'Empty output';
      const snippet = content.slice(0, 1500);

      const logMsg = [
        `📄 *Last run log: ${task.title}*`,
        `*Status:* ${statusIcon} ${lastRun.status} (${lastRun.durationMs}ms${costStr})`,
        '',
        '```',
        snippet,
        '```',
      ].join('\n');

      await reply(logMsg);
      return { ok: true, command, taskId: task.id };
    }

    default: {
      await reply(`❓ Unknown command \`/${command}\`. Type /help for assistance.`);
      return { ok: false, error: 'Unknown command' };
    }
  }
}

