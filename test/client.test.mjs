import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('client.js registers with window.__ModuleLoader__ without error', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  let loadedId = null;
  let loadedFactory = null;

  const context = {
    window: {
      __ModuleLoader__: {
        load: ({ id, factory }) => {
          loadedId = id;
          loadedFactory = factory;
        }
      }
    },
    document: {
      head: { appendChild: () => {} },
      getElementById: () => null,
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    },
    console,
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  assert.equal(loadedId, '@goodandready/dsh-cron');
  assert.equal(typeof loadedFactory, 'function');
});

test('Issue #85/#87/#91: slot key matches settings namespace, locale registered, styles marked', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');

  // The settings.plugin.item slot key must equal the server-side settings
  // namespace (register('dsh-cron', ...) in lib/index.js) (#85). Mount
  // points are populated via ctx.slots.inject — a direct register never
  // appears in the settings surface.
  assert.ok(code.includes("const NS = 'dsh-cron';"), 'NS must be dsh-cron');
  assert.ok(code.includes("key: NS"), 'settings.plugin.item slot must use the namespace key');
  assert.ok(code.includes("registerIntoMount(ctx, 'settings.plugin.item'"), 'card registered through the mount inject contract');
  assert.ok(!code.includes('settings.section'), 'no top-level section fallback (#102)');

  // Issue #102: the card checks the settings snapshot status and never
  // renders phantom inputs before it arrives.
  assert.ok(code.includes("loadState !== 'ready'"), 'card checks snapshot status before rendering inputs');
  assert.ok(code.includes("settings.retry"), 'unavailable state offers a retry');

  // Issue #100: the settings card follows the canonical collapsible card
  // contract — collapsed by default, head is the toggle.
  assert.ok(code.includes("const [cardOpen, setCardOpen] = React.useState(false);"), 'card collapsed by default');
  assert.ok(code.includes("'aria-expanded': cardOpen ? 'true' : 'false'"), 'head exposes aria-expanded');
  assert.ok(code.includes('dsh-cron-card-head-btn'), 'head is a toggle button');
  assert.ok(code.includes('dsh-cron-chev-open'), 'chevron rotates when open');

  // Execution-engine runtimes (#4 #5 #7 #8 #9 #38): the form offers every
  // runtime and conditional configuration for each of them.
  assert.ok(code.includes("'form.typeNode'"), 'node runtime option present');
  assert.ok(code.includes("'form.typePython'"), 'python runtime option present');
  assert.ok(code.includes("'form.typeHttp'"), 'http runtime option present');
  assert.ok(code.includes("'form.typeSsh'"), 'ssh runtime option present');
  assert.ok(code.includes("'form.typeDocker'"), 'docker runtime option present');
  assert.ok(code.includes('parseEnvText('), 'env textarea parsed into the task env');
  assert.ok(code.includes('CODE_FORM_TYPES'), 'confirm header covers all code-executing runtimes');
  assert.ok(code.includes('AGENT_FORM_TYPES'), 'agent-only fields gated by runtime');

  // English canonical strings live in a locale dictionary that is registered
  // with the DSH locale service (#87)
  assert.ok(code.includes('const STRINGS = {'), 'locale dictionary present');
  assert.ok(code.includes('en: {'), 'English source strings present');
  assert.ok(code.includes('ctx.locale.register(NS, STRINGS)'), 'locale registered with the locale service');

  // Dynamic style tags carry the stable plugin marker (#91)
  assert.ok(code.includes("dataset.dshPlugin = 'dsh-cron'"), 'style tag marked with data-dsh-plugin');

  // Issue #80 regression guards
  assert.ok(code.includes('const [loading, setLoading] = React.useState(false);'), 'setLoading state declared');
  assert.ok(code.includes('const [fetchError, setFetchError] = React.useState(null);'), 'fetchError state declared');
  assert.ok(!code.includes('setRecommendations('), 'no undefined setRecommendations called');
  assert.ok(code.includes('setRecs('), 'setRecs used for recommendations');

  // Background polling regression guard (#82)
  assert.ok(code.includes('setInterval('), 'polling interval present');
  assert.ok(code.includes('clearInterval('), 'cleanup timer on unmount present');
  assert.ok(code.includes("lastStatus: 'running'"), 'instant running status in handleRunNow');
});

test('#25/#26: the UI offers every delivery channel and never drifts from the server list', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  const serverCode = fs.readFileSync(new URL('../lib/channels.js', import.meta.url), 'utf-8');

  const serverIds = JSON.parse(/CHANNEL_IDS = (\[[^\]]*\])/.exec(serverCode)[1].replace(/'/g, '"'));
  const clientIds = JSON.parse(/DELIVERY_CHANNELS = (\[[^\]]*\])/.exec(code)[1].replace(/'/g, '"'));
  assert.deepEqual(clientIds, serverIds, 'client channel list must match the server router');

  for (const id of serverIds) {
    assert.ok(code.includes(`${id}: 'form.channel`), `channel label mapping missing for ${id}`);
  }
  assert.ok(code.includes('const [formChannels, setFormChannels] = React.useState([]);'), 'per-task channel state');
  assert.ok(code.includes('const [formTemplate, setFormTemplate] = React.useState('), 'per-task template state');
  assert.ok(code.includes('channels: formChannels'), 'channels sent with the task payload');
  assert.ok(code.includes('template: formTemplate.trim()'), 'template sent with the task payload');
  assert.ok(code.includes('dsh-cron-channel-grid'), 'channel checkbox grid rendered');

  // The delivery deadline is user-tunable, so it needs a control, not just a
  // Config default (review finding on PR #114).
  assert.ok(code.includes("key: 'deliveryTimeoutMs'") && code.includes('settings.deliveryTimeoutMsLabel'), 'delivery timeout has a settings control');
  assert.ok(code.includes("type: 'number'"), 'the timeout uses a numeric input');
});

test('#40/#41/#42: the list offers filters, duplication and transfer controls', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');

  // #40 — facet filters applied client-side over the loaded list.
  assert.ok(code.includes('const visibleTasks = React.useMemo('), 'the list renders a derived, filtered view');
  assert.ok(code.includes("x.type || 'llm') === filterType"), 'type filter compares the normalised type');
  assert.ok(code.includes("String(x.model || '').split('/').pop() === filterModel"), 'model filter compares the short model name');
  assert.ok(code.includes('channels.includes(filterChannel)'), 'channel filter understands legacy telegram/kanban flags');
  assert.ok(code.includes("'filters.reset'") && code.includes("'filters.empty'"), 'reset and empty states exist');
  assert.ok(code.includes('filters.showing'), 'the filter summary reports shown vs total');

  // #41 — the row carries a duplicate action that calls the server route.
  assert.ok(code.includes('const handleDuplicate = async (task)'), 'duplicate handler present');
  assert.ok(code.includes("'/duplicate'"), 'duplicate uses the server route, not a client-side payload replay');
  assert.ok(code.includes("'actions.duplicate'"), 'duplicate action is labelled');
  assert.ok(code.includes("'duplicate.oneShotHint'"), 'a duplicated one-shot warns about its stale time');

  // #42 — export downloads a file, import goes through a summary + strategy modal.
  assert.ok(code.includes('const handleExport = async ()'), 'export handler present');
  assert.ok(code.includes("'/dsh-cron/tasks/export'"), 'export reads the server document');
  assert.ok(code.includes('URL.createObjectURL(blob)'), 'export downloads a JSON file');
  assert.ok(code.includes('const handleImportFile = async (e)'), 'import reads the picked file');
  assert.ok(code.includes('dryRun: true'), 'import asks the server for a plan before changing anything');
  assert.ok(code.includes("'transfer.strategyReplace'"), 'all three import strategies are offered');
  assert.ok(code.includes("type: 'file'") && code.includes('accept: \'.json,application/json\''), 'import only accepts JSON exports');

  // #49 — tuning a task in a dialogue.
  assert.ok(code.includes("'actions.tuneWithDsh'"), 'tune action is labelled');
  assert.ok(code.includes('const handleTuneWithDsh = async (task)'), 'tune handler present');
  assert.ok(code.includes('cron_update_task tool'), 'the dialogue is told which tool applies the change');
  assert.ok(code.includes('confirm it with me explicitly'), 'code-executing changes require explicit confirmation');
  assert.ok(code.includes("'/dsh-cron/chat/start'"), 'tuning reuses the existing chat session start');

  // #45 — the fallback model field exists for agent tasks only.
  assert.ok(code.includes("'form.fallbackModelLabel'"), 'fallback model label present');
  assert.ok(code.includes('const [formFallbackModel, setFormFallbackModel] = React.useState('), 'fallback model state present');
  assert.ok(code.includes('fallbackModel: isAgentType ? (formFallbackModel.trim() || undefined) : undefined'), 'fallback is sent only for agent tasks');
  assert.ok(code.includes("setFormFallbackModel(task.fallbackModel || '')"), 'the field loads the stored value');

  // #39 — responsive rules stay layout-only.
  assert.ok(code.includes('@media (max-width: 900px)'), 'tablet breakpoint present');
  assert.ok(code.includes('@media (max-width: 640px)'), 'phone breakpoint present');
  assert.ok(code.includes('.dsh-cron-form-row { grid-template-columns: 1fr; }'), 'forms collapse to one column');
  assert.ok(code.includes('.dsh-cron-modal-foot { flex-direction: column-reverse; }'), 'modal actions stack on phones');
  assert.ok(code.includes('.dsh-cron-tabs { flex-wrap: nowrap; overflow-x: auto;'), 'tabs scroll instead of wrapping into a block');

  // #34 — sidebar accordion: collapsed by default, persisted, capped, keyboard-safe.
  assert.ok(code.includes('function mountSidebarJobs('), 'sidebar job list exists');
  assert.ok(code.includes('function buildSidebarJobRow(') && code.includes('function renderSidebarJobs(') && code.includes('function loadSidebarJobs('), 'sidebar pieces are separate small functions');
  assert.ok(code.includes("const SIDEBAR_JOBS_KEY = 'dsh-cron-sidebar-open';"), 'open state is persisted');
  assert.ok(code.includes('const SIDEBAR_JOBS_MAX_ROWS = 5;'), 'the list is capped');
  assert.ok(code.includes("T('sidebar.moreJobs'"), 'a busy schedule shows an "and N more" line');
  assert.ok(code.includes("entry.insertAdjacentElement('afterend', buildSidebarJobsRoot(state, label))"), 'the list is mounted under the sidebar entry');
  assert.ok(code.includes("headEl.setAttribute('aria-expanded'"), 'the head exposes aria-expanded');
  assert.ok(code.includes('pendingTaskHighlight'), 'clicking a job asks the panel to highlight that task');
  assert.ok(code.includes("'data-task-id': task.id"), 'task rows are addressable for highlighting');
  assert.ok(code.includes("T('sidebar.noActiveJobs')"), 'an empty state avoids a blank block');
});

test('#51: settings UI stores credential names, never secret values', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  const serverCode = fs.readFileSync(new URL('../lib/store.js', import.meta.url), 'utf-8');

  // Every secret-bearing setting must be a *Ref field in the UI.
  for (const key of ['botTokenRef', 'ntfyTokenRef', 'pushplusTokenRef', 'giteaTokenRef']) {
    assert.ok(code.includes(`key: '${key}'`), `credential reference field missing: ${key}`);
  }
  // The email channel was removed by owner decision (#23) — no SMTP surface left.
  assert.ok(!code.includes("'settings.smtpHostLabel'"), 'no SMTP settings in the UI');
  assert.ok(!code.includes("'form.channelEmail'"), 'no email channel option in the UI');
  assert.ok(!code.includes('smtpPasswordRef'), 'no SMTP credential reference left');
  // The UI must not offer raw secret inputs for these channels.
  for (const raw of ['discordToken', 'slackToken', 'ntfyToken:', 'pushplusToken:']) {
    assert.ok(!code.includes(`key: '${raw}`), `settings UI must not expose raw secret ${raw}`);
  }
  assert.ok(code.includes("'settings.secretsHint'"), 'UI states that credentials are referenced by name');
  assert.ok(serverCode.includes('FORBIDDEN_SETTING_KEYS'), 'server refuses raw secret keys');

  // The shared form is rendered by both the panel modal and the plugin card.
  const usages = code.split('renderDeliverySettings({').length - 1;
  assert.equal(usages, 3, 'one definition plus two call sites (modal and card)');
  assert.equal(code.split('function renderDeliverySettings(').length - 1, 1, 'one shared definition');
  assert.ok(code.includes("'aria-expanded': open ? 'true' : 'false'"), 'collapsible section head exposes aria-expanded');
});
