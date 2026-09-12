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
    // Set by the sidebar job list (#34) so the panel can highlight the task the
    // user clicked; cleared once the panel has scrolled to it.
    let pendingTaskHighlight = null;
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
    const ICON_COPY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const ICON_TUNE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>';
    const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    const ICON_UPLOAD = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';
    const ICON_TELEGRAM = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8-1.7 8.01c-.13.58-.47.72-.95.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.53.26l.19-2.64 4.81-4.35c.21-.19-.05-.29-.32-.11L8.34 13.5 5.78 12.7c-.56-.17-.57-.56.12-.83l10-3.86c.46-.17.87.11.74.79z"/></svg>';

    // Locale dictionary: English is the canonical source language (Issue #87).
    // Russian and other languages are provided at runtime by the translation
    // plugin; no per-language duplicates are stored here.
    const STRINGS = {
      en: {
        'sidebar.label': 'Scheduled tasks',
        'sidebar.jobsTitle': 'Active jobs',
        'sidebar.noActiveJobs': 'No active jobs',
        'sidebar.moreJobs': 'and {count} more',
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
        'actions.duplicate': 'Duplicate task',
        'actions.tuneWithDsh': 'Tune with DSH',
        'tune.startFailed': 'Could not start the tuning dialogue: {error}',
        'actions.delete': 'Delete task',
        'duplicate.done': 'Copy created and paused: review its schedule before resuming it.',
        'duplicate.oneShotHint': 'The copy is one-shot and paused — its original time has likely passed, so set a new time before resuming.',
        'duplicate.failed': 'Could not duplicate the task: {error}',
        'transfer.exportTitle': 'Export tasks',
        'transfer.importTitle': 'Import tasks',
        'transfer.exported': 'Exported {count} task(s).',
        'transfer.exportFailed': 'Export failed: {error}',
        'transfer.importTitleModal': 'Import tasks',
        'transfer.importHint': 'Exported task configuration only: no run history, no counters. Secrets are not included — channels reference credentials by name, so make sure those credential names exist on the target harness.',
        'transfer.strategyAdd': 'Add as new tasks (new ids, existing ones stay untouched)',
        'transfer.strategyReplace': 'Replace tasks with the same id',
        'transfer.strategySkip': 'Skip tasks whose id already exists',
        'transfer.summary': 'This file contains {total} task(s): {add} new, {replace} matching an existing id, {skip} already skipped.',
        'transfer.confirm': 'Import',
        'transfer.imported': 'Imported {count} task(s).',
        'transfer.importFailed': 'Import failed: {error}',
        'transfer.badFile': 'The selected file is not a valid JSON export: {error}',
        'actions.pause': 'Pause',
        'actions.resume': 'Resume',
        'actions.settings': 'Notifications & channels',
        'search.placeholder': 'Search scheduled tasks',
        'filters.title': 'Filters',
        'filters.type': 'Type',
        'filters.model': 'Model',
        'filters.channel': 'Channel',
        'filters.any': 'Any',
        'filters.reset': 'Reset filters',
        'filters.empty': 'No task matches the current filters.',
        'filters.showing': 'Showing {shown} of {total}',
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
        'list.configManaged': 'Config',
        'list.configManagedHint': 'Declared in config.jobs in the profile config file; edit the file to change or remove it',
        'list.next': ' · next: {time}',
        'recs.title': 'Recommended tasks',
        'recs.hint': 'Ready-to-use recipes. Clicking one opens the form with its fields filled in — nothing is created until you save.',
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
        'form.typeScript': 'Shell command / script',
        'form.typeNode': 'Node.js',
        'form.typePython': 'Python',
        'form.typeHttp': 'HTTP request / webhook',
        'form.typeSsh': 'Remote SSH',
        'form.typeDocker': 'Docker container',
        'form.typeSkill': 'DSH Skill',
        'form.typeWorkflow': 'DSH Workflow',
        'form.envLabel': 'Environment variables (KEY=VALUE per line)',
        'form.envPlaceholder': 'NODE_ENV=production\nTZ=Europe/Berlin',
        'form.envHint': 'Applied to non-LLM runtimes only. Do not store secrets here.',
        'form.cwdLabel': 'Working directory (optional)',
        'form.workspaceLabel': 'Workspace id or path (optional)',
        'form.worktreeLabel': 'Run in an isolated git worktree',
        'form.keepWorktreeLabel': 'Keep the worktree after the run',
        'form.httpMethodLabel': 'HTTP method',
        'form.httpUrlLabel': 'URL',
        'form.httpHeadersLabel': 'Headers (JSON, optional)',
        'form.httpBodyLabel': 'Body (optional)',
        'form.sshProfileLabel': 'dsh-remote-workspace profile id',
        'form.sshProfileHint': 'Preferred: host and credentials stay in the remote-workspace plugin.',
        'form.sshTargetLabel': 'Fallback target (user@host, optional)',
        'form.sshKeyLabel': 'Private key path (fallback, optional)',
        'form.dockerImageLabel': 'Container image',
        'form.skillNameLabel': 'Skill name',
        'form.workflowNameLabel': 'Workflow name',
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
        'form.silentRuleLabel': 'Silent rule (optional)',
        'form.silentRulePlaceholder': 'Stay silent when no filesystem is above 80%',
        'form.silentRuleHint': 'For tasks with output: a cheap model judges the run against this rule and the report is skipped when it says to stay silent. If the model is unavailable or unsure, the report is delivered.',
        'history.silentSkip': 'stayed silent:',
        'history.diagnosis': 'Diagnosis',
        'history.applySuggestion': 'Open the edit form with this suggestion',
        'form.inspectOnFailureLabel': 'Diagnose failures with a model',
        'form.inspectOnFailureHint': 'After a failed run a model reads the prompt, the error and the output, and the diagnosis with a proposed prompt change is stored with the run. Nothing is applied automatically.',
        'settings.inspectorModelLabel': 'Model for failure diagnosis',
        'form.fallbackModelLabel': 'Fallback model (optional)',
        'form.fallbackModelPlaceholder': 'e.g. deepseek-reasoner',
        'form.fallbackModelHint': 'If the run fails on the model above, it is retried once on this model. Both attempts are counted in the cost.',
        'form.promptLabelScript': 'Shell command or script',
        'form.promptLabelLlm': 'Instruction / Prompt for the agent',
        'form.promptPlaceholderScript': 'curl -fsSL https://... || exit 1',
        'form.promptPlaceholderLlm': 'Describe exactly what the agent should do...',
        'form.timezoneLabel': 'Time zone (IANA, optional)',
        'form.timezonePlaceholder': 'e.g. Europe/Berlin (empty = server local)',
        'form.misfireLabel': 'On missed run (after downtime)',
        'form.misfireSkip': 'Skip the missed run (skip)',
        'form.misfireRunOnce': 'Run once late (runOnce)',
        'form.misfireCatchUp': 'Run late once and record the gap (catchUpAll)',
        'form.retriesLabel': 'Automatic retries on failure (0 = off)',
        'form.permissionLabel': 'Session permissions',
        'form.permissionDefault': 'Default (as configured in DSH)',
        'form.permissionReadonly': 'Read-only',
        'form.permissionWrite': 'Workspace write',
        'form.permissionFull': 'Full',
        'list.runningNow': 'Running now',
        'history.openSession': 'Open session',
        'form.notifyTitle': 'Telegram notifications',
        'form.notifyTelegram': 'Send the run report to Telegram',
        'form.notifyOnlyFailure': 'Only on failures (onlyOnFailure / silent on success)',
        'form.channelsTitle': 'Delivery channels',
        'form.channelsHint': 'Pick the channels for this task. An explicit selection overrides the Telegram switch above; leave everything unchecked to fall back to it.',
        'form.templateLabel': 'Message template (optional)',
        'form.templatePlaceholder': '⏰ {title} — {status} in {duration}',
        'form.templateHint': 'Variables: {title} {id} {status} {output} {error} {duration} {schedule} {time} {tokens} {cost} {model}. Empty = built-in text.',
        'form.channelTelegram': 'Telegram',
        'form.channelKanban': 'dsh-kanban card',
        'form.channelDiscord': 'Discord',
        'form.channelSlack': 'Slack',
        'form.channelNtfy': 'ntfy',
        'form.channelBark': 'Bark',
        'form.channelPushplus': 'PushPlus',
        'form.channelTts': 'Voice (dsh-tts)',
        'form.channelGitea': 'Gitea issue',
        'settings.deliverySection': 'Delivery channels',
        'settings.secretsSection': 'Credentials (references)',
        'settings.secretsHint': 'Enter the NAME of a DSH credential, not the secret itself. Secrets stay in the credentials store.',
        'settings.telegramSection': 'Telegram',
        'settings.templatesSection': 'Message templates',
        'settings.channelTemplateLabel': 'Template for {channel}',
        'settings.botTokenRefLabel': 'Bot token credential name',
        'settings.botTokenRefPlaceholder': 'e.g. TELEGRAM_BOT_TOKEN',
        'settings.apiTokenLabel': 'External API token',
        'settings.apiTokenPlaceholder': 'Bearer token for /dsh-cron/api/* (empty = disabled)',
        'settings.discordLabel': 'Discord webhook URL',
        'settings.slackLabel': 'Slack webhook URL',
        'settings.ntfyUrlLabel': 'ntfy server URL',
        'settings.ntfyTopicLabel': 'ntfy topic',
        'settings.ntfyTokenRefLabel': 'ntfy token credential name',
        'settings.barkServerLabel': 'Bark server URL',
        'settings.barkKeyLabel': 'Bark device key',
        'settings.pushplusTokenRefLabel': 'PushPlus token credential name',
        'settings.pushplusUrlLabel': 'PushPlus endpoint',
        'settings.ttsBaseUrlLabel': 'dsh-tts base URL',
        'settings.giteaBaseUrlLabel': 'Gitea base URL',
        'settings.giteaRepoLabel': 'Gitea repository (owner/repo)',
        'settings.giteaTokenRefLabel': 'Gitea token credential name',
        'settings.templateLabel': 'Default message template',
        'settings.templateHint': 'Applies to every channel without its own template. Empty = built-in text.',
        'settings.deliveryTimeoutMsLabel': 'Delivery timeout per channel (ms)',
        'settings.automationSection': 'Automation models',
        'settings.automationHint': 'Models used for the small helper calls (rule evaluation, failure analysis). Leave empty to use the task model.',
        'settings.silentRuleModelLabel': 'Model for silent rules',
        'settings.secretsOnCard': 'Credentials referenced from the settings panel are shown masked and stored by name.',
        'form.nextRunLabel': 'Next run: ',
        'form.notScheduled': 'not scheduled',
        'settings.loading': 'Loading settings...',
        'settings.unavailable': 'Settings are unavailable right now.',
        'settings.retry': 'Retry',
        'settings.cardTitle': '⏰ Task scheduler (Cron)',
        'settings.cardDesc': 'Scheduled task execution (cron/intervals), background agent scenarios, and delivery of run reports to Telegram, Discord, Slack, ntfy, Bark, PushPlus, voice and Gitea.',
        'settings.openPanel': 'Open task panel',
        'settings.modalTitle': 'Notifications & delivery channels',
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

    // Own React error boundary (#106): the core's SlotErrorBoundary renders an
    // empty div on crash, so a slot failure would silently vanish. Ours keeps
    // the failure visible with a retry.
    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return (props && props.children) || null; };
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { hasError: false, error: null };
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error };
        }
        componentDidCatch(error, errorInfo) {
          console.error('[dsh-cron] React error:', error, errorInfo);
        }
        render() {
          if (this.state.hasError) {
            return React.createElement('div', { className: 'dsh-cron-status-banner', 'data-type': 'error', style: { margin: '12px 0' } },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '⚠️ Cron UI error:'),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String((this.state.error && this.state.error.message) || this.state.error)),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                onClick: () => this.setState({ hasError: false, error: null })
              }, 'Retry')
            );
          }
          return (this.props && this.props.children) || null;
        }
      };
    }
    const ErrorBoundary = createErrorBoundary();

    const AGENT_FORM_TYPES = ['llm', 'skill', 'workflow'];
    const CODE_FORM_TYPES = ['script', 'node', 'python', 'ssh', 'docker'];

    // Delivery channels (#26) — must stay in sync with lib/channels.js.
    const DELIVERY_CHANNELS = ['telegram', 'kanban', 'discord', 'slack', 'ntfy', 'bark', 'pushplus', 'tts', 'gitea'];
    const CHANNEL_LABEL_KEYS = {
      telegram: 'form.channelTelegram',
      kanban: 'form.channelKanban',
      discord: 'form.channelDiscord',
      slack: 'form.channelSlack',
      ntfy: 'form.channelNtfy',
      bark: 'form.channelBark',
      pushplus: 'form.channelPushplus',
      tts: 'form.channelTts',
      gitea: 'form.channelGitea',
    };

    // Non-secret delivery settings shown in the settings panel. Secrets are
    // referenced by credential name only (#51) — never typed as values.
    const DELIVERY_SETTING_FIELDS = [
      { key: 'botTokenRef', labelKey: 'settings.botTokenRefLabel', placeholderKey: 'settings.botTokenRefPlaceholder', group: 'secrets' },
      { key: 'ntfyTokenRef', labelKey: 'settings.ntfyTokenRefLabel', group: 'secrets' },
      { key: 'pushplusTokenRef', labelKey: 'settings.pushplusTokenRefLabel', group: 'secrets' },
      { key: 'giteaTokenRef', labelKey: 'settings.giteaTokenRefLabel', group: 'secrets' },
      // The external API is the one surface where a typed secret is the point:
      // a CI job cannot present a credential reference (#54).
      { key: 'apiToken', labelKey: 'settings.apiTokenLabel', placeholderKey: 'settings.apiTokenPlaceholder', group: 'secrets' },
      { key: 'discordWebhookUrl', labelKey: 'settings.discordLabel', group: 'channels' },
      { key: 'slackWebhookUrl', labelKey: 'settings.slackLabel', group: 'channels' },
      { key: 'ntfyUrl', labelKey: 'settings.ntfyUrlLabel', group: 'channels' },
      { key: 'ntfyTopic', labelKey: 'settings.ntfyTopicLabel', group: 'channels' },
      { key: 'barkServerUrl', labelKey: 'settings.barkServerLabel', group: 'channels' },
      { key: 'barkKey', labelKey: 'settings.barkKeyLabel', group: 'channels' },
      { key: 'pushplusUrl', labelKey: 'settings.pushplusUrlLabel', group: 'channels' },
      { key: 'ttsBaseUrl', labelKey: 'settings.ttsBaseUrlLabel', group: 'channels' },
      { key: 'giteaBaseUrl', labelKey: 'settings.giteaBaseUrlLabel', group: 'channels' },
      { key: 'giteaRepo', labelKey: 'settings.giteaRepoLabel', group: 'channels' },
      { key: 'deliveryTimeoutMs', labelKey: 'settings.deliveryTimeoutMsLabel', group: 'channels', numeric: true, defaultValue: 15000, min: 1000 },
      { key: 'silentRuleModel', labelKey: 'settings.silentRuleModelLabel', group: 'automation' },
      { key: 'inspectorModel', labelKey: 'settings.inspectorModelLabel', group: 'automation' },
    ];
    const DELIVERY_SETTING_KEYS = DELIVERY_SETTING_FIELDS.map((f) => f.key);
    // The global template plus the per-channel override map (server model).
    const TEMPLATE_SETTING_KEYS = ['template', 'channelTemplates'];

    /** Collect every delivery key the settings endpoints may return. */
    function pickDeliverySettings(source) {
      const out = {};
      for (const key of DELIVERY_SETTING_KEYS.concat(TEMPLATE_SETTING_KEYS)) {
        if (source && source[key] !== undefined && source[key] !== null) out[key] = source[key];
      }
      if (out.channelTemplates && typeof out.channelTemplates === 'object') {
        out.channelTemplates = Object.assign({}, out.channelTemplates);
      }
      return out;
    }

    /**
     * Shared delivery form used by both the task panel modal and the plugin
     * settings card, so a new channel is added in exactly one place.
     * Sections collapse via the canonical aria-expanded head contract.
     */
    function renderDeliverySettings({ T, values, onChange, onChannelTemplate, sections, onToggleSection }) {
      const val = (key) => (values[key] === undefined || values[key] === null ? '' : String(values[key]));
      const field = (f) => React.createElement('div', { className: 'dsh-cron-form-group', key: f.key, style: { marginBottom: '10px' } },
        React.createElement('label', null, T(f.labelKey)),
        React.createElement('input', f.numeric ? {
          type: 'number',
          min: f.min !== undefined ? f.min : 1000,
          step: 1000,
          value: val(f.key),
          placeholder: String(f.defaultValue !== undefined ? f.defaultValue : 15000),
          // #115: clearing the field must send the explicit default. Deleting the
          // key would leave the previously stored value in place (the settings
          // scope skips absent keys), so the field would silently keep 1 ms.
          onChange: (e) => onChange(f.key, e.target.value === ''
            ? (f.defaultValue !== undefined ? f.defaultValue : 15000)
            : Number(e.target.value)),
        } : {
          type: 'text',
          value: val(f.key),
          placeholder: f.placeholderKey ? T(f.placeholderKey) : '',
          onChange: (e) => onChange(f.key, e.target.value)
        })
      );
      const section = (key, titleKey, children) => {
        const open = Boolean(sections[key]);
        return React.createElement('div', { className: 'dsh-cron-section', key },
          React.createElement('button', {
            type: 'button',
            className: 'dsh-cron-section-head',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => onToggleSection(key)
          },
            React.createElement('span', null, T(titleKey)),
            React.createElement('span', { className: 'dsh-cron-section-chevron', 'data-open': open ? 'true' : 'false' }, '▾')
          ),
          open && React.createElement('div', { className: 'dsh-cron-section-body' }, children)
        );
      };

      return [
        section('secrets', 'settings.secretsSection', [
          React.createElement('div', { className: 'dsh-cron-hint', key: 'hint', style: { marginBottom: '10px' } }, T('settings.secretsHint')),
          ...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'secrets').map(field),
        ]),
        section('channels', 'settings.deliverySection', [
          React.createElement('div', { className: 'dsh-cron-form-row', key: 'row' },
            ...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'channels').map(field)
          ),
        ]),
        section('automation', 'settings.automationSection', [
          React.createElement('div', { className: 'dsh-cron-hint', key: 'hint', style: { marginBottom: '10px' } }, T('settings.automationHint')),
          React.createElement('div', { className: 'dsh-cron-form-row', key: 'row' },
            ...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'automation').map(field)
          ),
        ]),
        section('templates', 'settings.templatesSection', [
          React.createElement('div', { className: 'dsh-cron-form-group', key: 'global', style: { marginBottom: '10px' } },
            React.createElement('label', null, T('settings.templateLabel')),
            React.createElement('input', {
              type: 'text',
              value: val('template'),
              onChange: (e) => onChange('template', e.target.value)
            }),
            React.createElement('div', { className: 'dsh-cron-hint' }, T('settings.templateHint'))
          ),
          React.createElement('div', { className: 'dsh-cron-form-row', key: 'perchannel' },
            ...DELIVERY_CHANNELS.map((id) => React.createElement('div', { className: 'dsh-cron-form-group', key: id, style: { marginBottom: '10px' } },
              React.createElement('label', null, T('settings.channelTemplateLabel', { channel: T(CHANNEL_LABEL_KEYS[id]) })),
              React.createElement('input', {
                type: 'text',
                value: (values.channelTemplates && values.channelTemplates[id]) || '',
                onChange: (e) => onChannelTemplate(id, e.target.value)
              })
            ))
          ),
        ]),
      ];
    }

    /** Parse a KEY=VALUE textarea into the task env object (#38). */
    function parseEnvText(text) {
      const env = {};
      for (const rawLine of String(text || '').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key) env[key] = value;
      }
      return Object.keys(env).length ? env : undefined;
    }

    function formatEnvText(env) {
      if (!env || typeof env !== 'object') return '';
      return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
    }

    // Status colors: core semantic state tokens first (same set dsh-clinebot
    // uses), plugin fallbacks as a single point of change (#105).
    const STYLES = `
      :root {
        --dsh-cron-success: var(--dsw-alias-state-success-primary, #10b981);
        --dsh-cron-success-bg: rgba(16, 185, 129, 0.1);
        --dsh-cron-danger: var(--dsw-alias-state-error-primary, #ef4444);
        --dsh-cron-danger-bg: rgba(239, 68, 68, 0.1);
        --dsh-cron-info: var(--dsw-alias-state-brand-primary, #60a5fa);
        --dsh-cron-info-bg: rgba(96, 165, 250, 0.12);
        --dsh-cron-accent: var(--dsw-alias-state-info-primary, #c084fc);
        --dsh-cron-accent-bg: rgba(168, 85, 247, 0.12);
        --dsh-cron-warning: var(--dsw-alias-state-warning-primary, #eab308);
        --dsh-cron-warning-bg: rgba(234, 179, 8, 0.12);
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

      .dsh-cron-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base, #171717); color: var(--dsw-alias-label-primary, #ededed); overflow-y: auto; padding: 24px 48px 32px; z-index: 100; box-sizing: border-box; }
      .dsh-cron-container { max-width: 960px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; padding: 8px 0 32px; box-sizing: border-box; }

      .dsh-cron-top-bar { display: flex; align-items: center; gap: 12px; }
      .dsh-cron-back-btn { appearance: none; font: inherit; cursor: pointer; color: var(--dsw-alias-label-secondary, #9ca3af); background: 0 0; border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 8px; align-items: center; gap: 6px; padding: 4px 12px; font-size: 13px; display: inline-flex; flex: none; height: 32px; box-sizing: border-box; }
      .dsh-cron-back-btn:hover { color: var(--dsw-alias-label-primary, #ededed); background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.06))); }

      .dsh-cron-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--dsw-alias-border-l2, #383838); }
      .dsh-cron-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 6px; }
      .dsh-cron-subtitle { font-size: 14px; color: var(--dsw-alias-label-secondary, #9ca3af); line-height: 1.5; }
      .dsh-cron-create-btn { appearance: none; display: inline-flex; align-items: center; gap: 6px; background: var(--dsw-alias-bg-layer-2, #262626); color: var(--dsw-alias-label-primary, #fff); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 9999px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; position: relative; }
      .dsh-cron-create-btn:hover { background: var(--dsw-alias-bg-layer-hover, var(--dsw-alias-interactive-bg-hover, #333)); }
      .dsh-cron-dropdown { position: absolute; top: calc(100% + 6px); right: 0; width: 200px; background: var(--dsw-alias-bg-layer-3, #212121); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 12px; padding: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 200; }
      .dsh-cron-dropdown-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: var(--dsw-alias-label-primary, #ededed); font-size: 13.5px; text-align: left; cursor: pointer; }
      .dsh-cron-dropdown-item:hover { background: var(--dsw-alias-interactive-bg-hover, #2a2a2a); }
      .dsh-cron-search-bar { position: relative; margin-bottom: 0; }
      .dsh-cron-search-input { width: 100%; height: 36px; background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 0 12px 0 38px; color: var(--dsw-alias-label-primary, inherit); font-size: 13px; outline: none; box-sizing: border-box; }
      .dsh-cron-search-input:focus { outline: none; border-color: var(--dsh-cron-info); }
      .dsh-cron-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-tertiary, #666); }
      .dsh-cron-filters { margin-top: 8px; }
      .dsh-cron-filter-toggle { background: none; border: 1px solid var(--dsw-alias-border-l2, #333); color: var(--dsw-alias-label-secondary, #aaa); border-radius: 8px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
      .dsh-cron-filter-toggle:hover { color: var(--dsw-alias-label-primary, #eee); border-color: var(--dsh-cron-info); }
      .dsh-cron-filter-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2, #2e2e2e); border-radius: 8px; background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.02)); }
      .dsh-cron-filter-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); }
      .dsh-cron-filter-field select { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); color: var(--dsw-alias-label-primary, inherit); border-radius: 6px; padding: 5px 8px; font-size: 12.5px; }
      .dsh-cron-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
      .dsh-cron-tab { appearance: none; background: transparent; border: 1px solid var(--dsw-alias-border-l2, #383838); padding: 4px 12px; border-radius: 999px; color: var(--dsw-alias-label-secondary, #9ca3af); font-size: 12px; font-weight: 500; cursor: pointer; }
      .dsh-cron-tab[data-active="true"] { background: var(--dsw-alias-bg-layer-4, #2a2a2a); color: var(--dsw-alias-label-primary, #fff); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #383838)); }
      .dsh-cron-task-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 0; }
      .dsh-cron-task-item { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--dsw-alias-bg-layer-3, #1e1e1e); border: 1px solid var(--dsw-alias-border-l2, #2e2e2e); border-radius: 12px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
      .dsh-cron-task-item:hover, .dsh-cron-task-item:focus-visible { background: var(--dsw-alias-bg-layer-4, #242424); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l1, #444)); outline: none; }
      .dsh-cron-task-prompt-preview { font-size: 12.5px; color: var(--dsw-alias-label-secondary, #888); margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 520px; line-height: 1.3; }
      .dsh-cron-type-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #383838); text-transform: uppercase; font-weight: 500; margin-left: 8px; vertical-align: middle; }
      .dsh-cron-task-model-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #383838); background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06)); color: var(--dsw-alias-label-secondary, #aaa); margin-left: 8px; vertical-align: middle; }
      .dsh-cron-task-actions { display: flex; gap: 8px; }
      .dsh-cron-icon-btn { appearance: none; font: inherit; background: var(--dsw-alias-bg-layer-2, transparent); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-weight: 500; color: var(--dsw-alias-label-primary, #aaa); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; }
      .dsh-cron-icon-btn:hover { background: var(--dsw-alias-bg-layer-4, #2a2a2a); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #444)); }
      .dsh-cron-icon-btn.dsh-cron-danger { color: var(--dsh-cron-danger); border-color: var(--dsh-cron-danger-bg); }
      .dsh-cron-icon-btn.dsh-cron-danger:hover { background: var(--dsh-cron-danger-bg); border-color: var(--dsh-cron-danger); }
      .dsh-cron-task-status-btn { background: none; border: 1px solid var(--dsw-alias-border-l2, #444); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; flex-shrink: 0; }
      .dsh-cron-task-status-btn[data-active="true"] { color: var(--dsh-cron-success); border-color: var(--dsh-cron-success); }
      .dsh-cron-recs-title { font-size: 16px; font-weight: 600; margin-bottom: 14px; }
      .dsh-cron-recs-list { display: flex; flex-direction: column; gap: 10px; }
      .dsh-cron-rec-card { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--dsw-alias-bg-layer-3, #1c1c1c); border: 1px solid var(--dsw-alias-border-l2, #282828); border-radius: 12px; cursor: pointer; transition: background 0.15s; }
      .dsh-cron-rec-card:hover, .dsh-cron-rec-card:focus-visible { background: var(--dsw-alias-bg-layer-4, #242424); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #383838)); outline: none; }
      .dsh-cron-rec-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.03)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .dsh-cron-rec-content { flex: 1; min-width: 0; }
      .dsh-cron-rec-title { font-size: 14.5px; font-weight: 500; margin-bottom: 4px; }
      .dsh-cron-rec-time { font-size: 13px; color: var(--dsw-alias-label-secondary, #9ca3af); font-weight: normal; margin-left: 8px; }
      .dsh-cron-rec-desc { font-size: 13px; color: var(--dsw-alias-label-tertiary, #71717a); }

      .dsh-cron-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .dsh-cron-modal { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 16px; width: 100%; max-width: 540px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); box-sizing: border-box; }
      .dsh-cron-modal-scroll { max-width: 620px; max-height: 88vh; overflow-y: auto; }
      .dsh-cron-section-head { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; padding: 0; margin-bottom: 10px; font: inherit; font-weight: 500; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #aaa); cursor: pointer; }
      .dsh-cron-section-head:hover { color: var(--dsw-alias-label-primary, #eee); }
      .dsh-cron-section-chevron { transition: transform 0.15s ease; display: inline-block; }
      .dsh-cron-section-chevron[data-open="false"] { transform: rotate(-90deg); }
      .dsh-cron-section-body { padding-bottom: 4px; }
      .dsh-cron-modal-title { font-size: 18px; font-weight: 600; margin-bottom: 18px; }
      .dsh-cron-form-group { margin-bottom: 16px; }
      .dsh-cron-form-group label { display: block; font-size: 13px; color: var(--dsw-alias-label-secondary, #aaa); margin-bottom: 6px; }
      .dsh-cron-form-group input, .dsh-cron-form-group textarea, .dsh-cron-form-group select { width: 100%; background: var(--dsw-alias-bg-layer-2, #141414); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 8px 12px; color: var(--dsw-alias-label-primary, #fff); font-size: 13px; outline: none; box-sizing: border-box; }
      .dsh-cron-form-group input:focus, .dsh-cron-form-group textarea:focus, .dsh-cron-form-group select:focus { outline: none; border-color: var(--dsh-cron-info); }
      .dsh-cron-form-group select { cursor: pointer; }
      .dsh-cron-form-group textarea { min-height: 80px; resize: vertical; }
      .dsh-cron-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .dsh-cron-modal-foot { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 20px; }
      .dsh-cron-btn-primary { background: var(--dsw-alias-label-primary, #ededed); color: var(--dsw-alias-bg-layer-3, #111); border: 1px solid transparent; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .dsh-cron-btn-primary:hover:not(:disabled) { opacity: 0.88; }
      .dsh-cron-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .dsh-cron-btn-secondary { appearance: none; font: inherit; background: var(--dsw-alias-bg-layer-2, transparent); color: var(--dsw-alias-label-primary, #999); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; }
      .dsh-cron-btn-secondary:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-4, #2a2a2a); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #444)); }
      .dsh-cron-chat-box { position: relative; background: var(--dsw-alias-bg-base, #141414); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 12px; padding: 12px; }
      .dsh-cron-chat-input { width: 100%; background: transparent; border: none; color: var(--dsw-alias-label-primary, #fff); font-size: 14px; min-height: 100px; resize: vertical; outline: none; box-sizing: border-box; line-height: 1.5; }
      .dsh-cron-chat-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, #222); }
      .dsh-cron-chat-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #666); }
      .dsh-cron-send-btn { width: 34px; height: 34px; border-radius: 8px; background: var(--dsw-alias-label-primary, #ededed); color: var(--dsw-alias-bg-base, #111); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s, background 0.15s; }
      .dsh-cron-send-btn:hover:not(:disabled) { transform: translateY(-1px); }
      .dsh-cron-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .dsh-cron-card { background: var(--dsw-alias-bg-layer-3, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 12px; padding: 18px 20px; margin-bottom: 0; display: flex; flex-direction: column; gap: 14px; }
      .dsh-cron-card-head-btn { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; background: 0 0; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 12px; padding: 0; }
      .dsh-cron-card-head-btn .dsh-cron-card-title { flex: 1; }
      .dsh-cron-card-title { font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-chev { margin-left: auto; flex: none; color: var(--dsw-alias-label-tertiary, #888); transition: transform 0.16s; display: flex; align-items: center; }
      .dsh-cron-chev-open { transform: rotate(180deg); }
      .dsh-cron-card-body { border-top: 1px solid var(--dsw-alias-border-l2, #333); margin-top: 2px; padding-top: 14px; }
      .dsh-cron-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .dsh-cron-card-desc { font-size: 13px; color: var(--dsw-alias-label-secondary, #888); line-height: 1.4; }

      .dsh-cron-modal-nav { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, #2e2e2e); margin-bottom: 18px; padding-bottom: 2px; }
      .dsh-cron-modal-tab { appearance: none; background: transparent; border: none; border-bottom: 2px solid transparent; padding: 8px 14px; font-size: 13.5px; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; font-weight: 500; transition: color 0.15s, border-color 0.15s; }
      .dsh-cron-modal-tab:hover { color: var(--dsw-alias-label-secondary, #ccc); }
      .dsh-cron-modal-tab[data-active="true"] { color: var(--dsw-alias-label-primary, #fff); border-bottom-color: var(--dsw-alias-label-primary, #ededed); }
      .dsh-cron-history-list { display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow-y: auto; padding-right: 4px; }
      .dsh-cron-history-item { background: var(--dsw-alias-bg-base, #161616); border: 1px solid var(--dsw-alias-border-l1, #2a2a2a); border-radius: 8px; padding: 12px 14px; font-size: 12.5px; }
      .dsh-cron-history-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .dsh-cron-history-status { font-weight: 500; font-size: 11px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #383838); }
      .dsh-cron-history-status[data-status="success"] { background: var(--dsh-cron-success-bg); color: var(--dsh-cron-success); border-color: var(--dsh-cron-success); }
      .dsh-cron-history-status[data-status="error"], .dsh-cron-history-status[data-status="timeout"] { background: var(--dsh-cron-danger-bg); color: var(--dsh-cron-danger); border-color: var(--dsh-cron-danger); }
      .dsh-cron-history-status[data-status="skipped"], .dsh-cron-history-status[data-status="missed"] { background: var(--dsh-cron-warning-bg); color: var(--dsh-cron-warning); border-color: var(--dsh-cron-warning); }
      .dsh-cron-history-time { color: var(--dsw-alias-label-tertiary, #777); font-size: 12px; }
      .dsh-cron-history-output { background: var(--dsw-alias-bg-base, #0c0c0c); border: 1px solid var(--dsw-alias-border-l1, #222); border-radius: 6px; padding: 8px 10px; font-family: monospace; font-size: 12px; color: var(--dsw-alias-label-secondary, #bbb); max-height: 140px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin-top: 6px; }
      .dsh-cron-history-empty { text-align: center; padding: 36px 0; color: var(--dsw-alias-label-tertiary, #666); font-size: 13.5px; }

      .dsh-cron-stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 0; }
      .dsh-cron-stat-card { background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.02)); border: 1px solid var(--dsw-alias-border-l2, #222); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
      .dsh-cron-stat-val { font-size: 18px; font-weight: 700; color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-stat-lbl { font-size: 12px; color: var(--dsw-alias-label-secondary, #777); margin-top: 0; }
      .dsh-cron-oneshot-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsh-cron-accent); background: var(--dsh-cron-accent-bg); color: var(--dsh-cron-accent); font-weight: 500; }
      .dsh-cron-config-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #444); color: var(--dsw-alias-label-secondary, #ccc); font-weight: 500; }
      .dsh-cron-cost-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsh-cron-success); background: var(--dsh-cron-success-bg); color: var(--dsh-cron-success); font-weight: 500; }
      .dsh-cron-tokens-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsh-cron-info); background: var(--dsh-cron-info-bg); color: var(--dsh-cron-info); }
      .dsh-cron-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dsw-alias-label-secondary, #ccc); cursor: pointer; user-select: none; }
      .dsh-cron-checkbox-row input { width: 15px; height: 15px; margin: 0; cursor: pointer; accent-color: var(--dsw-alias-label-primary, #ededed); }
      .dsh-cron-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); margin-top: 4px; }
      .dsh-cron-channel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 12px; }
      .dsh-cron-section { border-top: 1px solid var(--dsw-alias-border-l2, #2e2e2e); margin-top: 16px; padding-top: 12px; }
      .dsh-cron-section-title { font-weight: 500; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #aaa); margin-bottom: 10px; }
      .dsh-cron-secret-row { display: flex; align-items: center; gap: 8px; }
      .dsh-cron-secret-row input { flex: 1; }
      .dsh-cron-badge-ref { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.06)); color: var(--dsw-alias-label-tertiary, #888); white-space: nowrap; }
      .dsh-cron-status-banner { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-top: 12px; }
      .dsh-cron-status-banner[data-type="success"] { background: var(--dsh-cron-success-bg); border: 1px solid var(--dsh-cron-success); color: var(--dsh-cron-success); }
      .dsh-cron-status-banner[data-type="error"] { background: var(--dsh-cron-danger-bg); border: 1px solid var(--dsh-cron-danger); color: var(--dsh-cron-danger); }
      .dsh-cron-status-banner[data-type="info"] { background: var(--dsh-cron-info-bg); border: 1px solid var(--dsh-cron-info); color: var(--dsh-cron-info); }
      @keyframes dsh-cron-pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); } 70% { box-shadow: 0 0 0 9px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
      .dsh-cron-pulse { animation: dsh-cron-pulse-ring 1.6s infinite; border-color: var(--dsh-cron-success); color: var(--dsh-cron-success); }

      /* #34: sidebar job list */
      .dsh-cron-sidebar-jobs { display: flex; flex-direction: column; gap: 2px; margin: 2px 0 6px 0; }
      .dsh-cron-sidebar-jobs-head { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; padding: 4px 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; border-radius: 6px; text-align: left; }
      .dsh-cron-sidebar-jobs-head:hover { color: var(--dsw-alias-label-primary, #eee); background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.04)); }
      .dsh-cron-sidebar-jobs-head::after { content: '▾'; font-size: 10px; transition: transform 0.15s ease; }
      .dsh-cron-sidebar-jobs[data-open="false"] .dsh-cron-sidebar-jobs-head::after { transform: rotate(-90deg); }
      .dsh-cron-sidebar-jobs[data-open="false"] .dsh-cron-sidebar-jobs-list { display: none; }
      .dsh-cron-sidebar-jobs-list { display: flex; flex-direction: column; gap: 2px; padding-left: 10px; }
      .dsh-cron-sidebar-job { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; background: none; border: none; border-left: 2px solid transparent; padding: 3px 8px; font: inherit; cursor: pointer; border-radius: 0 6px 6px 0; text-align: left; }
      .dsh-cron-sidebar-job:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.04)); border-left-color: var(--dsh-cron-info); }
      .dsh-cron-sidebar-job-title { font-size: 12px; color: var(--dsw-alias-label-secondary, #ccc); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsh-cron-sidebar-job-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary, #777); }
      .dsh-cron-sidebar-empty, .dsh-cron-sidebar-more { font-size: 11px; color: var(--dsw-alias-label-tertiary, #777); padding: 2px 8px; }
      .dsh-cron-task-highlight { border-color: var(--dsh-cron-info) !important; box-shadow: 0 0 0 2px var(--dsh-cron-info-bg); }

      /* #39: narrow screens. Only layout changes — no information is hidden. */
      @media (max-width: 900px) {
        .dsh-cron-container { padding: 8px 12px 24px; gap: 14px; }
        .dsh-cron-form-row { grid-template-columns: 1fr; }
        .dsh-cron-channel-grid { grid-template-columns: 1fr; }
        .dsh-cron-filter-panel { grid-template-columns: 1fr; }
        .dsh-cron-modal { padding: 16px; border-radius: 12px; }
        .dsh-cron-modal-scroll { max-height: 92vh; }
        .dsh-cron-task-item { flex-wrap: wrap; gap: 10px; }
        .dsh-cron-task-actions { margin-left: auto; }
        .dsh-cron-history-list { max-height: 320px; }
      }
      @media (max-width: 640px) {
        .dsh-cron-container { padding: 6px 8px 20px; }
        .dsh-cron-top-bar { flex-wrap: wrap; gap: 8px; }
        .dsh-cron-tabs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
        .dsh-cron-tab { white-space: nowrap; }
        .dsh-cron-stats-bar { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
        .dsh-cron-task-item { align-items: flex-start; padding: 12px; }
        .dsh-cron-task-title { flex-wrap: wrap; row-gap: 4px; }
        .dsh-cron-modal { padding: 14px; }
        .dsh-cron-modal-foot { flex-direction: column-reverse; }
        .dsh-cron-modal-foot > button { width: 100%; }
        .dsh-cron-filter-panel { padding: 8px 10px; }
        .dsh-cron-card { padding: 14px; }
        /* 16px keeps iOS Safari from zooming the page when a field is focused. */
        .dsh-cron-modal input, .dsh-cron-modal select, .dsh-cron-modal textarea,
        .dsh-cron-card input, .dsh-cron-search-input, .dsh-cron-filter-field select { font-size: 16px; }
      }
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

    /**
     * A config-declared task is owned by the profile config file (#50): the
     * panel shows it, but editing, pausing or deleting it here would be undone
     * at the next start, so the row keeps the source label instead of the
     * actions that cannot stick.
     */
    function isConfigManaged(task) {
      return Boolean(task) && task.managedBy === 'config';
    }
    function T_KEY(t, key, vars) {
      return (typeof t === 'function' ? t : translate)(key, vars);
    }

    function CronScreen(props) {
      const { ctx, toggle, onClose } = props;
      const t = props.t || translate;
      const [tab, setTab] = React.useState('all');
      const [query, setQuery] = React.useState('');
      // Facet filters (#40): applied client-side over the already-loaded list so
      // toggling them is instant and does not touch the polling request.
      const [filterType, setFilterType] = React.useState('');
      const [filterModel, setFilterModel] = React.useState('');
      const [filterChannel, setFilterChannel] = React.useState('');
      const [filtersOpen, setFiltersOpen] = React.useState(false);
      const [tasks, setTasks] = React.useState([]);
      const [recs, setRecs] = React.useState([]);
      const [loading, setLoading] = React.useState(false);
      const [fetchError, setFetchError] = React.useState(null);
      const [dropdownOpen, setDropdownOpen] = React.useState(false);

      // Export/import state (#42)
      const [transferBusy, setTransferBusy] = React.useState(false);
      const [importDoc, setImportDoc] = React.useState(null);
      const [importSummary, setImportSummary] = React.useState(null);
      const [importStrategy, setImportStrategy] = React.useState('skip');
      const importFileRef = React.useRef(null);

      // Manual / Edit modal state
      const [manualModalOpen, setManualModalOpen] = React.useState(false);
      const [formId, setFormId] = React.useState(null);
      const [formTitle, setFormTitle] = React.useState('');
      const [formSchedule, setFormSchedule] = React.useState('');
      const [formType, setFormType] = React.useState('llm');
      const [formPrompt, setFormPrompt] = React.useState('');
      const [formProvider, setFormProvider] = React.useState('');
      const [formModel, setFormModel] = React.useState('');
      const [formFallbackModel, setFormFallbackModel] = React.useState('');
      const [formSilentRule, setFormSilentRule] = React.useState('');
      const [formInspectOnFailure, setFormInspectOnFailure] = React.useState(false);
      const [formDelivery, setFormDelivery] = React.useState('isolated');
      const [selectedTaskMeta, setSelectedTaskMeta] = React.useState(null);
      const [modalTab, setModalTab] = React.useState('params');
      const [taskHistory, setTaskHistory] = React.useState([]);
      const [historyLoading, setHistoryLoading] = React.useState(false);
      const [formNotifyTelegram, setFormNotifyTelegram] = React.useState(false);
      const [formChannels, setFormChannels] = React.useState([]);
      const [formTemplate, setFormTemplate] = React.useState('');
      const [formOnlyOnFailure, setFormOnlyOnFailure] = React.useState(false);
      const [formTimeoutSeconds, setFormTimeoutSeconds] = React.useState(1800);
      const [formOverlapPolicy, setFormOverlapPolicy] = React.useState('skip');
      const [formKanbanMode, setFormKanbanMode] = React.useState('none');
      const [formTimezone, setFormTimezone] = React.useState('');
      const [formMisfirePolicy, setFormMisfirePolicy] = React.useState('skip');
      const [formMaxRetries, setFormMaxRetries] = React.useState(0);
      const [formPermissionPreset, setFormPermissionPreset] = React.useState('default');
      const [formEnv, setFormEnv] = React.useState('');
      const [formCwd, setFormCwd] = React.useState('');
      const [formWorkspaceId, setFormWorkspaceId] = React.useState('');
      const [formWorktree, setFormWorktree] = React.useState(false);
      const [formKeepWorktree, setFormKeepWorktree] = React.useState(false);
      const [formHttpMethod, setFormHttpMethod] = React.useState('GET');
      const [formHttpUrl, setFormHttpUrl] = React.useState('');
      const [formHttpHeaders, setFormHttpHeaders] = React.useState('');
      const [formHttpBody, setFormHttpBody] = React.useState('');
      const [formSshProfileId, setFormSshProfileId] = React.useState('');
      const [formSshTarget, setFormSshTarget] = React.useState('');
      const [formSshKeyPath, setFormSshKeyPath] = React.useState('');
      const [formDockerImage, setFormDockerImage] = React.useState('');
      const [formNodePath, setFormNodePath] = React.useState('');
      const [formPythonPath, setFormPythonPath] = React.useState('');
      const [formSkillName, setFormSkillName] = React.useState('');
      const [formWorkflowName, setFormWorkflowName] = React.useState('');
      const [stats, setStats] = React.useState(null);

      // Live execution indicator (#35): a light 1s tick only while some task
      // is actually running.
      const tasksRef = React.useRef([]);
      const [nowTick, setNowTick] = React.useState(0);
      React.useEffect(() => {
        tasksRef.current = tasks;
      }, [tasks]);
      React.useEffect(() => {
        const tick = setInterval(() => {
          if (tasksRef.current.some((t2) => t2.running)) setNowTick((v) => v + 1);
        }, 1000);
        return () => clearInterval(tick);
      }, []);

      // Settings modal state
      const [settingsModalOpen, setSettingsModalOpen] = React.useState(false);
      const [settingsBotToken, setSettingsBotToken] = React.useState('');
      const [settingsChatId, setSettingsChatId] = React.useState('');
      const [settingsNotifyGlobal, setSettingsNotifyGlobal] = React.useState(false);
      const [settingsOnlyOnFailureGlobal, setSettingsOnlyOnFailureGlobal] = React.useState(false);
      const [settingsKanbanUrl, setSettingsKanbanUrl] = React.useState('http://127.0.0.1:3000');
      const [settingsDelivery, setSettingsDelivery] = React.useState({});
      const [settingsSections, setSettingsSections] = React.useState({ channels: true });
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

      /** #40: facet filtering happens client-side over the loaded list. */
      const visibleTasks = React.useMemo(() => {        let list = tasks;
        if (filterType) list = list.filter((x) => (x.type || 'llm') === filterType);
        if (filterModel) list = list.filter((x) => String(x.model || '').split('/').pop() === filterModel);
        if (filterChannel) {
          list = list.filter((x) => {
            const channels = Array.isArray(x.channels) && x.channels.length
              ? x.channels
              : [x.notifyTelegram ? 'telegram' : null, (x.kanbanMode || 'none') !== 'none' ? 'kanban' : null].filter(Boolean);
            return channels.includes(filterChannel);
          });
        }
        return list;
      }, [tasks, filterType, filterModel, filterChannel]);

      const filterTypeOptions = React.useMemo(
        () => Array.from(new Set(tasks.map((x) => x.type || 'llm'))).sort(),
        [tasks]
      );

      const filterModelOptions = React.useMemo(
        () => Array.from(new Set(tasks.map((x) => String(x.model || '').split('/').pop()).filter(Boolean))).sort(),
        [tasks]
      );

      const resetFilters = () => {
        setFilterType('');
        setFilterModel('');
        setFilterChannel('');
      };

      /** #34: scroll to and flash the task the sidebar list asked for. */
      React.useEffect(() => {
        if (!pendingTaskHighlight || tasks.length === 0) return;
        const id = pendingTaskHighlight;
        pendingTaskHighlight = null;
        const node = document.querySelector('[data-task-id="' + id + '"]');
        if (!node) return;
        if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center' });
        node.classList.add('dsh-cron-task-highlight');
        setTimeout(() => { try { node.classList.remove('dsh-cron-task-highlight'); } catch (_) {} }, 2500);
      }, [tasks]);

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

      const lastEtagRef = React.useRef('');

      React.useEffect(() => {
        fetchTasks();

        let timerId = null;
        let isDestroyed = false;

        const doPoll = () => {
          if (isDestroyed) return;
          const headers = {};
          if (lastEtagRef.current) headers['If-None-Match'] = lastEtagRef.current;

          fetch('/dsh-cron/tasks?status=' + encodeURIComponent(tab) + '&query=' + encodeURIComponent(query), { headers })
            .then(res => {
              if (res.status === 304) {
                // Not modified: skip parsing JSON
                return null;
              }
              const etag = res.headers.get('ETag');
              if (etag) lastEtagRef.current = etag;
              return res.json();
            })
            .then(data => {
              if (data && data.ok) {
                setTasks(data.tasks || []);
                setRecs(data.recommendations || []);
                setStats(data.stats || null);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (isDestroyed) return;
              // Adaptive interval: 30s when tab is hidden, 8s when active (#134)
              const intervalMs = (typeof document !== 'undefined' && document.hidden) ? 30000 : 8000;
              timerId = setTimeout(doPoll, intervalMs);
            });
        };

        // Trigger immediate fetch when visibility returns
        const onVisibilityChange = () => {
          if (typeof document !== 'undefined' && !document.hidden) {
            if (timerId) clearTimeout(timerId);
            doPoll();
          }
        };

        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibilityChange);
        }

        timerId = setTimeout(doPoll, 8000);

        return () => {
          isDestroyed = true;
          if (timerId) clearTimeout(timerId);
          if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisibilityChange);
          }
        };
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

      /** #41: duplicate a task; the server copies config, resets run state (#41). */
      const handleDuplicate = async (task) => {
        try {
          const res = await fetch('/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/duplicate', { method: 'POST' });
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'duplicate.failed', { error: (data && data.error) || '' }));
            return;
          }
          await fetchTasks();
          // A one-shot copy keeps its original schedule string, so warn instead
          // of letting the user resume a task pointing at a past moment.
          alert(task.oneShot ? T_KEY(t, 'duplicate.oneShotHint') : T_KEY(t, 'duplicate.done'));
        } catch (err) {
          alert(T_KEY(t, 'duplicate.failed', { error: err.message }));
        }
      };

      /** A task id must not shadow a collection route (#42 review finding). */
      const RESERVED_TASK_IDS = ['export', 'import'];

      /** Import needs the script-confirm header when the file has code tasks. */
      const importHeaders = (document_) => {
        const headers = { 'Content-Type': 'application/json' };
        const tasks = (document_ && Array.isArray(document_.tasks)) ? document_.tasks : [];
        if (tasks.some((x) => CODE_FORM_TYPES.includes(x && x.type))) headers[SCRIPT_CONFIRM_HEADER] = 'script';
        return headers;
      };

      /** #42: download the task configuration as a JSON file. */
      const handleExport = async () => {
        setTransferBusy(true);
        try {
          const res = await fetch('/dsh-cron/tasks/export');
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'transfer.exportFailed', { error: (data && data.error) || '' }));
            return;
          }
          const blob = new Blob([JSON.stringify(data.document, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `dsh-cron-tasks-${stamp}.json`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          alert(T_KEY(t, 'transfer.exported', { count: data.count }));
        } catch (err) {
          alert(T_KEY(t, 'transfer.exportFailed', { error: err.message }));
        } finally {
          setTransferBusy(false);
        }
      };

      /** #42: read the picked file, validate it server-side and show the plan. */
      const handleImportFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        setTransferBusy(true);
        try {
          const text = await file.text();
          let document_;
          try {
            document_ = JSON.parse(text);
          } catch (parseErr) {
            alert(T_KEY(t, 'transfer.badFile', { error: parseErr.message }));
            return;
          }
          const res = await fetch('/dsh-cron/tasks/import', {
            method: 'POST',
            headers: importHeaders(document_),
            body: JSON.stringify({ document: document_, dryRun: true, strategy: importStrategy })
          });
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'transfer.importFailed', { error: (data && data.error) || '' }));
            return;
          }
          setImportDoc(document_);
          setImportSummary(data.summary);
        } catch (err) {
          alert(T_KEY(t, 'transfer.importFailed', { error: err.message }));
        } finally {
          setTransferBusy(false);
        }
      };

      const handleImportConfirm = async () => {
        if (!importDoc) return;
        setTransferBusy(true);
        try {
          const res = await fetch('/dsh-cron/tasks/import', {
            method: 'POST',
            headers: importHeaders(importDoc),
            body: JSON.stringify({ document: importDoc, strategy: importStrategy })
          });
          const data = await res.json();
          if (!data.ok) {
            alert(T_KEY(t, 'transfer.importFailed', { error: (data && data.error) || '' }));
            return;
          }
          setImportDoc(null);
          setImportSummary(null);
          await fetchTasks();
          alert(T_KEY(t, 'transfer.imported', { count: data.imported }));
        } catch (err) {
          alert(T_KEY(t, 'transfer.importFailed', { error: err.message }));
        } finally {
          setTransferBusy(false);
        }
      };

      /** #49: tune an existing task in a dialogue instead of editing fields. */
      const handleTuneWithDsh = async (task) => {
        const lines = [
          `Tune the existing scheduled task "${task.title}" (id: ${task.id}).`,
          'Its current configuration is:',
          `- type: ${task.type || 'llm'}`,
          `- schedule: ${task.scheduleText || task.schedule} (${task.schedule})`,
          `- status: ${task.status}`,
          task.model ? `- model: ${task.model}${task.fallbackModel ? `, fallback: ${task.fallbackModel}` : ''}` : null,
          Array.isArray(task.channels) && task.channels.length ? `- channels: ${task.channels.join(', ')}` : null,
          `- prompt: ${String(task.prompt || '').slice(0, 400)}`,
          '',
          'Ask what should change, then apply it with the cron_update_task tool (read the current state again with cron_get_task if you need the full configuration).',
          'If the change makes the task execute code (script/node/python/ssh/docker), confirm it with me explicitly before applying it.',
        ].filter(Boolean);
        try {
          const res = await fetch('/dsh-cron/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: lines.join(String.fromCharCode(10)) })
          });
          const data = await res.json();
          if (!data.ok || !data.sessionId) {
            alert(T_KEY(t, 'tune.startFailed', { error: (data && data.error) || '' }));
            return;
          }
          if (onClose) onClose();
          else toggle.set(false);
          await openSession(ctx, data.sessionId);
        } catch (err) {
          alert(T_KEY(t, 'tune.startFailed', { error: err.message }));
        }
      };

      const handleDelete = async (id) => {
        if (!confirm(T_KEY(t, 'confirm.delete'))) return;
        try {
          await fetch('/dsh-cron/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
          fetchTasks();
        } catch (err) {}      };

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
            setSettingsDelivery(pickDeliverySettings(data.settings));
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
            body: JSON.stringify(Object.assign({
              botToken: settingsBotToken,
              chatId: settingsChatId,
              notifyTelegram: settingsNotifyGlobal,
              onlyOnFailure: settingsOnlyOnFailureGlobal,
              kanbanBaseUrl: settingsKanbanUrl,
            }, settingsDelivery))
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

      /**
       * Update one delivery setting without dropping the rest of the object.
       * `undefined` removes the key so the server default applies again; an
       * empty string is kept so a text field can be cleared on purpose.
       */
      const updateDelivery = (key, value) => {
        setSettingsDelivery((prev) => {
          const next = Object.assign({}, prev);
          if (value === undefined) delete next[key];
          else next[key] = value;
          return next;
        });
      };

      /** Per-channel template overrides live in a nested map on the server. */
      const updateChannelTemplate = (channelId, value) => {
        setSettingsDelivery((prev) => {
          const templates = Object.assign({}, prev.channelTemplates || {});
          if (value && value.trim()) templates[channelId] = value;
          else delete templates[channelId];
          return Object.assign({}, prev, { channelTemplates: templates });
        });
      };

      const toggleDeliverySection = (key) => {
        setSettingsSections((prev) => Object.assign({}, prev, { [key]: !prev[key] }));
      };

      const handleTestTelegram = async () => {        setTestStatus({ loading: true, message: T_KEY(t, 'settings.sending') });
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
        setFormChannels([]);
        setFormTemplate('');
        setFormOnlyOnFailure(false);
        setFormTimeoutSeconds(1800);
        setFormOverlapPolicy('skip');
        setFormKanbanMode('none');
        setFormTimezone('');
        setFormMisfirePolicy('skip');
        setFormMaxRetries(0);
        setFormPermissionPreset('default');
        setFormEnv('');
        setFormCwd('');
        setFormWorkspaceId('');
        setFormWorktree(false);
        setFormKeepWorktree(false);
        setFormHttpMethod('GET');
        setFormHttpUrl('');
        setFormHttpHeaders('');
        setFormHttpBody('');
        setFormSshProfileId('');
        setFormSshTarget('');
        setFormSshKeyPath('');
        setFormDockerImage('');
        setFormNodePath('');
        setFormPythonPath('');
        setFormSkillName('');
        setFormWorkflowName('');
        // Reset before the preset branch, so a recipe keeps what it sets.
        setFormFallbackModel('');
        setFormSilentRule('');
        setFormInspectOnFailure(false);
        if (preset) {
          setFormTitle(preset.title || '');
          setFormSchedule(preset.schedule || '');
          setFormPrompt(preset.prompt || '');
          // #48: a recipe preset also carries its runtime and delivery shape.
          if (preset.type) setFormType(preset.type);
          if (Array.isArray(preset.channels) && preset.channels.length) setFormChannels(preset.channels.filter((c) => DELIVERY_CHANNELS.includes(c)));
          if (preset.silentRule !== undefined) setFormSilentRule(preset.silentRule || '');
          if (preset.fallbackModel !== undefined) setFormFallbackModel(preset.fallbackModel || '');
          if (preset.inspectOnFailure !== undefined) setFormInspectOnFailure(Boolean(preset.inspectOnFailure));
          setFormOnlyOnFailure(Boolean(preset.onlyOnFailure));
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

      const openEditModal = (task, overrides = {}) => {
        setDropdownOpen(false);
        setFormId(task.id);
        setSelectedTaskMeta(task);
        setModalTab('params');
        setFormTitle(task.title || '');
        setFormSchedule(task.schedule || '');
        setFormType(task.type || 'llm');
        setFormPrompt(overrides.prompt !== undefined ? overrides.prompt : (task.prompt || ''));
        setFormProvider(task.provider || '');
        setFormModel(task.model || '');
        setFormFallbackModel(task.fallbackModel || '');
        setFormSilentRule(task.silentRule || '');
        setFormInspectOnFailure(Boolean(task.inspectOnFailure));
        setFormDelivery(task.delivery || 'isolated');
        setFormNotifyTelegram(Boolean(task.notifyTelegram));
        setFormChannels(Array.isArray(task.channels) ? task.channels.filter((c) => DELIVERY_CHANNELS.includes(c)) : []);
        setFormTemplate(task.template || '');
        setFormOnlyOnFailure(Boolean(task.onlyOnFailure));
        setFormTimeoutSeconds(task.timeoutSeconds !== undefined ? task.timeoutSeconds : 1800);
        setFormOverlapPolicy(task.overlapPolicy || 'skip');
        setFormKanbanMode(task.kanbanMode || 'none');
        setFormTimezone(task.timezone || '');
        setFormMisfirePolicy(task.misfirePolicy || 'skip');
        setFormMaxRetries(task.maxRetries !== undefined ? task.maxRetries : 0);
        setFormPermissionPreset(task.permissionPreset || 'default');
        setFormEnv(formatEnvText(task.env));
        setFormCwd(task.cwd || '');
        setFormWorkspaceId(task.workspaceId || '');
        setFormWorktree(Boolean(task.worktree));
        setFormKeepWorktree(Boolean(task.keepWorktree));
        setFormHttpMethod(task.httpMethod || 'GET');
        setFormHttpUrl(task.httpUrl || '');
        setFormHttpHeaders(typeof task.httpHeaders === 'string' ? task.httpHeaders : (task.httpHeaders ? JSON.stringify(task.httpHeaders) : ''));
        setFormHttpBody(task.httpBody || '');
        setFormSshProfileId(task.sshProfileId || '');
        setFormSshTarget(task.sshTarget || '');
        setFormSshKeyPath(task.sshKeyPath || '');
        setFormDockerImage(task.dockerImage || '');
        setFormNodePath(task.nodePath || '');
        setFormPythonPath(task.pythonPath || '');
        setFormSkillName(task.skillName || '');
        setFormWorkflowName(task.workflowName || '');
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
          const isAgentType = AGENT_FORM_TYPES.includes(formType);
          const payload = {
            id: formId || undefined,
            status: selectedTaskMeta ? selectedTaskMeta.status : 'active',
            title: formTitle,
            schedule: formSchedule,
            prompt: formType === 'http' ? (formPrompt.trim() || formHttpUrl.trim()) : formPrompt,
            type: formType,
            delivery: formDelivery || 'isolated',
            provider: isAgentType ? (formProvider || undefined) : undefined,
            model: isAgentType ? (formModel || undefined) : undefined,
            fallbackModel: isAgentType ? (formFallbackModel.trim() || undefined) : undefined,
            silentRule: isAgentType ? undefined : formSilentRule.trim(),
            inspectOnFailure: isAgentType ? Boolean(formInspectOnFailure) : false,
            notifyTelegram: formNotifyTelegram,
            channels: formChannels,
            template: formTemplate.trim(),
            onlyOnFailure: formOnlyOnFailure,
            timeoutSeconds: Number(formTimeoutSeconds) || 1800,
            overlapPolicy: formOverlapPolicy,
            timezone: formTimezone.trim(),
            misfirePolicy: formMisfirePolicy,
            maxRetries: Number(formMaxRetries) || 0,
            permissionPreset: formPermissionPreset,
            kanbanMode: formKanbanMode,
            env: parseEnvText(formEnv),
            cwd: formCwd.trim(),
            workspaceId: formWorkspaceId.trim(),
            worktree: isAgentType ? Boolean(formWorktree) : false,
            keepWorktree: isAgentType ? Boolean(formKeepWorktree) : false,
            httpMethod: formHttpMethod,
            httpUrl: formHttpUrl.trim(),
            httpHeaders: formHttpHeaders.trim() || undefined,
            httpBody: formHttpBody,
            sshProfileId: formSshProfileId.trim(),
            sshTarget: formSshTarget.trim(),
            sshKeyPath: formSshKeyPath.trim(),
            dockerImage: formDockerImage.trim(),
            nodePath: formNodePath.trim(),
            pythonPath: formPythonPath.trim(),
            skillName: formSkillName.trim(),
            workflowName: formWorkflowName.trim(),
          };
          // Cross-origin hardening: every code-executing type needs the explicit
          // confirm header, which forged cross-site posts cannot attach (#86)
          const headers = { 'Content-Type': 'application/json' };
          if (CODE_FORM_TYPES.includes(formType)) headers[SCRIPT_CONFIRM_HEADER] = 'script';
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
              ),
              // #42: export/import as a small pair of icon buttons.
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-icon-btn',
                title: T_KEY(t, 'transfer.exportTitle'),
                'aria-label': T_KEY(t, 'transfer.exportTitle'),
                disabled: transferBusy,
                onClick: handleExport
              }, React.createElement('span', svgProps(ICON_DOWNLOAD))),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-icon-btn',
                title: T_KEY(t, 'transfer.importTitle'),
                'aria-label': T_KEY(t, 'transfer.importTitle'),
                disabled: transferBusy,
                onClick: () => { if (importFileRef.current) importFileRef.current.click(); }
              }, React.createElement('span', svgProps(ICON_UPLOAD))),
              React.createElement('input', {
                type: 'file',
                accept: '.json,application/json',
                ref: importFileRef,
                style: { display: 'none' },
                onChange: handleImportFile
              })
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
          // #40: facet filters over the loaded list.
          React.createElement('div', { className: 'dsh-cron-filters' },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-filter-toggle',
              'aria-expanded': filtersOpen ? 'true' : 'false',
              onClick: () => setFiltersOpen(!filtersOpen)
            },
              T_KEY(t, 'filters.title'),
              (filterType || filterModel || filterChannel) ? ' •' : ''
            ),
            filtersOpen && React.createElement('div', { className: 'dsh-cron-filter-panel' },
              React.createElement('label', { className: 'dsh-cron-filter-field' },
                React.createElement('span', null, T_KEY(t, 'filters.type')),
                React.createElement('select', {
                  value: filterType,
                  onChange: (e) => setFilterType(e.target.value)
                },
                  React.createElement('option', { value: '' }, T_KEY(t, 'filters.any')),
                  ...filterTypeOptions.map((value) => React.createElement('option', { key: value, value }, value))
                )
              ),
              React.createElement('label', { className: 'dsh-cron-filter-field' },
                React.createElement('span', null, T_KEY(t, 'filters.model')),
                React.createElement('select', {
                  value: filterModel,
                  onChange: (e) => setFilterModel(e.target.value)
                },
                  React.createElement('option', { value: '' }, T_KEY(t, 'filters.any')),
                  ...filterModelOptions.map((value) => React.createElement('option', { key: value, value }, value))
                )
              ),
              React.createElement('label', { className: 'dsh-cron-filter-field' },
                React.createElement('span', null, T_KEY(t, 'filters.channel')),
                React.createElement('select', {
                  value: filterChannel,
                  onChange: (e) => setFilterChannel(e.target.value)
                },
                  React.createElement('option', { value: '' }, T_KEY(t, 'filters.any')),
                  ...DELIVERY_CHANNELS.map((id) => React.createElement('option', { key: id, value: id }, T_KEY(t, CHANNEL_LABEL_KEYS[id])))
                )
              )
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
          (filterType || filterModel || filterChannel) ? React.createElement('div', {
            className: 'dsh-cron-filter-summary',
            style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #888)', marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }
          },
            React.createElement('span', null, T_KEY(t, 'filters.showing', { shown: visibleTasks.length, total: tasks.length })),
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-secondary',
              style: { padding: '2px 8px', fontSize: '11px' },
              onClick: resetFilters
            }, T_KEY(t, 'filters.reset'))
          ) : null,
          React.createElement('div', { className: 'dsh-cron-task-list' },
            loading && tasks.length === 0
              ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary, #888)', padding: '16px 0', fontSize: '14px' } }, T_KEY(t, 'list.loading'))
              : tasks.length === 0
                ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary, #777)', padding: '16px 0', fontSize: '14px' } }, T_KEY(t, 'list.empty'))
                : visibleTasks.length === 0
                  ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary, #777)', padding: '16px 0', fontSize: '14px', display: 'flex', gap: '10px', alignItems: 'center' } },
                      React.createElement('span', null, T_KEY(t, 'filters.empty')),
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-btn-secondary',
                        style: { padding: '2px 8px', fontSize: '12px' },
                        onClick: resetFilters
                      }, T_KEY(t, 'filters.reset'))
                    )
                  : visibleTasks.map((task) =>
                  React.createElement('div', {
                    key: task.id,
                    className: 'dsh-cron-task-item',
                    'data-task-id': task.id,
                    role: isConfigManaged(task) ? undefined : 'button',
                    tabIndex: isConfigManaged(task) ? undefined : 0,
                    'aria-label': task.title,
                    style: isConfigManaged(task) ? { cursor: 'default' } : undefined,
                    onClick: isConfigManaged(task) ? undefined : () => openEditModal(task),
                    onKeyDown: isConfigManaged(task) ? undefined : (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEditModal(task);
                      }
                    }
                  },
                    isConfigManaged(task) ? null : React.createElement('button', {
                      type: 'button',
                      className: 'dsh-cron-task-status-btn' + (task.running ? ' dsh-cron-pulse' : ''),
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
                        isConfigManaged(task) ? React.createElement('span', {
                          className: 'dsh-cron-config-tag',
                          title: T_KEY(t, 'list.configManagedHint')
                        }, T_KEY(t, 'list.configManaged')) : null,
                        task.totalCostUsd > 0 ? React.createElement('span', { className: 'dsh-cron-cost-tag' }, '$' + task.totalCostUsd.toFixed(4)) : null,
                        task.totalTokens > 0 ? React.createElement('span', { className: 'dsh-cron-tokens-tag' }, (task.totalTokens > 1000 ? Math.round(task.totalTokens / 1000) + 'k' : task.totalTokens) + ' tok') : null
                      ),
                      React.createElement('div', { className: 'dsh-cron-task-sched' },
                        task.scheduleText || task.schedule,
                        task.nextRunAt ? T_KEY(t, 'list.next', { time: new Date(task.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : '',
                        task.running && task.runningSince
                          ? ' · ' + T_KEY(t, 'list.runningNow') + ' ' + Math.max(0, Math.round((Date.now() - task.runningSince) / 1000)) + 's'
                          : ''
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
                      isConfigManaged(task) ? null : React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: T_KEY(t, 'actions.edit'),
                        'aria-label': T_KEY(t, 'actions.edit'),
                        onClick: () => openEditModal(task)
                      }, React.createElement('span', svgProps(ICON_EDIT))),
                      isConfigManaged(task) ? null : React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: T_KEY(t, 'actions.tuneWithDsh'),
                        'aria-label': T_KEY(t, 'actions.tuneWithDsh'),
                        onClick: () => handleTuneWithDsh(task)
                      }, React.createElement('span', svgProps(ICON_TUNE))),
                      isConfigManaged(task) ? null : React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: T_KEY(t, 'actions.duplicate'),
                        'aria-label': T_KEY(t, 'actions.duplicate'),
                        onClick: () => handleDuplicate(task)
                      }, React.createElement('span', svgProps(ICON_COPY))),
                      isConfigManaged(task) ? null : React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn dsh-cron-danger',
                        title: T_KEY(t, 'actions.delete'),
                        'aria-label': T_KEY(t, 'actions.delete'),
                        onClick: () => handleDelete(task.id)
                      }, React.createElement('span', svgProps(ICON_TRASH)))
                    )
                  )
                )
          ),
          React.createElement('div', { className: 'dsh-cron-recs-title' }, T_KEY(t, 'recs.title')),
          React.createElement('div', { className: 'dsh-cron-hint', style: { marginBottom: '8px' } }, T_KEY(t, 'recs.hint')),
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
                      // #43: a diagnosed failure shows what went wrong and
                      // offers to prefill the prompt with the suggestion.
                      run.diagnosis && React.createElement('div', {
                        className: 'dsh-cron-status-banner',
                        'data-type': 'info',
                        style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }
                      },
                        React.createElement('div', null,
                          React.createElement('strong', null, T_KEY(t, 'history.diagnosis')),
                          run.confidence ? ` (${run.confidence})` : ''
                        ),
                        React.createElement('div', null, run.diagnosis),
                        run.suggestion && React.createElement('div', null,
                          React.createElement('button', {
                            type: 'button',
                            className: 'dsh-cron-btn-secondary',
                            style: { padding: '2px 8px', fontSize: '12px' },
                            onClick: () => openEditModal(selectedTaskMeta, { prompt: run.suggestion })
                          }, T_KEY(t, 'history.applySuggestion'))
                        )
                      ),
                      // #44: a run suppressed by its silent rule says why.
                      run.silentSkip && React.createElement('div', {
                        className: 'dsh-cron-hint',
                        style: { display: 'flex', gap: '6px', alignItems: 'center' }
                      },
                        React.createElement('span', { className: 'dsh-cron-badge-ref' }, T_KEY(t, 'history.silentSkip')),
                        React.createElement('span', null, run.silentReason || '')
                      ),
                      run.output && React.createElement('div', { className: 'dsh-cron-history-output' }, run.output),
                      run.error && React.createElement('div', { className: 'dsh-cron-history-output', style: { color: 'var(--dsh-cron-danger)', borderColor: 'var(--dsh-cron-danger-bg)' } }, run.error),
                      run.sessionId && React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-btn-secondary',
                        style: { marginTop: '8px', fontSize: '12px', padding: '4px 10px' },
                        onClick: () => openSession(ctx, run.sessionId)
                      }, T_KEY(t, 'history.openSession'))
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
                      React.createElement('option', { value: 'script' }, T_KEY(t, 'form.typeScript')),
                      React.createElement('option', { value: 'node' }, T_KEY(t, 'form.typeNode')),
                      React.createElement('option', { value: 'python' }, T_KEY(t, 'form.typePython')),
                      React.createElement('option', { value: 'http' }, T_KEY(t, 'form.typeHttp')),
                      React.createElement('option', { value: 'ssh' }, T_KEY(t, 'form.typeSsh')),
                      React.createElement('option', { value: 'docker' }, T_KEY(t, 'form.typeDocker')),
                      React.createElement('option', { value: 'skill' }, T_KEY(t, 'form.typeSkill')),
                      React.createElement('option', { value: 'workflow' }, T_KEY(t, 'form.typeWorkflow'))
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
                React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.timezoneLabel')),
                  React.createElement('input', {
                    value: formTimezone,
                    placeholder: T_KEY(t, 'form.timezonePlaceholder'),
                    onChange: (e) => setFormTimezone(e.target.value)
                  })
                ),
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.misfireLabel')),
                  React.createElement('select', {
                    value: formMisfirePolicy,
                    onChange: (e) => setFormMisfirePolicy(e.target.value)
                  },
                    React.createElement('option', { value: 'skip' }, T_KEY(t, 'form.misfireSkip')),
                    React.createElement('option', { value: 'runOnce' }, T_KEY(t, 'form.misfireRunOnce')),
                    React.createElement('option', { value: 'catchUpAll' }, T_KEY(t, 'form.misfireCatchUp'))
                  )
                )
              ),
              React.createElement('div', { className: 'dsh-cron-form-row' },
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.retriesLabel')),
                  React.createElement('input', {
                    type: 'number',
                    min: 0,
                    value: formMaxRetries,
                    placeholder: '0',
                    onChange: (e) => setFormMaxRetries(e.target.value)
                  })
                ),
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.permissionLabel')),
                  React.createElement('select', {
                    value: formPermissionPreset,
                    onChange: (e) => setFormPermissionPreset(e.target.value)
                  },
                    React.createElement('option', { value: 'default' }, T_KEY(t, 'form.permissionDefault')),
                    React.createElement('option', { value: 'read-only' }, T_KEY(t, 'form.permissionReadonly')),
                    React.createElement('option', { value: 'workspace-write' }, T_KEY(t, 'form.permissionWrite')),
                    React.createElement('option', { value: 'full' }, T_KEY(t, 'form.permissionFull'))
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
                AGENT_FORM_TYPES.includes(formType) && React.createElement('div', { className: 'dsh-cron-form-row' },
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
                  ),
                  // #45: one retry on a stronger model when the cheap one fails.
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.fallbackModelLabel')),
                    React.createElement('input', {
                      type: 'text',
                      value: formFallbackModel,
                      placeholder: T_KEY(t, 'form.fallbackModelPlaceholder'),
                      onChange: (e) => setFormFallbackModel(e.target.value)
                    }),
                    React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.fallbackModelHint'))
                  ),
                  // #43: diagnose failures with a model.
                  React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginTop: '4px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: formInspectOnFailure,
                      onChange: (e) => setFormInspectOnFailure(e.target.checked)
                    }),
                    React.createElement('span', null, T_KEY(t, 'form.inspectOnFailureLabel'))
                  ),
                  formInspectOnFailure && React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.inspectOnFailureHint'))
                ),
                formType === 'http' && React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.httpMethodLabel')),
                    React.createElement('select', {
                      value: formHttpMethod,
                      onChange: (e) => setFormHttpMethod(e.target.value)
                    },
                      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => React.createElement('option', { key: m, value: m }, m))
                    )
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.httpUrlLabel')),
                    React.createElement('input', {
                      required: true,
                      value: formHttpUrl,
                      placeholder: 'https://example.test/webhook',
                      onChange: (e) => setFormHttpUrl(e.target.value)
                    })
                  )
                ),
                formType === 'http' && React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.httpHeadersLabel')),
                    React.createElement('input', {
                      value: formHttpHeaders,
                      placeholder: '{"Authorization":"Bearer ..."}',
                      onChange: (e) => setFormHttpHeaders(e.target.value)
                    })
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.httpBodyLabel')),
                    React.createElement('input', {
                      value: formHttpBody,
                      onChange: (e) => setFormHttpBody(e.target.value)
                    })
                  )
                ),
                formType === 'ssh' && React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.sshProfileLabel')),
                    React.createElement('input', {
                      value: formSshProfileId,
                      placeholder: 'prod-web',
                      onChange: (e) => setFormSshProfileId(e.target.value)
                    }),
                    React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.sshProfileHint'))
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.sshTargetLabel')),
                    React.createElement('input', {
                      value: formSshTarget,
                      placeholder: 'root@10.0.0.5',
                      onChange: (e) => setFormSshTarget(e.target.value)
                    }),
                    React.createElement('input', {
                      style: { marginTop: '6px' },
                      value: formSshKeyPath,
                      placeholder: '~/.ssh/id_ed25519',
                      onChange: (e) => setFormSshKeyPath(e.target.value)
                    })
                  )
                ),
                formType === 'docker' && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.dockerImageLabel')),
                  React.createElement('input', {
                    required: true,
                    value: formDockerImage,
                    placeholder: 'alpine:3.20',
                    onChange: (e) => setFormDockerImage(e.target.value)
                  })
                ),
                formType === 'skill' && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.skillNameLabel')),
                  React.createElement('input', {
                    value: formSkillName,
                    placeholder: 'gitea',
                    onChange: (e) => setFormSkillName(e.target.value)
                  })
                ),
                formType === 'workflow' && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.workflowNameLabel')),
                  React.createElement('input', {
                    value: formWorkflowName,
                    placeholder: 'nightly-release',
                    onChange: (e) => setFormWorkflowName(e.target.value)
                  })
                ),
                (formType === 'node' || formType === 'python') && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, formType === 'node' ? 'Node.js binary (optional)' : 'Python interpreter (optional)'),
                  React.createElement('input', {
                    value: formType === 'node' ? formNodePath : formPythonPath,
                    placeholder: formType === 'node' ? 'auto' : '.venv/bin/python',
                    onChange: (e) => (formType === 'node' ? setFormNodePath(e.target.value) : setFormPythonPath(e.target.value))
                  })
                ),
                !AGENT_FORM_TYPES.includes(formType) && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.envLabel')),
                  React.createElement('textarea', {
                    rows: 3,
                    style: { fontFamily: 'monospace', fontSize: '12.5px' },
                    value: formEnv,
                    placeholder: T_KEY(t, 'form.envPlaceholder'),
                    onChange: (e) => setFormEnv(e.target.value)
                  }),
                  React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.envHint'))
                ),
                React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.cwdLabel')),
                    React.createElement('input', {
                      value: formCwd,
                      placeholder: '/srv/app',
                      onChange: (e) => setFormCwd(e.target.value)
                    })
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.workspaceLabel')),
                    React.createElement('input', {
                      value: formWorkspaceId,
                      onChange: (e) => setFormWorkspaceId(e.target.value)
                    })
                  )
                ),
                AGENT_FORM_TYPES.includes(formType) && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', { className: 'dsh-cron-checkbox-row' },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: formWorktree,
                      onChange: (e) => setFormWorktree(e.target.checked)
                    }),
                    React.createElement('span', null, T_KEY(t, 'form.worktreeLabel'))
                  ),
                  formWorktree && React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginLeft: '24px', marginTop: '6px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: formKeepWorktree,
                      onChange: (e) => setFormKeepWorktree(e.target.checked)
                    }),
                    React.createElement('span', null, T_KEY(t, 'form.keepWorktreeLabel'))
                  )
                ),
                formType !== 'http' && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, AGENT_FORM_TYPES.includes(formType) ? T_KEY(t, 'form.promptLabelLlm') : T_KEY(t, 'form.promptLabelScript')),
                  React.createElement('textarea', {
                    required: true,
                    rows: 9,
                    style: { fontFamily: 'monospace', fontSize: '12.5px', lineHeight: '1.45' },
                    value: formPrompt,
                    placeholder: AGENT_FORM_TYPES.includes(formType)
                      ? T_KEY(t, 'form.promptPlaceholderLlm')
                      : formType === 'docker'
                        ? 'python -V'
                        : formType === 'ssh'
                          ? 'uname -a'
                          : formType === 'node'
                            ? 'console.log("hello")'
                            : formType === 'python'
                              ? 'print("hello")'
                              : T_KEY(t, 'form.promptPlaceholderScript'),
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
                  (formNotifyTelegram || formChannels.length > 0) && React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginLeft: '24px', marginTop: '6px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: formOnlyOnFailure,
                      onChange: (e) => setFormOnlyOnFailure(e.target.checked)
                    }),
                    React.createElement('span', null, T_KEY(t, 'form.notifyOnlyFailure'))
                  ),
                  React.createElement('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--dsw-alias-border-l2, #2e2e2e)' } },
                    React.createElement('div', { style: { fontWeight: 500, fontSize: '12.5px', color: 'var(--dsw-alias-label-secondary, #aaa)', marginBottom: '8px' } }, T_KEY(t, 'form.channelsTitle')),
                    React.createElement('div', { className: 'dsh-cron-channel-grid' },
                      ...DELIVERY_CHANNELS.map((id) => React.createElement('label', { key: id, className: 'dsh-cron-checkbox-row' },
                        React.createElement('input', {
                          type: 'checkbox',
                          checked: formChannels.indexOf(id) >= 0,
                          onChange: (e) => {
                            setFormChannels((prev) => {
                              const set = new Set(prev);
                              if (e.target.checked) set.add(id); else set.delete(id);
                              return DELIVERY_CHANNELS.filter((c) => set.has(c));
                            });
                          }
                        }),
                        React.createElement('span', null, T_KEY(t, CHANNEL_LABEL_KEYS[id]))
                      ))
                    ),
                    React.createElement('div', { className: 'dsh-cron-hint', style: { marginTop: '6px' } }, T_KEY(t, 'form.channelsHint'))
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group', style: { marginTop: '12px', marginBottom: 0 } },
                    React.createElement('label', null, T_KEY(t, 'form.templateLabel')),
                    React.createElement('input', {
                      type: 'text',
                      value: formTemplate,
                      placeholder: T_KEY(t, 'form.templatePlaceholder'),
                      onChange: (e) => setFormTemplate(e.target.value)
                    }),
                    React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.templateHint'))
                  ),
                  // #44: output-producing runtimes may stay silent by rule.
                  !AGENT_FORM_TYPES.includes(formType) && React.createElement('div', { className: 'dsh-cron-form-group', style: { marginTop: '12px', marginBottom: 0 } },
                    React.createElement('label', null, T_KEY(t, 'form.silentRuleLabel')),
                    React.createElement('input', {
                      type: 'text',
                      value: formSilentRule,
                      placeholder: T_KEY(t, 'form.silentRulePlaceholder'),
                      onChange: (e) => setFormSilentRule(e.target.value)
                    }),
                    React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.silentRuleHint'))
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
          React.createElement('div', { className: 'dsh-cron-modal dsh-cron-modal-scroll', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
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
              ...renderDeliverySettings({
                T: (key, vars) => T_KEY(t, key, vars),
                values: settingsDelivery,
                onChange: updateDelivery,
                onChannelTemplate: updateChannelTemplate,
                sections: settingsSections,
                onToggleSection: toggleDeliverySection,
              }),
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

        // 3. Import modal (#42) — summary first, then an explicit strategy.
        importDoc && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => !transferBusy && setImportDoc(null) },
          React.createElement('div', { className: 'dsh-cron-modal', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
            React.createElement('div', { className: 'dsh-cron-modal-title' }, T_KEY(t, 'transfer.importTitleModal')),
            React.createElement('div', { className: 'dsh-cron-hint', style: { marginBottom: '10px' } }, T_KEY(t, 'transfer.importHint')),
            importSummary && React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '13px', marginBottom: '12px' } },
                T_KEY(t, 'transfer.summary', {
                  total: (importSummary.add || 0) + (importSummary.replace || 0) + (importSummary.skip || 0),
                  add: importSummary.add || 0,
                  replace: importSummary.replace || 0,
                  skip: importSummary.skip || 0
                })
              ),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' } },
                ...['add', 'replace', 'skip'].map((mode) => React.createElement('label', { key: mode, className: 'dsh-cron-checkbox-row' },
                  React.createElement('input', {
                    type: 'radio',
                    name: 'dsh-cron-import-strategy',
                    checked: importStrategy === mode,
                    onChange: () => setImportStrategy(mode)
                  }),
                  React.createElement('span', null, T_KEY(t, mode === 'add' ? 'transfer.strategyAdd' : mode === 'replace' ? 'transfer.strategyReplace' : 'transfer.strategySkip'))
                ))
              )
            ),
            React.createElement('div', { className: 'dsh-cron-modal-foot' },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                disabled: transferBusy,
                onClick: () => setImportDoc(null)
              }, T_KEY(t, 'modal.cancel')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-primary',
                disabled: transferBusy || !importSummary,
                onClick: handleImportConfirm
              }, T_KEY(t, 'transfer.confirm'))
            )
          )
        ),

        // 4. "Create with DSH" modal
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
      const [delivery, setDelivery] = React.useState({});
      const [sections, setSections] = React.useState({ channels: true });
      const [hasDefault, setHasDefault] = React.useState(false);
      const [saved, setSaved] = React.useState(false);
      const [testInfo, setTestInfo] = React.useState(null);
      // Collapsed by default, head is the toggle (canonical card contract, #100)
      const [cardOpen, setCardOpen] = React.useState(false);

      // Settings snapshot status (#102): never render phantom inputs before
      // the snapshot arrives; offer a retry when it is unavailable.
      const [loadState, setLoadState] = React.useState('loading');
      const [reloadTick, setReloadTick] = React.useState(0);

      React.useEffect(() => {
        let active = true;
        setLoadState('loading');
        fetch('/dsh-cron/settings')
          .then(r => r.json())
          .then(data => {
            if (!active) return;
            if (data && data.ok && data.settings) {
              setToken(data.settings.botToken || '');
              setChatId(data.settings.chatId || '');
              setNotify(Boolean(data.settings.notifyTelegram));
              setOnlyFailure(Boolean(data.settings.onlyOnFailure));
              setKanbanUrl(data.settings.kanbanBaseUrl || 'http://127.0.0.1:3000');
              setDelivery(pickDeliverySettings(data.settings));
              setHasDefault(Boolean(data.settings.hasDefaultCredentials));
              setLoadState('ready');
            } else {
              setLoadState('error');
            }
          })
          .catch(() => { if (active) setLoadState('error'); });
        return () => { active = false; };
      }, [reloadTick]);

      const saveSettings = async (e) => {
        if (e) e.preventDefault();
        try {
          const res = await fetch('/dsh-cron/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({
              botToken: token,
              chatId,
              notifyTelegram: notify,
              onlyOnFailure: onlyFailure,
              kanbanBaseUrl: kanbanUrl
            }, delivery))
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

      if (loadState !== 'ready') {
        return React.createElement('div', { className: 'dsh-cron-card' },
          React.createElement('div', { className: 'dsh-cron-card-title' }, T_KEY(t, 'settings.cardTitle')),
          React.createElement('div', {
            className: 'dsh-cron-status-banner',
            'data-type': loadState === 'error' ? 'error' : 'info',
            style: { marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }
          },
            React.createElement('span', null, loadState === 'error' ? T_KEY(t, 'settings.unavailable') : T_KEY(t, 'settings.loading')),
            loadState === 'error' && React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-secondary',
              onClick: () => setReloadTick(x => x + 1)
            }, T_KEY(t, 'settings.retry'))
          )
        );
      }

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
          ...renderDeliverySettings({
            T: (key, vars) => T_KEY(t, key, vars),
            values: delivery,
            onChange: (key, value) => setDelivery((prev) => {
              const next = Object.assign({}, prev);
              if (value === undefined) delete next[key];
              else next[key] = value;
              return next;
            }),
            onChannelTemplate: (channelId, value) => setDelivery((prev) => {
              const templates = Object.assign({}, prev.channelTemplates || {});
              if (value && value.trim()) templates[channelId] = value;
              else delete templates[channelId];
              return Object.assign({}, prev, { channelTemplates: templates });
            }),
            sections,
            onToggleSection: (key) => setSections((prev) => Object.assign({}, prev, { [key]: !prev[key] })),
          }),
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

    /**
     * Collapsible list of active jobs under the sidebar entry (#34).
     *
     * Vanilla DOM like the entry itself: the sidebar is not a React root here.
     * Collapsed by default, state persisted, capped at a few rows with an
     * "and N more" line so a busy schedule cannot push the rest of the sidebar
     * off screen. Clicking a row opens the panel and highlights that task.
     */
    const SIDEBAR_JOBS_KEY = 'dsh-cron-sidebar-open';
    const SIDEBAR_JOBS_MAX_ROWS = 5;

    /** Sidebar job row: title plus next run time or the live running state. */
    function buildSidebarJobRow(state, task) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'dsh-cron-sidebar-job';
      // A distinct attribute: the panel uses data-task-id, and the highlight
      // lookup must never pick a sidebar row instead of a task card.
      row.setAttribute('data-sidebar-task-id', task.id);
      row.setAttribute('aria-label', task.title || task.id);

      const title = document.createElement('span');
      title.className = 'dsh-cron-sidebar-job-title';
      title.textContent = task.title || task.id;
      row.appendChild(title);

      const meta = document.createElement('span');
      meta.className = 'dsh-cron-sidebar-job-meta';
      if (task.running) meta.textContent = T('list.runningNow');
      else if (task.nextRunAt) meta.textContent = new Date(task.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      else meta.textContent = task.scheduleText || task.schedule || '';
      row.appendChild(meta);

      if (task.running) row.classList.add('dsh-cron-pulse');
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.openTaskSignal(task.id);
        if (!state.toggle.isOpen()) state.toggle.toggle();
      });
      return row;
    }

    function renderSidebarJobs(state, tasks) {
      const listEl = state.listEl;
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!tasks.length) {
        const empty = document.createElement('div');
        empty.className = 'dsh-cron-sidebar-empty';
        empty.textContent = T('sidebar.noActiveJobs');
        listEl.appendChild(empty);
        return;
      }
      for (const task of tasks.slice(0, SIDEBAR_JOBS_MAX_ROWS)) listEl.appendChild(buildSidebarJobRow(state, task));
      if (tasks.length > SIDEBAR_JOBS_MAX_ROWS) {
        const more = document.createElement('div');
        more.className = 'dsh-cron-sidebar-more';
        more.textContent = T('sidebar.moreJobs', { count: tasks.length - SIDEBAR_JOBS_MAX_ROWS });
        listEl.appendChild(more);
      }
    }

    async function loadSidebarJobs(state) {
      try {
        const res = await fetch('/dsh-cron/tasks?status=active');
        const data = await res.json();
        if (data && data.ok) renderSidebarJobs(state, data.tasks || []);
      } catch (_) {}
    }

    function applySidebarJobsOpen(state) {
      if (!state.root) return;
      state.root.dataset.open = state.open ? 'true' : 'false';
      if (state.headEl) state.headEl.setAttribute('aria-expanded', state.open ? 'true' : 'false');
      if (state.open) loadSidebarJobs(state);
    }

    function buildSidebarJobsRoot(state, label) {
      const root = document.createElement('div');
      root.className = 'dsh-cron-sidebar-jobs';
      root.setAttribute('data-dsh-plugin', 'dsh-cron');
      root.setAttribute('data-dsh-part', 'sidebar-jobs');

      const headEl = document.createElement('button');
      headEl.type = 'button';
      headEl.className = 'dsh-cron-sidebar-jobs-head';
      headEl.setAttribute('aria-expanded', state.open ? 'true' : 'false');
      headEl.textContent = label;
      headEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.open = !state.open;
        try { window.localStorage.setItem(SIDEBAR_JOBS_KEY, state.open ? '1' : '0'); } catch (_) {}
        applySidebarJobsOpen(state);
      });
      root.appendChild(headEl);

      const listEl = document.createElement('div');
      listEl.className = 'dsh-cron-sidebar-jobs-list';
      root.appendChild(listEl);

      state.root = root;
      state.headEl = headEl;
      state.listEl = listEl;
      return root;
    }

    /** Keep the section mounted under the sidebar entry across re-renders. */
    function placeSidebarJobs(state, label) {
      if (state.root !== undefined && state.root.isConnected) return;
      const entry = document.querySelector('[' + ENTRY_ATTR + ']');
      if (entry === null || entry.parentElement === null) return;
      if (state.root === undefined) {
        entry.insertAdjacentElement('afterend', buildSidebarJobsRoot(state, label));
      } else {
        entry.insertAdjacentElement('afterend', state.root);
        // Re-query the refs: the previous nodes may belong to a detached tree.
        state.root = document.querySelector('[data-dsh-part="sidebar-jobs"]') || state.root;
        state.listEl = state.root.querySelector('.dsh-cron-sidebar-jobs-list');
        state.headEl = state.root.querySelector('.dsh-cron-sidebar-jobs-head');
      }
      applySidebarJobsOpen(state);
    }

    /**
     * Collapsible list of active jobs under the sidebar entry (#34).
     *
     * Vanilla DOM like the entry itself: the sidebar is not a React root here.
     * Collapsed by default, state persisted, capped at a few rows with an
     * "and N more" line so a busy schedule cannot push the rest of the sidebar
     * off screen. Clicking a row opens the panel and highlights that task.
     */
    function mountSidebarJobs(toggle, label, openTaskSignal) {
      if (typeof document === 'undefined') return () => {};
      const state = { toggle, openTaskSignal, root: undefined, listEl: undefined, headEl: undefined, open: false };
      try { state.open = window.localStorage.getItem(SIDEBAR_JOBS_KEY) === '1'; } catch (_) {}

      const observer = new MutationObserver(() => placeSidebarJobs(state, label));
      observer.observe(document.body, { childList: true, subtree: true });
      placeSidebarJobs(state, label);
      loadSidebarJobs(state);
      const fetchTimer = setInterval(() => {
        let isOpen = false;
        try { isOpen = window.localStorage.getItem(SIDEBAR_JOBS_KEY) === '1'; } catch (_) {}
        if (isOpen) loadSidebarJobs(state);
      }, 30000);

      return () => {
        observer.disconnect();
        clearInterval(fetchTimer);
        if (state.root !== undefined && state.root.isConnected) state.root.remove();
        state.root = undefined;
      };
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
          root.render(React.createElement(ErrorBoundary, null, React.createElement(CronScreen, { ctx, toggle, onClose: () => toggle.set(false), t: translate })));
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

      // The settings card lives ONLY in the plugins settings tab (#102): no
      // top-level section fallback — the flat sidebar list is a shared core
      // resource, and the card slot is proven on current builds (#85).
      function SettingsCardWithBoundary(props) {
        return React.createElement(ErrorBoundary, null, CronSettingsCard(props));
      }
      const cardOk = registerIntoMount(ctx, 'settings.plugin.item', {
        name: 'settings.plugin.item',
        key: NS,
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, SettingsCardWithBoundary);
      if (!cardOk) {
        console.warn('[dsh-cron] settings.plugin.item slot unavailable — settings card not registered');
      }

      const chipOk = registerIntoMount(ctx, 'conversation.session.header.utilities', {
        name: 'conversation.session.header.utilities',
        id: PLUGIN_ID + '.chip',
        order: 27,
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, CronChip);
      const cardSlot = cardOk ? 'settings.plugin.item' : undefined;
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
          mountSidebarJobs(toggle, translate('sidebar.jobsTitle'), (taskId) => { pendingTaskHighlight = taskId; }),
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
