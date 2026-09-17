# План декомпозиции серверных модулей dsh-cron (#163) — ЗАВЕРШЕНО

## Контекст и цель
Согласно правилам стандартов DSH (`dsh-plugin-preflight` и `dsh-plugin-authoring`), размер файлов исходного кода должен укладываться в диапазон $\le 500-600$ строк для обеспечения чистоты архитектуры, читаемости и тестируемости.

Клиентская часть `lib/client.js` уже декомпозирована в 14 модульных фрагментов `lib/client-src/` (все $\le 580$ строк, задача #150).
В серверной половине 4 файла превышали порог 600 строк:
- `lib/scheduler.js`: 1040 строк -> **530 строк** (выделены `scheduler-execution.js`, `scheduler-lifecycle.js`)
- `lib/index.js`: 850 строк -> **514 строк** (выделены `settings.js`, `routes.js`, `task-create.js`)
- `lib/api.js`: 780 строк -> **495 строк** (выделены `api-import-export.js`, `api-webhook.js`, `api-helpers.js`)
- `lib/runner.js`: 704 строки -> **474 строки** (выделены `runner-external.js`, `runner-worktree.js`)

**Все серверные модули в `lib/*.js` теперь строго $\le 530$ строк!**

## Границы изменений и инварианты
1. 100% обратная совместимость всех публичных и внутренних экспортов (`lib/index.js`, `lib/scheduler.js`, `lib/api.js`, `lib/runner.js`).
2. Сохранение и успешное прохождение всех 272 тестов (`node --test test/*.test.mjs`).
3. Нулевые пустые блоки `catch` (соблюдение `bestEffort` из `lib/best-effort.js`).
4. Успешный запуск `npm run preflight` (`scripts/ci-preflight.mjs`).
5. Все новые серверные файлы включены в `"files": ["lib/*.js", ...]` в `package.json` и проверены синтаксически.

## Результаты по этапам

### Этап 1: Декомпозиция `lib/runner.js` (704 -> 474 строки) — ГОТОВО [9147cf0]
- Выделен `lib/runner-external.js` (238 строк): `runExternal`, `runHttp`, `runViaRemoteWorkspace`, `terminateProcessTree`, `isTransientError`, `isContextOverflowError`
- Выделен `lib/runner-worktree.js` (55 строк): `resolveCwd`, `createTaskWorktree`, `removeTaskWorktree`
- `lib/runner.js` сокращён до 474 строк с полным реэкспортом всех функций.

### Этап 2: Декомпозиция `lib/api.js` (780 -> 495 строк) — ГОТОВО [405dfeb]
- Выделен `lib/api-import-export.js` (145 строк): `handleTaskExport`, `handleTaskImport`, `applyImportPlan`
- Выделен `lib/api-webhook.js` (115 строк): `handleTelegramWebhook`
- Выделен `lib/api-helpers.js` (68 строк): `handleHeartbeatPing`, `handleSchedulePreview`, `handleDryRunTask`
- `lib/api.js` сокращён до 495 строк с полным реэкспортом.

### Этап 3: Декомпозиция `lib/index.js` (850 -> 514 строк) — ГОТОВО [731f3ce]
- Выделен `lib/settings.js` (120 строк): схема `Config`, `SETTINGS_SYNC_KEYS`, `sanitizeSettingsPayload`, `applySettingsToScope`
- Выделен `lib/routes.js` (194 строки): регистрация 10 веб-маршрутов `registerRoutes`
- Выделен `lib/task-create.js` (60 строк): `executeCreateTask`
- `lib/index.js` сокращён до 514 строк, сохранены `defineTool` и обработчик `/settings` под AST/текстовые проверки тестов.

### Этап 4: Декомпозиция `lib/scheduler.js` (1040 -> 530 строк) — ГОТОВО [0c559ed]
- Выделен `lib/scheduler-execution.js` (494 строки): `executePreflight`, `executeOnce`, `executeWithFallback`, `shouldUseFallback`, `beginRun`, `executeTask`, `inspectFailureRun`, `applySilentRuleToRun`, `applyModelAssists`, `deliverNotifications`, `finishRun`, `handleCompleteRun`
- Выделен `lib/scheduler-lifecycle.js` (143 строки): heartbeat-мониторинг (`startHeartbeatWatcher`, `stopHeartbeatWatcher`, `checkHeartbeats`) и методы жизненного цикла (`pauseTask`, `removeTask`, `resumeTask`, `toggleTask`)
- `lib/scheduler.js` сокращён до 530 строк. Парсинг расписаний с кириллическими алиасами сохранён в `scheduler.js` под проверку `test/i18n-compliance.test.mjs`.

### Этап 5: Сквозная верификация — ПРОЙДЕНА
- Тесты: `node --test test/*.test.mjs` — **272/272 PASS (0 fail)**.
- CI Preflight: `npm run preflight` — **PASS (0 failures)**.
  - `node --check` пройден на всех 38 standalone файлах в `lib/*.js`.
  - 0 пустых блоков `catch`.
  - 0 raw rgba() в `lib/client-src/`.
  - Валидность инъекций `package.json`.
  - Лимит размера пакета и файлов npm pack.
  - Leak scan чист (нет приватных IP/токенов).
- Размеры файлов: ни один серверный файл в `lib/*.js` не превышает 530 строк (все $\le 550$).
