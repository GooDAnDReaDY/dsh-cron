# План реализации: Token & Cost Burn Guard (#173)

## Контекст и цель
При периодическом выполнении LLM-задач (особенно с высокой частотой или при непредвиденных ошибках/зацикливании) задача может незаметно израсходовать лимиты API и бюджет токенов.
Цель: реализовать конфигурируемые лимиты затрат на уровне задачи (`costLimitUsd`, `dailyCostLimitUsd`, `tokenLimit`), автоматическую приостановку выполнения (`status: 'paused'`, `pausedReason: '...'`), снятие с расписания таймеров и отправку предупреждающего уведомления.

## Требования к полям задачи
1. `costLimitUsd` (`number | null`): общий потолок кумулятивных затрат задачи в USD.
2. `dailyCostLimitUsd` (`number | null`): потолок скользящих затрат за последние 24 часа.
3. `tokenLimit` (`number | null`): лимит суммарного числа токенов.
4. `pausedReason` (`string | null`): причина приостановки задачи (например, `Cost limit exceeded: $1.0200 >= $1.0000`).

## Архитектура
1. `lib/burn-guard.js`:
   - `calculateRollingCost(runs, windowMs = 86400000)`: сумма `costUsd` за последние 24 часа.
   - `checkTaskBudgetLimits(task, runs = [])`: проверка порогов. Возвращает `{ exceeded: boolean, reason?: string, details?: object }`.
   - `formatBurnGuardAlert(task, guardResult)`: форматирование понятного алерта.
2. `lib/task-transfer.js`:
   - Включение `costLimitUsd`, `dailyCostLimitUsd`, `tokenLimit`, `pausedReason` в `PATCHABLE_TASK_FIELDS`.
3. `lib/scheduler-execution.js`:
   - Вызов проверки в `handleCompleteRun`. Если лимит превышен — перевод задачи в `paused`, вызов `scheduler.pauseTask(taskId)` и рассылка алерта.
4. Тесты:
   - `test/burn-guard.test.mjs` с полным покрытием логики и интеграции.

