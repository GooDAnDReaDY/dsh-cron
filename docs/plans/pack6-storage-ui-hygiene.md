# Plan: Pack 6 — Storage Security, Async I/O, UI Robustness & Release Hygiene

## Issues in Pack 6:
- #222 (M, Security): File modes 0600 on tasks.json, .bak, .tmp, directory mode 0700.
- #244 (M, Tech-Debt/Perf): Async non-blocking TaskStore save queue via fs.promises, eliminating event-loop stalls.
- #240 (M, Security/UI): Honest Import/Export disclosure, sanitized export mode, reject/strip masked secrets on import.
- #241 (M, WebUI): Dry-run & archive modals field mapping alignment (top-level response fields, run.at timestamp, append pagination).
- #242 (M, WebUI): Run/Toggle UI error handling, response status checks, optimistic state rollback, generation counter for fetch race prevention.
- #246 (M, Release): Unified GitHub publication exclusion of internal .gitea workflows.
- #245 (L, Docs): Update index.md / AGENTS.md test environment commands for Croner 10.0.1.

## Implementation Steps:
1. lib/store.js: safe file modes (0600/0700) + async save queue with snapshot versioning and non-blocking I/O.
2. lib/task-transfer.js & lib/api-import-export.js: sanitize option for export, mask sanitization on import.
3. lib/client-src/10-locales.js: honest disclosure in EN/ZH/RU.
4. lib/client-src/65-modal-dialogs.js & 52-cron-screen-actions.js: dry-run/archive field mapping, pagination append, response error handling, generation counter.
5. Rebuild client bundle: node scripts/build-client.mjs.
6. publish.sh & scripts/publish-github.sh: ensure .gitea is excluded from public trees.
7. index.md & AGENTS.md: sync test commands and version references.
8. Unit test suite: test/pack6-ui-storage.test.mjs.
9. CI preflight & full test suite.
EOF
