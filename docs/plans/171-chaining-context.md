# План реализации: Контекстные переменные в цепочках задач и динамические переменные промпта (#171)

## Контекст и цель
В механизме task chaining (#137) одна задача при завершении (`onSuccess` / `onFailure`) может запускать следующую задачу:
`scheduler.runNow(targetId, { chainDepth: currentDepth + 1, prevOutput, prevTaskId })`.
Однако сейчас переданный вывод нигде не подставляется в тело задачи. Задача, стоящая второй в пайплайне (например, анализ логов -> генерация сводки -> уведомление), не может обратиться к результату предыдущего шага.

Цель: реализовать чистый, безопасный и легко тестируемый механизм интерполяции контекста (`{{prev.output}}`, `{{prev.status}}`, `{{date}}`, и др.) перед выполнением задачи.

## Поддерживаемые переменные

### Контекст предыдущей задачи (Task Chaining)
- `{{prev.output}}` или `{{prev_output}}`: вывод/результат предыдущего шага.
- `{{prev.status}}` или `{{prev_status}}`: статус предыдущего шага (`success`, `error`, `timeout`, `skipped`).
- `{{prev.taskId}}` или `{{prev_task_id}}`: идентификатор предыдущей задачи.
- `{{prev.duration}}` или `{{prev_duration}}`: отформатированная длительность выполнения шага (например, `1.5 s`).
- `{{prev.cost}}` или `{{prev_cost}}`: стоимость предыдущего шага в USD (например, `$0.0015`).

### Временные переменные (Time Context)
- `{{date}}`: текущая дата в формате `YYYY-MM-DD`.
- `{{time}}`: текущее время в формате `HH:MM:SS`.
- `{{now}}` / `{{datetime}}` / `{{iso}}`: ISO 8601 строка текущего момента (`2026-09-20T19:25:00.000Z`).
- `{{timestamp}}`: миллисекунды эпохи (`Date.now()`).

### Метаданные текущей задачи
- `{{task.id}}` / `{{task_id}}`: ID текущей задачи.
- `{{task.title}}` / `{{task_title}}`: название текущей задачи.

## Архитектура и изменения
1. **Новый модуль `lib/prompt-interpolation.js`**:
   - `buildPromptContext(task, options = {})`: формирует объект подстановок со всеми переменными.
   - `interpolateTaskPrompt(text, context = {})`: выполняет безопасную замену `{{var}}` (и `{var}`). Неизвестные переменные оставляет без изменений.
   - `resolveTaskForExecution(task, options = {})`: возвращает shallow-копию `task` с интерполированными полями (`prompt`, `script`, `command`, `url`).
2. **Интеграция в `lib/scheduler-execution.js`**:
   - В `executeTask(scheduler, taskId, options)` и `executeWithFallback(...)`:
     Использовать `resolveTaskForExecution(task, options)` перед передачей в `executeFn`.
   - В `handleCompleteRun`:
     При вызове chained задачи передавать расширенный контекст:
     `{ chainDepth, prevOutput, prevTaskId, prevStatus, prevDurationMs, prevCostUsd }`.
3. **Безопасность и лимиты**:
   - Размер файла `lib/prompt-interpolation.js` $\le 150$ строк.
   - Размер `lib/scheduler-execution.js` остаётся $\le 520$ строк (норматив $\le 550$).
   - 0 пустых блоков `catch`.
   - Полная обратная совместимость: если плейсхолдеры не используются в задаче, строка остаётся неизменной.
4. **Тесты**:
   - `test/prompt-interpolation.test.mjs`: проверка всех плейсхолдеров, edge cases (пустой вывод, undefined, спецсимволы, кавычки, $ в тексте).
   - Интеграционный тест: цепочка из двух задач через `scheduler.runTask`, подтверждающий подстановку вывода первой во вторую.
