# Style Self-Healing on Dynamic DOM Sweeps (GH-4 / #263)

## Overview
Resolves **GH-4** / **#263**:
- **Symptom**: The `dsh-cron` UI completely loses its CSS styling mid-session until the whole host application is restarted.
- **Root Cause**: `ensureStyles()` was invoked only once during `apply()` at plugin initialization. When the host re-renders `<head>`, another client plugin is hot-reloaded, skin/theme changes occur, or neighbor cleanups sweep the styles, the injected `<style id="dsh-cron-styles">` node was removed and never re-attached.
- **Solution**:
  1. `startStyleSelfHeal()` in `lib/client-src/20-styles.js`:
     - Listens to child mutations on `document.head` and `document.documentElement` via `MutationObserver`.
     - 2-second interval backstop and `visibilitychange` listener.
     - Single active instance on `window.__dshCronStyleHeal` across hot reloads.
     - Detached cleanly on `ctx.effect` disposal.
  2. `ensureStyles()` repairs missing or corrupted style tags.
  3. `applyActive()` calls `ensureStyles()` on panel activation.

## Verification
- Unit test in `test/client.test.mjs`: `GH-4 / #263: client style self-healing on dynamic DOM sweeps, head re-renders and hot reload`.
- Full regression test suite: 352/352 tests pass (`npm test`).
- CI preflight gate passes with 0 failures (`node scripts/ci-preflight.mjs`).
