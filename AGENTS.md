# AGENTS.md — dsh-cron

Этот файл дополняет корневой `AGENTS.md` рабочей зоны `DEV` и содержит только
правила и факты, специфичные для проекта `dsh-cron`. При противоречии с
корневыми правилами агент останавливается и согласует действия с пользователем.

## Product / Purpose

- Проект: `dsh-cron` — плагин DeepSeek Harness: планировщик cron-задач, фоновая
  автоматизация и запуск агентских сессий по расписанию; рантаймы shell/node/
  python/http/ssh/docker, доставка отчётов в 9 каналов.
- DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-cron` (вложенный репозиторий
  внутри workspace `dhsplugins`).
- OPT / production: DSH web-профиль на MiniAI (`192.168.1.111`), CLI
  `/home/vadim/.nvm/versions/node/v24.15.0/bin/dsh`, профиль `web`. Путь `/opt`
  для этого проекта не используется.
- Основные пользователи: пользователи DSH, автоматизирующие периодические
  процессы (сводки, мониторинг, проверки тикетов).
- Текущий статус: active, релиз `0.2.5` (блок A пользовательских поверхностей
  и удаление email-канала) подготовлен 2026-09-11 после прогона 128/128,
  приёмки на MiniPC и независимого ревью в три раунда (PASS на `0df5c4d`).
  Код — PR #122 (`eef199e`), релизный bump — отдельный коммит; предыдущий
  релиз `0.2.4` опубликован в npm и стоит в production web-профиле MiniAI.

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
  (skip/queue/replace), история запусков; доставку вызывает через инжектируемый
  `deliver`, сам каналы не знает.
- `lib/runner.js` — исполнение задач: shell (`type: 'script'`) или изолированная
  агентская сессия; таймаут и abort передаются в сессию.
- `lib/runtimes.js` — рантаймы node/python/http/ssh/docker, env и worktree.
- `lib/secrets.js` — credential-ссылки: `resolveCredentialValue` (DSH
  credentials-сервис → ENV), `resolveTelegramSecrets`, эвристика «похоже на
  секрет». В настройках хранятся только ИМЕНА credential'ов.
- `lib/templates.js` — шаблоны сообщений `{var}`, встроенные plain/failure шаблоны.
- `lib/channels.js` — `CHANNEL_IDS`, чистые builder'ы payload по каналам,
  `sendToChannel` (инжектируемый fetch) и `deliverRun` (собирает сбои каналов,
  никогда не бросает).
- `lib/store.js` — атомарное JSON-хранилище задач/истории/настроек; каталог
  данных: `DSH_DATA_DIR` → `DSH_HOME/data` → `~/.dsh/data`; сырые secret-ключи
  в настройки не принимаются (`FORBIDDEN_SETTING_KEYS`).
- `lib/telegram.js`, `lib/integrations.js` — Telegram-форматирование и отправка,
  канбан-карточки, оценка стоимости токенов.
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
  `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3080/plugins/??@goodandready/dsh-cron/client.js"`.
  Ядро раздаёт клиентов только через комбинированный `??`-запрос: плоский
  путь `/plugins/<name>/client.js` отвечает 404 (учитывается в `deploy.sh`).

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
  `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-settings`,
  `@deepseek-ai/dsh-credentials`, `@deepseek-ai/cordis`.
  канал сообщает об ошибке и не мешает остальным).
- Внешние API: Telegram Bot API, Discord/Slack webhook, ntfy, Bark, PushPlus,
  Gitea REST (если соответствующий канал настроен); внутренние:
  `dsh-kanban` (HTTP), `dsh-tts` (`/dsh-tts/speak`), `dsh-remote-workspace`
  (`sshProfileId`), `dsh-messenger-gateway` (best-effort дефолтные креденшелы).
- `pnpm audit` / `ncu` — read-only перед релизом (проект использует pnpm,
  `pnpm-lock.yaml`; `npm audit` без lockfile не работает); обновления зависимостей —
  только отдельным issue/веткой.

## Gitea Project Setup

- Репозиторий: `goodandready/dsh-cron`; основная ветка `main`.
- Issue labels: канонические scoped-метки (`priority/*`, `type/*`, `status/*`);
  часть меток продублирована на уровне репо и org — см. issue #95.
- Issue templates: `неизвестно` (не проверено).
- Branch protection для `main`: `неизвестно` (не проверено).

## Commits, Versions And Releases

- Формат: `<type>(<scope>): <summary>` + body «почему», footer `Refs: #<n>`.
- Текущая версия: `0.2.5` (package.json). Обычный релиз меняет только `z`;
  переход `y` (например `0.3.0`) — только по прямой просьбе владельца.
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

## Block A (0.2.5) — пользовательские поверхности

- Новые маршруты: `POST /dsh-cron/tasks/:id/duplicate`, `GET /dsh-cron/tasks/export`, `POST /dsh-cron/tasks/import` (стратегии `add`/`replace`/`skip`, поддержка `dryRun`).
- Экспорт/импорт — только JSON: в проекте нет YAML-парсера, вторая форматная ветка без зависимости не поддерживается.
- Дубликат всегда создаётся на паузе; one-shot копия сохраняет исходную строку расписания и не вооружается до ручного возобновления.
- `deliveryTimeoutMs` нормализуется на входе `/dsh-cron/settings` и клампится в маршрутизаторе доставки (минимум `MIN_DELIVERY_TIMEOUT_MS = 1000`).

## Block B (0.2.6) — экономия и меньше шума

- #45: у задачи есть `fallbackModel`/`fallbackProvider`; падение (`error`/`timeout`) даёт ровно одну попытку на fallback-модели, usage и стоимость обеих попыток суммируются, в истории — `model` и `fallback`; работает только для `llm`/`skill`/`workflow`.
- #44: поле `silentRule` — правило словами; на успешном запуске дешёвая модель даёт вердикт `{notify, reason}`, тишина только по явному вердикту, при недоступной модели отчёт доставляется. Модель — `silentRuleModel`.
- #43: поле `inspectOnFailure` — сбойный запуск получает диагноз и предложение правки; `inspectorModel` задаёт модель, `{diagnosis}` доступна в шаблонах.
- #48: каталог `lib/recipes.js` (10 read-only рецептов), `GET /dsh-cron/recipes`, подсказки панели берутся из каталога; тест запрещает деструктивные команды.
- #49: инструменты `cron_get_task`/`cron_update_task`; переключение в код-исполняющий тип требует `confirmCodeSwitch` (HTTP — заголовок), это проверяется структурно в `lib/task-patch.js`.
- #97: `lib/api.js` (диспетчер + обработчики), общие HTTP-хелперы в `http-utils.js`, `runTask` → `beginRun`/`executeOnce`/`completeRun`/`applyModelAssists`, `_run` → диспетчер + подготовка/ход/уборка; остаток по размерам функций (`parseScheduleExpression`, `scheduleTask`) — в блок C.
- Вызовы модели из серверной половины — только через `lib/llm-ask.js` (`ctx.llm.stream`, дедлайн, fail-open); прямой генерации `ctx.llm` не предоставляет.

## Known Issues And Limitations

- IANA-таймзоны не поддерживаются (задачи идут в локальном времени сервера) —
  issue #13.
- Дубли repo/org-меток в Gitea — issue #95; токен `zcode` не имеет scope
  `read:organization`, поэтому org-репозитории не листятся.
- Доставка в Gitea пока прямым REST-вызовом: `dsh-gitea` не даёт программного
  API создания issue (запрос `goodandready/dsh-gitea#196`).
- `dsh-test-plugin` на MiniPC сообщает об ошибке после успешной установки:
  healthcheck ждёт 3 с при реальном старте ~9 с (issue #113). Обход только
  ручной проверкой состояния профиля; force-режимы не применять.
- Прочее: открытые issues `goodandready/dsh-cron`.

## Locked Decisions

- 2026-09-11 — Доставка отделена от планировщика: шаблоны `{var}` (#25),
  маршрутизатор с чистым builder'ом на канал и инжектируемым fetch (#26,
  #20–#23, #28, #47). Сбои каналов собираются и не роняют запуск; явные
  `channels` задачи перекрывают legacy `notifyTelegram`/`kanbanMode`.
- 2026-09-11 — Доставка обязана быть ограниченной по времени и параллельной
  (`deliveryTimeoutMs`, 15 с по умолчанию): иначе один висящий endpoint
  блокирует остальные каналы и, при `protect: true` в croner, пропускает
  следующие тики. Находка независимого review PR #114.
- 2026-09-11 — Значения с секретом внутри (webhook-URL Discord/Slack, ключ
  Bark) маскируются при отдаче в браузер; замаскированное значение от UI не
  перезаписывает сохранённое; сырые credential-ключи отклоняются в store и на
  входе `/dsh-cron/settings`.
- 2026-09-11 — Размер `lib/client.js` (>800 строк) — известное исключение из
  общего лимита: клиентская половина обязана быть single-file (см. Constraints).
- 2026-09-11 — Секреты только как credential-ссылки (#51): в настройках —
  имя credential, значение резолвится при отправке (DSH credentials → ENV);
  store отклоняет сырые secret-ключи.
- 2026-09-11 — Каталог данных плагина: `DSH_DATA_DIR` → `DSH_HOME/data` →
  `~/.dsh/data`. Причина: изолированный профиль не должен писать в чужой
  домашний каталог (issue #112).
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
