# Implementation Plan: Pack 27 — Swarm Delegation (#350) & Patch Review (#351)

## 1. Overview
This pack implements two high-value enterprise features for `@goodandready/dsh-cron`:
1. **#350: Swarm Delegation (`type: 'swarm'`)**: Parallel multi-agent task execution and swarm decomposition with concurrency pooling, failure isolation, and aggregate synthesis.
2. **#351: Patch Review & Git Diff**: Automatic Git Diff capture for worktree/script tasks, unified diff viewer in run history, and 1-Click Discard / Apply endpoints.

---

## 2. Architecture & File Breakdown

### Module 1: `lib/swarm.js` (#350)
- `executeSwarmTask(task, options)`:
  - Phase 1 (Orchestration): static subtasks or dynamic decomposition via `orchestrator` model prompt.
  - Phase 2 (Concurrent Worker Pool): executes subtasks with `concurrencyLimit` (1..10, default 3).
  - Phase 3 (Synthesis): aggregates subtask outputs into coherent executive summary via `synthesizer` model or structured joining.
- Fault isolation: individual worker failures do not abort the swarm; aggregate report highlights partial failures.
- Collects `subtaskRuns`: `[{ id, title, status, output, error, durationMs }]`.

### Module 2: `lib/git-diff.js` (#351)
- `captureGitDiff(cwd, options)`:
  - Invokes `git status --porcelain`, `git diff --stat`, and `git diff`.
  - Caps output at 256 KiB; detects binary files; parses file summary (`[{ path, status, insertions, deletions }]`).
- `discardGitChanges(cwd)`:
  - Safely resets working directory: `git reset --hard HEAD` and `git clean -fd`.
- `applyGitDiff(cwd, diffContent)`:
  - Applies patch via `git apply --whitespace=fix`.

### Module 3: Integration with Scheduler & API
- `lib/task-transfer.js`: Add `'swarm'`, `'gitDiff'` to whitelists.
- `lib/task-create.js` & `lib/task-patch.js`: Validate `swarm` configuration.
- `lib/scheduler-execution.js`:
  - Route `task.type === 'swarm'` to `executeSwarmTask`.
  - On task completion (if `task.worktree` or repo `cwd`), call `captureGitDiff` and attach to `run.gitDiff`.
- `lib/api.js`:
  - `GET /dsh-cron/tasks/:id/runs/:runId/git-diff`
  - `POST /dsh-cron/tasks/:id/runs/:runId/git-diff/discard`
  - `POST /dsh-cron/tasks/:id/runs/:runId/git-diff/apply`

### Module 4: UI Enhancements & Bundle Optimization
- Update `lib/client-src/10-locales.js` with swarm and git diff keys.
- Update `lib/client-src/60-modal-task-form-head.js` to render diff viewer and discard/apply actions in run history.
- Compile `lib/client.js` with `scripts/build-client.mjs` ensuring bundle size is strictly < 256 KiB.

---

## 3. Test & Verification Plan
1. `test/swarm.test.mjs`: Tests static subtasks, concurrency limits, worker fault tolerance, synthesis, and abort signals.
2. `test/git-diff.test.mjs`: Tests git status parsing, diff generation, discard, and apply.
3. `test/pack27-verification.test.mjs`: Full end-to-end integration test combining swarm execution and git diff tracking.
4. Full test suite: `npm test` (all 570+ tests must pass).
5. Preflight: `npm run preflight` (bundle size < 256 KiB, 0 leaks, ESLint clean).
