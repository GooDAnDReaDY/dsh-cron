    const STYLES = `
      :root {
        --dsh-cron-success: var(--dsw-alias-state-success-primary, #10b981);
        --dsh-cron-success-bg: color-mix(in srgb, var(--dsh-cron-success, #10b981) 10%, transparent);
        --dsh-cron-danger: var(--dsw-alias-state-error-primary, #ef4444);
        --dsh-cron-danger-bg: color-mix(in srgb, var(--dsh-cron-danger, #ef4444) 10%, transparent);
        --dsh-cron-info: var(--dsw-alias-state-brand-primary, #60a5fa);
        --dsh-cron-info-bg: color-mix(in srgb, var(--dsh-cron-info, #60a5fa) 12%, transparent);
        --dsh-cron-accent: var(--dsw-alias-state-info-primary, #c084fc);
        --dsh-cron-accent-bg: color-mix(in srgb, var(--dsh-cron-accent, #a855f7) 12%, transparent);
        --dsh-cron-warning: var(--dsw-alias-state-warning-primary, #eab308);
        --dsh-cron-warning-bg: color-mix(in srgb, var(--dsh-cron-warning, #eab308) 12%, transparent);
      }
      [data-pane=conversation], [class*=centerCol] {
        position: relative !important;
      }
      [${VIEW_ATTR}] {
        z-index: 60;
        background: var(--dsw-alias-bg-base, #171717);
        display: none;
        position: absolute;
        inset: 0;
      }
      html[${ACTIVE_ATTR}] [${VIEW_ATTR}] {
        display: block !important;
      }
      html[${ACTIVE_ATTR}] [data-pane=conversation] > *:not([${VIEW_ATTR}]),
      html[${ACTIVE_ATTR}] [class*=centerCol] > *:not([${VIEW_ATTR}]) {
        display: none !important;
      }

      .dsh-cron-entry-clone { display: flex; align-items: center; gap: 8px; }
      .dsh-cron-entry-icon { display: flex; align-items: center; justify-content: center; flex: none; width: 16px; height: 16px; }
      .dsh-cron-entry-label { text-overflow: ellipsis; overflow: hidden; }
      [data-dsh-frame][data-sidebar-collapsed] .dsh-cron-entry-label { display: none; }

      .dsh-cron-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base, #171717); color: var(--dsw-alias-label-primary, #ededed); overflow-y: auto; padding: 24px 48px 32px; z-index: 100; box-sizing: border-box; }
      .dsh-cron-container { max-width: 960px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; padding: 8px 0 32px; box-sizing: border-box; }

      .dsh-cron-top-bar { display: flex; align-items: center; gap: 12px; }
      .dsh-cron-back-btn { appearance: none; font: inherit; cursor: pointer; color: var(--dsw-alias-label-secondary, #9ca3af); background: 0 0; border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 8px; align-items: center; gap: 6px; padding: 4px 12px; font-size: 13px; display: inline-flex; flex: none; height: 32px; box-sizing: border-box; }
      .dsh-cron-back-btn:hover { color: var(--dsw-alias-label-primary, #ededed); background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 6%, transparent))); }

      .dsh-cron-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--dsw-alias-border-l2, #383838); }
      .dsh-cron-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 6px; }
      .dsh-cron-subtitle { font-size: 14px; color: var(--dsw-alias-label-secondary, #9ca3af); line-height: 1.5; }
      .dsh-cron-create-btn { appearance: none; display: inline-flex; align-items: center; gap: 6px; background: var(--dsw-alias-bg-layer-2, #262626); color: var(--dsw-alias-label-primary, #fff); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 9999px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; position: relative; }
      .dsh-cron-create-btn:hover { background: var(--dsw-alias-bg-layer-hover, var(--dsw-alias-interactive-bg-hover, #333)); }
      .dsh-cron-dropdown { position: absolute; top: calc(100% + 6px); right: 0; width: 200px; background: var(--dsw-alias-bg-layer-3, #212121); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 12px; padding: 6px; box-shadow: 0 10px 25px color-mix(in srgb, var(--dsw-alias-bg-mask, #000) 50%, transparent); z-index: 200; }
      .dsh-cron-dropdown-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; background: transparent; border: none; border-radius: 8px; color: var(--dsw-alias-label-primary, #ededed); font-size: 13.5px; text-align: left; cursor: pointer; }
      .dsh-cron-dropdown-item:hover { background: var(--dsw-alias-interactive-bg-hover, #2a2a2a); }
      .dsh-cron-search-bar { position: relative; margin-bottom: 0; }
      .dsh-cron-search-input { width: 100%; height: 36px; background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 0 12px 0 38px; color: var(--dsw-alias-label-primary, inherit); font-size: 13px; outline: none; box-sizing: border-box; }
      .dsh-cron-search-input:focus { outline: none; border-color: var(--dsh-cron-info); }
      .dsh-cron-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-tertiary, #666); }
      .dsh-cron-filters { margin-top: 8px; }
      .dsh-cron-filter-toggle { background: none; border: 1px solid var(--dsw-alias-border-l2, #333); color: var(--dsw-alias-label-secondary, #aaa); border-radius: 8px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
      .dsh-cron-filter-toggle:hover { color: var(--dsw-alias-label-primary, #eee); border-color: var(--dsh-cron-info); }
      .dsh-cron-filter-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2, #2e2e2e); border-radius: 8px; background: var(--dsw-alias-bg-layer-3, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 2%, transparent)); }
      .dsh-cron-filter-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); }
      .dsh-cron-filter-field select { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); color: var(--dsw-alias-label-primary, inherit); border-radius: 6px; padding: 5px 8px; font-size: 12.5px; }
      .dsh-cron-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
      .dsh-cron-tab { appearance: none; background: transparent; border: 1px solid var(--dsw-alias-border-l2, #383838); padding: 4px 12px; border-radius: 999px; color: var(--dsw-alias-label-secondary, #9ca3af); font-size: 12px; font-weight: 500; cursor: pointer; }
      .dsh-cron-tab[data-active="true"] { background: var(--dsw-alias-bg-layer-4, #2a2a2a); color: var(--dsw-alias-label-primary, #fff); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #383838)); }
      .dsh-cron-task-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 0; }
      .dsh-cron-task-item { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--dsw-alias-bg-layer-3, #1e1e1e); border: 1px solid var(--dsw-alias-border-l2, #2e2e2e); border-radius: 12px; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
      .dsh-cron-task-item:hover, .dsh-cron-task-item:focus-visible { background: var(--dsw-alias-bg-layer-4, #242424); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l1, #444)); outline: none; }
      .dsh-cron-task-prompt-preview { font-size: 12.5px; color: var(--dsw-alias-label-secondary, #888); margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 520px; line-height: 1.3; }
      .dsh-cron-type-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #383838); text-transform: uppercase; font-weight: 500; margin-left: 8px; vertical-align: middle; }
      .dsh-cron-tag-success { background: var(--dsh-cron-info-bg); color: var(--dsh-cron-info); border-color: var(--dsh-cron-info); }
      .dsh-cron-tag-failure { background: var(--dsh-cron-danger-bg); color: var(--dsh-cron-danger); border-color: var(--dsh-cron-danger); }
      .dsh-cron-tag-heartbeat { background: var(--dsh-cron-accent-bg); color: var(--dsh-cron-accent); border-color: var(--dsh-cron-accent); }
      .dsh-cron-tag-session { background: var(--dsh-cron-info-bg); color: var(--dsh-cron-info); border-color: var(--dsh-cron-info); }
      .dsh-cron-tag-preflight { background: var(--dsh-cron-warning-bg); color: var(--dsh-cron-warning); border-color: var(--dsh-cron-warning); }

      .dsh-cron-task-model-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #383838); background: var(--dsw-alias-bg-layer-2, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 6%, transparent)); color: var(--dsw-alias-label-secondary, #aaa); margin-left: 8px; vertical-align: middle; }
      .dsh-cron-task-actions { display: flex; gap: 8px; }
      .dsh-cron-icon-btn { appearance: none; font: inherit; background: var(--dsw-alias-bg-layer-2, transparent); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-weight: 500; color: var(--dsw-alias-label-primary, #aaa); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; }
      .dsh-cron-icon-btn:hover { background: var(--dsw-alias-bg-layer-4, #2a2a2a); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #444)); }
      .dsh-cron-icon-btn.dsh-cron-danger { color: var(--dsh-cron-danger); border-color: var(--dsh-cron-danger-bg); }
      .dsh-cron-icon-btn.dsh-cron-danger:hover { background: var(--dsh-cron-danger-bg); border-color: var(--dsh-cron-danger); }
      .dsh-cron-task-status-btn { background: none; border: 1px solid var(--dsw-alias-border-l2, #444); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; flex-shrink: 0; }
      .dsh-cron-task-status-btn[data-active="true"] { color: var(--dsh-cron-success); border-color: var(--dsh-cron-success); }
      .dsh-cron-recs-title { font-size: 16px; font-weight: 600; margin-bottom: 14px; }
      .dsh-cron-recs-list { display: flex; flex-direction: column; gap: 10px; }
      .dsh-cron-rec-card { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--dsw-alias-bg-layer-3, #1c1c1c); border: 1px solid var(--dsw-alias-border-l2, #282828); border-radius: 12px; cursor: pointer; transition: background 0.15s; }
      .dsh-cron-rec-card:hover, .dsh-cron-rec-card:focus-visible { background: var(--dsw-alias-bg-layer-4, #242424); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #383838)); outline: none; }
      .dsh-cron-rec-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 3%, transparent)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .dsh-cron-rec-content { flex: 1; min-width: 0; }
      .dsh-cron-rec-title { font-size: 14.5px; font-weight: 500; margin-bottom: 4px; }
      .dsh-cron-rec-time { font-size: 13px; color: var(--dsw-alias-label-secondary, #9ca3af); font-weight: normal; margin-left: 8px; }
      .dsh-cron-rec-desc { font-size: 13px; color: var(--dsw-alias-label-tertiary, #71717a); }

      .dsh-cron-modal-overlay { position: fixed; inset: 0; background: var(--dsw-alias-bg-mask, color-mix(in srgb, #000 75%, transparent)); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; box-sizing: border-box; overflow-y: auto; }
      .dsh-cron-modal { background: var(--dsw-alias-bg-layer-2, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 16px; width: 100%; max-width: 540px; max-height: min(90vh, calc(100vh - 36px)); overflow-y: auto; padding: 24px; box-shadow: 0 20px 40px color-mix(in srgb, var(--dsw-alias-bg-mask, #000) 60%, transparent); box-sizing: border-box; }
      .dsh-cron-modal-scroll { max-width: 640px; max-height: min(90vh, calc(100vh - 36px)); overflow-y: auto; }
      .dsh-cron-modal::-webkit-scrollbar { width: 6px; }
      .dsh-cron-modal::-webkit-scrollbar-track { background: transparent; }
      .dsh-cron-modal::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2, #383838); border-radius: 3px; }
      .dsh-cron-modal::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-label-tertiary, #555); }
      .dsh-cron-section-head { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; padding: 0; margin-bottom: 10px; font: inherit; font-weight: 500; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #aaa); cursor: pointer; }
      .dsh-cron-section-head:hover { color: var(--dsw-alias-label-primary, #eee); }
      .dsh-cron-section-chevron { transition: transform 0.15s ease; display: inline-block; }
      .dsh-cron-section-chevron[data-open="false"] { transform: rotate(-90deg); }
      .dsh-cron-section-body { padding-bottom: 4px; }
      .dsh-cron-modal-title { font-size: 18px; font-weight: 600; margin-bottom: 18px; }
      .dsh-cron-form-group { margin-bottom: 16px; }
      .dsh-cron-form-group label { display: block; font-size: 13px; color: var(--dsw-alias-label-secondary, #aaa); margin-bottom: 6px; }
      .dsh-cron-form-group input, .dsh-cron-form-group textarea, .dsh-cron-form-group select { width: 100%; background: var(--dsw-alias-bg-layer-2, #141414); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 8px 12px; color: var(--dsw-alias-label-primary, #fff); font-size: 13px; outline: none; box-sizing: border-box; }
      .dsh-cron-form-group input:focus, .dsh-cron-form-group textarea:focus, .dsh-cron-form-group select:focus { outline: none; border-color: var(--dsh-cron-info); }
      .dsh-cron-form-group select { cursor: pointer; }
      .dsh-cron-form-group textarea { min-height: 80px; resize: vertical; }
      .dsh-cron-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .dsh-cron-modal-foot { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 20px; position: sticky; bottom: -24px; background: var(--dsw-alias-bg-layer-2, #1f1f1f); border-top: 1px solid var(--dsw-alias-border-l2, #2e2e2e); padding-top: 14px; padding-bottom: 4px; margin-left: -24px; margin-right: -24px; padding-left: 24px; padding-right: 24px; z-index: 10; }
      .dsh-cron-btn-primary { background: var(--dsw-alias-label-primary, #ededed); color: var(--dsw-alias-bg-layer-3, #111); border: 1px solid transparent; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .dsh-cron-btn-primary:hover:not(:disabled) { opacity: 0.88; }
      .dsh-cron-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .dsh-cron-btn-secondary { appearance: none; font: inherit; background: var(--dsw-alias-bg-layer-2, transparent); color: var(--dsw-alias-label-primary, #999); border: 1px solid var(--dsw-alias-border-l2, #383838); border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; }
      .dsh-cron-btn-secondary:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-4, #2a2a2a); border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2, #444)); }
      .dsh-cron-chat-box { position: relative; background: var(--dsw-alias-bg-base, #141414); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 12px; padding: 12px; }
      .dsh-cron-chat-input { width: 100%; background: transparent; border: none; color: var(--dsw-alias-label-primary, #fff); font-size: 14px; min-height: 100px; resize: vertical; outline: none; box-sizing: border-box; line-height: 1.5; }
      .dsh-cron-chat-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, #222); }
      .dsh-cron-chat-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #666); }
      .dsh-cron-send-btn { width: 34px; height: 34px; border-radius: 8px; background: var(--dsw-alias-label-primary, #ededed); color: var(--dsw-alias-bg-base, #111); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s, background 0.15s; }
      .dsh-cron-send-btn:hover:not(:disabled) { transform: translateY(-1px); }
      .dsh-cron-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .dsh-cron-card { background: var(--dsw-alias-bg-layer-3, #1f1f1f); border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 12px; padding: 18px 20px; margin-bottom: 0; display: flex; flex-direction: column; gap: 14px; }
      .dsh-cron-card-head-btn { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; background: 0 0; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 12px; padding: 0; }
      .dsh-cron-card-head-btn .dsh-cron-card-title { flex: 1; }
      .dsh-cron-card-title { font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-chev { margin-left: auto; flex: none; color: var(--dsw-alias-label-tertiary, #888); transition: transform 0.16s; display: flex; align-items: center; }
      .dsh-cron-chev-open { transform: rotate(180deg); }
      .dsh-cron-card-body { border-top: 1px solid var(--dsw-alias-border-l2, #333); margin-top: 2px; padding-top: 14px; }
      .dsh-cron-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .dsh-cron-card-desc { font-size: 13px; color: var(--dsw-alias-label-secondary, #888); line-height: 1.4; }

      .dsh-cron-modal-nav { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, #2e2e2e); margin-bottom: 18px; padding-bottom: 2px; }
      .dsh-cron-modal-tab { appearance: none; background: transparent; border: none; border-bottom: 2px solid transparent; padding: 8px 14px; font-size: 13.5px; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; font-weight: 500; transition: color 0.15s, border-color 0.15s; }
      .dsh-cron-modal-tab:hover { color: var(--dsw-alias-label-secondary, #ccc); }
      .dsh-cron-modal-tab[data-active="true"] { color: var(--dsw-alias-label-primary, #fff); border-bottom-color: var(--dsw-alias-label-primary, #ededed); }
      .dsh-cron-history-list { display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow-y: auto; padding-right: 4px; }
      .dsh-cron-history-item { background: var(--dsw-alias-bg-base, #161616); border: 1px solid var(--dsw-alias-border-l1, #2a2a2a); border-radius: 8px; padding: 12px 14px; font-size: 12.5px; }
      .dsh-cron-history-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .dsh-cron-history-status { font-weight: 500; font-size: 11px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #383838); }
      .dsh-cron-history-status[data-status="success"] { background: var(--dsh-cron-success-bg); color: var(--dsh-cron-success); border-color: var(--dsh-cron-success); }
      .dsh-cron-history-status[data-status="error"], .dsh-cron-history-status[data-status="timeout"] { background: var(--dsh-cron-danger-bg); color: var(--dsh-cron-danger); border-color: var(--dsh-cron-danger); }
      .dsh-cron-history-status[data-status="skipped"], .dsh-cron-history-status[data-status="missed"] { background: var(--dsh-cron-warning-bg); color: var(--dsh-cron-warning); border-color: var(--dsh-cron-warning); }
      .dsh-cron-history-time { color: var(--dsw-alias-label-tertiary, #777); font-size: 12px; }
      .dsh-cron-history-output { background: var(--dsw-alias-bg-base, #0c0c0c); border: 1px solid var(--dsw-alias-border-l1, #222); border-radius: 6px; padding: 8px 10px; font-family: monospace; font-size: 12px; color: var(--dsw-alias-label-secondary, #bbb); max-height: 140px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin-top: 6px; }
      .dsh-cron-history-empty { text-align: center; padding: 36px 0; color: var(--dsw-alias-label-tertiary, #666); font-size: 13.5px; }

      .dsh-cron-stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 0; }
      .dsh-cron-stat-card { background: var(--dsw-alias-bg-layer-2, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 2%, transparent)); border: 1px solid var(--dsw-alias-border-l2, #222); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
      .dsh-cron-stat-val { font-size: 18px; font-weight: 700; color: var(--dsw-alias-label-primary, #fff); }
      .dsh-cron-stat-lbl { font-size: 12px; color: var(--dsw-alias-label-secondary, #777); margin-top: 0; }
      .dsh-cron-oneshot-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsh-cron-accent); background: var(--dsh-cron-accent-bg); color: var(--dsh-cron-accent); font-weight: 500; }
      .dsh-cron-config-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #444); color: var(--dsw-alias-label-secondary, #ccc); font-weight: 500; }
      .dsh-cron-cost-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsh-cron-success); background: var(--dsh-cron-success-bg); color: var(--dsh-cron-success); font-weight: 500; }
      .dsh-cron-tokens-tag { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsh-cron-info); background: var(--dsh-cron-info-bg); color: var(--dsh-cron-info); }
      .dsh-cron-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dsw-alias-label-secondary, #ccc); cursor: pointer; user-select: none; }
      .dsh-cron-checkbox-row input { width: 15px; height: 15px; margin: 0; cursor: pointer; accent-color: var(--dsw-alias-label-primary, #ededed); }
      .dsh-cron-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); margin-top: 4px; }
      .dsh-cron-channel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 12px; }
      .dsh-cron-section { border-top: 1px solid var(--dsw-alias-border-l2, #2e2e2e); margin-top: 16px; padding-top: 12px; }
      .dsh-cron-section-title { font-weight: 500; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #aaa); margin-bottom: 10px; }
      .dsh-cron-secret-row { display: flex; align-items: center; gap: 8px; }
      .dsh-cron-secret-row input { flex: 1; }
      .dsh-cron-badge-ref { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-3, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 6%, transparent)); color: var(--dsw-alias-label-tertiary, #888); white-space: nowrap; }
      .dsh-cron-status-banner { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-top: 12px; }
      .dsh-cron-status-banner[data-type="success"] { background: var(--dsh-cron-success-bg); border: 1px solid var(--dsh-cron-success); color: var(--dsh-cron-success); }
      .dsh-cron-status-banner[data-type="error"] { background: var(--dsh-cron-danger-bg); border: 1px solid var(--dsh-cron-danger); color: var(--dsh-cron-danger); }
      .dsh-cron-status-banner[data-type="info"] { background: var(--dsh-cron-info-bg); border: 1px solid var(--dsh-cron-info); color: var(--dsh-cron-info); }
      @keyframes dsh-cron-pulse-ring { 0% { box-shadow: 0 0 0 0 var(--dsh-cron-success-bg); } 70% { box-shadow: 0 0 0 9px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
      .dsh-cron-pulse { animation: dsh-cron-pulse-ring 1.6s infinite; border-color: var(--dsh-cron-success); color: var(--dsh-cron-success); }

      /* #34: sidebar job list */
      .dsh-cron-sidebar-jobs { display: flex; flex-direction: column; gap: 2px; margin: 2px 0 6px 0; }
      .dsh-cron-sidebar-jobs-head { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; padding: 4px 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; border-radius: 6px; text-align: left; }
      .dsh-cron-sidebar-jobs-head:hover { color: var(--dsw-alias-label-primary, #eee); background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 4%, transparent)); }
      .dsh-cron-sidebar-jobs-head::after { content: '▾'; font-size: 10px; transition: transform 0.15s ease; }
      .dsh-cron-sidebar-jobs[data-open="false"] .dsh-cron-sidebar-jobs-head::after { transform: rotate(-90deg); }
      .dsh-cron-sidebar-jobs[data-open="false"] .dsh-cron-sidebar-jobs-list { display: none; }
      .dsh-cron-sidebar-jobs-list { display: flex; flex-direction: column; gap: 2px; padding-left: 10px; }
      .dsh-cron-sidebar-job { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; background: none; border: none; border-left: 2px solid transparent; padding: 3px 8px; font: inherit; cursor: pointer; border-radius: 0 6px 6px 0; text-align: left; }
      .dsh-cron-sidebar-job:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 4%, transparent)); border-left-color: var(--dsh-cron-info); }
      .dsh-cron-sidebar-job-title { font-size: 12px; color: var(--dsw-alias-label-secondary, #ccc); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsh-cron-sidebar-job-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary, #777); }
      .dsh-cron-sidebar-empty, .dsh-cron-sidebar-more { font-size: 11px; color: var(--dsw-alias-label-tertiary, #777); padding: 2px 8px; }
      .dsh-cron-task-highlight { border-color: var(--dsh-cron-info) !important; box-shadow: 0 0 0 2px var(--dsh-cron-info-bg); }

      /* #39: narrow screens. Only layout changes — no information is hidden. */
      @media (max-width: 900px) {
        .dsh-cron-container { padding: 8px 12px 24px; gap: 14px; }
        .dsh-cron-form-row { grid-template-columns: 1fr; }
        .dsh-cron-channel-grid { grid-template-columns: 1fr; }
        .dsh-cron-filter-panel { grid-template-columns: 1fr; }
        .dsh-cron-modal { padding: 16px; border-radius: 12px; }
        .dsh-cron-modal-foot { bottom: -16px; margin-left: -16px; margin-right: -16px; padding-left: 16px; padding-right: 16px; }
        .dsh-cron-modal-scroll { max-height: 92vh; }
        .dsh-cron-task-item { flex-wrap: wrap; gap: 10px; }
        .dsh-cron-task-actions { margin-left: auto; }
        .dsh-cron-history-list { max-height: 320px; }
      }
      @media (max-width: 640px) {
        .dsh-cron-container { padding: 6px 8px 20px; }
        .dsh-cron-top-bar { flex-wrap: wrap; gap: 8px; }
        .dsh-cron-tabs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
        .dsh-cron-tab { white-space: nowrap; }
        .dsh-cron-stats-bar { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
        .dsh-cron-task-item { align-items: flex-start; padding: 12px; }
        .dsh-cron-task-title { flex-wrap: wrap; row-gap: 4px; }
        .dsh-cron-modal { padding: 14px; }
        .dsh-cron-modal-foot { flex-direction: column-reverse; }
        .dsh-cron-modal-foot > button { width: 100%; }
        .dsh-cron-filter-panel { padding: 8px 10px; }
        .dsh-cron-card { padding: 14px; }
        /* 16px keeps iOS Safari from zooming the page when a field is focused. */
        .dsh-cron-modal input, .dsh-cron-modal select, .dsh-cron-modal textarea,
        .dsh-cron-card input, .dsh-cron-search-input, .dsh-cron-filter-field select { font-size: 16px; }
      }
    `;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('dsh-cron-styles');
      if (!el) {
        el = document.createElement('style');
        el.id = 'dsh-cron-styles';
        // Mark ownership before insertion so neighbor cleanups leave it alone (#91)
        el.dataset.dshPlugin = 'dsh-cron';
        document.head.appendChild(el);
      }
      el.textContent = STYLES;
    }

