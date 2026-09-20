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
      const [formOnSuccess, setFormOnSuccess] = React.useState('');
      const [formOnFailure, setFormOnFailure] = React.useState('');
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
      const [formTargetSessionId, setFormTargetSessionId] = React.useState('');
      const [formTargetSessionReset, setFormTargetSessionReset] = React.useState('never');
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
        setTimeout(() => { try { node.classList.remove('dsh-cron-task-highlight'); } catch (err) { /* node unmounted */ } }, 2500);
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

