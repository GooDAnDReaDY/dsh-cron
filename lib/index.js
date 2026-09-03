import { TaskStore } from './store.js';
import { TaskScheduler, parseScheduleExpression } from './scheduler.js';
import { SessionRunner } from './runner.js';
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = '@goodandready/dsh-cron';
export const inject = ['tools', 'webServer', 'settings'];

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function apply(ctx, config) {
  const store = new TaskStore();
  const runner = new SessionRunner(ctx);
  const scheduler = new TaskScheduler(store, (task) => runner.execute(task));

  scheduler.start();

  ctx.effect(() => {
    return () => {
      scheduler.stopAll();
    };
  }, 'dsh-cron: lifecycle');

  const recommendations = [
    {
      id: 'rec_daily_digest',
      title: 'Ежедневная сводка',
      schedule: '0 8 * * 1-5',
      scheduleText: 'В будние дни в 8:00',
      prompt: 'Сделай краткую утреннюю сводку: проверь список активных задач, открытые тикеты в Gitea и наметь ключевые приоритеты на сегодня.',
      description: 'Начинайте каждый будний день со сводки календаря, непрочитанных писем и приоритетов',
      icon: 'bell'
    },
    {
      id: 'rec_weekly_review',
      title: 'Еженедельный обзор',
      schedule: '0 16 * * 5',
      scheduleText: 'Пятницы в 16:00',
      prompt: 'Подготовь еженедельный отчет о проделанной работе: список закрытых задач, созданных PR и актуальный статус текущих проектов.',
      description: 'Каждую пятницу создавайте краткий отчет о проделанной работе',
      icon: 'clipboard'
    },
    {
      id: 'rec_monitor_status',
      title: 'Мониторинг дальнейших действий',
      schedule: '0 9 * * 1-5',
      scheduleText: 'В будние дни в 9:00',
      prompt: 'Проверь недавнюю активность в проектах, статус сборок и отметь всё, что требует внимания разработчика.',
      description: 'Проверяйте недавнюю активность в проектах и отмечайте всё, что требует вашего внимания',
      icon: 'activity'
    }
  ];

  // 1. REST API
  // GET & POST /dsh-cron/tasks
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/tasks',
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          const url = new URL(req.url, 'http://127.0.0.1');
          const status = url.searchParams.get('status') || 'all';
          const query = url.searchParams.get('query') || '';
          const list = store.list({ status, query });
          sendJson(res, 200, { ok: true, tasks: list, recommendations });
          return;
        }

        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          if (!body.title || !body.schedule || !body.prompt) {
            sendJson(res, 400, { ok: false, error: 'Поля title, schedule и prompt обязательны' });
            return;
          }
          const parsed = parseScheduleExpression(body.schedule);
          const task = store.set({
            id: body.id,
            title: body.title,
            schedule: parsed.cronPattern,
            scheduleText: body.scheduleText || parsed.humanText,
            prompt: body.prompt,
            type: body.type || 'prompt',
            delivery: body.delivery || 'current',
            status: body.status || 'active',
          });
          scheduler.scheduleTask(task);
          sendJson(res, 200, { ok: true, task });
          return;
        }

        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /tasks');

  // Prefix routes for actions (/dsh-cron/action/*)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/action',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        const pathname = url.pathname;

        const toggleMatch = pathname.match(/^\/dsh-cron\/action\/([^/]+)\/toggle$/);
        if (req.method === 'POST' && toggleMatch) {
          const taskId = toggleMatch[1];
          const task = store.get(taskId);
          if (!task) {
            sendJson(res, 404, { ok: false, error: 'Задача не найдена' });
            return;
          }
          const updated = task.status === 'active' 
            ? scheduler.pauseTask(taskId) 
            : scheduler.resumeTask(taskId);
          sendJson(res, 200, { ok: true, task: updated });
          return;
        }

        const runMatch = pathname.match(/^\/dsh-cron\/action\/([^/]+)\/run$/);
        if (req.method === 'POST' && runMatch) {
          const taskId = runMatch[1];
          const task = store.get(taskId);
          if (!task) {
            sendJson(res, 404, { ok: false, error: 'Задача не найдена' });
            return;
          }
          scheduler.runTask(taskId);
          sendJson(res, 200, { ok: true, message: 'Запуск инициирован' });
          return;
        }

        const deleteMatch = pathname.match(/^\/dsh-cron\/action\/([^/]+)\/delete$/);
        if (req.method === 'POST' && deleteMatch) {
          const taskId = deleteMatch[1];
          const ok = scheduler.removeTask(taskId);
          sendJson(res, 200, { ok });
          return;
        }

        sendJson(res, 404, { ok: false, error: 'Action not found' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /action');

  // 2. AI Tools for Model Interaction
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    ctx.tools.register(defineTool({
      name: 'cron_schedule_task',
      description: 'Запланировать автоматическую задачу по расписанию (cron).',
      parameters: {
        title: { type: 'string', required: true, description: 'Краткое название задачи' },
        schedule: { type: 'string', required: true, description: 'Выражение cron или интервал (every 30m, 0 9 * * 1-5, daily)' },
        prompt: { type: 'string', required: true, description: 'Инструкция для агента при запуске' },
        delivery: { type: 'string', description: 'Режим запуска: current или isolated' }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        render(_args, value) {
          return [{ type: 'text', text: value.message }];
        }
      },
      execute: async ({ title, schedule, prompt, delivery }) => {
        try {
          const parsed = parseScheduleExpression(schedule);
          const task = store.set({
            title,
            schedule: parsed.cronPattern,
            scheduleText: parsed.humanText,
            prompt,
            delivery: delivery || 'isolated',
            status: 'active'
          });
          scheduler.scheduleTask(task);
          return {
            success: true,
            message: `Задача "${task.title}" запланирована (${parsed.humanText}). Следующий запуск: ${task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : 'скоро'}.`
          };
        } catch (err) {
          return { success: false, message: 'Ошибка планирования: ' + err.message };
        }
      }
    }));

    ctx.tools.register(defineTool({
      name: 'cron_list_tasks',
      description: 'Получить список текущих запланированных cron-задач.',
      parameters: {
        status: { type: 'string', description: 'Фильтр статуса: all, active, paused, completed' }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            total: { type: 'integer' },
            text: { type: 'string' }
          }
        },
        render(_args, value) {
          return [{ type: 'text', text: value.text }];
        }
      },
      execute: async ({ status }) => {
        const tasks = store.list({ status: status || 'all' });
        const text = tasks.length === 0
          ? 'Нет запланированных задач.'
          : tasks.map(t => `• ${t.title} [${t.status}] — ${t.scheduleText}`).join('\n');
        return {
          total: tasks.length,
          text
        };
      }
    }));

    ctx.tools.register(defineTool({
      name: 'cron_toggle_task',
      description: 'Приостановить, возобновить или запустить cron-задачу.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Идентификатор задачи' },
        action: { type: 'string', required: true, description: 'pause, resume, run_now или delete' }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        render(_args, value) {
          return [{ type: 'text', text: value.message }];
        }
      },
      execute: async ({ taskId, action }) => {
        if (action === 'pause') {
          const t = scheduler.pauseTask(taskId);
          return { success: !!t, message: t ? `Задача "${t.title}" приостановлена` : 'Задача не найдена' };
        }
        if (action === 'resume') {
          const t = scheduler.resumeTask(taskId);
          return { success: !!t, message: t ? `Задача "${t.title}" возобновлена` : 'Задача не найдена' };
        }
        if (action === 'run_now') {
          scheduler.runTask(taskId);
          return { success: true, message: `Задача ${taskId} запущена` };
        }
        if (action === 'delete') {
          const ok = scheduler.removeTask(taskId);
          return { success: ok, message: ok ? 'Задача удалена' : 'Задача не найдена' };
        }
        return { success: false, message: 'Неизвестное действие' };
      }
    }));
  }

  // 3. /cron Slash Command Handler
  ctx.on('user/message', async (event) => {
    const text = (event && event.text || event && event.message && event.message.content || '').trim();
    if (!text.startsWith('/cron')) return;

    const parts = text.slice(5).trim().split(/\s+/);
    const subCmd = parts[0] ? parts[0].toLowerCase() : '';

    if (!subCmd || subCmd === 'help') {
      const helpMsg = `**⏰ DSH Cron — Управление запланированными задачами**\n\n` +
        `• \`/cron list\` — показать активные задачи\n` +
        `• \`/cron add <расписание> <промпт>\` — создать новую задачу\n` +
        `• \`/cron pause <id>\` — приостановить задачу\n` +
        `• \`/cron resume <id>\` — возобновить задачу\n` +
        `• \`/cron run <id>\` — запустить сейчас\n\n` +
        `_Открыть графический экран управления можно в боковой панели._`;
      
      if (typeof event.reply === 'function') {
        event.reply(helpMsg);
      }
      return;
    }

    if (subCmd === 'list') {
      const list = store.list();
      if (!list.length) {
        if (typeof event.reply === 'function') event.reply('Нет запланированных задач. Создайте через `/cron add` или в UI.');
        return;
      }
      const lines = list.map(t => `• **${t.title}** (${t.id}) — ${t.scheduleText} [${t.status}]`);
      if (typeof event.reply === 'function') event.reply(`**Запланированные задачи (${list.length}):**\n\n` + lines.join('\n'));
      return;
    }

    if (subCmd === 'add') {
      const rest = text.slice(text.indexOf('add') + 3).trim();
      const match = rest.match(/^"([^"]+)"\s+(.+)$/) || rest.match(/^(\S+)\s+(.+)$/);
      if (!match) {
        if (typeof event.reply === 'function') event.reply('Формат: `/cron add "<расписание>" <промпт>`');
        return;
      }
      const [, scheduleStr, promptStr] = match;
      try {
        const parsed = parseScheduleExpression(scheduleStr);
        const task = store.set({
          title: promptStr.slice(0, 40),
          schedule: parsed.cronPattern,
          scheduleText: parsed.humanText,
          prompt: promptStr,
          status: 'active'
        });
        scheduler.scheduleTask(task);
        if (typeof event.reply === 'function') {
          event.reply(`✅ Создана задача: **${task.title}** (${parsed.humanText})`);
        }
      } catch (err) {
        if (typeof event.reply === 'function') event.reply(`❌ Ошибка: ${err.message}`);
      }
      return;
    }
  });
}
