import z from '@deepseek-ai/schemastery';
import { credentialRefStatus } from './secrets.js';
import { TaskStore } from './store.js';
import { MIN_DELIVERY_TIMEOUT_MS, resolveDeliveryTimeoutMs } from './channels.js';

// Polyfill Schema.prototype.volatile for schemastery < 3.18.3 environments
if (typeof z.prototype?.volatile !== 'function') {
  z.prototype.volatile = function volatile() {
    if (this.meta && this.meta.volatile) throw new TypeError('volatile schema is already wrapped');
    return typeof this.extra === 'function' ? this.extra('volatile', true) : this;
  };
}

export const Config = z.object({
  botToken: z.string().role('secret').default('').description('Legacy Telegram Bot API token (prefer botTokenRef with the DSH credentials service)').volatile(),
  botTokenRef: z.string().default('').description('Name of the DSH credential that holds the Telegram bot token').volatile(),
  chatId: z.string().default('').description('Telegram chat ID that receives task reports').volatile(),
  notifyTelegram: z.boolean().default(false).description('Deliver task reports to Telegram for every task').volatile(),
  onlyOnFailure: z.boolean().default(false).description('Deliver reports only for failed runs').volatile(),
  kanbanBaseUrl: z.string().default('http://127.0.0.1:3000').description('Base URL of the dsh-kanban HTTP API').volatile(),
  defaultTimezone: z.string().default('').description('Default IANA time zone for schedules (empty = server local)').volatile(),
  maxConcurrent: z.number().default(0).description('Max parallel task runs (0 = unlimited)').volatile(),
  heartbeatUrl: z.string().default('').description('Dead man\'s snitch URL pinged on the heartbeat interval').volatile(),
  heartbeatIntervalSec: z.number().default(0).description('Heartbeat ping interval in seconds (0 = off)').volatile(),
  // --- Delivery channels (#20-#23, #26, #28, #47) ---
  template: z.string().default('').description('Global notification template; placeholders: {title} {status} {output} {error} {duration} {schedule} {time} {tokens} {cost}').volatile(),
  channelTemplates: z.object({}).default({}).description('Per-channel template overrides keyed by channel id').volatile(),
  silentRuleModel: z.string().default('').description('Model used to evaluate a task silent rule (empty = the task model)').volatile(),
  inspectorModel: z.string().default('').description('Model used to diagnose failed runs (empty = the task model)').volatile(),
  deliveryTimeoutMs: z.number().min(MIN_DELIVERY_TIMEOUT_MS).default(15000).description('Per-channel delivery timeout in ms (minimum 1000); a slower endpoint is recorded as a failure and does not block other channels or the next tick').volatile(),
  discordWebhookUrl: z.string().default('').description('Discord webhook URL').volatile(),
  slackWebhookUrl: z.string().default('').description('Slack incoming webhook URL').volatile(),
  ntfyUrl: z.string().default('https://ntfy.sh').description('ntfy server base URL').volatile(),
  ntfyTopic: z.string().default('').description('ntfy topic for push notifications').volatile(),
  ntfyTokenRef: z.string().default('').description('Credential name for the ntfy access token').volatile(),
  barkServerUrl: z.string().default('https://api.day.app').description('Bark server base URL').volatile(),
  barkKey: z.string().default('').description('Bark device key').volatile(),
  pushplusTokenRef: z.string().default('').description('Credential name for the PushPlus token').volatile(),
  pushplusUrl: z.string().default('https://www.pushplus.plus/send').description('PushPlus send endpoint (override for a self-hosted proxy)').volatile(),
  ttsBaseUrl: z.string().default('http://127.0.0.1:3080').description('Base URL of the harness used to reach the dsh-tts speak route').volatile(),
  giteaBaseUrl: z.string().default('').description('Gitea base URL for alert issues').volatile(),
  giteaRepo: z.string().default('').description('Gitea repository (owner/name) for alert issues').volatile(),
  giteaTokenRef: z.string().default('').description('Credential name for the Gitea API token').volatile(),
  prReviewerEnabled: z.boolean().default(false).description('Enable automated PR Reviewer scheduled agent (#33)').volatile(),
  // --- Declarative jobs (#50, ADR-0001) ---
  jobs: z.array(z.any()).default([]).description('Static jobs owned by the config; each entry needs id, title, schedule and (for agent types) prompt'),
  // --- External REST API (#54, ADR-0001) ---
  apiToken: z.string().role('secret').default('').description('Bearer token for the external /dsh-cron/api/* surface (empty = the surface answers 503)').volatile(),
});


/**
 * Unwrap a volatile config reference or wrap a config object in a transparent Proxy.
 */
export function unwrapConfigValue(val) {
  if (val && typeof val === 'object' && typeof val.get === 'function') {
    return val.get();
  }
  return val;
}

export function unwrapConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  if (typeof cfg.get === 'function') return unwrapConfig(cfg.get());
  return new Proxy(cfg, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (val && typeof val === 'object' && typeof val.get === 'function') {
        return val.get();
      }
      return val;
    }
  });
}

export const SETTINGS_SYNC_KEYS = [
  'botToken', 'botTokenRef', 'chatId', 'notifyTelegram', 'onlyOnFailure', 'kanbanBaseUrl',
  'template', 'channelTemplates', 'deliveryTimeoutMs', 'silentRuleModel', 'inspectorModel',
  'discordWebhookUrl', 'slackWebhookUrl',
  'ntfyUrl', 'ntfyTopic', 'ntfyTokenRef',
  'barkServerUrl', 'barkKey',
  'pushplusTokenRef',
  'pushplusUrl',
  'ttsBaseUrl',
  'giteaBaseUrl', 'giteaRepo', 'giteaTokenRef', 'prReviewerEnabled',
  'apiToken',
];

/**
 * Apply settings writes through the registered settings scope so the core
 * snapshot stays authoritative (#102). Returns null when the settings
 * service is unavailable (headless profiles fall back to store-only writes).
 */
export async function applySettingsToScope(settingsTarget, body) {
  if (!settingsTarget) return null;
  // DSH 0.1.7: SettingsForms service has update(ns, patch)
  if (typeof settingsTarget.update === 'function') {
    try {
      const patch = {};
      for (const key of SETTINGS_SYNC_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          patch[key] = body[key];
        }
      }
      await settingsTarget.update('dsh-cron', patch);
      return [];
    } catch (e) {
      return ['dsh-cron: ' + ((e && e.message) || e)];
    }
  }
  // Legacy / mock scope with set(key, value)
  if (typeof settingsTarget.set === 'function') {
    const errors = [];
    for (const key of SETTINGS_SYNC_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      try {
        await settingsTarget.set(key, body[key]);
      } catch (e) {
        errors.push(key + ': ' + ((e && e.message) || e));
      }
    }
    return errors;
  }
  return null;
}

/**
 * Drop values that must never re-enter the store from the client:
 *
 * - a masked secret echoed back by the settings UI would overwrite the real
 *   value (bot token, webhook URLs, Bark key);
 * - the raw credential keys are refused outright — the *Ref fields are the
 *   supported way to configure them.
 *
 * Applied before both the settings scope and the store, because the scope is
 * the source of truth and would otherwise persist a raw or masked value.
 */
export function sanitizeSettingsPayload(body) {
  const payload = Object.assign({}, body);
  for (const key of TaskStore.MASKED_SETTING_KEYS) {
    const val = payload[key];
    if (typeof val === 'string' && (val.includes('••') || val.includes('****'))) {
      delete payload[key];
    }
  }
  for (const key of ['botTokenRef', 'barkKeyRef', 'giteaTokenRef']) {
    if (key in payload && typeof payload[key] === 'string' && payload[key].trim()) {
      const refCheck = credentialRefStatus(payload[key]);
      if (!refCheck.ok) {
        console.warn(`[dsh-cron] invalid credential reference in "${key}": ${refCheck.error}`);
        delete payload[key];
      }
    }
  }
  for (const key of TaskStore.FORBIDDEN_SETTING_KEYS) {
    if (key in payload) {
      console.warn(`[dsh-cron] refusing raw secret "${key}" from the client — use a credential reference`);
      delete payload[key];
    }
  }
  if ('deliveryTimeoutMs' in payload) {
    const raw = payload.deliveryTimeoutMs;
    const n = Number(raw);
    if (raw === '' || raw === null || !Number.isFinite(n) || n <= 0) {
      delete payload.deliveryTimeoutMs;
    } else {
      payload.deliveryTimeoutMs = resolveDeliveryTimeoutMs(n);
    }
  }
  return payload;
}

