import { TaskStore } from './store.js';
import { TaskScheduler, parseScheduleExpression } from './scheduler.js';
import { SessionRunner } from './runner.js';
import { getModelsHandler } from './models-handler.js';
import { chatStartHandler } from './chat-start.js';
import { sendTelegramMessage } from './telegram.js';
import { createKanbanCard } from './integrations.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { randomUUID } from 'node:crypto';

export const name = '@goodandready/dsh-cron';
export const inject = ['tools', 'webServer', 'settings', 'llm', 'agents', 'agentDefaultModel'];

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
  const scheduler = new TaskScheduler(store, (task, opts) => runner.execute(task, opts));

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
          const stats = store.getAggregatedStats();
          sendJson(res, 200, { ok: true, tasks: list, recommendations, stats });
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
            schedule: parsed.cronPattern || body.schedule,
            scheduleText: body.scheduleText || parsed.humanText,
            prompt: body.prompt,
            type: body.type || 'prompt',
            delivery: body.delivery || 'current',
            status: body.status || 'active',
            provider: body.provider || undefined,
            model: body.model || undefined,
            notifyTelegram: body.notifyTelegram !== undefined ? Boolean(body.notifyTelegram) : false,
            onlyOnFailure: body.onlyOnFailure !== undefined ? Boolean(body.onlyOnFailure) : false,
            timeoutSeconds: body.timeoutSeconds !== undefined ? Number(body.timeoutSeconds) : 1800,
            overlapPolicy: body.overlapPolicy || 'skip',
            kanbanMode: body.kanbanMode || 'none',
            oneShot: Boolean(parsed.isOneShot || body.oneShot),
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

  // GET /dsh-cron/models
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/models',
    handler: async (req, res) => {
      await getModelsHandler(ctx, req, res, sendJson);
    }
  }), 'dsh-cron: /models');

  // POST /dsh-cron/chat/start
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/chat/start',
    handler: async (req, res) => {
      await chatStartHandler(ctx, req, res, parseJsonBody, sendJson, randomUUID);
    }
  }), 'dsh-cron: /chat/start');

  // GET & POST /dsh-cron/settings
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/settings',
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, settings: store.getSettings() });
          return;
        }
        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const updated = store.saveSettings(body);
          sendJson(res, 200, { ok: true, settings: updated });
          return;
        }
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /settings');

  // POST /dsh-cron/telegram/test
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/telegram/test',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        const body = await parseJsonBody(req);
        const settings = store.getSettings();
        const botToken = body.botToken || settings.botToken;
        const chatId = body.chatId || settings.chatId;

        if (!botToken || !chatId) {
          sendJson(res, 400, { ok: false, error: 'Не указан botToken или chatId' });
          return;
        }

        const text = `🔔 *Тестовое оповещение dsh-cron*\n\nСвязь между DSH Cron и Telegram успешно настроена! Проверка времени: \`${new Date().toISOString()}\``;
        await sendTelegramMessage({ botToken, chatId, text });
        sendJson(res, 200, { ok: true, message: 'Тестовое сообщение успешно отправлено' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /telegram/test');

  // POST /dsh-cron/kanban/test
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-cron/kanban/test',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        const body = await parseJsonBody(req);
        const settings = store.getSettings();
        const kanbanBaseUrl = body.kanbanBaseUrl || settings.kanbanBaseUrl || 'http://127.0.0.1:3000';

        const result = await createKanbanCard({
          title: `[Тест] Проверка связи DSH Cron -> Kanban`,
          body: `Тестовая карточка создана автоматически из модуля \`dsh-cron\` в ${new Date().toLocaleString('ru-RU')}.`,
          board: 'main',
          column: 'backlog',
          labels: ['cron', 'test'],
          kanbanBaseUrl
        });

        if (result.success) {
          sendJson(res, 200, { ok: true, task: result.task });
        } else {
          sendJson(res, 500, { ok: false, error: result.error });
        }
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /kanban/test');

  // PATCH & DELETE /dsh-cron/tasks/:id
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-cron/tasks/',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        const parts = url.pathname.split('/').filter(Boolean);
        const id = parts[2];
        const action = parts[3];

        if (!id) {
          sendJson(res, 400, { ok: false, error: 'ID задачи не указан' });
          return;
        }

        if (req.method === 'GET' && action === 'history') {
          const limit = parseInt(url.searchParams.get('limit') || '20', 10);
          const history = store.getHistory(id, limit);
          sendJson(res, 200, { ok: true, history });
          return;
        }

        if (req.method === 'POST' && action === 'run') {
          await scheduler.triggerManualRun(id);
          const task = store.get(id);
          sendJson(res, 200, { ok: true, task });
          return;
        }

        if (req.method === 'POST' && action === 'pause') {
          const task = scheduler.pauseTask(id);
          if (!task) {
            sendJson(res, 404, { ok: false, error: 'Задача не найдена' });
            return;
          }
          sendJson(res, 200, { ok: true, task });
          return;
        }

        if (req.method === 'POST' && action === 'resume') {
          const task = scheduler.resumeTask(id);
          if (!task) {
            sendJson(res, 404, { ok: false, error: 'Задача не найдена' });
            return;
          }
          sendJson(res, 200, { ok: true, task });
          return;
        }

        if (req.method === 'PATCH') {
          const body = await parseJsonBody(req);
          const current = store.get(id);
          if (!current) {
            sendJson(res, 404, { ok: false, error: 'Задача не найдена' });
            return;
          }
          const task = store.set({ ...current, ...body, id });
          if (task.status === 'active') {
            scheduler.scheduleTask(task);
          }
          sendJson(res, 200, { ok: true, task });
          return;
        }

        if (req.method === 'DELETE') {
          const current = store.get(id);
          if (current) {
            scheduler.pauseTask(id);
            store.delete(id);
          }
          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    }
  }), 'dsh-cron: /tasks/:id');

  // 2. Tools
  ctx.tools.register(defineTool({
    name: 'cron_create_task',
    description: 'Создать новую запланированную задачу cron (запуск по расписанию или разово через "at: ISO" или "in 20m")',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Краткое название задачи' },
        schedule: { type: 'string', description: 'Расписание: cron ("0 9 * * *"), интервал ("every 2h") или разово ("in 30m", "at: 2026-09-05T15:00:00Z")' },
        prompt: { type: 'string', description: 'Промпт/инструкция для агента при запуске' },
        type: { type: 'string', enum: ['prompt', 'script'], description: 'Тип задачи' },
        delivery: { type: 'string', enum: ['current', 'isolated'], description: 'Режим запуска: current (в текущем чате) или isolated (изолированная сессия)' },
        provider: { type: 'string', description: 'Провайдер модели (опционально)' },
        model: { type: 'string', description: 'Модель (опционально)' },
        notifyTelegram: { type: 'boolean', description: 'Отправлять отчет в Telegram' },
        onlyOnFailure: { type: 'boolean', description: 'Отправлять отчет только при сбоях' },
        timeoutSeconds: { type: 'number', description: 'Лимит времени выполнения в секундах' },
        overlapPolicy: { type: 'string', enum: ['skip', 'queue', 'replace'], description: 'Политика перекрытия' },
        kanbanMode: { type: 'string', enum: ['none', 'on_failure', 'always'], description: 'Создавать карточку в Kanban' },
      },
      required: ['title', 'schedule', 'prompt']
    },
    execute: async (args) => {
      const parsed = parseScheduleExpression(args.schedule);
      const task = store.set({
        title: args.title,
        schedule: parsed.cronPattern || args.schedule,
        scheduleText: parsed.humanText,
        prompt: args.prompt,
        type: args.type || 'prompt',
        delivery: args.delivery || 'isolated',
        status: 'active',
        provider: args.provider,
        model: args.model,
        notifyTelegram: Boolean(args.notifyTelegram),
        onlyOnFailure: Boolean(args.onlyOnFailure),
        timeoutSeconds: Number(args.timeoutSeconds) || 1800,
        overlapPolicy: args.overlapPolicy || 'skip',
        kanbanMode: args.kanbanMode || 'none',
        oneShot: Boolean(parsed.isOneShot),
      });
      scheduler.scheduleTask(task);
      return {
        success: true,
        message: `Задача "${task.title}" успешно запланирована (${task.scheduleText})`,
        task
      };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_list_tasks',
    description: 'Получить список всех запланированных задач cron',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'active', 'paused', 'completed'], description: 'Фильтр по статусу' }
      }
    },
    execute: async (args) => {
      const tasks = store.list({ status: args.status || 'all' });
      return {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          schedule: t.scheduleText || t.schedule,
          status: t.status,
          nextRunAt: t.nextRunAt ? new Date(t.nextRunAt).toISOString() : null,
          lastStatus: t.lastStatus,
          totalTokens: t.totalTokens || 0,
          totalCostUsd: t.totalCostUsd || 0,
          oneShot: Boolean(t.oneShot),
        }))
      };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_pause_task',
    description: 'Приостановить выполнение задачи по её ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Идентификатор задачи' }
      },
      required: ['id']
    },
    execute: async (args) => {
      const task = scheduler.pauseTask(args.id);
      if (!task) return { success: false, message: 'Задача не найдена' };
      return { success: true, message: `Задача "${task.title}" приостановлена` };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_resume_task',
    description: 'Возобновить выполнение приостановленной задачи',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Идентификатор задачи' }
      },
      required: ['id']
    },
    execute: async (args) => {
      const task = scheduler.resumeTask(args.id);
      if (!task) return { success: false, message: 'Задача не найдена' };
      return { success: true, message: `Задача "${task.title}" возобновлена (${task.scheduleText})` };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_delete_task',
    description: 'Удалить задачу по её ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Идентификатор задачи' }
      },
      required: ['id']
    },
    execute: async (args) => {
      scheduler.pauseTask(args.id);
      const ok = store.delete(args.id);
      return { success: ok, message: ok ? 'Задача удалена' : 'Задача не найдена' };
    }
  }));

  ctx.tools.register(defineTool({
    name: 'cron_run_task',
    description: 'Запустить задачу немедленно вне очереди',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Идентификатор задачи' }
      },
      required: ['id']
    },
    execute: async (args) => {
      const task = store.get(args.id);
      if (!task) return { success: false, message: 'Задача не найдена' };
      scheduler.triggerManualRun(args.id);
      return { success: true, message: `Запущен внеплановый старт задачи "${task.title}"` };
    }
  }));
}
