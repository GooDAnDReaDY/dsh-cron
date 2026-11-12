import { logger } from '../logger.js';
import { getDshDefaultTelegramCredentials } from '../telegram.js';

/** Mask a secret for transport to the browser, keeping a readable hint. */
export function maskSecretValue(value) {
  const s = String(value == null ? '' : value);
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-3);
}

/**
 * Raw secret values that must not be stored in plugin settings; the
 * corresponding *Ref credential names are the supported way to configure
 * these channels.
 */
export const FORBIDDEN_SETTING_KEYS = ['giteaToken', 'ntfyToken', 'pushplusToken', 'discordToken', 'slackToken'];

/**
 * Settings that hold a secret and are therefore masked on read: tokens and
 * webhook URLs (the URL embeds the auth token), plus the Bark device key.
 * These are stored in the plugin settings file; the credential-reference
 * fields (botTokenRef, ntfyTokenRef, …) take precedence over them.
 */
export const MASKED_SETTING_KEYS = ['botToken', 'discordWebhookUrl', 'slackWebhookUrl', 'barkKey', 'apiToken', 'telegramWebhookSecret'];

export function getSettings(store) {
  const defaults = getDshDefaultTelegramCredentials();
  const base = { ...store.settings };
  base.botToken = base.botToken !== undefined ? base.botToken : (defaults.botToken || '');
  base.botTokenRef = base.botTokenRef || '';
  base.chatId = base.chatId !== undefined ? base.chatId : (defaults.chatId || '');
  base.notifyTelegram = Boolean(base.notifyTelegram);
  base.onlyOnFailure = Boolean(base.onlyOnFailure);
  base.kanbanBaseUrl = base.kanbanBaseUrl || 'http://127.0.0.1:3000';
  base.hasDefaultCredentials = Boolean(defaults.botToken && defaults.chatId);
  base.llmActionsEnabled = Boolean(base.llmActionsEnabled);
  base.showChatHeaderButton = base.showChatHeaderButton !== undefined ? Boolean(base.showChatHeaderButton) : true;
  base.showChatHeaderActions = base.showChatHeaderActions !== undefined ? Boolean(base.showChatHeaderActions) : true;
  return base;
}

export function getClientSettings(store) {
  const raw = getSettings(store);
  const isCustom = Boolean(store.settings.botToken);
  const hasToken = Boolean(raw.botToken);
  const masked = hasToken ? (raw.botToken.length > 8 ? raw.botToken.slice(0, 4) + '••••••••' + raw.botToken.slice(-3) : '••••••••') : '';
  const { botToken, ...rest } = raw;
  const out = {
    ...rest,
    botToken: masked,
    botTokenMasked: masked,
    hasBotToken: hasToken,
    hasCustomBotToken: isCustom,
  };
  // Webhook URLs and the Bark device key carry an embedded secret, so they
  // are never sent to the browser in clear text either.
  for (const key of MASKED_SETTING_KEYS) {
    if (key === 'botToken') continue;
    out[key] = maskSecretValue(raw[key]);
  }
  return out;
}

export function saveSettings(store, newSettings = {}) {
  const patch = { ...newSettings };

  for (const key of FORBIDDEN_SETTING_KEYS) {
    if (key in patch) {
      logger.warn(`[dsh-cron] refusing to store raw secret "${key}" in settings — use a credential reference instead`);
      delete patch[key];
    }
  }

  let botTokenToSave = store.settings.botToken || '';
  if (patch.botToken !== undefined) {
    const val = String(patch.botToken).trim();
    // If client sends masked token or empty string while custom token existed, don't overwrite with dots
    if (val && !val.includes('••') && !val.includes('****')) {
      botTokenToSave = val;
    } else if (val === '') {
      botTokenToSave = '';
    }
    delete patch.botToken;
  }

  // A masked value echoed back by the UI must never overwrite the real one.
  for (const key of MASKED_SETTING_KEYS) {
    if (key === 'botToken') continue;
    const val = patch[key];
    if (typeof val === 'string' && (val.includes('••') || val.includes('****'))) {
      delete patch[key];
    }
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete patch[key];
    else if (typeof value === 'string') patch[key] = value.trim();
  }

  const prevSettings = store.settings;
  store.settings = {
    ...store.settings,
    ...patch,
    botToken: botTokenToSave,
    kanbanBaseUrl: patch.kanbanBaseUrl !== undefined
      ? (patch.kanbanBaseUrl || 'http://127.0.0.1:3000')
      : (store.settings.kanbanBaseUrl || 'http://127.0.0.1:3000'),
    notifyTelegram: patch.notifyTelegram !== undefined ? Boolean(patch.notifyTelegram) : Boolean(store.settings.notifyTelegram),
    onlyOnFailure: patch.onlyOnFailure !== undefined ? Boolean(patch.onlyOnFailure) : Boolean(store.settings.onlyOnFailure),
    llmActionsEnabled: patch.llmActionsEnabled !== undefined ? Boolean(patch.llmActionsEnabled) : Boolean(store.settings.llmActionsEnabled),
    showChatHeaderButton: patch.showChatHeaderButton !== undefined ? Boolean(patch.showChatHeaderButton) : (store.settings.showChatHeaderButton !== undefined ? Boolean(store.settings.showChatHeaderButton) : true),
    showChatHeaderActions: patch.showChatHeaderActions !== undefined ? Boolean(patch.showChatHeaderActions) : (store.settings.showChatHeaderActions !== undefined ? Boolean(store.settings.showChatHeaderActions) : true),
  };
  if (store._readOnly || store._loadFailed) {
    logger.warn(`[dsh-cron] store is in read-only recovery mode; updated in-memory settings but skipped writing to "${store.filePath}".`);
    return getSettings(store);
  }
  try {
    store.save();
  } catch (err) {
    store.settings = prevSettings;
    throw err;
  }
  return getSettings(store);
}
