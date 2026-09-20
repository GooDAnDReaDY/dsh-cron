# Changelog

Notable changes to `@goodandready/dsh-cron`.

## 0.2.22

### Added
- **Task Chaining Context & Dynamic Prompt Variables** (#171):
  Tasks can interpolate execution variables into prompts at runtime, including
  `{{date}}`, `{{time}}`, `{{datetime}}`, `{{timestamp}}`, `{{year}}`, `{{month}}`,
  `{{day}}`, `{{taskId}}`, `{{taskName}}`, and `{{runCount}}`. Chained downstream
  tasks consume upstream outputs and status via `{{prev.output}}`, `{{prev.taskId}}`,
  and `{{prev.status}}` (with corresponding `$DSH_PREV_*` environment variables for shell tasks).
- **Token & Cost Burn Guard** (#173):
  Enforce strict per-task budget controls via `costLimitUsd`, `dailyCostLimitUsd`, and
  `tokenLimit`. Automatically pauses offending tasks with a descriptive `pausedReason`
  and dispatches alerts across configured notification channels.
- **Interactive Telegram Bot Commands** (#175):
  Manage and inspect scheduled tasks remotely via Telegram bot webhook
  (`/dsh-cron/api/telegram-webhook`). Supports `/status`, `/tasks`, `/run <id>`,
  `/pause <id>`, `/resume <id>`, `/log <id>`, and `/help`. Authenticated via `telegramAllowedChatIds`.
- **Quick Schedule Presets & Paused Reason UI** (#177):
  Modal form provides quick one-click schedule presets (`15m`, `1h`, `Daily 09:00`,
  `Weekdays`, `Weekly Mon`) with natural-language preview, and task cards display
  warning badges for guard-paused tasks.

## 0.2.21

### Fixed
- **Settings reachable again on the plugin's own page**: the current DSH core
  (0.1.6-alpha.2) renders a plugin's configuration page only for entries registered
  in the plugin-list seat `plugins.item`. The view-aware settings card is now
  registered there (`id: 'dsh-cron'`, order 60, static label); the row seat and the
  legacy `settings.plugin.item` seat stay as fallbacks, and the rule from #102 (no
  top-level section fallback) is preserved. Sources edited in `lib/client-src`,
  `lib/client.js` rebuilt.

## 0.2.20

### Fixed
- **Settings reachable again**: the card registered into `settings.plugin.item`, a
  slot the current DSH core (0.1.6-alpha.2) no longer renders, so the plugin's
  settings were unreachable. The surface now registers into the Plugins page row
  seat `plugins.row.config` first, keyed `@goodandready/dsh-cron#dsh-cron`
  (`rowConfigKey(package, rowId)`): the plugin's row gains a configure control whose
  page is the settings form (`view: 'page'`, open and without our card chrome — the
  host page draws the title, icon, crumb and padding) plus a one-line state for
  `view: 'summary'`. The legacy seat stays registered as a fallback, and the rule
  from #102 (no top-level section fallback) is preserved.
- The card contract test (#100) now expects the head to honour the row-seat page
  view as well as the local collapse state.

### Added
- This changelog.
