import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Extract simple key from YAML text without external dependencies.
 */
export function extractSettingFromYaml(text, section, key) {
  if (!text) return undefined;
  const lines = text.split('\n');
  let inside = false;
  for (const line of lines) {
    if (/^[^\s#]/.test(line)) inside = line.startsWith(section + ':');
    if (!inside) continue;
    const hit = new RegExp('^[ \t]+' + key + ':[ \t]*(.+?)[ \t]*$').exec(line);
    if (hit) return hit[1].replace(/^['"]|['"]$/g, '').trim();
  }
  return undefined;
}

/**
 * Extract first allowed chat id from YAML allowedUserIds list.
 */
export function extractFirstAllowedChatId(text) {
  if (!text) return undefined;
  const lines = text.split('\n');
  let armed = false;
  for (const line of lines) {
    if (/allowedUserIds:/.test(line)) { armed = true; continue; }
    if (!armed) continue;
    const hit = /^\s*-\s*(\d+)\s*$/.exec(line);
    if (hit) return hit[1];
    if (/^\s*[a-zA-Z]/.test(line)) return undefined;
  }
  return undefined;
}

/**
 * Read system DSH settings for fallback credentials.
 */
export function getDshDefaultTelegramCredentials() {
  try {
    const p = path.join(process.env.HOME || os.homedir(), '.dsh', 'settings.yaml');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const botToken = extractSettingFromYaml(raw, 'dsh-messenger-gateway', 'botToken');
      const chatId = extractFirstAllowedChatId(raw);
      return { botToken, chatId };
    }
  } catch {}
  return { botToken: undefined, chatId: undefined };
}

/**
 * Escape markdown special characters for Telegram legacy markdown.
 */
export function escapeMarkdown(str) {
  if (!str) return '';
  return String(str).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Format task execution report for Telegram.
 */
export function formatTaskTelegramMessage(task, runInfo) {
  const isSuccess = runInfo.status === 'success';
  const statusEmoji = isSuccess ? '✅' : '❌';
  const statusText = isSuccess ? 'Успешно' : 'Ошибка';
  const duration = runInfo.durationMs != null ? `${runInfo.durationMs} ms` : '—';
  const title = task.title || 'Задача';
  const schedule = task.scheduleText || task.schedule || '';

  const lines = [
    `⏰ *DSH Cron:* ${title}`,
    `*Статус:* ${statusEmoji} ${statusText}`,
    schedule ? `*Расписание:* ${schedule}` : null,
    `*Длительность:* ${duration}`,
  ].filter(Boolean);

  if (runInfo.error) {
    const errText = String(runInfo.error).slice(0, 1500);
    lines.push('', '*Ошибка:*', '```', errText, '```');
  } else if (runInfo.output && isSuccess) {
    const outText = String(runInfo.output).trim().slice(0, 2000);
    if (outText) {
      lines.push('', '*Вывод:*', '```', outText, '```');
    }
  }

  return lines.join('\n');
}

/**
 * Send telegram message via Bot API.
 */
export async function sendTelegramMessage({ botToken, chatId, text, parseMode = 'Markdown' }) {
  if (!botToken) throw new Error('Telegram botToken не указан');
  if (!chatId) throw new Error('Telegram chatId не указан');

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    disable_notification: false,
  };
  if (parseMode) body.parse_mode = parseMode;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    if (parseMode && data.description && data.description.includes("can't parse entities")) {
      delete body.parse_mode;
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const retryData = await retryRes.json().catch(() => ({}));
      if (retryRes.ok && retryData.ok) {
        return retryData;
      }
    }
    const msg = data.description || res.statusText || `HTTP ${res.status}`;
    throw new Error(`Telegram API Error: ${msg}`);
  }
  return data;
}

/**
 * Determine if a notification should be sent for a given task and run result.
 */
export function shouldNotifyTask(task, runInfo, globalSettings = {}) {
  const isEnabled = task.notifyTelegram ?? globalSettings.notifyTelegram ?? false;
  if (!isEnabled) return false;

  const onlyOnFail = task.onlyOnFailure ?? globalSettings.onlyOnFailure ?? false;
  if (onlyOnFail && runInfo.status !== 'error') {
    return false;
  }

  return true;
}
