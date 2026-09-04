/**
 * Builds the initial prompt for starting a session with DSH agent to configure a cron task.
 * @param {string} userText 
 * @returns {string}
 */
export function buildAgentCronPrompt(userText) {
  const text = (userText || '').trim();
  return `Пользователь хочет запланировать cron-задачу через DSH Cron:
"${text}"

ИНСТРУКЦИЯ ДЛЯ АГЕНТА:
1. Твоя цель — помочь пользователю настроить и зарегистрировать запланированную задачу с помощью инструмента \`cron_schedule_task\`.
2. Предложи подходящую и экономичную LLM-модель для выполнения этого крона (например, \`Qwen/Qwen3.8-Flash\` через Command Code или \`deepseek/deepseek-v4-flash\`), уточни у пользователя, устраивает ли она его или он предпочитает другую подключенную модель.
3. Уточни и сформулируй точное расписание cron (например, "0 * * * *" или интервал вроде "every 1h").
4. Примени Silent Rule (правило тишины): если задача мониторинга/проверки не обнаружила проблем, критических изменений или ошибок, агент должен возвращать ПУСТОЙ ответ или короткое уведомление без лишнего шума.
5. После согласования параметров ОБЯЗАТЕЛЬНО вызови инструмент \`cron_schedule_task\`, передав title, schedule, prompt и delivery ("isolated" или "current").`;
}