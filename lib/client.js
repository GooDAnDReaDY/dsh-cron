window.__ModuleLoader__.load({
  id: '@goodandready/dsh-cron',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = window.React || require('react');
    const ReactDOM = window.ReactDOM || require('react-dom/client');

    // Settings namespace, locale namespace and plugin marker share the same
    // canonical identifier — the settings.plugin.item slot key MUST match the
    // namespace registered on the server ('dsh-cron', Issue #85).
    const PLUGIN_ID = '@goodandready/dsh-cron';
    const NS = 'dsh-cron';
    const PANEL = 'cron';
    const ACTIVATE_EVENT = 'dsh-panel-activate';
    const ACTIVE_ATTR = 'data-dsh-cron-active';
    const ENTRY_ATTR = 'data-dsh-cron-entry';
    const VIEW_ATTR = 'data-dsh-cron-view';
    const COLUMN_SELECTOR = '[data-pane=conversation], [class*=centerCol]';
    const SESSION_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="newSession"]';
    const SCRIPT_CONFIRM_HEADER = 'x-dsh-cron-confirm';

    const BACK_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>';
    const ICON_TIMER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    const ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 21"></polygon></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    const ICON_TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    const ICON_BELL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
    const ICON_CLIPBOARD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>';
    const ICON_ACTIVITY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>';
    const ICON_EDIT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    const ICON_SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    const ICON_TELEGRAM = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8-1.7 8.01c-.13.58-.47.72-.95.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.53.26l.19-2.64 4.81-4.35c.21-.19-.05-.29-.32-.11L8.34 13.5 5.78 12.7c-.56-.17-.57-.56.12-.83l10-3.86c.46-.17.87.11.74.79z"/></svg>';

    // Locale dictionary: English is the canonical source language (Issue #87).
    // Russian and other languages are provided at runtime by the translation
    // plugin; no per-language duplicates are stored here.
    const STRINGS = {
      en: {
        'sidebar.label': 'Scheduled tasks',
        'chip.title': 'Scheduled tasks (Cron)',
        'panel.back': 'Back to chat',
        'panel.title': 'Scheduled tasks',
        'panel.subtitle': 'Ask DSH to plan tasks, set reminders or track updates',
        'actions.create': 'Create',
        'actions.createWithDsh': '💬 Create with DSH',
        'actions.setupManually': '✏️ Set up manually',
        'actions.runNow': 'Run now',
        'actions.runNowShort': 'Run',
        'actions.edit': 'Edit / Details',
        'actions.delete': 'Delete task',
        'actions.pause': 'Pause',
        'actions.resume': 'Resume',
        'actions.settings': 'Telegram & Notifications',
        'search.placeholder': 'Search scheduled tasks',
        'stats.activeTasks': 'Active tasks',
        'stats.totalRuns': 'Total runs',
        'stats.totalTokens': 'Tokens spent',
        'stats.totalCost': 'Estimated cost',
        'tabs.all': 'All',
        'tabs.active': 'Active',
        'tabs.paused': 'Paused',
        'tabs.completed': 'Completed',
        'banner.loadError': 'Failed to load tasks: {error}',
        'banner.retry': 'Retry',
        'list.loading': 'Loading scheduled tasks...',
        'list.empty': 'No scheduled tasks yet',
        'list.typeShell': 'Shell',
        'list.typeLlm': 'LLM',
        'list.oneShot': 'One-shot',
        'list.next': ' · next: {time}',
        'recs.title': 'Recommended tasks',
        'modal.editTitle': 'Edit task',
        'modal.newTitle': 'New scheduled task',
        'modal.statusActive': '● Active',
        'modal.statusPaused': '○ Paused',
        'modal.params': 'Parameters',
        'modal.history': 'Run history ({count})',
        'modal.cancel': 'Cancel',
        'modal.save': 'Save changes',
        'modal.create': 'Create task',
        'modal.close': 'Close',
        'history.loading': 'Loading history...',
        'history.empty': 'No runs recorded yet',
        'history.refresh': 'Refresh history',
        'history.statusSuccess': 'Success',
        'history.statusSkipped': 'Skipped',
        'history.statusMissed': 'Missed',
        'history.statusTimeout': 'Timeout',
        'history.statusFailed': 'Failed',
        'form.nameLabel': 'Task name',
        'form.namePlaceholder': 'For example: dsh-tags-watch',
        'form.typeLabel': 'Execution type',
        'form.typeLlm': 'LLM (AI agent)',
        'form.typeScript': 'NO-LLM (Shell command/script)',
        'form.scheduleLabel': 'Schedule (cron or interval)',
        'form.schedulePlaceholder': '0 */6 * * * or every 2h or in 30m or at: 2026-09-05T15:00:00Z',
        'form.timeoutLabel': 'Execution timeout (seconds)',
        'form.overlapLabel': 'Overlap policy',
        'form.overlapSkip': 'Skip the new run (skip)',
        'form.overlapQueue': 'Queue the next run (queue)',
        'form.overlapReplace': 'Cancel current run and restart (replace)',
        'form.kanbanLabel': 'Kanban card creation (dsh-kanban)',
        'form.kanbanNone': 'Do not create cards (disabled)',
        'form.kanbanOnFailure': 'Create a ticket on failure (into Backlog)',
        'form.kanbanAlways': 'Create a card on every completion (Done / Backlog)',
        'form.providerLabel': 'LLM provider',
        'form.providerDefault': 'Default (DSH)',
        'form.modelLabel': 'LLM model',
        'form.modelDefault': 'Default',
        'form.promptLabelScript': 'Shell command or script',
        'form.promptLabelLlm': 'Instruction / Prompt for the agent',
        'form.promptPlaceholderScript': 'curl -fsSL https://... || exit 1',
        'form.promptPlaceholderLlm': 'Describe exactly what the agent should do...',
        'form.notifyTitle': 'Telegram notifications',
        'form.notifyTelegram': 'Send the run report to Telegram',
        'form.notifyOnlyFailure': 'Only on failures (onlyOnFailure / silent on success)',
        'form.nextRunLabel': 'Next run: ',
        'form.notScheduled': 'not scheduled',
        'settings.sectionLabel': 'Cron tasks',
        'settings.cardTitle': '⏰ Task scheduler (Cron)',
        'settings.cardDesc': 'Scheduled task execution (cron/intervals), background agent scenarios and Telegram/Kanban integration.',
        'settings.openPanel': 'Open task panel',
        'settings.modalTitle': 'Telegram & notification settings',
        'settings.tokenLabel': 'Telegram Bot Token',
        'settings.tokenPlaceholder': '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
        'settings.tokenPlaceholderDefault': 'Using the bot configured in DSH settings (or enter your own)',
        'settings.defaultHint': '✓ A configured bot was found in the DSH profile',
        'settings.chatIdLabel': 'Telegram Chat ID',
        'settings.chatIdPlaceholder': 'For example: 345678901',
        'settings.kanbanUrlLabel': 'Kanban Base URL',
        'settings.globalNotify': 'Deliver reports of all tasks to Telegram globally',
        'settings.globalOnlyFailure': 'Global mode: only on failures (silent on success)',
        'settings.testTelegram': '🔔 Test Telegram delivery',
        'settings.testKanban': '📋 Test Kanban',
        'settings.sending': 'Sending...',
        'settings.checkingKanban': 'Checking Kanban...',
        'settings.testOk': '✅ Test message delivered to Telegram!',
        'settings.testFail': '❌ {error}',
        'settings.kanbanOk': '✅ Kanban card created',
        'settings.kanbanFail': '❌ {error}',
        'settings.save': 'Save settings',
        'settings.saved': '✓ Saved',
        'settings.saveError': 'Save failed: {error}',
        'settings.saveErrorUnknown': 'unknown error',
        'dsh.modalTitle': 'Schedule a task with the DSH agent',
        'dsh.descLabel': 'Describe the task and the desired frequency:',
        'dsh.placeholder': 'For example: check free disk space and failed systemd services every 2 hours, and alert only if something is wrong...',
        'dsh.sendHint': 'Ctrl+Enter to send',
        'dsh.sendTitle': 'Send to agent',
        'dsh.startFailed': 'Failed to start the agent dialog: {error}',
        'dsh.launchError': 'Launch failed: {error}',
        'confirm.delete': 'Delete this task?',
        'list.loadErrorPrefix': 'Failed to load tasks'
      }
    };

    // Module-level translator. apply() rebinds it to the DSH locale service so
    // the active language and live language switches are honored.
    let translate = (key, vars) => {
      let s = (STRINGS.en && STRINGS.en[key]) || key;
      if (vars) {
        for (const k of Object.keys(vars)) {
          s = s.split('{' + k + '}').join(String(vars[k]));
        }
      }
      return s;
    };
    const T = (key, vars) => translate(key, vars);

    // Core chevron primitive when the build ships it; own SVG fallback otherwise.
    let CoreChevron = null;
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
      CoreChevron = primitives && primitives.IconChevronDownOutline14;
    } catch (e) {}
    const chevronNode = () => (CoreChevron ? React.createElement(CoreChevron) : React.createElement('span', { style: { display: 'flex', alignItems: 'center' }, dangerouslySetInnerHTML: { __html: ICON_CHEVRON_DOWN } }));

    // Status colors: core semantic tokens first, plugin fallbacks as a single
    // point of change (Issue #91 — no scattered hardcoded hex).
    const STYLES = `
      :root {
        --dsh-cron-success: var(--dsw-alias-label-success, #10b981);
        --dsh-cron-success-bg: var(--dsw-alias-bg-success, rgba(16, 185, 129, 0.15));
        --dsh-cron-danger: var(--dsw-alias-label-danger, #ef4444);
        --dsh-cron-danger-bg: var(--dsw-alias-bg-danger, rgba(239, 68, 68, 0.15));
        --dsh-cron-info: var(--dsw-alias-label-info, #60a5fa);
        --dsh-cron-info-bg: var(--dsw-alias-bg-info, rgba(59, 130, 246, 0.15));
        --dsh-cron-accent: var(--dsw-alias-label-accent, #c084fc);
        --dsh-cron-accent-bg: var(--dsw-alias-bg-accent, rgba(168, 85, 247, 0.15));
        --dsh-cron-warning: var(--dsw-alias-label-warning, #eab308);
        --dsh-cron-warning-bg: var(--dsw-alias-bg-warning, rgba(234, 179, 8, 0.15));
      }
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
      .dsh-cron-create-btn { appearance: none; display: inline-flex; align-items: center; gap: 6px; background: var(--dsw-alias-bg-layer-4, #262626); color: var(--dsw-alias-label-primary, #fff); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 9999px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; position: relative; }
      .dsh-cron-create-btn:hover { background: var(--dsw-alias-bg-layer-hover, var(--dsw-alias-interactive-bg-hover, #333)); }
      .dsh-cron-dropdown { position: absolute; top: calc(100% + 6px); right: 0; width: 200px; background: var(--dsw-alias-bg-layer-3, #212121); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 12px; padding: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 200; }
      .dsh-cron-dropdown-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: var(--dsw-alias-label-primary, #ededed); font-size: 13.5px; text-align: left; cursor: pointer; }
      .dsh-cron-dropdown-item:hover { background: var(--dsw-alias-interactive-bg-hover, #2a2a2a); }
      .dsh-cron-search-bar { position: relative; margin-bottom: 20px; }
      .dsh-cron-search-input { width: 100%; background: var(--dsw-alias-bg-layer-3, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 10px; padding: 10px 14px 10px 38px; color: var(--dsw-alias-label-primary, inherit); font-size: 14px; outline: none; box-sizing: border-box; }
      .dsh-cron-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-tertiary, #666); }
      .dsh-cron-tabs { display: flex; gap: 8px; margin-bottom: 24px; }
      .dsh-cron-tab { appearance: none; background: transparent; border: none; padding: 6px 14px; border-radius: 9999px; color: var(--dsw-alias-label-secondary, #9ca3af); font-size: 13.5px; cursor: pointer; }
      .dsh-cron-tab[data-active="true"] { background: var(--dsw-alias-bg-layer-4, #2a2a2a); color: var(--dsw-alias-label-primary, #fff); font-weight: 500; }
      .dsh-cron-task-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 40px; }
      .dsh-cron-task-item { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--dsw-alias-bg-layer-3, #1e1e1e); border: 1px solid var(--dsw-alias-border-l2, #2e2e2e); border-radius: 12px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
      .dsh-cron-task-item:hover, .dsh-cron-task-item:focus-visible { background: var(--dsw-alias-bg-layer-4, #242424); border-color: var(--dsw-alias-border-l1, #444); outline: none; }
      .dsh-cron-task-prompt-preview { font-size: 12.5px; color: var(--dsw-alias-label-tertiary, #888); margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 520px; line-height: 1.3; }
      .dsh-cron-type-tag { display: inline-block; font-size: 10.5px; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; font-weight: 600; margin-left: 8px; vertical-align: middle; }
      .dsh-cron-task-model-tag { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 4px; background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.06)); color: var(--dsw-alias-label-secondary, #aaa); margin-left: 8px; vertical-align: middle; }
      .dsh-cron-task-actions { display: flex; gap: 8px; }
      .dsh-cron-icon-btn { background: transparent; border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 6px 12px; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #aaa); cursor: pointer; }
      .dsh-cron-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover, #2a2a2a); color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-task-status-btn { background: none; border: 1px solid var(--dsw-alias-border-l1, #444); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; flex-shrink: 0; }
      .dsh-cron-task-status-btn[data-active="true"] { color: var(--dsh-cron-success); border-color: var(--dsh-cron-success); }
      .dsh-cron-recs-title { font-size: 17px; font-weight: 600; margin-bottom: 14px; }
      .dsh-cron-recs-list { display: flex; flex-direction: column; gap: 10px; }
      .dsh-cron-rec-card { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: var(--dsw-alias-bg-layer-3, #1c1c1c); border: 1px solid var(--dsw-alias-border-l1, #282828); border-radius: 12px; cursor: pointer; transition: background 0.15s; }
      .dsh-cron-rec-card:hover, .dsh-cron-rec-card:focus-visible { background: var(--dsw-alias-bg-layer-4, #242424); border-color: var(--dsw-alias-border-l2, #383838); outline: none; }
      .dsh-cron-rec-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.03)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .dsh-cron-rec-content { flex: 1; min-width: 0; }
      .dsh-cron-rec-title { font-size: 14.5px; font-weight: 500; margin-bottom: 4px; }
      .dsh-cron-rec-time { font-size: 13px; color: var(--dsw-alias-label-secondary, #9ca3af); font-weight: normal; margin-left: 8px; }
      .dsh-cron-rec-desc { font-size: 13px; color: var(--dsw-alias-label-tertiary, #71717a); }

      .dsh-cron-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .dsh-cron-modal { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 16px; width: 100%; max-width: 540px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); box-sizing: border-box; }
      .dsh-cron-modal-title { font-size: 18px; font-weight: 600; margin-bottom: 18px; }
      .dsh-cron-form-group { margin-bottom: 16px; }
      .dsh-cron-form-group label { display: block; font-size: 13px; color: var(--dsw-alias-label-secondary, #aaa); margin-bottom: 6px; }
      .dsh-cron-form-group input, .dsh-cron-form-group textarea, .dsh-cron-form-group select { width: 100%; background: var(--dsw-alias-bg-base, #141414); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 9px 12px; color: var(--dsw-alias-label-primary, #fff); font-size: 13.5px; outline: none; box-sizing: border-box; }
      .dsh-cron-form-group select { cursor: pointer; }
      .dsh-cron-form-group textarea { min-height: 80px; resize: vertical; }
      .dsh-cron-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .dsh-cron-modal-foot { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 20px; }
      .dsh-cron-btn-primary { background: var(--dsw-alias-label-primary, #ededed); color: var(--dsw-alias-bg-base, #111); border: none; border-radius: 8px; padding: 7px 16px; font-size: 13.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .dsh-cron-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .dsh-cron-btn-secondary { background: transparent; color: var(--dsw-alias-label-secondary, #999); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 8px; padding: 7px 16px; font-size: 13.5px; cursor: pointer; }
      .dsh-cron-chat-box { position: relative; background: var(--dsw-alias-bg-base, #141414); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 12px; padding: 12px; }
      .dsh-cron-chat-input { width: 100%; background: transparent; border: none; color: var(--dsw-alias-label-primary, #fff); font-size: 14px; min-height: 100px; resize: vertical; outline: none; box-sizing: border-box; line-height: 1.5; }
      .dsh-cron-chat-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, #222); }
      .dsh-cron-chat-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #666); }
      .dsh-cron-send-btn { width: 34px; height: 34px; border-radius: 8px; background: var(--dsw-alias-label-primary, #ededed); color: var(--dsw-alias-bg-base, #111); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s, background 0.15s; }
      .dsh-cron-send-btn:hover:not(:disabled) { transform: translateY(-1px); }
      .dsh-cron-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .dsh-cron-card { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l1, #333); border-radius: 12px; padding: 14px 20px; margin-bottom: 16px; }
      .dsh-cron-card-head-btn { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; background: 0 0; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 12px; padding: 4px 0; }
      .dsh-cron-card-head-btn .dsh-cron-card-title { flex: 1; }
      .dsh-cron-card-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-chev { margin-left: auto; flex: none; color: var(--dsw-alias-label-tertiary, #888); transition: transform 0.16s; display: flex; align-items: center; }
      .dsh-cron-chev-open { transform: rotate(180deg); }
      .dsh-cron-card-body { border-top: 1px solid var(--dsw-alias-border-l1, #333); margin-top: 12px; padding-top: 14px; }
      .dsh-cron-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .dsh-cron-card-desc { font-size: 13px; color: var(--dsw-alias-label-secondary, #888); margin-bottom: 16px; line-height: 1.4; }

      .dsh-cron-modal-nav { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, #2e2e2e); margin-bottom: 18px; padding-bottom: 2px; }
      .dsh-cron-modal-tab { appearance: none; background: transparent; border: none; border-bottom: 2px solid transparent; padding: 8px 14px; font-size: 13.5px; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; font-weight: 500; transition: color 0.15s, border-color 0.15s; }
      .dsh-cron-modal-tab:hover { color: var(--dsw-alias-label-secondary, #ccc); }
      .dsh-cron-modal-tab[data-active="true"] { color: var(--dsw-alias-label-primary, #fff); border-bottom-color: var(--dsw-alias-label-primary, #ededed); }
      .dsh-cron-history-list { display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow-y: auto; padding-right: 4px; }
      .dsh-cron-history-item { background: var(--dsw-alias-bg-base, #161616); border: 1px solid var(--dsw-alias-border-l1, #2a2a2a); border-radius: 8px; padding: 12px 14px; font-size: 12.5px; }
      .dsh-cron-history-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .dsh-cron-history-status { font-weight: 600; font-size: 11.5px; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
      .dsh-cron-history-status[data-status="success"] { background: var(--dsh-cron-success-bg); color: var(--dsh-cron-success); }
      .dsh-cron-history-status[data-status="error"], .dsh-cron-history-status[data-status="timeout"] { background: var(--dsh-cron-danger-bg); color: var(--dsh-cron-danger); }
      .dsh-cron-history-status[data-status="skipped"], .dsh-cron-history-status[data-status="missed"] { background: var(--dsh-cron-warning-bg); color: var(--dsh-cron-warning); }
      .dsh-cron-history-time { color: var(--dsw-alias-label-tertiary, #777); font-size: 12px; }
      .dsh-cron-history-output { background: var(--dsw-alias-bg-base, #0c0c0c); border: 1px solid var(--dsw-alias-border-l1, #222); border-radius: 6px; padding: 8px 10px; font-family: monospace; font-size: 12px; color: var(--dsw-alias-label-secondary, #bbb); max-height: 140px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin-top: 6px; }
      .dsh-cron-history-empty { text-align: center; padding: 36px 0; color: var(--dsw-alias-label-tertiary, #666); font-size: 13.5px; }

      .dsh-cron-stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
      .dsh-cron-stat-card { background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.02)); border: 1px solid var(--dsw-alias-border-l1, #222); border-radius: 8px; padding: 10px 14px; }
      .dsh-cron-stat-val { font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-stat-lbl { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #777); margin-top: 2px; }
      .dsh-cron-oneshot-tag { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--dsh-cron-accent-bg); color: var(--dsh-cron-accent); font-weight: 500; }
      .dsh-cron-cost-tag { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--dsh-cron-success-bg); color: var(--dsh-cron-success); font-weight: 500; }
      .dsh-cron-tokens-tag { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--dsh-cron-info-bg); color: var(--dsh-cron-info); }
      .dsh-cron-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dsw-alias-label-secondary, #ccc); cursor: pointer; user-select: none; }
      .dsh-cron-checkbox-row input { width: 15px; height: 15px; margin: 0; cursor: pointer; accent-color: var(--dsw-alias-label-primary, #ededed); }
      .dsh-cron-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); margin-top: 4px; }
      .dsh-cron-status-banner { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-top: 12px; }
      .dsh-cron-status-banner[data-type="success"] { background: var(--dsh-cron-success-bg); border: 1px solid var(--dsh-cron-success); color: var(--dsh-cron-success); }
      .dsh-cron-status-banner[data-type="error"] { background: var(--dsh-cron-danger-bg); border: 1px solid var(--dsh-cron-danger); color: var(--dsh-cron-danger); }
      .dsh-cron-status-banner[data-type="info"] { background: var(--dsh-cron-info-bg); border: 1px solid var(--dsh-cron-info); color: var(--dsh-cron-info); }
    `;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('dsh-cron-styles');
      if (!el) {
        el = document.createElement('style');
        el.id = 'dsh-cron-styles';
        // Mark ownership before insertion so neighbor cleanups leave it alone (#91)
        el.dataset.dshPlugin = 'dsh-cron';
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

      // 1. Try sessions.open(sessionId) immediately
      if (sessions && typeof sessions.open === 'function') {
        try {
          sessions.open(sessionId);
          return true;
        } catch (e) {}
      }

      // 2. If the session is not in manager.summaries yet, refresh from the backend
      if (sessions && typeof sessions.refresh === 'function') {
        try {
          await sessions.refresh();
          sessions.open(sessionId);
          return true;
        } catch (e) {}
      }

      // 3. Async retries until the WebSocket/SSE event adds the session to the list
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 120));
        sessions = getSessions();
        if (sessions && typeof sessions.open === 'function') {
          try {
            sessions.open(sessionId);
            return true;
          } catch (e) {}
        }
        // DOM fallback: click the session in the sidebar if it has rendered
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

    function statusLabel(t, status) {
      if (status === 'success') return T_KEY(t, 'history.statusSuccess');
      if (status === 'skipped') return T_KEY(t, 'history.statusSkipped');
      if (status === 'missed') return T_KEY(t, 'history.statusMissed');
      if (status === 'timeout') return T_KEY(t, 'history.statusTimeout');
      return T_KEY(t, 'history.statusFailed');
    }
    function T_KEY(t, key, vars) {
      return (typeof t === 'function' ? t : translate)(key, vars);
    }

    function CronScreen(props) {
      const { ctx, toggle, onClose } = props;
      const t = props.t || translate;
      const [tab, setTab] = React.useState('all');
      const [query, setQuery] = React.useState('');
      const [tasks, setTasks] = React.useState([]);
      const [recs, setRecs] = React.useState([]);
      const [loading, setLoading] = React.useState(false);
      const [fetchError, setFetchError] = React.useState(null);
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
      const [settingsKanbanUrl, setSettingsKanbanUrl] = React.useState('http://127.0.0.1:3000');
      const [settingsHasDefault, setSettingsHasDefault] = React.useState(false);
      const [settingsHasCustomBotToken, setSettingsHasCustomBotToken] = React.useState(false);
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
          if (e.key === 'Escape') {
            if (dropdownOpen) { setDropdownOpen(false); return; }
            if (manualModalOpen) { setManualModalOpen(false); return; }
            if (settingsModalOpen) { setSettingsModalOpen(false); return; }
            if (dshModalOpen && !dshLoading) { setDshModalOpen(false); return; }
            if (onClose) onClose();
            else toggle.set(false);
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [manualModalOpen, settingsModalOpen, dshModalOpen, dropdownOpen, onClose]);

      const fetchTasks = async () => {
        setLoading(true);
        setFetchError(null);
        try {
          const res = await fetch('/dsh-cron/tasks?status=' + encodeURIComponent(tab) + '&query=' + encodeURIComponent(query));
          const data = await res.json();
          if (data && data.ok) {
            setTasks(data.tasks || []);
            setRecs(data.recommendations || []);
            setStats(data.stats || null);
          } else {
            setFetchError(data && data.error ? data.error : T_KEY(t, 'list.loadErrorPrefix'));
          }
        } catch (err) {
          console.error('[dsh-cron] fetch tasks error:', err);
          setFetchError(err.message || T_KEY(t, 'list.loadErrorPrefix'));
        } finally {
          setLoading(false);
        }
      };

      const loadModels = async (providerName) => {
        try {
          const url = providerName ? '/dsh-cron/models?provider=' + encodeURIComponent(providerName) : '/dsh-cron/models';
          const res = await fetch(url);
          const data = await res.json();
          if (data && data.ok) {
            if (!providerName) {
              setProviders(data.providers || []);
              setDefaultModelInfo(data.defaultModel || data.current || null);
              if (data.defaultModel?.models) {
                setModels(data.defaultModel.models);
              }
            } else {
              setModels(data.models || []);
            }
          }
        } catch (err) {
          console.error('[dsh-cron] load models error:', err);
        }
      };

      React.useEffect(() => {
        fetchTasks();
        const pollInterval = setInterval(() => {
          // Background polling without resetting loading spinner
          fetch('/dsh-cron/tasks?status=' + encodeURIComponent(tab) + '&query=' + encodeURIComponent(query))
            .then(res => res.json())
            .then(data => {
              if (data && data.ok) {
                setTasks(data.tasks || []);
                setRecs(data.recommendations || []);
                setStats(data.stats || null);
              }
            })
            .catch(() => {});
        }, 8000);
        return () => clearInterval(pollInterval);
      }, [tab, query]);
      React.useEffect(() => { loadModels(); }, []);

      const handleToggleTask = async (id) => {
        try {
          await fetch('/dsh-cron/tasks/' + encodeURIComponent(id) + '/toggle', { method: 'POST' });
          fetchTasks();
        } catch (err) {}
      };

      const handleRunNow = async (id) => {
        try {
          setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, lastStatus: 'running' } : t2));
          await fetch('/dsh-cron/tasks/' + encodeURIComponent(id) + '/run', { method: 'POST' });
          setTimeout(() => fetchTasks(), 1500);
        } catch (err) {
          console.error('[dsh-cron] run now error:', err);
        }
      };

      const handleDelete = async (id) => {
        if (!confirm(T_KEY(t, 'confirm.delete'))) return;
        try {
          await fetch('/dsh-cron/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
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
            setSettingsKanbanUrl(data.settings.kanbanBaseUrl || 'http://127.0.0.1:3000');
            setSettingsHasDefault(Boolean(data.settings.hasDefaultCredentials));
            setSettingsHasCustomBotToken(Boolean(data.settings.hasCustomBotToken));
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
              onlyOnFailure: settingsOnlyOnFailureGlobal,
              kanbanBaseUrl: settingsKanbanUrl,
            })
          });
          const data = await res.json();
          if (data && data.ok) {
            setSettingsModalOpen(false);
          } else {
            alert(T_KEY(t, 'settings.saveError', { error: (data && data.error) || T_KEY(t, 'settings.saveErrorUnknown') }));
          }
        } catch (err) {
          alert(T_KEY(t, 'settings.saveError', { error: err.message }));
        }
      };

      const handleTestTelegram = async () => {
        setTestStatus({ loading: true, message: T_KEY(t, 'settings.sending') });
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
            setTestStatus({ loading: false, success: true, message: T_KEY(t, 'settings.testOk') });
          } else {
            setTestStatus({ loading: false, success: false, message: T_KEY(t, 'settings.testFail', { error: (data && data.error) || '' }) });
          }
        } catch (err) {
          setTestStatus({ loading: false, success: false, message: T_KEY(t, 'settings.testFail', { error: err.message }) });
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
          const res = await fetch('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/history');
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
            status: selectedTaskMeta ? selectedTaskMeta.status : 'active',
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
          // Cross-origin hardening: script tasks need the explicit confirm
          // header, which browsers cannot attach to forged cross-site posts (#86)
          const headers = { 'Content-Type': 'application/json' };
          if (formType === 'script') headers[SCRIPT_CONFIRM_HEADER] = 'script';
          const res = await fetch('/dsh-cron/tasks', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (!data.ok) { alert(data.error || T_KEY(t, 'settings.saveError', { error: '' })); return; }
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
            alert(T_KEY(t, 'dsh.startFailed', { error: data.error || '' }));
            setDshLoading(false);
            return;
          }

          setDshModalOpen(false);
          if (onClose) onClose();
          else toggle.set(false);

          await openSession(ctx, data.sessionId);
        } catch (err) {
          alert(T_KEY(t, 'dsh.launchError', { error: err.message }));
        } finally {
          setDshLoading(false);
        }
      };

      const iconHtml = (html) => ({ dangerouslySetInnerHTML: { __html: html } });
      const svgProps = (html) => ({ style: { display: 'flex', alignItems: 'center' }, ...iconHtml(html) });

      return React.createElement('div', { className: 'dsh-cron-overlay' },
        React.createElement('div', { className: 'dsh-cron-container' },
          React.createElement('div', { className: 'dsh-cron-top-bar' },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-back-btn',
              title: T_KEY(t, 'panel.back'),
              onClick: () => { if (onClose) onClose(); else toggle.set(false); }
            },
              React.createElement('span', svgProps(BACK_ICON)),
              React.createElement('span', null, T_KEY(t, 'panel.back'))
            )
          ),
          React.createElement('div', { className: 'dsh-cron-header' },
            React.createElement('div', null,
              React.createElement('div', { className: 'dsh-cron-title' }, T_KEY(t, 'panel.title')),
              React.createElement('div', { className: 'dsh-cron-subtitle' }, T_KEY(t, 'panel.subtitle'))
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px' },
                title: T_KEY(t, 'actions.settings'),
                onClick: openSettingsModal
              },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', color: 'var(--dsh-cron-info)' }, ...iconHtml(ICON_TELEGRAM) }),
                T_KEY(t, 'actions.settings')
              ),
              React.createElement('div', { style: { position: 'relative' } },
                React.createElement('button', { className: 'dsh-cron-create-btn', onClick: () => setDropdownOpen(!dropdownOpen) },
                  T_KEY(t, 'actions.create'),
                  React.createElement('span', iconHtml(ICON_CHEVRON_DOWN))
                ),
                dropdownOpen && React.createElement('div', { className: 'dsh-cron-dropdown' },
                  React.createElement('button', { className: 'dsh-cron-dropdown-item', onClick: openDshModal }, T_KEY(t, 'actions.createWithDsh')),
                  React.createElement('button', { className: 'dsh-cron-dropdown-item', onClick: () => openManualModal(null) }, T_KEY(t, 'actions.setupManually'))
                )
              )
            )
          ),
          React.createElement('div', { className: 'dsh-cron-search-bar' },
            React.createElement('span', { className: 'dsh-cron-search-icon', ...iconHtml(ICON_SEARCH) }),
            React.createElement('input', {
              className: 'dsh-cron-search-input',
              type: 'search',
              'aria-label': T_KEY(t, 'search.placeholder'),
              placeholder: T_KEY(t, 'search.placeholder'),
              value: query,
              onChange: (e) => setQuery(e.target.value)
            })
          ),
          stats && React.createElement('div', { className: 'dsh-cron-stats-bar' },
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val' }, stats.activeTasks || 0),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.activeTasks'))
            ),
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val' }, stats.totalRuns || 0),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.totalRuns'))
            ),
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val' }, (stats.totalTokens || 0).toLocaleString()),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.totalTokens'))
            ),
            React.createElement('div', { className: 'dsh-cron-stat-card' },
              React.createElement('div', { className: 'dsh-cron-stat-val', style: { color: 'var(--dsh-cron-success)' } }, '$' + (stats.totalCostUsd || 0).toFixed(4)),
              React.createElement('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.totalCost'))
            )
          ),
          React.createElement('div', { className: 'dsh-cron-tabs' },
            ['all', 'active', 'paused', 'completed'].map((tabName) =>
              React.createElement('button', {
                key: tabName,
                className: 'dsh-cron-tab',
                'data-active': tab === tabName ? 'true' : undefined,
                onClick: () => setTab(tabName)
              },
                tabName === 'all' ? T_KEY(t, 'tabs.all')
                  : tabName === 'active' ? T_KEY(t, 'tabs.active')
                    : tabName === 'paused' ? T_KEY(t, 'tabs.paused')
                      : T_KEY(t, 'tabs.completed'))
            )
          ),
          fetchError ? React.createElement('div', {
            className: 'dsh-cron-status-banner',
            'data-type': 'error',
            style: { margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
          },
            React.createElement('span', null, T_KEY(t, 'banner.loadError', { error: fetchError })),
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-secondary',
              style: { marginLeft: '8px', padding: '2px 8px', fontSize: '12px' },
              onClick: () => fetchTasks()
            }, T_KEY(t, 'banner.retry'))
          ) : null,
          React.createElement('div', { className: 'dsh-cron-task-list' },
            loading && tasks.length === 0
              ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary, #888)', padding: '16px 0', fontSize: '14px' } }, T_KEY(t, 'list.loading'))
              : tasks.length === 0
                ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary, #777)', padding: '16px 0', fontSize: '14px' } }, T_KEY(t, 'list.empty'))
                : tasks.map((task) =>
                  React.createElement('div', {
                    key: task.id,
                    className: 'dsh-cron-task-item',
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': task.title,
                    onClick: () => openEditModal(task),
                    onKeyDown: (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEditModal(task);
                      }
                    }
                  },
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-cron-task-status-btn',
                      'data-active': task.status === 'active' ? 'true' : undefined,
                      title: task.status === 'active' ? T_KEY(t, 'actions.pause') : T_KEY(t, 'actions.resume'),
                      'aria-label': task.status === 'active' ? T_KEY(t, 'actions.pause') : T_KEY(t, 'actions.resume'),
                      onClick: (e) => { e.stopPropagation(); handleToggleTask(task.id); }
                    }, React.createElement('span', svgProps(task.status === 'active' ? ICON_PAUSE : ICON_PLAY))),
                    React.createElement('div', { className: 'dsh-cron-task-info' },
                      React.createElement('div', { className: 'dsh-cron-task-title' },
                        task.title,
                        React.createElement('span', {
                          className: 'dsh-cron-type-tag',
                          style: task.type === 'script'
                            ? { background: 'var(--dsh-cron-info-bg)', color: 'var(--dsh-cron-info)' }
                            : { background: 'var(--dsh-cron-success-bg)', color: 'var(--dsh-cron-success)' }
                        }, task.type === 'script' ? T_KEY(t, 'list.typeShell') : T_KEY(t, 'list.typeLlm')),
                        task.model ? React.createElement('span', { className: 'dsh-cron-task-model-tag' }, task.model.split('/').pop()) : null,
                        task.oneShot ? React.createElement('span', { className: 'dsh-cron-oneshot-tag' }, T_KEY(t, 'list.oneShot')) : null,
                        task.totalCostUsd > 0 ? React.createElement('span', { className: 'dsh-cron-cost-tag' }, '$' + task.totalCostUsd.toFixed(4)) : null,
                        task.totalTokens > 0 ? React.createElement('span', { className: 'dsh-cron-tokens-tag' }, (task.totalTokens > 1000 ? Math.round(task.totalTokens / 1000) + 'k' : task.totalTokens) + ' tok') : null
                      ),
                      React.createElement('div', { className: 'dsh-cron-task-sched' },
                        task.scheduleText || task.schedule,
                        task.nextRunAt ? T_KEY(t, 'list.next', { time: new Date(task.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : ''
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
                        title: T_KEY(t, 'actions.runNow'),
                        onClick: () => handleRunNow(task.id)
                      }, T_KEY(t, 'actions.runNowShort')),
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: T_KEY(t, 'actions.edit'),
                        'aria-label': T_KEY(t, 'actions.edit'),
                        onClick: () => openEditModal(task)
                      }, React.createElement('span', svgProps(ICON_EDIT))),
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: T_KEY(t, 'actions.delete'),
                        'aria-label': T_KEY(t, 'actions.delete'),
                        onClick: () => handleDelete(task.id)
                      }, React.createElement('span', svgProps(ICON_TRASH)))
                    )
                  )
                )
          ),
          React.createElement('div', { className: 'dsh-cron-recs-title' }, T_KEY(t, 'recs.title')),
          React.createElement('div', { className: 'dsh-cron-recs-list' },
            recs.map((rec) =>
              React.createElement('div', {
                key: rec.id,
                className: 'dsh-cron-rec-card',
                role: 'button',
                tabIndex: 0,
                onClick: () => openManualModal(rec),
                onKeyDown: (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openManualModal(rec);
                  }
                }
              },
                React.createElement('div', { className: 'dsh-cron-rec-icon' },
                  React.createElement('span', iconHtml(rec.icon === 'bell' ? ICON_BELL : rec.icon === 'clipboard' ? ICON_CLIPBOARD : ICON_ACTIVITY))
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
            role: 'dialog',
            'aria-modal': 'true',
            onClick: (e) => e.stopPropagation()
          },
            React.createElement('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formId ? '12px' : '18px' } },
              React.createElement('div', { className: 'dsh-cron-modal-title', style: { margin: 0 } }, formId ? T_KEY(t, 'modal.editTitle') : T_KEY(t, 'modal.newTitle')),
              selectedTaskMeta && React.createElement('span', {
                style: {
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: selectedTaskMeta.status === 'active' ? 'var(--dsh-cron-success-bg)' : 'var(--dsh-cron-danger-bg)',
                  color: selectedTaskMeta.status === 'active' ? 'var(--dsh-cron-success)' : 'var(--dsh-cron-danger)'
                }
              }, selectedTaskMeta.status === 'active' ? T_KEY(t, 'modal.statusActive') : T_KEY(t, 'modal.statusPaused'))
            ),

            formId && React.createElement('div', { className: 'dsh-cron-modal-nav' },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-modal-tab',
                'data-active': modalTab === 'params' ? 'true' : undefined,
                onClick: () => setModalTab('params')
              }, T_KEY(t, 'modal.params')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-modal-tab',
                'data-active': modalTab === 'history' ? 'true' : undefined,
                onClick: () => { setModalTab('history'); if (formId) loadTaskHistory(formId); }
              }, T_KEY(t, 'modal.history', { count: taskHistory.length || 0 }))
            ),

            modalTab === 'history' && formId ? React.createElement('div', null,
              historyLoading ? React.createElement('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'history.loading')) :
                taskHistory.length === 0 ? React.createElement('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'history.empty')) :
                  React.createElement('div', { className: 'dsh-cron-history-list' },
                    taskHistory.map((run) => React.createElement('div', { key: run.id, className: 'dsh-cron-history-item' },
                      React.createElement('div', { className: 'dsh-cron-history-head' },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          React.createElement('span', {
                            className: 'dsh-cron-history-status',
                            'data-status': run.status
                          }, statusLabel(t, run.status)),
                          React.createElement('span', { className: 'dsh-cron-history-time' }, run.at ? new Date(run.at).toLocaleString() : '')
                        ),
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          run.costUsd > 0 && React.createElement('span', { className: 'dsh-cron-cost-tag' }, '$' + run.costUsd.toFixed(5)),
                          run.usage && (run.usage.inputTokens > 0 || run.usage.outputTokens > 0) && React.createElement('span', { className: 'dsh-cron-tokens-tag' }, (run.usage.inputTokens + run.usage.outputTokens) + ' tok'),
                          React.createElement('span', { style: { color: 'var(--dsw-alias-label-tertiary, #888)', fontSize: '11.5px' } }, (run.durationMs || 0) + ' ms')
                        )
                      ),
                      run.output && React.createElement('div', { className: 'dsh-cron-history-output' }, run.output),
                      run.error && React.createElement('div', { className: 'dsh-cron-history-output', style: { color: 'var(--dsh-cron-danger)', borderColor: 'var(--dsh-cron-danger-bg)' } }, run.error)
                    ))
                  ),
              React.createElement('div', { className: 'dsh-cron-modal-foot', style: { marginTop: '18px' } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  onClick: () => { if (formId) loadTaskHistory(formId); }
                }, T_KEY(t, 'history.refresh')),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-primary',
                  onClick: () => setManualModalOpen(false)
                }, T_KEY(t, 'modal.close'))
              )
            ) :

              React.createElement('form', { onSubmit: handleSaveManual },
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.nameLabel')),
                  React.createElement('input', {
                    required: true,
                    autoFocus: true,
                    value: formTitle,
                    placeholder: T_KEY(t, 'form.namePlaceholder'),
                    onChange: (e) => setFormTitle(e.target.value)
                  })
                ),
                React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.typeLabel')),
                    React.createElement('select', {
                      value: formType,
                      onChange: (e) => setFormType(e.target.value)
                    },
                      React.createElement('option', { value: 'llm' }, T_KEY(t, 'form.typeLlm')),
                      React.createElement('option', { value: 'script' }, T_KEY(t, 'form.typeScript'))
                    )
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.scheduleLabel')),
                    React.createElement('input', {
                      required: true,
                      value: formSchedule,
                      placeholder: T_KEY(t, 'form.schedulePlaceholder'),
                      onChange: (e) => setFormSchedule(e.target.value)
                    })
                  )
                ),
                React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.timeoutLabel')),
                    React.createElement('input', {
                      type: 'number',
                      min: 1,
                      value: formTimeoutSeconds,
                      placeholder: '1800',
                      onChange: (e) => setFormTimeoutSeconds(e.target.value)
                    })
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.overlapLabel')),
                    React.createElement('select', {
                      value: formOverlapPolicy,
                      onChange: (e) => setFormOverlapPolicy(e.target.value)
                    },
                      React.createElement('option', { value: 'skip' }, T_KEY(t, 'form.overlapSkip')),
                      React.createElement('option', { value: 'queue' }, T_KEY(t, 'form.overlapQueue')),
                      React.createElement('option', { value: 'replace' }, T_KEY(t, 'form.overlapReplace'))
                    )
                  )
                ),
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.kanbanLabel')),
                  React.createElement('select', {
                    value: formKanbanMode,
                    onChange: (e) => setFormKanbanMode(e.target.value)
                  },
                    React.createElement('option', { value: 'none' }, T_KEY(t, 'form.kanbanNone')),
                    React.createElement('option', { value: 'on_failure' }, T_KEY(t, 'form.kanbanOnFailure')),
                    React.createElement('option', { value: 'always' }, T_KEY(t, 'form.kanbanAlways'))
                  )
                ),
                formType !== 'script' && React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.providerLabel')),
                    React.createElement('select', {
                      value: formProvider,
                      onChange: handleProviderChange
                    },
                      React.createElement('option', { value: '' }, T_KEY(t, 'form.providerDefault')),
                      providers.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.name || p.id))
                    )
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.modelLabel')),
                    React.createElement('select', {
                      value: formModel,
                      onChange: (e) => setFormModel(e.target.value)
                    },
                      React.createElement('option', { value: '' }, T_KEY(t, 'form.modelDefault')),
                      models.map((m) => React.createElement('option', { key: m.id, value: m.id }, m.name || m.id))
                    )
                  )
                ),
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, formType === 'script' ? T_KEY(t, 'form.promptLabelScript') : T_KEY(t, 'form.promptLabelLlm')),
                  React.createElement('textarea', {
                    required: true,
                    rows: 9,
                    style: { fontFamily: 'monospace', fontSize: '12.5px', lineHeight: '1.45' },
                    value: formPrompt,
                    placeholder: formType === 'script' ? T_KEY(t, 'form.promptPlaceholderScript') : T_KEY(t, 'form.promptPlaceholderLlm'),
                    onChange: (e) => setFormPrompt(e.target.value)
                  })
                ),
                React.createElement('div', {
                  style: {
                    background: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.02))',
                    border: '1px solid var(--dsw-alias-border-l2, #2e2e2e)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginBottom: '16px'
                  }
                },
                  React.createElement('div', { style: { fontWeight: 500, fontSize: '13px', color: 'var(--dsw-alias-label-primary, #eee)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' } },
                    React.createElement('span', { style: { display: 'flex', alignItems: 'center', color: 'var(--dsh-cron-info)' }, ...iconHtml(ICON_TELEGRAM) }),
                    T_KEY(t, 'form.notifyTitle')
                  ),
                  React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginBottom: formNotifyTelegram ? '8px' : '0' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: formNotifyTelegram,
                      onChange: (e) => setFormNotifyTelegram(e.target.checked)
                    }),
                    React.createElement('span', null, T_KEY(t, 'form.notifyTelegram'))
                  ),
                  formNotifyTelegram && React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginLeft: '24px', marginTop: '6px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: formOnlyOnFailure,
                      onChange: (e) => setFormOnlyOnFailure(e.target.checked)
                    }),
                    React.createElement('span', null, T_KEY(t, 'form.notifyOnlyFailure'))
                  )
                ),
                selectedTaskMeta && React.createElement('div', {
                  style: {
                    background: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.03))',
                    border: '1px solid var(--dsw-alias-border-l2, #2e2e2e)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    color: 'var(--dsw-alias-label-secondary, #999)',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }
                },
                  React.createElement('div', null,
                    React.createElement('span', null, T_KEY(t, 'form.nextRunLabel')),
                    React.createElement('strong', { style: { color: 'var(--dsw-alias-label-primary, #eee)' } }, selectedTaskMeta.nextRunAt ? new Date(selectedTaskMeta.nextRunAt).toLocaleString() : T_KEY(t, 'form.notScheduled'))
                  ),
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsh-cron-btn-secondary',
                    style: { padding: '4px 10px', fontSize: '12px' },
                    onClick: async () => {
                      await handleRunNow(selectedTaskMeta.id);
                      if (formId) loadTaskHistory(formId);
                    }
                  }, T_KEY(t, 'actions.runNow'))
                ),
                React.createElement('div', { className: 'dsh-cron-modal-foot' },
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsh-cron-btn-secondary',
                    onClick: () => setManualModalOpen(false)
                  }, T_KEY(t, 'modal.cancel')),
                  React.createElement('button', {
                    type: 'submit',
                    className: 'dsh-cron-btn-primary'
                  }, formId ? T_KEY(t, 'modal.save') : T_KEY(t, 'modal.create'))
                )
              )
          )
        ),

        // 2. Settings modal
        settingsModalOpen && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => setSettingsModalOpen(false) },
          React.createElement('div', { className: 'dsh-cron-modal', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' } },
              React.createElement('div', { className: 'dsh-cron-modal-title', style: { margin: 0, display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { display: 'flex', alignItems: 'center', color: 'var(--dsh-cron-info)' }, ...iconHtml(ICON_TELEGRAM) }),
                T_KEY(t, 'settings.modalTitle')
              ),
              React.createElement('button', {
                type: 'button',
                style: { background: 'none', border: 'none', color: 'var(--dsw-alias-label-tertiary, #888)', cursor: 'pointer', fontSize: '18px' },
                onClick: () => setSettingsModalOpen(false)
              }, '✕')
            ),
            React.createElement('form', { onSubmit: handleSaveSettings },
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, T_KEY(t, 'settings.tokenLabel')),
                React.createElement('input', {
                  type: 'password',
                  value: settingsBotToken,
                  placeholder: settingsHasDefault ? T_KEY(t, 'settings.tokenPlaceholderDefault') : T_KEY(t, 'settings.tokenPlaceholder'),
                  onChange: (e) => setSettingsBotToken(e.target.value)
                }),
                settingsHasDefault && React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'settings.defaultHint'))
              ),
              React.createElement('div', { className: 'dsh-cron-form-group' },
                React.createElement('label', null, T_KEY(t, 'settings.chatIdLabel')),
                React.createElement('input', {
                  value: settingsChatId,
                  placeholder: T_KEY(t, 'settings.chatIdPlaceholder'),
                  onChange: (e) => setSettingsChatId(e.target.value)
                })
              ),
              React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.02))', border: '1px solid var(--dsw-alias-border-l2, #2e2e2e)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' } },
                React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginBottom: '8px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: settingsNotifyGlobal,
                    onChange: (e) => setSettingsNotifyGlobal(e.target.checked)
                  }),
                  React.createElement('span', null, T_KEY(t, 'settings.globalNotify'))
                ),
                React.createElement('label', { className: 'dsh-cron-checkbox-row' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: settingsOnlyOnFailureGlobal,
                    onChange: (e) => setSettingsOnlyOnFailureGlobal(e.target.checked)
                  }),
                  React.createElement('span', null, T_KEY(t, 'settings.globalOnlyFailure'))
                )
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  style: { display: 'inline-flex', alignItems: 'center', gap: '6px' },
                  disabled: testStatus?.loading,
                  onClick: handleTestTelegram
                }, testStatus?.loading ? T_KEY(t, 'settings.sending') : T_KEY(t, 'settings.testTelegram'))
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
                }, T_KEY(t, 'modal.cancel')),
                React.createElement('button', {
                  type: 'submit',
                  className: 'dsh-cron-btn-primary'
                }, T_KEY(t, 'settings.save'))
              )
            )
          )
        ),

        // 3. "Create with DSH" modal
        dshModalOpen && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => !dshLoading && setDshModalOpen(false) },
          React.createElement('div', { className: 'dsh-cron-modal', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'dsh-cron-modal-title' }, T_KEY(t, 'dsh.modalTitle')),
            React.createElement('div', { className: 'dsh-cron-form-group' },
              React.createElement('label', null, T_KEY(t, 'dsh.descLabel')),
              React.createElement('div', { className: 'dsh-cron-chat-box' },
                React.createElement('textarea', {
                  className: 'dsh-cron-chat-input',
                  rows: 4,
                  autoFocus: true,
                  disabled: dshLoading,
                  placeholder: T_KEY(t, 'dsh.placeholder'),
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
                  React.createElement('span', { className: 'dsh-cron-chat-hint' }, T_KEY(t, 'dsh.sendHint')),
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsh-cron-send-btn',
                    disabled: dshLoading || !dshPrompt.trim(),
                    title: T_KEY(t, 'dsh.sendTitle'),
                    onClick: handleStartWithDSH
                  },
                    React.createElement('span', svgProps(ICON_SEND))
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
              }, T_KEY(t, 'modal.cancel'))
            )
          )
        )
      );
    }

    function CronSettingsCard(props) {
      const { ctx, toggle } = props;
      const t = props.t || translate;
      const [token, setToken] = React.useState('');
      const [chatId, setChatId] = React.useState('');
      const [notify, setNotify] = React.useState(false);
      const [onlyFailure, setOnlyFailure] = React.useState(false);
      const [kanbanUrl, setKanbanUrl] = React.useState('http://127.0.0.1:3000');
      const [hasDefault, setHasDefault] = React.useState(false);
      const [saved, setSaved] = React.useState(false);
      const [testInfo, setTestInfo] = React.useState(null);
      // Collapsed by default, head is the toggle (canonical card contract, #100)
      const [cardOpen, setCardOpen] = React.useState(false);

      React.useEffect(() => {
        let active = true;
        fetch('/dsh-cron/settings')
          .then(r => r.json())
          .then(data => {
            if (active && data && data.ok && data.settings) {
              setToken(data.settings.botToken || '');
              setChatId(data.settings.chatId || '');
              setNotify(Boolean(data.settings.notifyTelegram));
              setOnlyFailure(Boolean(data.settings.onlyOnFailure));
              setKanbanUrl(data.settings.kanbanBaseUrl || 'http://127.0.0.1:3000');
              setHasDefault(Boolean(data.settings.hasDefaultCredentials));
            }
          })
          .catch(() => {});
        return () => { active = false; };
      }, []);

      const saveSettings = async (e) => {
        if (e) e.preventDefault();
        try {
          const res = await fetch('/dsh-cron/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botToken: token,
              chatId,
              notifyTelegram: notify,
              onlyOnFailure: onlyFailure,
              kanbanBaseUrl: kanbanUrl
            })
          });
          const data = await res.json();
          if (data && data.ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          }
        } catch (err) {}
      };

      const testTelegram = async () => {
        setTestInfo({ loading: true, message: T_KEY(t, 'settings.sending') });
        try {
          const res = await fetch('/dsh-cron/telegram/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken: token, chatId })
          });
          const data = await res.json();
          if (data && data.ok) {
            setTestInfo({ success: true, message: T_KEY(t, 'settings.testOk') });
          } else {
            setTestInfo({ success: false, message: T_KEY(t, 'settings.testFail', { error: (data && data.error) || '' }) });
          }
        } catch (err) {
          setTestInfo({ success: false, message: T_KEY(t, 'settings.testFail', { error: err.message }) });
        }
      };

      const testKanban = async () => {
        setTestInfo({ loading: true, message: T_KEY(t, 'settings.checkingKanban') });
        try {
          const res = await fetch('/dsh-cron/kanban/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kanbanBaseUrl: kanbanUrl })
          });
          const data = await res.json();
          if (data && data.ok) {
            setTestInfo({ success: true, message: T_KEY(t, 'settings.kanbanOk') });
          } else {
            setTestInfo({ success: false, message: T_KEY(t, 'settings.kanbanFail', { error: (data && data.error) || '' }) });
          }
        } catch (err) {
          setTestInfo({ success: false, message: T_KEY(t, 'settings.kanbanFail', { error: err.message }) });
        }
      };

      return React.createElement('div', { className: 'dsh-cron-card' },
        React.createElement('button', {
          type: 'button',
          className: 'dsh-cron-card-head-btn',
          'aria-expanded': cardOpen ? 'true' : 'false',
          onClick: () => setCardOpen(!cardOpen)
        },
          React.createElement('span', { className: 'dsh-cron-card-title' }, T_KEY(t, 'settings.cardTitle')),
          React.createElement('span', { className: 'dsh-cron-chev' + (cardOpen ? ' dsh-cron-chev-open' : '') }, chevronNode())
        ),
        cardOpen && React.createElement('div', { className: 'dsh-cron-card-body' },
          React.createElement('div', { className: 'dsh-cron-card-desc' }, T_KEY(t, 'settings.cardDesc')),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' } },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-primary',
              onClick: () => { if (toggle) toggle.set(true); }
            }, T_KEY(t, 'settings.openPanel'))
          ),
          React.createElement('form', { onSubmit: saveSettings, style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          React.createElement('div', { className: 'dsh-cron-form-group', style: { marginBottom: 0 } },
            React.createElement('label', null, T_KEY(t, 'settings.tokenLabel')),
            React.createElement('input', {
              type: 'password',
              value: token,
              placeholder: hasDefault ? T_KEY(t, 'settings.tokenPlaceholderDefault') : T_KEY(t, 'settings.tokenPlaceholder'),
              onChange: (e) => setToken(e.target.value)
            }),
            hasDefault && React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'settings.defaultHint'))
          ),
          React.createElement('div', { className: 'dsh-cron-form-group', style: { marginBottom: 0 } },
            React.createElement('label', null, T_KEY(t, 'settings.chatIdLabel')),
            React.createElement('input', {
              value: chatId,
              placeholder: T_KEY(t, 'settings.chatIdPlaceholder'),
              onChange: (e) => setChatId(e.target.value)
            })
          ),
          React.createElement('div', { className: 'dsh-cron-form-group', style: { marginBottom: 0 } },
            React.createElement('label', null, T_KEY(t, 'settings.kanbanUrlLabel')),
            React.createElement('input', {
              value: kanbanUrl,
              placeholder: 'http://127.0.0.1:3000',
              onChange: (e) => setKanbanUrl(e.target.value)
            })
          ),
          React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.02))', border: '1px solid var(--dsw-alias-border-l2, #2e2e2e)', borderRadius: '6px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
            React.createElement('label', { className: 'dsh-cron-checkbox-row' },
              React.createElement('input', {
                type: 'checkbox',
                checked: notify,
                onChange: (e) => setNotify(e.target.checked)
              }),
              React.createElement('span', null, T_KEY(t, 'settings.globalNotify'))
            ),
            React.createElement('label', { className: 'dsh-cron-checkbox-row' },
              React.createElement('input', {
                type: 'checkbox',
                checked: onlyFailure,
                onChange: (e) => setOnlyFailure(e.target.checked)
              }),
              React.createElement('span', null, T_KEY(t, 'settings.globalOnlyFailure'))
            )
          ),
          testInfo && testInfo.message && React.createElement('div', {
            className: 'dsh-cron-status-banner',
            'data-type': testInfo.success ? 'success' : 'error',
            style: { margin: 0, padding: '8px 12px' }
          }, testInfo.message),
          React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' } },
            React.createElement('button', {
              type: 'submit',
              className: 'dsh-cron-btn-primary',
              style: { minWidth: '140px' }
            }, saved ? T_KEY(t, 'settings.saved') : T_KEY(t, 'settings.save')),
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-secondary',
              onClick: testTelegram,
              disabled: testInfo?.loading
            }, T_KEY(t, 'settings.testTelegram')),
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-secondary',
              onClick: testKanban,
              disabled: testInfo?.loading
            }, T_KEY(t, 'settings.testKanban'))
          )
        )
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
      entry.setAttribute('data-dsh-plugin', 'dsh-cron');
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
        container.setAttribute('data-dsh-plugin', 'dsh-cron');
        column.appendChild(container);
        if (ReactDOM && typeof ReactDOM.createRoot === 'function') {
          root = ReactDOM.createRoot(container);
          root.render(React.createElement(CronScreen, { ctx, toggle, onClose: () => toggle.set(false), t: translate }));
        } else if (ReactDOM && typeof ReactDOM.render === 'function') {
          ReactDOM.render(React.createElement(CronScreen, { ctx, toggle, onClose: () => toggle.set(false), t: translate }), container);
        }
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

    /**
     * Register a card into a DSH mount point. Mount points are populated via
     * ctx.slots.inject(mount, cb) — a direct slots.register does not throw but
     * also never appears in the target surface (settings plugins tab, header),
     * so the inject contract is mandatory (#85).
     */
    function registerIntoMount(ctx, mountName, entry, component) {
      if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return false;
      try {
        return !!ctx.slots.inject(mountName, () => {
          ctx.slots.register(entry, component);
        });
      } catch (err) {
        console.warn('[dsh-cron] slot injection skipped:', mountName, '-', err && err.message);
        return false;
      }
    }

    function apply(ctx) {
      ensureStyles();

      // Register the English canonical strings; rebinding the translator lets
      // the translation plugin drive the active language at runtime (#87).
      try {
        if (ctx.locale && typeof ctx.locale.register === 'function') {
          ctx.locale.register(NS, STRINGS);
        }
      } catch (e) {
        // Re-registration in the same session throws — the dictionary is live already.
      }
      try {
        if (ctx.locale && typeof ctx.locale.bind === 'function') {
          translate = ctx.locale.bind(NS);
        }
      } catch (e) {}

      const toggle = createToggle();

      const cardOk = registerIntoMount(ctx, 'settings.plugin.item', {
        name: 'settings.plugin.item',
        key: NS,
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, CronSettingsCard);
      if (!cardOk) {
        // Fallback for builds without the settings.plugin.item mount: a
        // dedicated section so the settings are never lost (#85).
        registerIntoMount(ctx, 'settings.section', {
          name: 'settings.section',
          id: PLUGIN_ID,
          order: 34,
          locale: NS,
          label: () => translate('settings.sectionLabel'),
          inject: () => ({ ctx, toggle }),
        }, CronSettingsCard);
      }

      const chipOk = registerIntoMount(ctx, 'conversation.session.header.utilities', {
        name: 'conversation.session.header.utilities',
        id: PLUGIN_ID + '.chip',
        order: 27,
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, CronChip);
      const cardSlot = cardOk ? 'settings.plugin.item' : 'settings.section';
      const chipSlot = chipOk ? 'conversation.session.header.utilities' : undefined;

      function CronChip(props) {
        const chipT = props.t || translate;
        return React.createElement('button', {
          type: 'button',
          style: { background: 'none', border: 'none', color: 'var(--dsw-alias-label-secondary, #999)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' },
          title: T_KEY(chipT, 'chip.title'),
          'aria-label': T_KEY(chipT, 'chip.title'),
          onClick: () => toggle.toggle(),
          dangerouslySetInnerHTML: { __html: ICON_TIMER }
        });
      }

      ctx.effect(() => {
        const off = [
          mountSidebarEntry(toggle, translate('sidebar.label')),
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
