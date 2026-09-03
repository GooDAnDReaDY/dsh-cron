import { TaskStore } from './store.js';
import { TaskScheduler, parseScheduleExpression } from './scheduler.js';
import { SessionRunner } from './runner.js';

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

  // Start active scheduled jobs
  scheduler.start();

  // Cordis cleaner
  ctx.effect(() => {
    return () => {
      scheduler.stopAll();
    };
  }, 'dsh-cron: lifecycle');

  // Predefined recommendation templates
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

  // 1. REST API Endpoints
  ctx.effect(() => {
    return ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-cron/',
      handler: async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const pathname = url.pathname;

        try {
          // GET /dsh-cron/tasks
          if (req.method === 'GET' && (pathname === '/dsh-cron/tasks' || pathname === '/dsh-cron/tasks/')) {
            const status = url.searchParams.get('status') || 'all';
            const query = url.searchParams.get('query') || '';
            const list = store.list({ status, query });
            sendJson(res, 200, { ok: true, tasks: list, recommendations });
            return;
          }

          // POST /dsh-cron/tasks (create or update)
          if (req.method === 'POST' && pathname === '/dsh-cron/tasks') {
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

          // POST /dsh-cron/tasks/:id/toggle
          const toggleMatch = pathname.match(/^\/dsh-cron\/tasks\/([^/]+)\/toggle$/);
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

          // POST /dsh-cron/tasks/:id/run
          const runMatch = pathname.match(/^\/dsh-cron\/tasks\/([^/]+)\/run$/);
          if (req.method === 'POST' && runMatch) {
            const taskId = runMatch[1];
            const task = store.get(taskId);
            if (!task) {
              sendJson(res, 404, { ok: false, error: 'Задача не найдена' });
              return;
            }
            // Run in background asynchronously
            scheduler.runTask(taskId);
            sendJson(res, 200, { ok: true, message: 'Запуск инициирован' });
            return;
          }

          // GET /dsh-cron/tasks/:id/logs
          const logsMatch = pathname.match(/^\/dsh-cron\/tasks\/([^/]+)\/logs$/);
          if (req.method === 'GET' && logsMatch) {
            const taskId = logsMatch[1];
            const history = store.getHistory(taskId, 20);
            sendJson(res, 200, { ok: true, history });
            return;
          }

          // DELETE /dsh-cron/tasks/:id
          const deleteMatch = pathname.match(/^\/dsh-cron\/tasks\/([^/]+)$/);
          if (req.method === 'DELETE' && deleteMatch) {
            const taskId = deleteMatch[1];
            const ok = scheduler.removeTask(taskId);
            sendJson(res, 200, { ok });
            return;
          }

          sendJson(res, 404, { ok: false, error: 'Not found' });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      },
    });
  }, 'dsh-cron: api webServer');

  // 2. AI Tools for Model Interaction
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    ctx.tools.register({
      name: 'cron_schedule_task',
      description: 'Запланировать автоматическую задачу по расписанию (cron). Поддерживает регулярные интервалы (every 10m, daily, weekdays) и стандартный 5-позиционный cron (например "0 9 * * 1-5").',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Краткое понятное название задачи (например: "Утренний отчет")' },
          schedule: { type: 'string', description: 'Выражение расписания, например "every 30m", "0 9 * * 1-5", "daily"' },
          prompt: { type: 'string', description: 'Инструкция или промпт, который агент будет выполнять при наступлении времени' },
          delivery: { type: 'string', enum: ['current', 'isolated'], description: 'Режим запуска: current (в текущую сессию) или isolated (изолированная сессия)' }
        },
        required: ['title', 'schedule', 'prompt']
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
            message: `Задача "${task.title}" успешно запланирована (${parsed.humanText}). Следующий запуск: ${task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : 'скоро'}.`,
            task
          };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    });

    ctx.tools.register({
      name: 'cron_list_tasks',
      description: 'Получить список текущих запланированных cron-задач и их статусов.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['all', 'active', 'paused', 'completed'], description: 'Фильтр по статусу' }
        }
      },
      execute: async ({ status }) => {
        const tasks = store.list({ status: status || 'all' });
        return {
          total: tasks.length,
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            schedule: t.scheduleText,
            status: t.status,
            lastStatus: t.lastStatus,
            nextRun: t.nextRunAt ? new Date(t.nextRunAt).toLocaleString() : null
          }))
        };
      }
    });

    ctx.tools.register({
      name: 'cron_toggle_task',
      description: 'Приостановить (pause), возобновить (resume) или запустить немедленно (run_now) запланированную cron-задачу.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Идентификатор задачи' },
          action: { type: 'string', enum: ['pause', 'resume', 'run_now', 'delete'], description: 'Действие' }
        },
        required: ['taskId', 'action']
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
          return { success: true, message: `Задача ${taskId} запущена на выполнение` };
        }
        if (action === 'delete') {
          const ok = scheduler.removeTask(taskId);
          return { success: ok, message: ok ? 'Задача удалена' : 'Задача не найдена' };
        }
        return { success: false, error: 'Неизвестное действие' };
      }
    });
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
        `• \`/cron add <расписание> <промпт>\` — создать новую задачу (например: \`/cron add "0 9 * * 1-5" Утренняя сводка тикетов\`)\n` +
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