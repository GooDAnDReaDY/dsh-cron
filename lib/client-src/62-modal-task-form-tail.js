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
                
                  // Reliability, Heartbeat & Self-Healing section
                  React.createElement('div', {
                    style: {
                      marginTop: '16px',
                      paddingTop: '14px',
                      borderTop: '1px solid var(--dsw-alias-border-l2, #2e2e2e)'
                    }
                  },
                    React.createElement('div', { style: { fontWeight: '600', fontSize: '13px', marginBottom: '10px' } }, T_KEY(t, 'form.reliabilityTitle')),
                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
                      React.createElement('div', { className: 'dsh-cron-form-group' },
                        React.createElement('label', null, T_KEY(t, 'form.preflightLabel')),
                        React.createElement('select', {
                          value: formPreflightType,
                          onChange: (e) => setFormPreflightType(e.target.value)
                        },
                          React.createElement('option', { value: 'none' }, T_KEY(t, 'form.preflightNone')),
                          React.createElement('option', { value: 'http' }, T_KEY(t, 'form.preflightHttp')),
                          React.createElement('option', { value: 'shell' }, T_KEY(t, 'form.preflightShell')),
                          React.createElement('option', { value: 'disk' }, T_KEY(t, 'form.preflightDisk'))
                        )
                      ),
                      formPreflightType !== 'none' && React.createElement('div', { className: 'dsh-cron-form-group' },
                        React.createElement('label', null, T_KEY(t, 'form.preflightTargetLabel')),
                        React.createElement('input', {
                          type: 'text',
                          value: formPreflightTarget,
                          placeholder: T_KEY(t, 'form.preflightTargetPlaceholder'),
                          onChange: (e) => setFormPreflightTarget(e.target.value)
                        })
                      )
                    ),
                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
                      React.createElement('div', { className: 'dsh-cron-form-group' },
                        React.createElement('label', null, T_KEY(t, 'form.heartbeatIntervalLabel')),
                        React.createElement('input', {
                          type: 'number',
                          value: formHeartbeatIntervalSeconds,
                          min: 0,
                          onChange: (e) => setFormHeartbeatIntervalSeconds(Number(e.target.value))
                        })
                      ),
                      formHeartbeatIntervalSeconds > 0 && React.createElement('div', { className: 'dsh-cron-form-group' },
                        React.createElement('label', null, T_KEY(t, 'form.gracePeriodLabel')),
                        React.createElement('input', {
                          type: 'number',
                          value: formGracePeriodSeconds,
                          min: 1,
                          onChange: (e) => setFormGracePeriodSeconds(Number(e.target.value))
                        })
                      )
                    ),
                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
                      React.createElement('div', { className: 'dsh-cron-form-group' },
                        React.createElement('label', null, T_KEY(t, 'form.priorityLabel')),
                        React.createElement('input', {
                          type: 'number',
                          value: formPriority,
                          min: 1,
                          max: 10,
                          onChange: (e) => setFormPriority(Number(e.target.value))
                        })
                      ),
                      React.createElement('div', { className: 'dsh-cron-form-group' },
                        React.createElement('label', null, T_KEY(t, 'form.concurrencyGroupLabel')),
                        React.createElement('input', {
                          type: 'text',
                          value: formConcurrencyGroup,
                          onChange: (e) => setFormConcurrencyGroup(e.target.value)
                        })
                      )
                    ),
                    React.createElement('div', { className: 'dsh-cron-form-group' },
                      React.createElement('label', null, T_KEY(t, 'form.selfHealingLabel')),
                      React.createElement('input', {
                        type: 'text',
                        value: formSelfHealingCommand,
                        placeholder: T_KEY(t, 'form.selfHealingPlaceholder'),
                        onChange: (e) => setFormSelfHealingCommand(e.target.value)
                      })
                    ),
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' } },
                      React.createElement('input', {
                        type: 'checkbox',
                        id: 'formAutoDiagnoseCheckbox',
                        checked: formAutoDiagnose,
                        onChange: (e) => setFormAutoDiagnose(e.target.checked)
                      }),
                      React.createElement('label', { htmlFor: 'formAutoDiagnoseCheckbox', style: { margin: 0, fontSize: '12.5px', cursor: 'pointer' } }, T_KEY(t, 'form.autoDiagnoseLabel'))
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


        // Dry Run simulation modal
