# Pack 7: Final Audit & Hardening Pack

## Overview
Pack 7 closes all 9 remaining open issues from the comprehensive fleet audit and Master Audit #207 for `@goodandready/dsh-cron`:
- **#219**: Explicit Telegram/Kanban channel selection blocked by legacy flags in `shouldSendToChannel`.
- **#220**: Global `notifyTelegram` and `onlyOnFailure` not inherited by default because `TaskStore` normalized unset task flags to `false`.
- **#224**: Gitea delivery payload sends string label names (`['cron', 'bug']`) instead of integer IDs per Gitea Swagger.
- **#225**: `nodePath` ignored when executing `.js`/`.mjs`/`.cjs` script files (hardcoded `process.execPath`).
- **#229**: Dry-run mutated task status (`paused`), recorded history, reset attempts, and triggered Burn Guard.
- **#233**: Task message template `task.template` ignored; Telegram channel override required global `settings.template`.
- **#235**: Scheduler settings (`maxConcurrent`, `defaultTimezone`, `heartbeatUrl`, `heartbeatIntervalSec`, `llmActionsEnabled`) excluded from `SETTINGS_SYNC_KEYS` in Config scope and live scheduler updates.
- **#237**: Credential resolution `resolveSecrets` in `deliverNotifications` lacked timeout/deadline, potentially blocking task completion forever.
- **#266**: 31 volatile fields and host logging hygiene; host-side logging routing through `ctx.logger` and settings attached via `ctx.inject(['settings'], ...)`.

## Key Technical Changes

### 1. Unified Channel Selection & Filter Precedence (#219)
- In `lib/channels.js`: `shouldSendToChannel` now gives absolute precedence to explicit channel selection (`task.channels`).
- Explicit Telegram inclusion is never blocked by legacy `task.notifyTelegram: false`.
- Explicit Kanban inclusion is never blocked by `task.kanbanMode: 'none'`.
- Only event filters (`onlyOnFailure`, or explicit `task.kanbanMode === 'on_failure'`) determine whether a run triggers notification.

### 2. Tri-state Inheritance for Notification Flags (#220)
- In `lib/store.js`, `lib/task-create.js`, and `lib/api.js`: unset `notifyTelegram` and `onlyOnFailure` are preserved as `undefined` rather than normalized to `false`.
- A task without explicit overrides inherits global settings (`settings.notifyTelegram` and `settings.onlyOnFailure`).
- Explicit `true` or `false` sets an override; `null` or `'inherit'` resets the override back to `undefined` (inherit).

### 3. Gitea API Swagger Schema Compliance (#224)
- In `lib/channels.js`: `buildGiteaIssuePayload` now complies strictly with Gitea OpenAPI Swagger specification `CreateIssueOption.labels: integer[]` (int64 IDs).
- Supports `settings.giteaLabelIds` map (e.g. `{ cron: 1, bug: 2, alert: 3, auto: 4 }`), `settings.giteaLabels`, `task.giteaLabelIds`, and numeric `task.labels`.
- Missing/unmapped string label names are safely omitted to prevent HTTP 422 Unprocessable Entity errors from the Gitea API.

### 4. Node Interpreter Path Resolution for Script Files (#225)
- In `lib/runtimes.js`: `buildNodeInvocation` now respects `task.nodePath` for script files (`.js`, `.mjs`, `.cjs`) as well as inline code, matching `buildPythonInvocation`.
- Defaults to `process.execPath` when `nodePath` is not specified.

### 5. Isolated Read-Only Dry-Run Execution (#229)
- In `lib/scheduler-execution.js`: `executeTask` dry-run branch moved to the immediate start of the execution preamble.
- Dry-run evaluates Burn Guard and preflight checks in read-only mode without mutating task status (never pauses the task), without recording history, and without resetting attempts.
- Guarantees that store JSON, history entries, counters, and settings before and after dry-run are 100% identical.

### 6. Universal Notification Template Precedence (#233)
- In `lib/channels.js`: `messageTextFor` implements strict precedence: `task.template` -> `settings.channelTemplates[channelId]` -> `settings.template` -> built-in defaults.
- Telegram handler uses `messageTextFor('telegram', task, runInfo, settings)` directly, allowing channel-specific templates to function even when global `settings.template` is empty.

### 7. Scheduler Config Scope Synchronization & Live Application (#235)
- In `lib/settings.js`: `defaultTimezone`, `maxConcurrent`, `heartbeatUrl`, `heartbeatIntervalSec`, and `llmActionsEnabled` added to `SETTINGS_SYNC_KEYS`.
- In `lib/index.js`: `POST /dsh-cron/settings` returns HTTP 500 when `applySettingsToScope` yields errors, preventing misleading "Saved" feedback.
- Updates to `maxConcurrent`, `defaultTimezone`, and heartbeat parameters are applied live to `scheduler` and `heartbeatTimer` without requiring a plugin restart.

### 8. Bounded Credential Resolution Deadline (#237)
- In `lib/scheduler-execution.js`: `deliverNotifications` bounds `resolveSecrets` with a deadline timer (`secretTimeoutMs = 5000`).
- If the credential service promise hangs, it times out boundedly, logs a warning, and proceeds to deliver notifications without permanently blocking task completion or queue draining.
- Unreferenced timers and clean promise cleanup prevent lingering event loop handles.

### 9. Host Logging Hygiene & Service Architecture (#266)
- Host-side log calls route through `ctx.logger` via `lib/logger.js`.
- The `settings` service is dynamically injected via `ctx.inject(['settings'], ...)` to ensure that headless DSH environments can start the plugin without crashing, while web environments register the settings card and persist volatile configurations.

## Verification
- 382 unit and integration tests passing (`npm test`, 100% pass).
- CI preflight check passing with 0 failures (`node scripts/ci-preflight.mjs`).
- Client UI bundle rebuilt cleanly (`node scripts/build-client.mjs`).
