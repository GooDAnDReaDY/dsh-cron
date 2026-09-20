import { sendJson, readBody } from './http-utils.js';
import { answerTelegramCallbackQuery, sendTelegramMessage, getDshDefaultTelegramCredentials } from './telegram.js';
import { handleTelegramCommand } from './telegram-commands.js';
import { bestEffort } from './best-effort.js';

const NOT_ALLOWED = { ok: false, error: 'Method not allowed' };

export async function handleTelegramWebhook({ store, scheduler, req, res }) {
  if (req.method !== 'POST') {
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }
  const { body, error } = await readBody(req, res);
  if (error || !body) return;

  const settings = typeof store.getSettings === 'function' ? store.getSettings() : {};
  const defaults = getDshDefaultTelegramCredentials();
  const botToken = settings.botToken || defaults.botToken;
  const allowedChatId = String(settings.chatId || defaults.chatId || '').trim();

  // 1. Text command message (#175)
  const message = body.message;
  if (message && typeof message.text === 'string' && message.text.trim().startsWith('/')) {
    const fromId = String(message.from?.id || '');
    const chatId = String(message.chat?.id || fromId);
    if (allowedChatId && chatId !== allowedChatId && fromId !== allowedChatId) {
      console.warn(`[dsh-cron] unauthorized telegram command from chat ${chatId} / user ${fromId}`);
      sendJson(res, 403, { ok: false, error: 'Forbidden' });
      return;
    }
    const result = await handleTelegramCommand({
      store,
      scheduler,
      text: message.text,
      chatId,
      botToken,
    });
    sendJson(res, 200, result || { ok: true });
    return;
  }

  // 2. Inline callback query (#137)
  const callbackQuery = body.callback_query;
  if (!callbackQuery) {
    sendJson(res, 200, { ok: true, ignored: true });
    return;
  }

  const queryId = callbackQuery.id;
  const data = String(callbackQuery.data || '');
  const fromId = String(callbackQuery.from?.id || '');
  const chatId = String(callbackQuery.message?.chat?.id || fromId);

  if (allowedChatId && chatId !== allowedChatId && fromId !== allowedChatId) {
    console.warn(`[dsh-cron] unauthorized telegram callback from chat ${chatId} / user ${fromId}`);
    if (botToken) {
      await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: 'Unauthorized', showAlert: true });
    }
    sendJson(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }

  const parts = data.split(':');
  if (parts[0] !== 'cron' || parts.length < 3) {
    if (botToken) {
      await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: 'Unknown action' });
    }
    sendJson(res, 200, { ok: true, ignored: true });
    return;
  }

  const verb = parts[1];
  const taskId = parts.slice(2).join(':');
  const task = store.get(taskId);

  if (!task) {
    if (botToken) {
      await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: 'Task not found', showAlert: true });
    }
    sendJson(res, 200, { ok: false, error: 'Task not found' });
    return;
  }

  if (verb === 'run') {
    try {
      await scheduler.triggerManualRun(taskId);
      if (botToken) {
        await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: `🚀 Run triggered: ${task.title}` });
      }
    } catch (runErr) {
      if (botToken) {
        await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: `Run error: ${runErr.message}`, showAlert: true });
      }
    }
  } else if (verb === 'pause') {
    const isPaused = task.status === 'paused';
    if (isPaused) {
      scheduler.resumeTask(taskId);
      if (botToken) {
        await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: `▶️ Resumed: ${task.title}` });
      }
    } else {
      scheduler.pauseTask(taskId, 'Paused via Telegram button');
      if (botToken) {
        await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: `⏸ Paused: ${task.title}` });
      }
    }
  } else if (verb === 'log') {
    const history = store.getHistory(taskId, 1);
    const lastRun = history && history[0];
    if (!lastRun) {
      if (botToken) {
        await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: `No runs recorded for ${task.title}`, showAlert: true });
      }
    } else {
      const summary = `[${task.title}] Last run: ${lastRun.status} (${lastRun.durationMs}ms)\n${lastRun.output || lastRun.error || 'Empty output'}`;
      if (botToken) {
        await answerTelegramCallbackQuery({ botToken, callbackQueryId: queryId, text: summary.slice(0, 190) });
        if (summary.length > 190 && chatId) {
          await sendTelegramMessage({
            botToken,
            chatId,
            text: `*Full Output for ${task.title}:*\n\`\`\`\n${summary.slice(0, 3000)}\n\`\`\``,
            parseMode: 'Markdown',
          }).catch(() => {
            bestEffort('telegram-full-output', () => {}, scheduler?.logger);
          });
        }
      }
    }
  }

  sendJson(res, 200, { ok: true, verb, taskId });
}

