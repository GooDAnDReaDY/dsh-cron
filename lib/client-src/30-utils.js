    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return (props && props.children) || null; };
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { hasError: false, error: null };
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error };
        }
        componentDidCatch(error, errorInfo) {
          console.error('[dsh-cron] React error:', error, errorInfo);
        }
        render() {
          if (this.state.hasError) {
            return React.createElement('div', { className: 'dsh-cron-status-banner', 'data-type': 'error', style: { margin: '12px 0' } },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '⚠️ Cron UI error:'),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String((this.state.error && this.state.error.message) || this.state.error)),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-cron-btn-secondary',
                style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                onClick: () => this.setState({ hasError: false, error: null })
              }, 'Retry')
            );
          }
          return (this.props && this.props.children) || null;
        }
      };
    }
    const ErrorBoundary = createErrorBoundary();

    const AGENT_FORM_TYPES = ['llm', 'skill', 'workflow'];
    const CODE_FORM_TYPES = ['script', 'node', 'python', 'ssh', 'docker'];

    // Delivery channels (#26) — must stay in sync with lib/channels.js.
    const DELIVERY_CHANNELS = ['telegram', 'kanban', 'discord', 'slack', 'ntfy', 'bark', 'pushplus', 'tts', 'gitea'];
    const CHANNEL_LABEL_KEYS = {
      telegram: 'form.channelTelegram',
      kanban: 'form.channelKanban',
      discord: 'form.channelDiscord',
      slack: 'form.channelSlack',
      ntfy: 'form.channelNtfy',
      bark: 'form.channelBark',
      pushplus: 'form.channelPushplus',
      tts: 'form.channelTts',
      gitea: 'form.channelGitea',
    };

    // Non-secret delivery settings shown in the settings panel. Secrets are
    // referenced by credential name only (#51) — never typed as values.
    const DELIVERY_SETTING_FIELDS = [
      { key: 'botTokenRef', labelKey: 'settings.botTokenRefLabel', placeholderKey: 'settings.botTokenRefPlaceholder', group: 'secrets' },
      { key: 'ntfyTokenRef', labelKey: 'settings.ntfyTokenRefLabel', group: 'secrets' },
      { key: 'pushplusTokenRef', labelKey: 'settings.pushplusTokenRefLabel', group: 'secrets' },
      { key: 'giteaTokenRef', labelKey: 'settings.giteaTokenRefLabel', group: 'secrets' },
      // The external API is the one surface where a typed secret is the point:
      // a CI job cannot present a credential reference (#54).
      { key: 'apiToken', labelKey: 'settings.apiTokenLabel', placeholderKey: 'settings.apiTokenPlaceholder', group: 'secrets' },
      { key: 'discordWebhookUrl', labelKey: 'settings.discordLabel', group: 'channels' },
      { key: 'slackWebhookUrl', labelKey: 'settings.slackLabel', group: 'channels' },
      { key: 'ntfyUrl', labelKey: 'settings.ntfyUrlLabel', group: 'channels' },
      { key: 'ntfyTopic', labelKey: 'settings.ntfyTopicLabel', group: 'channels' },
      { key: 'barkServerUrl', labelKey: 'settings.barkServerLabel', group: 'channels' },
      { key: 'barkKey', labelKey: 'settings.barkKeyLabel', group: 'channels' },
      { key: 'pushplusUrl', labelKey: 'settings.pushplusUrlLabel', group: 'channels' },
      { key: 'ttsBaseUrl', labelKey: 'settings.ttsBaseUrlLabel', group: 'channels' },
      { key: 'giteaBaseUrl', labelKey: 'settings.giteaBaseUrlLabel', group: 'channels' },
      { key: 'giteaRepo', labelKey: 'settings.giteaRepoLabel', group: 'channels' },
      { key: 'deliveryTimeoutMs', labelKey: 'settings.deliveryTimeoutMsLabel', group: 'channels', numeric: true, defaultValue: 15000, min: 1000 },
      { key: 'silentRuleModel', labelKey: 'settings.silentRuleModelLabel', group: 'automation' },
      { key: 'inspectorModel', labelKey: 'settings.inspectorModelLabel', group: 'automation' },
    ];
    const DELIVERY_SETTING_KEYS = DELIVERY_SETTING_FIELDS.map((f) => f.key);
    // The global template plus the per-channel override map (server model).
    const TEMPLATE_SETTING_KEYS = ['template', 'channelTemplates'];

    /** Collect every delivery key the settings endpoints may return. */
    function parseEnvText(text) {
      const env = {};
      for (const rawLine of String(text || '').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key) env[key] = value;
      }
      return Object.keys(env).length ? env : undefined;
    }

    function formatEnvText(env) {
      if (!env || typeof env !== 'object') return '';
      return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
    }

    // Status colors: core semantic state tokens first (same set dsh-clinebot
    // uses), plugin fallbacks as a single point of change (#105).
    function createToggle() {
      let open = false;
      const listeners = new Set();
      return {
        isOpen: () => open,
        set: (v) => {
          if (open === v) return;
          open = !!v;
          for (const fn of listeners) fn(open);
        },
        toggle: () => {
          open = !open;
          for (const fn of listeners) fn(open);
        },
        subscribe: (fn) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        }
      };
    }

    async function openSession(ctx, sessionId) {
      if (!sessionId) return false;
      const getSessions = () => (ctx && typeof ctx.get === 'function' ? ctx.get('sessions') : (ctx && ctx.sessions));
      let sessions = getSessions();

      // 1. Try sessions.open(sessionId) immediately
      if (sessions && typeof sessions.open === 'function') {
        try {
          sessions.open(sessionId);
          return true;
        } catch (err) {
          /* sessions.open threw synchronously */
        }
      }

      // 2. If the session is not in manager.summaries yet, refresh from the backend
      if (sessions && typeof sessions.refresh === 'function') {
        try {
          await sessions.refresh();
          sessions.open(sessionId);
          return true;
        } catch (err) {
          /* sessions.refresh threw */
        }
      }

      // 3. Async retries until the WebSocket/SSE event adds the session to the list
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 120));
        sessions = getSessions();
        if (sessions && typeof sessions.open === 'function') {
          try {
            sessions.open(sessionId);
            return true;
          } catch (err) {
            /* retry polling sessions.open threw */
          }
        }
        // DOM fallback: click the session in the sidebar if it has rendered
        if (typeof document !== 'undefined') {
          const domItem = document.querySelector('[data-session-id="' + sessionId + '"], [role="treeitem"][data-id="' + sessionId + '"], [data-id="' + sessionId + '"]');
          if (domItem) {
            domItem.click();
            return true;
          }
        }
      }
      console.warn('[dsh-cron] could not open session in workspace:', sessionId);
      return false;
    }

    function statusLabel(t, status) {
      if (status === 'success') return T_KEY(t, 'history.statusSuccess');
      if (status === 'skipped') return T_KEY(t, 'history.statusSkipped');
      if (status === 'missed') return T_KEY(t, 'history.statusMissed');
      if (status === 'timeout') return T_KEY(t, 'history.statusTimeout');
      return T_KEY(t, 'history.statusFailed');
    }

    /**
     * A config-declared task is owned by the profile config file (#50): the
     * panel shows it, but editing, pausing or deleting it here would be undone
     * at the next start, so the row keeps the source label instead of the
     * actions that cannot stick.
     */
    function isConfigManaged(task) {
      return Boolean(task) && task.managedBy === 'config';
    }
    function T_KEY(t, key, vars) {
      return (typeof t === 'function' ? t : translate)(key, vars);
    }

