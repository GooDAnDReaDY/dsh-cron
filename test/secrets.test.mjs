import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isCredentialRefName,
  looksLikeSecret,
  credentialRefStatus,
  resolveCredentialValue,
  resolveTelegramSecrets,
} from '../lib/secrets.js';
import { getDshSettingsPath } from '../lib/telegram.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { sanitizeSettingsPayload } from '../lib/index.js';

function makeStore(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-secrets-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  t.after(() => { try { fs.rmSync(filePath, { force: true }); } catch {} });
  return store;
}

test('#51: credential reference names are validated like env var names', () => {
  assert.equal(isCredentialRefName('CRON_TELEGRAM_BOT_TOKEN'), true);
  assert.equal(isCredentialRefName('lower-case'), false);
  assert.equal(isCredentialRefName('123STARTS_WITH_DIGIT'), false);
  assert.equal(isCredentialRefName(''), false);
});

test('#51: pasted secrets are detected instead of being stored as names', () => {
  assert.equal(looksLikeSecret('8830123456:AAFgHijKlmnOpqrStuv-Wxyz12345'), true);
  assert.equal(looksLikeSecret('CRON_TELEGRAM_BOT_TOKEN'), false);
  assert.equal(looksLikeSecret(''), false);

  const bad = credentialRefStatus('8830123456:AAFgHijKlmnOpqrStuv-Wxyz12345');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /looks like a secret/);

  const malformed = credentialRefStatus('not a name');
  assert.equal(malformed.ok, false);
  assert.match(malformed.error, /environment variable name/);

  const good = credentialRefStatus('CRON_TELEGRAM_BOT_TOKEN');
  assert.deepEqual(good, { ok: true, name: 'CRON_TELEGRAM_BOT_TOKEN' });
  assert.deepEqual(credentialRefStatus(''), { ok: true, name: '' });
});

const refNameOf = (ref) => (typeof ref === 'string' ? ref : (ref && (ref.name || ref.ref || ref.id)) || '');

test('#51: credential values resolve through the service, then the environment', async () => {
  const ctx = {
    get(name) {
      if (name !== 'credentials') return null;
      return { resolve: async (ref) => (refNameOf(ref) === 'TEST_REF' ? { value: 'from-service' } : null) };
    },
  };
  assert.equal(await resolveCredentialValue(ctx, 'TEST_REF'), 'from-service');
  assert.equal(await resolveCredentialValue(ctx, 'MISSING_REF'), null);

  process.env.DSH_CRON_TEST_ENV_REF = 'from-env';
  try {
    assert.equal(await resolveCredentialValue({}, 'DSH_CRON_TEST_ENV_REF'), 'from-env');
  } finally {
    delete process.env.DSH_CRON_TEST_ENV_REF;
  }
});

test('#51: telegram secrets follow the documented precedence', async (t) => {
  const ctx = {
    get(name) {
      if (name !== 'credentials') return null;
      return { resolve: async (ref) => (refNameOf(ref) === 'TOKEN_REF' ? { value: 'secret-from-service' } : null) };
    },
  };

  // 1. Credential reference wins over a legacy stored token.
  const withRef = await resolveTelegramSecrets(ctx, { botTokenRef: 'TOKEN_REF', botToken: 'legacy', chatId: '42' });
  assert.equal(withRef.botToken, 'secret-from-service');
  assert.equal(withRef.tokenSource, 'credential');
  assert.equal(withRef.chatId, '42');

  // 2. Without a reference, the legacy token keeps working.
  const legacy = await resolveTelegramSecrets(ctx, { botToken: 'legacy-token', chatId: '7' });
  assert.equal(legacy.botToken, 'legacy-token');
  assert.equal(legacy.tokenSource, 'legacy-settings');

  // 3. Nothing configured by the user: the host defaults (messenger-gateway
  //    settings file or environment) may legitimately provide a token, so the
  //    assertion must not depend on the host filesystem.
  delete process.env.CRON_TELEGRAM_BOT_TOKEN;
  const none = await resolveTelegramSecrets(ctx, {});
  assert.ok(
    ['messenger-gateway', 'env', 'none'].includes(none.tokenSource),
    `unexpected fallback source: ${none.tokenSource}`
  );
  if (none.tokenSource === 'none') assert.equal(none.botToken, '');
});

test('#51: the delivery step receives resolved credentials, not the stored token', async (t) => {
  const store = makeStore(t);
  store.saveSettings({ chatId: '99', notifyTelegram: true });
  const task = store.set({
    title: 'Notify with credential',
    schedule: 'every 10m',
    prompt: 'p',
    status: 'active',
    notifyTelegram: true,
  });

  let deliveredSettings = null;
  let deliveredRunInfo = null;
  const scheduler = new TaskScheduler(store, async () => 'ok', {
    resolveSecrets: async () => ({ botToken: 'resolved-token', chatId: '99', tokenSource: 'credential' }),
    deliver: async (_task, runInfo, settings) => {
      deliveredRunInfo = runInfo;
      deliveredSettings = settings;
      return { channels: ['telegram'], delivered: [{ channel: 'telegram' }], skipped: [], failures: [] };
    },
  });
  t.after(() => scheduler.stopAll());

  await scheduler.runTask(task.id);
  assert.equal(deliveredSettings.botToken, 'resolved-token', 'resolved credential reaches the router');
  assert.equal(deliveredSettings.chatId, '99');
  assert.equal(deliveredRunInfo.status, 'success');
});

test('#51: secret-bearing settings are masked on read and never overwritten by the mask', (t) => {
  const store = makeStore(t);
  store.saveSettings({
    discordWebhookUrl: 'https://discord.com/api/webhooks/123456/abcdefghijklmnop',
    slackWebhookUrl: 'https://hooks.slack.com/services/T000/B000/secretpart',
    barkKey: 'device-key-abcdefghijkl',
  });

  const client = store.getClientSettings();
  for (const key of ['discordWebhookUrl', 'slackWebhookUrl', 'barkKey']) {
    assert.ok(client[key].includes('••'), `${key} is masked for the browser`);
    assert.ok(!client[key].includes('secretpart'), `${key} does not leak the secret`);
  }

  // The UI echoes the mask back on save; the stored value must survive.
  store.saveSettings({ ...client, chatId: '42' });
  const after = store.getSettings();
  assert.equal(after.discordWebhookUrl, 'https://discord.com/api/webhooks/123456/abcdefghijklmnop');
  assert.equal(after.barkKey, 'device-key-abcdefghijkl');
  assert.equal(after.chatId, '42');

  // A real new value still replaces it.
  store.saveSettings({ discordWebhookUrl: 'https://discord.com/api/webhooks/999/newsecret' });
  assert.equal(store.getSettings().discordWebhookUrl, 'https://discord.com/api/webhooks/999/newsecret');
});

test('#51: the settings route rejects raw secrets and masked echoes before the scope write', () => {
  const payload = sanitizeSettingsPayload({
    botToken: '1234••••••••xyz',
    botTokenRef: 'CRON_TELEGRAM_BOT_TOKEN',
    giteaToken: 'raw-token',
    barkKey: 'devi••••••••key',
    discordWebhookUrl: 'https://discord.com/api/webhooks/1/real',
    template: '{title}',
  });
  assert.equal(payload.botToken, undefined, 'masked bot token dropped');
  assert.equal(payload.giteaToken, undefined, 'raw Gitea token refused');
  assert.equal(payload.barkKey, undefined, 'masked Bark key dropped');
  assert.equal(payload.botTokenRef, 'CRON_TELEGRAM_BOT_TOKEN', 'credential reference kept');
  assert.equal(payload.discordWebhookUrl, 'https://discord.com/api/webhooks/1/real', 'a real new value is kept');
  assert.equal(payload.template, '{title}');
});

test('#115: the settings route normalises the delivery deadline before the scope write', () => {
  assert.equal(sanitizeSettingsPayload({ deliveryTimeoutMs: 1 }).deliveryTimeoutMs, 1000, 'a 1 ms deadline is raised to the minimum');
  assert.equal(sanitizeSettingsPayload({ deliveryTimeoutMs: 20000 }).deliveryTimeoutMs, 20000, 'a sane value is kept');
  assert.equal(sanitizeSettingsPayload({ deliveryTimeoutMs: 15000.4 }).deliveryTimeoutMs, 15000, 'fractional values are rounded');
  assert.equal(sanitizeSettingsPayload({ deliveryTimeoutMs: '' }).deliveryTimeoutMs, undefined, 'an empty value is dropped so the default applies');
  assert.equal(sanitizeSettingsPayload({ deliveryTimeoutMs: 'abc' }).deliveryTimeoutMs, undefined, 'a non-numeric value is dropped');
  assert.equal(sanitizeSettingsPayload({ deliveryTimeoutMs: -1 }).deliveryTimeoutMs, undefined);
  assert.equal(sanitizeSettingsPayload({ chatId: '42' }).deliveryTimeoutMs, undefined, 'an absent key stays absent');
});

test('#51: the messenger-gateway fallback reads the profile home, not another one', () => {
  const env = { ...process.env };
  try {
    process.env.DSH_HOME = path.join(os.tmpdir(), 'dsh-home-test');
    assert.equal(getDshSettingsPath(), path.join(os.tmpdir(), 'dsh-home-test', 'settings.yaml'));
    delete process.env.DSH_HOME;
    process.env.HOME = path.join(os.tmpdir(), 'plain-home-test');
    assert.equal(getDshSettingsPath(), path.join(os.tmpdir(), 'plain-home-test', '.dsh', 'settings.yaml'));
  } finally {
    if (env.DSH_HOME === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = env.DSH_HOME;
    process.env.HOME = env.HOME;
  }
});
