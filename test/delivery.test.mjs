import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTemplate,
  buildTemplateVars,
  resolveTemplateText,
  truncateText,
  formatDuration,
  DEFAULT_PLAIN_TEMPLATE,
} from '../lib/templates.js';
import {
  CHANNEL_IDS,
  resolveChannels,
  shouldSendToChannel,
  buildDiscordPayload,
  buildSlackPayload,
  buildNtfyRequest,
  buildBarkRequest,
  buildPushplusRequest,
  buildGiteaIssuePayload,
  buildEmailMessage,
  sendToChannel,
  deliverRun,
} from '../lib/channels.js';

const task = { id: 'cron_1', title: 'Nightly', scheduleText: 'Every day at 03:00', schedule: '0 3 * * *' };
const okRun = { status: 'success', durationMs: 1500, output: 'all good', error: null, at: 1700000000000, costUsd: 0.0012, usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 } };
const failRun = { ...okRun, status: 'error', output: '', error: 'boom' };

function stubFetch(recorder) {
  return async (url, options = {}) => {
    recorder.push({ url: String(url), method: options.method || 'GET', headers: options.headers || {}, body: options.body });
    return { ok: true, status: 200, json: async () => ({ provider: 'piper', tookMs: 42, number: 7 }) };
  };
}

// ------------------------------------------------------------------ #25

test('#25: templates render variables and keep unknown placeholders', () => {
  const vars = buildTemplateVars(task, okRun);
  const text = renderTemplate('[{status}] {title} in {duration} — {unknown}', vars);
  assert.equal(text, '[success] Nightly in 1.5 s — {unknown}');
});

test('#25: default templates differ for success and failure runs', () => {
  const ok = resolveTemplateText({ task, runInfo: okRun });
  assert.match(ok, /Nightly/);
  assert.match(ok, /all good/);
  const bad = resolveTemplateText({ task, runInfo: failRun });
  assert.match(bad, /failed/);
  assert.match(bad, /boom/);
});

test('#25: a custom template overrides the defaults', () => {
  const text = resolveTemplateText({ template: 'CRON {title}={status}', task, runInfo: okRun });
  assert.equal(text, 'CRON Nightly=success');
});

test('#25: helpers truncate and format durations', () => {
  assert.equal(truncateText('abcdef', 3), 'abc…');
  assert.equal(truncateText('abc', 3), 'abc');
  assert.equal(formatDuration(500), '500 ms');
  assert.equal(formatDuration(1500), '1.5 s');
  assert.equal(formatDuration(65000), '1m 5s');
  assert.equal(formatDuration(null), '—');
  assert.match(DEFAULT_PLAIN_TEMPLATE, /\{title\}/);
});

// ------------------------------------------------------------------ #26

test('#26: explicit task channels win over the legacy flags', () => {
  const explicit = resolveChannels({ channels: ['slack', 'ntfy'], notifyTelegram: true, kanbanMode: 'always' }, {});
  assert.deepEqual(explicit, ['slack', 'ntfy']);

  const legacy = resolveChannels({ channels: [], notifyTelegram: true, kanbanMode: 'on_failure' }, {});
  assert.deepEqual(legacy, ['telegram', 'kanban']);

  const fromSettings = resolveChannels({}, { notifyTelegram: true, kanbanMode: 'none' });
  assert.deepEqual(fromSettings, ['telegram']);

  const none = resolveChannels({ notifyTelegram: false, kanbanMode: 'none' }, {});
  assert.deepEqual(none, []);
});

test('#26: channel filtering honours only-on-failure and kanban modes', () => {
  assert.equal(shouldSendToChannel('telegram', { onlyOnFailure: true }, okRun, {}), false);
  assert.equal(shouldSendToChannel('telegram', { onlyOnFailure: true }, failRun, {}), true);
  assert.equal(shouldSendToChannel('slack', {}, okRun, { onlyOnFailure: true }), false);
  assert.equal(shouldSendToChannel('slack', {}, failRun, { onlyOnFailure: true }), true);
  assert.equal(shouldSendToChannel('kanban', { kanbanMode: 'none' }, failRun, {}), false);
  assert.equal(shouldSendToChannel('kanban', { kanbanMode: 'on_failure' }, failRun, {}), true);
  assert.equal(shouldSendToChannel('kanban', { kanbanMode: 'on_failure' }, okRun, {}), false);
});

test('#26: every advertised channel id has a handler', () => {
  assert.deepEqual(CHANNEL_IDS, ['telegram', 'kanban', 'discord', 'slack', 'ntfy', 'bark', 'pushplus', 'email', 'tts', 'gitea']);
});

// ------------------------------------------------------- payload builders

test('#20: discord payload carries an embed coloured by status', () => {
  const okPayload = buildDiscordPayload({ text: 'hello', task, runInfo: okRun });
  assert.equal(okPayload.embeds[0].color, 0x10b981);
  assert.match(okPayload.embeds[0].title, /Nightly/);
  const badPayload = buildDiscordPayload({ text: 'hello', task, runInfo: failRun });
  assert.equal(badPayload.embeds[0].color, 0xef4444);
  assert.match(badPayload.embeds[0].description, /boom/);
});

test('#21: slack payload is a plain text body', () => {
  assert.deepEqual(buildSlackPayload({ text: 'hi there' }), { text: 'hi there' });
});

test('#22: push builders validate their configuration', () => {
  assert.throws(() => buildNtfyRequest({ settings: {}, text: 'x', task }), /ntfyTopic/);
  const ntfy = buildNtfyRequest({ settings: { ntfyUrl: 'https://ntfy.example/', ntfyTopic: 'my topic' }, text: 'x', task, token: 'tk' });
  assert.equal(ntfy.url, 'https://ntfy.example/my%20topic');
  assert.equal(ntfy.headers.Authorization, 'Bearer tk');

  assert.throws(() => buildBarkRequest({ settings: {}, text: 'x', task }), /barkKey/);
  const bark = buildBarkRequest({ settings: { barkServerUrl: 'https://bark.example', barkKey: 'k/1' }, text: 'hello world', task });
  assert.match(bark.url, /^https:\/\/bark\.example\/k%2F1\//);

  assert.throws(() => buildPushplusRequest({ settings: {}, text: 'x', task }), /pushplus token/);
  const pp = buildPushplusRequest({ settings: {}, text: 'x', task, token: 'pt' });
  assert.equal(JSON.parse(pp.body).token, 'pt');
});

test('#28: gitea issue payload marks failures with alert labels', () => {
  const failed = buildGiteaIssuePayload({ task, runInfo: failRun });
  assert.match(failed.title, /^\[Cron failure\]/);
  assert.deepEqual(failed.labels, ['cron', 'bug', 'alert']);
  const ok = buildGiteaIssuePayload({ task, runInfo: okRun });
  assert.match(ok.title, /^\[Cron run\]/);
  assert.deepEqual(ok.labels, ['cron', 'auto']);
});

test('#23: email message needs recipients and maps transport settings', () => {
  assert.throws(() => buildEmailMessage({ settings: {}, text: 'x', task, runInfo: okRun }), /smtpTo/);
  const msg = buildEmailMessage({
    settings: { smtpTo: 'ops@example.test', smtpFrom: 'cron@example.test', smtpHost: 'smtp.test', smtpPort: 465, smtpSecure: true, smtpUser: 'u' },
    text: 'body',
    task,
    runInfo: failRun,
    password: 'pw',
  });
  assert.equal(msg.to, 'ops@example.test');
  assert.match(msg.subject, /❌/);
  assert.equal(msg.transport.host, 'smtp.test');
  assert.equal(msg.transport.secure, true);
  assert.deepEqual(msg.transport.auth, { user: 'u', pass: 'pw' });
});

// ---------------------------------------------------------------- senders

test('#26: http channels deliver through the injected fetch', async () => {
  const calls = [];
  const http = stubFetch(calls);
  const settings = {
    discordWebhookUrl: 'https://d.test/hook',
    slackWebhookUrl: 'https://s.test/hook',
    ntfyTopic: 'topic',
    pushplusTokenRef: 'PUSHPLUS_TOKEN',
  };

  await sendToChannel({ channelId: 'discord', task, runInfo: okRun, settings, fetchFn: http });
  await sendToChannel({ channelId: 'slack', task, runInfo: okRun, settings, fetchFn: http });
  await sendToChannel({ channelId: 'ntfy', task, runInfo: okRun, settings, fetchFn: http });
  await sendToChannel({ channelId: 'bark', task, runInfo: okRun, settings: { ...settings, barkKey: 'key' }, fetchFn: http });
  await sendToChannel({ channelId: 'pushplus', task, runInfo: okRun, settings, secrets: { resolveSecret: async () => 'pp-token' }, fetchFn: http });

  assert.deepEqual(calls.map((c) => new URL(c.url).host), [
    'd.test', 's.test', 'ntfy.sh', 'api.day.app', 'www.pushplus.plus',
  ]);
  assert.equal(JSON.parse(calls[4].body).token, 'pp-token');
});

test('#26: telegram delivers the rendered message with the resolved token', async () => {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(options.body || '{}') });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const result = await sendToChannel({
    channelId: 'telegram',
    task,
    runInfo: okRun,
    settings: { chatId: '42' },
    secrets: { botToken: 'tok-1' },
    fetchFn: http,
  });
  assert.equal(result.chatId, '42');
  assert.equal(calls[0].url, 'https://api.telegram.org/bottok-1/sendMessage');
  assert.equal(calls[0].body.chat_id, '42');
  assert.match(calls[0].body.text, /Nightly/);
});

test('#26: telegram refuses to send without a token', async () => {
  await assert.rejects(
    () => sendToChannel({ channelId: 'telegram', task, runInfo: okRun, settings: { chatId: '42' }, fetchFn: async () => ({ ok: true, status: 200 }) }),
    /botToken or chatId/,
  );
});

test('#26: kanban creates a card through the kanban API', async () => {
  const calls = [];
  const http = stubFetch(calls);
  const result = await sendToChannel({ channelId: 'kanban', task, runInfo: failRun, settings: {}, fetchFn: http });
  assert.equal(result.column, 'backlog');
  assert.match(calls[0].url, /\/dsh-kanban\/task$/);
  assert.deepEqual(JSON.parse(calls[0].body).labels, ['cron', 'bug', 'alert']);
});

test('#23: email sends through an injected transport factory', async () => {
  const sent = [];
  const deps = {
    createTransport: (transport) => ({
      transport,
      sendMail: async (message) => { sent.push(message); return { messageId: '1' }; },
    }),
  };
  const result = await sendToChannel({
    channelId: 'email',
    task,
    runInfo: okRun,
    settings: { smtpTo: 'ops@example.test', smtpHost: 'smtp.test' },
    deps,
  });
  assert.equal(result.to, 'ops@example.test');
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Nightly/);
});

test('#47: tts announces through the dsh-tts speak route', async () => {
  const calls = [];
  const http = stubFetch(calls);
  const result = await sendToChannel({ channelId: 'tts', task, runInfo: okRun, settings: { ttsBaseUrl: 'http://127.0.0.1:3080/' }, fetchFn: http });
  assert.equal(result.provider, 'piper');
  assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:3080\/dsh-tts\/speak$/);
  assert.ok(JSON.parse(calls[0].body).text.includes('Nightly'));
});

test('#28: gitea creates an issue with the resolved credential', async () => {
  const calls = [];
  const http = stubFetch(calls);
  const result = await sendToChannel({
    channelId: 'gitea',
    task,
    runInfo: failRun,
    settings: { giteaBaseUrl: 'https://gitea.test/', giteaRepo: 'org/repo', giteaTokenRef: 'GITEA_TOKEN' },
    secrets: { resolveSecret: async (ref) => (ref === 'GITEA_TOKEN' ? 'secret-token' : null) },
    fetchFn: http,
  });
  assert.equal(result.number, 7);
  assert.equal(calls[0].url, 'https://gitea.test/api/v1/repos/org/repo/issues');
  assert.equal(calls[0].headers.Authorization, 'token secret-token');
});

test('#26: the router collects failures without stopping other channels', async () => {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes('broken.test')) return { ok: false, status: 500 };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const result = await deliverRun({
    task: { ...task, channels: ['discord', 'slack'] },
    runInfo: okRun,
    settings: { discordWebhookUrl: 'https://broken.test/hook', slackWebhookUrl: 'https://ok.test/hook' },
    fetchFn: http,
  });
  assert.deepEqual(result.delivered.map((d) => d.channel), ['slack']);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].channel, 'discord');
  assert.match(result.failures[0].error, /HTTP 500/);
  assert.deepEqual(result.skipped, []);
});

test('#26: the router skips channels when only-on-failure is set on a success run', async () => {
  const result = await deliverRun({
    task: { ...task, channels: ['slack'], onlyOnFailure: true },
    runInfo: okRun,
    settings: { slackWebhookUrl: 'https://ok.test/hook' },
    fetchFn: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  assert.deepEqual(result.delivered, []);
  assert.deepEqual(result.skipped, ['slack']);
});

test('#26: a channel with missing configuration is reported, never thrown', async () => {
  const result = await deliverRun({ task: { ...task, channels: ['slack'] }, runInfo: okRun, settings: {}, fetchFn: async () => ({ ok: true, status: 200 }) });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /slackWebhookUrl/);
});
