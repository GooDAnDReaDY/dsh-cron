# Pack 5: Timers, One-Shot, Intervals & Concurrency Groups Technical Specification

Delivered in release **0.2.39**, resolving issues #213, #214, #234, #236, and #239 from Master Audit #207.

## 1. Issue #213 (High): 32-Bit Timer Overflow in One-Shot Tasks
- **Problem**: Node's `setTimeout` caps delay at `MAX_INT32 = 2147483647` ms (~24.85 days). Delays above this value wrap to 1 ms, executing far-future tasks immediately.
- **Solution**: Implemented bounded chunked rearming in `scheduleOneShot`. Tasks with delay > `MAX_TIMEOUT_MS` wait for `MAX_TIMEOUT_MS`, then recalculate remaining duration until the actual target timestamp is reached. Past/overdue one-shots execute immediately.
- **Verification**: Verified via `test/scheduling-pack5.test.mjs` that a 30-day one-shot task sets an active timer without premature execution.

## 2. Issue #214 (High): Relative One-Shot Deadline Preservation
- **Problem**: Rearming or restarting a task with relative schedule (e.g. `in 30m`) previously called `parseScheduleExpression` against `Date.now()`, constantly moving the deadline into the future.
- **Solution**:
  - Saved `targetTimestamp` / `nextRunAt` are preserved upon store reloads, restarts, and non-schedule edits (title, channels, tags).
  - Explicit schedule modifications calculate fresh target timestamps.
  - Pausing keeps `targetTimestamp` while setting `nextRunAt = null`; resuming re-arms using the remaining time until `targetTimestamp`.
- **Verification**: Verified in `test/scheduling-pack5.test.mjs` that restart, metadata patch, and pause/resume preserve the original target deadline.

## 3. Issue #234 (Medium): Interval Validation and Normalization
- **Problem**: Syntax like `every 90m` was accepted by the API, but resulted in invalid cron patterns (`*/90 * * * *`) that Croner rejected with parse errors, leaving active tasks with no scheduled job and `nextRunAt = null`.
- **Solution**:
  - Validated interval step limits: minute steps must be < 60 or clean multiples of 60.
  - Multiples of 60m are normalized into hours (`every 120m` -> `0 */2 * * *`) or days (`every 24h` -> `0 0 */1 * *`).
  - Irregular intervals >59m (like `every 90m`) throw descriptive validation errors.
  - API `POST /dsh-cron/tasks` returns HTTP 400 Bad Request without persisting active tasks.
- **Verification**: Verified in `test/scheduling-pack5.test.mjs` with both parser tests and HTTP API tests.

## 4. Issue #236 (Medium): Unified maxConcurrent Safe Default
- **Problem**: `TaskScheduler` constructor defaulted `maxConcurrent` to 2, but `lib/settings.js` Config schema defaulted to 0 (unlimited), contradicting user documentation and DESIGN.
- **Solution**: Updated `lib/settings.js` to `maxConcurrent: z.number().default(2)`. Resolved settings and standalone scheduler instances now uniformly enforce a safe limit of 2 parallel runs by default. 0 remains an explicit setting for unlimited.
- **Verification**: Verified in `test/scheduling-pack5.test.mjs` against Config schema and TaskScheduler constructor defaults.

## 5. Issue #239 (Medium): Concurrency Group Admission & Queue Draining
- **Problem**: `concurrencyGroup` was persisted in task records but ignored by scheduler admission logic and queue draining.
- **Solution**:
  - Tasks in named groups (`concurrencyGroup !== 'default'`) enforce a default limit of 1 concurrent run per group.
  - When admission limit is reached, tasks with `overlapPolicy === 'queue'` enter `scheduler.queue`; tasks with `overlapPolicy === 'skip'` record a skipped run with reason.
  - Tasks in different concurrency groups run simultaneously up to the global `maxConcurrent` ceiling.
  - During queue draining upon run completion, the queue is scanned for candidate tasks whose group currently has available capacity.
- **Verification**: Verified in `test/scheduling-pack5.test.mjs` for same-group serialization, different-group parallel execution, and queue draining.
