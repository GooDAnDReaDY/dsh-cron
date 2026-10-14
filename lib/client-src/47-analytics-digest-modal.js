    /**
     * Weekly AI Analytics & Cost Digest Modal (#330)
     * Displays 7-day or 30-day KPI cards, top unstable & expensive tasks,
     * one-click Telegram dispatch, and Markdown preview.
     * Complies strictly with Audit #203 (0 raw rgba, 0 6-digit hex colors).
     */
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
          '# ' + (T_KEY(t, 'digest.modalTitle') || 'DSH Cron Automation Digest'),
          'Period: Last ' + (periodDays || 7) + ' days',
          'Total Runs: ' + digest.totalRuns + ' (' + digest.successRate + '% SR)',
          'Tokens: ' + digest.totalTokens + ' (~$' + digest.totalCostUsd + ' USD)',
          'Active Tasks: ' + digest.activeTasksCount + ' active / ' + digest.pausedTasksCount + ' paused'
        ].join(String.fromCharCode(10));
        navigator.clipboard.writeText(text).catch(() => {});
      };

      return React.createElement('div', {
        className: 'dsh-cron-modal-overlay',
        onClick: onClose
      },
        React.createElement('div', {
          className: 'dsh-cron-modal',
          style: { maxWidth: '780px', width: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base, #111)', color: 'var(--dsw-alias-label-primary, #ddd)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '8px' },
          role: 'dialog',
          'aria-modal': 'true',
          onClick: (e) => e.stopPropagation()
        },
          // Header
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              React.createElement('span', { style: { fontSize: '20px' } }, '📊'),
              React.createElement('div', null,
                React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', color: 'var(--dsw-alias-label-primary, #fff)' } },
                  T_KEY(t, 'digest.modalTitle') || 'Automation & Cost Digest'
                ),
                React.createElement('div', { style: { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } },
                  (T_KEY(t, 'digest.buttonTitle') || 'Analytics digest') + ' · ' + (periodDays || 7) + 'd'
                )
              )
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { padding: '4px 10px', fontSize: '12px', fontWeight: periodDays === 7 ? '600' : '400', background: periodDays === 7 ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
                onClick: () => onSelectPeriod && onSelectPeriod(7)
              }, T_KEY(t, 'digest.period7') || '7 Days'),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { padding: '4px 10px', fontSize: '12px', fontWeight: periodDays === 30 ? '600' : '400', background: periodDays === 30 ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
                onClick: () => onSelectPeriod && onSelectPeriod(30)
              }, T_KEY(t, 'digest.period30') || '30 Days'),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-icon-btn',
                onClick: onClose,
                style: { marginLeft: '8px' }
              }, React.createElement('span', null, '✕'))
            )
          ),

          // Body
          React.createElement('div', {
            style: { padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }
          },
            isLoading ? React.createElement('div', { style: { padding: '30px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'Loading digest metrics...') : React.createElement(React.Fragment, null,
              // KPI Grid
              React.createElement('div', {
                style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }
              },
                React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '10px 12px' } },
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)' } }, T_KEY(t, 'digest.executions') || 'Executions'),
                  React.createElement('div', { style: { fontSize: '18px', fontWeight: '700', color: 'var(--dsw-alias-label-primary, #fff)', marginTop: '4px' } }, digest.totalRuns),
                  React.createElement('div', { style: { fontSize: '11px', color: digest.successRate >= 90 ? 'var(--dsh-cron-success, #2a2)' : 'var(--dsh-cron-warning, #fa0)', marginTop: '2px' } }, digest.successRate + '% SR')
                ),
                React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '10px 12px' } },
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)' } }, T_KEY(t, 'digest.tokens') || 'Tokens'),
                  React.createElement('div', { style: { fontSize: '18px', fontWeight: '700', color: 'var(--dsw-alias-label-primary, #fff)', marginTop: '4px' } }, Number(digest.totalTokens || 0).toLocaleString()),
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } }, 'LLM prompt+out')
                ),
                React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '10px 12px' } },
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)' } }, T_KEY(t, 'digest.cost') || 'Cost'),
                  React.createElement('div', { style: { fontSize: '18px', fontWeight: '700', color: 'var(--dsw-alias-label-primary, #fff)', marginTop: '4px' } }, '$' + Number(digest.totalCostUsd || 0).toFixed(4)),
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } }, 'USD estimated')
                ),
                React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '10px 12px' } },
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)' } }, T_KEY(t, 'digest.fleet') || 'Fleet'),
                  React.createElement('div', { style: { fontSize: '18px', fontWeight: '700', color: 'var(--dsw-alias-label-primary, #fff)', marginTop: '4px' } }, digest.activeTasksCount),
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } }, digest.pausedTasksCount + ' paused')
                )
              ),

              // Unstable Tasks
              React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '12px' } },
                React.createElement('div', { style: { fontWeight: '600', fontSize: '13px', color: 'var(--dsh-cron-warning, #fa0)', marginBottom: '8px' } },
                  '⚠️ ' + (T_KEY(t, 'digest.unstableTitle') || 'Top Unstable Automations')
                ),
                (digest.topUnstableTasks && digest.topUnstableTasks.length > 0) ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  digest.topUnstableTasks.map((tItem, idx) => React.createElement('div', {
                    key: tItem.id || idx,
                    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', background: 'var(--dsw-alias-bg-base, #111)', borderRadius: '4px', border: '1px solid var(--dsw-alias-border-l2, #222)' }
                  },
                    React.createElement('span', { style: { fontFamily: 'monospace' } }, (idx + 1) + '. ' + (tItem.name || tItem.id)),
                    React.createElement('span', { style: { color: 'var(--dsh-cron-danger, #e33)', fontWeight: '600' } },
                      tItem.failures + ' fail (' + tItem.successRate + '% SR)'
                    )
                  ))
                ) : React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)' } }, '✓ All tasks healthy — 0 failures in window!')
              ),

              // Expensive Tasks
              React.createElement('div', { style: { background: 'var(--dsw-alias-bg-layer-2, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '6px', padding: '12px' } },
                React.createElement('div', { style: { fontWeight: '600', fontSize: '13px', color: 'var(--dsh-cron-info, #4af)', marginBottom: '8px' } },
                  '💰 ' + (T_KEY(t, 'digest.expensiveTitle') || 'Top Resource Consumers')
                ),
                (digest.topExpensiveTasks && digest.topExpensiveTasks.length > 0) ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  digest.topExpensiveTasks.map((tItem, idx) => React.createElement('div', {
                    key: tItem.id || idx,
                    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', background: 'var(--dsw-alias-bg-base, #111)', borderRadius: '4px', border: '1px solid var(--dsw-alias-border-l2, #222)' }
                  },
                    React.createElement('span', { style: { fontFamily: 'monospace' } }, (idx + 1) + '. ' + (tItem.name || tItem.id)),
                    React.createElement('span', { style: { color: 'var(--dsw-alias-label-primary, #ddd)' } },
                      Number(tItem.tokens || 0).toLocaleString() + ' tok ($' + Number(tItem.costUsd || 0).toFixed(4) + ')'
                    )
                  ))
                ) : React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'No significant token consumption recorded.')
              )
            )
          ),

          // Footer
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
          },
            React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)' } },
              sendStatus || ''
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                onClick: copyMarkdown,
                style: { padding: '6px 14px', fontSize: '12px' }
              }, T_KEY(t, 'digest.copyMarkdown') || '📋 Copy Markdown'),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-primary',
                onClick: onSendTelegram,
                style: { padding: '6px 14px', fontSize: '12px' }
              }, T_KEY(t, 'digest.sendTelegram') || '✈️ Send Telegram')
            )
          )
        )
      );
    }
