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
        } catch (err) {
          console.debug('[dsh-cron] settings fetch failed', err);
        }
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
        setFormAgentPreset('');
          setFormTargetSessionId('');
          setFormTargetSessionReset('never');
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
        setFormOnSuccess(task.onSuccess || '');
        setFormOnFailure(task.onFailure || '');
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
        setFormPermissionPreset(task.permissionPreset || 'default');
        setFormAgentPreset(task.agentPreset || '');
        setFormTargetSessionId(task.targetSessionId || '');
        setFormTargetSessionReset(task.targetSessionReset || 'never');
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
            agentPreset: formAgentPreset.trim() || undefined,
            targetSessionId: formTargetSessionId.trim() || undefined,
            targetSessionReset: formTargetSessionReset || 'never',
            kanbanMode: formKanbanMode,
            onSuccess: formOnSuccess.trim() || undefined,
            onFailure: formOnFailure.trim() || undefined,
            heartbeatIntervalSeconds: Number(formHeartbeatIntervalSeconds) || 0,
            gracePeriodSeconds: Number(formGracePeriodSeconds) || 300,
            preflightType: formPreflightType || 'none',
            preflightTarget: formPreflightTarget.trim() || undefined,
            priority: Number(formPriority) || 5,
            concurrencyGroup: formConcurrencyGroup.trim() || 'default',
            selfHealingCommand: formSelfHealingCommand.trim() || undefined,
            autoDiagnose: Boolean(formAutoDiagnose),
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

