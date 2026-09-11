# index.md — dsh-cron

Краткая навигационная карта проекта. Только подтверждённые факты; подробности —
в `docs/` и Gitea.

- **Назначение**: плагин DeepSeek Harness — планировщик cron-задач, фоновая
  автоматизация и запуск агентских сессий по расписанию; рантаймы shell, node,
  python, http, ssh, docker, env и worktree; отчёты о запусках в Telegram,
  dsh-kanban, Discord, Slack, ntfy, Bark, PushPlus, dsh-tts и Gitea;
  учёт токенов и стоимости.
- **Пакет**: `@goodandready/dsh-cron`, версия `0.2.4` — опубликована в npm
  (`latest`), GitHub Release `v0.2.4`, тег `v0.2.4` в Gitea.
- **Статус**: active, релиз `0.2.4` выпущен 2026-09-11: рантаймы исполнения
  (#4–#10, #29, #31, #38) и доставка с секретами (#51, #25, #26, #20, #21,
  #22, #47, #28) плюс исправление хранилища (#112). Код — PR #114
  (независимое ревью, PASS на `7216b3a`), релиз — PR #118, merge `e2e5125`.
  В production web-профиле MiniAI установлена точная версия `0.2.4`
  (`dsh-web.service` активен, `/dsh-cron/tasks` и `/dsh-cron/settings` → 200,
  клиентский бандл содержит новый UI, задача и история сохранены).
  Канал email удалён по решению владельца (#23).
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
- `@lib/scheduler.js` — croner-планировщик, one-shot, overlap-политики,
  вызов доставки через инжектируемый `deliver`.
- `@lib/runner.js` — shell/agent-исполнение, таймауты и отмена.
- `@lib/runtimes.js` — рантаймы node/python/http/ssh/docker, env и worktree.
- `@lib/secrets.js` — credential-ссылки: резолв через DSH credentials-сервис
  с фолбэком на ENV; определение «похоже на секрет».
- `@lib/templates.js` — шаблоны сообщений `{var}` и их переменные.
- `@lib/channels.js` — адаптеры каналов, чистые builder'ы payload и
  маршрутизатор `deliverRun` (собирает сбои каналов, не роняет запуск).
- `@lib/store.js` — атомарное JSON-хранилище; каталог данных берётся из
  `DSH_DATA_DIR` → `DSH_HOME/data` → `~/.dsh/data`.
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
- Доставка в Gitea идёт прямым REST-вызовом: `dsh-gitea` пока не даёт
  программного API создания issue (запрос заведён в `goodandready/dsh-gitea#196`).
- Секреты доставки: токены — только credential-ссылки; webhook-URL и
  ключ Bark хранятся в настройках плагина, но маскируются при отдаче в браузер.
- Канал email удалён по решению владельца: SMTP требует ящика, пароля
  приложения и провайдерских нюансов TLS, что не оправдано для этого плагина
  (#23). Задача, всё ещё ссылающаяся на `email`, получает явный сбой
  `unknown channel: email`, а не молчаливый пропуск.
- Открытые долги: #97 (размеры `index.js`/`runTask`), #115 (поле таймаута
  нельзя сбросить, нет нижней границы на сервере), #117 (мажор croner 9 → 10),
  #113 (healthcheck тест-хелпера).
- Обновлено: 2026-09-11 (удаление email-канала: 110/110 тестов, гейт размера
  22 файла ≤ 256 KiB, приёмка на MiniPC; ранее в тот же день — релиз 0.2.4).
