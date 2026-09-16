        dryRunResult && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => setDryRunResult(null) },
          React.createElement('div', {
            className: 'dsh-cron-modal',
            style: { maxWidth: '580px' },
            role: 'dialog',
            'aria-modal': 'true',
            onClick: (e) => e.stopPropagation()
          },
            React.createElement('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('div', { className: 'dsh-cron-modal-title', style: { margin: 0 } }, T_KEY(t, 'dryRun.title')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-icon-btn',
                onClick: () => setDryRunResult(null)
              }, '✕')
            ),
            React.createElement('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' } },
              React.createElement('div', null, React.createElement('strong', null, T_KEY(t, 'dryRun.status') + ': '), React.createElement('span', { style: { color: dryRunResult.ok ? 'var(--dsh-cron-success, #22c55e)' : 'var(--dsh-cron-danger, #ef4444)' } }, dryRunResult.ok ? (dryRunResult.result && dryRunResult.result.status || 'success') : 'failed')),
              dryRunResult.result && dryRunResult.result.preflight && React.createElement('div', null, React.createElement('strong', null, T_KEY(t, 'dryRun.preflight') + ': '), React.createElement('span', null, dryRunResult.result.preflight.passed ? '✓ Passed' : '✗ Failed (' + (dryRunResult.result.preflight.reason || '') + ')')),
              dryRunResult.result && React.createElement('div', null, React.createElement('strong', null, T_KEY(t, 'dryRun.duration') + ': '), React.createElement('span', null, (dryRunResult.result.durationMs || 0) + 'ms')),
              React.createElement('div', { style: { marginTop: '6px' } }, React.createElement('strong', null, T_KEY(t, 'dryRun.output') + ':')),
              React.createElement('pre', {
                style: {
                  background: 'var(--dsw-alias-bg-layer-2, #18181b)',
                  border: '1px solid var(--dsw-alias-border-l2, #2e2e2e)',
                  borderRadius: '6px',
                  padding: '10px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--dsw-alias-label-primary, #e4e4e7)'
                }
              }, (dryRunResult.result && dryRunResult.result.output) || (dryRunResult.error) || '(no output)')
            ),
            React.createElement('div', { className: 'dsh-cron-modal-foot', style: { marginTop: '16px' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-primary',
                onClick: () => setDryRunResult(null)
              }, T_KEY(t, 'dryRun.close'))
            )
          )
        ),

        // Archive runs modal
        archiveModalOpen && React.createElement('div', { className: 'dsh-cron-modal-overlay', onClick: () => setArchiveModalOpen(false) },
          React.createElement('div', {
            className: 'dsh-cron-modal',
            style: { maxWidth: '700px' },
            role: 'dialog',
            'aria-modal': 'true',
            onClick: (e) => e.stopPropagation()
          },
            React.createElement('div', { className: 'dsh-cron-modal-head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('div', { className: 'dsh-cron-modal-title', style: { margin: 0 } }, T_KEY(t, 'archive.title') + (archiveTask ? ' - ' + archiveTask.title : '')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-icon-btn',
                onClick: () => setArchiveModalOpen(false)
              }, '✕')
            ),
            React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #999)', margin: '4px 0 12px 0' } },
              T_KEY(t, 'archive.totalRuns', { total: archiveTotal })
            ),
            archiveLoading ? React.createElement('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'history.loading')) :
            archiveRuns.length === 0 ? React.createElement('div', { className: 'dsh-cron-history-empty' }, T_KEY(t, 'archive.empty')) :
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' } },
              archiveRuns.map((r, idx) => React.createElement('div', {
                key: idx,
                style: {
                  background: 'var(--dsw-alias-bg-layer-2, #18181b)',
                  border: '1px solid var(--dsw-alias-border-l2, #2e2e2e)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px'
                }
              },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                  React.createElement('span', { style: { fontWeight: '600', color: r.status === 'success' ? 'var(--dsh-cron-success, #22c55e)' : 'var(--dsh-cron-danger, #ef4444)' } }, (r.status || 'unknown').toUpperCase()),
                  React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary, #888)' } }, new Date(r.timestamp || r.startedAt || Date.now()).toLocaleString())
                ),
                r.durationMs > 0 && React.createElement('div', { style: { color: 'var(--dsw-alias-label-secondary, #888)', marginBottom: '4px' } }, 'Duration: ' + r.durationMs + 'ms'),
                r.error && React.createElement('div', { style: { color: 'var(--dsh-cron-danger, #ef4444)', marginBottom: '4px' } }, 'Error: ' + r.error),
                r.output && React.createElement('div', {
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
            React.createElement('div', { className: 'dsh-cron-modal-foot', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' } },
              archiveRuns.length < archiveTotal ? React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                onClick: () => {
                  const nextOffset = archiveOffset + 15;
                  if (archiveTask) openArchiveModal(archiveTask, nextOffset);
                }
              }, T_KEY(t, 'archive.loadMore', { shown: archiveRuns.length, total: archiveTotal })) : React.createElement('div', null),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-primary',
                onClick: () => setArchiveModalOpen(false)
              }, T_KEY(t, 'archive.close'))
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

