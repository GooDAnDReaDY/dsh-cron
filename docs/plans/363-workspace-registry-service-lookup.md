# Plan: Fix workspaceId resolution via workspaceRegistry (Issue #363, GH #12)

## 1. Context & Problem
- In DSH host (`@deepseek-ai/dsh-workspace`), the workspace service is published as `workspaceRegistry`, not `workspaces`.
- `dsh-cron`'s `lib/runner-worktree.js:resolveCwd()` attempted `ctx.get('workspaces')`.
- `workspaceRegistry` was also missing from `export const inject` in `lib/index.js`.
- Consequently, any task configured with `workspaceId` immediately failed with `Workspace "<id>" requested by task could not be resolved`.

## 2. Changes
1. **`lib/index.js`**:
   - Add `'workspaceRegistry'` to `export const inject = [...]`.
2. **`lib/runner-worktree.js`**:
   - Update `resolveCwd(task, ctx)`:
     - Check `workspaceRegistry` through `ctx.get('workspaceRegistry')`, `ctx.workspaceRegistry`, with fallback to `workspaces`.
     - Call `registry.get(task.workspaceId)` and extract `.path`.
     - Check `registry.list()` to match by `path` or `id`.
     - Check if `task.workspaceId` is an existing local directory path on disk (since UI label says "Workspace id or path").
     - Maintain fail-closed error if not resolvable.
3. **`test/workspace-registry.test.mjs`**:
   - Test `resolveCwd` resolving via `workspaceRegistry.get(id)`.
   - Test `resolveCwd` resolving via `ctx.workspaceRegistry` direct property.
   - Test `resolveCwd` resolving via `workspaceRegistry.list()` path/title match.
   - Test `resolveCwd` resolving via direct directory path.
   - Test `resolveCwd` failing closed when workspace ID cannot be found.
   - Test backward-compatibility fallback with legacy mock `workspaces`.
   - Test `lib/index.js` declares `workspaceRegistry` in `inject`.

## 3. Verification & Quality Gates
- `test/workspace-registry.test.mjs` passes.
- Full test suite: 578+ tests pass.
- `npm run preflight`:
  - Bundle size < 256 KiB
  - 0 empty catch blocks
  - 0 raw rgba()
  - ESLint clean
  - 0 leaks
- Documentation updates: `CHANGELOG.md`, `docs/design/DESIGN.md`, `README.md`, `README.ru.md`, `README.zh.md`.
