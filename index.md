# index.md — dsh-cron

Краткая навигационная карта проекта. Только подтверждённые факты; подробности —
в `docs/` и Gitea.

- **Назначение**: плагин DeepSeek Harness — планировщик cron-задач, фоновая
  автоматизация и запуск агентских сессий по расписанию; отчёты в Telegram,
  карточки в dsh-kanban, учёт токенов и стоимости.
- **Пакет**: `@goodandready/dsh-cron`, версия `0.1.24` (см. `package.json`).
- **Статус**: active. В production web-профиле MiniAI установлена `0.1.24`
  (проверено `dsh plugin --profile web list`, 2026-09-09).
- **DEV**: `/mnt/external/Project/DEV/dhsplugins/dsh-cron` (корень read-only,
  работа в `.worktrees/<branch>`).
- **OPT / production**: DSH web-профиль MiniAI; CLI
  `/home/vadim/.nvm/versions/node/v24.15.0/bin/dsh`.
- **Gitea**: `goodandready/dsh-cron`, ветка `main`.

## Точки запуска

- Серверная половина загружается ядром DSH из `lib/index.js` (cordis).
- Клиентская половина: `lib/client.js` → `window.__ModuleLoader__`.
- Пользовательские поверхности: панель «Запланированные задачи» в web UI,
  карточка настроек в «Настройки → Плагины», инструменты `cron_*` для агентов,
  HTTP API `/dsh-cron/*`.

## Основные компоненты

- `@lib/index.js` — REST API `/dsh-cron/*`, инструменты `cron_*`, настройки.
- `@lib/scheduler.js` — croner-планировщик, one-shot, overlap-политики.
- `@lib/runner.js` — shell/agent-исполнение, таймауты и отмена.
- `@lib/store.js` — атомарное JSON-хранилище.
- `@lib/client.js` — UI (single-file: требование DSH-загрузчика).
- `@lib/http-utils.js` — same-origin, лимит тела, whitelist PATCH.
- `@docs/design/DESIGN.md` — дизайн-контракт UI.

## Команды

- Тесты (в worktree): `npm install --no-save --no-audit --no-fund croner@9.1.0 @deepseek-ai/dsh-tools@0.1.2-rc.1 @deepseek-ai/schemastery@3.18.1 && npm test`
- Проверка состава пакета: `npm pack --dry-run --json`
- Deploy-подготовка и проверка: `bash deploy.sh check`

## Deploy

- Кандидат: собрать `.tgz` из проверенного `main` → полный цикл на test server
  MiniPC (`dsh-test-plugin install/status/cleanup`, web `127.0.0.1:3082`).
- Production: после публикации — установка точной registry-версии
  `dsh plugin --profile web add @goodandready/dsh-cron@<version>` агентом
  после явного «ок» владельца. Подробности: `@deploy.sh`, `@AGENTS.md`.

## Известные ограничения

- Таймзоны задач — локальное время сервера (IANA TZ — открытый вопрос, issue #13).
- Креденшелы Telegram — в хранилище плагина, а не в credentials-сервисе (#51).
- Обновлено: 2026-09-09 (проверка тестов 43/43 на MiniAI).
