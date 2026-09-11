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
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';

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
