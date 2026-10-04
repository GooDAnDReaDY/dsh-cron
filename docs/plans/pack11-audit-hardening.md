# Plan: Pack 11 — Native Cordis Context, UI Polling Cancellation, Store Async Yield & Docs Sync

## Context & Audit Findings:
Codex completed an independent audit of Pack 10 / 0.2.44 (PR #284, commit fd5de4e, Issue #285):
- **#280 (PASS)**: Heartbeat disposer cleanly unrefs and disposes timer in t.after().
- **#282 (CLOSED)**: Cosmokit / Schemastery volatile box unwrap verified.
- **#235 (REOPENED, Med)**: In native Cordis Context (without `config` in `inject`), accessing `ctx.config` throws `TypeError: cannot get property "config" without inject`. Plugin config lives at `ctx.fiber.config`. Access in `syncVolatileConfig` (line 218) and `GET /settings` (line 289) must safely query `ctx.fiber.config` / `ctx.scope.config` / `rawConfig` without throwing, preserving live volatile refs.
- **#242 (REOPENED, Med)**: Polling in `lib/client-src/50-cron-screen-state.js` did not check `isDestroyed` / `generation` on completion, nor did it cancel in-flight fetches with `AbortController` on query/tab change, allowing stale responses to overwrite active view.
- **#244 (REOPENED, Med)**: `JSON.stringify` still runs synchronously on the main thread; comments / release notes should honestly describe CPU serialization vs non-blocking disk I/O, and `saveAsync()` should yield to the event loop via `setImmediate` before and after serialization.
- **#245 (REOPENED, Low)**: `index.md:12` had outdated status reference to 0.2.8; `AGENTS.md` current version description needed Pack 10 specifics and Pack 11 bump to 0.2.45.

## Implementation Steps:
1. **lib/index.js (#235)**:
   - Add `getContextConfig(ctx, rawConfig)` helper that checks `ctx?.fiber?.config`, `ctx?.scope?.config`, `ctx?.runtime?.config`, and `rawConfig` without throwing on `ctx.config`.
   - Update `syncVolatileConfig` and `GET /dsh-cron/settings` to use `getContextConfig` and unwrap live volatile properties cleanly.
2. **lib/client-src/50-cron-screen-state.js (#242)**:
   - Equip `doPoll` with `AbortController` (`pollController`).
   - Abort in-flight poll request on effect cleanup.
   - Verify `isDestroyed` and `currentGen === fetchGenRef.current` in both response handlers and `finally`.
   - Rebuild client bundle via `node scripts/build-client.mjs`.
3. **lib/store.js (#244)**:
   - Add `setImmediate` yields before and after `JSON.stringify(data)` in `saveAsync()`'s `writeOp`.
   - Honest comment regarding non-blocking disk I/O vs CPU serialization.
4. **Docs & Versioning (#245)**:
   - Bump `package.json` to `0.2.45`.
   - Update `index.md` and `AGENTS.md` with accurate current release status and complete chronological notes.
   - Update `CHANGELOG.md`.
5. **Testing & Verification**:
   - Write comprehensive tests in `test/pack11-verification.test.mjs` covering native Cordis Context without inject, polling abort / generation protection, and store yield.
   - Run `node scripts/ci-preflight.mjs` and `npm test` (all passing).
