window.__ModuleLoader__.load({
  id: '@goodandready/dsh-cron',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
const React = window.React || require('react');
    const ReactDOM = window.ReactDOM || require('react-dom/client');

    const NS = 'cron';
    const PANEL = 'cron';
    const ACTIVATE_EVENT = 'dsh-panel-activate';
    const ACTIVE_ATTR = 'data-dsh-cron-active';
    const ENTRY_ATTR = 'data-dsh-cron-entry';
    const VIEW_ATTR = 'data-dsh-cron-view';
    const COLUMN_SELECTOR = '[data-pane=conversation], [class*=centerCol]';
    const SESSION_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="newSession"]';

    const BACK_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>';
    const ICON_TIMER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    const ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 21"></polygon></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    const ICON_TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    const ICON_BELL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
    const ICON_CLIPBOARD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>';
    const ICON_ACTIVITY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>';
    const ICON_SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

    const STYLES = `
      [data-pane=conversation], [class*=centerCol] {
        position: relative !important;
      }
      [${VIEW_ATTR}] {
        z-index: 60;
        background: var(--dsw-alias-bg-base, #171717);
        display: none;
        position: absolute;
        inset: 0;
      }
      html[${ACTIVE_ATTR}] [${VIEW_ATTR}] {
        display: block !important;
      }
      html[${ACTIVE_ATTR}] [data-pane=conversation] > *:not([${VIEW_ATTR}]),
      html[${ACTIVE_ATTR}] [class*=centerCol] > *:not([${VIEW_ATTR}]) {
        display: none !important;
      }

      .dsh-cron-entry-clone { display: flex; align-items: center; gap: 8px; }
      .dsh-cron-entry-icon { display: flex; align-items: center; justify-content: center; flex: none; width: 16px; height: 16px; }
      .dsh-cron-entry-label { text-overflow: ellipsis; overflow: hidden; }
      [data-dsh-frame][data-sidebar-collapsed] .dsh-cron-entry-label { display: none; }

      .dsh-cron-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base, #171717); color: var(--dsw-alias-label-primary, #ededed); overflow-y: auto; padding: 32px 48px; z-index: 100; box-sizing: border-box; }
      .dsh-cron-container { max-width: 860px; width: 100%; margin: 0 auto; }
      
      .dsh-cron-top-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
      .dsh-cron-back-btn { appearance: none; font: inherit; cursor: pointer; color: var(--dsw-alias-label-secondary, #9ca3af); background: 0 0; border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 8px; align-items: center; gap: 6px; padding: 4px 12px; font-size: 13px; display: inline-flex; flex: none; height: 32px; box-sizing: border-box; }
      .dsh-cron-back-btn:hover { color: var(--dsw-alias-label-primary, #ededed); background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.06)); }

      .dsh-cron-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
      .dsh-cron-title { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 6px; }
      .dsh-cron-subtitle { font-size: 14px; color: var(--dsw-alias-label-secondary, #9ca3af); }
      .dsh-cron-create-btn { appearance: none; display: inline-flex; align-items: center; gap: 6px; background: var(--dsw-alias-bg-layer-4, #262626); color: #fff; border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 9999px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; position: relative; }
      .dsh-cron-create-btn:hover { background: var(--dsw-alias-bg-layer-hover, #333); }
      .dsh-cron-dropdown { position: absolute; top: calc(100% + 6px); right: 0; width: 200px; background: var(--dsw-alias-bg-layer-3, #212121); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 12px; padding: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 200; }
      .dsh-cron-dropdown-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: #ededed; font-size: 13.5px; text-align: left; cursor: pointer; }
      .dsh-cron-dropdown-item:hover { background: var(--dsw-alias-bg-layer-4, #2a2a2a); }
      .dsh-cron-search-bar { position: relative; margin-bottom: 20px; }
      .dsh-cron-search-input { width: 100%; background: var(--dsw-alias-bg-layer-3, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 10px; padding: 10px 14px 10px 38px; color: inherit; font-size: 14px; outline: none; box-sizing: border-box; }
      .dsh-cron-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #666; }
      .dsh-cron-tabs { display: flex; gap: 8px; margin-bottom: 24px; }
      .dsh-cron-tab { appearance: none; background: transparent; border: none; padding: 6px 14px; border-radius: 9999px; color: #9ca3af; font-size: 13.5px; cursor: pointer; }
      .dsh-cron-tab[data-active="true"] { background: var(--dsw-alias-bg-layer-4, #2a2a2a); color: #fff; font-weight: 500; }
      .dsh-cron-task-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 40px; }
      .dsh-cron-task-item { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--dsw-alias-bg-layer-3, #1e1e1e); border: 1px solid var(--dsw-alias-border-l2, #2e2e2e); border-radius: 12px; }
      .dsh-cron-task-item:hover { border-color: #444; }
      .dsh-cron-task-status-btn { background: none; border: 1px solid #444; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: #888; cursor: pointer; flex-shrink: 0; }
      .dsh-cron-task-status-btn[data-active="true"] { color: #10b981; border-color: #10b981; }
      .dsh-cron-task-info { flex: 1; min-width: 0; }
      .dsh-cron-task-title { font-size: 15px; font-weight: 500; margin-bottom: 3px; }
      .dsh-cron-task-sched { font-size: 13px; color: #9ca3af; }
      .dsh-cron-task-model-tag { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,0.06); color: #aaa; margin-left: 8px; vertical-align: middle; }
      .dsh-cron-task-actions { display: flex; gap: 8px; }
      .dsh-cron-icon-btn { background: transparent; border: 1px solid #333; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; color: #aaa; cursor: pointer; }
      .dsh-cron-icon-btn:hover { background: #2a2a2a; color: #fff; }
      .dsh-cron-recs-title { font-size: 17px; font-weight: 600; margin-bottom: 14px; }
      .dsh-cron-recs-list { display: flex; flex-direction: column; gap: 10px; }
      .dsh-cron-rec-card { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: var(--dsw-alias-bg-layer-3, #1c1c1c); border: 1px solid var(--dsw-alias-border-l1, #282828); border-radius: 12px; cursor: pointer; transition: background 0.15s; }
      .dsh-cron-rec-card:hover { background: var(--dsw-alias-bg-layer-4, #242424); border-color: #383838; }
      .dsh-cron-rec-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .dsh-cron-rec-content { flex: 1; min-width: 0; }
      .dsh-cron-rec-title { font-size: 14.5px; font-weight: 500; margin-bottom: 4px; }
      .dsh-cron-rec-time { font-size: 13px; color: #9ca3af; font-weight: normal; margin-left: 8px; }
      .dsh-cron-rec-desc { font-size: 13px; color: #71717a; }
      
      .dsh-cron-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .dsh-cron-modal { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 16px; width: 100%; max-width: 540px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); box-sizing: border-box; }
      .dsh-cron-modal-title { font-size: 18px; font-weight: 600; margin-bottom: 18px; }
      .dsh-cron-form-group { margin-bottom: 16px; }
      .dsh-cron-form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
      .dsh-cron-form-group input, .dsh-cron-form-group textarea, .dsh-cron-form-group select { width: 100%; background: #141414; border: 1px solid #333; border-radius: 8px; padding: 9px 12px; color: #fff; font-size: 13.5px; outline: none; box-sizing: border-box; }
      .dsh-cron-form-group select { cursor: pointer; }
      .dsh-cron-form-group textarea { min-height: 80px; resize: vertical; }
      .dsh-cron-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .dsh-cron-modal-foot { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 20px; }
      .dsh-cron-btn-primary { background: #ededed; color: #111; border: none; border-radius: 8px; padding: 7px 16px; font-size: 13.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .dsh-cron-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .dsh-cron-btn-secondary { background: transparent; color: #999; border: 1px solid #383838; border-radius: 8px; padding: 7px 16px; font-size: 13.5px; cursor: pointer; }
      .dsh-cron-chat-box { position: relative; background: #141414; border: 1px solid #333; border-radius: 12px; padding: 12px; }
      .dsh-cron-chat-input { width: 100%; background: transparent; border: none; color: #fff; font-size: 14px; min-height: 100px; resize: vertical; outline: none; box-sizing: border-box; line-height: 1.5; }
      .dsh-cron-chat-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #222; }
      .dsh-cron-chat-hint { font-size: 12px; color: #666; }
      .dsh-cron-send-btn { width: 34px; height: 34px; border-radius: 8px; background: #ededed; color: #111; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s, background 0.15s; }
      .dsh-cron-send-btn:hover:not(:disabled) { background: #fff; transform: translateY(-1px); }
      .dsh-cron-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .dsh-cron-card { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l1, #333); border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; }
      .dsh-cron-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .dsh-cron-card-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-card-desc { font-size: 13px; color: var(--dsw-alias-label-secondary, #888); margin-bottom: 16px; line-height: 1.4; }
    `;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('dsh-cron-styles');
      if (!el) {
        el = document.createElement('style');
        el.id = 'dsh-cron-styles';
        document.head.appendChild(el);
      }
      el.textContent = STYLES;
    }

    function createToggle() {
      let open = false;
      const listeners = new Set();
      return {
        isOpen: () => open,
        set: (v) => {
          if (open === v) return;
          open = !!v;
          for (const fn of listeners) fn(open);
        },
        toggle: () => {
          open = !open;
          for (const fn of listeners) fn(open);
        },
        subscribe: (fn) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        }
      };
    }

    function openSession(ctx, sessionId) {
      if (!sessionId) return false;
      const sessions = ctx && typeof ctx.get === 'function' ? ctx.get('sessions') : ctx?.sessions;
      if (!sessions || typeof sessions.open !== 'function') return false;
      try {
        sessions.open(sessionId);
        return true;
      } catch {
        return false;
      }
    }

    function CronScreen(props) {
      const { ctx, toggle, onClose } = props;
      const [tab, setTab] = React.useState('all');
      const [query, setQuery] = React.useState('');
      const [tasks, setTasks] = React.useState([]);
      const [recs, setRecs] = React.useState([]);
      const [dropdownOpen, setDropdownOpen] = React.useState(false);

      // Manual modal state
      const [manualModalOpen, setManualModalOpen] = React.useState(false);
      const [formTitle, setFormTitle] = React.useState('');
      const [formSchedule, setFormSchedule] = React.useState('');
      const [formPrompt, setFormPrompt] = React.useState('');
      const [formProvider, setFormProvider] = React.useState('');
      const [formModel, setFormModel] = React.useState('');

      // DSH dialog state
      const [dshModalOpen, setDshModalOpen] = React.useState(false);
      const [dshPrompt, setDshPrompt] = React.useState('');
      const [dshLoading, setDshLoading] = React.useState(false);

      // Models list state
      const [providers, setProviders] = React.useState([]);
      const [models, setModels] = React.useState([]);
      const [defaultModelInfo, setDefaultModelInfo] = React.useState(null);

      React.useEffect(() => {
        const onKey = (e) => {
          if (e.key !== 'Escape') return;
          if (manualModalOpen) { setManualModalOpen(false); return; }
          if (dshModalOpen) { setDshModalOpen(false); return; }
          if (dropdownOpen) { setDropdownOpen(false); return; }
          if (onClose) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [manualModalOpen, dshModalOpen, dropdownOpen, onClose]);

      const fetchTasks = async () => {
        try {
          const res = await fetch('/dsh-cron/tasks?status=' + tab + '&query=' + encodeURIComponent(query));
          const data = await res.json();
          if (data && data.ok) {
            setTasks(data.tasks || []);
            setRecs(data.recommendations || []);
          }
        } catch (err) {}
      };

      const loadModels = async (providerToFetch) => {
        try {
          const url = '/dsh-cron/models' + (providerToFetch ? '?provider=' + encodeURIComponent(providerToFetch) : '');
          const res = await fetch(url);
          const data = await res.json();
          if (data) {
            if (data.providers) setProviders(data.providers);
            if (data.models) setModels(data.models);
            if (data.current) setDefaultModelInfo(data.current);
          }
        } catch (err) {}
      };

      React.useEffect(() => { fetchTasks(); }, [tab, query]);
      React.useEffect(() => { loadModels(); }, []);

      const handleToggleTask = async (id) => {
        try {
          await fetch('/dsh-cron/action/' + id + '/toggle', { method: 'POST' });
          fetchTasks();
        } catch (err) {}
      };

      const handleRunNow = async (id) => {
        try {
          await fetch('/dsh-cron/action/' + id + '/run', { method: 'POST' });
          alert('Задача запущена');
          fetchTasks();
        } catch (err) {}
      };

      const handleDelete = async (id) => {
        if (!confirm('Удалить эту задачу?')) return;
        try {
          await fetch('/dsh-cron/action/' + id + '/delete', { method: 'POST' });
          fetchTasks();
        } catch (err) {}
      };

      const openManualModal = (preset) => {
        setDropdownOpen(false);
        if (preset) {
          setFormTitle(preset.title || '');
          setFormSchedule(preset.schedule || '');
          setFormPrompt(preset.prompt || '');
          setFormProvider(defaultModelInfo?.provider || '');
          setFormModel(defaultModelInfo?.model || '');
          if (defaultModelInfo?.provider) loadModels(defaultModelInfo.provider);
        } else {
          setFormTitle('');
          setFormSchedule('0 9 * * 1-5');
          setFormPrompt('');
          setFormProvider(defaultModelInfo?.provider || '');
          setFormModel(defaultModelInfo?.model || '');
          if (defaultModelInfo?.provider) loadModels(defaultModelInfo.provider);
        }
        setManualModalOpen(true);
      };

      const handleProviderChange = (e) => {
        const prov = e.target.value;
        setFormProvider(prov);
        setFormModel('');
        loadModels(prov);
      };

      const handleSaveManual = async (e) => {
        e.preventDefault();
        try {
          const res = await fetch('/dsh-cron/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: formTitle,
              schedule: formSchedule,
              prompt: formPrompt,
              provider: formProvider || undefined,
              model: formModel || undefined,
            })
          });
          const data = await res.json();
          if (!data.ok) { alert(data.error || 'Ошибка'); return; }
          setManualModalOpen(false);
          fetchTasks();
        } catch (err) { alert(err.message); }
      };

      const openDshModal = () => {
        setDropdownOpen(false);
        setDshPrompt('');
        setDshModalOpen(true);
      };

      const handleStartWithDSH = async () => {
        const text = dshPrompt.trim();
        if (!text) return;

        setDshLoading(true);
        try {
          const res = await fetch('/dsh-cron/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
          });
          const data = await res.json();
          if (!data.ok || !data.sessionId) {
            alert(data.error || 'Не удалось запустить диалог с агентом');
            setDshLoading(false);
            return;
          }

          setDshModalOpen(false);
          if (onClose) onClose();
          else toggle.set(false);

          if (!openSession(ctx, data.sessionId)) {
            alert('Сессия создана (' + data.sessionId + '), перейдите к ней в списке чатов');
          }
        } catch (err) {
          alert('Ошибка запуска: ' + err.message);
        } finally {
          setDshLoading(false);
        }
      };

      return React.createElement('div', { className: 'dsh-cron-overlay' },
        React.createElement('div', { className: 'dsh-cron-container' },
          React.createElement('div', { className: 'dsh-cron-top-bar' },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-back-btn',
              title: 'Назад к чату',
              onClick: () => { if (onClose) onClose(); else toggle.set(false); }
            },
              React.createElement('span', {
                style: { display: 'flex', alignItems: 'center' },
                dangerouslySetInnerHTML: { __html: BACK_ICON }
              }),
              React.createElement('span', null, 'Назад к чату')
            )
          ),
          React.createElement('div', { className: 'dsh-cron-header' },
            React.createElement('div', null,
              React.createElement('div', { className: 'dsh-cron-title' }, 'Запланированные задачи'),
              React.createElement('div', { className: 'dsh-cron-subtitle' }, 'Попросите DSH планировать задачи, ставить напоминания или отслеживать обновления')
            ),
            React.createElement('div', { style: { position: 'relative' } },
              React.createElement('button', { className: 'dsh-cron-create-btn', onClick: () => setDropdownOpen(!dropdownOpen) },
                'Создать',
                React.createElement('span', { dangerouslySetInnerHTML: { __html: ICON_CHEVRON_DOWN } })
              ),
              dropdownOpen && React.createElement('div', { className: 'dsh-cron-dropdown' },
                React.createElement('button', { className: 'dsh-cron-dropdown-item', onClick: openDshModal }, '💬 Создать с DSH'),
                React.createElement('button', { className: 'dsh-cron-dropdown-item', onClick: () => openManualModal(null) }, '✏️ Настроить вручную')
              )
            )
          ),
          React.createElement('div', { className: 'dsh-cron-search-bar' },
            React.createElement('span', { className: 'dsh-cron-search-icon', dangerouslySetInnerHTML: { __html: ICON_SEARCH } }),
            React.createElement('input', {
              className: 'dsh-cron-search-input',
              placeholder: 'Поиск запланированных задач',
              value: query,
              onChange: (e) => setQuery(e.target.value)
            })
          ),
          React.createElement('div', { className: 'dsh-cron-tabs' },
            ['all', 'active', 'paused', 'completed'].map((t) =>
              React.createElement('button', {
                key: t,
                className: 'dsh-cron-tab',
                'data-active': tab === t ? 'true' : undefined,
                onClick: () => setTab(t)
              }, t === 'all' ? 'Все' : t === 'active' ? 'Активные' : t === 'paused' ? 'На паузе' : 'Завершенные')
            )
          ),
          React.createElement('div', { className: 'dsh-cron-task-list' },
            tasks.length === 0
              ? React.createElement('div', { style: { color: '#777', padding: '16px 0', fontSize: '14px' } }, 'Нет запланированных задач')
              : tasks.map((task) =>
                  React.createElement('div', { key: task.id, className: 'dsh-cron-task-item' },
                    React.createElement('button', {
                      className: 'dsh-cron-task-status-btn',
                      'data-active': task.status === 'active' ? 'true' : undefined,
                      title: task.status === 'active' ? 'Приостановить' : 'Возобновить',
                      onClick: () => handleToggleTask(task.id)
                    }, React.createElement('span', { dangerouslySetInnerHTML: { __html: task.status === 'active' ? ICON_PAUSE : ICON_PLAY } })),
                    React.createElement('div', { className: 'dsh-cron-task-info' },
                      React.createElement('div', { className: 'dsh-cron-task-title' },
                        task.title,
                        task.model ? React.createElement('span', { className: 'dsh-cron-task-model-tag' }, task.model.split('/').pop()) : null
                      ),
                      React.createElement('div', { className: 'dsh-cron-task-sched' },
                        task.scheduleText || task.schedule,
                        task.nextRunAt ? ` · след: ${new Date(task.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
                      )
                    ),
                    React.createElement('div', { className: 'dsh-cron-task-actions' },
                      React.createElement('button', {
                        className: 'dsh-cron-icon-btn',
                        title: 'Запустить немедленно',
                        onClick: () => handleRunNow(task.id)
                      }, 'Запустить'),
                      React.createElement('button', {
                        className: 'dsh-cron-icon-btn',
                        title: 'Удалить задачу',
                        onClick: () => handleDelete(task.id)
                      }, React.createElement('span', { dangerouslySetInnerHTML: { __html: ICON_TRASH } }))
                    )
                  )
                )
          ),
          React.createElement('div', { className: 'dsh-cron-recs-title' }, 'Рекомендуемые задачи'),
          React.createElement('div', { className: 'dsh-cron-recs-list' },
            recs.map((rec) =>
              React.createElement('div', {
                key: rec.id,
                className: 'dsh-cron-rec-card',
                onClick: () => openManualModal(rec)
              },
                React.createElement('div', { className: 'dsh-cron-rec-icon' },
                  React.createElement('span', { dangerouslySetInnerHTML: {
                    __html: rec.icon === 'bell' ? ICON_BELL : rec.icon === 'clipboard' ? ICON_CLIPBOARD : ICON_ACTIVITY
                  } })
                ),
                React.createElement('div', { className: 'dsh-cron-rec-content' },
                  React.createElement('div', { className: 'dsh-cron-rec-title' },
                    rec.title,
                    React.createElement('span', { className: 'dsh-cron-rec-time' }, rec.scheduleText)
                  ),
                  React.createElement('div', { className: 'dsh-cron-rec-desc' }, rec.description)
                )
              )
            )
          )
        ),

        // 1. Manual creation modal
        manualModalOpen && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => setManualModalOpen(false) },
          React.createElement('div', { className: 'dsh-cron-modal', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'dsh-cron-modal-title' }, 'Настройка запланированной задачи'),
            React.createElement('form', { onSubmit: handleSaveManual },
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, 'Название задачи'),
                React.createElement('input', {
                  required: true,
                  value: formTitle,
                  placeholder: 'Например: Ежедневный утренний отчет',
                  onChange: (e) => setFormTitle(e.target.value)
                })
              ),
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, 'Расписание (cron или "every 30m")'),
                React.createElement('input', {
                  required: true,
                  value: formSchedule,
                  placeholder: '0 9 * * 1-5 или every 2h',
                  onChange: (e) => setFormSchedule(e.target.value)
                })
              ),
              React.createElement('div', { className: 'dsh-cron-form-row' },
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, 'Провайдер LLM'),
                  React.createElement('select', {
                    value: formProvider,
                    onChange: handleProviderChange
                  },
                    React.createElement('option', { value: '' }, 'По умолчанию (DSH)'),
                    providers.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.name || p.id))
                  )
                ),
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, 'Модель LLM'),
                  React.createElement('select', {
                    value: formModel,
                    onChange: (e) => setFormModel(e.target.value)
                  },
                    React.createElement('option', { value: '' }, 'По умолчанию'),
                    models.map((m) => React.createElement('option', { key: m.id, value: m.id }, m.name || m.id))
                  )
                )
              ),
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, 'Промпт / Инструкция для агента'),
                React.createElement('textarea', {
                  required: true,
                  value: formPrompt,
                  placeholder: 'Опишите, что именно агент должен сделать...',
                  onChange: (e) => setFormPrompt(e.target.value)
                })
              ),
              React.createElement('div', { className: 'dsh-cron-modal-foot' },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  onClick: () => setManualModalOpen(false)
                }, 'Отмена'),
                React.createElement('button', {
                  type: 'submit',
                  className: 'dsh-cron-btn-primary'
                }, 'Сохранить задачу')
              )
            )
          )
        ),

        // 2. "Создать с DSH" modal
        dshModalOpen && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => !dshLoading && setDshModalOpen(false) },
          React.createElement('div', { className: 'dsh-cron-modal', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'dsh-cron-modal-title' }, 'Запланировать задачу с DSH Агентом'),
            React.createElement('div', { className: 'dsh-cron-form-group' },
              React.createElement('label', null, 'Опишите задачу и желаемую периодичность:'),
              React.createElement('div', { className: 'dsh-cron-chat-box' },
                React.createElement('textarea', {
                  className: 'dsh-cron-chat-input',
                  rows: 4,
                  autoFocus: true,
                  disabled: dshLoading,
                  placeholder: 'Например: проверяй каждые 2 часа свободное место на сервере и наличие упавших systemd-сервисов, присылай алерт только если что-то не так...',
                  value: dshPrompt,
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleStartWithDSH();
                    }
                  },
                  onChange: (e) => setDshPrompt(e.target.value)
                }),
                React.createElement('div', { className: 'dsh-cron-chat-foot' },
                  React.createElement('span', { className: 'dsh-cron-chat-hint' }, 'Ctrl+Enter для отправки'),
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsh-cron-send-btn',
                    disabled: dshLoading || !dshPrompt.trim(),
                    title: 'Отправить агенту',
                    onClick: handleStartWithDSH
                  },
                    React.createElement('span', {
                      style: { display: 'flex', alignItems: 'center' },
                      dangerouslySetInnerHTML: { __html: ICON_SEND }
                    })
                  )
                )
              )
            ),
            React.createElement('div', { className: 'dsh-cron-modal-foot' },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                disabled: dshLoading,
                onClick: () => setDshModalOpen(false)
              }, 'Отмена')
            )
          )
        )
      );
    }

    function CronSettingsCard(props) {
      const { ctx, toggle } = props;
      return React.createElement('div', { className: 'dsh-cron-card' },
        React.createElement('div', { className: 'dsh-cron-card-head' },
          React.createElement('span', { className: 'dsh-cron-card-title' }, '⏰ Планировщик задач (Cron)'),
          React.createElement('button', {
            type: 'button',
            className: 'dsh-cron-btn-primary',
            onClick: () => { if (toggle) toggle.set(true); }
          }, 'Открыть запланированные задачи')
        ),
        React.createElement('div', { className: 'dsh-cron-card-desc' },
          'Автоматическое выполнение задач в фоновом режиме по заданному расписанию (cron/интервалы), отслеживание логов и интеграция с чатом через команду /cron.'
        )
      );
    }

    function nativeButton() {
      const nodes = document.querySelectorAll('button[class*="newSession"]');
      for (const node of nodes) {
        if (String(node.className).indexOf('newSessionLabel') === -1) return node;
      }
      return undefined;
    }

    function createEntry(target, toggle, label) {
      const entry = target.cloneNode(true);
      entry.className = String(target.className) + ' dsh-cron-entry-clone';
      entry.setAttribute(ENTRY_ATTR, '');
      entry.setAttribute('data-dsh-plugin', 'cron');
      entry.setAttribute('data-dsh-part', 'sidebar-entry');
      entry.setAttribute('aria-label', label);
      entry.removeAttribute('id');
      entry.innerHTML = '';

      const icon = document.createElement('span');
      icon.className = 'dsh-cron-entry-icon';
      icon.innerHTML = ICON_TIMER;
      entry.appendChild(icon);

      const text = document.createElement('span');
      text.className = 'dsh-cron-entry-label';
      text.textContent = label;
      entry.appendChild(text);

      entry.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle.toggle();
      });
      return entry;
    }

    function placeEntry(target, entry) {
      let anchor = target;
      let next = target.nextElementSibling;
      while (next !== null && next.tagName === 'BUTTON'
        && String(next.className).indexOf('sidebar-entry') >= 0) {
        anchor = next;
        next = next.nextElementSibling;
      }
      anchor.insertAdjacentElement('afterend', entry);
    }

    function mountSidebarEntry(toggle, label) {
      if (typeof document === 'undefined') return () => {};
      let entry;
      const tryPlace = () => {
        if (entry !== undefined && entry.isConnected) return;
        const target = nativeButton();
        if (target === undefined || target.parentElement === null) return;
        if (target.parentElement.querySelector('[' + ENTRY_ATTR + ']') !== null) return;
        entry = createEntry(target, toggle, label);
        placeEntry(target, entry);
        syncActive();
      };

      const syncActive = () => {
        if (entry === undefined) return;
        if (toggle.isOpen()) entry.dataset.active = 'true';
        else delete entry.dataset.active;
      };

      const observer = new MutationObserver(tryPlace);
      observer.observe(document.body, { childList: true, subtree: true });
      const unsubscribe = toggle.subscribe(syncActive);
      tryPlace();

      return () => {
        observer.disconnect();
        unsubscribe();
        if (entry !== undefined) entry.remove();
        entry = undefined;
      };
    }

    function mountCronScreen(ctx, toggle) {
      if (typeof document === 'undefined') return () => {};
      let root;
      let container;

      const ensure = () => {
        if (container !== undefined && container.isConnected) return;
        const column = document.querySelector(COLUMN_SELECTOR);
        if (column === null) return;
        container = document.createElement('div');
        container.setAttribute(VIEW_ATTR, '');
        container.setAttribute('data-dsh-plugin', 'cron');
        column.appendChild(container);
        root = ReactDOM.createRoot(container);
        root.render(React.createElement(CronScreen, { ctx, toggle, onClose: () => toggle.set(false) }));
      };

      const applyActive = () => {
        if (toggle.isOpen()) {
          document.documentElement.setAttribute(ACTIVE_ATTR, '');
          document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL }));
        } else {
          document.documentElement.removeAttribute(ACTIVE_ATTR);
        }
      };

      const onOtherActivate = (event) => {
        if (event.detail !== PANEL && toggle.isOpen()) toggle.set(false);
      };
      const onSidebarClick = (event) => {
        if (!toggle.isOpen()) return;
        const target = event.target;
        if (target !== null && target.closest && target.closest(SESSION_ROW_SELECTOR) !== null) toggle.set(false);
      };

      const waitObserver = new MutationObserver(ensure);
      waitObserver.observe(document.body, { childList: true, subtree: true });
      document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
      document.addEventListener('click', onSidebarClick, true);
      const unsubscribe = toggle.subscribe(applyActive);
      applyActive();
      ensure();

      return () => {
        waitObserver.disconnect();
        document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
        document.removeEventListener('click', onSidebarClick, true);
        unsubscribe();
        document.documentElement.removeAttribute(ACTIVE_ATTR);
        if (root !== undefined) root.unmount();
        root = undefined;
        if (container !== undefined) container.remove();
        container = undefined;
      };
    }

    function registerFirst(ctx, candidates, component) {
      if (!ctx || !ctx.slots) return undefined;
      for (const entry of candidates) {
        try {
          let ok = false;
          ctx.slots.inject(entry.name, () => {
            ctx.slots.register(entry, component);
            ok = true;
          });
          if (ok) return entry.name;
        } catch (e) {}
      }
      return undefined;
    }

    function apply(ctx) {
      ensureStyles();
      const toggle = createToggle();

      const cardSlot = registerFirst(ctx, [
        { name: 'settings.plugin.item', key: NS, inject: () => ({ ctx, toggle }) },
        { name: 'settings.section', id: '@goodandready/dsh-cron', order: 34, label: () => 'Cron Задачи', inject: () => ({ ctx, toggle }) }
      ], CronSettingsCard);

      const chipSlot = registerFirst(ctx, [
        { name: 'conversation.session.header.utilities', id: '@goodandready/dsh-cron.chip', order: 27, inject: () => ({ ctx, toggle }) }
      ], () => React.createElement('button', {
        type: 'button',
        style: { background: 'none', border: 'none', color: 'var(--dsw-alias-label-secondary, #999)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' },
        title: 'Запланированные задачи (Cron)',
        onClick: () => toggle.toggle(),
        dangerouslySetInnerHTML: { __html: ICON_TIMER }
      }));

      ctx.effect(() => {
        const off = [
          mountSidebarEntry(toggle, 'Запланированные задачи'),
          mountCronScreen(ctx, toggle)
        ];
        return () => { for (const dispose of off) dispose(); };
      }, 'dsh-cron: client overlay');

      exports.slots = { card: cardSlot, chip: chipSlot };
    }

    module.exports = { apply, inject: ['slots', 'locale', 'settingsScope'] };
    return module.exports;
  }
})
