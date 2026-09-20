# План реализации: Быстрые пресеты расписания в UI и бейдж pausedReason (#177)

## Контекст и цель
Улучшение пользовательского интерфейса `dsh-cron`:
1. Добавление кнопок быстрых пресетов расписания (15m, 1h, Daily 09:00, Weekdays, Weekly Mon) в форме редактирования задачи.
2. Отображение бейджа с причиной паузы (`pausedReason`) в списке задач.

## Файлы изменений
- `lib/client-src/60-modal-task-form-head.js`: чипы быстрых пресетов под полем расписания.
- `lib/client-src/55-cron-screen-view.js`: рендеринг бейджа `pausedReason` в `dsh-cron-task-title`.
- `scripts/build-client.mjs`: пересборка `lib/client.js`.
- `test/client.test.mjs`: тесты на наличие пресетов и отображение причины паузы.

