import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TaskStore } from '../lib/store.js';
import {
  extractSettingFromYaml,
  extractFirstAllowedChatId,
  formatTaskTelegramMessage,
  shouldNotifyTask,
  sendTelegramMessage
} from '../lib/telegram.js';

test('extractSettingFromYaml and extractFirstAllowedChatId extract credentials', () => {
  const yaml = `
dsh-messenger-gateway:
  botToken: 123456:ABC-DEF
  allowedUserIds:
    - 987654321
    - 112233445
  verbose: true
`;
  const token = extractSettingFromYaml(yaml, 'dsh-messenger-gateway', 'botToken');
  assert.equal(token, '123456:ABC-DEF');

  const chat = extractFirstAllowedChatId(yaml);
  assert.equal(chat, '987654321');
});

test('formatTaskTelegramMessage formats success and error reports in Markdown', () => {
  const task = { title: 'Tags Watcher', scheduleText: 'Каждые 6 часов' };

  // Success report
  const successMsg = formatTaskTelegramMessage(task, {
    status: 'success',
    durationMs: 450,
    output: 'Found 3 new releases',
    error: null,
  });
  assert.ok(successMsg.includes('Tags Watcher'));
  assert.ok(successMsg.includes('✅ Успешно'));
  assert.ok(successMsg.includes('450 ms'));
  assert.ok(successMsg.includes('Found 3 new releases'));

  // Error report
  const errorMsg = formatTaskTelegramMessage(task, {
    status: 'error',
    durationMs: 120,
    output: '',
    error: 'Command failed with exit code 1',
  });
  assert.ok(errorMsg.includes('❌ Ошибка'));
  assert.ok(errorMsg.includes('Command failed with exit code 1'));
});

test('shouldNotifyTask handles notifyTelegram and onlyOnFailure mode', () => {
  const taskDisabled = { notifyTelegram: false, onlyOnFailure: false };
  assert.equal(shouldNotifyTask(taskDisabled, { status: 'success' }), false);
  assert.equal(shouldNotifyTask(taskDisabled, { status: 'error' }), false);

  const taskAlways = { notifyTelegram: true, onlyOnFailure: false };
  assert.equal(shouldNotifyTask(taskAlways, { status: 'success' }), true);
  assert.equal(shouldNotifyTask(taskAlways, { status: 'error' }), true);

  const taskFailureOnly = { notifyTelegram: true, onlyOnFailure: true };
  assert.equal(shouldNotifyTask(taskFailureOnly, { status: 'success' }), false);
  assert.equal(shouldNotifyTask(taskFailureOnly, { status: 'error' }), true);

  // Fallback to global settings
  const taskInherit = {};
  const globalOnlyFail = { notifyTelegram: true, onlyOnFailure: true };
  assert.equal(shouldNotifyTask(taskInherit, { status: 'success' }, globalOnlyFail), false);
  assert.equal(shouldNotifyTask(taskInherit, { status: 'error' }, globalOnlyFail), true);
});

test('TaskStore settings management and persistence', () => {
  const testPath = path.join('/tmp', `dsh-cron-settings-test-${Date.now()}.json`);
  const store = new TaskStore(testPath);

  const initial = store.getSettings();
  assert.equal(typeof initial, 'object');

  store.saveSettings({
    botToken: 'bot_test_token_123',
    chatId: 'chat_test_id_456',
    notifyTelegram: true,
    onlyOnFailure: true,
  });

  const updated = store.getSettings();
  assert.equal(updated.botToken, 'bot_test_token_123');
  assert.equal(updated.chatId, 'chat_test_id_456');
  assert.equal(updated.notifyTelegram, true);
  assert.equal(updated.onlyOnFailure, true);

  // Reload from disk
  const store2 = new TaskStore(testPath);
  const reloaded = store2.getSettings();
  assert.equal(reloaded.botToken, 'bot_test_token_123');
  assert.equal(reloaded.chatId, 'chat_test_id_456');
  assert.equal(reloaded.notifyTelegram, true);
  assert.equal(reloaded.onlyOnFailure, true);

  try { fs.unlinkSync(testPath); } catch {}
});

test('sendTelegramMessage sends request to Telegram API', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = null;
  let requestedBody = null;

  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    requestedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 999 } }),
    };
  };

  try {
    const res = await sendTelegramMessage({
      botToken: '123:TOKEN',
      chatId: '456',
      text: 'Тест',
      parseMode: 'Markdown',
    });
    assert.ok(res.ok);
    assert.equal(requestedUrl, 'https://api.telegram.org/bot123:TOKEN/sendMessage');
    assert.equal(requestedBody.chat_id, '456');
    assert.equal(requestedBody.text, 'Тест');
    assert.equal(requestedBody.parse_mode, 'Markdown');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
