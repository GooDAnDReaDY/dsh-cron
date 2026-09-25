# Changelog

Notable changes to `@goodandready/dsh-cron`.

## 0.2.28

### Security & Hardening
- **HTTP Source Guard & Remote Caller Verification** (#86):
  Hardened incoming request validation (`isTrustedRequest`). Non-loopback remote callers are rejected with `403 Forbidden` unless authenticated via `Authorization: Bearer <token>` or `x-dsh-cron-token`. Browser requests strictly require matching `Host` and `Origin` headers, disallow `Origin: null`, and enforce `Sec-Fetch-Site` (`same-origin` or `none`).
- **Heartbeat Endpoint Method Enforcement** (#86):
  Restricted `/dsh-cron/heartbeat-ping/:id` and `/dsh-cron/tasks/:id/heartbeat` endpoints strictly to the `POST` HTTP method, returning `405 Method Not Allowed` for any other methods. Caller validation prevents remote unauthorized heartbeat registration.
- **Task Secret Redaction & In-Place Restoration** (#86):
  Redacted sensitive values (`env` variables, `httpHeaders` values, and `httpBody` payload) with `'[REDACTED]'` in all task `GET` responses (`/dsh-cron/tasks` and `/dsh-cron/tasks/:id`). When updating existing tasks via `POST` or `PATCH`, any `'[REDACTED]'` values in the payload seamlessly retain their original secret values in storage.

## 0.2.27

### Fixed & Reliability
- **Safe optional Cordis service resolution for agent presets** (#192, GitHub #2):
  Replaced bare property access `ctx.agentPresets` in scheduled task runner (`lib/runner.js`) and chat starter (`lib/chat-start.js`) with safe dynamic service lookup `(typeof ctx.get === 'function' ? ctx.get('agentPresets') : ctx.agentPresets)`. This prevents Cordis Proxy traps from throwing `cannot get property "agentPresets" without inject` when the optional `agentPresets` service is not registered in the host environment, allowing the graceful fallback to operate as designed.

## 0.2.26

### Fixed & Compatibility
- **Producer-owned source kinds on DSH format v4** (#189):
  Migrated durable agent followup messages in scheduled tasks, resumed sessions (`lib/runner.js`), interactive chat setup (`lib/chat-start.js`), and helper calls (`lib/llm-ask.js`) to producer-owned source kinds (`{ kind: 'plugin:dsh-cron', form: '...' }`). This eliminates `SessionFormatError: format v4 message requires a producer-owned source kind` on `@deepseek-ai/dsh-session-format-v3-to-v4`.

## 0.2.25

### Fixed
- **Client fiber on current DSH** (#186): the browser client no longer injects `settingsScope`. Current DeepSeek Harness does not provide that service, so the fiber stayed pending and the cron UI never mounted. Host settings already use the native config editor.

## 0.2.24

### Fixed & Compatibility
- **DSH 0.1.7 Settings Migration & Schema Projections** (#184):
  Removed obsolete `sctx.settings.register` invocation, eliminating the `sctx.settings.register is not a function` warning/error on DeepSeek Harness 0.1.7 (`@deepseek-ai/dsh@0.1.7-alpha.1`).
  Declared editable settings in `Config` schema with `.volatile()` so native DSH 0.1.7 config editor projects and edits fields live via `configEditor.edit()`.
  Introduced `unwrapConfig` Proxy helper for transparent access to volatile values across scheduler and delivery transports.
  Made the `settings` service optional in plugin injection.
  Synchronized configuration writes between `TaskStore` and DSH 0.1.7 `settings.update('dsh-cron', patch)`.

## 0.2.23

### Performance & Optimizations
- **Debounced Asynchronous Storage & Compact History Archive** (#179):
  Coalesced state saves (`scheduleSave(50)`) for run completions eliminate Node.js
  event loop blocking during high-frequency execution ticks. Added synchronous `flushSync()`
  for process termination and testing. Throttled `.bak` generation to at most once per 60s
  and optimized `tasks-history-archive.json` to compact JSON.
- **Throttled Sidebar MutationObserver** (#180):
  Optimized sidebar jobs DOM observer with immediate short-circuiting when connected and
  coalesced DOM checks into `requestAnimationFrame`, eliminating UI stutter and DOM-thrashing
  during fast LLM token streaming in chat.

### Fixed & Hardened
- **Pre-flight Budget Gate & Notification Error Logging** (#181):
  Added synchronous pre-flight budget validation before starting task executions: tasks
  that have already exceeded cumulative spend, 24h rolling budget, or token limits are
  auto-paused immediately without launching expensive LLM runs. Notification errors
  during Burn Guard triggers are now properly captured and logged via `bestEffort`.
- **Client Source Modularity** (#182):
  Decomposed `52-cron-screen-actions.js` (586 lines) into two focused sub-modules
  (`52-cron-screen-actions.js` 226 lines, `53-cron-screen-modal-actions.js` 360 lines),
  bringing all client source modules comfortably within standard limits (<450 lines).

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
