    function CronSettingsCard(props) {
      const { ctx, toggle } = props;
      const t = props.t || translate;
      const [token, setToken] = React.useState('');
      const [chatId, setChatId] = React.useState('');
      const [notify, setNotify] = React.useState(false);
      const [onlyFailure, setOnlyFailure] = React.useState(false);
      const [llmActionsEnabled, setLlmActionsEnabled] = React.useState(false);
      const [kanbanUrl, setKanbanUrl] = React.useState('http://127.0.0.1:3000');
      const [delivery, setDelivery] = React.useState({});
      const [sections, setSections] = React.useState({ channels: true });
      const [hasDefault, setHasDefault] = React.useState(false);
      const [saved, setSaved] = React.useState(false);
      const [testInfo, setTestInfo] = React.useState(null);
      // Collapsed by default, head is the toggle (canonical card contract, #100)
      const [cardOpen, setCardOpen] = React.useState(false);
      const [updateState, setUpdateState] = React.useState({
        checking: false,
        updating: false,
        currentVersion: '0.2.24',
        latestVersion: undefined,
        updateAvailable: false,
        notice: null,
        error: null
      });

      const checkUpdates = async () => {
        setUpdateState(prev => ({ ...prev, checking: true, error: null, notice: null }));
        try {
          const res = await fetch('/api/dsh-cron/update');
          const data = await res.json();
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
          const res = await fetch('/api/dsh-cron/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-dsh-plugin-update': '1' }
          });
          const data = await res.json();
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
              setLlmActionsEnabled(Boolean(data.settings.llmActionsEnabled));
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
              llmActionsEnabled: llmActionsEnabled,
              kanbanBaseUrl: kanbanUrl
            }, delivery))
          });
          const data = await res.json();
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

      // Row seat (plugins.row.config): the host page draws title/icon/crumb and the
      // padding, so the summary is a one-liner and the page drops our card chrome.
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'dsh-cron-card-desc' }, T_KEY(t, 'settings.cardDesc'));
      }
      const page = !!(props && props.view === 'page');
      return React.createElement('div', { className: page ? 'dsh-cron-page' : 'dsh-cron-card' },
        React.createElement('button', {
          type: 'button',
          className: 'dsh-cron-card-head-btn',
          style: page ? { display: 'none' } : undefined,
          'aria-expanded': (page || cardOpen) ? 'true' : 'false',
          onClick: () => setCardOpen(!cardOpen)
        },
          React.createElement('span', { className: 'dsh-cron-card-title' }, T_KEY(t, 'settings.cardTitle')),
          React.createElement('span', { className: 'dsh-cron-chev' + (cardOpen ? ' dsh-cron-chev-open' : '') }, chevronNode())
        ),
        (page || cardOpen) && React.createElement('div', { className: 'dsh-cron-card-body' },
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
          React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-3, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 2%, transparent))', border: '1px solid var(--dsw-alias-border-l2, #2e2e2e)', borderRadius: '6px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
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
            ),
            React.createElement('label', { className: 'dsh-cron-checkbox-row' },
              React.createElement('input', {
                type: 'checkbox',
                checked: llmActionsEnabled,
                onChange: (e) => setLlmActionsEnabled(e.target.checked)
              }),
              React.createElement('span', null, 'Enable Structured LLM Actions (trigger tasks, notify, create issues)')
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
          React.createElement('div', {
            className: 'dsh-cron-form-group',
            style: {
              background: 'var(--dsw-alias-bg-layer-2, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 3%, transparent))',
              border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 8%, transparent))',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '16px'
            }
          },
            React.createElement('div', {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '14px' } }, `🚀 ${T_KEY(t, 'updater.title')}`),
              React.createElement('div', { style: { display: 'flex', gap: '8px' } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-secondary',
                  style: { padding: '4px 10px', fontSize: '12px' },
                  disabled: updateState.checking || updateState.updating,
                  onClick: checkUpdates
                }, updateState.checking ? T_KEY(t, 'updater.checking') : T_KEY(t, 'updater.btnCheck')),
                updateState.updateAvailable ? React.createElement('button', {
                  type: 'button',
                  className: 'dsh-cron-btn-primary',
                  style: { padding: '4px 10px', fontSize: '12px' },
                  disabled: updateState.updating,
                  onClick: runUpdate
                }, updateState.updating ? T_KEY(t, 'updater.updating') : T_KEY(t, 'updater.btnUpdate', { version: updateState.latestVersion })) : null
              )
            ),
            React.createElement('div', {
              style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #999)', marginBottom: '8px' }
            }, T_KEY(t, 'updater.desc')),
            React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }
            },
              React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary, #aaa)' } },
                T_KEY(t, 'updater.current', { version: updateState.currentVersion })
              ),
              updateState.checking ? React.createElement('span', { className: 'dsh-cron-badge dsh-cron-badge-info' }, T_KEY(t, 'updater.checking')) :
              updateState.updateAvailable ? React.createElement('span', { className: 'dsh-cron-badge dsh-cron-badge-warn' }, T_KEY(t, 'updater.available', { version: updateState.latestVersion })) :
              updateState.currentVersion && !updateState.error ? React.createElement('span', { className: 'dsh-cron-badge dsh-cron-badge-ok' }, `✓ ${T_KEY(t, 'updater.upToDate')}`) : null
            ),
            updateState.notice ? React.createElement('div', {
              style: { marginTop: '8px', color: 'var(--dsw-alias-success, #10b981)', fontSize: '12px' }
            }, updateState.notice) : null,
            updateState.error ? React.createElement('div', {
              style: { marginTop: '8px', color: 'var(--dsw-alias-error, #ef4444)', fontSize: '12px' }
            }, updateState.error) : null
          ),
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
