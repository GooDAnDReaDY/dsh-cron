/**
 * dsh-cron TUI settings section (#387).
 *
 * Exposes dsh-cron configuration to the terminal settings screen via
 * the host tuiSettingsSections seam.
 */

function numFormat(val, defaultVal = '0') {
  return Number.isFinite(Number(val)) ? String(Number(val)) : defaultVal;
}

function numParse(text, min = 0) {
  const s = String(text ?? '').trim();
  if (s === '') return { kind: 'clear' };
  const v = Number(s);
  return Number.isFinite(v) && v >= min ? { kind: 'set', value: v } : { kind: 'clear' };
}

function textFormat(val) {
  return String(val || '');
}

function textParse(text) {
  const v = String(text || '').trim();
  return v === '' ? { kind: 'clear' } : { kind: 'set', value: v };
}

/**
 * Build declarative settings section for DSH TUI.
 */
export function buildTuiSection({ live, store }) {
  const current = typeof live === 'function' ? live() : (store?.getSettings?.() || {});

  const fields = [
    // 1. Delivery & Alerts
    {
      path: ['botToken'],
      group: 'delivery',
      kind: 'text',
      label: 'Telegram Bot Token',
      secret: { ref: current.botTokenRef || 'TELEGRAM_BOT_TOKEN' },
      hint: 'Stored securely in credential store, never in plain config files.',
    },
    {
      path: ['botTokenRef'],
      group: 'delivery',
      kind: 'text',
      label: 'Bot Token Credential Ref',
      placeholder: 'TELEGRAM_BOT_TOKEN',
      hint: 'Name of the credential holding the Telegram bot token.',
      format: textFormat,
      parse: textParse,
    },
    {
      path: ['chatId'],
      group: 'delivery',
      kind: 'text',
      label: 'Telegram Chat ID',
      placeholder: '-1001234567890',
      hint: 'Chat ID for task execution reports and alerts.',
      format: textFormat,
      parse: textParse,
    },
    {
      path: ['discordWebhookUrl'],
      group: 'delivery',
      kind: 'text',
      label: 'Discord Webhook URL',
      placeholder: 'https://discord.com/api/webhooks/...',
      format: textFormat,
      parse: textParse,
    },
    {
      path: ['slackWebhookUrl'],
      group: 'delivery',
      kind: 'text',
      label: 'Slack Webhook URL',
      placeholder: 'https://hooks.slack.com/services/...',
      format: textFormat,
      parse: textParse,
    },

    // 2. Scheduler & Concurrency
    {
      path: ['defaultTimezone'],
      group: 'scheduler',
      kind: 'text',
      label: 'Default Timezone',
      placeholder: 'UTC',
      hint: 'Default IANA timezone for schedules (e.g. Europe/Moscow, America/New_York, UTC).',
      format: textFormat,
      parse: textParse,
    },
    {
      path: ['maxConcurrent'],
      group: 'scheduler',
      kind: 'number',
      label: 'Max Concurrent Tasks',
      hint: 'Maximum parallel task runs across all schedules (default 2, 0 = unlimited).',
      format: (val) => numFormat(val, '2'),
      parse: (text) => numParse(text, 0),
    },

    // 3. Budgets & Guardrails
    {
      path: ['globalDailyCostLimitUsd'],
      group: 'budgets',
      kind: 'number',
      label: 'Daily Cost Limit (USD)',
      hint: 'Global 24h expenditure limit in USD across all tasks (0 = unlimited).',
      format: (val) => numFormat(val, '0'),
      parse: (text) => numParse(text, 0),
    },
  ];

  return {
    ns: 'dsh-cron',
    title: 'Cron Automations',
    descriptions: {
      en: 'Scheduled tasks, background automation, and notification guardrails.',
      zh: '定时任务、后台自动化与成本防护。',
    },
    groups: [
      { id: 'delivery', title: 'Delivery & Alerts', descriptions: { zh: '推送与告警' } },
      { id: 'scheduler', title: 'Scheduler & Concurrency', descriptions: { zh: '调度与并发' } },
      { id: 'budgets', title: 'Budgets & Guardrails', descriptions: { zh: '预算与防护' } },
    ],
    fields,
  };
}

/**
 * Register TUI settings section if tuiSettingsSections service is provided.
 */
export function applyTuiSettings(ctx, deps) {
  if (typeof ctx?.inject !== 'function') return;
  ctx.inject(['tuiSettingsSections'], (tuiCtx) => {
    let service;
    try {
      service = tuiCtx?.tuiSettingsSections || tuiCtx?.get?.('tuiSettingsSections');
    } catch {
      service = undefined;
    }
    if (!service || typeof service.register !== 'function') return;
    try {
      const section = buildTuiSection(deps || {});
      const dispose = service.register(section);
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          try { dispose?.(); } catch { /* explicit best-effort cleanup */ }
        }, 'dsh-cron: tui settings');
      }
    } catch (error) {
      ctx?.logger?.warn?.('[dsh-cron] Could not register TUI settings: ' + (error?.message || error));
    }
  });
}
