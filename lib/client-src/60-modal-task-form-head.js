        manualModalOpen && React.createElement('div', {
          className: 'dsh-cron-modal-overlay',
          onClick: (e) => {
            if (e.target === e.currentTarget) closeManualModalWithConfirm();
          }
        },
          React.createElement('div', {
            className: 'dsh-cron-modal dsh-cron-modal-scroll',
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
                      // #315: Run card with stages flow, cost, stopped reason and delivery retry
                      run.stoppedReason && React.createElement('div', {
                        className: 'dsh-cron-hint',
                        style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }
                      },
                        React.createElement('span', { className: 'dsh-cron-badge-ref' }, T_KEY(t, 'history.stoppedReasonTitle')),
                        React.createElement('span', null, run.stoppedReason)
                      ),
                      Array.isArray(run.stages) && run.stages.length > 0 && React.createElement('div', {
                        className: 'dsh-cron-stages-flow',
                        style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }
                      },
                        run.stages.map((st) => React.createElement('span', {
                          key: st.name,
                          className: 'dsh-cron-stage-pill',
                          'data-status': st.status || 'unknown',
                          title: st.error ? (st.name + ': ' + st.error) : (st.name + (st.durationMs !== undefined ? ' (' + st.durationMs + 'ms)' : ''))
                        }, (T_KEY(t, 'history.stage_' + st.name) || st.name) + (st.durationMs !== undefined ? ' ' + st.durationMs + 'ms' : '')))
                      ),
                      run.delivery && React.createElement('div', {
                        style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }
                      },
                        React.createElement('span', {
                          className: 'dsh-cron-badge-ref',
                          'data-status': run.delivery.status
                        }, 'Delivery: ' + run.delivery.status),
                        (run.delivery.status === 'failed' || run.delivery.status === 'partial') && React.createElement('button', {
                          type: 'button',
                          className: 'dsh-cron-btn-secondary',
                          style: { padding: '2px 8px', fontSize: '11px' },
                          disabled: retryingDeliveryId === run.id,
                          onClick: () => handleRetryDelivery(formId, run.id)
                        }, retryingDeliveryId === run.id ? T_KEY(t, 'history.retryingDelivery') : T_KEY(t, 'history.retryDelivery'))
                      ),
                      run.artifacts && run.artifacts.length > 0 && React.createElement('div', {
                        style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', alignItems: 'center' }
                      },
                        React.createElement('span', { className: 'dsh-cron-hint', style: { fontSize: '11px' } }, '📦 ' + T_KEY(t, 'history.artifacts') + ':'),
                        run.artifacts.map((art) => React.createElement('a', {
                          key: art.name || art.id,
                          href: '/dsh-cron/runs/' + encodeURIComponent(run.id) + '/artifacts/' + encodeURIComponent(art.name) + '/preview',
                          target: '_blank',
                          rel: 'noopener noreferrer',
                          className: 'dsh-cron-btn-secondary',
                          style: { padding: '2px 8px', fontSize: '11px', textDecoration: 'none' },
                          title: art.name + ' (' + Math.round((art.size || 0) / 1024 * 10) / 10 + ' KB)'
                        }, art.name))
                      ),
                      run.status === 'uncertain' && React.createElement('div', {
                        className: 'dsh-cron-status-banner',
                        'data-type': 'warning',
                        style: { marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }
                      },
                        React.createElement('span', null, '⚠️ ' + T_KEY(t, 'history.statusUncertainHint')),
                        React.createElement('div', { style: { display: 'flex', gap: '6px' } },
                          React.createElement('button', {
                            type: 'button',
                            className: 'dsh-cron-btn-secondary',
                            style: { padding: '2px 8px', fontSize: '11px' },
                            onClick: () => handleResolveUncertain(formId, run.id, 'completed')
                          }, '✓ ' + T_KEY(t, 'history.resolveCompleted')),
                          React.createElement('button', {
                            type: 'button',
                            className: 'dsh-cron-btn-secondary',
                            style: { padding: '2px 8px', fontSize: '11px' },
                            onClick: () => handleResolveUncertain(formId, run.id, 'failed')
                          }, '✕ ' + T_KEY(t, 'history.resolveFailed'))
                        )
                      ),
                      // #43, #353: Self-Healing Doctor Diagnosis & 1-Click Fix
                      (run.diagnosis || run.doctorReport) && React.createElement('div', {
                        className: 'dsh-cron-status-banner',
                        'data-type': 'info',
                        style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }
                      },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                          React.createElement('strong', null, '🩺 ' + T_KEY(t, run.doctorReport ? 'history.doctorDiagnosis' : 'history.diagnosis')),
                          React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                            (run.autoHealed || run.doctorReport?.autoHealed) && React.createElement('span', {
                              style: { fontSize: '10px', background: 'var(--dsh-cron-success-bg)', color: 'var(--dsh-cron-success)', padding: '1px 6px', borderRadius: '8px', fontWeight: '600' }
                            }, '✨ ' + T_KEY(t, 'history.autoHealed')),
                            (run.doctorReport?.category || run.category) && React.createElement('span', {
                              style: { fontSize: '10px', background: 'var(--dsw-alias-bg-layer-3)', padding: '1px 6px', borderRadius: '4px' }
                            }, run.doctorReport?.category || run.category),
                            run.confidence ? React.createElement('span', { style: { fontSize: '10px', color: 'var(--dsw-alias-label-secondary)' } }, '(' + run.confidence + ')') : null
                          )
                        ),
                        React.createElement('div', null, run.doctorReport?.cause || run.diagnosis),
                        run.doctorReport?.diff && React.createElement('div', {
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
                        (run.doctorReport?.suggestedFix || run.suggestion) && React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
                          typeof handleApplyDoctorFix === 'function' && React.createElement('button', {
                            type: 'button',
                            className: 'dsh-cron-btn-primary',
                            style: { padding: '3px 10px', fontSize: '12px' },
                            onClick: () => handleApplyDoctorFix(formId, run.doctorReport || { suggestedFix: run.suggestion })
                          }, '⚡ ' + T_KEY(t, 'history.doctorApply')),
                          React.createElement('button', {
                            type: 'button',
                            className: 'dsh-cron-btn-secondary',
                            style: { padding: '3px 10px', fontSize: '12px' },
                            onClick: () => openEditModal(selectedTaskMeta, { prompt: run.suggestion })
                          }, T_KEY(t, 'history.applySuggestion'))
                        )
                      ),
                                            // #350 Swarm Workers Breakdown
                      run.subtaskRuns && Array.isArray(run.subtaskRuns) && run.subtaskRuns.length > 0 && React.createElement('div', {
                        style: { marginTop: '8px', padding: '8px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: '6px', fontSize: '12px' }
                      },
                        React.createElement('div', { style: { fontWeight: '600', marginBottom: '4px' } }, '🐝 ' + T_KEY(t, 'history.swarmBadge') + ' (' + run.subtaskRuns.filter(r => r.status === 'success').length + '/' + run.subtaskRuns.length + ')'),
                        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                          run.subtaskRuns.map((st, sidx) => React.createElement('div', {
                            key: sidx,
                            style: { display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: '4px' }
                          },
                            React.createElement('span', null, (st.status === 'success' ? '✅ ' : '❌ ') + st.title),
                            React.createElement('span', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' } }, (st.durationMs || 0) + 'ms')
                          ))
                        )
                      ),
                      // #351 Git Diff & Patch Review
                      run.gitDiff && run.gitDiff.hasChanges && React.createElement('div', {
                        className: 'dsh-cron-status-banner',
                        style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }
                      },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                          React.createElement('strong', null, '📝 ' + T_KEY(t, 'history.gitDiff')),
                          React.createElement('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } }, run.gitDiff.stat || '')
                        ),
                        run.gitDiff.diff && React.createElement('div', {
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
                        React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
                          React.createElement('button', {
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
                          React.createElement('button', {
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
                  onClick: closeManualModalWithConfirm
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
                    }),
                    React.createElement('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' } },
                      [
                        { label: '15m', expr: '*/15 * * * *' },
                        { label: '1h', expr: '0 * * * *' },
                        { label: 'Daily 09:00', expr: '0 9 * * *' },
                        { label: 'Weekdays', expr: '0 9 * * 1-5' },
                        { label: 'Weekly Mon', expr: '0 9 * * 1' },
                      ].map((p) => React.createElement('button', {
                        key: p.label,
                        type: 'button',
                        className: 'dsh-cron-btn-secondary',
                        style: { padding: '2px 7px', fontSize: '11px', borderRadius: '4px' },
                        onClick: () => { setFormSchedule(p.expr); handlePreviewSchedule(p.expr); }
                      }, p.label))
                    ),
                    React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } },
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsh-cron-btn-secondary',
                        style: { padding: '3px 8px', fontSize: '11.5px' },
                        onClick: () => handlePreviewSchedule(formSchedule)
                      }, T_KEY(t, 'form.previewSchedule')),
                      schedulePreviewRuns && schedulePreviewRuns.length > 0 && React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #999)' } },
                        T_KEY(t, 'form.previewScheduleTitle') + ' ' + schedulePreviewRuns.slice(0, 3).map(r => new Date(r).toLocaleTimeString()).join(', ')
                      )
                    )
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
              AGENT_FORM_TYPES.includes(formType) ? (
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
                )
              ) : (
                React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.retriesLabel')),
                  React.createElement('input', {
                    type: 'number',
                    min: 0,
                    value: formMaxRetries,
                    placeholder: '0',
                    onChange: (e) => setFormMaxRetries(e.target.value)
                  })
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
                AGENT_FORM_TYPES.includes(formType) && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.agentPresetLabel')),
                  React.createElement('input', {
                    type: 'text',
                    value: formAgentPreset,
                    placeholder: T_KEY(t, 'form.agentPresetPlaceholder'),
                    onChange: (e) => setFormAgentPreset(e.target.value)
                  }),
                  React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.agentPresetHint'))
                ),
                AGENT_FORM_TYPES.includes(formType) && React.createElement('div', { className: 'dsh-cron-form-group' },
                  React.createElement('label', null, T_KEY(t, 'form.sessionTitleLabel')),
                  React.createElement('input', {
                    type: 'text',
                    value: formSessionTitle,
                    placeholder: T_KEY(t, 'form.sessionTitlePlaceholder'),
                    onChange: (e) => setFormSessionTitle(e.target.value)
                  }),
                  React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.sessionTitleHint'))
                ),
                AGENT_FORM_TYPES.includes(formType) && React.createElement('div', { className: 'dsh-cron-form-row' },
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.targetSessionIdLabel')),
                    React.createElement('input', {
                      type: 'text',
                      value: formTargetSessionId,
                      placeholder: T_KEY(t, 'form.targetSessionIdPlaceholder'),
                      onChange: (e) => setFormTargetSessionId(e.target.value)
                    }),
                    React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.targetSessionIdHint'))
                  ),
                  React.createElement('div', { className: 'dsh-cron-form-group' },
                    React.createElement('label', null, T_KEY(t, 'form.targetSessionResetLabel')),
                    React.createElement('select', {
                      value: formTargetSessionReset,
                      onChange: (e) => setFormTargetSessionReset(e.target.value)
                    },
                      React.createElement('option', { value: 'never' }, T_KEY(t, 'form.targetSessionResetNever')),
                      React.createElement('option', { value: 'daily' }, T_KEY(t, 'form.targetSessionResetDaily')),
                      React.createElement('option', { value: 'weekly' }, T_KEY(t, 'form.targetSessionResetWeekly'))
                    ),
                    React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.targetSessionResetHint'))
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
                  formInspectOnFailure && React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.inspectOnFailureHint')),
                  // #318: require approval checkbox
                  React.createElement('label', { className: 'dsh-cron-checkbox-row', style: { marginTop: '8px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: formRequireApproval,
                      onChange: (e) => setFormRequireApproval(e.target.checked)
                    }),
                    React.createElement('span', null, T_KEY(t, 'form.requireApprovalLabel'))
                  ),
                  formRequireApproval && React.createElement('div', { className: 'dsh-cron-hint' }, T_KEY(t, 'form.requireApprovalHint'))
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
