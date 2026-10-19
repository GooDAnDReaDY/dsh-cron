# Plan: Pack 26 — Decision Nodes & Self-Healing Doctor (#352, #353)

## Objective
Implement conditional DAG decision nodes (IF/ELSE branching rules based on task output, exit codes, and JSON paths) and autonomous self-healing diagnostics with 1-click & safe auto-apply fixes for failed scripts and prompts.

## Key Features

### 1. Decision Nodes in DAG Chains (#352)
- **Module**: `lib/branching.js`
  - Condition evaluation: `equals`, `notEquals`, `contains`, `notContains`, `greaterThan`, `lessThan`, `regex`, `exists`, `notExists`.
  - Field extractor: `exitCode`, `status`, `output`, `stdout`, `stderr`, `output.json.<path>`, `output.text`.
  - Multi-rule evaluator with first-match semantics and fallback `elseTask`.
- **DAG Integration**:
  - `lib/dag.js`: Update `validateDAG`, `topologicalSort`, and `buildTaskGraphModel` to include `branchRules` and `elseTask` targets, detecting cycles and rendering labeled conditional edges (`[if: ...]`, `[else]`).
- **Scheduler Routing**:
  - `lib/scheduler-execution.js`: Evaluate branch rules upon task completion; route chain execution to matched target task or else task.
- **Web UI**:
  - `lib/client-src/45-dag-graph-view.js`: Render conditional branch badges on graph edges.
  - `lib/client-src/60-modal-task-form-head.js` & `lib/client-src/62-modal-task-form-tail.js`: Form fields to configure `branchRules` and `elseTask`.

### 2. Self-Healing Doctor (#353)
- **Module**: `lib/doctor.js`
  - Extends failure inspection across all task types (`script`, `shell`, `llm`, `workflow`, `skill`).
  - Automated failure classification into standard categories: `syntax_error`, `rate_limit`, `auth_failed`, `schema_change`, `timeout`, `dependency_missing`, `network_error`, `runtime_error`.
  - Concrete `suggestedFix` generation with line-by-line / unified diff preview.
  - Confidence scoring (`high`, `medium`, `low`).
  - Revision history: task revisions stored in `task.revisions` (up to 10 backups) with `previousPrompt` / `previousScript`.
  - Safe auto-heal: `task.autoHeal: boolean` or `task.selfHealing: { autoApply: true }` with 24-hour rate limiting and confidence gating (`high` only).
- **REST API**:
  - `POST /dsh-cron/tasks/:id/doctor/apply`: 1-Click apply fix with automatic backup.
  - `POST /dsh-cron/tasks/:id/doctor/revert`: Revert to previous version.
  - `POST /dsh-cron/tasks/:id/doctor/diagnose`: On-demand diagnostic evaluation.
- **Web UI**:
  - Doctor diagnosis card in run details with category badge, cause, diff viewer, and 1-Click Apply button.

## Architecture & Code Changes
1. `lib/branching.js` (NEW): Core rule evaluator and condition engine.
2. `lib/doctor.js` (NEW): Failure classification, patch suggestion, diff generator, and revision manager.
3. `lib/dag.js`: Cycle validation & graph model for decision branches.
4. `lib/scheduler-execution.js`: Integrate `resolveBranchTargets` and `doctor` run assists.
5. `lib/routes.js`: Doctor apply / revert / diagnose API endpoints.
6. `lib/store.js` & `lib/task-patch.js`: Schema validation and sanitization for `branchRules`, `elseTask`, `revisions`, `selfHealing`.
7. `lib/client-src/*`: Web UI updates + `scripts/build-client.mjs` compilation.
8. Documentation: `README.md`, `README.ru.md`, `README.zh.md`, `docs/design/DESIGN.md`, `CHANGELOG.md`.

## Quality Gate & Acceptance Criteria
- Unit tests: `test/decision-nodes.test.mjs`, `test/self-healing-doctor.test.mjs`, `test/pack26-verification.test.mjs`.
- All tests pass (>= 580 tests).
- Preflight clean (`npm run preflight`: 0 leaks, ESLint clean, client bundle < 256 KiB).
- Zero regression on existing DAG chains or failure inspection.

