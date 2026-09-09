# AGENTS.md — dsh-cron

Этот файл дополняет корневой `AGENTS.md` рабочей зоны `DEV` и содержит только
правила и факты, специфичные для проекта `dsh-cron`. При противоречии с
корневыми правилами агент останавливается и согласует действия с пользователем.

## Product / Purpose

- Проект: `dsh-cron` — плагин DeepSeek Harness: планировщик cron-задач, фоновая
  автоматизация и запуск агентских сессий по расписанию.
- DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-cron` (вложенный репозиторий
  внутри workspace `dhsplugins`).
- OPT / production: DSH web-профиль на MiniAI (`192.168.1.111`), CLI
  `/home/vadim/.nvm/versions/node/v24.15.0/bin/dsh`, профиль `web`. Путь `/opt`
  для этого проекта не используется.
- Основные пользователи: пользователи DSH, автоматизирующие периодические
  процессы (сводки, мониторинг, проверки тикетов).
- Текущий статус: active, в production-профиле установлена
  `@goodandready/dsh-cron@0.1.24` (проверено `dsh plugin --profile web list`,
  2026-09-09).

## Package policy

- Все плагины проектируются публичными с первого коммита.
- Имя пакета: `@goodandready/dsh-cron`; совпадает в трёх местах:
  `package.json` → `name`, `cordis.patch.yml` → `name`, `lib/client.js` →
  `__ModuleLoader__.load({ id })`.
- До прямой команды владельца «публикуем» пакет не публикуется в GitHub/npm.
- Другие registry и альтернативные package-scope не используются.

## Constraints (MUST NOT)

- Корневой checkout DEV — read-only; запись только в worktree
  `.worktrees/<branch>` от свежего `origin/main` через `git-zcode`.
- Клиентская половина (`lib/client.js`) обязана оставаться single-file:
  DSH раздаёт клиент как один файл без сборщика/резолвера импортов —
  разделять его на модули нельзя.
- Имя настроек и locale-namespace: `dsh-cron` — единое значение для
  `settings.register(...)` на сервере и `key:` слота `settings.plugin.item`
  на клиенте; рассинхрон ломает карточку настроек молча.
- Канонический язык строк — английский; словарь `STRINGS.en` в client.js,
  русские входные алиасы парсера расписаний («через 15 минут», «каждый день»)
  — единственное допустимое исключение.
- Каждый динамический `<style>` несёт `data-dsh-plugin="dsh-cron"`.
- Тесты запускаются без харнесса и без сети: `node --test test/*.test.mjs`.
  Для прогона в worktree достаточно `croner`, `@deepseek-ai/dsh-tools`,
  `@deepseek-ai/schemastery` (ставятся `npm install --no-save`, см. ниже).
- Запрещены force-режимы, `dsh plugin add/remove --force`, пересборка профиля.

## Key Architecture

- `lib/index.js` — серверная половина (cordis): REST API `/dsh-cron/*`,
  инструменты `cron_*`, регистрация настроек (`dsh-cron`), lifecycle.
- `lib/scheduler.js` — croner-планировщик, one-shot таймеры, overlap-политики
  (skip/queue/replace), история запусков, Telegram/Kanban доставка.
- `lib/runner.js` — исполнение задач: shell (`type: 'script'`) или изолированная
  агентская сессия; таймаут и abort передаются в сессию.
- `lib/store.js` — атомарное JSON-хранилище задач/истории/настроек
  (`$DSH_DATA_DIR/cron/tasks.json`).
- `lib/telegram.js`, `lib/integrations.js` — доставка отчётов, канбан-карточки,
  оценка стоимости токенов.
- `lib/http-utils.js` — тело запроса с лимитом, same-origin проверка, whitelist
  PATCH-полей.
- `lib/client.js` — браузерная половина: панель задач, карточка настроек,
  sidebar-entry, locale-словарь `STRINGS.en`.
- Источник истины данных: файл хранилища плагина; конфигурации: сервис
  настроек DSH (namespace `dsh-cron`) + зеркальное сохранение в хранилище.

## Build And Run

- Установка зависимостей для тестов (в worktree):
  `npm install --no-save --no-audit --no-fund croner@9.1.0 @deepseek-ai/dsh-tools@0.1.2-rc.1 @deepseek-ai/schemastery@3.18.1`
- Тесты: `npm test` (= `node --test test/*.test.mjs`).
- Сборка не требуется (пакет поставляется как есть); проверка состава:
  `npm pack --dry-run --json` (файлы пакета ≤ 256 KiB).
- Проверка клиентской половины после установки:
  `curl -s http://127.0.0.1:3080/ | grep -c '@goodandready/dsh-cron'` и
  `curl -s -o /dev/null -w '%{http_code}' .../plugins/@goodandready/dsh-cron/client.js`.

## Testing

- Обязательные проверки: полный `npm test` в worktree перед каждым PR;
- e2e: полный цикл на изолированном test server MiniPC
  (`~/.dsh-test`, `dsh-test-web.service`, web `127.0.0.1:3082`) через
  `dsh-test-plugin install/status/cleanup` с временным `.tgz` из ветки;
- перед релизом: английский UI без translation-плагина, русский с ним.

## Dependencies

- Runtime: `croner`.
- Peer (опционально, предоставляются ядром DSH): `@deepseek-ai/dsh-tools`,
  `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-llm`,
  `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-settings`, `@deepseek-ai/cordis`.
- Внешние API: Telegram Bot API (если настроен); внутренние: `dsh-kanban`
  (HTTP), `dsh-messenger-gateway` (best-effort чтение дефолтных креденшелов).
- `npm audit` / `ncu` — read-only перед релизом; обновления зависимостей —
  только отдельным issue/веткой.

## Gitea Project Setup

- Репозиторий: `goodandready/dsh-cron`; основная ветка `main`.
- Issue labels: канонические scoped-метки (`priority/*`, `type/*`, `status/*`);
  часть меток продублирована на уровне репо и org — см. issue #95.
- Issue templates: `неизвестно` (не проверено).
- Branch protection для `main`: `неизвестно` (не проверено).

## Commits, Versions And Releases

- Формат: `<type>(<scope>): <summary>` + body «почему», footer `Refs: #<n>`.
- Текущая версия: `0.1.24` (package.json). Обычный релиз меняет только `z`;
  переход `y` (например `0.2.0`) — только по прямой просьбе владельца.
- Публикация: только после test server + production-приёмки кандидата и
  явного «Публикуем релиз?» / «ок».

## Deployment

- Штатный способ: `bash deploy.sh check` (тесты + состав пакета + кандидат
  `.tgz`) → полный цикл на test server → production-приёмка кандидата →
  после публикации установка точной registry-версии:
  `dsh plugin --profile web add @goodandready/dsh-cron@<version>`
  (выполняет агент после явного «ок» пользователя).
- Проверки после установки: версия в `dsh plugin --profile web list`,
  запуск web, `/dsh-cron/tasks` отвечает, клиентский бандл отдаётся (200),
  карточка настроек видна, ошибки в журнале отсутствуют.

## Known Issues And Limitations

- IANA-таймзоны не поддерживаются (задачи идут в локальном времени сервера) —
  issue #13.
- Креденшелы Telegram хранятся в собственном хранилище плагина, а не в сервисе
  учётных данных — issue #51.
- Дубли repo/org-меток в Gitea — issue #95.
- Прочее: открытые issues `goodandready/dsh-cron`.

## Locked Decisions

- 2026-09-09 — `settings.plugin.item` с `key: 'dsh-cron'`; fallback
  `settings.section` остаётся запасным путём. Причина: контракт слота настроек.
- 2026-09-09 — английские канонические строки + locale-словарь `STRINGS.en`;
  русский даёт translation-плагин. Причина: стандарт DSH-плагинов.
- 2026-09-09 — мутирующие HTTP-эндпоинты проверяют same-origin; script-задачи
  по HTTP требуют заголовок `x-dsh-cron-confirm: script`. Причина: CSRF→RCE
  поверхность (#86).
- 2026-09-09 — `/cron` slash-команды из README удалены (не были реализованы);
  при необходимости реализуются отдельной feature-issue. Причина: документация
  не должна описывать несуществующий функционал (#84).
