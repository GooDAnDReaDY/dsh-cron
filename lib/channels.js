/**
 * Delivery channels and router (#26, #20, #21, #22, #23, #47, #28).
 *
 * Every adapter is split into a pure payload/request builder (unit-testable
 * without network) and a thin send step using an injected fetch. The router
 * decides which channels a run goes to and never throws: failures are
 * collected so one broken channel cannot hide another.
 */

import { formatTaskTelegramMessage, sendTelegramMessage } from './telegram.js';
import { createKanbanCard, shouldCreateKanbanCard } from './integrations.js';
import { resolveTemplateText, truncateText } from './templates.js';

export const CHANNEL_IDS = ['telegram', 'kanban', 'discord', 'slack', 'ntfy', 'bark', 'pushplus', 'email', 'tts', 'gitea'];

export const CHANNEL_LABELS = {
  telegram: 'Telegram',
  kanban: 'dsh-kanban card',
  discord: 'Discord webhook',
  slack: 'Slack webhook',
  ntfy: 'ntfy push',
  bark: 'Bark push',
  pushplus: 'PushPlus',
  email: 'Email (SMTP)',
  tts: 'Voice via dsh-tts',
  gitea: 'Gitea issue',
};

const isFailed = (status) => status === 'error' || status === 'timeout';

/** The message text for a channel: custom template, else built-in defaults. */
export function messageTextFor(channelId, task, runInfo, settings = {}) {
  const templates = (settings && settings.channelTemplates) || {};
  const template = templates[channelId] || settings.template || '';
  return resolveTemplateText({ template, task, runInfo });
}

/**
 * Which channels deliver a given run.
 * Explicit per-task channels win; otherwise the legacy flags decide.
 */
export function resolveChannels(task, settings = {}) {
  if (Array.isArray(task.channels)) {
    const explicit = task.channels.filter((id) => CHANNEL_IDS.includes(id));
    if (explicit.length) return explicit;
  }
  const out = [];
  const notify = task.notifyTelegram !== undefined ? task.notifyTelegram : settings.notifyTelegram;
  if (notify) out.push('telegram');
  if ((task.kanbanMode || 'none') !== 'none') out.push('kanban');
  return out;
}

/** Failure/only-on-failure filtering, per channel. */
export function shouldSendToChannel(channelId, task, runInfo, settings = {}) {
  if (channelId === 'kanban') return shouldCreateKanbanCard(task, runInfo);
  const onlyOnFail = task.onlyOnFailure !== undefined
    ? Boolean(task.onlyOnFailure)
    : Boolean(settings.onlyOnFailure);
  if (onlyOnFail && !isFailed(runInfo.status)) return false;
  return true;
}

// ---------------------------------------------------------------- builders

export function buildDiscordPayload({ text, task, runInfo }) {
  const failed = isFailed(runInfo.status);
  return {
    content: truncateText(text, 1900),
    embeds: [{
      title: `${failed ? '❌' : '✅'} ${truncateText(task.title || 'Task', 200)}`,
      description: truncateText(failed ? (runInfo.error || '') : (runInfo.output || ''), 1900) || undefined,
      color: failed ? 0xef4444 : 0x10b981,
      footer: { text: truncateText(task.scheduleText || task.schedule || '', 200) },
      timestamp: new Date(runInfo.at || Date.now()).toISOString(),
    }],
  };
}

export function buildSlackPayload({ text }) {
  return { text: truncateText(text, 3000) };
}

export function buildNtfyRequest({ settings = {}, text, task, token }) {
  const base = String(settings.ntfyUrl || 'https://ntfy.sh').replace(/\/+$/, '');
  const topic = String(settings.ntfyTopic || '').trim();
  if (!topic) throw new Error('ntfyTopic is not configured');
  const headers = {
    Title: truncateText(task && task.title ? task.title : 'DSH Cron', 120),
    Tags: isFailed(task && task.lastStatus) ? 'warning' : 'robot',
    'Content-Type': 'text/plain; charset=utf-8',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { url: `${base}/${encodeURIComponent(topic)}`, method: 'POST', headers, body: truncateText(text, 4000) };
}

export function buildBarkRequest({ settings = {}, text, task }) {
  const server = String(settings.barkServerUrl || 'https://api.day.app').replace(/\/+$/, '');
  const key = String(settings.barkKey || '').trim();
  if (!key) throw new Error('barkKey is not configured');
  const title = truncateText(task && task.title ? task.title : 'DSH Cron', 100);
  return {
    url: `${server}/${encodeURIComponent(key)}/${encodeURIComponent(title)}/${encodeURIComponent(truncateText(text, 1200))}`,
    method: 'GET',
    headers: {},
  };
}

export function buildPushplusRequest({ settings = {}, text, task, token }) {
  const effective = token || settings.pushplusToken || '';
  if (!effective) throw new Error('pushplus token is not configured');
  const url = String(settings.pushplusUrl || 'https://www.pushplus.plus/send').trim();
  return {
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: effective,
      title: truncateText(task && task.title ? task.title : 'DSH Cron', 100),
      content: truncateText(text, 4000),
      template: 'markdown',
    }),
  };
}

export function buildGiteaIssuePayload({ task, runInfo }) {
  const failed = isFailed(runInfo.status);
  return {
    title: `${failed ? '[Cron failure]' : '[Cron run]'} ${truncateText(task.title || 'Task', 200)}`,
    body: [
      `**Cron task:** ${task.title} (\`${task.id}\`)`,
      `**Schedule:** ${task.scheduleText || task.schedule || ''}`,
      `**Status:** ${runInfo.status}`,
      `**Started at:** ${new Date(runInfo.at || Date.now()).toISOString()}`,
      runInfo.error ? `\n**Error:**\n\`\`\`\n${truncateText(runInfo.error, 1000)}\n\`\`\`` : '',
      runInfo.output ? `\n**Output:**\n\`\`\`\n${truncateText(runInfo.output, 1000)}\n\`\`\`` : '',
    ].filter(Boolean).join('\n\n'),
    labels: failed ? ['cron', 'bug', 'alert'] : ['cron', 'auto'],
  };
}

export function buildEmailMessage({ settings = {}, text, task, runInfo, password }) {
  const to = String(settings.smtpTo || '').trim();
  if (!to) throw new Error('smtpTo is not configured');
  const from = String(settings.smtpFrom || settings.smtpUser || '').trim();
  const failed = isFailed(runInfo.status);
  return {
    from: from || undefined,
    to,
    subject: `${failed ? '❌' : '✅'} ${task.title || 'DSH Cron'} — ${runInfo.status}`,
    text: truncateText(text, 10000),
    transport: {
      host: settings.smtpHost || '',
      port: Number(settings.smtpPort) || 587,
      secure: Boolean(settings.smtpSecure),
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: password || '' } : undefined,
    },
  };
}

// ------------------------------------------------------------------ sender

async function sendHttp(fetchFn, request, channelId) {
  const res = await fetchFn(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  if (!res || !res.ok) {
    const status = res && res.status ? res.status : 'no-response';
    throw new Error(`${channelId}: HTTP ${status}`);
  }
  return { status: res.status };
}

/**
 * Deliver one run to one channel.
 * `resolveSecret(ref)` resolves credential references; `deps.createTransport`
 * is an injectable nodemailer-compatible factory for tests.
 */
export async function sendToChannel({ channelId, task, runInfo, settings = {}, secrets = {}, fetchFn, deps = {} }) {
  const resolveSecret = typeof secrets.resolveSecret === 'function' ? secrets.resolveSecret : async () => null;
  const http = fetchFn || globalThis.fetch;

  switch (channelId) {
    case 'telegram': {
      const botToken = secrets.botToken || '';
      const chatId = String(settings.chatId || '').trim();
      if (!botToken || !chatId) throw new Error('telegram: botToken or chatId is not configured');
      const text = settings.template
        ? messageTextFor('telegram', task, runInfo, settings)
        : formatTaskTelegramMessage(task, runInfo);
      await sendTelegramMessage({ botToken, chatId, text, fetchFn: http });
      return { chatId };
    }
    case 'kanban': {
      const isErr = isFailed(runInfo.status);
      const result = await createKanbanCard({
        title: `${isErr ? '[Cron failure]' : '[Cron completed]'} ${task.title}`,
        body: buildGiteaIssuePayload({ task, runInfo }).body,
        board: 'main',
        column: isErr ? 'backlog' : 'done',
        labels: isErr ? ['cron', 'bug', 'alert'] : ['cron', 'auto'],
        kanbanBaseUrl: settings.kanbanBaseUrl || 'http://127.0.0.1:3000',
        fetchFn: http,
      });
      if (!result.success) throw new Error(`kanban: ${result.error}`);
      return { column: isErr ? 'backlog' : 'done' };
    }
    case 'discord': {
      const url = String(settings.discordWebhookUrl || '').trim();
      if (!url) throw new Error('discord: discordWebhookUrl is not configured');
      const payload = buildDiscordPayload({ text: messageTextFor('discord', task, runInfo, settings), task, runInfo });
      return sendHttp(http, { url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 'discord');
    }
    case 'slack': {
      const url = String(settings.slackWebhookUrl || '').trim();
      if (!url) throw new Error('slack: slackWebhookUrl is not configured');
      const payload = buildSlackPayload({ text: messageTextFor('slack', task, runInfo, settings) });
      return sendHttp(http, { url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 'slack');
    }
    case 'ntfy': {
      const token = settings.ntfyTokenRef ? await resolveSecret(settings.ntfyTokenRef) : null;
      const req = buildNtfyRequest({ settings, text: messageTextFor('ntfy', task, runInfo, settings), task, token });
      return sendHttp(http, req, 'ntfy');
    }
    case 'bark': {
      const req = buildBarkRequest({ settings, text: messageTextFor('bark', task, runInfo, settings), task });
      return sendHttp(http, req, 'bark');
    }
    case 'pushplus': {
      const token = settings.pushplusTokenRef ? await resolveSecret(settings.pushplusTokenRef) : null;
      const req = buildPushplusRequest({ settings, text: messageTextFor('pushplus', task, runInfo, settings), task, token });
      return sendHttp(http, req, 'pushplus');
    }
    case 'email': {
      const password = settings.smtpPasswordRef ? await resolveSecret(settings.smtpPasswordRef) : (settings.smtpPassword || '');
      const message = buildEmailMessage({ settings, text: messageTextFor('email', task, runInfo, settings), task, runInfo, password });
      let createTransport = deps.createTransport;
      if (!createTransport) {
        try {
          const mod = await import('nodemailer');
          createTransport = (mod.default || mod).createTransport;
        } catch {
          throw new Error('email: nodemailer is not installed in the harness (install it or use another channel)');
        }
      }
      const transport = createTransport(message.transport);
      await transport.sendMail({ from: message.from, to: message.to, subject: message.subject, text: message.text });
      return { to: message.to };
    }
    case 'tts': {
      const base = String(settings.ttsBaseUrl || 'http://127.0.0.1:3080').replace(/\/+$/, '');
      const payload = { text: truncateText(messageTextFor('tts', task, runInfo, settings), 600) };
      const res = await http(`${base}/dsh-tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res || !res.ok) throw new Error(`tts: HTTP ${res && res.status ? res.status : 'no-response'}`);
      const data = await res.json().catch(() => ({}));
      return { provider: data.provider || 'dsh-tts', tookMs: data.tookMs || null };
    }
    case 'gitea': {
      const base = String(settings.giteaBaseUrl || '').replace(/\/+$/, '');
      const repo = String(settings.giteaRepo || '').trim();
      if (!base || !repo) throw new Error('gitea: giteaBaseUrl and giteaRepo are required');
      const token = settings.giteaTokenRef ? await resolveSecret(settings.giteaTokenRef) : '';
      if (!token) throw new Error(`gitea: credential "${settings.giteaTokenRef || ''}" did not resolve`);
      const payload = buildGiteaIssuePayload({ task, runInfo });
      const res = await http(`${base}/api/v1/repos/${repo}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `token ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res || !res.ok) throw new Error(`gitea: HTTP ${res && res.status ? res.status : 'no-response'}`);
      const issue = await res.json().catch(() => ({}));
      return { number: issue.number || null };
    }
    default:
      throw new Error(`unknown channel: ${channelId}`);
  }
}

/**
 * Deliver a finished run to every applicable channel.
 * Never throws: per-channel failures are returned in `failures`.
 */
export async function deliverRun({ task, runInfo, settings = {}, secrets = {}, fetchFn, deps = {} }) {
  const channels = resolveChannels(task, settings);
  const delivered = [];
  const skipped = [];
  const failures = [];
  for (const channelId of channels) {
    if (!shouldSendToChannel(channelId, task, runInfo, settings)) {
      skipped.push(channelId);
      continue;
    }
    try {
      const detail = await sendToChannel({ channelId, task, runInfo, settings, secrets, fetchFn, deps });
      delivered.push({ channel: channelId, detail: detail || null });
    } catch (err) {
      failures.push({ channel: channelId, error: (err && err.message) || String(err) });
    }
  }
  return { channels, delivered, skipped, failures };
}
