# План декомпозиции серверных модулей dsh-cron (#163)

## Контекст и цель
Согласно правилам стандартов DSH (`dsh-plugin-preflight` и `dsh-plugin-authoring`), размер файлов исходного кода должен укладываться в диапазон $\le 500-600$ строк для обеспечения чистоты архитектуры, читаемости и тестируемости.

Клиентская часть `lib/client.js` уже декомпозирована в 14 модульных фрагментов `lib/client-src/` (все $\le 580$ строк, задача #150).
В серверной половине 4 файла превышают порог 600 строк:
- `lib/scheduler.js`: 1040 строк -> цель: $\le 550$ строк
- `lib/index.js`: 850 строк -> цель: $\le 550$ строк
- `lib/api.js`: 780 строк -> цель: $\le 550$ строк
- `lib/runner.js`: 704 строки -> цель: $\le 550$ строк

## Границы изменений и инварианты
1. 100% обратная совместимость всех публичных и внутренних экспортов (`lib/index.js`, `lib/scheduler.js`, `lib/api.js`, `lib/runner.js`).
2. Сохранение и успешное прохождение всех 272 тестов (`node --test test/*.test.mjs`).
3. Нулевые пустые блоки `catch` (соблюдение `bestEffort` из `lib/best-effort.js`).
4. Успешный запуск `npm run preflight` (`scripts/ci-preflight.mjs`).
5. Все новые серверные файлы включаются в `"files": ["lib/*.js", ...]` в `package.json` и проверяются синтаксически.

## Этапы выполнения

### Этап 1: Декомпозиция `lib/runner.js` (704 строки -> ~390 строк)
- Выделение `lib/runner-external.js`:
  - Внешние процессы: `terminateProcessTree`, `_runExternal`, `_runViaRemoteWorkspace`, `_runHttp`
- Выделение `lib/runner-worktree.js`:
  - Работа с git worktrees сессий: `resolveCwd`, `createTaskWorktree`, `removeTaskWorktree`
- `lib/runner.js` оставляет ядро `SessionRunner` (запуск агентов DSH, жизненный цикл сессий, сбор метрик токенов).

### Этап 2: Декомпозиция `lib/api.js` (780 строк -> ~430 строк)
- Выделение `lib/api-import-export.js`:
  - Экспорт задач: `handleTaskExport`
  - Импорт задач с валидацией и планом изменений: `handleTaskImport`, `applyImportPlan`
- Выделение `lib/api-webhook.js`:
  - Telegram webhook и обработка callback-кнопок: `handleTelegramWebhook`
- Выделение `lib/api-helpers.js`:
  - Вспомогательные эндпоинты: `handleHeartbeatPing`, `handleSchedulePreview`, `handleDryRunTask`
- `lib/api.js` оставляет маршрутизацию REST API коллекций и элементов задач с реэкспортом вынесенных функций.

### Этап 3: Декомпозиция `lib/index.js` (850 строк -> ~380 строк)
- Выделение `lib/tools.js`:
  - Регистрация LLM-инструментов DSH (`cron_create_task`, `cron_list_tasks`, `cron_pause_task`, `cron_resume_task`, `cron_delete_task`, `cron_run_task`, `cron_get_task`, `cron_update_task`)
- Выделение `lib/settings.js`:
  - Схема конфигурации плагина `Config`
  - Синхронизация и валидация настроек: `SETTINGS_SYNC_KEYS`, `sanitizeSettingsPayload`, `applySettingsToScope`
- `lib/index.js` оставляет инициализацию Cordis-плагина (`apply`), регистрацию веб-сервера, UI-слотов и интеграций.

### Этап 4: Декомпозиция `lib/scheduler.js` (1040 строк -> ~480 строк)
- Выделение `lib/cron-expressions.js`:
  - Парсинг выражений расписания: `parseCronExpression`, `parseIntervalExpression`, `parseAliasExpression`, `parseAtExpression`, `parseRelativeOneShot`, `describeCron`
- Выделение `lib/scheduler-execution.js`:
  - Пост-обработка завершения запуска, правила тишины `applySilentRule`, вызов цепочек `onSuccess`/`onFailure`, fallback-модели при сбоях
- `lib/scheduler.js` оставляет `TaskScheduler` (планировщик задач, регистрация Croner-джоб, очереди overlap-политик skip/queue/replace, heartbeat-таймеры) и реэкспортирует функции расписания.

### Этап 5: Сквозная верификация и приёмка
- Запуск полного набора тестов (`node --test test/*.test.mjs`).
- Запуск CI preflight (`node scripts/ci-preflight.mjs`).
- Проверка `wc -l lib/*.js`: подтверждение, что ни один файл не превышает 600 строк.
- Создание PR в Gitea, проверка diff, подготовка отчёта.

