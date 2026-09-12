# Plan: 2026-09-12 Robustness and Performance Pack (#134)

## Problem / Goal
Improve execution stability, prevent orphan zombie processes, throttle high concurrency surges, optimize UI and server network bandwidth, archive history past 100 runs, and provide PR Reviewer recipe (#33).

## Proposed Changes
1. **lib/runner.js**:
   - In `_runExternal`: process group launch (`detached: true` on POSIX).
   - Kill handler on abort/timeout: kill entire process group (`process.kill(-child.pid, "SIGTERM")` -> fallback `SIGKILL`).
   - Network retry logic for transient HTTP / LLM errors (429, 502, 503, 504).
2. **lib/scheduler.js**:
   - Concurrency throttling: default `maxConcurrent = 2`, configurable via plugin settings.
3. **lib/store.js**:
   - History rotation: keep up to 100 entries in active memory/tasks.json.
   - Archive overflow entries into `tasks-history-archive.json` in the same data directory.
4. **lib/api.js & lib/index.js**:
   - Compute ETag / revision header for `GET /dsh-cron/tasks`.
   - Support `If-None-Match` / `ETag` -> return `304 Not Modified` when state is unchanged.
5. **lib/client.js**:
   - Adaptive background polling with `document.visibilityState`.
   - Send `If-None-Match` and handle 304 without re-parsing.
6. **lib/recipes.js**:
   - Add `recipe_pr_reviewer` for Gitea PR review (#33).
7. **docs/design/DESIGN.md**:
   - Document locked decisions and contracts.
