# Changelog

## 0.2.44 (2026-10-04)

- **Config & Declarative Jobs (Schemastery Volatile Box Deep Unwrap, #282)**: Added recursive `plainConfig()` export in `lib/settings.js` and `lib/index.js` to deeply unwrap Cosmokit/Schemastery Volatile boxes around `config.jobs`, `maxConcurrent`, `defaultTimezone`, and other profile fields. Guarantees declarative profile jobs are unwrapped into plain arrays and scheduled properly upon startup and volatile updates.
- **Storage & Concurrency (Conditional ENOENT Ignore on Async Rename, #244)**: Hardened `TaskStore.saveAsync()` rename error handling to only ignore `ENOENT` when an in-flight temporary file was actively unlinked by a newer concurrent synchronous save (`_lastSyncVersion >= version`). Unexpected filesystem `ENOENT` errors without newer sync saves are strictly re-thrown.
- **WebUI & Network Reliability (Abort Propagation on JSON Body Reading, #242)**: Updated `fetchJsonWithTimeout` in `52-cron-screen-actions.js` to avoid swallowing `AbortError` during `res.json()` parsing, ensuring hung response streams cleanly trigger timeout rejection and unlock optimistic UI buttons.
- **Lifecycle & Testing (Test Heartbeat Timer Cleanup, #280)**: Updated `test/pack9-verification.test.mjs` to capture and invoke the lifecycle effect disposer in `t.after()`, guaranteeing no lingering heartbeat ping timers remain active in the event loop after test execution.
- **Documentation (Version Consistency Across index.md and AGENTS.md, #245)**: Synchronized package version to `0.2.44` across `index.md`, `AGENTS.md`, and `package.json`.
- **Test**: Added `test/pack10-verification.test.mjs` (6 unit tests). Total 406/406 tests passing (100% pass, 0 failures, clean preflight).

## 0.2.43 (2026-10-04)

- **Storage & Test Isolation (Config cronDir & Store Isolation, #280)**: `apply(ctx, rawConfig)` passes `config.cronDir` / `config.storePath` directly to `TaskStore(storePath)` instead of falling back to default user data directory. Unit tests isolate `process.env.DSH_DATA_DIR = tmpDir` with automatic cleanup in `t.after`.
- **Mirror & GitHub Packaging (Sanitized Commit Tagging, #246)**: `scripts/publish-github.sh` accepts `--tag` and pushes the tag referencing the sanitized mirror commit (`$new_commit:refs/tags/$tag`) directly to GitHub. `publish.sh` delegates tag creation without swallowing errors (`|| true`), guaranteeing public tags never point to internal Gitea repository commits.
- **Documentation & History (AGENTS.md Version Traceability, #245)**: Restored historical release notes and PR tracking for `0.2.8` (2026-09-11, PR #132) while updating current active release status to `0.2.43`.
- **Storage & Concurrency (Sync Save Unlink Race & Compact Serialization, #244)**: Synchronous `save()` records `_lastSyncVersion` and actively removes any in-flight asynchronous `.tmp` file using `bestEffort`. In-flight `saveAsync()` skips renaming if a newer synchronous save took place or ignores `ENOENT` on missing tmp. Switched `saveAsync()` to compact JSON serialization without indentation to eliminate main-thread event loop lag on large stores (~21MB).
- **WebUI & Network Reliability (Complete Action Request Timeout Coverage, #242)**: Implemented `fetchJsonWithTimeout` wrapping both HTTP headers and `res.json()` stream reading within a strict 15s deadline and `AbortController`. Prevents pending toggle and run-now button locks from freezing the interface on hung server responses.
- **Settings & Cordis Lifecycle (Plugin Loader Volatile Path Array Support, #235)**: Updated `syncVolatileConfig` in `lib/index.js` to recognize string arrays of modified property names emitted by `cordis-plugin-loader`, correctly pulling the live configuration from `ctx.config` and synchronizing scheduler and store settings without runtime errors.
- **LLM Runner & Settlement (Quiescence Verification & Terminal Turn Enforcement, #227)**: Enhanced `_executeAgentTurn` to strictly require terminal turn events (`turn/end`) when session event logs are available. Turn quiescence with 0 events or incomplete event streams without terminal completion fails immediately with `turnFailed: true`.
- **Test**: Added `test/pack9-verification.test.mjs` (8 unit tests). Total 400/400 tests passing (100% pass, 0 failures, clean preflight).

## 0.2.42 (2026-10-04)

- **Lifecycle (BestEffort Disposer Resilience, #275)**: Imported `bestEffort` in `lib/index.js` lifecycle disposer, preventing `ReferenceError: bestEffort is not defined` during Cordis context disposal and plugin unmount.
- **Settings & Schemas (Schemastery Volatile Ref Compatibility, #276)**: Enhanced configuration unwrapping and test assertions to transparently support Schemastery 3.18.4 cosmokit reactive volatile refs (`.get()`), preserving seamless compatibility across Schemastery minor versions.
- **Runtimes & SSH (Remote Profile Resolution via Settings Inspection, #273)**: Resolved SSH task `sshProfileId` credentials by inspecting `settings.describe()` namespace records (`dsh-remote-workspace`) instead of invoking non-existent `settings.get()`, restoring remote execution capabilities.
- **Security & Webhooks (Fail-Closed Telegram Webhook Authentication, #208)**: Enforced strict fail-closed rejection (HTTP 401 Unauthorized) when `webhookSecret` is not configured, eliminating unauthorized command execution risks on unconfigured instances.
- **LLM Runner (Terminal Settlement & Blocked Turn Rejection, #227)**: Hardened agent turn settlement: turns concluding with `reason.kind === 'blocked'` or missing terminal completion events are rejected as failures with descriptive error states.
- **Accounting & Cost Guard (Assistant Stream Record Ingestion & Failure Retention, #228)**: Ingested `assistant/attempt` stream chunk usage in `_extractUsage` and preserved token usage and dollar costs on failed turns, ensuring Burn Guard budgets accurately reflect model consumption.
- **Settings & Live Sync (Volatile Config In-Memory & Store Sync, #235)**: Registered `loader/volatile-update` listener in `lib/index.js` to dynamically propagate volatile configuration updates to the active scheduler, heartbeat timers, and persistent settings.
- **WebUI (Action Request Deadlines & Abort Safety, #242)**: Equipped `handleToggleTask` and `handleRunNow` with `AbortController` and a 15-second deadline, guaranteeing pending button states and optimistic UI locks cleanly resolve on slow or timed-out requests.
- **Storage & Concurrency (Monotonic Save Ordering & Sync/Async Race Prevention, #244)**: Added monotonic disk version tracking (`_lastWrittenVersion`) to `TaskStore` to prevent stale asynchronous renames from overwriting newer synchronous saves during rapid store mutations.
- **Documentation (Peer Dependencies & Environment Command Parity, #245)**: Synchronized version facts, peer dependency ranges (`^0.2.0 || ^0.3.0 || ^0.4.0`), client build commands (`node scripts/build-client.mjs`), and timezone resolution hierarchies across `README.md`, `AGENTS.md`, and `index.md`.
- **Hygiene & Release Automation (Unified Mirror Packaging, #246)**: Delegated `publish.sh` to `scripts/publish-github.sh` allowlist builder with explicit `.gitea` exclusion, ensuring reproducible and clean GitHub mirror releases.
- **Test**: Added `test/pack8-audit-reverification.test.mjs` (9 comprehensive unit tests). Total 392/392 tests passing (100% pass, 0 failures).

## 0.2.41 (2026-10-03)

- **Channels (Explicit Priority & Event Decoupling, #219)**: Explicit per-task channel selection (`task.channels`) now takes strict precedence over legacy task flags. An explicitly chosen Telegram channel is never blocked by `task.notifyTelegram: false`, and an explicitly chosen Kanban channel is never blocked by `task.kanbanMode: 'none'`. Event filters (`onlyOnFailure`, or explicit `kanbanMode: 'on_failure'`) determine whether a run triggers notifications independently of channel choice.
- **Store & API (Tri-State Global Notification Inheritance, #220)**: Replaced boolean coercion with true tri-state inheritance (`true` / `false` / `undefined`) for `notifyTelegram` and `onlyOnFailure` in `TaskStore`, `executeCreateTask`, and `buildTaskRecord`. Unset task flags remain `undefined` and dynamically inherit global `settings.notifyTelegram` and `settings.onlyOnFailure`. Explicit `true` or `false` sets an override; `null` or `'inherit'` resets the override back to inherit.
- **Channels (Gitea OpenAPI Swagger Compliance, #224)**: `buildGiteaIssuePayload` now complies with Gitea's OpenAPI Swagger specification `CreateIssueOption.labels: integer[]` (array of int64 IDs). Supports `settings.giteaLabelIds` name-to-ID lookup map, `task.giteaLabelIds`, and numeric `task.labels`. Unmapped label strings are omitted from payloads to prevent HTTP 422 Unprocessable Entity errors.
- **Runtimes (Node Interpreter Script Path Resolution, #225)**: `buildNodeInvocation` now respects `task.nodePath` when executing `.js`, `.mjs`, and `.cjs` script files as well as inline code, matching `buildPythonInvocation`. Defaults to `process.execPath` when unset.
- **Scheduler & Burn Guard (Isolated Read-Only Dry-Run, #229)**: Isolated dry-run execution branch at the immediate start of `executeTask`, before Burn Guard budget checks and attempt resets. Dry-run evaluates budget limits and preflight commands in preview mode without writing history, mutating task status to `paused`, or resetting attempt counters. Store JSON and counters before and after dry-run are 100% identical.
- **Channels (Universal Notification Template Precedence, #233)**: Unified template text resolution across all channels with strict precedence: `task.template` -> `settings.channelTemplates[channelId]` -> `settings.template` -> built-in defaults. Telegram channel overrides now function even when global `settings.template` is empty.
- **Settings & Observability (Scheduler Config Scope Synchronization, #235)**: Added `defaultTimezone`, `maxConcurrent`, `heartbeatUrl`, `heartbeatIntervalSec`, and `llmActionsEnabled` to `SETTINGS_SYNC_KEYS` and the volatile `Config` schema. `POST /dsh-cron/settings` returns HTTP 500 when scope updates fail, preventing false "Saved" confirmations. Runtime updates to concurrency, timezone, and heartbeat pinger apply live to the active scheduler and timer.
- **Reliability (Bounded Credential Resolution Deadline, #237)**: `deliverNotifications` bounds `resolveSecrets` with a 5000ms deadline timer using `Promise.race` and unreferenced timers. If the credential resolution service hangs, delivery logs a warning and proceeds without blocking task completion, queue draining, or subsequent scheduled ticks.
- **Hygiene & DSH Service Architecture (Host Logging & Headless Safety, #266)**: All host-side logging routed through `ctx.logger`. Settings service dynamically injected via `ctx.inject(['settings'], ...)` to guarantee safe headless DSH startup without required settings dependencies while mounting the settings card in web profiles.
- **Test**: Added `test/pack7-final-hardening.test.mjs` (9 comprehensive unit tests covering all 9 issues). Total 382/382 tests passing (100% pass, 0 failures).

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
