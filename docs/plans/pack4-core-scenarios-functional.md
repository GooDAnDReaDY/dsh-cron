# Pack 4: Core User Scenarios & Functional Hardening

## Overview
Pack 4 addresses 5 High-priority audit issues discovered in Master Audit #207:
- **#209**: HTTP POST task creation and editing dropped 13 reliability and session configuration fields (`agentPreset`, `targetSessionId`, `targetSessionReset`, `onSuccess`, `onFailure`, `heartbeatIntervalSeconds`, `gracePeriodSeconds`, `preflightType`, `preflightTarget`, `priority`, `concurrencyGroup`, `selfHealingCommand`, `autoDiagnose`).
- **#210**: `cron_create_task` tool definition and `executeCreateTask` failed to declare and persist `fallbackProvider`, `fallbackModel`, `silentRule`, `inspectOnFailure`, and the 13 reliability/session fields.
- **#211**: External REST API (`/dsh-cron/api/*`) rejected task creation, heartbeat pings, and schedule previews from remote IPs even with a valid Bearer token due to `apiToken` not propagating to helper scopes.
- **#232**: Notification filters (`onlyOnFailure` in Telegram and channel delivery, and Kanban `on_failure` cards) failed to treat missed heartbeats (`status === 'missed'`) as a failure condition, silencing critical alerts when an external monitored process died.
- **#238**: UI preflight option `shell` failed open as an unhandled preflight type in scheduler, and disk preflight checks failed open or mismatched format when parsing path/threshold definitions.

## Changes Implemented
1. `lib/api.js`:
   - Updated `mergeExecutionFields` to preserve all 13 reliability and session configuration fields across HTTP create and update flows.
   - Updated `handleExternalTaskRequest` to accept and pass `apiToken` to `handleHeartbeatPing`, `handleSchedulePreview`, `createOrUpdateTask`, and `handleItemPost`.
2. `lib/api-helpers.js`:
   - `handleSchedulePreview` and `handleHeartbeatPing` accept and verify `apiToken` against external bearer authorization tokens when invoked via external routes.
3. `lib/external-api.js`:
   - Passes expected Bearer `apiToken` into `handleExternalTaskRequest` so sub-handlers can authorize cross-origin or non-loopback calls.
4. `lib/cron-tool.js` & `lib/task-create.js`:
   - Extended `cronToolParameters` with schema definitions for `fallbackProvider`, `fallbackModel`, `silentRule`, `inspectOnFailure`, and all 13 reliability/session fields.
   - Updated `executeCreateTask` to save all declared properties into `store.set()`.
5. `lib/channels.js`, `lib/telegram.js`, `lib/integrations.js`:
   - Exported `isFailureStatus` in `lib/channels.js` identifying `'error'`, `'timeout'`, and `'missed'` as failure states.
   - Updated channel delivery `isFailed`, Telegram `shouldNotifyTask`, and Kanban `shouldCreateKanbanCard` to reliably alert when `status === 'missed'`.
6. `lib/scheduler-execution.js`, `lib/task-transfer.js`, `lib/task-patch.js`:
   - Supported both `'shell'` and `'command'` preflight types interchangeably.
   - Added fail-closed checks for missing targets, invalid disk target syntax (`[path:]<size|percent>`), unparseable requirements, and unknown preflight types.
   - Registered `preflightType === 'shell'` in `isCodeExecutingTask` and `isCodeExecutionIntroduced` to ensure proper script confirmation gating.

## Verification
- Unit test suite: `test/core-scenarios-pack4.test.mjs` (5 new tests covering issues #209, #210, #211, #232, #238).
- Full regression suite: 351 tests pass with 0 failures (`npm test`).
- CI Preflight: All 6 stages pass with 0 errors (`node scripts/ci-preflight.mjs`).
