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
    const ICON_EDIT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    const ICON_SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    const ICON_SETTINGS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
    const ICON_TELEGRAM = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8-1.7 8.01c-.13.58-.47.72-.95.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.53.26l.19-2.64 4.81-4.35c.21-.19-.05-.29-.32-.11L8.34 13.5 5.78 12.7c-.56-.17-.57-.56.12-.83l10-3.86c.46-.17.87.11.74.79z"/></svg>';

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
      .dsh-cron-task-item { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--dsw-alias-bg-layer-3, #1e1e1e); border: 1px solid var(--dsw-alias-border-l2, #2e2e2e); border-radius: 12px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
      .dsh-cron-task-item:hover { background: var(--dsw-alias-bg-layer-4, #242424); border-color: #444; }
      .dsh-cron-task-prompt-preview { font-size: 12.5px; color: #888; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 520px; line-height: 1.3; }
      .dsh-cron-type-tag { display: inline-block; font-size: 10.5px; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; font-weight: 600; margin-left: 8px; vertical-align: middle; }
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

      .dsh-cron-modal-nav { display: flex; gap: 4px; border-bottom: 1px solid #2e2e2e; margin-bottom: 18px; padding-bottom: 2px; }
      .dsh-cron-modal-tab { appearance: none; background: transparent; border: none; border-bottom: 2px solid transparent; padding: 8px 14px; font-size: 13.5px; color: #888; cursor: pointer; font-weight: 500; transition: color 0.15s, border-color 0.15s; }
      .dsh-cron-modal-tab:hover { color: #ccc; }
      .dsh-cron-modal-tab[data-active="true"] { color: #fff; border-bottom-color: #ededed; }
      .dsh-cron-history-list { display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow-y: auto; padding-right: 4px; }
      .dsh-cron-history-item { background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; }
      .dsh-cron-history-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .dsh-cron-history-status { font-weight: 600; font-size: 11.5px; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
      .dsh-cron-history-status[data-status="success"] { background: rgba(16, 185, 129, 0.15); color: #10b981; }
      .dsh-cron-history-status[data-status="error"] { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
      .dsh-cron-history-status[data-status="skipped"] { background: rgba(234, 179, 8, 0.15); color: #eab308; }
      .dsh-cron-history-time { color: #777; font-size: 12px; }
      .dsh-cron-history-output { background: #0c0c0c; border: 1px solid #222; border-radius: 6px; padding: 8px 10px; font-family: monospace; font-size: 12px; color: #bbb; max-height: 140px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin-top: 6px; }
      .dsh-cron-history-empty { text-align: center; padding: 36px 0; color: #666; font-size: 13.5px; }

      .dsh-cron-stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
      .dsh-cron-stat-card { background: rgba(255, 255, 255, 0.02); border: 1px solid #222; border-radius: 8px; padding: 10px 14px; }
      .dsh-cron-stat-val { font-size: 16px; font-weight: 600; color: #fff; }
      .dsh-cron-stat-lbl { font-size: 11.5px; color: #777; margin-top: 2px; }
      .dsh-cron-cost-tag { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.12); color: #10b981; font-weight: 500; }
      .dsh-cron-tokens-tag { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
      .dsh-cron-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; cursor: pointer; user-select: none; }
      .dsh-cron-checkbox-row input { width: 15px; height: 15px; margin: 0; cursor: pointer; accent-color: #ededed; }
      .dsh-cron-hint { font-size: 12px; color: #888; margin-top: 4px; }
      .dsh-cron-status-banner { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-top: 12px; }
      .dsh-cron-status-banner[data-type="success"] { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #10b981; }
      .dsh-cron-status-banner[data-type="error"] { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
      .dsh-cron-status-banner[data-type="info"] { background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #60a5fa; }
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

    async function openSession(ctx, sessionId) {
      if (!sessionId) return false;
      const getSessions = () => (ctx && typeof ctx.get === 'function' ? ctx.get('sessions') : (ctx && ctx.sessions));
      let sessions = getSessions();

      // 1. Попытка вызвать sessions.open(sessionId) немедленно
      if (sessions && typeof sessions.open === 'function') {
        try {
          sessions.open(sessionId);
          return true;
        } catch (e) {}
      }

      // 2. Если сессия еще не попала в manager.summaries, обновляем список с бэкенда
      if (sessions && typeof sessions.refresh === 'function') {
        try {
          await sessions.refresh();
          sessions.open(sessionId);
          return true;
        } catch (e) {}
      }

      // 3. Асинхронные ретраи с интервалом (пока WebSocket/SSE событие добавляет сессию в список)
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 120));
        sessions = getSessions();
        if (sessions && typeof sessions.open === 'function') {
          try {
            sessions.open(sessionId);
            return true;
          } catch (e) {}
        }
        // DOM fallback: клик по сессии в боковой панели, если она уже отрендерилась
        if (typeof document !== 'undefined') {
          const domItem = document.querySelector('[data-session-id="' + sessionId + '"], [role="treeitem"][data-id="' + sessionId + '"], [data-id="' + sessionId + '"]');
          if (domItem) {
            domItem.click();
            return true;
          }
        }
      }
      return false;
    }

    function CronScreen(props) {
      const { ctx, toggle, onClose } = props;
      const [tab, setTab] = React.useState('all');
      const [query, setQuery] = React.useState('');
      const [tasks, setTasks] = React.useState([]);
      const [recs, setRecs] = React.useState([]);
      const [dropdownOpen, setDropdownOpen] = React.useState(false);

      // Manual / Edit modal state
      const [manualModalOpen, setManualModalOpen] = React.useState(false);
      const [formId, setFormId] = React.useState(null);
      const [formTitle, setFormTitle] = React.useState('');
      const [formSchedule, setFormSchedule] = React.useState('');
      const [formType, setFormType] = React.useState('llm');
      const [formPrompt, setFormPrompt] = React.useState('');
      const [formProvider, setFormProvider] = React.useState('');
      const [formModel, setFormModel] = React.useState('');
      const [formDelivery, setFormDelivery] = React.useState('isolated');
      const [selectedTaskMeta, setSelectedTaskMeta] = React.useState(null);
      const [modalTab, setModalTab] = React.useState('params');
      const [taskHistory, setTaskHistory] = React.useState([]);
      const [historyLoading, setHistoryLoading] = React.useState(false);
      const [formNotifyTelegram, setFormNotifyTelegram] = React.useState(false);
      const [formOnlyOnFailure, setFormOnlyOnFailure] = React.useState(false);
      const [formTimeoutSeconds, setFormTimeoutSeconds] = React.useState(1800);
      const [formOverlapPolicy, setFormOverlapPolicy] = React.useState('skip');
      const [formKanbanMode, setFormKanbanMode] = React.useState('none');
      const [stats, setStats] = React.useState(null);

      // Settings modal state
      const [settingsModalOpen, setSettingsModalOpen] = React.useState(false);
      const [settingsBotToken, setSettingsBotToken] = React.useState('');
      const [settingsChatId, setSettingsChatId] = React.useState('');
      const [settingsNotifyGlobal, setSettingsNotifyGlobal] = React.useState(false);
      const [settingsOnlyOnFailureGlobal, setSettingsOnlyOnFailureGlobal] = React.useState(false);
      const [settingsHasDefault, setSettingsHasDefault] = React.useState(false);
      const [testStatus, setTestStatus] = React.useState(null);

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
          if (settingsModalOpen) { setSettingsModalOpen(false); return; }
          if (manualModalOpen) { setManualModalOpen(false); return; }
          if (dshModalOpen) { setDshModalOpen(false); return; }
          if (dropdownOpen) { setDropdownOpen(false); return; }
          if (onClose) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [manualModalOpen, settingsModalOpen, dshModalOpen, dropdownOpen, onClose]);

      const fetchTasks = async () => {
        try {
          const res = await fetch('/dsh-cron/tasks?status=' + tab + '&query=' + encodeURIComponent(query));
          const data = await res.json();
          if (data && data.ok) {
            setTasks(data.tasks || []);
            setRecs(data.recommendations || []);
            if (data.stats) setStats(data.stats);
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

      const openSettingsModal = async () => {
        setTestStatus(null);
        setSettingsModalOpen(true);
        try {
          const res = await fetch('/dsh-cron/settings');
          const data = await res.json();
          if (data && data.ok && data.settings) {
            setSettingsBotToken(data.settings.botToken || '');
            setSettingsChatId(data.settings.chatId || '');
            setSettingsNotifyGlobal(Boolean(data.settings.notifyTelegram));
            setSettingsOnlyOnFailureGlobal(Boolean(data.settings.onlyOnFailure));
            setSettingsHasDefault(Boolean(data.settings.hasDefaultCredentials));
          }
        } catch (e) {}
      };

      const handleSaveSettings = async (e) => {
        e.preventDefault();
        try {
          const res = await fetch('/dsh-cron/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botToken: settingsBotToken,
              chatId: settingsChatId,
              notifyTelegram: settingsNotifyGlobal,
              onlyOnFailure: settingsOnlyOnFailureGlobal
            })
          });
          const data = await res.json();
          if (data && data.ok) {
            setSettingsModalOpen(false);
          } else {
            alert('Ошибка сохранения: ' + (data?.error || 'неизвестная ошибка'));
          }
        } catch (err) {
          alert('Ошибка сохранения: ' + err.message);
        }
      };

      const handleTestTelegram = async () => {
        setTestStatus({ loading: true, message: 'Отправка тестового сообщения...' });
        try {
          const res = await fetch('/dsh-cron/telegram/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botToken: settingsBotToken,
              chatId: settingsChatId
            })
          });
          const data = await res.json();
          if (data && data.ok) {
            setTestStatus({ loading: false, success: true, message: '✅ Тестовое сообщение успешно отправлено в Telegram!' });
          } else {
            setTestStatus({ loading: false, success: false, message: '❌ ' + (data?.error || 'Не удалось отправить сообщение') });
          }
        } catch (err) {
          setTestStatus({ loading: false, success: false, message: '❌ ' + err.message });
        }
      };

      const openManualModal = (preset) => {
        setDropdownOpen(false);
        setFormId(null);
        setSelectedTaskMeta(null);
        setFormType('llm');
        setFormDelivery('isolated');
        setFormNotifyTelegram(false);
        setFormOnlyOnFailure(false);
        setFormTimeoutSeconds(1800);
        setFormOverlapPolicy('skip');
        setFormKanbanMode('none');
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

      const loadTaskHistory = async (taskId) => {
        setHistoryLoading(true);
        try {
          const res = await fetch('/dsh-cron/action/' + encodeURIComponent(taskId) + '/history');
          const data = await res.json();
          if (data.ok) {
            setTaskHistory(data.history || []);
          }
        } catch (e) {
          console.error('[dsh-cron] history load failed:', e);
        } finally {
          setHistoryLoading(false);
        }
      };

      const openEditModal = (task) => {
        setDropdownOpen(false);
        setFormId(task.id);
        setSelectedTaskMeta(task);
        setModalTab('params');
        setFormTitle(task.title || '');
        setFormSchedule(task.schedule || '');
        setFormType(task.type || 'llm');
        setFormPrompt(task.prompt || '');
        setFormProvider(task.provider || '');
        setFormModel(task.model || '');
        setFormDelivery(task.delivery || 'isolated');
        setFormNotifyTelegram(Boolean(task.notifyTelegram));
        setFormOnlyOnFailure(Boolean(task.onlyOnFailure));
        setFormTimeoutSeconds(task.timeoutSeconds !== undefined ? task.timeoutSeconds : 1800);
        setFormOverlapPolicy(task.overlapPolicy || 'skip');
        setFormKanbanMode(task.kanbanMode || 'none');
        if (task.provider) loadModels(task.provider);
        else if (defaultModelInfo?.provider) loadModels(defaultModelInfo.provider);
        loadTaskHistory(task.id);
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
          const payload = {
            id: formId || undefined,
            title: formTitle,
            schedule: formSchedule,
            prompt: formPrompt,
            type: formType,
            delivery: formDelivery || 'isolated',
            provider: formType === 'script' ? undefined : (formProvider || undefined),
            model: formType === 'script' ? undefined : (formModel || undefined),
            notifyTelegram: formNotifyTelegram,
            onlyOnFailure: formOnlyOnFailure,
            timeoutSeconds: Number(formTimeoutSeconds) || 1800,
            overlapPolicy: formOverlapPolicy,
            kanbanMode: formKanbanMode,
          };
          const res = await fetch('/dsh-cron/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (!data.ok) { alert(data.error || 'Ошибка сохранения'); return; }
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

          await openSession(ctx, data.sessionId);
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
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px' },
                title: 'Настройки Telegram и уведомлений',
                onClick: openSettingsModal
              },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', color: '#60a5fa' }, dangerouslySetInnerHTML: { __html: ICON_TELEGRAM } }),
                'Telegram & Оповещения'
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
          stats && React.createElement('div', { className: 'dsh-cron-stats-bar' },
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val' }, stats.activeTasks || 0),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, 'Активных задач')
            ),
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val' }, stats.totalRuns || 0),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, 'Всего запусков')
            ),
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val' }, (stats.totalTokens || 0).toLocaleString()),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, 'Токенов израсходовано')
            ),
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val', style: { color: '#10b981' } }, '$' + (stats.totalCostUsd || 0).toFixed(4)),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, 'Оценочная стоимость')
            )
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
                  React.createElement('div', {
                    key: task.id,
                    className: 'dsh-cron-task-item',
                    onClick: () => openEditModal(task)
                  },
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-cron-task-status-btn',
                      'data-active': task.status === 'active' ? 'true' : undefined,
                      title: task.status === 'active' ? 'Приостановить' : 'Возобновить',
                      onClick: (e) => { e.stopPropagation(); handleToggleTask(task.id); }
                    }, React.createElement('span', { dangerouslySetInnerHTML: { __html: task.status === 'active' ? ICON_PAUSE : ICON_PLAY } })),
                    React.createElement('div', { className: 'dsh-cron-task-info' },
                      React.createElement('div', { className: 'dsh-cron-task-title' },
                        task.title,
                        React.createElement('span', {
                          className: 'dsh-cron-type-tag',
                          style: {
                            background: task.type === 'script' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: task.type === 'script' ? '#60a5fa' : '#34d399'
                          }
                        }, task.type === 'script' ? 'Shell' : 'LLM'),
                        task.model ? React.createElement('span', { className: 'dsh-cron-task-model-tag' }, task.model.split('/').pop()) : null,
                        task.totalCostUsd > 0 ? React.createElement('span', { className: 'dsh-cron-cost-tag' }, '$' + task.totalCostUsd.toFixed(4)) : null,
                        task.totalTokens > 0 ? React.createElement('span', { className: 'dsh-cron-tokens-tag' }, (task.totalTokens > 1000 ? Math.round(task.totalTokens / 1000) + 'k' : task.totalTokens) + ' tok') : null
                      ),
                      React.createElement('div', { className: 'dsh-cron-task-sched' },
                        task.scheduleText || task.schedule,
                        task.nextRunAt ? ` · след: ${new Date(task.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
                      ),
                      task.prompt ? React.createElement('div', {
                        className: 'dsh-cron-task-prompt-preview',
                        title: task.prompt
                      }, task.prompt.slice(0, 140) + (task.prompt.length > 140 ? '…' : '')) : null
                    ),
                    React.createElement('div', {
                      className: 'dsh-cron-task-actions',
                      onClick: (e) => e.stopPropagation()
                    },
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: 'Запустить немедленно',
                        onClick: () => handleRunNow(task.id)
                      }, 'Запустить'),
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: 'Редактировать / Подробнее',
                        onClick: () => openEditModal(task)
                      }, React.createElement('span', { dangerouslySetInnerHTML: { __html: ICON_EDIT } })),
                      React.createElement('button', {
                        type: 'button',
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

        // 1. Manual creation / Edit modal
        manualModalOpen && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => setManualModalOpen(false) },
          React.createElement('div', {
            className: 'dsh-cron-modal',
            style: { maxWidth: '640px' },
            onClick: (e) => e.stopPropagation()
          },
            React.createElement('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formId ? '12px' : '18px' } },
              React.createElement('div', { className: 'dsh-cron-modal-title', style: { margin: 0 } }, formId ? 'Редактирование задачи' : 'Новая запланированная задача'),
              selectedTaskMeta && React.createElement('span', {
                style: {
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: selectedTaskMeta.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: selectedTaskMeta.status === 'active' ? '#10b981' : '#ef4444'
                }
              }, selectedTaskMeta.status === 'active' ? '● Активна' : '○ На паузе')
            ),

            formId && React.createElement('div', { className: 'dsh-cron-modal-nav' },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-modal-tab',
                'data-active': modalTab === 'params',
                onClick: () => setModalTab('params')
              }, 'Параметры'),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-modal-tab',
                'data-active': modalTab === 'history',
                onClick: () => { setModalTab('history'); if (formId) loadTaskHistory(formId); }
              }, 'История запусков (' + (taskHistory.length || 0) + ')')
            ),

            modalTab === 'history' && formId ? React.createElement('div', null,
              historyLoading ? React.createElement('div', { className: 'dsh-cron-history-empty' }, 'Загрузка истории...') :
              taskHistory.length === 0 ? React.createElement('div', { className: 'dsh-cron-history-empty' }, 'История запусков пока пуста') :
              React.createElement('div', { className: 'dsh-cron-history-list' },
                taskHistory.map((run) => React.createElement('div', { key: run.id, className: 'dsh-cron-history-item' },
                  React.createElement('div', { className: 'dsh-cron-history-head' },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      React.createElement('span', {
                        className: 'dsh-cron-history-status',
                        'data-status': run.status
                      }, run.status === 'success' ? 'Успешно' : run.status === 'skipped' ? 'Пропущен' : 'Ошибка'),
                      React.createElement('span', { className: 'dsh-cron-history-time' }, run.at ? new Date(run.at).toLocaleString() : '')
                    ),
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      run.costUsd > 0 && React.createElement('span', { className: 'dsh-cron-cost-tag' }, '$' + run.costUsd.toFixed(5)),
                      run.usage && (run.usage.inputTokens > 0 || run.usage.outputTokens > 0) && React.createElement('span', { className: 'dsh-cron-tokens-tag' }, (run.usage.inputTokens + run.usage.outputTokens) + ' tok'),
                      React.createElement('span', { style: { color: '#888', fontSize: '11.5px' } }, (run.durationMs || 0) + ' ms')
                    )
                  ),
                  run.output && React.createElement('div', { className: 'dsh-cron-history-output' }, run.output),
                  run.error && React.createElement('div', { className: 'dsh-cron-history-output', style: { color: '#ef4444', borderColor: '#552222' } }, run.error)
                ))
              ),
              React.createElement('div', { className: 'dsh-cron-modal-foot', style: { marginTop: '18px' } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  onClick: () => { if (formId) loadTaskHistory(formId); }
                }, 'Обновить историю'),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-primary',
                  onClick: () => setManualModalOpen(false)
                }, 'Закрыть')
              )
            ) :

            React.createElement('form', { onSubmit: handleSaveManual },
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, 'Название задачи'),
                React.createElement('input', {
                  required: true,
                  value: formTitle,
                  placeholder: 'Например: dsh-tags-watch',
                  onChange: (e) => setFormTitle(e.target.value)
                })
              ),
              React.createElement('div', { className: 'dsh-cron-form-row', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, 'Тип выполнения'),
                  React.createElement('select', {
                    value: formType,
                    onChange: (e) => setFormType(e.target.value)
                  },
                    React.createElement('option', { value: 'llm' }, 'LLM (Агент с нейросетью)'),
                    React.createElement('option', { value: 'script' }, 'NO-LLM (Shell-команда/Скрипт)')
                  )
                ),
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, 'Расписание (cron или интервал)'),
                  React.createElement('input', {
                    required: true,
                    value: formSchedule,
                    placeholder: '0 */6 * * * или every 2h',
                    onChange: (e) => setFormSchedule(e.target.value)
                  })
                )
              ),
              React.createElement('div', { className: 'dsh-cron-form-row', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, 'Таймаут выполнения (секунды)'),
                  React.createElement('input', {
                    type: 'number',
                    min: 1,
                    value: formTimeoutSeconds,
                    placeholder: '1800',
                    onChange: (e) => setFormTimeoutSeconds(e.target.value)
                  })
                ),
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, 'Политика наложения (Overlap)'),
                  React.createElement('select', {
                    value: formOverlapPolicy,
                    onChange: (e) => setFormOverlapPolicy(e.target.value)
                  },
                    React.createElement('option', { value: 'skip' }, 'Пропустить новый запуск (skip)'),
                    React.createElement('option', { value: 'queue' }, 'Встать в очередь (queue)'),
                    React.createElement('option', { value: 'replace' }, 'Отменить текущий и перезапустить (replace)')
                  )
                )
              ),
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, 'Создание карточки в Kanban (dsh-kanban)'),
                React.createElement('select', {
                  value: formKanbanMode,
                  onChange: (e) => setFormKanbanMode(e.target.value)
                },
                  React.createElement('option', { value: 'none' }, 'Не создавать карточки (отключено)'),
                  React.createElement('option', { value: 'on_failure' }, 'Создавать тикет при ошибке/сбое (в Backlog)'),
                  React.createElement('option', { value: 'always' }, 'Создавать карточку при каждом завершении (Done / Backlog)')
                )
              ),
              formType !== 'script' && React.createElement('div', { className: 'dsh-cron-form-row', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
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
                React.createElement('label', null, formType === 'script' ? 'Shell-команда или скрипт' : 'Инструкция / Промпт для агента'),
                React.createElement('textarea', {
                  required: true,
                  rows: 9,
                  style: { fontFamily: 'monospace', fontSize: '12.5px', lineHeight: '1.45' },
                  value: formPrompt,
                  placeholder: formType === 'script' ? 'curl -fsSL https://... || exit 1' : 'Опишите, что именно агент должен сделать...',
                  onChange: (e) => setFormPrompt(e.target.value)
                })
              ),
              React.createElement('div', {
                style: {
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid #2e2e2e',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px'
                }
              },
                React.createElement('div', { style: { fontWeight: 500, fontSize: '13px', color: '#eee', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' } },
                  React.createElement('span', { style: { display: 'flex', alignItems: 'center', color: '#60a5fa' }, dangerouslySetInnerHTML: { __html: ICON_TELEGRAM } }),
                  'Уведомления в Telegram'
                ),
                React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginBottom: formNotifyTelegram ? '8px' : '0' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: formNotifyTelegram,
                    onChange: (e) => setFormNotifyTelegram(e.target.checked)
                  }),
                  React.createElement('span', null, 'Отправлять отчет о выполнении в Telegram')
                ),
                formNotifyTelegram && React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginLeft: '24px', marginTop: '6px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: formOnlyOnFailure,
                    onChange: (e) => setFormOnlyOnFailure(e.target.checked)
                  }),
                  React.createElement('span', null, 'Только при ошибках (onlyOnFailure / silent mode при успехе)')
                )
              ),
              selectedTaskMeta && React.createElement('div', {
                style: {
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid #2e2e2e',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  color: '#999',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }
              },
                React.createElement('div', null,
                  React.createElement('span', null, 'Следующий запуск: '),
                  React.createElement('strong', { style: { color: '#eee' } }, selectedTaskMeta.nextRunAt ? new Date(selectedTaskMeta.nextRunAt).toLocaleString() : 'не запланирован')
                ),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  style: { padding: '4px 10px', fontSize: '12px' },
                  onClick: async () => {
                    await handleRunNow(selectedTaskMeta.id);
                    if (formId) loadTaskHistory(formId);
                  }
                }, 'Запустить сейчас')
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
                }, formId ? 'Сохранить изменения' : 'Создать задачу')
              )
            )
          )
        ),

        // 1.5 Settings Modal
        settingsModalOpen && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => setSettingsModalOpen(false) },
          React.createElement('div', { className: 'dsh-cron-modal', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' } },
              React.createElement('div', { className: 'dsh-cron-modal-title', style: { margin: 0, display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', color: '#60a5fa' }, dangerouslySetInnerHTML: { __html: ICON_TELEGRAM } }),
                'Настройки Telegram и уведомлений'
              ),
              React.createElement('button', {
                type: 'button',
                style: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' },
                onClick: () => setSettingsModalOpen(false)
              }, '✕')
            ),
            React.createElement('form', { onSubmit: handleSaveSettings },
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, 'Telegram Bot Token'),
                React.createElement('input', {
                  type: 'password',
                  value: settingsBotToken,
                  placeholder: settingsHasDefault ? 'Используется бот из настроек DSH (или введите свой)' : '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
                  onChange: (e) => setSettingsBotToken(e.target.value)
                }),
                settingsHasDefault && React.createElement('div', { className: 'dsh-cron-hint' }, '✓ Обнаружен настроенный бот в профиле DSH')
              ),
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, 'Telegram Chat ID'),
                React.createElement('input', {
                  value: settingsChatId,
                  placeholder: 'Например: 345678901',
                  onChange: (e) => setSettingsChatId(e.target.value)
                })
              ),
              React.createElement('div', { style: { background: 'rgba(255,255,255,0.02)', border: '1px solid #2e2e2e', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' } },
                React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginBottom: '8px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: settingsNotifyGlobal,
                    onChange: (e) => setSettingsNotifyGlobal(e.target.checked)
                  }),
                  React.createElement('span', null, 'Глобально отправлять отчеты всех задач в Telegram')
                ),
                React.createElement('label', { className: 'dsh-cron-checkbox-row' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: settingsOnlyOnFailureGlobal,
                    onChange: (e) => setSettingsOnlyOnFailureGlobal(e.target.checked)
                  }),
                  React.createElement('span', null, 'Глобальный режим: Только при ошибках (silent при успехе)')
                )
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  style: { display: 'inline-flex', alignItems: 'center', gap: '6px' },
                  disabled: testStatus?.loading,
                  onClick: handleTestTelegram
                }, testStatus?.loading ? 'Отправка...' : '🔔 Проверить отправку в Telegram')
              ),
              testStatus && testStatus.message && React.createElement('div', {
                className: 'dsh-cron-status-banner',
                'data-type': testStatus.success ? 'success' : 'error'
              }, testStatus.message),
              React.createElement('div', { className: 'dsh-cron-modal-foot' },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  onClick: () => setSettingsModalOpen(false)
                }, 'Отмена'),
                React.createElement('button', {
                  type: 'submit',
                  className: 'dsh-cron-btn-primary'
                }, 'Сохранить настройки')
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
