# План реализации: Комплексное устранение находок аудита (#199–#204)

## Контекст и цели
В ходе полного аудита версии 0.2.29 плагина dsh-cron выявлено 6 проблемных точек разного приоритета (M и L), охватывающих клиентскую часть, валидацию HTTP-маршрутов, экспорт неиспользуемых инструментов, соблюдение дизайн-токенов темы DSH и логирование сервера.

## Список задач и решения

### 1. #199: Динамическая версия в CronSettingsCard
- **Проблема**: В lib/client-src/70-settings-card.js начальное состояние currentVersion было захардкожено строкой 0.2.24.
- **Решение**: Удалён хардкод, поле инициализируется пустой строкой. В lib/index.js в ответы GET /dsh-cron/settings и POST /dsh-cron/settings добавлено поле version: pkgVersion. При монтировании карточки версия обновляется из настроек или через сервис автообновления.

### 2. #200: Строгая проверка HTTP GET (405) на системных маршрутах
- **Проблема**: Маршруты /dsh-cron/heartbeat (lib/routes.js) и /dsh-cron/models (lib/models-handler.js) возвращали ответ независимо от HTTP-метода (POST, PUT, DELETE).
- **Решение**: Добавлена проверка (req.method || 'GET') !== 'GET'. При несовпадении маршруты возвращают 405 Method not allowed с заголовком Allow: GET.

### 3. #201: Возврат 405 Method Not Allowed на /tasks/export и /tasks/import
- **Проблема**: Запросы с неверным методом (например POST на /tasks/export или GET на /tasks/import) проваливались в роут конкретной задачи /tasks/:id и возвращали 404.
- **Решение**: В lib/api.js до handleTaskItem добавлены явные проверки маршрутов экспорта/импорта: POST на /tasks/export и GET на /tasks/import немедленно отдают 405 Method Not Allowed (Allow: GET и Allow: POST соответственно).

### 4. #202: Удаление неиспользуемых экспортов createTaskParameters и createTaskOutput
- **Проблема**: В lib/index.js экспортировались устаревшие функции createTaskParameters и createTaskOutput, оставшиеся со времён раздельных инструментов.
- **Решение**: Мёртвые экспорты удалены из публичного интерфейса модуля lib/index.js. Обновлён test/tools-def.test.mjs.

### 5. #203: Замена hex-цветов на CSS-переменные темы DSH
- **Проблема**: В клиентских модулях (20-styles.js, 62-modal-task-form-tail.js, 65-modal-dialogs.js, 70-settings-card.js) использовалось около 80 жестко закодированных hex-цветов.
- **Решение**: Все 6-значные hex-цвета заменены на стандартные семантические CSS-переменные темы DSH (var(--dsw-alias-...), var(--dsh-cron-...)). Клиент пересобран (npm run build:client). Число 6-значных hex-цветов в бандле сведено к 0.

### 6. #204: Замена прямых вызовов console.* на ctx.logger
- **Проблема**: В 14 серверных модулях присутствовало 72 прямых вызова console.log, console.error, console.warn, минуя логгер Cordis/DSH.
- **Решение**: Создан синглтон lib/logger.js, инициализируемый из ctx.logger в apply(). Все прямые вызовы console.* в серверных модулях заменены на logger.info, logger.warn, logger.error, logger.debug.

## Верификация
- Модульные тесты test/audit-fixes.test.mjs и весь набор из 317 тестов пройдены успешно (0 failures).
- CI preflight npm run preflight проходит чисто (0 warnings/failures).