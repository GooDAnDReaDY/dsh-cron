    /**
     * Real-time Task Execution Log Streaming Modal (SSE) (#336)
     * Terminal console with live chunk append, auto-scroll, status indicator, and disconnect.
     * Complies with Audit #203 (zero 6-digit hex colors, use theme variables or 3-digit hex).
     */
    function renderLiveLogsModal({ isOpen, onClose, taskId, taskTitle, logs, autoScroll, onToggleAutoScroll, completed, status, t }) {
      if (!isOpen) return null;

      const terminalRef = (el) => {
        if (el && autoScroll) {
          el.scrollTop = el.scrollHeight;
        }
      };

      const isLive = status === 'running' || status === 'connecting';
      const statusColor = isLive ? 'var(--dsh-cron-success, #2a2)' : (status === 'completed' ? 'var(--dsw-alias-label-secondary, #888)' : 'var(--dsh-cron-danger, #e33)');

      return React.createElement('div', {
        className: 'dsh-cron-modal-overlay',
        onClick: onClose
      },
        React.createElement('div', {
          className: 'dsh-cron-modal',
          style: { maxWidth: '860px', width: '92vw', height: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base, #111)', color: 'var(--dsw-alias-label-primary, #ddd)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '8px' },
          role: 'dialog',
          'aria-modal': 'true',
          onClick: (e) => e.stopPropagation()
        },
          // Header
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              React.createElement('span', { style: { fontSize: '18px' } }, '📺'),
              React.createElement('div', null,
                React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: 'var(--dsw-alias-label-primary, #fff)', display: 'flex', alignItems: 'center', gap: '8px' } },
                  T_KEY(t, 'liveLog.modalTitle'),
                  React.createElement('span', {
                    style: {
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: statusColor,
                      boxShadow: isLive ? '0 0 8px ' + statusColor : 'none'
                    }
                  })
                ),
                React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px', fontFamily: 'monospace' } },
                  (taskTitle || taskId) + ' · ' + (isLive ? T_KEY(t, 'liveLog.connecting') : (completed ? T_KEY(t, 'liveLog.completed') : status))
                )
              )
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
              React.createElement('label', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' } },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: Boolean(autoScroll),
                  onChange: onToggleAutoScroll,
                  style: { cursor: 'pointer' }
                }),
                T_KEY(t, 'liveLog.autoScroll')
              ),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-icon-btn',
                style: { color: 'var(--dsw-alias-label-secondary, #888)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' },
                onClick: onClose
              }, '✕')
            )
          ),

          // Terminal console body
          React.createElement('div', {
            ref: terminalRef,
            style: { flex: 1, overflowY: 'auto', padding: '14px 16px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', lineHeight: '1.5', background: 'var(--dsw-alias-bg-base, #000)' }
          },
            (!logs || logs.length === 0) && React.createElement('div', {
              style: { color: 'var(--dsw-alias-label-secondary, #888)', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }
            }, isLive ? T_KEY(t, 'liveLog.waiting') : 'No output captured for this run.'),

            logs && logs.length > 0 && logs.map((item, idx) => {
              const isErr = item.stream === 'stderr';
              const timeStr = item.ts ? new Date(item.ts).toLocaleTimeString() : '';
              return React.createElement('div', {
                key: idx,
                style: { display: 'flex', gap: '8px', color: isErr ? 'var(--dsh-cron-danger, #f55)' : 'var(--dsh-cron-success, #5f5)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }
              },
                timeStr && React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary, #555)', userSelect: 'none', flexShrink: 0 } }, '[' + timeStr + ']'),
                React.createElement('span', { style: { flex: 1 } }, item.chunk || item.text || String(item))
              );
            })
          ),

          // Footer
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
          },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn dsh-cron-btn-secondary',
              style: { padding: '6px 14px', fontSize: '12px' },
              onClick: onClose
            }, T_KEY(t, 'liveLog.close'))
          )
        )
      );
    }
