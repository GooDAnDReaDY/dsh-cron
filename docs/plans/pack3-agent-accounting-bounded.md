# Pack 3: Real Agent Result, Token/Cost Accounting & Bounded Scheduling

## Overview
Pack 3 addresses 6 High-priority audit issues discovered in Master Audit #207:
- **#227**: `_executeAgentTurn` returns stub string instead of actual assistant message output and terminal turn events.
- **#228**: `_extractUsage` reads non-existent `session.usage`/`agent.usage`; must extract token usage from session events (`assistant/message`, `assistant/attempt`, `assistant/chunk`).
- **#221**: Daily Burn Guard rolling 24h budget forgets runs beyond the 100-entry active history window; requires a rolling 24h cost ledger preserved across archive rotation and restarts.
- **#216**: Global concurrency queue and overlap queue lose `chainDepth` and previous task context (`prev.*`).
- **#218**: Croner `protect: true` suppresses ticks before scheduler's `overlapPolicy` (`queue`/`replace`) can handle them; scheduled cron runs bypass overlap handling.
- **#230**: `executeLlmActionDirectives` `trigger_task` doesn't pass/enforce `chainDepth`, bypassing recursion limits.

## Changes Implemented
1. `lib/runner.js`:
   - Captured session `startSeq` before `handle.agent.followup`.
   - Extracted turn events using `snapshotEvents(startSeq)` or `log.slice(startSeq)`.
   - Inspected `turn/end` event for failure reasons (`error`, `interrupted`, `failed`, `aborted`), raising error to fail run.
   - Parsed `assistant/message` text blocks and `assistant/chunk` text deltas; preferred finalized messages.
   - Enhanced `_extractUsage` to aggregate usage from `assistant/message`, `assistant/chunk` (usage type), and `assistant/attempt` (paid failed attempts).
2. `lib/store.js` & `lib/burn-guard.js`:
   - Added rolling 24-hour cost ledger (`task.costLedger`) persisted in `store.json`.
   - Pruned ledger entries older than 24 hours on record and load.
   - Updated `calculateRollingCost` and `checkTaskBudgetLimits` to evaluate `task.costLedger`.
3. `lib/scheduler-execution.js` & `lib/scheduler.js`:
   - Stored immutable execution options in global queue and overlap queue.
   - Drained queue by passing stored options (`chainDepth`, `prev.*`).
   - Removed `protect: true` from Croner instantiation to delegate overlap handling to scheduler policy.
4. `lib/llm-actions.js`:
   - Propagated `chainDepth` in `executeLlmActionDirectives`.
   - Enforced `chainDepth < 4` recursion bound on `trigger_task`.

## Verification
- Unit test suite: `test/agent-accounting-pack3.test.mjs` (7 new tests).
- Full regression suite: 346 tests pass with 0 failures.