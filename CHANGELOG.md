# Changelog

## 0.2.40 (2026-10-03)

- **Security (Safe File Permissions, #222)**: Storage files (`tasks.json`, `.bak`, `.tmp`, `tasks-history-archive.json`) are strictly written with `0600` mode (`-rw-------`), and storage directory with `0700` mode (`drwx------`). Pre-existing loose permissions are automatically remediated during initialization and saves.
- **Performance & Tech-Debt (Non-Blocking Async Persistence, #244)**: `TaskStore.scheduleSave()` now persists via an asynchronous serialization queue (`fs.promises`) with snapshot versioning (`_saveVersion`, `_lastWrittenVersion`) and atomic rename, eliminating main-thread event loop blocks (~100ms) on large historical stores (~21MB). Synchronous `save()` and `flushSync()` remain available for transaction rollbacks and shutdown guarantees.
- **Security & UI (Honest Transfer Disclosures & Sanitized Export, #240)**: `GET /dsh-cron/tasks/export?sanitize=true` provides a sanitized configuration export that strips secret-bearing fields (`env`, `httpHeaders`, `httpBody`). UI prompts in EN/ZH clearly distinguish between sanitized and raw exports. `validateImportDocument` now strips dummy mask placeholders (`••••••••`) to prevent them from becoming literal secrets.
- **WebUI (Dry-Run & Archive Modal Field Alignment, #241)**: Dry-run modal now directly reads top-level HTTP response fields (`status`, `output`, `durationMs`, `preflight`, `error`). Archive modal now appends newly loaded runs on pagination (`offset > 0`) instead of replacing the page.
- **WebUI (Action Error Handling & Fetch Race Prevention, #242)**: `handleToggleTask` and `handleRunNow` verify HTTP response status codes and display user-visible alerts on 403, 409, and 500 errors. Added optimistic state rollback if a run trigger fails. Implemented a generation counter (`fetchGenRef`) in `fetchTasks` to prevent stale search/filter responses from overwriting current data.
- **Hygiene (Clean Public GitHub Mirror Trees, #246)**: Added `.gitea` to `publish.sh` exclusions and `.gitattributes` export-ignore, guaranteeing that internal Gitea CI workflow files never leak into public GitHub mirror trees.
- **Documentation (Test Environment Sync, #245)**: Updated `index.md` and `AGENTS.md` clean worktree setup commands to use `croner@^10.0.1`.
- **Test**: Added `test/pack6-ui-storage.test.mjs` (8 unit tests covering all 7 issues). Total 373/373 tests passing (0 failures).

## 0.2.36 (2026-10-02)

- **Agent Runner (Real Turn Output & Terminal Status, #227)**: `_executeAgentTurn` now captures the session sequence boundary (`startSeq`), extracts true assistant message text from turn events (`assistant/message`) while isolating previous turns in persistent sessions, and validates terminal turn status (`turn/end` errors or interruptions) to fail the run accordingly.
- **Accounting (Session Event Token & Cost Extraction, #228)**: `_extractUsage` aggregates actual token consumption directly from session stream events (`assistant/message`, `assistant/chunk` usage, and `assistant/attempt`), accounting for uncached input, cached reads, output tokens, and paid failed attempts across retries.
- **Burn Guard (Rolling 24h Cost Ledger, #221)**: Implemented an independent rolling 24-hour cost ledger (`task.costLedger`) persisted in `store.json`. Expenses remain fully counted across archive rotations (even when history exceeds the 100-run active display window) and survive daemon restarts.
- **Scheduler (Context-Preserving Queues, #216)**: Both the global concurrency queue and task overlap queue retain full immutable execution options (`chainDepth`, `prevOutput`, `prevTaskId`, `prevStatus`, `prevCostUsd`). When queued runs drain, options are forwarded to preserve chaining context.
- **Scheduler (Croner Overlap Policy Delegation, #218)**: Removed `protect: true` from Croner instantiation so scheduled cron ticks fire into scheduler's `beginRun` overlap policy (`skip` with history logging, `queue` with delayed execution, `replace` with clean abort).
- **Automation (Recursion-Bounded Structured LLM Actions, #230)**: `trigger_task` action directives enforce a unified recursion ceiling (`chainDepth < 4`, maximum 5 chain links), preventing unbounded loops from self-triggering tasks or cyclical directive chains, with rejections recorded in execution history.
- **Test**: Added `test/agent-accounting-pack3.test.mjs` (7 unit tests covering all 6 audit issues). Total 346/346 tests passing (0 failures).

## 0.2.35 (2026-10-02)

- **Durability (State Consistency, #215)**: `finishRun` now refetches live task records from store before updating completion state, preventing resurrection of deleted tasks and preserving concurrent user edits made during execution.
- **Durability (Shutdown Execution Guarantees, #217)**: `stopAll` drains and empties the concurrency queue immediately, marks scheduler stopped, and clears pending retry timers to guarantee no jobs or retries execute after shutdown.
- **Durability (Atomic Persistence & Rollback, #223)**: `TaskStore.save()` re-throws disk write failures (ENOSPC, EACCES, EIO); in-memory task, settings, and heartbeat mutations rollback on save errors; REST API endpoints return HTTP 500 with rollback details.
- **Durability (Shutdown Debounce Flush, #243)**: `scheduler.stopAll()` and plugin lifecycle disposal hook synchronously invoke `store.flushSync()`, guaranteeing pending run history, costs, and token counters are persisted to disk before process exit or reload.
- **Test**: Added `test/state-durability-pack2.test.mjs` (11 unit tests covering all 4 durability and shutdown vectors). Total 339/339 tests passing (0 failures).

## 0.2.34 (2026-10-02)

- **Release**: Version bump to 0.2.34 for public release.
- **Security (Telegram Webhook, #208)**: Added "X-Telegram-Bot-Api-Secret-Token" validation, fail-closed handling for empty "allowedChatId", replay prevention via "update_id" deduplication, and protected config-owned tasks from modification via Telegram.
- **Security (Code Confirmation, #212)**: Extended code execution detection to shell hooks ("preflightCommand", "preflightType: 'command'", "selfHealingCommand", "command"), enforcing confirmation headers on create, patch, import, and UI.
- **Security (Docker Isolation, #226)**: Isolated container environment in Docker runtime, preventing host process environment secrets from leaking into container process arguments.
- **Security (Worktree & Workspace Fail-Closed, #231)**: Enforced fail-closed behavior on workspace resolution and worktree creation, aborting tasks cleanly rather than falling back into base workspace.
- **Test**: Added "test/security-pack1-audit.test.mjs" (10 unit tests for all 4 security vectors). Total 328/328 tests passing.

## 0.2.33 (2026-10-02)

- **Security Pack 1**: Internal release candidate.

- **Security (Telegram Webhook, #208)**: Added `X-Telegram-Bot-Api-Secret-Token` validation, fail-closed handling for empty `allowedChatId`, replay prevention via `update_id` deduplication, and protected config-owned tasks from modification via Telegram.
- **Security (Code Confirmation, #212)**: Extended code execution detection to shell hooks (`preflightCommand`, `preflightType: 'command'`, `selfHealingCommand`, `command`), enforcing confirmation headers on create, patch, import, and UI.
- **Security (Docker Isolation, #226)**: Isolated container environment in Docker runtime, preventing host process environment secrets from leaking into container process arguments.
- **Security (Worktree & Workspace Fail-Closed, #231)**: Enforced fail-closed behavior on workspace resolution and worktree creation, aborting tasks cleanly rather than falling back into base workspace.
- **Test**: Added `test/security-pack1-audit.test.mjs` (10 unit tests for all 4 security vectors). Total 328/328 tests passing.

## 0.2.32 (2026-10-01)

- **Fix (Client)**: Fixed typo `r1.timestamp` -> `r.timestamp` in Execution Archive modal date expression (reported by @netweaver in GitHub Issue #3).
- **Test**: Added unit test in `test/automation-observability-pack.test.mjs` verifying timestamp fallback handling for `r.at`, `r.timestamp`, and `r.startedAt`.

Notable changes to `@goodandready/dsh-cron`.

## 0.2.30

### Fixed & Reliability
- **Settings Card Dynamic Versioning** (#199):
  Removed hardcoded fallback version in `CronSettingsCard`. The card now retrieves the current installed version dynamically from the server via `/dsh-cron/settings` and the updater service.
- **Strict HTTP Method Enforcement (405 Method Not Allowed)** (#200):
  Enforced HTTP GET method on `/dsh-cron/heartbeat` and `/dsh-cron/models`. Non-GET requests are rejected with `405 Method Not Allowed` and an `Allow: GET` header.
- **Export/Import Route Precedence & Method Validation** (#201):
  Fixed routing conflict on `/tasks/export` and `/tasks/import` where invalid HTTP methods previously fell through to the dynamic `/tasks/:id` route, incorrectly returning 404. Non-GET export and non-POST import requests now immediately return `405 Method Not Allowed`.

### Refactoring & Code Quality
- **Dead Export Cleanup** (#202):
  Removed obsolete unused module exports `createTaskParameters` and `createTaskOutput` from `lib/index.js`, left behind from the legacy split tool implementation.
- **DSH Theme Semantic Token Adoption** (#203):
  Replaced 80 hardcoded hex color values across client modules (`styles`, `modal-dialogs`, `modal-task-form-tail`, `settings-card`) with official DSH theme variables (`var(--dsw-alias-...)`, `var(--dsh-cron-...)`). Bundle hex count reduced to 0.
- **Cordis Context Logging Migration** (#204):
  Replaced 72 direct `console.*` calls across 14 server modules with unified Cordis context logging (`ctx.logger`) via singleton `lib/logger.js`.

## 0.2.29

### Performance & Tooling Architecture
- **Unified Model Tool Consolidation** (#196):
  Consolidated 9 separate model tools (`cron_create_task`, `cron_schedule_task`, `cron_list_tasks`, `cron_pause_task`, `cron_resume_task`, `cron_delete_task`, `cron_run_task`, `cron_get_task`, `cron_update_task`) into 1 unified tool `cron` with `action`: `create`, `list`, `get`, `update`, `pause`, `resume`, `run`, `delete`. Reduces model tool schema footprint by ~88% (~13.6k characters down to ~1.5k characters), eliminating context window bloat across all DSH sessions.
- **Separation of Concerns with DSH Core Schedule** (#196):
  Simple in-chat reminders and timed prompts belong to built-in `@deepseek-ai/dsh-schedule` (`schedule_create`). In tool descriptions and agent prompts (`lib/prompt.js`, `lib/client-src/52-cron-screen-actions.js`), models are instructed to delegate in-chat reminders to `schedule_create` and reserve `cron` for unattended background automation in separate isolated sessions, shell/code runtimes (`script`, `node`, `python`, `http`, `ssh`, `docker`), git worktree isolation, multi-channel delivery, cost guards, and failure monitoring.
- **Graceful Legacy Migration**:
  Calls with legacy tool names or legacy actions are intercepted and rejected with informative migration hints directing the agent to `cron` with the corresponding `action`.
- **DSH Core schedule vs dsh-cron Documentation**:
  Added comparison table and consolidated tool documentation in `README.md`, `README.ru.md`, and `README.zh.md`. Updated `package.json` description and `docs/design/DESIGN.md` contract.

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
