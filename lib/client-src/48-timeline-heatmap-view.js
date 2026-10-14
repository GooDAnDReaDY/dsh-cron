    /**
     * 24-Hour Schedule Timeline & Cost Heatmap Modal (#332, #333)
     * Visual schedule collision detection and weekly 7x24 token burn heatmap.
     * Complies with Audit #203 (0 raw rgba, 0 6-digit hex colors).
     */
    function renderTimelineHeatmapModal({
      isOpen,
      onClose,
      activeTab,
      onSelectTab,
      timelineData,
      heatmapData,
      isLoading,
      t
    }) {
      if (!isOpen) return null;

      const tab = activeTab || 'timeline';
      const timeline = timelineData || { buckets: [], totalRuns: 0, peakHoursCount: 0, maxConcurrent: 3 };
      const heatmap = heatmapData || { matrix: [], dayLabels: [], hourLabels: [], totalCostUsd: 0, totalTokens: 0, maxCostHour: 0 };

      return React.createElement('div', {
        className: 'dsh-cron-modal-overlay',
        onClick: onClose
      },
        React.createElement('div', {
          className: 'dsh-cron-modal',
          style: { maxWidth: '960px', width: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base, #111)', color: 'var(--dsw-alias-label-primary, #ddd)', border: '1px solid var(--dsw-alias-border-l2, #333)', borderRadius: '8px' },
          role: 'dialog',
          'aria-modal': 'true',
          onClick: (e) => e.stopPropagation()
        },
          // Header
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              React.createElement('span', { style: { fontSize: '20px' } }, tab === 'timeline' ? '⏱' : '🔥'),
              React.createElement('div', null,
                React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', color: 'var(--dsw-alias-label-primary, #fff)' } },
                  tab === 'timeline' ? (T_KEY(t, 'timeline.modalTitle')) : (T_KEY(t, 'heatmap.modalTitle'))
                ),
                React.createElement('div', { style: { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary, #888)', marginTop: '2px' } },
                  tab === 'timeline'
                    ? (timeline.totalRuns + ' runs projected · ' + (timeline.peakHoursCount ? '⚠️ ' + timeline.peakHoursCount + ' peak hours' : '✓ balanced concurrency'))
                    : ('$' + Number(heatmap.totalCostUsd || 0).toFixed(4) + ' USD · ' + Number(heatmap.totalTokens || 0).toLocaleString() + ' tokens')
                )
              )
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { padding: '4px 12px', fontSize: '12px', fontWeight: tab === 'timeline' ? '600' : '400', background: tab === 'timeline' ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
                onClick: () => onSelectTab && onSelectTab('timeline')
              }, '⏱ ' + (T_KEY(t, 'timeline.tabTimeline'))),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { padding: '4px 12px', fontSize: '12px', fontWeight: tab === 'heatmap' ? '600' : '400', background: tab === 'heatmap' ? 'var(--dsw-alias-bg-layer-3, #222)' : 'transparent' },
                onClick: () => onSelectTab && onSelectTab('heatmap')
              }, '🔥 ' + (T_KEY(t, 'heatmap.tabHeatmap'))),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-icon-btn',
                onClick: onClose,
                style: { marginLeft: '8px' }
              }, React.createElement('span', null, '✕'))
            )
          ),

          // Content
          React.createElement('div', {
            style: { padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }
          },
            isLoading ? React.createElement('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'Loading visualization data...') : (
              tab === 'timeline' ? (
                // 24H Timeline View
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)', display: 'flex', justifyContent: 'space-between' } },
                    React.createElement('span', null, T_KEY(t, 'timeline.legendDesc')),
                    React.createElement('span', { style: { color: 'var(--dsh-cron-warning, #fa0)' } }, '⚠️ ' + (T_KEY(t, 'timeline.peakWarning')) + ' (' + timeline.maxConcurrent + ')')
                  ),
                  React.createElement('div', {
                    style: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '8px', marginTop: '6px' }
                  },
                    (timeline.buckets || []).map((b) => {
                      const isPeak = b.isPeak, hasRuns = b.count > 0;
                      return React.createElement('div', {
                        key: b.index,
                        style: {
                          background: isPeak ? 'color-mix(in srgb, var(--dsh-cron-danger, #e33) 12%, var(--dsw-alias-bg-layer-2, #111))' : (hasRuns ? 'var(--dsw-alias-bg-layer-2, #111)' : 'var(--dsw-alias-bg-base, #111)'),
                          border: isPeak ? '1px solid var(--dsh-cron-danger, #e33)' : (hasRuns ? '1px solid var(--dsw-alias-border-l2, #333)' : '1px dashed var(--dsw-alias-border-l2, #222)'),
                          borderRadius: '6px', padding: '8px', minHeight: '75px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                        }
                      },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' } },
                          React.createElement('span', { style: { fontWeight: '600', color: isPeak ? 'var(--dsh-cron-danger, #e33)' : 'var(--dsw-alias-label-primary, #fff)' } }, b.label),
                          hasRuns ? React.createElement('span', { style: { fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: isPeak ? 'var(--dsh-cron-danger, #e33)' : 'var(--dsw-alias-bg-layer-3, #222)', color: '#fff' } }, b.count) : null
                        ),
                        React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' } },
                          (b.runs || []).slice(0, 3).map((r, rIdx) => React.createElement('span', {
                            key: rIdx, title: (r.title || r.taskId) + ' (' + r.time + ')',
                            style: { fontSize: '9.5px', fontFamily: 'monospace', padding: '1px 4px', borderRadius: '3px', background: 'var(--dsw-alias-bg-base, #111)', border: '1px solid var(--dsw-alias-border-l2, #333)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                          }, r.title || r.taskId))
                        )
                      );
                    })
                  )
                )
              ) : (
                // 7x24 Cost & Token Heatmap View
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                  React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #888)', display: 'flex', justifyContent: 'space-between' } },
                    React.createElement('span', null, T_KEY(t, 'heatmap.matrixDesc')),
                    React.createElement('span', null, 'Max hour spend: $' + Number(heatmap.maxCostHour || 0).toFixed(4))
                  ),
                  React.createElement('div', {
                    style: { overflowX: 'auto', paddingBottom: '8px' }
                  },
                    React.createElement('table', {
                      style: { borderCollapse: 'collapse', width: '100%', minWidth: '700px', fontSize: '10.5px' }
                    },
                      React.createElement('thead', null,
                        React.createElement('tr', null,
                          React.createElement('th', { style: { padding: '4px 6px', textAlign: 'left', color: 'var(--dsw-alias-label-secondary, #888)' } }, 'Day'),
                          Array.from({ length: 24 }, (_, h) => React.createElement('th', {
                            key: h,
                            style: { padding: '4px 2px', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #888)', fontWeight: '400' }
                          }, String(h).padStart(2, '0')))
                        )
                      ),
                      React.createElement('tbody', null,
                        (heatmap.matrix || []).map((row, dIdx) => React.createElement('tr', { key: dIdx },
                          React.createElement('td', { style: { padding: '4px 6px', fontWeight: '600', color: 'var(--dsw-alias-label-primary, #ddd)' } }, (heatmap.dayLabels && heatmap.dayLabels[dIdx]) || 'Day'),
                          row.map((cell, hIdx) => {
                            const intensity = cell.costIntensity || 0;
                            const hasSpend = cell.costUsd > 0;
                            const bg = hasSpend
                              ? 'color-mix(in srgb, var(--dsh-cron-primary, #4af) ' + Math.max(15, Math.round(intensity * 100)) + '%, transparent)'
                              : 'transparent';
                            return React.createElement('td', {
                              key: hIdx,
                              title: cell.dayLabel + ' ' + cell.hourLabel + ': $' + cell.costUsd + ' (' + cell.tokens.toLocaleString() + ' tokens, ' + cell.runs + ' runs)',
                              style: {
                                padding: '3px',
                                textAlign: 'center',
                                background: bg,
                                border: '1px solid var(--dsw-alias-border-l2, #222)',
                                cursor: hasSpend ? 'pointer' : 'default'
                              }
                            }, hasSpend ? React.createElement('span', { style: { fontSize: '9px', color: intensity > 0.5 ? '#fff' : 'var(--dsw-alias-label-primary, #ddd)' } }, '$' + (cell.costUsd >= 0.01 ? cell.costUsd.toFixed(2) : cell.costUsd.toFixed(3).slice(1))) : '·');
                          })
                        ))
                      )
                    )
                  )
                )
              )
            )
          ),

          // Footer
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--dsw-alias-border-l2, #333)', background: 'var(--dsw-alias-bg-layer-2, #111)' }
          },
            React.createElement('button', {
              type: 'button',
              className: 'dsh-cron-btn-secondary',
              onClick: onClose,
              style: { padding: '6px 16px', fontSize: '12px' }
            }, T_KEY(t, 'chainGraph.close'))
          )
        )
      );
    }
