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
  sendToChannel,
  deliverRun,
  DEFAULT_DELIVERY_TIMEOUT_MS,
  MIN_DELIVERY_TIMEOUT_MS,
  resolveDeliveryTimeoutMs,
  unknownChannels,
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

test('#26: every advertised channel id has a handler', async () => {
  assert.deepEqual(CHANNEL_IDS, ['telegram', 'kanban', 'discord', 'slack', 'ntfy', 'bark', 'pushplus', 'tts', 'gitea']);
  assert.equal(DEFAULT_DELIVERY_TIMEOUT_MS, 15000, 'channels get a bounded delivery window by default');
  // A missing case would fall through to "unknown channel", so drive each id
  // through the dispatcher with a fully configured, stubbed environment.
  const http = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, provider: 'p', number: 1 }) });
  const settings = {
    chatId: '42', kanbanBaseUrl: 'http://127.0.0.1:3000',
    discordWebhookUrl: 'http://d.test/h', slackWebhookUrl: 'http://s.test/h',
    ntfyTopic: 't', ntfyTokenRef: 'N', barkKey: 'k', pushplusTokenRef: 'P',
    giteaBaseUrl: 'http://g.test', giteaRepo: 'o/r', giteaTokenRef: 'G',
    ttsBaseUrl: 'http://t.test',
  };
  for (const channelId of CHANNEL_IDS) {
    const detail = await sendToChannel({
      channelId,
      task,
      runInfo: okRun,
      settings,
      secrets: { botToken: 'tok', resolveSecret: async () => 'secret' },
      fetchFn: http,
    });
    assert.ok(detail && typeof detail === 'object', `${channelId} returned a detail object`);
  }
  await assert.rejects(
    () => sendToChannel({ channelId: 'nope', task, runInfo: okRun, settings, fetchFn: http }),
    /unknown channel/,
  );
  // The email channel was removed (#23): its id must not be routable any more.
  await assert.rejects(
    () => sendToChannel({ channelId: 'email', task, runInfo: okRun, settings, fetchFn: http }),
    /unknown channel/,
  );
});

test('#26: a hanging channel times out instead of blocking the rest of the report', async () => {
  const seen = [];
  // The discord endpoint never settles; every other channel must still deliver.
  // A real hung socket keeps the event loop alive by itself — the stub has to
  // do the same, otherwise the process drains and the test is cancelled.
  const http = (url, options = {}) => {
    seen.push(String(url));
    if (String(url).includes('hang.test')) {
      return new Promise((resolve, reject) => {
        const keepAlive = setInterval(() => {}, 25);
        const fallback = setTimeout(() => {
          clearInterval(keepAlive);
          resolve({ ok: true, status: 200, json: async () => ({}) });
        }, 3000);
        const finish = (fn) => {
          clearInterval(keepAlive);
          clearTimeout(fallback);
          fn();
        };
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            finish(() => reject(err));
          });
        }
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  };
  const started = Date.now();
  const result = await deliverRun({
    task: { ...task, channels: ['discord', 'slack'] },
    runInfo: okRun,
    // MIN_DELIVERY_TIMEOUT_MS is the shortest deadline the router accepts (#115).
    settings: { discordWebhookUrl: 'http://hang.test/hook', slackWebhookUrl: 'http://ok.test/hook', deliveryTimeoutMs: MIN_DELIVERY_TIMEOUT_MS },
    fetchFn: http,
  });
  const elapsed = Date.now() - started;
  assert.deepEqual(result.delivered.map((d) => d.channel), ['slack'], 'the healthy channel still delivered');
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /timed out after 1000 ms/);
  assert.ok(elapsed < 3000, `delivery returned promptly (took ${elapsed} ms)`);
  assert.ok(seen.length >= 2, 'channels were dispatched despite the hang');
});

test('#26: channels are dispatched concurrently, not one after another', async () => {
  const order = [];
  const http = (url) => new Promise((resolve) => {
    const name = String(url).includes('slow') ? 'slow' : 'fast';
    order.push('start:' + name);
    setTimeout(() => {
      order.push('end:' + name);
      resolve({ ok: true, status: 200, json: async () => ({}) });
    }, name === 'slow' ? 300 : 10);
  });
  const result = await deliverRun({
    task: { ...task, channels: ['discord', 'slack'] },
    runInfo: okRun,
    settings: { discordWebhookUrl: 'http://slow.test/hook', slackWebhookUrl: 'http://fast.test/hook' },
    fetchFn: http,
  });
  assert.equal(result.failures.length, 0);
  // The dispatch order proves concurrency: the fast channel starts before the
  // slow one finishes, which sequential delivery could not produce.
  assert.equal(order[0], 'start:slow', 'the slow channel starts first');
  assert.ok(order.indexOf('start:fast') < order.indexOf('end:slow'), 'the fast channel does not wait for the slow one');
});

test('#23: the removed email channel is no longer routable', async () => {
  // The channel was cut after the owner decision: SMTP needs a mailbox, an app
  // password and provider-specific TLS handling, which is not worth the surface
  // for this plugin. Its settings are gone too, so a task that still lists the
  // id must fail loudly instead of silently doing nothing.
  const result = await deliverRun({
    task: { ...task, channels: ['email', 'slack'] },
    runInfo: okRun,
    settings: { slackWebhookUrl: 'http://ok.test/hook' },
    fetchFn: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  assert.deepEqual(result.delivered.map((d) => d.channel), ['slack'], 'the healthy channel still delivered');
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].channel, 'email');
  assert.match(result.failures[0].error, /unknown channel: email/);
});

test('#51: a credential resolver that never settles cannot hold the run', async () => {
  const result = await deliverRun({
    task: { ...task, channels: ['ntfy'] },
    runInfo: okRun,
    settings: { ntfyTopic: 'topic', ntfyTokenRef: 'SLOW', deliveryTimeoutMs: MIN_DELIVERY_TIMEOUT_MS },
    secrets: { resolveSecret: () => new Promise(() => {}) },
    fetchFn: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /timed out after 1000 ms/);
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
  assert.equal(pp.url, 'https://www.pushplus.plus/send');
  const selfHosted = buildPushplusRequest({ settings: { pushplusUrl: 'http://127.0.0.1:3099/pp' }, text: 'x', task, token: 'pt' });
  assert.equal(selfHosted.url, 'http://127.0.0.1:3099/pp', 'endpoint is overridable for self-hosted proxies');
});

test('#28: gitea issue payload marks failures with alert labels', () => {
  const failed = buildGiteaIssuePayload({ task, runInfo: failRun });
  assert.match(failed.title, /^\[Cron failure\]/);
  assert.deepEqual(failed.labels, ['cron', 'bug', 'alert']);
  const ok = buildGiteaIssuePayload({ task, runInfo: okRun });
  assert.match(ok.title, /^\[Cron run\]/);
  assert.deepEqual(ok.labels, ['cron', 'auto']);
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

test('#115: the delivery deadline is clamped to a sane minimum', async () => {
  assert.equal(MIN_DELIVERY_TIMEOUT_MS, 1000);
  assert.equal(resolveDeliveryTimeoutMs(15000), 15000, 'a sane value is kept');
  assert.equal(resolveDeliveryTimeoutMs(1), 1000, 'a value below the minimum is raised');
  assert.equal(resolveDeliveryTimeoutMs(999), 1000);
  assert.equal(resolveDeliveryTimeoutMs(undefined), DEFAULT_DELIVERY_TIMEOUT_MS, 'missing value falls back to the default');
  assert.equal(resolveDeliveryTimeoutMs('abc'), DEFAULT_DELIVERY_TIMEOUT_MS);
  assert.equal(resolveDeliveryTimeoutMs(0), DEFAULT_DELIVERY_TIMEOUT_MS);
  assert.equal(resolveDeliveryTimeoutMs(-5), DEFAULT_DELIVERY_TIMEOUT_MS);

  // The clamp must reach the wire: a stored 1 ms cannot make every channel
  // fail instantly, so the report still goes out.
  const calls = [];
  const http = async (url) => {
    calls.push({ url: String(url), signal: true });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const started = Date.now();
  const result = await deliverRun({
    task: { ...task, channels: ['slack'] },
    runInfo: okRun,
    settings: { slackWebhookUrl: 'http://ok.test/hook', deliveryTimeoutMs: 1 },
    fetchFn: http,
  });
  assert.equal(result.failures.length, 0, 'a misconfigured 1 ms timeout no longer fails the delivery');
  assert.deepEqual(result.delivered.map((d) => d.channel), ['slack']);
  assert.ok(Date.now() - started < 1000, 'the clamped deadline is used, not the stored 1 ms');
});

test('#121: a task that still references a removed channel reports it', () => {
  assert.deepEqual(unknownChannels({ channels: ['discord', 'email', 'slack'] }), ['email']);
  assert.deepEqual(unknownChannels({ channels: ['discord'] }), []);
  assert.deepEqual(unknownChannels({}), []);
  assert.deepEqual(unknownChannels({ channels: 'discord' }), [], 'a non-array is ignored');
});
