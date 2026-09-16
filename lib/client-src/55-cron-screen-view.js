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
                        task.lastDurationMs > 0 ? React.createElement('span', { className: 'dsh-cron-cost-tag', title: 'Last execution duration' }, task.lastDurationMs + 'ms') : null,
                        task.onSuccess ? React.createElement('span', { className: 'dsh-cron-type-tag dsh-cron-tag-success', title: 'On success: triggers ' + task.onSuccess }, '➜ ' + task.onSuccess) : null,
                        task.onFailure ? React.createElement('span', { className: 'dsh-cron-type-tag dsh-cron-tag-failure', title: 'On failure: triggers ' + task.onFailure }, '↳ ' + task.onFailure) : null,
                        task.heartbeatIntervalSeconds > 0 ? React.createElement('span', { className: 'dsh-cron-type-tag dsh-cron-tag-heartbeat', title: 'Heartbeat: every ' + task.heartbeatIntervalSeconds + 's' }, '💓 ' + task.heartbeatIntervalSeconds + 's') : null,
                        task.targetSessionId ? React.createElement('span', { className: 'dsh-cron-type-tag dsh-cron-tag-session', title: 'Target session: ' + task.targetSessionId + (task.targetSessionReset && task.targetSessionReset !== 'never' ? ' (' + task.targetSessionReset + ')' : '') }, '🧵 ' + task.targetSessionId) : null,
                        task.preflightType && task.preflightType !== 'none' ? React.createElement('span', { className: 'dsh-cron-type-tag dsh-cron-tag-preflight', title: 'Preflight: ' + task.preflightType }, '🛡️ ' + task.preflightType) : null,
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
                        title: T_KEY(t, 'actions.dryRunTitle'),
                        onClick: () => handleDryRun(task.id)
                      }, '🧪'),
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-icon-btn',
                        title: T_KEY(t, 'actions.archiveTitle'),
                        onClick: () => openArchiveModal(task, 0)
                      }, '📜'),
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
