# План работ: Устранение дефектов Pack 14 (#288-#298) и выпуск 0.2.48

## 1. Контекст и цели
В рамках Pack 14 (Settings, Security & Code Hygiene) решаются 11 зарегистрированных дефектов и замечаний, сгруппированных по трём направлениям:
1. **Настройки и интеграция Cordis**:
   - **#288**: `ctx.config` читается без объявления в `inject` — выброс исключения в reflect proxy до срабатывания fallback.
   - **#290**: `apiToken` заморожен при старте и не синхронизируется при обновлении настроек.
2. **Секреты и сетевая безопасность**:
   - **#289**: Секреты задач возвращаются модели в нескрытом виде через вызовы инструментов агента (`get`, `update`, `create`), в то время как REST API их маскирует.
   - **#295**: Fail-open при отсутствии `remoteAddress` в `isTrustedRequest` — запрос без IP считался доверенным loopback.
3. **Ошибки исполнения и мёртвый код**:
   - **#291**: Недостижимая ветка интервала в `lib/scheduler.js` (`hours > 23`).
   - **#292**: Утечка таймера на пути ошибки в `lib/scheduler-execution.js` (`executePreflightCheck`).
   - **#293**: Цикл `while` с безусловным `break` выполняет роль обычного `if`.
   - **#294**: Использование `console` вместо плагинного `logger` при синхронизации декларативных jobs; параметр `logger` не передавался.
   - **#296**: Проверка несуществующих полей `preflightCommand` и `command` в `lib/task-patch.js` вместо реального `preflightTarget`.
   - **#297**: Отсутствие `giteaLabels` и `giteaLabelIds` в схеме `Config` и `SETTINGS_SYNC_KEYS`.
   - **#298**: Неиспользуемые параметры: деструктуризация `getCronSettingsScope` в `lib/routes.js:13` и передача мертвого аргумента `apiToken` в `handleItemPost` в `lib/api.js:550`.

Целевая версия: `0.2.48` (строго `z`-компонент SemVer).

---

## 2. Архитектурные решения и реализация по каждому issue

### 2.1. Безопасное чтение конфигурации в Cordis (#288)
- **Файл**: `lib/index.js`.
- **Проблема**: В `getContextConfig` проверка `'config' in ctx` и доступ к `ctx.config` триггерят прокси Cordis, выбрасывая `cannot get property "config" without inject`. В Cordis конфигурация плагина передается через `ctx.fiber.config` или `ctx.scope.config`.
- **Решение**: Удалить любые обращения к `'config' in ctx` и `ctx.config`. Использовать цепочку безопасного чтения: `ctx?.fiber?.config || ctx?.scope?.config || ctx?.runtime?.config || rawConfig || {}`.

### 2.2. Маскирование секретов задач в путях инструментов агента (#289)
- **Файлы**: `lib/cron-tool.js`, `lib/task-create.js`.
- **Проблема**: При вызове инструментов `get`, `update`, `create` возвращаемый объект `task` содержит сырые `task.env`, `task.httpHeaders` и `task.httpBody`, попадая в контекст LLM и логи провайдеров.
- **Решение**: Импортировать `redactTaskSecrets` из `./http-utils.js` и оборачивать возвращаемый объект задачи во всех ответах `cronTool`:
  - `lib/cron-tool.js` (action `get`): `task: redactTaskSecrets(task)`
  - `lib/cron-tool.js` (action `update`): `task: redactTaskSecrets(result.task)`
  - `lib/task-create.js` (`executeCreateTask`): `task: redactTaskSecrets(task)`

### 2.3. Динамическая синхронизация всех настроек, включая apiToken (#290)
- **Файл**: `lib/index.js`.
- **Проблема**: `syncVolatileConfig` и `GET /dsh-cron/settings` перебирали захардкоженный список из 5 ключей, игнорируя `apiToken` и каналы доставки.
- **Решение**: Импортировать `SETTINGS_SYNC_KEYS` из `./settings.js` и использовать его как единый источник ключей для синхронизации в `syncVolatileConfig` и `GET /dsh-cron/settings`.

### 2.4. Исправление ветвления парсера интервалов (#291)
- **Файл**: `lib/scheduler.js`.
- **Проблема**: В `@every <num>m` при `num >= 60 && num % 60 === 0` переменная `hours` целочисленная. Конструкция `if (hours >= 24 && hours % 24 === 0) ... else if (hours > 23)` содержала избыточную/недостижимую логику.
- **Решение**: Структурировать ветку прозрачно:
  ```javascript
  if (hours >= 24) {
    if (hours % 24 === 0) {
      const days = hours / 24;
      if (days > 31) throw new Error(...);
      pattern = `0 0 */${days} * *`;
      humanText = `Every ${days} days`;
    } else {
      throw new Error(`Invalid interval: minute interval "${num}m" (${hours} hours) cannot be expressed as a cron step`);
    }
  } else {
    pattern = `0 */${hours} * * *`;
    humanText = `Every ${hours} hours`;
  }
  ```

### 2.5. Предотвращение утечки таймера в preflight (#292)
- **Файл**: `lib/scheduler-execution.js`.
- **Проблема**: В `executePreflightCheck` для `type === 'http'` вызов `clearTimeout(timeout)` находился после `await fetch(...)` и не выполнялся, если `fetch` выбрасывал ошибку сети/таймаута.
- **Решение**: Перенести `clearTimeout(timeout)` в блок `finally`.

### 2.6. Замена фиктивного цикла while на if (#293)
- **Файл**: `lib/scheduler-execution.js`.
- **Проблема**: Цикл очистки очереди `while (!scheduler.isStopped && ...) { ... break; }` содержал безусловный `break`, превращавший его в однократное условие `if`.
- **Решение**: Заменить `while` на `if`, сохранив извлечение и запуск одного элемента из очереди.

### 2.7. Маршрутизация логов декларативных jobs (#294)
- **Файлы**: `lib/config-jobs.js`, `lib/index.js`.
- **Проблема**: По умолчанию `applyConfigSync` использовал `console`, а в `lib/index.js` аргумент `log` не передавался вовсе.
- **Решение**: Импортировать `logger` из `./logger.js` в `lib/config-jobs.js` в качестве значения по умолчанию (`log = logger`), а в `lib/index.js:202` явно передавать `log: logger`.

### 2.8. Fail-closed сетевой проверки в http-utils (#295)
- **Файл**: `lib/http-utils.js`.
- **Проблема**: `const isLoopback = !hasRemote || isLoopbackAddress(remote);` считала запрос без `remoteAddress` доверенным локальным (fail-open).
- **Решение**: Перевести проверку в fail-closed: `const isLoopback = Boolean(hasRemote && isLoopbackAddress(remote));` и отклонять неаутентифицированные запросы без валидного loopback IP: `if (!isLoopback && !isTokenAuthenticated) return false;`.

### 2.9. Корректные имена полей в контроле выполнения кода (#296)
- **Файл**: `lib/task-patch.js`.
- **Проблема**: Функция `isCodeExecutionIntroduced` проверяла `current.preflightCommand` (вместо `preflightTarget`) и мёртвое поле `command`, отсутствующее в `PATCHABLE_TASK_FIELDS`.
- **Решение**: Удалить проверку поля `command`. Проверять введение preflight шелл-команд через `preflightTarget` и тип preflight (`command` / `shell`).

### 2.10. Объявление настроек Gitea (#297)
- **Файлы**: `lib/settings.js`, `lib/channels.js`.
- **Проблема**: Ключи `giteaLabels` и `giteaLabelIds` читались в `buildGiteaIssuePayload`, но отсутствовали в схеме `Config` и массиве `SETTINGS_SYNC_KEYS`.
- **Решение**:
  - Добавить `giteaLabels` и `giteaLabelIds` в `Config` и `SETTINGS_SYNC_KEYS` в `lib/settings.js`.
  - В `lib/channels.js` поддержать корректное чтение `settings.giteaLabels` и `settings.giteaLabelIds`, включая строковые форматы.

### 2.11. Очистка неиспользуемых параметров (#298)
- **Файлы**: `lib/routes.js`, `lib/api.js`, `lib/index.js`.
- **Проблема**: В `lib/routes.js:13` деструктурировался неиспользуемый параметр `getCronSettingsScope`. В `lib/api.js:550` в `handleItemPost` передавался лишний аргумент `apiToken`.
- **Решение**: Удалить `getCronSettingsScope` из сигнатуры и вызова `registerRoutes`. Удалить `apiToken` из объекта параметров при вызове `handleItemPost`.

---

## 3. План тестирования и верификации
1. Написать специализированный набор тестов `test/pack14-verification.test.mjs`, покрывающий все 11 исправлений:
   - Проверка Cordis proxy access без inject (`getContextConfig`).
   - Проверка маскирования секретов (`env`, `httpHeaders`, `httpBody`) в ответах `cronTool` (`get`, `update`, `create`).
   - Проверка синхронизации `apiToken` и ключей настроек через `syncVolatileConfig`.
   - Проверка интервалов в `lib/scheduler.js` (граничные случаи кратных часов и дней).
   - Проверка отсутствия утечки таймера в `executePreflightCheck` при ошибках `fetch`.
   - Проверка однократной разгрузки очереди при завершении задачи.
   - Проверка логирования `applyConfigSync` через `logger`.
   - Проверка fail-closed в `isTrustedRequest` при отсутствии `remoteAddress`.
   - Проверка выявления шелл-кода через `preflightTarget` в `isCodeExecutionIntroduced`.
   - Проверка наличия `giteaLabels` и `giteaLabelIds` в `Config` и `SETTINGS_SYNC_KEYS`.
   - Проверка чистоты сигнатур `registerRoutes` и `handleItemPost`.
2. Обновить ожидаемую версию в `test/pack11-verification.test.mjs`, `test/pack12-verification.test.mjs`, `test/pack13-verification.test.mjs`.
3. Запустить полный тестовый прогон: `npm test` (все 421+ тестов должны пройти успешно).
4. Запустить `node scripts/ci-preflight.mjs`.