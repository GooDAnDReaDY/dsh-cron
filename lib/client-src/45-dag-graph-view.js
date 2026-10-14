    /**
     * Interactive Visual Chain Graph & Checkpoint Inspector (#334)
     * Pure CSS/SVG layout showing DAG steps, statuses, checkpoints and 1-click retry.
     */
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
        nodes.push({ id, title: task.title || id, type: task.type || 'prompt', status: nodeStatus, durationMs, retryCount, outputSnippet, isFocus: Boolean(focusTaskId && id === focusTaskId), isRetryable: nodeStatus === 'failed', dependsOn: deps, joinPolicy: sanitizeJoinPolicy(task.joinPolicy) });
        for (const d of deps) edges.push({ from: d, to: id, type: 'dependsOn', label: task.joinPolicy === 'any_success' ? 'join:any' : 'join:all' });
        for (const t of parseChainTargets(task.onSuccess)) edges.push({ from: id, to: t, type: 'onSuccess', label: 'onSuccess' });
        for (const f of parseChainTargets(task.onFailure)) edges.push({ from: id, to: f, type: 'onFailure', label: 'onFailure' });
      }
      return { nodes, edges, hasFailure };
    }

    function renderChainGraphModal({ isOpen, onClose, data, loading, onRetry, t }) {
      if (!isOpen) return null;

      const graph = data?.graph || { nodes: [], edges: [], hasFailure: false };
      const chainRunId = data?.chainRunId || '';
      const nodes = graph.nodes || [];

      return React.createElement('div', {
        className: 'dsh-cron-modal-overlay',
        onClick: onClose
      },
        React.createElement('div', {
          className: 'dsh-cron-modal',
          style: { maxWidth: '820px', width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' },
          role: 'dialog',
          'aria-modal': 'true',
          onClick: (e) => e.stopPropagation()
        },
          // Header
          React.createElement('div', {
            className: 'dsh-cron-modal-head',
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--dsw-alias-border-l2)', paddingBottom: '12px' }
          },
            React.createElement('div', null,
              React.createElement('div', {
                className: 'dsh-cron-modal-title',
                style: { margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }
              },
                React.createElement('span', { style: { fontSize: '18px' } }, '🕸️'),
                T_KEY(t, 'chainGraph.modalTitle')
              ),
              chainRunId && React.createElement('div', {
                style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '4px', fontFamily: 'monospace' }
              }, 'Run ID: ' + chainRunId)
            ),
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-icon-btn',
              onClick: onClose
            }, '✕')
          ),

          // Body
          React.createElement('div', {
            style: { flex: 1, overflowY: 'auto', padding: '16px 0', minHeight: '260px' }
          },
            loading && React.createElement('div', {
              className: 'dsh-cron-history-empty'
            }, T_KEY(t, 'history.loading')),

            !loading && nodes.length === 0 && React.createElement('div', {
              className: 'dsh-cron-history-empty'
            }, T_KEY(t, 'chainGraph.noNodes')),

            !loading && nodes.length > 0 && React.createElement('div', {
              style: { display: 'flex', flexDirection: 'column', gap: '16px' }
            },
              // Legend
              React.createElement('div', {
                style: { display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', padding: '0 4px' }
              },
                React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--dsh-cron-success)' } }),
                  T_KEY(t, 'chainGraph.stepSuccess')
                ),
                React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--dsh-cron-danger)' } }),
                  T_KEY(t, 'chainGraph.stepFailed')
                ),
                React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--dsw-alias-label-tertiary, #888)' } }),
                  T_KEY(t, 'chainGraph.stepPending')
                )
              ),

              // Horizontal / Flow layout of nodes
              React.createElement('div', {
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

                  return React.createElement('div', {
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
                    // Node header
                    React.createElement('div', {
                      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }
                    },
                      React.createElement('div', {
                        style: { fontWeight: '600', fontSize: '13px', color: 'var(--dsw-alias-label-primary)' }
                      }, n.title || n.id),
                      React.createElement('span', {
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

                    // Meta: duration, retryCount, type
                    React.createElement('div', {
                      style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: '8px', flexWrap: 'wrap' }
                    },
                      n.durationMs > 0 && React.createElement('span', null, n.durationMs + 'ms'),
                      n.retryCount > 0 && React.createElement('span', { style: { color: 'var(--dsh-cron-warning)' } }, '↻ ' + n.retryCount),
                      n.joinPolicy && n.dependsOn?.length > 0 && React.createElement('span', {
                        style: { background: 'var(--dsw-alias-bg-layer-3)', padding: '1px 4px', borderRadius: '4px' }
                      }, n.joinPolicy === 'any_success' ? 'join:any' : 'join:all')
                    ),

                    // Dependencies info
                    n.dependsOn?.length > 0 && React.createElement('div', {
                      style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' }
                    }, '← ' + n.dependsOn.join(', ')),

                    // Output snippet
                    n.outputSnippet && React.createElement('div', {
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

                    // One-click Retry from step button (#319, #328, #334)
                    isFailed && chainRunId && React.createElement('button', {
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

          // Footer
          React.createElement('div', {
            className: 'dsh-cron-modal-foot',
            style: { borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: '12px', marginTop: 'auto' }
          },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-primary',
              onClick: onClose
            }, T_KEY(t, 'chainGraph.close'))
          )
        )
      );
    }
