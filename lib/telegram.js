import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Extract simple key from YAML text without external dependencies.
 * Best-effort fallback only: the primary source for cross-plugin defaults is
 * the Harness settings/credentials service (#51, #93).
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
 * Harness home for this process. DSH_HOME wins so an isolated profile reads
 * its own settings file instead of another home's (same rule as the store).
 */
export function getDshHomeDir() {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return path.join(process.env.HOME || os.homedir(), '.dsh');
}

export function getDshSettingsPath() {
  return path.join(getDshHomeDir(), 'settings.yaml');
}

/**
 * Read system DSH settings for fallback credentials.
 * Fails soft with a logged warning so silent misconfiguration is visible (#93).
 */
export function getDshDefaultTelegramCredentials() {
  try {
    const p = getDshSettingsPath();
    if (fs.existsSync(p)) {
      let raw;
      try {
        raw = fs.readFileSync(p, 'utf-8');
      } catch (readErr) {
        console.warn('[dsh-cron] default Telegram credentials: cannot read DSH settings.yaml:', readErr.message);
        return { botToken: undefined, chatId: undefined };
      }
      const botToken = extractSettingFromYaml(raw, 'dsh-messenger-gateway', 'botToken');
      const chatId = extractFirstAllowedChatId(raw);
      return { botToken, chatId };
    }
  } catch (err) {
    console.warn('[dsh-cron] default Telegram credentials lookup failed:', err.message);
  }
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
 * Dynamic values are escaped so titles/schedules cannot break the markup (#93).
 */
export function formatTaskTelegramMessage(task, runInfo) {
  const isSuccess = runInfo.status === 'success';
  const statusEmoji = isSuccess ? '✅' : '❌';
  const statusText = isSuccess ? 'Success' : 'Failed';
  const duration = runInfo.durationMs != null ? `${runInfo.durationMs} ms` : '—';
  const title = escapeMarkdown(task.title || 'Task');
  const schedule = escapeMarkdown(task.scheduleText || task.schedule || '');

  const lines = [
    `⏰ *DSH Cron:* ${title}`,
    `*Status:* ${statusEmoji} ${statusText}`,
    schedule ? `*Schedule:* ${schedule}` : null,
    `*Duration:* ${duration}`,
  ].filter(Boolean);

  if (runInfo.error) {
    const errText = String(runInfo.error).slice(0, 1500);
    lines.push('', '*Error:*', '```', errText, '```');
  } else if (runInfo.output && isSuccess) {
    const outText = String(runInfo.output).trim().slice(0, 2000);
    if (outText) {
      lines.push('', '*Output:*', '```', outText, '```');
    }
  }

  return lines.join('\n');
}

/**
 * Send telegram message via Bot API.
 */
export async function sendTelegramMessage({ botToken, chatId, text, parseMode = 'Markdown', fetchFn = globalThis.fetch, signal }) {
  if (!botToken) throw new Error('Telegram botToken is not configured');
  if (!chatId) throw new Error('Telegram chatId is not configured');

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    disable_notification: false,
  };
  if (parseMode) body.parse_mode = parseMode;

  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    if (parseMode && data.description && data.description.includes("can't parse entities")) {
      delete body.parse_mode;
      const retryRes = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
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
 * "timeout" counts as a failure, matching the Kanban card policy (#89).
 */
export function shouldNotifyTask(task, runInfo, globalSettings = {}) {
  const isEnabled = task.notifyTelegram ?? globalSettings.notifyTelegram ?? false;
  if (!isEnabled) return false;

  const failed = runInfo.status === 'error' || runInfo.status === 'timeout';
  const onlyOnFail = task.onlyOnFailure ?? globalSettings.onlyOnFailure ?? false;
  if (onlyOnFail && !failed) {
    return false;
  }

  return true;
}
