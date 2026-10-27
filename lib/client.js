window.__ModuleLoader__.load({
id: '@goodandready/dsh-cron',
factory: (require) => {
var module = { exports: {} }
var exports = module.exports
const React = window.React || require('react');
const _h = (...args) => (React && React.createElement ? React.createElement(...args) : null);
const ReactDOM = window.ReactDOM || require('react-dom/client');
const PLUGIN_ID = '@goodandready/dsh-cron';
const NS = 'dsh-cron';
const ROW_ID = 'dsh-cron';
const ROW_CONFIG_KEY = PLUGIN_ID + '#' + ROW_ID;
const PANEL = 'cron';
const ACTIVATE_EVENT = 'dsh-panel-activate';
const ACTIVE_ATTR = 'data-dsh-cron-active';
const ENTRY_ATTR = 'data-dsh-cron-entry';
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
let CoreChevron = null;
try {
const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
CoreChevron = primitives && primitives.IconChevronDownOutline14;
} catch (e) {
/* Optional core chevron primitive not available; SVG fallback used */
}
const chevronNode = () => (CoreChevron ? _h(CoreChevron) : _h('span', { style: { display: 'flex', alignItems: 'center' }, dangerouslySetInnerHTML: { __html: ICON_CHEVRON_DOWN } }));
const STRINGS = {
en: {
'sidebar.label': 'Scheduled tasks', 'sidebar.jobsTitle': 'Active jobs',
'sidebar.noActiveJobs': 'No active jobs', 'sidebar.moreJobs': 'and {count} more',
'chip.title': 'Scheduled tasks (Cron)', 'panel.back': 'Back to chat',
'panel.title': 'Scheduled tasks',
'panel.subtitle': 'Ask DSH to plan tasks, set reminders or track updates',
'actions.create': 'Create', 'actions.createWithDsh': '💬 Create with DSH',
'actions.setupManually': '✏️ Set up manually', 'actions.runNow': 'Run now',
'actions.runNowShort': 'Run', 'actions.edit': 'Edit / Details',
'actions.duplicate': 'Duplicate task', 'actions.tuneWithDsh': 'Tune with DSH',
'tune.startFailed': 'Could not start the tuning dialogue: {error}',
'actions.delete': 'Delete task',
'duplicate.done': 'Copy created and paused: review its schedule before resuming it.',
'duplicate.oneShotHint': 'The copy is one-shot and paused — its original time has likely passed, so set a new time before resuming.',
'duplicate.failed': 'Could not duplicate the task: {error}',
'transfer.exportTitle': 'Export tasks', 'transfer.importTitle': 'Import tasks',
'transfer.exported': 'Exported {count} task(s).',
'transfer.exportFailed': 'Export failed: {error}', 'transfer.importTitleModal': 'Import tasks',
'transfer.importHint': 'Exported task configuration only: no run history, no counters. Channel configurations reference credentials by name; note that raw exports retain custom env variables and HTTP request headers.',
'transfer.exportPrompt': 'Choose export mode:\nOK = Sanitized (removes custom env vars & headers)\nCancel = Full raw export',
'transfer.strategyAdd': 'Add as new tasks (new ids, existing ones stay untouched)',
'transfer.strategyReplace': 'Replace tasks with the same id',
'transfer.strategySkip': 'Skip tasks whose id already exists',
'transfer.summary': 'This file contains {total} task(s): {add} new, {replace} matching an existing id, {skip} already skipped.',
'transfer.confirm': 'Import', 'transfer.imported': 'Imported {count} task(s).',
'transfer.importFailed': 'Import failed: {error}',
'transfer.badFile': 'The selected file is not a valid JSON export: {error}',
'actions.pause': 'Pause', 'actions.resume': 'Resume',
'actions.settings': 'Notifications & channels', 'search.placeholder': 'Search scheduled tasks',
'filters.title': 'Filters', 'filters.type': 'Type',
'filters.model': 'Model', 'filters.channel': 'Channel',
'filters.any': 'Any', 'filters.reset': 'Reset filters',
'filters.empty': 'No task matches the current filters.',
'filters.showing': 'Showing {shown} of {total}', 'stats.activeTasks': 'Active tasks',
'stats.totalRuns': 'Total runs', 'stats.totalTokens': 'Tokens spent',
'stats.totalCost': 'Estimated cost', 'tabs.all': 'All',
'tabs.active': 'Active', 'tabs.paused': 'Paused',
'tabs.completed': 'Completed', 'banner.loadError': 'Failed to load tasks: {error}',
'banner.retry': 'Retry', 'list.loading': 'Loading scheduled tasks...',
'list.empty': 'No scheduled tasks yet', 'list.typeShell': 'Shell',
'list.typeLlm': 'LLM', 'list.oneShot': 'One-shot',
'list.configManaged': 'Config',
'list.configManagedHint': 'Declared in config.jobs in the profile config file; edit the file to change or remove it',
'list.next': ' · next: {time}', 'recs.title': 'Recommended tasks',
'recs.hint': 'Ready-to-use recipes. Clicking one opens the form with its fields filled in — nothing is created until you save.',
'modal.editTitle': 'Edit task', 'modal.newTitle': 'New scheduled task',
'modal.statusActive': '● Active', 'modal.statusPaused': '○ Paused',
'modal.params': 'Parameters', 'modal.history': 'Run history ({count})',
'modal.cancel': 'Cancel', 'modal.confirmDiscard': 'Discard unsaved changes?',
'modal.save': 'Save changes', 'modal.create': 'Create task',
'modal.close': 'Close', 'history.loading': 'Loading history...',
'history.empty': 'No runs recorded yet', 'history.stoppedReasonTitle': 'Stopped reason:',
'history.retryDelivery': 'Retry delivery', 'history.retryingDelivery': 'Retrying...',
'history.statusValidationFailed': 'validation failed', 'history.stage_queue': 'Queue',
'history.stage_preflight': 'Preflight', 'history.stage_execution': 'Execution',
'history.stage_validation': 'Validation', 'history.stage_delivery': 'Delivery',
'history.refresh': 'Refresh history',
'history.statusSuccess': 'Success', 'history.statusUncertain': 'Uncertain',
'history.artifacts': 'Artifacts',
'history.resolveCompleted': 'Mark Completed', 'history.resolveFailed': 'Mark Failed',
'history.statusUncertainHint': 'Interrupted by restart — verify outcome',
'history.statusSkipped': 'Skipped', 'history.statusMissed': 'Missed',
'history.statusTimeout': 'Timeout', 'history.statusFailed': 'Failed',
'form.nameLabel': 'Task name', 'form.namePlaceholder': 'For example: dsh-tags-watch',
'form.typeLabel': 'Execution type', 'form.typeLlm': 'LLM (AI agent)',
'form.typeScript': 'Shell command / script', 'form.typeNode': 'Node.js',
'form.typePython': 'Python', 'form.typeHttp': 'HTTP request / webhook',
'form.typeSsh': 'Remote SSH', 'form.typeDocker': 'Docker container',
'form.typeSkill': 'DSH Skill', 'form.typeWorkflow': 'DSH Workflow',
'form.envLabel': 'Environment variables (KEY=VALUE per line)',
'form.envPlaceholder': 'NODE_ENV=production\nTZ=Europe/Berlin',
'form.envHint': 'Applied to non-LLM runtimes only. Do not store secrets here.',
'form.cwdLabel': 'Working directory (optional)',
'form.workspaceLabel': 'Workspace id or path (optional)',
'form.worktreeLabel': 'Run in an isolated git worktree',
'form.keepWorktreeLabel': 'Keep the worktree after the run',
'form.httpMethodLabel': 'HTTP method', 'form.httpUrlLabel': 'URL',
'form.httpHeadersLabel': 'Headers (JSON, optional)', 'form.httpBodyLabel': 'Body (optional)',
'form.sshProfileLabel': 'dsh-remote-workspace profile id',
'form.sshProfileHint': 'Preferred: host and credentials stay in the remote-workspace plugin.',
'form.sshTargetLabel': 'Fallback target (user@host, optional)',
'form.sshKeyLabel': 'Private key path (fallback, optional)',
'form.dockerImageLabel': 'Container image', 'form.skillNameLabel': 'Skill name',
'form.workflowNameLabel': 'Workflow name', 'form.scheduleLabel': 'Schedule (cron or interval)',
'form.schedulePlaceholder': '0 */6 * * * or every 2h or in 30m or at: 2026-09-05T15:00:00Z',
'form.timeoutLabel': 'Execution timeout (seconds)', 'form.overlapLabel': 'Overlap policy',
'form.overlapSkip': 'Skip the new run (skip)',
'form.overlapQueue': 'Queue the next run (queue)',
'form.overlapReplace': 'Cancel current run and restart (replace)',
'form.kanbanLabel': 'Kanban card creation (dsh-kanban)',
'form.kanbanNone': 'Do not create cards (disabled)',
'form.kanbanOnFailure': 'Create a ticket on failure (into Backlog)',
'form.kanbanAlways': 'Create a card on every completion (Done / Backlog)',
'form.providerLabel': 'LLM provider', 'form.providerDefault': 'Default (DSH)',
'form.modelLabel': 'LLM model', 'form.modelDefault': 'Default',
'form.silentRuleLabel': 'Silent rule (optional)',
'form.silentRulePlaceholder': 'Stay silent when no filesystem is above 80%',
'form.silentRuleHint': 'For tasks with output: a cheap model judges the run against this rule and the report is skipped when it says to stay silent. If the model is unavailable or unsure, the report is delivered.',
'history.silentSkip': 'stayed silent:', 'history.diagnosis': 'Diagnosis',
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
'form.permissionReadonly': 'Read-only', 'form.permissionWrite': 'Workspace write',
'form.permissionFull': 'Full', 'list.runningNow': 'Running now',
'history.openSession': 'Open session', 'form.notifyTitle': 'Telegram notifications',
'form.notifyTelegram': 'Send the run report to Telegram',
'form.notifyOnlyFailure': 'Only on failures (onlyOnFailure / silent on success)',
'form.channelsTitle': 'Delivery channels',
'form.channelsHint': 'Pick the channels for this task. An explicit selection overrides the Telegram switch above; leave everything unchecked to fall back to it.',
'form.templateLabel': 'Message template (optional)',
'form.templatePlaceholder': '⏰ {title} — {status} in {duration}',
'form.templateHint': 'Variables: {title} {id} {status} {output} {error} {duration} {schedule} {time} {tokens} {cost} {model}. Empty = built-in text.',
'form.channelTelegram': 'Telegram', 'form.channelKanban': 'dsh-kanban card',
'form.channelDiscord': 'Discord', 'form.channelSlack': 'Slack',
'form.channelNtfy': 'ntfy', 'form.channelBark': 'Bark',
'form.channelPushplus': 'PushPlus', 'form.channelTts': 'Voice (dsh-tts)',
'form.channelGitea': 'Gitea issue', 'settings.deliverySection': 'Delivery channels',
'settings.secretsSection': 'Credentials (references)',
'settings.secretsHint': 'Enter the NAME of a DSH credential, not the secret itself. Secrets stay in the credentials store.',
'settings.telegramSection': 'Telegram', 'settings.templatesSection': 'Message templates',
'settings.channelTemplateLabel': 'Template for {channel}',
'settings.botTokenRefLabel': 'Bot token credential name',
'settings.botTokenRefPlaceholder': 'e.g. TELEGRAM_BOT_TOKEN',
'settings.apiTokenLabel': 'External API token',
'settings.apiTokenPlaceholder': 'Bearer token for /dsh-cron/api/* (empty = disabled)',
'settings.discordLabel': 'Discord webhook URL', 'settings.slackLabel': 'Slack webhook URL',
'settings.ntfyUrlLabel': 'ntfy server URL', 'settings.ntfyTopicLabel': 'ntfy topic',
'settings.ntfyTokenRefLabel': 'ntfy token credential name',
'settings.barkServerLabel': 'Bark server URL', 'settings.barkKeyLabel': 'Bark device key',
'settings.pushplusTokenRefLabel': 'PushPlus token credential name',
'settings.pushplusUrlLabel': 'PushPlus endpoint',
'settings.ttsBaseUrlLabel': 'dsh-tts base URL', 'settings.giteaBaseUrlLabel': 'Gitea base URL',
'settings.giteaRepoLabel': 'Gitea repository (owner/repo)',
'settings.giteaTokenRefLabel': 'Gitea token credential name',
'settings.templateLabel': 'Default message template',
'settings.templateHint': 'Applies to every channel without its own template. Empty = built-in text.',
'settings.deliveryTimeoutMsLabel': 'Delivery timeout per channel (ms)',
'settings.automationSection': 'Automation models',
'settings.automationHint': 'Models used for the small helper calls (rule evaluation, failure analysis). Leave empty to use the task model.',
'settings.silentRuleModelLabel': 'Model for silent rules',
'settings.secretsOnCard': 'Credentials referenced from the settings panel are shown masked and stored by name.',
'form.nextRunLabel': 'Next run: ', 'form.notScheduled': 'not scheduled',
'settings.loading': 'Loading settings...',
'settings.unavailable': 'Settings are unavailable right now.', 'settings.retry': 'Retry',
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
'settings.dynamicCredentials': 'Dynamic Credentials Resolution (credential://...)',
'settings.dynamicCredentialsHint': 'Resolve credential://... in memory from harness credentials at runtime (#335)',
'settings.testTelegram': '🔔 Test Telegram delivery', 'settings.testKanban': '📋 Test Kanban',
'settings.sending': 'Sending...', 'settings.checkingKanban': 'Checking Kanban...',
'settings.testOk': '✅ Test message delivered to Telegram!', 'settings.testFail': '❌ {error}',
'settings.kanbanOk': '✅ Kanban card created', 'settings.kanbanFail': '❌ {error}',
'settings.save': 'Save settings', 'settings.saved': '✓ Saved',
'settings.saveError': 'Save failed: {error}', 'settings.saveErrorUnknown': 'unknown error',
'updater.title': 'Plugin Auto-Updater', 'updater.btnCheck': 'Check for updates',
'updater.checking': 'Checking...', 'updater.btnUpdate': 'Update to v{version}',
'updater.updating': 'Updating...',
'updater.desc': 'Check npm registry and install plugin updates in-place without SSH access.',
'updater.current': 'Current version: v{version}',
'updater.available': 'Update available: v{version}', 'updater.upToDate': 'Up to date',
'updater.success': 'Successfully updated to v{version}. Please restart DSH or reload profile to apply changes.',
'dsh.modalTitle': 'Schedule a task with the DSH agent',
'dsh.descLabel': 'Describe the task and the desired frequency:',
'dsh.placeholder': 'For example: check free disk space and failed systemd services every 2 hours, and alert only if something is wrong...',
'dsh.sendHint': 'Ctrl+Enter to send', 'dsh.sendTitle': 'Send to agent',
'dsh.startFailed': 'Failed to start the agent dialog: {error}',
'dsh.launchError': 'Launch failed: {error}', 'confirm.delete': 'Delete this task?',
'list.loadErrorPrefix': 'Failed to load tasks', 'actions.dryRun': 'Dry run',
'actions.dryRunTitle': 'Dry run (test execution without side effects or notifications)',
'actions.archive': 'Archive', 'actions.archiveTitle': 'Execution archive and logs',
'dryRun.title': '🧪 Dry Run Simulation', 'dryRun.task': 'Task',
'dryRun.status': 'Simulation Status', 'dryRun.duration': 'Duration',
'dryRun.output': 'Simulated Output', 'dryRun.preflight': 'Preflight Check',
'dryRun.close': 'Close', 'archive.title': '📜 Execution Archive',
'archive.totalRuns': '{total} total runs recorded',
'archive.empty': 'No archived runs recorded for this task yet.',
'archive.loadMore': 'Load more ({shown} of {total})', 'archive.close': 'Close',
'form.reliabilityTitle': '🛡️ Reliability, Heartbeat & Self-Healing',
'form.preflightLabel': 'Pre-flight check', 'form.preflightNone': 'None',
'form.preflightHttp': 'HTTP (2xx probe)', 'form.preflightShell': 'Shell command (exit code 0)',
'form.preflightDisk': 'Disk space (path:minPercent)',
'form.preflightTargetLabel': 'Pre-flight target',
'form.preflightTargetPlaceholder': 'https://example.com/healthz OR ls /data OR /:10%',
'form.heartbeatIntervalLabel': 'Heartbeat deadline (seconds, 0 = disabled)',
'form.gracePeriodLabel': 'Heartbeat grace period (seconds)',
'form.priorityLabel': 'Queue priority (1-10, higher runs first)',
'form.concurrencyGroupLabel': 'Concurrency group',
'form.selfHealingLabel': 'Self-healing runbook command (shell)',
'form.selfHealingPlaceholder': 'systemctl restart app || true',
'form.autoDiagnoseLabel': 'Auto-diagnose failures with AI agent',
'form.agentPresetLabel': 'Agent preset',
'form.agentPresetPlaceholder': 'standard (leave empty for configured default)',
'form.agentPresetHint': 'Agent preset from dsh-agent-presets (e.g. standard, minimal, cordis, ptc). Mounts workspace and coding tools.',
'form.sessionTitleLabel': 'Session Title Template',
'form.sessionTitlePlaceholder': 'e.g. {{date}} a-share-review (supports {{date}})',
'form.sessionTitleHint': 'Name given to agent sessions created by this task. Supports {{date}} for YYYY-MM-DD. Defaults to "<YYYY-MM-DD> <title>".',
'form.targetSessionIdLabel': 'Target persistent session ID',
'form.targetSessionIdPlaceholder': 'e.g. audit-chat or dev-summary (empty = isolated run)',
'form.targetSessionIdHint': 'When specified, scheduled runs resume this session to maintain conversation context across runs instead of creating a new isolated session.',
'form.targetSessionResetLabel': 'Session context rotation',
'form.targetSessionResetNever': 'Continuous (never reset)',
'form.targetSessionResetDaily': 'Daily rotation (new session each day)',
'form.targetSessionResetWeekly': 'Weekly rotation (new session each week)',
'form.targetSessionResetHint': 'Automatically rotates the session identifier to prevent context window explosion over long periods.',
'form.requireApprovalLabel': 'Require human approval before execution',
'form.requireApprovalHint': 'When enabled, the task will not execute until an authorized user approves the run proposal (#318).',
'actions.approve': 'Approve', 'actions.reject': 'Reject',
'approval.waiting': 'Awaiting human approval',
'approval.approved': 'Approved', 'approval.rejected': 'Rejected',
'chainGraph.modalTitle': 'Visual Chain & Checkpoint Graph', 'chainGraph.viewGraph': 'Chain Graph',
'chainGraph.noNodes': 'No chained steps found for this task or run.', 'chainGraph.retryStep': 'Retry Step',
'chainGraph.stepSuccess': 'Success', 'chainGraph.stepFailed': 'Failed', 'chainGraph.stepPending': 'Pending', 'chainGraph.close': 'Close', 'chainGraph.decisionNode': 'Decision Node', 'chainGraph.stepSkipped': 'Skipped', 'history.doctorDiagnosis': 'Doctor Diagnosis & Suggested Fix', 'history.doctorApply': '1-Click Apply Fix', 'history.doctorRevert': 'Revert to Previous Code', 'history.autoHealed': 'Auto-Healed by Doctor', 'form.autoHealLabel': 'Autonomous Self-Healing Doctor', 'form.autoHealHint': 'Automatically diagnose and apply safe fixes upon failure (max 1 auto-patch/day)', 'form.elseTaskLabel': 'Default Fallback Task (elseTask)', 'form.elseTaskHint': 'Target task to trigger if no conditional branch rules matched', 'form.elseTaskPlaceholder': 'e.g. task-fallback',
'adaptive.badge': 'Adaptive', 'adaptive.idle': 'idle', 'adaptive.backoff': 'backoff',
'form.adaptiveEnabled': 'Adaptive Polling', 'form.adaptiveHint': 'Exponential backoff when no changes are detected',
'liveLog.modalTitle': 'Real-Time Streaming Execution Logs', 'liveLog.viewLog': 'Live Stream',
'liveLog.autoScroll': 'Auto-scroll', 'liveLog.connecting': 'Connecting to log stream...', 'liveLog.waiting': 'Waiting for runner output...', 'liveLog.completed': 'Execution stream completed', 'liveLog.close': 'Close Stream',
'timeline.modalTitle': '24-Hour Schedule Timeline', 'timeline.buttonLabel': 'Timeline',
'timeline.buttonTitle': 'View 24-hour projected schedule and concurrency timeline',
'timeline.tabTimeline': 'Schedule Timeline', 'timeline.legendDesc': 'Projected run distribution across 24 hourly buckets:',
'timeline.peakWarning': 'Peak concurrency warning',
'heatmap.modalTitle': 'Cost & Token Burn Heatmap', 'heatmap.buttonLabel': 'Heatmap',
'heatmap.tabHeatmap': 'Cost Heatmap', 'heatmap.matrixDesc': 'Weekly hour-of-day cost concentration (7 days × 24 hours):',
'digest.modalTitle': 'Automation & Cost Digest', 'digest.buttonLabel': 'Digest',
'digest.buttonTitle': 'View 7-day or 30-day automation analytics and cost digest',
'digest.period7': 'Last 7 Days', 'digest.period30': 'Last 30 Days',
'digest.executions': 'Executions', 'digest.tokens': 'Tokens', 'digest.cost': 'Cost (USD)', 'digest.fleet': 'Automations',
'digest.unstableTitle': 'Top Unstable Automations', 'digest.expensiveTitle': 'Top Resource Consumers',
'digest.sendTelegram': 'Send to Telegram', 'digest.copyMarkdown': 'Copy Markdown', 'digest.copied': 'Copied!',
'digest.sentSuccess': 'Sent to Telegram successfully!',
'prompt.version': 'Prompt Version', 'prompt.rollback': 'Restore v', 'prompt.history': 'Prompt History', 'prompt.successRate': 'SR',
'form.chainingTitle': 'Chaining & DAG Orchestration', 'form.onSuccessLabel': 'On Success Trigger (Task IDs)',
'form.onSuccessHint': 'Comma-separated task IDs to execute upon success (Fan-Out)',
'form.onFailureLabel': 'On Failure Trigger (Task IDs)', 'form.onFailureHint': 'Comma-separated task IDs to execute upon failure',
'form.dependsOnLabel': 'Dependencies (dependsOn)', 'form.dependsOnHint': 'Wait for these task IDs before executing (Fan-In barrier)',
'form.joinPolicyLabel': 'Join Policy', 'form.joinPolicyAll': 'All Prerequisites (all_success)', 'form.joinPolicyAny': 'Any Prerequisite (any_success)',
'recipe.dependenciesMissing': 'Missing required integrations or credentials',
'form.previewSchedule': 'Preview next runs',
'form.previewScheduleTitle': 'Next 5 scheduled runs:',
},
zh: {
'sidebar.label': '定时任务', 'sidebar.jobsTitle': '运行中任务',
'sidebar.noActiveJobs': '无运行中任务', 'sidebar.moreJobs': '及另外 {count} 个',
'chip.title': '定时任务 (Cron)', 'panel.back': '返回对话',
'panel.title': '定时任务', 'panel.subtitle': '让 DSH 规划任务、设置提醒或跟踪状态',
'actions.create': '新建', 'actions.createWithDsh': '💬 让 DSH 创建',
'actions.setupManually': '✏️ 手动配置', 'actions.runNow': '立即运行',
'actions.runNowShort': '运行', 'actions.edit': '编辑 / 详情',
'actions.duplicate': '复制任务', 'actions.tuneWithDsh': '让 DSH 优化',
'tune.startFailed': '无法启动优化会话: {error}', 'actions.delete': '删除任务',
'duplicate.done': '已创建副本并处于暂停状态：恢复前请先核对调度时间。', 'duplicate.oneShotHint': '该副本为一次性任务且已暂停，请设定新的执行时间后再启用。',
'duplicate.failed': '复制任务失败: {error}', 'transfer.exportTitle': '导出任务',
'transfer.importTitle': '导入任务', 'transfer.exported': '已成功导出 {count} 个任务。',
'transfer.exportFailed': '导出失败: {error}', 'transfer.importTitleModal': '导入任务',
'transfer.importHint': '仅导出任务静态配置：不包含历史记录与计数器。渠道通过凭据名称引用；注意完整导出保留自定义环境变量和 HTTP 请求头。', 'transfer.exportPrompt': '选择导出模式：\n确定 = 净化导出（移除自定义环境变量与请求头）\n取消 = 完整原始导出',
'transfer.strategyAdd': '作为新任务导入（分配新 ID）', 'transfer.strategyReplace': '覆盖同 ID 任务',
'transfer.strategySkip': '跳过已存在的同 ID 任务', 'transfer.summary': '该文件包含 {total} 个任务：{add} 个新增，{replace} 个覆盖，{skip} 个跳过。',
'transfer.confirm': '开始导入', 'transfer.imported': '已成功导入 {count} 个任务。',
'transfer.importFailed': '导入失败: {error}', 'transfer.badFile': '所选文件不是有效的 JSON 导出文件: {error}',
'actions.pause': '暂停', 'actions.resume': '恢复',
'actions.settings': '通知与渠道设置', 'search.placeholder': '搜索定时任务',
'filters.title': '筛选', 'filters.type': '类型',
'filters.model': '模型', 'filters.channel': '渠道',
'filters.any': '全部', 'filters.reset': '重置筛选',
'filters.empty': '没有匹配当前筛选条件的任务。', 'filters.showing': '显示 {shown} / 共 {total}',
'stats.activeTasks': '活跃任务', 'stats.totalRuns': '总运行次数',
'stats.totalTokens': '消耗 Token', 'stats.totalCost': '预估成本',
'tabs.all': '全部', 'tabs.active': '运行中',
'tabs.paused': '已暂停', 'tabs.completed': '已完成',
'banner.loadError': '加载任务失败: {error}', 'banner.retry': '重试',
'list.loading': '正在加载定时任务...', 'list.empty': '暂无定时任务',
'list.typeShell': 'Shell 脚本', 'list.typeLlm': 'LLM 智能体',
'list.oneShot': '一次性', 'list.configManaged': '配置只读',
'list.configManagedHint': '由配置文件中的 config.jobs 声明；要修改或删除请编辑该文件', 'list.next': ' · 下次: {time}',
'recs.title': '推荐任务', 'recs.hint': '开箱即用的配方。点一下就会把表单填好——保存之前不会创建任何任务。',
'modal.editTitle': '编辑任务', 'modal.newTitle': '新建定时任务',
'modal.statusActive': '活跃', 'modal.statusPaused': '已暂停',
'modal.params': '配置参数', 'modal.history': '运行历史 ({count})',
'modal.cancel': '取消', 'modal.confirmDiscard': '放弃未保存的内容？',
'modal.save': '保存修改', 'modal.create': '创建任务',
'modal.close': '关闭', 'history.loading': '正在加载历史记录...',
'history.empty': '暂无运行记录', 'history.stoppedReasonTitle': '停止原因:',
'history.retryDelivery': '重试推送', 'history.retryingDelivery': '正在重试...',
'history.statusValidationFailed': '校验失败', 'history.stage_queue': '排队',
'history.stage_preflight': '预检', 'history.stage_execution': '执行',
'history.stage_validation': '校验', 'history.stage_delivery': '推送',
'history.refresh': '刷新历史', 'history.statusSuccess': '成功',
'history.statusUncertain': '不确定', 'history.artifacts': '产物文件',
'history.resolveCompleted': '标记已完成', 'history.resolveFailed': '标记失败',
'history.statusUncertainHint': '服务重启中断 — 请确认结果', 'history.statusSkipped': '已跳过',
'history.statusMissed': '已错过', 'history.statusTimeout': '超时',
'history.statusFailed': '失败', 'form.nameLabel': '任务名称',
'form.namePlaceholder': '例如: dsh-tags-watch', 'form.typeLabel': '执行类型 *',
'form.typeLlm': 'LLM（AI 智能体）', 'form.typeScript': 'Shell 命令 / 脚本',
'form.typeNode': 'Node.js', 'form.typePython': 'Python',
'form.typeHttp': 'HTTP 请求 / Webhook', 'form.typeSsh': '远程 SSH',
'form.typeDocker': 'Docker 容器', 'form.typeSkill': 'DSH 技能',
'form.typeWorkflow': 'DSH 工作流', 'form.envLabel': '环境变量 (KEY=VALUE, 每行一个)',
'form.envPlaceholder': 'NODE_ENV=production\nTZ=Europe/Berlin', 'form.envHint': '仅对非 LLM 运行时生效。不要在这里存放密钥。',
'form.cwdLabel': '工作目录 (绝对路径)', 'form.workspaceLabel': '工作区 ID 或路径（可选）',
'form.worktreeLabel': '在独立的临时 Git Worktree 中执行', 'form.keepWorktreeLabel': '执行结束后保留 Git Worktree (不自动清理)',
'form.httpMethodLabel': 'HTTP 方法', 'form.httpUrlLabel': 'URL',
'form.httpHeadersLabel': '请求头（JSON，可选）', 'form.httpBodyLabel': '请求体（可选）',
'form.sshProfileLabel': 'dsh-remote-workspace 配置 ID', 'form.sshProfileHint': '推荐用法：主机与凭据都放在 remote-workspace 插件里。',
'form.sshTargetLabel': '备用目标（user@host，可选）', 'form.sshKeyLabel': '私钥路径（备用，可选）',
'form.dockerImageLabel': '容器镜像', 'form.skillNameLabel': '技能名称',
'form.workflowNameLabel': '工作流名称', 'form.scheduleLabel': '调度计划 (Cron 或相对时间) *',
'form.schedulePlaceholder': '例如: 0 9 * * 1-5 或 15m 或 in 2 hours', 'form.timeoutLabel': '超时时间 (秒)',
'form.overlapLabel': '并发策略', 'form.overlapSkip': '跳过 (默认)',
'form.overlapQueue': '排队等待', 'form.overlapReplace': '取消当前运行并重新开始 (replace)',
'form.kanbanLabel': '看板同步模式', 'form.kanbanNone': '不同步到看板',
'form.kanbanOnFailure': '失败时创建工单（进 Backlog）', 'form.kanbanAlways': '每次完成都建卡片（Done / Backlog）',
'form.providerLabel': 'LLM 服务商', 'form.providerDefault': '默认（DSH）',
'form.modelLabel': 'AI 模型', 'form.modelDefault': '默认模型',
'form.silentRuleLabel': '静默规则 (可选)', 'form.silentRulePlaceholder': '例如: ALL_OK 或 status == 200',
'form.silentRuleHint': '若输出符合此规则，将不发送任何通知。', 'history.silentSkip': '保持静默:',
'history.diagnosis': '诊断', 'history.applySuggestion': '用这条建议打开编辑表单',
'form.inspectOnFailureLabel': '用模型诊断失败原因', 'form.inspectOnFailureHint': '运行失败后，由模型读一遍提示词、错误和输出，把诊断结论和修改建议随这次运行一起保存。不会自动应用任何改动。',
'settings.inspectorModelLabel': '失败诊断模型', 'form.fallbackModelLabel': '备用模型 (主模型失败时使用)',
'form.fallbackModelPlaceholder': '例如: deepseek-reasoner', 'form.fallbackModelHint': '主模型运行失败时，用这个模型再试一次。两次尝试都计入成本。',
'form.promptLabelScript': 'Shell 命令或脚本', 'form.promptLabelLlm': '给智能体的指令 / 提示词',
'form.promptPlaceholderScript': 'curl -fsSL https://... || exit 1', 'form.promptPlaceholderLlm': '精确描述智能体要做什么...',
'form.timezoneLabel': '时区 (IANA 时区名)', 'form.timezonePlaceholder': '例如: Asia/Shanghai 或 UTC (留空使用服务器时区)',
'form.misfireLabel': '错过执行策略 (Misfire Policy)', 'form.misfireSkip': '跳过 (默认)',
'form.misfireRunOnce': '补跑一次', 'form.misfireCatchUp': '迟到时补跑一次并记录缺口 (catchUpAll)',
'form.retriesLabel': '失败自动重试次数（0 = 关闭）', 'form.permissionLabel': '会话权限',
'form.permissionDefault': '默认 (继承主配置)', 'form.permissionReadonly': '只读',
'form.permissionWrite': '工作区写入', 'form.permissionFull': '完全访问权限',
'list.runningNow': '正在运行', 'history.openSession': '打开会话',
'form.notifyTitle': 'Telegram 通知', 'form.notifyTelegram': '把运行报告发送到 Telegram',
'form.notifyOnlyFailure': '仅失败时发送（onlyOnFailure / 成功静默）', 'form.channelsTitle': '推送渠道',
'form.channelsHint': '任务执行完毕后推送报告的目标渠道。', 'form.templateLabel': '自定义消息模板',
'form.templatePlaceholder': '⏰ {title} — {status}，耗时 {duration}', 'form.templateHint': '可用变量: {title} {id} {status} {output} {error} {duration} {schedule} {time} {tokens} {cost} {model}。留空使用内置文案。',
'form.channelTelegram': 'Telegram', 'form.channelKanban': 'dsh-kanban 卡片',
'form.channelDiscord': 'Discord', 'form.channelSlack': 'Slack',
'form.channelNtfy': 'ntfy', 'form.channelBark': 'Bark',
'form.channelPushplus': 'PushPlus', 'form.channelTts': '语音（dsh-tts）',
'form.channelGitea': 'Gitea Issue', 'settings.deliverySection': '推送渠道',
'settings.secretsSection': '凭据（引用）', 'settings.secretsHint': '这里填 DSH 凭据的「名称」，不是密钥本身。密钥保存在凭据服务里。',
'settings.telegramSection': 'Telegram', 'settings.templatesSection': '消息模板',
'settings.channelTemplateLabel': '{channel} 的消息模板', 'settings.botTokenRefLabel': 'Bot Token 凭据名称',
'settings.botTokenRefPlaceholder': '例如: TELEGRAM_BOT_TOKEN', 'settings.apiTokenLabel': '外部 API Token',
'settings.apiTokenPlaceholder': '用于 /dsh-cron/api/* 的 Bearer token（留空 = 关闭）', 'settings.discordLabel': 'Discord Webhook URL',
'settings.slackLabel': 'Slack Webhook URL', 'settings.ntfyUrlLabel': 'ntfy 服务器地址',
'settings.ntfyTopicLabel': 'ntfy 主题', 'settings.ntfyTokenRefLabel': 'ntfy Token 凭据名称',
'settings.barkServerLabel': 'Bark 服务器地址', 'settings.barkKeyLabel': 'Bark 设备 Key',
'settings.pushplusTokenRefLabel': 'PushPlus Token 凭据名称', 'settings.pushplusUrlLabel': 'PushPlus 接口地址',
'settings.ttsBaseUrlLabel': 'dsh-tts 服务地址', 'settings.giteaBaseUrlLabel': 'Gitea 服务地址',
'settings.giteaRepoLabel': 'Gitea 仓库（owner/repo）', 'settings.giteaTokenRefLabel': 'Gitea Token 凭据名称',
'settings.templateLabel': '默认消息模板', 'settings.templateHint': '作用于所有没有单独模板的渠道。留空用内置文案。',
'settings.deliveryTimeoutMsLabel': '每个渠道的推送超时（毫秒）', 'settings.automationSection': '自动化模型',
'settings.automationHint': '用于静默规则研判和故障诊断的辅助模型。留空沿用任务自身模型。', 'settings.silentRuleModelLabel': '静默规则研判模型',
'settings.secretsOnCard': '设置中引用的凭据将在前端脱敏展示，并通过名称引用。', 'form.nextRunLabel': '下次执行: ',
'form.notScheduled': '未安排计划', 'settings.loading': '正在加载设置...',
'settings.unavailable': '设置当前不可用。', 'settings.retry': '重试',
'settings.cardTitle': '⏰ 定时任务调度器 (Cron)', 'settings.cardDesc': '定时计划任务（Cron/间隔）、后台智能体场景以及支持 Telegram、Discord、Slack、ntfy、Bark、PushPlus、语音和 Gitea 的通知推送。',
'settings.openPanel': '打开任务管理看板', 'settings.modalTitle': '通知与渠道设置',
'settings.tokenLabel': 'Telegram Bot Token', 'settings.tokenPlaceholder': '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
'settings.tokenPlaceholderDefault': '使用 DSH 全局配置的机器人 (或在此输入自定义 Token)', 'settings.defaultHint': '✓ 检测到 DSH 环境已配置默认 Bot',
'settings.chatIdLabel': 'Telegram Chat ID', 'settings.chatIdPlaceholder': '例如: 345678901',
'settings.kanbanUrlLabel': 'Kanban 服务基础地址', 'settings.globalNotify': '全局开启所有任务结果推送至 Telegram',
'settings.globalOnlyFailure': '全局模式：仅在失败时推送 (成功静默)', 'settings.dynamicCredentials': '动态凭据解析 (credential://...)',
'settings.dynamicCredentialsHint': '运行时从凭据服务动态解析 credential://... 且不泄露到存储 (#335)', 'settings.testTelegram': '🔔 测试 Telegram 发送',
'settings.testKanban': '📋 测试 Kanban', 'settings.sending': '正在发送...',
'settings.checkingKanban': '正在连接 Kanban...', 'settings.testOk': '✅ 测试消息已成功发送至 Telegram！',
'settings.testFail': '❌ 发送失败: {error}', 'settings.kanbanOk': '✅ Kanban 卡片创建成功',
'settings.kanbanFail': '❌ {error}', 'settings.save': '保存设置',
'settings.saved': '✓ 已保存', 'settings.saveError': '保存失败: {error}',
'settings.saveErrorUnknown': '未知错误', 'updater.title': '插件自更新',
'updater.btnCheck': '检查更新', 'updater.checking': '正在检查...',
'updater.btnUpdate': '升级至 v{version}', 'updater.updating': '正在更新...',
'updater.desc': '通过 npm 仓库在线检查并就地升级插件，无需 SSH 终端操作。', 'updater.current': '当前版本: v{version}',
'updater.available': '发现新版本: v{version}', 'updater.upToDate': '已是最新版本',
'updater.success': '已成功升级至 v{version}。请重启 DSH 或重载配置以应用更新。', 'dsh.modalTitle': '让 DSH 智能体创建任务',
'dsh.descLabel': '请描述你的任务目标和执行频率:', 'dsh.placeholder': '例如: 每两小时检查一次磁盘空间和失败的 systemd 守护进程，并在异常时报警...',
'dsh.sendHint': '按 Ctrl+Enter 发送', 'dsh.sendTitle': '提交给智能体',
'dsh.startFailed': '启动智能体对话失败: {error}', 'dsh.launchError': '执行错误: {error}',
'confirm.delete': '确定删除该任务吗？', 'list.loadErrorPrefix': '加载任务列表失败',
'actions.dryRun': '空跑测试', 'actions.dryRunTitle': '空跑测试（模拟执行，不产生副作用且不发送通知）',
'actions.archive': '历史归档', 'actions.archiveTitle': '查看执行历史与日志归档',
'dryRun.title': '🧪 空跑模拟结果', 'dryRun.task': '任务',
'dryRun.status': '模拟状态', 'dryRun.duration': '耗时',
'dryRun.output': '模拟输出', 'dryRun.preflight': '预检结果',
'dryRun.close': '关闭', 'archive.title': '📜 运行历史归档',
'archive.totalRuns': '共记录 {total} 次运行', 'archive.empty': '该任务暂无历史运行归档。',
'archive.loadMore': '加载更多 ({shown} / {total})', 'archive.close': '关闭',
'form.reliabilityTitle': '🛡️ 可靠性、心跳监听与自愈', 'form.preflightLabel': '预检健康探测',
'form.preflightNone': '无', 'form.preflightHttp': 'HTTP (2xx 探测)',
'form.preflightShell': 'Shell 探测 (退出码 0)', 'form.preflightDisk': '磁盘空间探测 (挂载点:最小百分比)',
'form.preflightTargetLabel': '预检目标参数', 'form.preflightTargetPlaceholder': 'https://example.com/healthz 或 ls /data 或 /:10%',
'form.heartbeatIntervalLabel': '心跳打卡时限 (秒, 0 = 禁用)', 'form.gracePeriodLabel': '心跳宽限期 (秒)',
'form.priorityLabel': '队列优先级 (1-10，数值越大越先执行)', 'form.concurrencyGroupLabel': '并发分组名称',
'form.selfHealingLabel': '故障自愈脚本 (Shell)', 'form.selfHealingPlaceholder': 'systemctl restart app || true',
'form.autoDiagnoseLabel': '任务失败时启用 AI 智能分析诊断', 'form.agentPresetLabel': '智能体预设 (Agent Preset)',
'form.agentPresetPlaceholder': 'standard (留空使用全局默认预设)', 'form.agentPresetHint': '来自 dsh-agent-presets 的智能体预设（如 standard, minimal, cordis, ptc），挂载工作区工具与文件读写能力。',
'form.sessionTitleLabel': '会话标题模板 (Session Title)', 'form.sessionTitlePlaceholder': '如 {{date}} 市场早报 (支持 {{date}} 变量)',
'form.sessionTitleHint': '此任务运行生成的会话标题。支持 {{date}} (年-月-日)。留空默认为 "<YYYY-MM-DD> <任务名>"。', 'form.targetSessionIdLabel': '目标常驻会话 ID (Target Session ID)',
'form.targetSessionIdPlaceholder': '如 audit-chat 或 dev-summary（留空为单次隔离运行）', 'form.targetSessionIdHint': '配置后定时任务将在此常驻会话中持续交互，跨周期保留历史上下文对话记忆，不再每次新建孤立会话。',
'form.targetSessionResetLabel': '上下文轮转策略 (Session Rotation)', 'form.targetSessionResetNever': '永不轮转（单一会话持续累积）',
'form.targetSessionResetDaily': '每日轮转（每日自动开启新会话）', 'form.targetSessionResetWeekly': '每周轮转（每周自动开启新会话）',
'form.targetSessionResetHint': '自动按周期加注日期后缀轮转会话，有效防止长时间运行导致的模型上下文窗口超限与 Token 浪费。', 'form.requireApprovalLabel': '执行前需人工确认审批',
'form.requireApprovalHint': '开启后，任务执行前将挂起并等待授权用户批准提议 (#318)。', 'actions.approve': '批准',
'actions.reject': '拒绝', 'approval.waiting': '等待人工审批',
'approval.approved': '已批准', 'approval.rejected': '已拒绝',
'chainGraph.modalTitle': '任务链与检查点依赖图', 'chainGraph.viewGraph': '任务链图',
'chainGraph.noNodes': '未找到该任务或运行的关联步骤。', 'chainGraph.retryStep': '重试此步骤',
'chainGraph.stepSuccess': '成功', 'chainGraph.stepFailed': '失败',
'chainGraph.stepPending': '等待中', 'chainGraph.close': '关闭',
'chainGraph.decisionNode': '条件决策节点', 'chainGraph.stepSkipped': '已跳过',
'history.doctorDiagnosis': 'Doctor 诊断与建议修复', 'history.doctorApply': '一键应用修复',
'history.doctorRevert': '恢复上一版本代码', 'history.autoHealed': '已由 Doctor 自动修复',
'form.autoHealLabel': '自主 Self-Healing Doctor 自动修复', 'form.autoHealHint': '当任务失败时自动诊断并安全修复（每天上限 1 次）',
'form.elseTaskLabel': '默认后备任务 (elseTask)', 'form.elseTaskHint': '当没有分支条件匹配时触发的目标任务',
'form.elseTaskPlaceholder': '如 task-fallback', 'adaptive.badge': '自适应',
'adaptive.idle': '空闲', 'adaptive.backoff': '避让中',
'form.adaptiveEnabled': '自适应轮询 (Adaptive Polling)', 'form.adaptiveHint': '数据无变化时指数级延长执行间隔',
'liveLog.modalTitle': '实时任务执行日志流', 'liveLog.viewLog': '实时日志',
'liveLog.autoScroll': '自动滚动', 'liveLog.connecting': '正在连接日志流...',
'liveLog.waiting': '等待运行器输出...', 'liveLog.completed': '日志流已结束',
'liveLog.close': '关闭日志流', 'timeline.modalTitle': '24小时调度时间线',
'timeline.buttonLabel': '时间线', 'timeline.buttonTitle': '查看24小时预测任务调度与并发时间线',
'timeline.tabTimeline': '调度时间线', 'timeline.legendDesc': '未来24小时各时段任务预计执行分布：',
'timeline.peakWarning': '并发峰值预警', 'heatmap.modalTitle': '成本与Token消耗热力图',
'heatmap.buttonLabel': '热力图', 'heatmap.tabHeatmap': '成本热力图',
'heatmap.matrixDesc': '每周各时段成本分布矩阵（7天 × 24小时）：', 'digest.modalTitle': '自动化与成本分析摘要',
'digest.buttonLabel': '分析摘要', 'digest.buttonTitle': '查看 7 天或 30 天运行统计与花费摘要',
'digest.period7': '最近 7 天', 'digest.period30': '最近 30 天',
'digest.executions': '执行次数', 'digest.tokens': 'Token 消耗',
'digest.cost': '花费 (USD)', 'digest.fleet': '任务总览',
'digest.unstableTitle': '最不稳定任务排行', 'digest.expensiveTitle': '资源消耗排行',
'digest.sendTelegram': '发送至 Telegram', 'digest.copyMarkdown': '复制 Markdown',
'digest.copied': '已复制!', 'digest.sentSuccess': '已成功发送至 Telegram!',
'prompt.version': '提示词版本', 'prompt.rollback': '回退至 v',
'prompt.history': '提示词历史', 'prompt.successRate': '成功率',
'form.chainingTitle': '任务链与 DAG 编排', 'form.onSuccessLabel': '成功后触发 (任务 ID)',
'form.onSuccessHint': '成功后并发触发的任务 ID，逗号分隔 (Fan-Out)', 'form.onFailureLabel': '失败后触发 (任务 ID)',
'form.onFailureHint': '失败后触发的任务 ID，逗号分隔', 'form.dependsOnLabel': '依赖任务 (dependsOn)',
'form.dependsOnHint': '执行前需等待的前置任务 ID，逗号分隔 (Fan-In)', 'form.joinPolicyLabel': '合并策略',
'form.joinPolicyAll': '所有前置均成功 (all_success)', 'form.joinPolicyAny': '任一前置成功即可 (any_success)',
'recipe.dependenciesMissing': '缺少必要集成服务或凭据', 'form.previewSchedule': '预测下次运行时间',
'form.previewScheduleTitle': '未来 5 次计划运行时间:',
}
};
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
const STYLE_ID = 'dsh-cron-styles';
const CSS_HREF = '/dsh-cron/client.css';
function ensureStyles() {
if (typeof document === 'undefined') return null;
let el = document.getElementById(STYLE_ID);
if (el === null) {
const head = document.head || document.documentElement;
if (!head) return null;
el = document.createElement('link');
el.id = STYLE_ID;
el.rel = 'stylesheet';
el.href = CSS_HREF;
el.dataset.dshPlugin = 'dsh-cron';
head.appendChild(el);
return el;
}
if (el.getAttribute('href') !== CSS_HREF) {
el.setAttribute('href', CSS_HREF);
el.href = CSS_HREF;
}
return el;
}
const STYLE_HEAL_KEY = '__dshCronStyleHeal';
const STYLE_HEAL_INTERVAL_MS = 2000;
function startStyleSelfHeal() {
if (typeof document === 'undefined') return () => {};
if (typeof window !== 'undefined' && typeof window[STYLE_HEAL_KEY] === 'function') {
try { window[STYLE_HEAL_KEY](); } catch (_err) { void _err; }
}
const heal = () => { try { ensureStyles(); } catch (_err) { void _err; } };
heal();
let observer = null;
try {
if (typeof MutationObserver === 'function') {
observer = new MutationObserver(heal);
if (document.head) observer.observe(document.head, { childList: true });
if (document.documentElement) observer.observe(document.documentElement, { childList: true });
}
} catch (_err) { observer = null; }
let timer = null;
try { timer = setInterval(heal, STYLE_HEAL_INTERVAL_MS); } catch (_err) { timer = null; }
const onVisibility = () => { if (document.visibilityState !== 'hidden') heal(); };
try { document.addEventListener('visibilitychange', onVisibility); } catch (_err) { void _err; }
const stop = () => {
try { if (observer) observer.disconnect(); } catch (_err) { void _err; }
try { if (timer !== null) clearInterval(timer); } catch (_err) { void _err; }
try { document.removeEventListener('visibilitychange', onVisibility); } catch (_err) { void _err; }
if (typeof window !== 'undefined' && window[STYLE_HEAL_KEY] === stop) window[STYLE_HEAL_KEY] = undefined;
};
if (typeof window !== 'undefined') window[STYLE_HEAL_KEY] = stop;
return stop;
}
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
return _h('div', { className: 'dsh-cron-status-banner', 'data-type': 'error', style: { margin: '12px 0' } },
_h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '⚠️ Cron UI error:'),
_h('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String((this.state.error && this.state.error.message) || this.state.error)),
_h('button', {
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
const DELIVERY_SETTING_FIELDS = [
{ key: 'botTokenRef', labelKey: 'settings.botTokenRefLabel', placeholderKey: 'settings.botTokenRefPlaceholder', group: 'secrets' },
{ key: 'ntfyTokenRef', labelKey: 'settings.ntfyTokenRefLabel', group: 'secrets' },
{ key: 'pushplusTokenRef', labelKey: 'settings.pushplusTokenRefLabel', group: 'secrets' },
{ key: 'giteaTokenRef', labelKey: 'settings.giteaTokenRefLabel', group: 'secrets' },
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
const TEMPLATE_SETTING_KEYS = ['template', 'channelTemplates'];
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
function createToggle() {
let open = false;
const listeners = new Set();
return {
isOpen: () => open,
set: (v) => {
const next = !!v;
if (open === next) {
for (const fn of listeners) fn(open);
return;
}
open = next;
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
if (sessions && typeof sessions.open === 'function') {
try {
sessions.open(sessionId);
return true;
} catch (err) {
/* sessions.open threw synchronously */
}
}
if (sessions && typeof sessions.refresh === 'function') {
try {
await sessions.refresh();
sessions.open(sessionId);
return true;
} catch (err) {
/* sessions.refresh threw */
}
}
for (let i = 0; i < 15; i++) {
await new Promise(resolve => setTimeout(resolve, 120));
sessions = getSessions();
if (sessions && typeof sessions.open === 'function') {
try {
sessions.open(sessionId);
return true;
} catch (err) {
/* retry polling sessions.open threw */
}
}
if (typeof document !== 'undefined') {
const domItem = document.querySelector('[data-session-id="' + sessionId + '"], [role="treeitem"][data-id="' + sessionId + '"], [data-id="' + sessionId + '"]');
if (domItem) {
domItem.click();
return true;
}
}
}
console.warn('[dsh-cron] could not open session in workspace:', sessionId);
return false;
}
function statusLabel(t, status) {
if (status === 'success') return T_KEY(t, 'history.statusSuccess');
if (status === 'validation_failed') return T_KEY(t, 'history.statusValidationFailed');
if (status === 'skipped') return T_KEY(t, 'history.statusSkipped');
if (status === 'missed') return T_KEY(t, 'history.statusMissed');
if (status === 'timeout') return T_KEY(t, 'history.statusTimeout');
if (status === 'uncertain') return T_KEY(t, 'history.statusUncertain');
return T_KEY(t, 'history.statusFailed');
}
function isConfigManaged(task) {
return Boolean(task) && task.managedBy === 'config';
}
function T_KEY(t, key, vars) {
return (typeof t === 'function' ? t : translate)(key, vars);
}
const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
if (options && options.signal && controller) {
if (options.signal.aborted) {
controller.abort();
} else {
options.signal.addEventListener('abort', () => controller.abort(), { once: true });
}
}
try {
const res = await fetch(url, {
...options,
signal: controller ? controller.signal : (options ? options.signal : undefined),
});
return res;
} catch (err) {
if (err && (err.name === 'AbortError' || controller?.signal?.aborted)) {
const timeoutErr = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
timeoutErr.isTimeout = true;
throw timeoutErr;
}
throw err;
} finally {
if (timer) clearTimeout(timer);
}
};
const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
const res = await fetchWithTimeout(url, options, timeoutMs);
let data = {};
try {
data = await res.json();
} catch (jsonErr) {
if (jsonErr && jsonErr.name === 'AbortError') {
throw jsonErr;
}
}
return { res, data };
};
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
function renderDeliverySettings({ T, values, onChange, onChannelTemplate, sections, onToggleSection }) {
const val = (key) => (values[key] === undefined || values[key] === null ? '' : String(values[key]));
const field = (f) => _h('div', { className: 'dsh-cron-form-group', key: f.key, style: { marginBottom: '10px' } },
_h('label', null, T(f.labelKey)),
_h('input', f.numeric ? {
type: 'number',
min: f.min !== undefined ? f.min : 1000,
step: 1000,
value: val(f.key),
placeholder: String(f.defaultValue !== undefined ? f.defaultValue : 15000),
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
return _h('div', { className: 'dsh-cron-section', key },
_h('button', {
type: 'button',
className: 'dsh-cron-section-head',
'aria-expanded': open ? 'true' : 'false',
onClick: () => onToggleSection(key)
},
_h('span', null, T(titleKey)),
_h('span', { className: 'dsh-cron-section-chevron', 'data-open': open ? 'true' : 'false' }, '▾')
),
open && _h('div', { className: 'dsh-cron-section-body' }, children)
);
};
return [
section('secrets', 'settings.secretsSection', [
_h('div', { className: 'dsh-cron-hint', key: 'hint', style: { marginBottom: '10px' } }, T('settings.secretsHint')),
...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'secrets').map(field),
]),
section('channels', 'settings.deliverySection', [
_h('div', { className: 'dsh-cron-form-row', key: 'row' },
...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'channels').map(field)
),
]),
section('automation', 'settings.automationSection', [
_h('div', { className: 'dsh-cron-hint', key: 'hint', style: { marginBottom: '10px' } }, T('settings.automationHint')),
_h('div', { className: 'dsh-cron-form-row', key: 'row' },
...DELIVERY_SETTING_FIELDS.filter((f) => f.group === 'automation').map(field)
),
]),
section('templates', 'settings.templatesSection', [
_h('div', { className: 'dsh-cron-form-group', key: 'global', style: { marginBottom: '10px' } },
_h('label', null, T('settings.templateLabel')),
_h('input', {
type: 'text',
value: val('template'),
onChange: (e) => onChange('template', e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T('settings.templateHint'))
),
_h('div', { className: 'dsh-cron-form-row', key: 'perchannel' },
...DELIVERY_CHANNELS.map((id) => _h('div', { className: 'dsh-cron-form-group', key: id, style: { marginBottom: '10px' } },
_h('label', null, T('settings.channelTemplateLabel', { channel: T(CHANNEL_LABEL_KEYS[id]) })),
_h('input', {
type: 'text',
value: (values.channelTemplates && values.channelTemplates[id]) || '',
onChange: (e) => onChannelTemplate(id, e.target.value)
})
))
),
]),
];
}
function parseChainTargets(raw) {
if (!raw) return [];
if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string' && x.trim().length > 0);
if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
return [];
}
const sanitizeDependsOn = parseChainTargets;
const sanitizeJoinPolicy = (raw) => (raw === 'any_success' ? 'any_success' : 'all_success');
function buildTaskGraphModel(tasks = [], snapshots = [], focusTaskId = null) {
const taskMap = new Map();
for (const t of tasks) if (t?.id) taskMap.set(t.id, t);
const snapMap = new Map();
for (const s of snapshots) if (s?.stepTaskId) snapMap.set(s.stepTaskId, s);
const nodes = [], edges = [];
let hasFailure = false;
for (const [id, task] of taskMap.entries()) {
const snap = snapMap.get(id);
let nodeStatus = 'pending', durationMs = 0, outputSnippet = '', retryCount = 0;
if (snap) {
nodeStatus = snap.status === 'completed' || snap.status === 'success' ? 'success' : 'failed';
durationMs = snap.durationMs || 0;
retryCount = snap.retryCount || 0;
if (snap.output) outputSnippet = String(snap.output).slice(0, 200);
if (nodeStatus === 'failed') hasFailure = true;
} else if (task.status === 'running') {
nodeStatus = 'running';
}
const deps = sanitizeDependsOn(task.dependsOn);
const hasBranches = Array.isArray(task.branchRules) && task.branchRules.length > 0;
nodes.push({
id,
title: task.title || id,
type: task.type || 'prompt',
status: nodeStatus,
durationMs,
retryCount,
outputSnippet,
isFocus: Boolean(focusTaskId && id === focusTaskId),
isRetryable: nodeStatus === 'failed',
isDecisionNode: hasBranches,
branchRulesCount: hasBranches ? task.branchRules.length : 0,
elseTask: task.elseTask || null,
dependsOn: deps,
joinPolicy: sanitizeJoinPolicy(task.joinPolicy)
});
for (const d of deps) edges.push({ from: d, to: id, type: 'dependsOn', label: task.joinPolicy === 'any_success' ? 'join:any' : 'join:all' });
if (hasBranches) {
for (const rule of task.branchRules) {
if (rule && rule.targetTask) {
edges.push({
from: id,
to: String(rule.targetTask).trim(),
type: 'branch',
label: rule.label || ('[if: ' + rule.field + ' ' + rule.operator + ' ' + (rule.value != null ? rule.value : '') + ']').trim(),
condition: { field: rule.field, operator: rule.operator, value: rule.value }
});
}
}
}
if (task.elseTask) {
edges.push({
from: id,
to: String(task.elseTask).trim(),
type: 'branch_else',
label: '[else]',
isElse: true
});
}
if (!hasBranches) {
for (const t of parseChainTargets(task.onSuccess)) edges.push({ from: id, to: t, type: 'onSuccess', label: 'onSuccess' });
}
for (const f of parseChainTargets(task.onFailure)) edges.push({ from: id, to: f, type: 'onFailure', label: 'onFailure' });
}
return { nodes, edges, hasFailure };
}
function renderChainGraphModal({ isOpen, onClose, data, loading, onRetry, t }) {
if (!isOpen) return null;
const graph = data?.graph || { nodes: [], edges: [], hasFailure: false };
const chainRunId = data?.chainRunId || '';
const nodes = graph.nodes || [];
return _h('div', {
className: 'dsh-cron-modal-overlay',
onClick: onClose
},
_h('div', {
className: 'dsh-cron-modal',
style: { maxWidth: '820px', width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' },
role: 'dialog',
'aria-modal': 'true',
onClick: (e) => e.stopPropagation()
},
_h('div', {
className: 'dsh-cron-modal-head',
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--dsw-alias-border-l2)', paddingBottom: '12px' }
},
_h('div', null,
_h('div', {
className: 'dsh-cron-modal-title',
style: { margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }
},
_h('span', { style: { fontSize: '18px' } }, '🕸️'),
T_KEY(t, 'chainGraph.modalTitle')
),
chainRunId && _h('div', {
style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '4px', fontFamily: 'monospace' }
}, 'Run ID: ' + chainRunId)
),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
onClick: onClose
}, '✕')
),
_h('div', {
style: { flex: 1, overflowY: 'auto', padding: '16px 0', minHeight: '260px' }
},
loading && _h('div', {
className: 'dsh-cron-history-empty'
}, T_KEY(t, 'history.loading')),
!loading && nodes.length === 0 && _h('div', {
className: 'dsh-cron-history-empty'
}, T_KEY(t, 'chainGraph.noNodes')),
!loading && nodes.length > 0 && _h('div', {
style: { display: 'flex', flexDirection: 'column', gap: '16px' }
},
_h('div', {
style: { display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', padding: '0 4px' }
},
_h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
_h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--dsh-cron-success)' } }),
T_KEY(t, 'chainGraph.stepSuccess')
),
_h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
_h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--dsh-cron-danger)' } }),
T_KEY(t, 'chainGraph.stepFailed')
),
_h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
_h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--dsw-alias-label-tertiary, #888)' } }),
T_KEY(t, 'chainGraph.stepPending')
)
),
_h('div', {
style: {
display: 'flex',
flexWrap: 'wrap',
gap: '12px',
alignItems: 'stretch',
background: 'var(--dsw-alias-bg-layer-2)',
border: '1px solid var(--dsw-alias-border-l2)',
borderRadius: '8px',
padding: '16px'
}
},
nodes.map((n, idx) => {
const isOk = n.status === 'success';
const isFailed = n.status === 'failed';
const borderColor = isOk
? 'var(--dsh-cron-success)'
: isFailed
? 'var(--dsh-cron-danger)'
: 'var(--dsw-alias-border-l2)';
return _h('div', {
key: n.id || idx,
style: {
flex: '1 1 220px',
maxWidth: '260px',
background: 'var(--dsw-alias-bg-layer-1)',
border: '1px solid ' + borderColor,
borderRadius: '6px',
padding: '12px',
display: 'flex',
flexDirection: 'column',
gap: '8px',
boxShadow: isFailed ? '0 0 0 1px var(--dsh-cron-danger)' : 'none'
}
},
_h('div', {
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }
},
_h('div', {
style: { fontWeight: '600', fontSize: '13px', color: 'var(--dsw-alias-label-primary)' }
}, n.title || n.id),
_h('span', {
style: {
fontSize: '10px',
padding: '2px 6px',
borderRadius: '10px',
fontWeight: '600',
background: isOk ? 'var(--dsh-cron-success-bg)' : isFailed ? 'var(--dsh-cron-danger-bg)' : 'var(--dsw-alias-bg-layer-3)',
color: isOk ? 'var(--dsh-cron-success)' : isFailed ? 'var(--dsh-cron-danger)' : 'var(--dsw-alias-label-secondary)'
}
}, isOk ? '✓ ' + T_KEY(t, 'chainGraph.stepSuccess') : isFailed ? '✗ ' + T_KEY(t, 'chainGraph.stepFailed') : '⏳ ' + T_KEY(t, 'chainGraph.stepPending'))
),
_h('div', {
style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: '8px', flexWrap: 'wrap' }
},
n.durationMs > 0 && _h('span', null, n.durationMs + 'ms'),
n.retryCount > 0 && _h('span', { style: { color: 'var(--dsh-cron-warning)' } }, '↻ ' + n.retryCount),
n.joinPolicy && n.dependsOn?.length > 0 && _h('span', {
style: { background: 'var(--dsw-alias-bg-layer-3)', padding: '1px 4px', borderRadius: '4px' }
}, n.joinPolicy === 'any_success' ? 'join:any' : 'join:all')
),
n.isDecisionNode && _h('div', {
style: { fontSize: '11px', color: 'var(--dsh-cron-warning)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }
}, '🔀 ' + T_KEY(t, 'chainGraph.decisionNode') + ' (' + n.branchRulesCount + ')'),
n.dependsOn?.length > 0 && _h('div', {
style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' }
}, '← ' + n.dependsOn.join(', ')),
n.outputSnippet && _h('div', {
style: {
background: 'var(--dsw-alias-bg-layer-2)',
border: '1px solid var(--dsw-alias-border-l2)',
borderRadius: '4px',
padding: '6px',
fontSize: '11px',
color: 'var(--dsw-alias-label-secondary)',
fontFamily: 'monospace',
whiteSpace: 'pre-wrap',
wordBreak: 'break-all',
maxHeight: '60px',
overflowY: 'auto'
}
}, n.outputSnippet),
isFailed && chainRunId && _h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: {
marginTop: 'auto',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
gap: '6px',
fontSize: '12px',
padding: '6px 10px',
color: 'var(--dsh-cron-danger)',
borderColor: 'var(--dsh-cron-danger)'
},
onClick: () => onRetry && onRetry(n.id)
}, '🔄 ' + T_KEY(t, 'chainGraph.retryStep'))
);
})
)
)
),
_h('div', {
className: 'dsh-cron-modal-foot',
style: { borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: '12px', marginTop: 'auto' }
},
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
onClick: onClose
}, T_KEY(t, 'chainGraph.close'))
)
)
);
}
function renderLiveLogsModal({ isOpen, onClose, taskId, taskTitle, logs, autoScroll, onToggleAutoScroll, completed, status, t }) {
if (!isOpen) return null;
const terminalRef = (el) => {
if (el && autoScroll) {
el.scrollTop = el.scrollHeight;
}
};
const isLive = status === 'running' || status === 'connecting';
const statusColor = isLive ? 'var(--dsh-cron-success, #2a2)' : (status === 'completed' ? 'var(--dsw-alias-label-secondary, #888)' : 'var(--dsh-cron-danger, #e33)');
return _h('div', {
className: 'dsh-cron-modal-overlay',
onClick: onClose
},
_h('div', {
className: 'dsh-cron-modal',
style: { maxWidth: '860px', width: '92vw', height: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base, #111)', color: 'var(--dsw-alias-label-primary, #ddd)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '8px' },
role: 'dialog',
'aria-modal': 'true',
onClick: (e) => e.stopPropagation()
},
_h('div', {
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
},
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
_h('span', { style: { fontSize: '18px' } }, '📺'),
_h('div', null,
_h('div', { style: { fontWeight: '600', fontSize: '14px', color: 'var(--dsw-alias-label-primary, #fff)', display: 'flex', alignItems: 'center', gap: '8px' } },
T_KEY(t, 'liveLog.modalTitle'),
_h('span', {
style: {
display: 'inline-block',
width: '8px',
height: '8px',
borderRadius: '50%',
background: statusColor,
boxShadow: isLive ? '0 0 8px ' + statusColor : 'none'
}
})
),
_h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px', fontFamily: 'monospace' } },
(taskTitle || taskId) + ' · ' + (isLive ? T_KEY(t, 'liveLog.connecting') : (completed ? T_KEY(t, 'liveLog.completed') : status))
)
)
),
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
_h('label', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' } },
_h('input', {
type: 'checkbox',
checked: Boolean(autoScroll),
onChange: onToggleAutoScroll,
style: { cursor: 'pointer' }
}),
T_KEY(t, 'liveLog.autoScroll')
),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
style: { color: 'var(--dsw-alias-label-secondary, #888)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' },
onClick: onClose
}, '✕')
)
),
_h('div', {
ref: terminalRef,
style: { flex: 1, overflowY: 'auto', padding: '14px 16px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', lineHeight: '1.5', background: 'var(--dsw-alias-bg-base, #000)' }
},
(!logs || logs.length === 0) && _h('div', {
style: { color: 'var(--dsw-alias-label-secondary, #888)', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }
}, isLive ? T_KEY(t, 'liveLog.waiting') : 'No output captured for this run.'),
logs && logs.length > 0 && logs.map((item, idx) => {
const isErr = item.stream === 'stderr';
const timeStr = item.ts ? new Date(item.ts).toLocaleTimeString() : '';
return _h('div', {
key: idx,
style: { display: 'flex', gap: '8px', color: isErr ? 'var(--dsh-cron-danger, #f55)' : 'var(--dsh-cron-success, #5f5)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }
},
timeStr && _h('span', { style: { color: 'var(--dsw-alias-label-secondary, #555)', userSelect: 'none', flexShrink: 0 } }, '[' + timeStr + ']'),
_h('span', { style: { flex: 1 } }, item.chunk || item.text || String(item))
);
})
),
_h('div', {
style: { display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
},
_h('button', {
type: 'button',
className: 'dsh-cron-btn dsh-cron-btn-secondary',
style: { padding: '6px 14px', fontSize: '12px' },
onClick: onClose
}, T_KEY(t, 'liveLog.close'))
)
)
);
}
function renderAnalyticsDigestModal({ isOpen, onClose, digestData, isLoading, periodDays, onSelectPeriod, onSendTelegram, sendStatus, t }) {
if (!isOpen) return null;
const digest = digestData || {
totalRuns: 0,
successfulRuns: 0,
failedRuns: 0,
successRate: 100,
totalTokens: 0,
totalCostUsd: 0,
healedCount: 0,
activeTasksCount: 0,
pausedTasksCount: 0,
topUnstableTasks: [],
topExpensiveTasks: []
};
const copyMarkdown = () => {
if (!digestData) return;
const text = [
'# ' + (T_KEY(t, 'digest.modalTitle')),
'Period: Last ' + (periodDays || 7) + ' days',
'Total Runs: ' + digest.totalRuns + ' (' + digest.successRate + '% SR)',
'Tokens: ' + digest.totalTokens + ' (~$' + digest.totalCostUsd + ' USD)',
'Active Tasks: ' + digest.activeTasksCount + ' active / ' + digest.pausedTasksCount + ' paused'
].join(String.fromCharCode(10));
navigator.clipboard.writeText(text).catch(() => {});
};
return _h('div', {
className: 'dsh-cron-modal-overlay',
onClick: onClose
},
_h('div', {
className: 'dsh-cron-modal',
style: { maxWidth: '780px', width: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base, #111)', color: 'var(--dsw-alias-label-primary, #ddd)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '8px' },
role: 'dialog',
'aria-modal': 'true',
onClick: (e) => e.stopPropagation()
},
_h('div', {
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
},
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
_h('span', { style: { fontSize: '20px' } }, '📊'),
_h('div', null,
_h('div', { style: { fontWeight: '600', fontSize: '15px', color: 'var(--dsw-alias-label-primary, #fff)' } },
T_KEY(t, 'digest.modalTitle')
),
_h('div', { style: { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } },
(T_KEY(t, 'digest.buttonTitle')) + ' · ' + (periodDays || 7) + 'd'
)
)
),
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '4px 10px', fontSize: '12px', fontWeight: periodDays === 7 ? '600' : '400', background: periodDays === 7 ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
onClick: () => onSelectPeriod && onSelectPeriod(7)
}, T_KEY(t, 'digest.period7')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '4px 10px', fontSize: '12px', fontWeight: periodDays === 30 ? '600' : '400', background: periodDays === 30 ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
onClick: () => onSelectPeriod && onSelectPeriod(30)
}, T_KEY(t, 'digest.period30')),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
onClick: onClose,
style: { marginLeft: '8px' }
}, _h('span', null, '✕'))
)
),
_h('div', {
style: { padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }
},
isLoading ? _h('div', { style: { padding: '30px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'Loading digest metrics...') : _h(React.Fragment, null,
(() => {
const renderKpi = (label, val, sub, subCol) => _h('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '10px 12px' } },
_h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)' } }, label),
_h('div', { style: { fontSize: '18px', fontWeight: '700', color: 'var(--dsw-alias-label-primary, #fff)', marginTop: '4px' } }, val),
_h('div', { style: { fontSize: '11px', color: subCol || 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } }, sub)
);
return _h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' } },
renderKpi(T_KEY(t, 'digest.executions'), digest.totalRuns, digest.successRate + '% SR', digest.successRate >= 90 ? 'var(--dsh-cron-success, #2a2)' : 'var(--dsh-cron-warning, #fa0)'),
renderKpi(T_KEY(t, 'digest.tokens'), Number(digest.totalTokens || 0).toLocaleString(), 'LLM prompt+out'),
renderKpi(T_KEY(t, 'digest.cost'), '$' + Number(digest.totalCostUsd || 0).toFixed(4), 'USD estimated'),
renderKpi(T_KEY(t, 'digest.fleet'), digest.activeTasksCount, digest.pausedTasksCount + ' paused')
);
})(),
_h('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '12px' } },
_h('div', { style: { fontWeight: '600', fontSize: '13px', color: 'var(--dsh-cron-warning, #fa0)', marginBottom: '8px' } },
'⚠️ ' + (T_KEY(t, 'digest.unstableTitle'))
),
(digest.topUnstableTasks && digest.topUnstableTasks.length > 0) ? _h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
digest.topUnstableTasks.map((tItem, idx) => _h('div', {
key: tItem.id || idx,
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', background: 'var(--dsw-alias-bg-base, #111)', borderRadius: '4px', border: '1px solid var(--dsw-alias-border-l2, #222)' }
},
_h('span', { style: { fontFamily: 'monospace' } }, (idx + 1) + '. ' + (tItem.name || tItem.id)),
_h('span', { style: { color: 'var(--dsh-cron-danger, #e33)', fontWeight: '600' } },
tItem.failures + ' fail (' + tItem.successRate + '% SR)'
)
))
) : _h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)' } }, '✓ All tasks healthy — 0 failures in window!')
),
_h('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '12px' } },
_h('div', { style: { fontWeight: '600', fontSize: '13px', color: 'var(--dsh-cron-info, #4af)', marginBottom: '8px' } },
'💰 ' + (T_KEY(t, 'digest.expensiveTitle'))
),
(digest.topExpensiveTasks && digest.topExpensiveTasks.length > 0) ? _h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
digest.topExpensiveTasks.map((tItem, idx) => _h('div', {
key: tItem.id || idx,
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', background: 'var(--dsw-alias-bg-base, #111)', borderRadius: '4px', border: '1px solid var(--dsw-alias-border-l2, #222)' }
},
_h('span', { style: { fontFamily: 'monospace' } }, (idx + 1) + '. ' + (tItem.name || tItem.id)),
_h('span', { style: { color: 'var(--dsw-alias-label-primary, #ddd)' } },
Number(tItem.tokens || 0).toLocaleString() + ' tok ($' + Number(tItem.costUsd || 0).toFixed(4) + ')'
)
))
) : _h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'No significant token consumption recorded.')
)
)
),
_h('div', {
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
},
_h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)' } },
sendStatus || ''
),
_h('div', { style: { display: 'flex', gap: '8px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: copyMarkdown,
style: { padding: '6px 14px', fontSize: '12px' }
}, T_KEY(t, 'digest.copyMarkdown')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
onClick: onSendTelegram,
style: { padding: '6px 14px', fontSize: '12px' }
}, T_KEY(t, 'digest.sendTelegram'))
)
)
)
);
}
function renderTimelineHeatmapModal({
isOpen,
onClose,
activeTab,
onSelectTab,
timelineData,
heatmapData,
isLoading,
t
}) {
if (!isOpen) return null;
const tab = activeTab || 'timeline';
const timeline = timelineData || { buckets: [], totalRuns: 0, peakHoursCount: 0, maxConcurrent: 3 };
const heatmap = heatmapData || { matrix: [], dayLabels: [], hourLabels: [], totalCostUsd: 0, totalTokens: 0, maxCostHour: 0 };
return _h('div', {
className: 'dsh-cron-modal-overlay',
onClick: onClose
},
_h('div', {
className: 'dsh-cron-modal',
style: { maxWidth: '960px', width: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base, #111)', color: 'var(--dsw-alias-label-primary, #ddd)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '8px' },
role: 'dialog',
'aria-modal': 'true',
onClick: (e) => e.stopPropagation()
},
_h('div', {
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
},
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
_h('span', { style: { fontSize: '20px' } }, tab === 'timeline' ? '⏱' : '🔥'),
_h('div', null,
_h('div', { style: { fontWeight: '600', fontSize: '15px', color: 'var(--dsw-alias-label-primary, #fff)' } },
tab === 'timeline' ? (T_KEY(t, 'timeline.modalTitle')) : (T_KEY(t, 'heatmap.modalTitle'))
),
_h('div', { style: { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } },
tab === 'timeline'
? (timeline.totalRuns + ' runs projected · ' + (timeline.peakHoursCount ? '⚠️ ' + timeline.peakHoursCount + ' peak hours' : '✓ balanced concurrency'))
: ('$' + Number(heatmap.totalCostUsd || 0).toFixed(4) + ' USD · ' + Number(heatmap.totalTokens || 0).toLocaleString() + ' tokens')
)
)
),
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '4px 12px', fontSize: '12px', fontWeight: tab === 'timeline' ? '600' : '400', background: tab === 'timeline' ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
onClick: () => onSelectTab && onSelectTab('timeline')
}, '⏱ ' + (T_KEY(t, 'timeline.tabTimeline'))),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '4px 12px', fontSize: '12px', fontWeight: tab === 'heatmap' ? '600' : '400', background: tab === 'heatmap' ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
onClick: () => onSelectTab && onSelectTab('heatmap')
}, '🔥 ' + (T_KEY(t, 'heatmap.tabHeatmap'))),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
onClick: onClose,
style: { marginLeft: '8px' }
}, _h('span', null, '✕'))
)
),
_h('div', {
style: { padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }
},
isLoading ? _h('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'Loading visualization data...') : (
tab === 'timeline' ? (
_h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
_h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)', display: 'flex', justifyContent: 'space-between' } },
_h('span', null, T_KEY(t, 'timeline.legendDesc')),
_h('span', { style: { color: 'var(--dsh-cron-warning, #fa0)' } }, '⚠️ ' + (T_KEY(t, 'timeline.peakWarning')) + ' (' + timeline.maxConcurrent + ')')
),
_h('div', {
style: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '8px', marginTop: '6px' }
},
(timeline.buckets || []).map((b) => {
const isPeak = b.isPeak, hasRuns = b.count > 0;
return _h('div', {
key: b.index,
style: {
background: isPeak ? 'color-mix(in srgb, var(--dsh-cron-danger, #e33) 12%, var(--dsw-alias-bg-layer-2, #111))' : (hasRuns ? 'var(--dsw-alias-bg-layer-2, #111)' : 'var(--dsw-alias-bg-base, #111)'),
border: isPeak ? '1px solid var(--dsh-cron-danger, #e33)' : (hasRuns ? '1px solid var(--dsw-alias-border-l2, #333)' : '1px dashed var(--dsw-alias-border-l2, #222)'),
borderRadius: '6px', padding: '8px', minHeight: '75px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
}
},
_h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' } },
_h('span', { style: { fontWeight: '600', color: isPeak ? 'var(--dsh-cron-danger, #e33)' : 'var(--dsw-alias-label-primary, #fff)' } }, b.label),
hasRuns ? _h('span', { style: { fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: isPeak ? 'var(--dsh-cron-danger, #e33)' : 'var(--dsw-alias-bg-layer-3, #222)', color: '#fff' } }, b.count) : null
),
_h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' } },
(b.runs || []).slice(0, 3).map((r, rIdx) => _h('span', {
key: rIdx, title: (r.title || r.taskId) + ' (' + r.time + ')',
style: { fontSize: '9.5px', fontFamily: 'monospace', padding: '1px 4px', borderRadius: '3px', background: 'var(--dsw-alias-bg-base, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
}, r.title || r.taskId))
)
);
})
)
)
) : (
_h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
_h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)', display: 'flex', justifyContent: 'space-between' } },
_h('span', null, T_KEY(t, 'heatmap.matrixDesc')),
_h('span', null, 'Max hour spend: $' + Number(heatmap.maxCostHour || 0).toFixed(4))
),
_h('div', {
style: { overflowX: 'auto', paddingBottom: '8px' }
},
_h('table', {
style: { borderCollapse: 'collapse', width: '100%', minWidth: '700px', fontSize: '10.5px' }
},
_h('thead', null,
_h('tr', null,
_h('th', { style: { padding: '4px 6px', textAlign: 'left', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'Day'),
Array.from({ length: 24 }, (_, hour) => _h('th', {
key: hour,
style: { padding: '4px 2px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #888)', fontWeight: '400' }
}, String(hour).padStart(2, '0')))
)
),
_h('tbody', null,
(heatmap.matrix || []).map((row, dIdx) => _h('tr', { key: dIdx },
_h('td', { style: { padding: '4px 6px', fontWeight: '600', color: 'var(--dsw-alias-label-primary, #ddd)' } }, (heatmap.dayLabels && heatmap.dayLabels[dIdx]) || 'Day'),
row.map((cell, hIdx) => {
const intensity = cell.costIntensity || 0;
const hasSpend = cell.costUsd > 0;
const bg = hasSpend
? 'color-mix(in srgb, var(--dsh-cron-primary, #4af) ' + Math.max(15, Math.round(intensity * 100)) + '%, transparent)'
: 'transparent';
return _h('td', {
key: hIdx,
title: cell.dayLabel + ' ' + cell.hourLabel + ': $' + cell.costUsd + ' (' + cell.tokens.toLocaleString() + ' tokens, ' + cell.runs + ' runs)',
style: {
padding: '3px',
textAlign: 'center',
background: bg,
border: '1px solid var(--dsw-alias-border-l2, #222)',
cursor: hasSpend ? 'pointer' : 'default'
}
}, hasSpend ? _h('span', { style: { fontSize: '9px', color: intensity > 0.5 ? '#fff' : 'var(--dsw-alias-label-primary, #ddd)' } }, '$' + (cell.costUsd >= 0.01 ? cell.costUsd.toFixed(2) : cell.costUsd.toFixed(3).slice(1))) : '·');
})
))
)
)
)
)
)
)
),
_h('div', {
style: { display: 'flex', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
},
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: onClose,
style: { padding: '6px 16px', fontSize: '12px' }
}, T_KEY(t, 'chainGraph.close'))
)
)
);
}
function CronScreen(props) {
const { ctx, toggle, onClose } = props;
const t = props.t || translate;
const [isOpen, setIsOpen] = React.useState(toggle && typeof toggle.isOpen === 'function' ? toggle.isOpen() : true);
React.useEffect(() => {
if (!toggle || typeof toggle.subscribe !== 'function') return;
return toggle.subscribe((val) => setIsOpen(val));
}, [toggle]);
if (!isOpen) return null;
const [tab, setTab] = React.useState('all');
const [query, setQuery] = React.useState('');
const [filterType, setFilterType] = React.useState('');
const [filterModel, setFilterModel] = React.useState('');
const [filterChannel, setFilterChannel] = React.useState('');
const [filtersOpen, setFiltersOpen] = React.useState(false);
const [tasks, setTasks] = React.useState([]);
const [recs, setRecs] = React.useState([]);
const [loading, setLoading] = React.useState(false);
const [fetchError, setFetchError] = React.useState(null);
const [dropdownOpen, setDropdownOpen] = React.useState(false);
const [transferBusy, setTransferBusy] = React.useState(false);
const [importDoc, setImportDoc] = React.useState(null);
const [importSummary, setImportSummary] = React.useState(null);
const [importStrategy, setImportStrategy] = React.useState('skip');
const importFileRef = React.useRef(null);
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
const [formRequireApproval, setFormRequireApproval] = React.useState(false);
const [formDelivery, setFormDelivery] = React.useState('isolated');
const [selectedTaskMeta, setSelectedTaskMeta] = React.useState(null);
const [modalTab, setModalTab] = React.useState('params');
const [taskHistory, setTaskHistory] = React.useState([]);
const [historyLoading, setHistoryLoading] = React.useState(false);
const [retryingDeliveryId, setRetryingDeliveryId] = React.useState(null);
const [formNotifyTelegram, setFormNotifyTelegram] = React.useState(false);
const [formChannels, setFormChannels] = React.useState([]);
const [formTemplate, setFormTemplate] = React.useState('');
const [formOnlyOnFailure, setFormOnlyOnFailure] = React.useState(false);
const [formTimeoutSeconds, setFormTimeoutSeconds] = React.useState(1800);
const [formOverlapPolicy, setFormOverlapPolicy] = React.useState('skip');
const [formKanbanMode, setFormKanbanMode] = React.useState('none');
const [formOnSuccess, setFormOnSuccess] = React.useState('');
const [formOnFailure, setFormOnFailure] = React.useState('');
const [formDependsOn, setFormDependsOn] = React.useState('');
const [formJoinPolicy, setFormJoinPolicy] = React.useState('all_success');
const [formElseTask, setFormElseTask] = React.useState('');
const [formAutoHeal, setFormAutoHeal] = React.useState(false);
const [formAdaptiveEnabled, setFormAdaptiveEnabled] = React.useState(false);
const [formAdaptiveMinInterval, setFormAdaptiveMinInterval] = React.useState('5m');
const [formAdaptiveMaxInterval, setFormAdaptiveMaxInterval] = React.useState('2h');
const [formAdaptiveBackoffFactor, setFormAdaptiveBackoffFactor] = React.useState('1.5');
const [formAdaptiveIdleThreshold, setFormAdaptiveIdleThreshold] = React.useState('3');
const [liveLogsModalOpen, setLiveLogsModalOpen] = React.useState(false);
const [liveLogsTaskId, setLiveLogsTaskId] = React.useState('');
const [liveLogsTaskTitle, setLiveLogsTaskTitle] = React.useState('');
const [liveLogsLines, setLiveLogsLines] = React.useState([]);
const [liveLogsStatus, setLiveLogsStatus] = React.useState('idle');
const [liveLogsCompleted, setLiveLogsCompleted] = React.useState(false);
const [liveLogsAutoScroll, setLiveLogsAutoScroll] = React.useState(true);
const [chainGraphModalOpen, setChainGraphModalOpen] = React.useState(false);
const [chainGraphData, setChainGraphData] = React.useState(null);
const [chainGraphLoading, setChainGraphLoading] = React.useState(false);
const [chainGraphRunId, setChainGraphRunId] = React.useState(null);
const [digestOpen, setDigestOpen] = React.useState(false);
const [digestData, setDigestData] = React.useState(null);
const [digestMarkdown, setDigestMarkdown] = React.useState('');
const [digestLoading, setDigestLoading] = React.useState(false);
const [periodDays, setPeriodDays] = React.useState(7);
const [sendStatus, setSendStatus] = React.useState(null);
const [timelineOpen, setTimelineOpen] = React.useState(false);
const [timelineData, setTimelineData] = React.useState(null);
const [heatmapData, setHeatmapData] = React.useState(null);
const [timelineLoading, setTimelineLoading] = React.useState(false);
const [timelineTab, setTimelineTab] = React.useState('timeline');
const [formHeartbeatIntervalSeconds, setFormHeartbeatIntervalSeconds] = React.useState(0);
const [formGracePeriodSeconds, setFormGracePeriodSeconds] = React.useState(300);
const [formPreflightType, setFormPreflightType] = React.useState('none');
const [formPreflightTarget, setFormPreflightTarget] = React.useState('');
const [formPriority, setFormPriority] = React.useState(5);
const [formConcurrencyGroup, setFormConcurrencyGroup] = React.useState('default');
const [formSelfHealingCommand, setFormSelfHealingCommand] = React.useState('');
const [formAutoDiagnose, setFormAutoDiagnose] = React.useState(false);
const [schedulePreviewRuns, setSchedulePreviewRuns] = React.useState(null);
const [dryRunResult, setDryRunResult] = React.useState(null);
const [archiveModalOpen, setArchiveModalOpen] = React.useState(false);
const [archiveTask, setArchiveTask] = React.useState(null);
const [archiveRuns, setArchiveRuns] = React.useState([]);
const [archiveLoading, setArchiveLoading] = React.useState(false);
const [archiveOffset, setArchiveOffset] = React.useState(0);
const [archiveTotal, setArchiveTotal] = React.useState(0);
const [formTimezone, setFormTimezone] = React.useState('');
const [formMisfirePolicy, setFormMisfirePolicy] = React.useState('skip');
const [formMaxRetries, setFormMaxRetries] = React.useState(0);
const [formPermissionPreset, setFormPermissionPreset] = React.useState('default');
const [formAgentPreset, setFormAgentPreset] = React.useState('');
const [formSessionTitle, setFormSessionTitle] = React.useState('');
const [formTargetSessionId, setFormTargetSessionId] = React.useState('');
const [formTargetSessionReset, setFormTargetSessionReset] = React.useState('never');
const [formEnv, setFormEnv] = React.useState('');
const [formCwd, setFormCwd] = React.useState('');
const [formWorkspaceId, setFormWorkspaceId] = React.useState('');
const [formWorktree, setFormWorktree] = React.useState(false);
const [formKeepWorktree, setFormKeepWorktree] = React.useState(false);
const [formCaptureGitDiff, setFormCaptureGitDiff] = React.useState(false);
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
const initialFormSnapshotRef = React.useRef(null);
const getFormSnapshot = () => JSON.stringify({
title: String(formTitle || '').trim(),
schedule: String(formSchedule || '').trim(),
type: String(formType || 'llm'),
prompt: String(formPrompt || '').trim(),
provider: String(formProvider || ''),
model: String(formModel || ''),
fallbackModel: String(formFallbackModel || ''),
silentRule: String(formSilentRule || ''),
inspectOnFailure: Boolean(formInspectOnFailure),
requireApproval: Boolean(formRequireApproval),
delivery: String(formDelivery || 'isolated'),
notifyTelegram: Boolean(formNotifyTelegram),
channels: Array.isArray(formChannels) ? [...formChannels].sort() : [],
template: String(formTemplate || '').trim(),
onlyOnFailure: Boolean(formOnlyOnFailure),
timeoutSeconds: Number(formTimeoutSeconds) || 1800,
overlapPolicy: String(formOverlapPolicy || 'skip'),
kanbanMode: String(formKanbanMode || 'none'),
onSuccess: String(formOnSuccess || '').trim(),
onFailure: String(formOnFailure || '').trim(),
heartbeatIntervalSeconds: Number(formHeartbeatIntervalSeconds) || 0,
gracePeriodSeconds: Number(formGracePeriodSeconds) || 300,
preflightType: String(formPreflightType || 'none'),
preflightTarget: String(formPreflightTarget || '').trim(),
priority: Number(formPriority) || 5,
concurrencyGroup: String(formConcurrencyGroup || 'default').trim(),
selfHealingCommand: String(formSelfHealingCommand || '').trim(),
autoDiagnose: Boolean(formAutoDiagnose),
timezone: String(formTimezone || '').trim(),
misfirePolicy: String(formMisfirePolicy || 'skip'),
maxRetries: Number(formMaxRetries) || 0,
permissionPreset: String(formPermissionPreset || 'default'),
agentPreset: String(formAgentPreset || '').trim(),
targetSessionId: String(formTargetSessionId || '').trim(),
targetSessionReset: String(formTargetSessionReset || 'never'),
env: String(formEnv || '').trim(),
cwd: String(formCwd || '').trim(),
workspaceId: String(formWorkspaceId || '').trim(),
worktree: Boolean(formWorktree),
keepWorktree: Boolean(formKeepWorktree),
captureGitDiff: Boolean(formCaptureGitDiff),
httpMethod: String(formHttpMethod || 'GET'),
httpUrl: String(formHttpUrl || '').trim(),
httpHttpHeaders: String(formHttpHeaders || '').trim(),
httpBody: String(formHttpBody || '').trim(),
sshProfileId: String(formSshProfileId || '').trim(),
sshTarget: String(formSshTarget || '').trim(),
sshKeyPath: String(formSshKeyPath || '').trim(),
dockerImage: String(formDockerImage || '').trim(),
nodePath: String(formNodePath || '').trim(),
pythonPath: String(formPythonPath || '').trim(),
skillName: String(formSkillName || '').trim(),
workflowName: String(formWorkflowName || '').trim(),
});
const isFormDirty = () => {
if (!manualModalOpen) return false;
if (initialFormSnapshotRef.current !== null) {
return getFormSnapshot() !== initialFormSnapshotRef.current;
}
return Boolean(formTitle.trim() || formPrompt.trim());
};
const closeManualModalWithConfirm = () => {
if (isFormDirty()) {
if (!confirm(T_KEY(t, 'modal.confirmDiscard') || 'Discard unsaved changes?')) {
return;
}
}
initialFormSnapshotRef.current = null;
setManualModalOpen(false);
};
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
const [dshModalOpen, setDshModalOpen] = React.useState(false);
const [dshPrompt, setDshPrompt] = React.useState('');
const [dshLoading, setDshLoading] = React.useState(false);
const [providers, setProviders] = React.useState([]);
const [models, setModels] = React.useState([]);
const [defaultModelInfo, setDefaultModelInfo] = React.useState(null);
React.useEffect(() => {
const onKey = (e) => {
if (e.key === 'Escape') {
if (dropdownOpen) { setDropdownOpen(false); return; }
if (manualModalOpen) { closeManualModalWithConfirm(); return; }
if (settingsModalOpen) { setSettingsModalOpen(false); return; }
if (dshModalOpen && !dshLoading) { setDshModalOpen(false); return; }
if (onClose) onClose();
else toggle.set(false);
}
};
window.addEventListener('keydown', onKey);
return () => window.removeEventListener('keydown', onKey);
}, [manualModalOpen, settingsModalOpen, dshModalOpen, dropdownOpen, onClose]);
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
React.useEffect(() => {
if (!pendingTaskHighlight || tasks.length === 0) return;
const id = pendingTaskHighlight;
pendingTaskHighlight = null;
const node = document.querySelector('[data-task-id="' + id + '"]');
if (!node) return;
if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center' });
node.classList.add('dsh-cron-task-highlight');
setTimeout(() => { try { node.classList.remove('dsh-cron-task-highlight'); } catch (err) { /* node unmounted */ } }, 2500);
}, [tasks]);
const fetchGenRef = React.useRef(0);
const fetchTasks = async () => {
const gen = ++fetchGenRef.current;
setLoading(true);
setFetchError(null);
const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
try {
const res = await fetch('/dsh-cron/tasks?status=' + encodeURIComponent(tab) + '&query=' + encodeURIComponent(query), {
signal: controller ? controller.signal : undefined,
});
const data = await res.json();
if (gen !== fetchGenRef.current) return;
if (data && data.ok) {
setTasks(data.tasks || []);
setRecs(data.recommendations || []);
setStats(data.stats || null);
} else {
setFetchError(data && data.error ? data.error : T_KEY(t, 'list.loadErrorPrefix'));
}
} catch (err) {
if (gen !== fetchGenRef.current) return;
console.error('[dsh-cron] fetch tasks error:', err);
setFetchError(err.message || T_KEY(t, 'list.loadErrorPrefix'));
} finally {
if (timer) clearTimeout(timer);
if (gen === fetchGenRef.current) {
setLoading(false);
}
}
};
const loadModels = async (providerName) => {
const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
try {
const url = providerName ? '/dsh-cron/models?provider=' + encodeURIComponent(providerName) : '/dsh-cron/models';
const res = await fetch(url, { signal: controller ? controller.signal : undefined });
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
} finally {
if (timer) clearTimeout(timer);
}
};
const lastEtagRef = React.useRef('');
React.useEffect(() => {
fetchTasks();
let timerId = null;
let isDestroyed = false;
let pollController = null;
const doPoll = () => {
if (isDestroyed) return;
const pollGen = ++fetchGenRef.current;
const headers = {};
if (lastEtagRef.current) headers['If-None-Match'] = lastEtagRef.current;
if (pollController) pollController.abort();
pollController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
const fetchOpts = { headers };
if (pollController) fetchOpts.signal = pollController.signal;
const pollTimer = pollController ? setTimeout(() => { try { pollController.abort(); } catch (abortErr) { void abortErr; } }, 15000) : null;
fetch('/dsh-cron/tasks?status=' + encodeURIComponent(tab) + '&query=' + encodeURIComponent(query), fetchOpts)
.then(res => {
if (isDestroyed || pollGen !== fetchGenRef.current) return null;
if (res.status === 304) {
return null;
}
const etag = res.headers.get('ETag');
if (etag) lastEtagRef.current = etag;
return res.json();
})
.then(data => {
if (isDestroyed || pollGen !== fetchGenRef.current) return;
if (data && data.ok) {
setTasks(data.tasks || []);
setRecs(data.recommendations || []);
setStats(data.stats || null);
}
})
.catch(err => {
if (err && err.name === 'AbortError') return;
})
.finally(() => {
if (pollTimer) clearTimeout(pollTimer);
if (isDestroyed) return;
const intervalMs = (typeof document !== 'undefined' && document.hidden) ? 30000 : 8000;
timerId = setTimeout(doPoll, intervalMs);
});
};
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
if (pollController) pollController.abort();
if (typeof document !== 'undefined') {
document.removeEventListener('visibilitychange', onVisibilityChange);
}
};
}, [tab, query]);
React.useEffect(() => { loadModels(); }, []);
const actionInProgressRef = React.useRef(new Set());
const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
if (options && options.signal && controller) {
if (options.signal.aborted) {
controller.abort();
} else {
options.signal.addEventListener('abort', () => controller.abort(), { once: true });
}
}
try {
const res = await fetch(url, {
...options,
signal: controller ? controller.signal : (options ? options.signal : undefined),
});
let data = {};
try {
data = await res.json();
} catch (jsonErr) {
if (jsonErr && (jsonErr.name === 'AbortError' || controller?.signal.aborted)) {
throw jsonErr;
}
}
return { res, data };
} catch (err) {
if (err && (err.name === 'AbortError' || controller?.signal.aborted)) {
const timeoutErr = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
timeoutErr.isTimeout = true;
throw timeoutErr;
}
throw err;
} finally {
if (timer) clearTimeout(timer);
}
};
const fetchWithTimeout = fetchJsonWithTimeout;
const handleToggleTask = async (id) => {
if (actionInProgressRef.current.has(id)) return;
actionInProgressRef.current.add(id);
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(id) + '/toggle', { method: 'POST' }, 15000);
if (!res.ok || (data && data.ok === false)) {
const msg = (data && data.error) || `Toggle failed (HTTP ${res.status})`;
alert(msg);
return;
}
await fetchTasks();
} catch (err) {
console.error('[dsh-cron] toggle failed', err);
alert('Toggle request failed: ' + err.message);
} finally {
actionInProgressRef.current.delete(id);
}
};
const handleRunNow = async (id) => {
if (actionInProgressRef.current.has(id)) return;
actionInProgressRef.current.add(id);
const prevTask = tasks.find(t => t.id === id);
const prevStatus = prevTask ? prevTask.lastStatus : null;
setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, lastStatus: 'running' } : t2));
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(id) + '/run', { method: 'POST' }, 15000);
if (!res.ok || (data && data.ok === false)) {
setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, lastStatus: prevStatus } : t2));
const msg = (data && data.error) || `Run failed (HTTP ${res.status})`;
alert(msg);
return;
}
setTimeout(() => fetchTasks(), 1500);
} catch (err) {
console.error('[dsh-cron] run now error:', err);
setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, lastStatus: prevStatus } : t2));
alert('Run request failed: ' + err.message);
} finally {
actionInProgressRef.current.delete(id);
}
};
const handleDryRun = async (taskId) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/dry-run', { method: 'POST' });
setDryRunResult(data);
} catch (err) {
alert('Dry run error: ' + err.message);
}
};
const openArchiveModal = async (task, offset = 0) => {
setArchiveTask(task);
setArchiveOffset(offset);
setArchiveLoading(true);
setArchiveModalOpen(true);
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/archive?limit=15&offset=' + offset);
if (data.ok) {
setArchiveRuns(prev => offset === 0 ? (data.runs || []) : [...prev, ...(data.runs || [])]);
setArchiveTotal(data.total || 0);
}
} catch (err) {
console.error('[dsh-cron] archive load error:', err);
} finally {
setArchiveLoading(false);
}
};
const handlePreviewSchedule = async (scheduleExpr) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/schedule/preview', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ schedule: scheduleExpr, timezone: formTimezone })
});
if (data.ok && data.runs) {
setSchedulePreviewRuns(data.runs);
} else {
setSchedulePreviewRuns([]);
}
} catch {
setSchedulePreviewRuns([]);
}
};
const handleDuplicate = async (task) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/duplicate', { method: 'POST' });
if (!data.ok) {
alert(T_KEY(t, 'duplicate.failed', { error: (data && data.error) || '' }));
return;
}
await fetchTasks();
alert(task.oneShot ? T_KEY(t, 'duplicate.oneShotHint') : T_KEY(t, 'duplicate.done'));
} catch (err) {
alert(T_KEY(t, 'duplicate.failed', { error: err.message }));
}
};
const RESERVED_TASK_IDS = ['export', 'import'];
const isCodeTaskForm = (x) => {
if (!x || typeof x !== 'object') return false;
if (CODE_FORM_TYPES.includes(x.type)) return true;
if (x.command && String(x.command).trim()) return true;
if (x.preflightType === 'command' || (x.preflightCommand && String(x.preflightCommand).trim())) return true;
if (x.selfHealingCommand && String(x.selfHealingCommand).trim()) return true;
return false;
};
const importHeaders = (document_) => {
const headers = { 'Content-Type': 'application/json' };
const tasks = (document_ && Array.isArray(document_.tasks)) ? document_.tasks : [];
if (tasks.some(isCodeTaskForm)) headers[SCRIPT_CONFIRM_HEADER] = 'script';
return headers;
};
const handleExport = async () => {
setTransferBusy(true);
try {
const promptMsg = T_KEY(t, 'transfer.exportPrompt') || 'Choose export mode:\nOK = Sanitized (removes custom env vars & headers)\nCancel = Full raw export';
const wantSanitized = confirm(promptMsg);
const exportUrl = '/dsh-cron/tasks/export' + (wantSanitized ? '?sanitize=true' : '');
const { res, data } = await fetchJsonWithTimeout(exportUrl);
if (!data.ok) {
alert(T_KEY(t, 'transfer.exportFailed', { error: (data && data.error) || '' }));
return;
}
const blob = new Blob([JSON.stringify(data.document, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const anchor = document.createElement('a');
anchor.href = url;
anchor.download = `dsh-cron-tasks-${stamp}${data.sanitized ? '-sanitized' : ''}.json`;
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
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/import', {
method: 'POST',
headers: importHeaders(document_),
body: JSON.stringify({ document: document_, dryRun: true, strategy: importStrategy })
});
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
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/import', {
method: 'POST',
headers: importHeaders(importDoc),
body: JSON.stringify({ document: importDoc, strategy: importStrategy })
});
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
'Ask what should change, then apply it with the cron tool (action: "update", or action: "get" if you need the full configuration).',
'If the change makes the task execute code (script/node/python/ssh/docker), confirm it with me explicitly before applying it.',
].filter(Boolean);
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/chat/start', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ prompt: lines.join(String.fromCharCode(10)) })
});
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
const handleApproveProposal = async (taskId, proposalId) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/approve', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ proposalId, decidedBy: 'web-user' })
});
if (data && data.ok) {
alert(T_KEY(t, 'approval.approved') || 'Approved');
setTimeout(() => fetchTasks(), 1000);
} else {
alert('Approval failed: ' + ((data && data.error) || ''));
}
} catch (err) {
alert('Approval request failed: ' + err.message);
}
};
const handleRejectProposal = async (taskId, proposalId) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/reject', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ proposalId, decidedBy: 'web-user' })
});
if (data && data.ok) {
alert(T_KEY(t, 'approval.rejected') || 'Rejected');
setTimeout(() => fetchTasks(), 1000);
} else {
alert('Rejection failed: ' + ((data && data.error) || ''));
}
} catch (err) {
alert('Rejection request failed: ' + err.message);
}
};
const handleDelete = async (id) => {
if (!confirm(T_KEY(t, 'confirm.delete'))) return;
try {
await fetchWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
fetchTasks();
} catch (err) {
console.debug('[dsh-cron] delete failed', err);
}
};
const openSettingsModal = async () => {
setTestStatus(null);
setSettingsModalOpen(true);
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/settings');
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
} catch (err) {
console.debug('[dsh-cron] settings fetch failed', err);
}
};
const handleSaveSettings = async (e) => {
e.preventDefault();
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/settings', {
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
if (data && data.ok) {
setSettingsModalOpen(false);
} else {
alert(T_KEY(t, 'settings.saveError', { error: (data && data.error) || T_KEY(t, 'settings.saveErrorUnknown') }));
}
} catch (err) {
alert(T_KEY(t, 'settings.saveError', { error: err.message }));
}
};
const updateDelivery = (key, value) => {
setSettingsDelivery((prev) => {
const next = Object.assign({}, prev);
if (value === undefined) delete next[key];
else next[key] = value;
return next;
});
};
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
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/telegram/test', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
botToken: settingsBotToken,
chatId: settingsChatId
})
});
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
setFormAgentPreset('');
setFormTargetSessionId('');
setFormTargetSessionReset('never');
setFormEnv('');
setFormCwd('');
setFormWorkspaceId('');
setFormWorktree(false);
setFormKeepWorktree(false);
setFormCaptureGitDiff(false);
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
setFormFallbackModel('');
setFormSilentRule('');
setFormInspectOnFailure(false);
setFormRequireApproval(false);
setFormDependsOn('');
setFormJoinPolicy('all_success');
setFormAdaptiveEnabled(false);
setFormAdaptiveMinInterval('5m');
setFormAdaptiveMaxInterval('2h');
setFormAdaptiveBackoffFactor('1.5');
setFormAdaptiveIdleThreshold('3');
if (preset) {
setFormTitle(preset.title || '');
setFormSchedule(preset.schedule || '');
setFormPrompt(preset.prompt || '');
if (preset.type) setFormType(preset.type);
if (Array.isArray(preset.channels) && preset.channels.length) setFormChannels(preset.channels.filter((c) => DELIVERY_CHANNELS.includes(c)));
if (preset.silentRule !== undefined) setFormSilentRule(preset.silentRule || '');
if (preset.fallbackModel !== undefined) setFormFallbackModel(preset.fallbackModel || '');
if (preset.inspectOnFailure !== undefined) setFormInspectOnFailure(Boolean(preset.inspectOnFailure));
if (preset.requireApproval !== undefined) setFormRequireApproval(Boolean(preset.requireApproval));
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
initialFormSnapshotRef.current = JSON.stringify({
title: String((preset && preset.title) || '').trim(),
schedule: String((preset && preset.schedule) || (preset ? '' : '0 9 * * 1-5')).trim(),
type: String((preset && preset.type) || 'llm'),
prompt: String((preset && preset.prompt) || '').trim(),
provider: String(defaultModelInfo?.provider || ''),
model: String(defaultModelInfo?.model || ''),
fallbackModel: String((preset && preset.fallbackModel) || '').trim(),
silentRule: String((preset && preset.silentRule) || '').trim(),
inspectOnFailure: Boolean(preset && preset.inspectOnFailure),
requireApproval: Boolean(preset && preset.requireApproval),
delivery: 'isolated',
notifyTelegram: false,
channels: Array.isArray(preset && preset.channels) ? [...preset.channels].filter((c) => DELIVERY_CHANNELS.includes(c)).sort() : [],
template: '',
onlyOnFailure: Boolean(preset && preset.onlyOnFailure),
timeoutSeconds: 1800,
overlapPolicy: 'skip',
kanbanMode: 'none',
onSuccess: '',
onFailure: '',
heartbeatIntervalSeconds: 0,
gracePeriodSeconds: 300,
preflightType: 'none',
preflightTarget: '',
priority: 5,
concurrencyGroup: 'default',
selfHealingCommand: '',
autoDiagnose: false,
timezone: '',
misfirePolicy: 'skip',
maxRetries: 0,
permissionPreset: 'default',
agentPreset: '',
sessionTitle: '',
targetSessionId: '',
targetSessionReset: 'never',
env: '',
cwd: '',
workspaceId: '',
worktree: false,
keepWorktree: false,
captureGitDiff: false,
httpMethod: 'GET',
httpUrl: '',
httpHttpHeaders: '',
httpBody: '',
sshProfileId: '',
sshTarget: '',
sshKeyPath: '',
dockerImage: '',
nodePath: '',
pythonPath: '',
skillName: '',
workflowName: '',
});
setManualModalOpen(true);
};
const handleRetryDelivery = async (taskId, runId) => {
setRetryingDeliveryId(runId);
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/retry-delivery', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ runId }),
});
if (data && data.ok) {
await loadTaskHistory(taskId);
} else {
alert(data?.error || 'Failed to retry delivery');
}
} catch (e) {
alert(e.message || 'Error retrying delivery');
} finally {
setRetryingDeliveryId(null);
}
};
const handleApplyDoctorFix = async (taskId, fix) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/doctor/apply', {
method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix }),
});
if (data && data.ok) { alert('Doctor fix applied successfully! Task code updated.'); await loadTaskHistory(taskId); await fetchTasks(); }
else { alert(data?.error || 'Failed to apply doctor fix'); }
} catch (e) { alert(e.message || 'Error applying doctor fix'); }
};
const handleRevertDoctorFix = async (taskId) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/doctor/revert', {
method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
});
if (data && data.ok) { alert('Reverted to previous version successfully!'); await loadTaskHistory(taskId); await fetchTasks(); }
else { alert(data?.error || 'Failed to revert doctor fix'); }
} catch (e) { alert(e.message || 'Error reverting doctor fix'); }
};
const handleResolveUncertain = async (taskId, runId, resolution) => {
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/resolve-uncertain', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ runId, resolution }),
});
if (data && data.ok) {
await loadTaskHistory(taskId);
} else {
alert(data?.error || 'Failed to resolve uncertain run');
}
} catch (e) {
alert(e.message || 'Error resolving uncertain run');
}
};
const loadTaskHistory = async (taskId) => {
setHistoryLoading(true);
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks/' + encodeURIComponent(taskId) + '/history');
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
setFormRequireApproval(Boolean(task.requireApproval));
setFormDelivery(task.delivery || 'isolated');
setFormNotifyTelegram(Boolean(task.notifyTelegram));
setFormChannels(Array.isArray(task.channels) ? task.channels.filter((c) => DELIVERY_CHANNELS.includes(c)) : []);
setFormTemplate(task.template || '');
setFormOnlyOnFailure(Boolean(task.onlyOnFailure));
setFormTimeoutSeconds(task.timeoutSeconds !== undefined ? task.timeoutSeconds : 1800);
setFormOverlapPolicy(task.overlapPolicy || 'skip');
setFormKanbanMode(task.kanbanMode || 'none');
setFormOnSuccess(task.onSuccess || '');
setFormOnFailure(task.onFailure || '');
setFormDependsOn(Array.isArray(task.dependsOn) ? task.dependsOn.join(', ') : (task.dependsOn || ''));
setFormJoinPolicy(task.joinPolicy || 'all_success');
setFormAdaptiveEnabled(Boolean(task.adaptive?.enabled));
setFormAdaptiveMinInterval(task.adaptive?.minInterval || '5m');
setFormAdaptiveMaxInterval(task.adaptive?.maxInterval || '2h');
setFormAdaptiveBackoffFactor(String(task.adaptive?.backoffFactor || '1.5'));
setFormAdaptiveIdleThreshold(String(task.adaptive?.idleRunsThreshold || '3'));
setFormHeartbeatIntervalSeconds(task.heartbeatIntervalSeconds || 0);
setFormGracePeriodSeconds(task.gracePeriodSeconds || 300);
setFormPreflightType(task.preflightType || 'none');
setFormPreflightTarget(task.preflightTarget || '');
setFormPriority(task.priority !== undefined ? task.priority : 5);
setFormConcurrencyGroup(task.concurrencyGroup || 'default');
setFormSelfHealingCommand(task.selfHealingCommand || '');
setFormAutoDiagnose(Boolean(task.autoDiagnose));
setSchedulePreviewRuns(null);
setFormTimezone(task.timezone || '');
setFormMisfirePolicy(task.misfirePolicy || 'skip');
setFormMaxRetries(task.maxRetries !== undefined ? task.maxRetries : 0);
setFormPermissionPreset(task.permissionPreset === 'full' ? 'danger-full-access' : (task.permissionPreset || 'default'));
setFormAgentPreset(task.agentPreset || '');
setFormSessionTitle(task.sessionTitle || '');
setFormTargetSessionId(task.targetSessionId || '');
setFormTargetSessionReset(task.targetSessionReset || 'never');
setFormEnv(formatEnvText(task.env));
setFormCwd(task.cwd || '');
setFormWorkspaceId(task.workspaceId || '');
setFormWorktree(Boolean(task.worktree));
setFormKeepWorktree(Boolean(task.keepWorktree));
setFormCaptureGitDiff(task.captureGitDiff !== undefined ? Boolean(task.captureGitDiff) : Boolean(task.worktree));
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
permissionPreset: isAgentType ? formPermissionPreset : 'default',
agentPreset: formAgentPreset.trim() || undefined,
sessionTitle: formSessionTitle.trim() || undefined,
targetSessionId: formTargetSessionId.trim() || undefined,
targetSessionReset: formTargetSessionReset || 'never',
kanbanMode: formKanbanMode,
onSuccess: formOnSuccess.trim() || undefined,
onFailure: formOnFailure.trim() || undefined,
dependsOn: formDependsOn.trim() ? formDependsOn.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean) : undefined,
joinPolicy: formJoinPolicy || 'all_success',
adaptive: formAdaptiveEnabled ? { enabled: true, minInterval: formAdaptiveMinInterval || '5m', maxInterval: formAdaptiveMaxInterval || '2h', backoffFactor: Number(formAdaptiveBackoffFactor) || 1.5, idleRunsThreshold: Number(formAdaptiveIdleThreshold) || 3 } : null,
heartbeatIntervalSeconds: Number(formHeartbeatIntervalSeconds) || 0,
gracePeriodSeconds: Number(formGracePeriodSeconds) || 300,
preflightType: formPreflightType || 'none',
preflightTarget: formPreflightTarget.trim() || undefined,
priority: Number(formPriority) || 5,
concurrencyGroup: formConcurrencyGroup.trim() || 'default',
selfHealingCommand: formSelfHealingCommand.trim() || undefined,
autoDiagnose: Boolean(formAutoDiagnose),
requireApproval: Boolean(formRequireApproval),
env: parseEnvText(formEnv),
cwd: formCwd.trim(),
workspaceId: formWorkspaceId.trim(),
worktree: isAgentType ? Boolean(formWorktree) : false,
keepWorktree: isAgentType ? Boolean(formKeepWorktree) : false,
captureGitDiff: Boolean(formCaptureGitDiff),
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
const headers = { 'Content-Type': 'application/json' };
const hasCodeExec = CODE_FORM_TYPES.includes(formType) ||
Boolean(payload.command && payload.command.trim()) ||
payload.preflightType === 'command' ||
Boolean(payload.preflightCommand && payload.preflightCommand.trim()) ||
Boolean(payload.selfHealingCommand && payload.selfHealingCommand.trim());
if (hasCodeExec) headers[SCRIPT_CONFIRM_HEADER] = 'script';
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks', {
method: 'POST',
headers,
body: JSON.stringify(payload)
});
if (!data.ok) { alert(data.error || T_KEY(t, 'settings.saveError', { error: '' })); return; }
initialFormSnapshotRef.current = null;
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
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/chat/start', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ prompt: text })
});
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
const openChainGraphModal = async (task, chainRunId = null) => {
setChainGraphModalOpen(true);
setChainGraphLoading(true);
setChainGraphData(null);
setChainGraphRunId(chainRunId);
try {
if (chainRunId) {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/chains/' + encodeURIComponent(chainRunId));
if (data && data.ok) {
setChainGraphData(data);
}
} else if (task) {
const graph = buildTaskGraphModel(tasks || [], [], task.id);
setChainGraphData({ ok: true, graph, task });
}
} catch (err) {
console.debug('[dsh-cron] chain graph fetch failed', err);
} finally {
setChainGraphLoading(false);
}
};
const handleRetryChainStep = async (stepTaskId) => {
if (!chainGraphRunId || !stepTaskId) return;
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/chains/' + encodeURIComponent(chainGraphRunId) + '/retry-from/' + encodeURIComponent(stepTaskId), {
method: 'POST'
});
if (data && data.ok) {
await openChainGraphModal(null, chainGraphRunId);
} else {
alert(data?.error || 'Retry failed');
}
} catch (err) {
alert('Retry failed: ' + err.message);
}
};
const iconHtml = (html) => ({ dangerouslySetInnerHTML: { __html: html } });
const svgProps = (html) => ({ style: { display: 'flex', alignItems: 'center' }, ...iconHtml(html) });
function handleOpenLiveLogs(task) {
if (!task || !task.id) return;
if (window.__dshLiveLogsEvtSource) {
try { window.__dshLiveLogsEvtSource.close(); } catch (e) { void e; }
window.__dshLiveLogsEvtSource = null;
}
setLiveLogsTaskId(task.id);
setLiveLogsTaskTitle(task.title || task.id);
setLiveLogsLines([]);
setLiveLogsStatus(task.running ? 'connecting' : 'idle');
setLiveLogsCompleted(false);
setLiveLogsModalOpen(true);
try {
const es = new EventSource('/dsh-cron/tasks/' + encodeURIComponent(task.id) + '/stream');
window.__dshLiveLogsEvtSource = es;
es.addEventListener('init', (e) => {
try {
const d = JSON.parse(e.data);
if (Array.isArray(d.bufferedLogs)) setLiveLogsLines(d.bufferedLogs);
if (d.status) setLiveLogsStatus(d.status);
if (d.status === 'completed') setLiveLogsCompleted(true);
} catch (err) { void err; }
});
es.addEventListener('log', (e) => {
try {
const item = JSON.parse(e.data);
setLiveLogsLines((prev) => [...prev, item]);
setLiveLogsStatus('running');
} catch (err) { void err; }
});
es.addEventListener('complete', () => {
setLiveLogsCompleted(true);
setLiveLogsStatus('completed');
try { es.close(); } catch (e) { void e; }
window.__dshLiveLogsEvtSource = null;
});
es.onerror = () => {
setLiveLogsStatus((curr) => curr === 'running' ? 'completed' : 'closed');
try { es.close(); } catch (e) { void e; }
window.__dshLiveLogsEvtSource = null;
};
} catch (err) {
setLiveLogsStatus('error');
}
}
function handleCloseLiveLogs() {
if (window.__dshLiveLogsEvtSource) {
try { window.__dshLiveLogsEvtSource.close(); } catch (e) { void e; }
window.__dshLiveLogsEvtSource = null;
}
setLiveLogsModalOpen(false);
}
const openAnalyticsDigest = async (days = 7) => {
setDigestOpen(true);
setDigestLoading(true);
setPeriodDays(days);
setSendStatus(null);
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/analytics?days=' + encodeURIComponent(days));
if (data && data.ok) {
setDigestData(data.digest || null);
setDigestMarkdown(data.markdown || '');
}
} catch (err) {
console.debug('[dsh-cron] analytics digest fetch failed', err);
} finally {
setDigestLoading(false);
}
};
const onSelectPeriod = async (days) => {
setPeriodDays(days);
await openAnalyticsDigest(days);
};
const onSendTelegram = async () => {
setSendStatus('⏳ ' + (T_KEY(t, 'digest.sending') || 'Sending...'));
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/analytics', {
method: 'POST',
body: JSON.stringify({ days: periodDays })
});
if (data && data.ok) {
setSendStatus('✅ ' + (T_KEY(t, 'digest.sent') || 'Sent!'));
} else {
setSendStatus('❌ ' + (data?.error || 'Failed'));
}
} catch (err) {
setSendStatus('❌ ' + (err.message || 'Error'));
}
};
const openTimelineModal = async (tab = 'timeline') => {
setTimelineOpen(true);
setTimelineLoading(true);
setTimelineTab(tab);
try {
const [timelineRes, heatmapRes] = await Promise.all([
fetchJsonWithTimeout('/dsh-cron/schedule/timeline-24h?hours=24'),
fetchJsonWithTimeout('/dsh-cron/analytics/heatmap')
]);
if (timelineRes?.data?.ok && timelineRes?.data?.timeline) {
setTimelineData(timelineRes.data.timeline);
}
if (heatmapRes?.data?.ok && heatmapRes?.data?.heatmap) {
setHeatmapData(heatmapRes.data.heatmap);
}
} catch (err) {
console.debug('[dsh-cron] timeline fetch failed', err);
} finally {
setTimelineLoading(false);
}
};
const onSelectTimelineTab = (tab) => {
setTimelineTab(tab);
};
return _h('div', { className: 'dsh-cron-overlay' },
_h('div', { className: 'dsh-cron-container' },
_h('div', { className: 'dsh-cron-top-bar' },
_h('button', {
type: 'button',
className: 'dsh-cron-back-btn',
title: T_KEY(t, 'panel.back'),
onClick: () => { if (onClose) onClose(); else toggle.set(false); }
},
_h('span', svgProps(BACK_ICON)),
_h('span', null, T_KEY(t, 'panel.back'))
)
),
_h('div', { className: 'dsh-cron-header' },
_h('div', null,
_h('div', { className: 'dsh-cron-title' }, T_KEY(t, 'panel.title')),
_h('div', { className: 'dsh-cron-subtitle' }, T_KEY(t, 'panel.subtitle'))
),
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 12px' },
title: T_KEY(t, 'timeline.buttonTitle'),
onClick: () => openTimelineModal('timeline')
},
_h('span', { style: { fontSize: '14px' } }, '⏱'),
T_KEY(t, 'timeline.buttonLabel')
),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 12px' },
title: T_KEY(t, 'digest.buttonTitle'),
onClick: openAnalyticsDigest
},
_h('span', { style: { fontSize: '14px' } }, '📊'),
T_KEY(t, 'digest.buttonLabel')
),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px' },
title: T_KEY(t, 'actions.settings'),
onClick: openSettingsModal
},
_h('span', { style: { display: 'flex', alignItems: 'center', color: 'var(--dsh-cron-info)' }, ...iconHtml(ICON_TELEGRAM) }),
T_KEY(t, 'actions.settings')
),
_h('div', { style: { position: 'relative' } },
_h('button', { className: 'dsh-cron-create-btn', onClick: () => setDropdownOpen(!dropdownOpen) },
T_KEY(t, 'actions.create'),
_h('span', iconHtml(ICON_CHEVRON_DOWN))
),
dropdownOpen && _h('div', { className: 'dsh-cron-dropdown' },
_h('button', { className: 'dsh-cron-dropdown-item', onClick: openDshModal }, T_KEY(t, 'actions.createWithDsh')),
_h('button', { className: 'dsh-cron-dropdown-item', onClick: () => openManualModal(null) }, T_KEY(t, 'actions.setupManually'))
)
),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'transfer.exportTitle'),
'aria-label': T_KEY(t, 'transfer.exportTitle'),
disabled: transferBusy,
onClick: handleExport
}, _h('span', svgProps(ICON_DOWNLOAD))),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'transfer.importTitle'),
'aria-label': T_KEY(t, 'transfer.importTitle'),
disabled: transferBusy,
onClick: () => { if (importFileRef.current) importFileRef.current.click(); }
}, _h('span', svgProps(ICON_UPLOAD))),
_h('input', {
type: 'file',
accept: '.json,application/json',
ref: importFileRef,
style: { display: 'none' },
onChange: handleImportFile
})
)
),
_h('div', { className: 'dsh-cron-search-bar' },
_h('span', { className: 'dsh-cron-search-icon', ...iconHtml(ICON_SEARCH) }),
_h('input', {
className: 'dsh-cron-search-input',
type: 'search',
'aria-label': T_KEY(t, 'search.placeholder'),
placeholder: T_KEY(t, 'search.placeholder'),
value: query,
onChange: (e) => setQuery(e.target.value)
})
),
stats && _h('div', { className: 'dsh-cron-stats-bar' },
_h('div', { className: 'dsh-cron-stat-card' },
_h('div', { className: 'dsh-cron-stat-val' }, stats.activeTasks || 0),
_h('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.activeTasks'))
),
_h('div', { className: 'dsh-cron-stat-card' },
_h('div', { className: 'dsh-cron-stat-val' }, stats.totalRuns || 0),
_h('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.totalRuns'))
),
_h('div', { className: 'dsh-cron-stat-card' },
_h('div', { className: 'dsh-cron-stat-val' }, (stats.totalTokens || 0).toLocaleString()),
_h('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.totalTokens'))
),
_h('div', { className: 'dsh-cron-stat-card' },
_h('div', { className: 'dsh-cron-stat-val', style: { color: 'var(--dsh-cron-success)' } }, '$' + (stats.totalCostUsd || 0).toFixed(4)),
_h('div', { className: 'dsh-cron-stat-lbl' }, T_KEY(t, 'stats.totalCost'))
)
),
_h('div', { className: 'dsh-cron-tabs' },
['all', 'active', 'paused', 'completed'].map((tabName) =>
_h('button', {
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
_h('div', { className: 'dsh-cron-filters' },
_h('button', {
type: 'button',
className: 'dsh-cron-filter-toggle',
'aria-expanded': filtersOpen ? 'true' : 'false',
onClick: () => setFiltersOpen(!filtersOpen)
},
T_KEY(t, 'filters.title'),
(filterType || filterModel || filterChannel) ? ' •' : ''
),
filtersOpen && _h('div', { className: 'dsh-cron-filter-panel' },
_h('label', { className: 'dsh-cron-filter-field' },
_h('span', null, T_KEY(t, 'filters.type')),
_h('select', {
value: filterType,
onChange: (e) => setFilterType(e.target.value)
},
_h('option', { value: '' }, T_KEY(t, 'filters.any')),
...filterTypeOptions.map((value) => _h('option', { key: value, value }, value))
)
),
_h('label', { className: 'dsh-cron-filter-field' },
_h('span', null, T_KEY(t, 'filters.model')),
_h('select', {
value: filterModel,
onChange: (e) => setFilterModel(e.target.value)
},
_h('option', { value: '' }, T_KEY(t, 'filters.any')),
...filterModelOptions.map((value) => _h('option', { key: value, value }, value))
)
),
_h('label', { className: 'dsh-cron-filter-field' },
_h('span', null, T_KEY(t, 'filters.channel')),
_h('select', {
value: filterChannel,
onChange: (e) => setFilterChannel(e.target.value)
},
_h('option', { value: '' }, T_KEY(t, 'filters.any')),
...DELIVERY_CHANNELS.map((id) => _h('option', { key: id, value: id }, T_KEY(t, CHANNEL_LABEL_KEYS[id])))
)
)
)
),
fetchError ? _h('div', {
className: 'dsh-cron-status-banner',
'data-type': 'error',
style: { margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
},
_h('span', null, T_KEY(t, 'banner.loadError', { error: fetchError })),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { marginLeft: '8px', padding: '2px 8px', fontSize: '12px' },
onClick: () => fetchTasks()
}, T_KEY(t, 'banner.retry'))
) : null,
(filterType || filterModel || filterChannel) ? _h('div', {
className: 'dsh-cron-filter-summary',
style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #888)', marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }
},
_h('span', null, T_KEY(t, 'filters.showing', { shown: visibleTasks.length, total: tasks.length })),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '11px' },
onClick: resetFilters
}, T_KEY(t, 'filters.reset'))
) : null,
_h('div', { className: 'dsh-cron-task-list' },
loading && tasks.length === 0
? _h('div', { style: { color: 'var(--dsw-alias-label-tertiary, #888)', padding: '16px 0', fontSize: '14px' } }, T_KEY(t, 'list.loading'))
: tasks.length === 0
? _h('div', { style: { color: 'var(--dsw-alias-label-tertiary, #777)', padding: '16px 0', fontSize: '14px' } }, T_KEY(t, 'list.empty'))
: visibleTasks.length === 0
? _h('div', { style: { color: 'var(--dsw-alias-label-tertiary, #777)', padding: '16px 0', fontSize: '14px', display: 'flex', gap: '10px', alignItems: 'center' } },
_h('span', null, T_KEY(t, 'filters.empty')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '12px' },
onClick: resetFilters
}, T_KEY(t, 'filters.reset'))
)
: visibleTasks.map((task) =>
_h('div', {
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
isConfigManaged(task) ? null : _h('button', {
type: 'button',
className: 'dsh-cron-task-status-btn' + (task.running ? ' dsh-cron-pulse' : ''),
'data-active': task.status === 'active' ? 'true' : undefined,
title: task.status === 'active' ? T_KEY(t, 'actions.pause') : T_KEY(t, 'actions.resume'),
'aria-label': task.status === 'active' ? T_KEY(t, 'actions.pause') : T_KEY(t, 'actions.resume'),
onClick: (e) => { e.stopPropagation(); handleToggleTask(task.id); }
}, _h('span', svgProps(task.status === 'active' ? ICON_PAUSE : ICON_PLAY))),
_h('div', { className: 'dsh-cron-task-info' },
_h('div', { className: 'dsh-cron-task-title' },
task.title,
_h('span', {
className: 'dsh-cron-type-tag',
style: task.type === 'script'
? { background: 'var(--dsh-cron-info-bg)', color: 'var(--dsh-cron-info)' }
: { background: 'var(--dsh-cron-success-bg)', color: 'var(--dsh-cron-success)' }
}, task.type === 'script' ? T_KEY(t, 'list.typeShell') : T_KEY(t, 'list.typeLlm')),
task.model ? _h('span', { className: 'dsh-cron-task-model-tag' }, task.model.split('/').pop()) : null,
task.oneShot ? _h('span', { className: 'dsh-cron-oneshot-tag' }, T_KEY(t, 'list.oneShot')) : null,
isConfigManaged(task) ? _h('span', {
className: 'dsh-cron-config-tag',
title: T_KEY(t, 'list.configManagedHint')
}, T_KEY(t, 'list.configManaged')) : null,
task.lastDurationMs > 0 ? _h('span', { className: 'dsh-cron-cost-tag', title: 'Last execution duration' }, task.lastDurationMs + 'ms') : null,
task.onSuccess ? _h('span', { className: 'dsh-cron-type-tag dsh-cron-tag-success', title: 'On success: triggers ' + task.onSuccess }, '➜ ' + task.onSuccess) : null,
task.onFailure ? _h('span', { className: 'dsh-cron-type-tag dsh-cron-tag-failure', title: 'On failure: triggers ' + task.onFailure }, '↳ ' + task.onFailure) : null,
(task.dependsOn && (Array.isArray(task.dependsOn) ? task.dependsOn.length > 0 : Boolean(task.dependsOn))) ? _h('span', { className: 'dsh-cron-type-tag dsh-cron-tag-heartbeat', title: 'Depends on: ' + (Array.isArray(task.dependsOn) ? task.dependsOn.join(', ') : task.dependsOn) }, '⛓️ ' + (Array.isArray(task.dependsOn) ? task.dependsOn.join(', ') : task.dependsOn)) : null,
task.adaptive?.enabled ? _h('span', {
className: 'dsh-cron-type-tag' + (task.adaptiveState?.backedOff ? ' dsh-cron-tag-failure' : ' dsh-cron-tag-success'),
title: 'Adaptive: ' + (task.adaptiveState?.effectiveIntervalStr || task.adaptive.minInterval || '5m') + ' (idle: ' + (task.adaptiveState?.idleCount || 0) + ')'
}, (task.adaptiveState?.backedOff ? '⏳ ' : '⚡ ') + (task.adaptiveState?.effectiveIntervalStr || task.adaptive.minInterval || '5m')) : null,
task.heartbeatIntervalSeconds > 0 ? _h('span', { className: 'dsh-cron-type-tag dsh-cron-tag-heartbeat', title: 'Heartbeat: every ' + task.heartbeatIntervalSeconds + 's' }, '💓 ' + task.heartbeatIntervalSeconds + 's') : null,
task.targetSessionId ? _h('span', { className: 'dsh-cron-type-tag dsh-cron-tag-session', title: 'Target session: ' + task.targetSessionId + (task.targetSessionReset && task.targetSessionReset !== 'never' ? ' (' + task.targetSessionReset + ')' : '') }, '🧵 ' + task.targetSessionId) : null,
task.preflightType && task.preflightType !== 'none' ? _h('span', { className: 'dsh-cron-type-tag dsh-cron-tag-preflight', title: 'Preflight: ' + task.preflightType }, '🛡️ ' + task.preflightType) : null,
task.totalCostUsd > 0 ? _h('span', { className: 'dsh-cron-cost-tag' }, '$' + task.totalCostUsd.toFixed(4)) : null,
task.totalTokens > 0 ? _h('span', { className: 'dsh-cron-tokens-tag' }, (task.totalTokens > 1000 ? Math.round(task.totalTokens / 1000) + 'k' : task.totalTokens) + ' tok') : null,
task.status === 'paused' && task.pausedReason ? _h('span', { className: 'dsh-cron-type-tag dsh-cron-tag-failure', title: task.pausedReason }, '🛑 ' + task.pausedReason) : null
),
_h('div', { className: 'dsh-cron-task-sched' },
task.scheduleText || task.schedule,
task.nextRunAt ? T_KEY(t, 'list.next', { time: new Date(task.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : '',
task.running && task.runningSince
? ' · ' + T_KEY(t, 'list.runningNow') + ' ' + Math.max(0, Math.round((Date.now() - task.runningSince) / 1000)) + 's'
: ''
),
task.prompt ? _h('div', {
className: 'dsh-cron-task-prompt-preview',
title: task.prompt
}, task.prompt.slice(0, 140) + (task.prompt.length > 140 ? '…' : '')) : null
),
_h('div', {
className: 'dsh-cron-task-actions',
onClick: (e) => e.stopPropagation()
},
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'actions.dryRunTitle'),
onClick: () => handleDryRun(task.id)
}, '🧪'),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn' + (task.running ? ' dsh-cron-pulse' : ''),
title: T_KEY(t, 'liveLog.viewLog'),
onClick: () => handleOpenLiveLogs(task)
}, '📺'),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'actions.archiveTitle'),
onClick: () => openArchiveModal(task, 0)
}, '📜'),
(task.onSuccess || task.onFailure || (task.dependsOn && (Array.isArray(task.dependsOn) ? task.dependsOn.length > 0 : Boolean(task.dependsOn)))) ? _h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'chainGraph.viewGraph'),
onClick: () => openChainGraphModal(task)
}, '🕸️') : null,
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'actions.runNow'),
onClick: () => handleRunNow(task.id)
}, T_KEY(t, 'actions.runNowShort')),
isConfigManaged(task) ? null : _h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'actions.edit'),
'aria-label': T_KEY(t, 'actions.edit'),
onClick: () => openEditModal(task)
}, _h('span', svgProps(ICON_EDIT))),
isConfigManaged(task) ? null : _h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'actions.tuneWithDsh'),
'aria-label': T_KEY(t, 'actions.tuneWithDsh'),
onClick: () => handleTuneWithDsh(task)
}, _h('span', svgProps(ICON_TUNE))),
isConfigManaged(task) ? null : _h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
title: T_KEY(t, 'actions.duplicate'),
'aria-label': T_KEY(t, 'actions.duplicate'),
onClick: () => handleDuplicate(task)
}, _h('span', svgProps(ICON_COPY))),
isConfigManaged(task) ? null : _h('button', {
type: 'button',
className: 'dsh-cron-icon-btn dsh-cron-danger',
title: T_KEY(t, 'actions.delete'),
'aria-label': T_KEY(t, 'actions.delete'),
onClick: () => handleDelete(task.id)
}, _h('span', svgProps(ICON_TRASH)))
)
)
)
),
_h('div', { className: 'dsh-cron-recs-title' }, T_KEY(t, 'recs.title')),
_h('div', { className: 'dsh-cron-hint', style: { marginBottom: '8px' } }, T_KEY(t, 'recs.hint')),
_h('div', { className: 'dsh-cron-recs-list' },
recs.map((rec) =>
_h('div', {
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
_h('div', { className: 'dsh-cron-rec-icon' },
_h('span', iconHtml(rec.icon === 'bell' ? ICON_BELL : rec.icon === 'clipboard' ? ICON_CLIPBOARD : ICON_ACTIVITY))
),
_h('div', { className: 'dsh-cron-rec-content' },
_h('div', { className: 'dsh-cron-rec-title' },
rec.title,
_h('span', { className: 'dsh-cron-rec-time' }, rec.scheduleText)
),
_h('div', { className: 'dsh-cron-rec-desc' }, rec.description)
)
)
)
)
),
manualModalOpen && _h('div', {
className: 'dsh-cron-modal-overlay',
onClick: (e) => {
if (e.target === e.currentTarget) closeManualModalWithConfirm();
}
},
_h('div', {
className: 'dsh-cron-modal dsh-cron-modal-scroll',
style: { maxWidth: '640px' },
role: 'dialog',
'aria-modal': 'true',
onClick: (e) => e.stopPropagation()
},
_h('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formId ? '12px' : '18px' } },
_h('div', { className: 'dsh-cron-modal-title', style: { margin: 0 } }, formId ? T_KEY(t, 'modal.editTitle') : T_KEY(t, 'modal.newTitle')),
selectedTaskMeta && _h('span', {
style: {
fontSize: '12px',
padding: '3px 8px',
borderRadius: '6px',
background: selectedTaskMeta.status === 'active' ? 'var(--dsh-cron-success-bg)' : 'var(--dsh-cron-danger-bg)',
color: selectedTaskMeta.status === 'active' ? 'var(--dsh-cron-success)' : 'var(--dsh-cron-danger)'
}
}, selectedTaskMeta.status === 'active' ? T_KEY(t, 'modal.statusActive') : T_KEY(t, 'modal.statusPaused'))
),
formId && _h('div', { className: 'dsh-cron-modal-nav' },
_h('button', {
type: 'button',
className: 'dsh-cron-modal-tab',
'data-active': modalTab === 'params' ? 'true' : undefined,
onClick: () => setModalTab('params')
}, T_KEY(t, 'modal.params')),
_h('button', {
type: 'button',
className: 'dsh-cron-modal-tab',
'data-active': modalTab === 'history' ? 'true' : undefined,
onClick: () => { setModalTab('history'); if (formId) loadTaskHistory(formId); }
}, T_KEY(t, 'modal.history', { count: taskHistory.length || 0 }))
),
modalTab === 'history' && formId ? _h('div', null,
historyLoading ? _h('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'history.loading')) :
taskHistory.length === 0 ? _h('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'history.empty')) :
_h('div', { className: 'dsh-cron-history-list' },
taskHistory.map((run) => _h('div', { key: run.id, className: 'dsh-cron-history-item' },
_h('div', { className: 'dsh-cron-history-head' },
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
_h('span', {
className: 'dsh-cron-history-status',
'data-status': run.status
}, statusLabel(t, run.status)),
_h('span', { className: 'dsh-cron-history-time' }, run.at ? new Date(run.at).toLocaleString() : '')
),
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
run.costUsd > 0 && _h('span', { className: 'dsh-cron-cost-tag' }, '$' + run.costUsd.toFixed(5)),
run.usage && (run.usage.inputTokens > 0 || run.usage.outputTokens > 0) && _h('span', { className: 'dsh-cron-tokens-tag' }, (run.usage.inputTokens + run.usage.outputTokens) + ' tok'),
_h('span', { style: { color: 'var(--dsw-alias-label-tertiary, #888)', fontSize: '11.5px' } }, (run.durationMs || 0) + ' ms')
)
),
run.stoppedReason && _h('div', {
className: 'dsh-cron-hint',
style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }
},
_h('span', { className: 'dsh-cron-badge-ref' }, T_KEY(t, 'history.stoppedReasonTitle')),
_h('span', null, run.stoppedReason)
),
Array.isArray(run.stages) && run.stages.length > 0 && _h('div', {
className: 'dsh-cron-stages-flow',
style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }
},
run.stages.map((st) => _h('span', {
key: st.name,
className: 'dsh-cron-stage-pill',
'data-status': st.status || 'unknown',
title: st.error ? (st.name + ': ' + st.error) : (st.name + (st.durationMs !== undefined ? ' (' + st.durationMs + 'ms)' : ''))
}, (T_KEY(t, 'history.stage_' + st.name) || st.name) + (st.durationMs !== undefined ? ' ' + st.durationMs + 'ms' : '')))
),
run.delivery && _h('div', {
style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }
},
_h('span', {
className: 'dsh-cron-badge-ref',
'data-status': run.delivery.status
}, 'Delivery: ' + run.delivery.status),
(run.delivery.status === 'failed' || run.delivery.status === 'partial') && _h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '11px' },
disabled: retryingDeliveryId === run.id,
onClick: () => handleRetryDelivery(formId, run.id)
}, retryingDeliveryId === run.id ? T_KEY(t, 'history.retryingDelivery') : T_KEY(t, 'history.retryDelivery'))
),
run.artifacts && run.artifacts.length > 0 && _h('div', {
style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', alignItems: 'center' }
},
_h('span', { className: 'dsh-cron-hint', style: { fontSize: '11px' } }, '📦 ' + T_KEY(t, 'history.artifacts') + ':'),
run.artifacts.map((art) => _h('a', {
key: art.name || art.id,
href: '/dsh-cron/runs/' + encodeURIComponent(run.id) + '/artifacts/' + encodeURIComponent(art.name) + '/preview',
target: '_blank',
rel: 'noopener noreferrer',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '11px', textDecoration: 'none' },
title: art.name + ' (' + Math.round((art.size || 0) / 1024 * 10) / 10 + ' KB)'
}, art.name))
),
run.status === 'uncertain' && _h('div', {
className: 'dsh-cron-status-banner',
'data-type': 'warning',
style: { marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }
},
_h('span', null, '⚠️ ' + T_KEY(t, 'history.statusUncertainHint')),
_h('div', { style: { display: 'flex', gap: '6px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '11px' },
onClick: () => handleResolveUncertain(formId, run.id, 'completed')
}, '✓ ' + T_KEY(t, 'history.resolveCompleted')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '11px' },
onClick: () => handleResolveUncertain(formId, run.id, 'failed')
}, '✕ ' + T_KEY(t, 'history.resolveFailed'))
)
),
(run.diagnosis || run.doctorReport) && _h('div', {
className: 'dsh-cron-status-banner',
'data-type': 'info',
style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }
},
_h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
_h('strong', null, '🩺 ' + T_KEY(t, run.doctorReport ? 'history.doctorDiagnosis' : 'history.diagnosis')),
_h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
(run.autoHealed || run.doctorReport?.autoHealed) && _h('span', {
style: { fontSize: '10px', background: 'var(--dsh-cron-success-bg)', color: 'var(--dsh-cron-success)', padding: '1px 6px', borderRadius: '8px', fontWeight: '600' }
}, '✨ ' + T_KEY(t, 'history.autoHealed')),
(run.doctorReport?.category || run.category) && _h('span', {
style: { fontSize: '10px', background: 'var(--dsw-alias-bg-layer-3)', padding: '1px 6px', borderRadius: '4px' }
}, run.doctorReport?.category || run.category),
run.confidence ? _h('span', { style: { fontSize: '10px', color: 'var(--dsw-alias-label-secondary)' } }, '(' + run.confidence + ')') : null
)
),
_h('div', null, run.doctorReport?.cause || run.diagnosis),
run.doctorReport?.diff && _h('div', {
style: {
background: 'var(--dsw-alias-bg-layer-2)',
border: '1px solid var(--dsw-alias-border-l2)',
borderRadius: '4px',
padding: '6px',
fontFamily: 'monospace',
fontSize: '11px',
maxHeight: '120px',
overflowY: 'auto',
whiteSpace: 'pre'
}
}, run.doctorReport.diff),
(run.doctorReport?.suggestedFix || run.suggestion) && _h('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
typeof handleApplyDoctorFix === 'function' && _h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
style: { padding: '3px 10px', fontSize: '12px' },
onClick: () => handleApplyDoctorFix(formId, run.doctorReport || { suggestedFix: run.suggestion })
}, '⚡ ' + T_KEY(t, 'history.doctorApply')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '3px 10px', fontSize: '12px' },
onClick: () => openEditModal(selectedTaskMeta, { prompt: run.suggestion })
}, T_KEY(t, 'history.applySuggestion'))
)
),
run.subtaskRuns && Array.isArray(run.subtaskRuns) && run.subtaskRuns.length > 0 && _h('div', {
style: { marginTop: '8px', padding: '8px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: '6px', fontSize: '12px' }
},
_h('div', { style: { fontWeight: '600', marginBottom: '4px' } }, '🐝 ' + T_KEY(t, 'history.swarmBadge') + ' (' + run.subtaskRuns.filter(r => r.status === 'success').length + '/' + run.subtaskRuns.length + ')'),
_h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
run.subtaskRuns.map((st, sidx) => _h('div', {
key: sidx,
style: { display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: '4px' }
},
_h('span', null, (st.status === 'success' ? '✅ ' : '❌ ') + st.title),
_h('span', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' } }, (st.durationMs || 0) + 'ms')
))
)
),
run.gitDiff && run.gitDiff.hasChanges && _h('div', {
className: 'dsh-cron-status-banner',
style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }
},
_h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
_h('strong', null, '📝 ' + T_KEY(t, 'history.gitDiff')),
_h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } }, run.gitDiff.stat || '')
),
run.gitDiff.diff && _h('div', {
style: {
background: 'var(--dsw-alias-bg-layer-2)',
border: '1px solid var(--dsw-alias-border-l2)',
borderRadius: '4px',
padding: '6px',
fontFamily: 'monospace',
fontSize: '11px',
maxHeight: '140px',
overflowY: 'auto',
whiteSpace: 'pre'
}
}, run.gitDiff.diff),
_h('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '12px' },
onClick: async () => {
if (!confirm('Discard all uncommitted changes in task directory?')) return;
const c = typeof AbortController !== 'undefined' ? new AbortController() : null;
const tId = c ? setTimeout(() => c.abort(), 15000) : null;
try {
const res = await fetch('/dsh-cron/tasks/' + encodeURIComponent(formId) + '/git-diff/discard', {
method: 'POST',
signal: c ? c.signal : undefined
});
const d = await res.json();
if (d.ok) { alert('Working directory reset successfully.'); if (formId) loadTaskHistory(formId); }
else alert(d.error || 'Failed to discard changes');
} catch (e) { alert(e.message); }
finally { if (tId) clearTimeout(tId); }
}
}, '🗑️ ' + T_KEY(t, 'history.discardDiff')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
style: { padding: '2px 8px', fontSize: '12px' },
onClick: async () => {
const c = typeof AbortController !== 'undefined' ? new AbortController() : null;
const tId = c ? setTimeout(() => c.abort(), 15000) : null;
try {
const res = await fetch('/dsh-cron/tasks/' + encodeURIComponent(formId) + '/git-diff/apply', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
signal: c ? c.signal : undefined,
body: JSON.stringify({ diff: run.gitDiff.diff })
});
const d = await res.json();
if (d.ok) { alert('Patch applied successfully.'); if (formId) loadTaskHistory(formId); }
else alert(d.error || 'Failed to apply patch');
} catch (e) { alert(e.message); }
finally { if (tId) clearTimeout(tId); }
}
}, '✅ ' + T_KEY(t, 'history.applyDiff'))
)
),
run.silentSkip && _h('div', {
className: 'dsh-cron-hint',
style: { display: 'flex', gap: '6px', alignItems: 'center' }
},
_h('span', { className: 'dsh-cron-badge-ref' }, T_KEY(t, 'history.silentSkip')),
_h('span', null, run.silentReason || '')
),
run.output && _h('div', { className: 'dsh-cron-history-output' }, run.output),
run.error && _h('div', { className: 'dsh-cron-history-output', style: { color: 'var(--dsh-cron-danger)', borderColor: 'var(--dsh-cron-danger-bg)' } }, run.error),
run.sessionId && _h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { marginTop: '8px', fontSize: '12px', padding: '4px 10px' },
onClick: () => openSession(ctx, run.sessionId)
}, T_KEY(t, 'history.openSession'))
))
),
_h('div', { className: 'dsh-cron-modal-foot', style: { marginTop: '18px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: () => { if (formId) loadTaskHistory(formId); }
}, T_KEY(t, 'history.refresh')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
onClick: closeManualModalWithConfirm
}, T_KEY(t, 'modal.close'))
)
) :
_h('form', { onSubmit: handleSaveManual },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.nameLabel')),
_h('input', {
required: true,
autoFocus: true,
value: formTitle,
placeholder: T_KEY(t, 'form.namePlaceholder'),
onChange: (e) => setFormTitle(e.target.value)
})
),
_h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.typeLabel')),
_h('select', {
value: formType,
onChange: (e) => setFormType(e.target.value)
},
_h('option', { value: 'llm' }, T_KEY(t, 'form.typeLlm')),
_h('option', { value: 'script' }, T_KEY(t, 'form.typeScript')),
_h('option', { value: 'node' }, T_KEY(t, 'form.typeNode')),
_h('option', { value: 'python' }, T_KEY(t, 'form.typePython')),
_h('option', { value: 'http' }, T_KEY(t, 'form.typeHttp')),
_h('option', { value: 'ssh' }, T_KEY(t, 'form.typeSsh')),
_h('option', { value: 'docker' }, T_KEY(t, 'form.typeDocker')),
_h('option', { value: 'skill' }, T_KEY(t, 'form.typeSkill')),
_h('option', { value: 'workflow' }, T_KEY(t, 'form.typeWorkflow'))
)
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.scheduleLabel')),
_h('input', {
required: true,
value: formSchedule,
placeholder: T_KEY(t, 'form.schedulePlaceholder'),
onChange: (e) => setFormSchedule(e.target.value)
}),
_h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' } },
[
{ label: '15m', expr: '*/15 * * * *' },
{ label: '1h', expr: '0 * * * *' },
{ label: 'Daily 09:00', expr: '0 9 * * *' },
{ label: 'Weekdays', expr: '0 9 * * 1-5' },
{ label: 'Weekly Mon', expr: '0 9 * * 1' },
].map((p) => _h('button', {
key: p.label,
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 7px', fontSize: '11px', borderRadius: '4px' },
onClick: () => { setFormSchedule(p.expr); handlePreviewSchedule(p.expr); }
}, p.label))
),
_h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '3px 8px', fontSize: '11.5px' },
onClick: () => handlePreviewSchedule(formSchedule)
}, T_KEY(t, 'form.previewSchedule')),
schedulePreviewRuns && schedulePreviewRuns.length > 0 && _h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #999)' } },
T_KEY(t, 'form.previewScheduleTitle') + ' ' + schedulePreviewRuns.slice(0, 3).map(r => new Date(r).toLocaleTimeString()).join(', ')
)
)
)
),
_h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.timeoutLabel')),
_h('input', {
type: 'number',
min: 1,
value: formTimeoutSeconds,
placeholder: '1800',
onChange: (e) => setFormTimeoutSeconds(e.target.value)
})
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.overlapLabel')),
_h('select', {
value: formOverlapPolicy,
onChange: (e) => setFormOverlapPolicy(e.target.value)
},
_h('option', { value: 'skip' }, T_KEY(t, 'form.overlapSkip')),
_h('option', { value: 'queue' }, T_KEY(t, 'form.overlapQueue')),
_h('option', { value: 'replace' }, T_KEY(t, 'form.overlapReplace'))
)
)
),
_h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.timezoneLabel')),
_h('input', {
value: formTimezone,
placeholder: T_KEY(t, 'form.timezonePlaceholder'),
onChange: (e) => setFormTimezone(e.target.value)
})
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.misfireLabel')),
_h('select', {
value: formMisfirePolicy,
onChange: (e) => setFormMisfirePolicy(e.target.value)
},
_h('option', { value: 'skip' }, T_KEY(t, 'form.misfireSkip')),
_h('option', { value: 'runOnce' }, T_KEY(t, 'form.misfireRunOnce')),
_h('option', { value: 'catchUpAll' }, T_KEY(t, 'form.misfireCatchUp'))
)
)
),
AGENT_FORM_TYPES.includes(formType) ? (
_h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.retriesLabel')),
_h('input', {
type: 'number',
min: 0,
value: formMaxRetries,
placeholder: '0',
onChange: (e) => setFormMaxRetries(e.target.value)
})
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.permissionLabel')),
_h('select', {
value: formPermissionPreset,
onChange: (e) => setFormPermissionPreset(e.target.value)
},
_h('option', { value: 'default' }, T_KEY(t, 'form.permissionDefault')),
_h('option', { value: 'read-only' }, T_KEY(t, 'form.permissionReadonly')),
_h('option', { value: 'workspace-write' }, T_KEY(t, 'form.permissionWrite')),
_h('option', { value: 'danger-full-access' }, T_KEY(t, 'form.permissionFull'))
)
)
)
) : (
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.retriesLabel')),
_h('input', {
type: 'number',
min: 0,
value: formMaxRetries,
placeholder: '0',
onChange: (e) => setFormMaxRetries(e.target.value)
})
)
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.kanbanLabel')),
_h('select', {
value: formKanbanMode,
onChange: (e) => setFormKanbanMode(e.target.value)
},
_h('option', { value: 'none' }, T_KEY(t, 'form.kanbanNone')),
_h('option', { value: 'on_failure' }, T_KEY(t, 'form.kanbanOnFailure')),
_h('option', { value: 'always' }, T_KEY(t, 'form.kanbanAlways'))
)
),
AGENT_FORM_TYPES.includes(formType) && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.agentPresetLabel')),
_h('input', {
type: 'text',
value: formAgentPreset,
placeholder: T_KEY(t, 'form.agentPresetPlaceholder'),
onChange: (e) => setFormAgentPreset(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.agentPresetHint'))
),
AGENT_FORM_TYPES.includes(formType) && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.sessionTitleLabel')),
_h('input', {
type: 'text',
value: formSessionTitle,
placeholder: T_KEY(t, 'form.sessionTitlePlaceholder'),
onChange: (e) => setFormSessionTitle(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.sessionTitleHint'))
),
AGENT_FORM_TYPES.includes(formType) && _h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.targetSessionIdLabel')),
_h('input', {
type: 'text',
value: formTargetSessionId,
placeholder: T_KEY(t, 'form.targetSessionIdPlaceholder'),
onChange: (e) => setFormTargetSessionId(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.targetSessionIdHint'))
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.targetSessionResetLabel')),
_h('select', {
value: formTargetSessionReset,
onChange: (e) => setFormTargetSessionReset(e.target.value)
},
_h('option', { value: 'never' }, T_KEY(t, 'form.targetSessionResetNever')),
_h('option', { value: 'daily' }, T_KEY(t, 'form.targetSessionResetDaily')),
_h('option', { value: 'weekly' }, T_KEY(t, 'form.targetSessionResetWeekly'))
),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.targetSessionResetHint'))
)
),
AGENT_FORM_TYPES.includes(formType) && _h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.providerLabel')),
_h('select', {
value: formProvider,
onChange: handleProviderChange
},
_h('option', { value: '' }, T_KEY(t, 'form.providerDefault')),
providers.map((p) => _h('option', { key: p.id, value: p.id }, p.name || p.id))
)
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.modelLabel')),
_h('select', {
value: formModel,
onChange: (e) => setFormModel(e.target.value)
},
_h('option', { value: '' }, T_KEY(t, 'form.modelDefault')),
models.map((m) => _h('option', { key: m.id, value: m.id }, m.name || m.id))
)
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.fallbackModelLabel')),
_h('input', {
type: 'text',
value: formFallbackModel,
placeholder: T_KEY(t, 'form.fallbackModelPlaceholder'),
onChange: (e) => setFormFallbackModel(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.fallbackModelHint'))
),
_h('label', { className: 'dsh-cron-checkbox-row', style: { marginTop: '4px' } },
_h('input', {
type: 'checkbox',
checked: formInspectOnFailure,
onChange: (e) => setFormInspectOnFailure(e.target.checked)
}),
_h('span', null, T_KEY(t, 'form.inspectOnFailureLabel'))
),
formInspectOnFailure && _h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.inspectOnFailureHint')),
_h('label', { className: 'dsh-cron-checkbox-row', style: { marginTop: '8px' } },
_h('input', {
type: 'checkbox',
checked: formRequireApproval,
onChange: (e) => setFormRequireApproval(e.target.checked)
}),
_h('span', null, T_KEY(t, 'form.requireApprovalLabel'))
),
formRequireApproval && _h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.requireApprovalHint'))
),
formType === 'http' && _h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.httpMethodLabel')),
_h('select', {
value: formHttpMethod,
onChange: (e) => setFormHttpMethod(e.target.value)
},
['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => _h('option', { key: m, value: m }, m))
)
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.httpUrlLabel')),
_h('input', {
required: true,
value: formHttpUrl,
placeholder: 'https://example.test/webhook',
onChange: (e) => setFormHttpUrl(e.target.value)
})
)
),
formType === 'http' && _h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.httpHeadersLabel')),
_h('input', {
value: formHttpHeaders,
placeholder: '{"Authorization":"Bearer ..."}',
onChange: (e) => setFormHttpHeaders(e.target.value)
})
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.httpBodyLabel')),
_h('input', {
value: formHttpBody,
onChange: (e) => setFormHttpBody(e.target.value)
})
)
),
formType === 'ssh' && _h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.sshProfileLabel')),
_h('input', {
value: formSshProfileId,
placeholder: 'prod-web',
onChange: (e) => setFormSshProfileId(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.sshProfileHint'))
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.sshTargetLabel')),
_h('input', {
value: formSshTarget,
placeholder: 'user@example.com',
onChange: (e) => setFormSshTarget(e.target.value)
}),
_h('input', {
style: { marginTop: '6px' },
value: formSshKeyPath,
placeholder: '~/.ssh/id_ed25519',
onChange: (e) => setFormSshKeyPath(e.target.value)
})
)
),
formType === 'docker' && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.dockerImageLabel')),
_h('input', {
required: true,
value: formDockerImage,
placeholder: 'alpine:3.20',
onChange: (e) => setFormDockerImage(e.target.value)
})
),
formType === 'skill' && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.skillNameLabel')),
_h('input', {
value: formSkillName,
placeholder: 'gitea',
onChange: (e) => setFormSkillName(e.target.value)
})
),
formType === 'workflow' && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.workflowNameLabel')),
_h('input', {
value: formWorkflowName,
placeholder: 'nightly-release',
onChange: (e) => setFormWorkflowName(e.target.value)
})
),
(formType === 'node' || formType === 'python') && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, formType === 'node' ? 'Node.js binary (optional)' : 'Python interpreter (optional)'),
_h('input', {
value: formType === 'node' ? formNodePath : formPythonPath,
placeholder: formType === 'node' ? 'auto' : '.venv/bin/python',
onChange: (e) => (formType === 'node' ? setFormNodePath(e.target.value) : setFormPythonPath(e.target.value))
})
),
!AGENT_FORM_TYPES.includes(formType) && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.envLabel')),
_h('textarea', {
rows: 3,
style: { fontFamily: 'monospace', fontSize: '12.5px' },
value: formEnv,
placeholder: T_KEY(t, 'form.envPlaceholder'),
onChange: (e) => setFormEnv(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.envHint'))
),
_h('div', { className: 'dsh-cron-form-row' },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.cwdLabel')),
_h('input', {
value: formCwd,
placeholder: '/srv/app',
onChange: (e) => setFormCwd(e.target.value)
})
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.workspaceLabel')),
_h('input', {
value: formWorkspaceId,
onChange: (e) => setFormWorkspaceId(e.target.value)
})
)
),
AGENT_FORM_TYPES.includes(formType) && _h('div', { className: 'dsh-cron-form-group' },
_h('label', { className: 'dsh-cron-checkbox-row' },
_h('input', {
type: 'checkbox',
checked: formWorktree,
onChange: (e) => setFormWorktree(e.target.checked)
}),
_h('span', null, T_KEY(t, 'form.worktreeLabel'))
),
formWorktree && _h('label', { className: 'dsh-cron-checkbox-row', style: { marginLeft: '24px', marginTop: '6px' } },
_h('input', {
type: 'checkbox',
checked: formKeepWorktree,
onChange: (e) => setFormKeepWorktree(e.target.checked)
}),
_h('span', null, T_KEY(t, 'form.keepWorktreeLabel'))
),
_h('label', { className: 'dsh-cron-checkbox-row', style: { marginLeft: formWorktree ? '24px' : '0px', marginTop: '6px' } },
_h('input', {
type: 'checkbox',
checked: formCaptureGitDiff,
onChange: (e) => setFormCaptureGitDiff(e.target.checked)
}),
_h('span', null, T_KEY(t, 'form.captureGitDiffLabel'))
)
),
formType !== 'http' && _h('div', { className: 'dsh-cron-form-group' },
_h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
_h('label', { style: { margin: 0 } }, AGENT_FORM_TYPES.includes(formType) ? T_KEY(t, 'form.promptLabelLlm') : T_KEY(t, 'form.promptLabelScript')),
(selectedTaskMeta && selectedTaskMeta.promptHistory && selectedTaskMeta.promptHistory.length > 0) ? _h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
_h('span', {
style: { fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'var(--dsw-alias-bg-layer-3, #222)', color: 'var(--dsh-cron-info, #4af)', border: '1px solid var(--dsw-alias-border-l2, #333)' }
}, 'v' + (selectedTaskMeta.promptVersion || 1) + ' (' + (selectedTaskMeta.promptHistory[selectedTaskMeta.promptHistory.length - 1]?.successRate !== undefined ? Math.round(selectedTaskMeta.promptHistory[selectedTaskMeta.promptHistory.length - 1].successRate * 100) : 100) + '% SR)'),
_h('select', {
style: { fontSize: '11px', padding: '1px 4px', background: 'var(--dsw-alias-bg-base, #111)', color: 'var(--dsw-alias-label-primary, #ddd)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '4px' },
onChange: (e) => {
const targetV = Number(e.target.value);
const entry = selectedTaskMeta.promptHistory.find((rev) => rev.version === targetV);
if (entry && entry.prompt) {
setFormPrompt(entry.prompt);
}
}
},
selectedTaskMeta.promptHistory.map((rev) => _h('option', { key: rev.version, value: rev.version }, 'v' + rev.version + ' (' + Math.round((rev.successRate || 1) * 100) + '%)'))
)
) : null
),
_h('textarea', {
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
_h('div', {
style: {
background: 'var(--dsw-alias-bg-layer-3, color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent))',
border: '1px solid var(--dsw-alias-border-l2)',
borderRadius: '8px',
padding: '12px 14px',
marginBottom: '16px'
}
},
_h('div', { style: { fontWeight: 500, fontSize: '13px', color: 'var(--dsw-alias-label-primary, #eee)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' } },
_h('span', { style: { display: 'flex', alignItems: 'center', color: 'var(--dsh-cron-info)' }, ...iconHtml(ICON_TELEGRAM) }),
T_KEY(t, 'form.notifyTitle')
),
_h('label', { className: 'dsh-cron-checkbox-row', style: { marginBottom: formNotifyTelegram ? '8px' : '0' } },
_h('input', {
type: 'checkbox',
checked: formNotifyTelegram,
onChange: (e) => setFormNotifyTelegram(e.target.checked)
}),
_h('span', null, T_KEY(t, 'form.notifyTelegram'))
),
(formNotifyTelegram || formChannels.length > 0) && _h('label', { className: 'dsh-cron-checkbox-row', style: { marginLeft: '24px', marginTop: '6px' } },
_h('input', {
type: 'checkbox',
checked: formOnlyOnFailure,
onChange: (e) => setFormOnlyOnFailure(e.target.checked)
}),
_h('span', null, T_KEY(t, 'form.notifyOnlyFailure'))
),
_h('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--dsw-alias-border-l2)' } },
_h('div', { style: { fontWeight: 500, fontSize: '12.5px', color: 'var(--dsw-alias-label-secondary, #aaa)', marginBottom: '8px' } }, T_KEY(t, 'form.channelsTitle')),
_h('div', { className: 'dsh-cron-channel-grid' },
...DELIVERY_CHANNELS.map((id) => _h('label', { key: id, className: 'dsh-cron-checkbox-row' },
_h('input', {
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
_h('span', null, T_KEY(t, CHANNEL_LABEL_KEYS[id]))
))
),
_h('div', { className: 'dsh-cron-hint', style: { marginTop: '6px' } }, T_KEY(t, 'form.channelsHint'))
),
_h('div', { className: 'dsh-cron-form-group', style: { marginTop: '12px', marginBottom: 0 } },
_h('label', null, T_KEY(t, 'form.templateLabel')),
_h('input', {
type: 'text',
value: formTemplate,
placeholder: T_KEY(t, 'form.templatePlaceholder'),
onChange: (e) => setFormTemplate(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.templateHint'))
),
!AGENT_FORM_TYPES.includes(formType) && _h('div', { className: 'dsh-cron-form-group', style: { marginTop: '12px', marginBottom: 0 } },
_h('label', null, T_KEY(t, 'form.silentRuleLabel')),
_h('input', {
type: 'text',
value: formSilentRule,
placeholder: T_KEY(t, 'form.silentRulePlaceholder'),
onChange: (e) => setFormSilentRule(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.silentRuleHint'))
)
),
_h('div', {
style: {
marginTop: '16px',
paddingTop: '14px',
borderTop: '1px solid var(--dsw-alias-border-l2)'
}
},
_h('div', { style: { fontWeight: '600', fontSize: '13px', marginBottom: '10px' } }, T_KEY(t, 'form.reliabilityTitle')),
_h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.preflightLabel')),
_h('select', {
value: formPreflightType,
onChange: (e) => setFormPreflightType(e.target.value)
},
_h('option', { value: 'none' }, T_KEY(t, 'form.preflightNone')),
_h('option', { value: 'http' }, T_KEY(t, 'form.preflightHttp')),
_h('option', { value: 'shell' }, T_KEY(t, 'form.preflightShell')),
_h('option', { value: 'disk' }, T_KEY(t, 'form.preflightDisk'))
)
),
formPreflightType !== 'none' && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.preflightTargetLabel')),
_h('input', {
type: 'text',
value: formPreflightTarget,
placeholder: T_KEY(t, 'form.preflightTargetPlaceholder'),
onChange: (e) => setFormPreflightTarget(e.target.value)
})
)
),
_h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.heartbeatIntervalLabel')),
_h('input', {
type: 'number',
value: formHeartbeatIntervalSeconds,
min: 0,
onChange: (e) => setFormHeartbeatIntervalSeconds(Number(e.target.value))
})
),
formHeartbeatIntervalSeconds > 0 && _h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.gracePeriodLabel')),
_h('input', {
type: 'number',
value: formGracePeriodSeconds,
min: 1,
onChange: (e) => setFormGracePeriodSeconds(Number(e.target.value))
})
)
),
_h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.priorityLabel')),
_h('input', {
type: 'number',
value: formPriority,
min: 1,
max: 10,
onChange: (e) => setFormPriority(Number(e.target.value))
})
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.concurrencyGroupLabel')),
_h('input', {
type: 'text',
value: formConcurrencyGroup,
onChange: (e) => setFormConcurrencyGroup(e.target.value)
})
)
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.selfHealingLabel')),
_h('input', {
type: 'text',
value: formSelfHealingCommand,
placeholder: T_KEY(t, 'form.selfHealingPlaceholder'),
onChange: (e) => setFormSelfHealingCommand(e.target.value)
})
),
_h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' } },
_h('input', {
type: 'checkbox',
id: 'formAutoDiagnoseCheckbox',
checked: formAutoDiagnose,
onChange: (e) => setFormAutoDiagnose(e.target.checked)
}),
_h('label', { htmlFor: 'formAutoDiagnoseCheckbox', style: { margin: 0, fontSize: '12.5px', cursor: 'pointer' } }, T_KEY(t, 'form.autoDiagnoseLabel'))
)
),
_h('div', {
style: {
marginTop: '16px',
paddingTop: '14px',
borderTop: '1px solid var(--dsw-alias-border-l2)'
}
},
_h('div', { style: { fontWeight: '600', fontSize: '13px', marginBottom: '10px' } }, '⛓️ ' + T_KEY(t, 'form.chainingTitle')),
_h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.onSuccessLabel')),
_h('input', {
type: 'text',
value: formOnSuccess,
placeholder: 'task-build, task-test',
onChange: (e) => setFormOnSuccess(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.onSuccessHint'))
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.onFailureLabel')),
_h('input', {
type: 'text',
value: formOnFailure,
placeholder: 'task-alert',
onChange: (e) => setFormOnFailure(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.onFailureHint'))
)
),
_h('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginTop: '8px' } },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.dependsOnLabel')),
_h('input', {
type: 'text',
value: formDependsOn,
placeholder: 'task-build, task-lint',
onChange: (e) => setFormDependsOn(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.dependsOnHint'))
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'form.joinPolicyLabel')),
_h('select', {
value: formJoinPolicy,
onChange: (e) => setFormJoinPolicy(e.target.value)
},
_h('option', { value: 'all_success' }, T_KEY(t, 'form.joinPolicyAll')),
_h('option', { value: 'any_success' }, T_KEY(t, 'form.joinPolicyAny'))
)
)
),
_h('div', { className: 'dsh-cron-form-group', style: { marginTop: '8px' } },
_h('label', null, T_KEY(t, 'form.elseTaskLabel')),
_h('input', {
type: 'text',
value: formElseTask || '',
placeholder: T_KEY(t, 'form.elseTaskPlaceholder'),
onChange: (e) => setFormElseTask(e.target.value)
}),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.elseTaskHint'))
),
_h('div', { className: 'dsh-cron-form-group', style: { marginTop: '8px' } },
_h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
_h('input', {
type: 'checkbox',
checked: Boolean(formAutoHeal),
onChange: (e) => setFormAutoHeal(e.target.checked)
}),
_h('span', { style: { fontWeight: '600' } }, '🩺 ' + T_KEY(t, 'form.autoHealLabel'))
),
_h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.autoHealHint'))
),
_h('div', { style: { marginTop: '12px', padding: '10px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: '6px' } },
_h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' } },
_h('input', {
type: 'checkbox',
checked: formAdaptiveEnabled,
onChange: (e) => setFormAdaptiveEnabled(e.target.checked)
}),
T_KEY(t, 'form.adaptiveEnabled')
),
_h('div', { className: 'dsh-cron-hint', style: { marginLeft: '24px' } }, T_KEY(t, 'form.adaptiveHint')),
formAdaptiveEnabled && _h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginTop: '8px', marginLeft: '24px' } },
_h('div', null,
_h('label', { style: { fontSize: '11px' } }, 'Min'),
_h('input', { type: 'text', value: formAdaptiveMinInterval, placeholder: '5m', onChange: (e) => setFormAdaptiveMinInterval(e.target.value) })
),
_h('div', null,
_h('label', { style: { fontSize: '11px' } }, 'Max'),
_h('input', { type: 'text', value: formAdaptiveMaxInterval, placeholder: '2h', onChange: (e) => setFormAdaptiveMaxInterval(e.target.value) })
),
_h('div', null,
_h('label', { style: { fontSize: '11px' } }, 'Factor'),
_h('input', { type: 'number', step: '0.1', value: formAdaptiveBackoffFactor, placeholder: '1.5', onChange: (e) => setFormAdaptiveBackoffFactor(e.target.value) })
),
_h('div', null,
_h('label', { style: { fontSize: '11px' } }, 'Idle Runs'),
_h('input', { type: 'number', value: formAdaptiveIdleThreshold, placeholder: '3', onChange: (e) => setFormAdaptiveIdleThreshold(e.target.value) })
)
)
)
),
selectedTaskMeta && _h('div', {
style: {
background: 'var(--dsw-alias-bg-layer-3, color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent))',
border: '1px solid var(--dsw-alias-border-l2)',
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
_h('div', null,
_h('span', null, T_KEY(t, 'form.nextRunLabel')),
_h('strong', { style: { color: 'var(--dsw-alias-label-primary, #eee)' } }, selectedTaskMeta.nextRunAt ? new Date(selectedTaskMeta.nextRunAt).toLocaleString() : T_KEY(t, 'form.notScheduled'))
),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '4px 10px', fontSize: '12px' },
onClick: async () => {
await handleRunNow(selectedTaskMeta.id);
if (formId) loadTaskHistory(formId);
}
}, T_KEY(t, 'actions.runNow'))
),
_h('div', { className: 'dsh-cron-modal-foot' },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: closeManualModalWithConfirm
}, T_KEY(t, 'modal.cancel')),
_h('button', {
type: 'submit',
className: 'dsh-cron-btn-primary'
}, formId ? T_KEY(t, 'modal.save') : T_KEY(t, 'modal.create'))
)
)
)
),
dryRunResult && _h('div', { className: 'dsh-cron-modal-overlay', onClick: () => setDryRunResult(null) },
_h('div', {
className: 'dsh-cron-modal',
style: { maxWidth: '580px' },
role: 'dialog',
'aria-modal': 'true',
onClick: (e) => e.stopPropagation()
},
_h('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
_h('div', { className: 'dsh-cron-modal-title', style: { margin: 0 } }, T_KEY(t, 'dryRun.title')),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
onClick: () => setDryRunResult(null)
}, '✕')
),
_h('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' } },
_h('div', null, _h('strong', null, T_KEY(t, 'dryRun.status') + ': '), _h('span', { style: { color: dryRunResult.ok ? 'var(--dsh-cron-success)' : 'var(--dsh-cron-danger)' } }, dryRunResult.ok ? ((dryRunResult.result && dryRunResult.result.status) || dryRunResult.status || 'success') : 'failed')),
((dryRunResult.result && dryRunResult.result.preflight) || dryRunResult.preflight) && _h('div', null, _h('strong', null, T_KEY(t, 'dryRun.preflight') + ': '), _h('span', null, (((dryRunResult.result && dryRunResult.result.preflight) || dryRunResult.preflight).passed) ? '✓ Passed' : '✗ Failed (' + ((((dryRunResult.result && dryRunResult.result.preflight) || dryRunResult.preflight).reason) || '') + ')')),
_h('div', null, _h('strong', null, T_KEY(t, 'dryRun.duration') + ': '), _h('span', null, (((dryRunResult.result && dryRunResult.result.durationMs) !== undefined ? dryRunResult.result.durationMs : dryRunResult.durationMs) || 0) + 'ms')),
_h('div', { style: { marginTop: '6px' } }, _h('strong', null, T_KEY(t, 'dryRun.output') + ':')),
_h('pre', {
style: {
background: 'var(--dsw-alias-bg-layer-2)',
border: '1px solid var(--dsw-alias-border-l2)',
borderRadius: '6px',
padding: '10px',
maxHeight: '220px',
overflowY: 'auto',
fontSize: '12px',
whiteSpace: 'pre-wrap',
wordBreak: 'break-word',
color: 'var(--dsw-alias-label-primary)'
}
}, ((dryRunResult.result && dryRunResult.result.output) !== undefined ? dryRunResult.result.output : (dryRunResult.output !== undefined ? dryRunResult.output : ((dryRunResult.result && dryRunResult.result.error) || dryRunResult.error || '(no output)'))))
),
_h('div', { className: 'dsh-cron-modal-foot', style: { marginTop: '16px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
onClick: () => setDryRunResult(null)
}, T_KEY(t, 'dryRun.close'))
)
)
),
archiveModalOpen && _h('div', { className: 'dsh-cron-modal-overlay', onClick: () => setArchiveModalOpen(false) },
_h('div', {
className: 'dsh-cron-modal',
style: { maxWidth: '700px' },
role: 'dialog',
'aria-modal': 'true',
onClick: (e) => e.stopPropagation()
},
_h('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
_h('div', { className: 'dsh-cron-modal-title', style: { margin: 0 } }, T_KEY(t, 'archive.title') + (archiveTask ? ' - ' + archiveTask.title : '')),
_h('button', {
type: 'button',
className: 'dsh-cron-icon-btn',
onClick: () => setArchiveModalOpen(false)
}, '✕')
),
_h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #999)', margin: '4px 0 12px 0' } },
T_KEY(t, 'archive.totalRuns', { total: archiveTotal })
),
archiveLoading ? _h('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'history.loading')) :
archiveRuns.length === 0 ? _h('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'archive.empty')) :
_h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' } },
archiveRuns.map((r, idx) => _h('div', {
key: idx,
style: {
background: 'var(--dsw-alias-bg-layer-2)',
border: '1px solid var(--dsw-alias-border-l2)',
borderRadius: '6px',
padding: '8px 12px',
fontSize: '12px'
}
},
_h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
_h('span', { style: { fontWeight: '600', color: r.status === 'success' ? 'var(--dsh-cron-success)' : 'var(--dsh-cron-danger)' } }, (r.status || 'unknown').toUpperCase()),
_h('span', { style: { color: 'var(--dsw-alias-label-secondary, #888)' } }, (r.at || r.timestamp || r.startedAt) ? new Date(r.at || r.timestamp || r.startedAt).toLocaleString() : "")
),
r.durationMs > 0 && _h('div', { style: { color: 'var(--dsw-alias-label-secondary, #888)', marginBottom: '4px' } }, 'Duration: ' + r.durationMs + 'ms'),
r.chainRunId && _h('div', { style: { marginBottom: '4px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' },
onClick: () => openChainGraphModal(null, r.chainRunId)
}, '🕸️ ' + T_KEY(t, 'chainGraph.viewGraph'))
),
r.error && _h('div', { style: { color: 'var(--dsh-cron-danger)', marginBottom: '4px' } }, 'Error: ' + r.error),
r.output && _h('div', {
style: {
color: 'var(--dsw-alias-label-primary, #ccc)',
whiteSpace: 'pre-wrap',
wordBreak: 'break-word',
maxHeight: '80px',
overflowY: 'auto'
}
}, r.output.slice(0, 300) + (r.output.length > 300 ? '...' : ''))
))
),
_h('div', { className: 'dsh-cron-modal-foot', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' } },
archiveRuns.length < archiveTotal ? _h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: () => {
const nextOffset = archiveRuns.length;
if (archiveTask) openArchiveModal(archiveTask, nextOffset);
}
}, T_KEY(t, 'archive.loadMore', { shown: archiveRuns.length, total: archiveTotal })) : _h('div', null),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
onClick: () => setArchiveModalOpen(false)
}, T_KEY(t, 'archive.close'))
)
)
),
settingsModalOpen && _h('div', { className: 'dsh-cron-modal-overlay', onClick: () => setSettingsModalOpen(false) },
_h('div', { className: 'dsh-cron-modal dsh-cron-modal-scroll', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
_h('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' } },
_h('div', { className: 'dsh-cron-modal-title', style: { margin: 0, display: 'flex', alignItems: 'center', gap: '8px' } },
_h('span', { style: { display: 'flex', alignItems: 'center', color: 'var(--dsh-cron-info)' }, ...iconHtml(ICON_TELEGRAM) }),
T_KEY(t, 'settings.modalTitle')
),
_h('button', {
type: 'button',
style: { background: 'none', border: 'none', color: 'var(--dsw-alias-label-tertiary, #888)', cursor: 'pointer', fontSize: '18px' },
onClick: () => setSettingsModalOpen(false)
}, '✕')
),
_h('form', { onSubmit: handleSaveSettings },
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'settings.tokenLabel')),
_h('input', {
type: 'password',
value: settingsBotToken,
placeholder: settingsHasDefault ? T_KEY(t, 'settings.tokenPlaceholderDefault') : T_KEY(t, 'settings.tokenPlaceholder'),
onChange: (e) => setSettingsBotToken(e.target.value)
}),
settingsHasDefault && _h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'settings.defaultHint'))
),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'settings.chatIdLabel')),
_h('input', {
value: settingsChatId,
placeholder: T_KEY(t, 'settings.chatIdPlaceholder'),
onChange: (e) => setSettingsChatId(e.target.value)
})
),
_h('div', { style: { background: 'var(--dsw-alias-bg-layer-3, color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent))', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' } },
_h('label', { className: 'dsh-cron-checkbox-row', style: { marginBottom: '8px' } },
_h('input', {
type: 'checkbox',
checked: settingsNotifyGlobal,
onChange: (e) => setSettingsNotifyGlobal(e.target.checked)
}),
_h('span', null, T_KEY(t, 'settings.globalNotify'))
),
_h('label', { className: 'dsh-cron-checkbox-row' },
_h('input', {
type: 'checkbox',
checked: settingsOnlyOnFailureGlobal,
onChange: (e) => setSettingsOnlyOnFailureGlobal(e.target.checked)
}),
_h('span', null, T_KEY(t, 'settings.globalOnlyFailure'))
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
_h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { display: 'inline-flex', alignItems: 'center', gap: '6px' },
disabled: testStatus?.loading,
onClick: handleTestTelegram
}, testStatus?.loading ? T_KEY(t, 'settings.sending') : T_KEY(t, 'settings.testTelegram'))
),
testStatus && testStatus.message && _h('div', {
className: 'dsh-cron-status-banner',
'data-type': testStatus.success ? 'success' : 'error'
}, testStatus.message),
_h('div', { className: 'dsh-cron-modal-foot' },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: () => setSettingsModalOpen(false)
}, T_KEY(t, 'modal.cancel')),
_h('button', {
type: 'submit',
className: 'dsh-cron-btn-primary'
}, T_KEY(t, 'settings.save'))
)
)
)
),
importDoc && _h('div', { className: 'dsh-cron-modal-overlay', onClick: () => !transferBusy && setImportDoc(null) },
_h('div', { className: 'dsh-cron-modal', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
_h('div', { className: 'dsh-cron-modal-title' }, T_KEY(t, 'transfer.importTitleModal')),
_h('div', { className: 'dsh-cron-hint', style: { marginBottom: '10px' } }, T_KEY(t, 'transfer.importHint')),
importSummary && _h('div', null,
_h('div', { style: { fontSize: '13px', marginBottom: '12px' } },
T_KEY(t, 'transfer.summary', {
total: (importSummary.add || 0) + (importSummary.replace || 0) + (importSummary.skip || 0),
add: importSummary.add || 0,
replace: importSummary.replace || 0,
skip: importSummary.skip || 0
})
),
_h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' } },
...['add', 'replace', 'skip'].map((mode) => _h('label', { key: mode, className: 'dsh-cron-checkbox-row' },
_h('input', {
type: 'radio',
name: 'dsh-cron-import-strategy',
checked: importStrategy === mode,
onChange: () => setImportStrategy(mode)
}),
_h('span', null, T_KEY(t, mode === 'add' ? 'transfer.strategyAdd' : mode === 'replace' ? 'transfer.strategyReplace' : 'transfer.strategySkip'))
))
)
),
_h('div', { className: 'dsh-cron-modal-foot' },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
disabled: transferBusy,
onClick: () => setImportDoc(null)
}, T_KEY(t, 'modal.cancel')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
disabled: transferBusy || !importSummary,
onClick: handleImportConfirm
}, T_KEY(t, 'transfer.confirm'))
)
)
),
dshModalOpen && _h('div', { className: 'dsh-cron-modal-overlay', onClick: () => !dshLoading && setDshModalOpen(false) },
_h('div', { className: 'dsh-cron-modal', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
_h('div', { className: 'dsh-cron-modal-title' }, T_KEY(t, 'dsh.modalTitle')),
_h('div', { className: 'dsh-cron-form-group' },
_h('label', null, T_KEY(t, 'dsh.descLabel')),
_h('div', { className: 'dsh-cron-chat-box' },
_h('textarea', {
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
_h('div', { className: 'dsh-cron-chat-foot' },
_h('span', { className: 'dsh-cron-chat-hint' }, T_KEY(t, 'dsh.sendHint')),
_h('button', {
type: 'button',
className: 'dsh-cron-send-btn',
disabled: dshLoading || !dshPrompt.trim(),
title: T_KEY(t, 'dsh.sendTitle'),
onClick: handleStartWithDSH
},
_h('span', svgProps(ICON_SEND))
)
)
)
),
_h('div', { className: 'dsh-cron-modal-foot' },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
disabled: dshLoading,
onClick: () => setDshModalOpen(false)
}, T_KEY(t, 'modal.cancel'))
)
)
),
renderChainGraphModal({
isOpen: chainGraphModalOpen,
onClose: () => setChainGraphModalOpen(false),
data: chainGraphData,
loading: chainGraphLoading,
onRetry: handleRetryChainStep,
t
}),
renderLiveLogsModal({
isOpen: liveLogsModalOpen,
onClose: handleCloseLiveLogs,
taskId: liveLogsTaskId,
taskTitle: liveLogsTaskTitle,
logs: liveLogsLines,
autoScroll: liveLogsAutoScroll,
onToggleAutoScroll: () => setLiveLogsAutoScroll((v) => !v),
completed: liveLogsCompleted,
status: liveLogsStatus,
t
}),
renderAnalyticsDigestModal({
isOpen: digestOpen,
onClose: () => setDigestOpen(false),
digestData,
isLoading: digestLoading,
periodDays,
onSelectPeriod,
onSendTelegram,
sendStatus,
t
}),
renderTimelineHeatmapModal({
isOpen: timelineOpen,
onClose: () => setTimelineOpen(false),
activeTab: timelineTab,
onSelectTab: onSelectTimelineTab,
timelineData,
heatmapData,
isLoading: timelineLoading,
t
})
);
}
function CronSettingsCard(props) {
const { ctx, toggle } = props;
const t = props.t || translate;
const [token, setToken] = React.useState('');
const [chatId, setChatId] = React.useState('');
const [notify, setNotify] = React.useState(false);
const [onlyFailure, setOnlyFailure] = React.useState(false);
const [llmActionsEnabled, setLlmActionsEnabled] = React.useState(false);
const [enableDynamicCredentials, setEnableDynamicCredentials] = React.useState(false);
const [kanbanUrl, setKanbanUrl] = React.useState('http://127.0.0.1:3000');
const [delivery, setDelivery] = React.useState({});
const [sections, setSections] = React.useState({ channels: true });
const [hasDefault, setHasDefault] = React.useState(false);
const [saved, setSaved] = React.useState(false);
const [testInfo, setTestInfo] = React.useState(null);
const [cardOpen, setCardOpen] = React.useState(false);
const [updateState, setUpdateState] = React.useState({
checking: false,
updating: false,
currentVersion: '',
latestVersion: undefined,
updateAvailable: false,
notice: null,
error: null
});
const checkUpdates = async () => {
setUpdateState(prev => ({ ...prev, checking: true, error: null, notice: null }));
try {
const { res, data } = await fetchJsonWithTimeout('/api/dsh-cron/update');
if (data && data.currentVersion) {
setUpdateState(prev => ({
...prev,
checking: false,
currentVersion: data.currentVersion,
latestVersion: data.latestVersion,
updateAvailable: Boolean(data.updateAvailable),
error: data.latestCheckFailed ? 'Registry check failed' : null
}));
} else {
setUpdateState(prev => ({ ...prev, checking: false, error: data.error || 'Check failed' }));
}
} catch (err) {
setUpdateState(prev => ({ ...prev, checking: false, error: err.message }));
}
};
const runUpdate = async () => {
setUpdateState(prev => ({ ...prev, updating: true, error: null, notice: null }));
try {
const { res, data } = await fetchJsonWithTimeout('/api/dsh-cron/update', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-dsh-plugin-update': '1' }
});
if (data && data.updated) {
setUpdateState(prev => ({
...prev,
updating: false,
updateAvailable: false,
currentVersion: data.updatedVersion || data.latestVersion,
notice: T_KEY(t, 'updater.success', { version: data.updatedVersion || data.latestVersion })
}));
} else {
setUpdateState(prev => ({
...prev,
updating: false,
error: data.error || data.message || 'Update failed'
}));
}
} catch (err) {
setUpdateState(prev => ({ ...prev, updating: false, error: err.message }));
}
};
const [loadState, setLoadState] = React.useState('loading');
const [reloadTick, setReloadTick] = React.useState(0);
React.useEffect(() => {
let active = true;
setLoadState('loading');
fetchJsonWithTimeout('/dsh-cron/settings')
.then(({ data }) => {
if (!active) return;
if (data && data.ok && data.settings) {
setToken(data.settings.botToken || '');
setChatId(data.settings.chatId || '');
setNotify(Boolean(data.settings.notifyTelegram));
setOnlyFailure(Boolean(data.settings.onlyOnFailure));
setLlmActionsEnabled(Boolean(data.settings.llmActionsEnabled));
setEnableDynamicCredentials(Boolean(data.settings.enableDynamicCredentials));
setKanbanUrl(data.settings.kanbanBaseUrl || 'http://127.0.0.1:3000');
setDelivery(pickDeliverySettings(data.settings));
setHasDefault(Boolean(data.settings.hasDefaultCredentials));
if (data.settings.version) {
setUpdateState(prev => ({ ...prev, currentVersion: data.settings.version }));
}
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
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/settings', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(Object.assign({
botToken: token,
chatId,
notifyTelegram: notify,
onlyOnFailure: onlyFailure,
llmActionsEnabled: llmActionsEnabled,
enableDynamicCredentials: enableDynamicCredentials,
kanbanBaseUrl: kanbanUrl
}, delivery))
});
if (data && data.ok) {
setSaved(true);
setTimeout(() => setSaved(false), 2500);
}
} catch (err) {
console.debug('[dsh-cron] save settings failed', err);
}
};
const testTelegram = async () => {
setTestInfo({ loading: true, message: T_KEY(t, 'settings.sending') });
try {
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/telegram/test', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ botToken: token, chatId })
});
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
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/kanban/test', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ kanbanBaseUrl: kanbanUrl })
});
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
return _h('div', { className: 'dsh-cron-card' },
_h('div', { className: 'dsh-cron-card-title' }, T_KEY(t, 'settings.cardTitle')),
_h('div', {
className: 'dsh-cron-status-banner',
'data-type': loadState === 'error' ? 'error' : 'info',
style: { marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }
},
_h('span', null, loadState === 'error' ? T_KEY(t, 'settings.unavailable') : T_KEY(t, 'settings.loading')),
loadState === 'error' && _h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: () => setReloadTick(x => x + 1)
}, T_KEY(t, 'settings.retry'))
)
);
}
if (props && props.view === 'summary') {
return _h('span', { className: 'dsh-cron-card-desc' }, T_KEY(t, 'settings.cardDesc'));
}
const page = !!(props && props.view === 'page');
return _h('div', { className: page ? 'dsh-cron-page' : 'dsh-cron-card' },
_h('button', {
type: 'button',
className: 'dsh-cron-card-head-btn',
style: page ? { display: 'none' } : undefined,
'aria-expanded': (page || cardOpen) ? 'true' : 'false',
onClick: () => setCardOpen(!cardOpen)
},
_h('span', { className: 'dsh-cron-card-title' }, T_KEY(t, 'settings.cardTitle')),
_h('span', { className: 'dsh-cron-chev' + (cardOpen ? ' dsh-cron-chev-open' : '') }, chevronNode())
),
(page || cardOpen) && _h('div', { className: 'dsh-cron-card-body' },
_h('div', { className: 'dsh-cron-card-desc' }, T_KEY(t, 'settings.cardDesc')),
_h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
onClick: () => { if (toggle) toggle.set(true); }
}, T_KEY(t, 'settings.openPanel'))
),
_h('form', { onSubmit: saveSettings, style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
_h('div', { className: 'dsh-cron-form-group', style: { marginBottom: 0 } },
_h('label', null, T_KEY(t, 'settings.tokenLabel')),
_h('input', {
type: 'password',
value: token,
placeholder: hasDefault ? T_KEY(t, 'settings.tokenPlaceholderDefault') : T_KEY(t, 'settings.tokenPlaceholder'),
onChange: (e) => setToken(e.target.value)
}),
hasDefault && _h('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'settings.defaultHint'))
),
_h('div', { className: 'dsh-cron-form-group', style: { marginBottom: 0 } },
_h('label', null, T_KEY(t, 'settings.chatIdLabel')),
_h('input', {
value: chatId,
placeholder: T_KEY(t, 'settings.chatIdPlaceholder'),
onChange: (e) => setChatId(e.target.value)
})
),
_h('div', { className: 'dsh-cron-form-group', style: { marginBottom: 0 } },
_h('label', null, T_KEY(t, 'settings.kanbanUrlLabel')),
_h('input', {
value: kanbanUrl,
placeholder: 'http://127.0.0.1:3000',
onChange: (e) => setKanbanUrl(e.target.value)
})
),
_h('div', { style: { background: 'var(--dsw-alias-bg-layer-3, color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent))', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '6px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
_h('label', { className: 'dsh-cron-checkbox-row' },
_h('input', {
type: 'checkbox',
checked: notify,
onChange: (e) => setNotify(e.target.checked)
}),
_h('span', null, T_KEY(t, 'settings.globalNotify'))
),
_h('label', { className: 'dsh-cron-checkbox-row' },
_h('input', {
type: 'checkbox',
checked: onlyFailure,
onChange: (e) => setOnlyFailure(e.target.checked)
}),
_h('span', null, T_KEY(t, 'settings.globalOnlyFailure'))
),
_h('label', { className: 'dsh-cron-checkbox-row' },
_h('input', {
type: 'checkbox',
checked: llmActionsEnabled,
onChange: (e) => setLlmActionsEnabled(e.target.checked)
}),
_h('span', null, 'Enable Structured LLM Actions (trigger tasks, notify, create issues)')
),
_h('label', { className: 'dsh-cron-checkbox-row' },
_h('input', {
type: 'checkbox',
checked: enableDynamicCredentials,
onChange: (e) => setEnableDynamicCredentials(e.target.checked)
}),
_h('span', null, T_KEY(t, 'settings.dynamicCredentials'))
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
testInfo && testInfo.message && _h('div', {
className: 'dsh-cron-status-banner',
'data-type': testInfo.success ? 'success' : 'error',
style: { margin: 0, padding: '8px 12px' }
}, testInfo.message),
_h('div', {
className: 'dsh-cron-form-group',
style: {
background: 'var(--dsw-alias-bg-layer-2, color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent))',
border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent))',
borderRadius: '8px',
padding: '14px',
marginBottom: '16px'
}
},
_h('div', {
style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }
},
_h('div', { style: { fontWeight: '600', fontSize: '14px' } }, `🚀 ${T_KEY(t, 'updater.title')}`),
_h('div', { style: { display: 'flex', gap: '8px' } },
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
style: { padding: '4px 10px', fontSize: '12px' },
disabled: updateState.checking || updateState.updating,
onClick: checkUpdates
}, updateState.checking ? T_KEY(t, 'updater.checking') : T_KEY(t, 'updater.btnCheck')),
updateState.updateAvailable ? _h('button', {
type: 'button',
className: 'dsh-cron-btn-primary',
style: { padding: '4px 10px', fontSize: '12px' },
disabled: updateState.updating,
onClick: runUpdate
}, updateState.updating ? T_KEY(t, 'updater.updating') : T_KEY(t, 'updater.btnUpdate', { version: updateState.latestVersion })) : null
)
),
_h('div', {
style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #999)', marginBottom: '8px' }
}, T_KEY(t, 'updater.desc')),
_h('div', {
style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }
},
_h('span', { style: { color: 'var(--dsw-alias-label-secondary, #aaa)' } },
updateState.currentVersion ? T_KEY(t, 'updater.current', { version: updateState.currentVersion }) : ''
),
updateState.checking ? _h('span', { className: 'dsh-cron-badge dsh-cron-badge-info' }, T_KEY(t, 'updater.checking')) :
updateState.updateAvailable ? _h('span', { className: 'dsh-cron-badge dsh-cron-badge-warn' }, T_KEY(t, 'updater.available', { version: updateState.latestVersion })) :
updateState.currentVersion && !updateState.error && !updateState.checking ? _h('span', { className: 'dsh-cron-badge dsh-cron-badge-ok' }, `✓ ${T_KEY(t, 'updater.upToDate')}`) : null
),
updateState.notice ? _h('div', {
style: { marginTop: '8px', color: 'var(--dsw-alias-success)', fontSize: '12px' }
}, updateState.notice) : null,
updateState.error ? _h('div', {
style: { marginTop: '8px', color: 'var(--dsw-alias-error)', fontSize: '12px' }
}, updateState.error) : null
),
_h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' } },
_h('button', {
type: 'submit',
className: 'dsh-cron-btn-primary',
style: { minWidth: '140px' }
}, saved ? T_KEY(t, 'settings.saved') : T_KEY(t, 'settings.save')),
_h('button', {
type: 'button',
className: 'dsh-cron-btn-secondary',
onClick: testTelegram,
disabled: testInfo?.loading
}, T_KEY(t, 'settings.testTelegram')),
_h('button', {
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
const SIDEBAR_JOBS_KEY = 'dsh-cron-sidebar-open';
const SIDEBAR_JOBS_MAX_ROWS = 5;
function buildSidebarJobRow(state, task) {
const row = document.createElement('button');
row.type = 'button';
row.className = 'dsh-cron-sidebar-job';
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
const { res, data } = await fetchJsonWithTimeout('/dsh-cron/tasks?status=active');
if (data && data.ok) renderSidebarJobs(state, data.tasks || []);
} catch (err) {
console.debug('[dsh-cron] load sidebar jobs failed', err);
}
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
try { window.localStorage.setItem(SIDEBAR_JOBS_KEY, state.open ? '1' : '0'); } catch (err) { /* localStorage write failed */ }
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
function placeSidebarJobs(state, label) {
if (state.root !== undefined && state.root.isConnected) return;
const entry = document.querySelector('[' + ENTRY_ATTR + ']');
if (entry === null || entry.parentElement === null) return;
if (state.root === undefined) {
entry.insertAdjacentElement('afterend', buildSidebarJobsRoot(state, label));
} else {
entry.insertAdjacentElement('afterend', state.root);
state.root = document.querySelector('[data-dsh-part="sidebar-jobs"]') || state.root;
state.listEl = state.root.querySelector('.dsh-cron-sidebar-jobs-list');
state.headEl = state.root.querySelector('.dsh-cron-sidebar-jobs-head');
}
applySidebarJobsOpen(state);
}
function mountSidebarJobs(toggle, label, openTaskSignal) {
if (typeof document === 'undefined') return () => {};
const state = { toggle, openTaskSignal, root: undefined, listEl: undefined, headEl: undefined, open: false };
try { state.open = window.localStorage.getItem(SIDEBAR_JOBS_KEY) === '1'; } catch (err) { /* localStorage read failed */ }
let rafPending = false;
const schedulePlace = () => {
if (state.root !== undefined && state.root.isConnected) return;
if (rafPending) return;
rafPending = true;
const scheduleFn = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
scheduleFn(() => {
rafPending = false;
placeSidebarJobs(state, label);
});
};
const observer = new MutationObserver(schedulePlace);
observer.observe(document.body, { childList: true, subtree: true });
placeSidebarJobs(state, label);
loadSidebarJobs(state);
const fetchTimer = setInterval(() => {
let isOpen = false;
try { isOpen = window.localStorage.getItem(SIDEBAR_JOBS_KEY) === '1'; } catch (err) { /* localStorage poll failed */ }
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
const teardownPanel = () => {
if (root !== undefined) {
try { root.unmount(); } catch (e) { /* ignore */ }
root = undefined;
}
if (container !== undefined) {
try { container.remove(); } catch (e) { /* ignore */ }
container = undefined;
}
};
const ensure = () => {
if (!toggle.isOpen()) {
teardownPanel();
return;
}
if (container !== undefined && container.isConnected) return;
const column = document.querySelector(COLUMN_SELECTOR);
if (column === null) return;
container = document.createElement('div');
container.setAttribute(VIEW_ATTR, '');
container.setAttribute('data-dsh-plugin', 'dsh-cron');
column.appendChild(container);
if (ReactDOM && typeof ReactDOM.createRoot === 'function') {
root = ReactDOM.createRoot(container);
root.render(_h(ErrorBoundary, null, _h(CronScreen, { ctx, toggle, onClose: () => toggle.set(false), t: translate })));
} else if (ReactDOM && typeof ReactDOM.render === 'function') {
ReactDOM.render(_h(CronScreen, { ctx, toggle, onClose: () => toggle.set(false), t: translate }), container);
}
};
const applyActive = () => {
if (toggle.isOpen()) {
ensureStyles();
document.documentElement.setAttribute(ACTIVE_ATTR, '');
document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL }));
ensure();
} else {
document.documentElement.removeAttribute(ACTIVE_ATTR);
teardownPanel();
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
teardownPanel();
};
}
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
const stopStyleSelfHeal = startStyleSelfHeal();
try {
if (ctx.locale && typeof ctx.locale.register === 'function' && typeof ctx.effect === 'function') {
ctx.effect(() => ctx.locale.register(NS, STRINGS), 'dsh-cron: locale dictionaries');
} else if (ctx.locale && typeof ctx.locale.register === 'function') {
ctx.locale.register(NS, STRINGS);
}
} catch (e) {
void e;
}
try {
if (ctx.locale && typeof ctx.locale.bind === 'function') {
translate = ctx.locale.bind(NS);
}
} catch (err) {
/* locale bind unavailable, fallback to default translate */
}
const toggle = createToggle();
function SettingsCardWithBoundary(props) {
return _h(ErrorBoundary, null, CronSettingsCard(props));
}
const itemOk = registerIntoMount(ctx, 'plugins.item', {
name: 'plugins.item',
id: ROW_ID,
order: 60,
label: () => 'Cron',
locale: NS,
inject: () => ({ ctx, toggle }),
}, SettingsCardWithBoundary);
if (!itemOk) {
console.warn('[dsh-cron] plugins.item slot unavailable — plugin page card not registered');
}
const rowOk = registerIntoMount(ctx, 'plugins.row.config', {
name: 'plugins.row.config',
key: ROW_CONFIG_KEY,
locale: NS,
inject: () => ({ ctx, toggle }),
}, SettingsCardWithBoundary);
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
return _h('button', {
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
return () => { for (const dispose of off) dispose(); stopStyleSelfHeal(); };
}, 'dsh-cron: client overlay');
exports.slots = { card: cardSlot, chip: chipSlot };
}
module.exports = { apply, inject: ['slots', 'locale'] };
return module.exports;
}
})