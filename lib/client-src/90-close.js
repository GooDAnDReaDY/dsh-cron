    function mountCronScreen(ctx, toggle) {
      if (typeof document === 'undefined') return () => {};
      let root;
      let container;

      const ensure = () => {
        if (container !== undefined && container.isConnected) return;
        const column = document.querySelector(COLUMN_SELECTOR);
        if (column === null) return;
        container = document.createElement('div');
        container.setAttribute(VIEW_ATTR, '');
        container.setAttribute('data-dsh-plugin', 'dsh-cron');
        column.appendChild(container);
        if (ReactDOM && typeof ReactDOM.createRoot === 'function') {
          root = ReactDOM.createRoot(container);
          root.render(React.createElement(ErrorBoundary, null, React.createElement(CronScreen, { ctx, toggle, onClose: () => toggle.set(false), t: translate })));
        } else if (ReactDOM && typeof ReactDOM.render === 'function') {
          ReactDOM.render(React.createElement(CronScreen, { ctx, toggle, onClose: () => toggle.set(false), t: translate }), container);
        }
      };

      const applyActive = () => {
        if (toggle.isOpen()) {
          document.documentElement.setAttribute(ACTIVE_ATTR, '');
          document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL }));
        } else {
          document.documentElement.removeAttribute(ACTIVE_ATTR);
        }
      };

      const onOtherActivate = (event) => {
        if (event.detail !== PANEL && toggle.isOpen()) toggle.set(false);
      };
      const onSidebarClick = (event) => {
        if (!toggle.isOpen()) return;
        const target = event.target;
        if (target !== null && target.closest && target.closest(SESSION_ROW_SELECTOR) !== null) toggle.set(false);
      };

      const waitObserver = new MutationObserver(ensure);
      waitObserver.observe(document.body, { childList: true, subtree: true });
      document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
      document.addEventListener('click', onSidebarClick, true);
      const unsubscribe = toggle.subscribe(applyActive);
      applyActive();
      ensure();

      return () => {
        waitObserver.disconnect();
        document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
        document.removeEventListener('click', onSidebarClick, true);
        unsubscribe();
        document.documentElement.removeAttribute(ACTIVE_ATTR);
        if (root !== undefined) root.unmount();
        root = undefined;
        if (container !== undefined) container.remove();
        container = undefined;
      };
    }

    /**
     * Register a card into a DSH mount point. Mount points are populated via
     * ctx.slots.inject(mount, cb) — a direct slots.register does not throw but
     * also never appears in the target surface (settings plugins tab, header),
     * so the inject contract is mandatory (#85).
     */
    function registerIntoMount(ctx, mountName, entry, component) {
      if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return false;
      try {
        return !!ctx.slots.inject(mountName, () => {
          ctx.slots.register(entry, component);
        });
      } catch (err) {
        console.warn('[dsh-cron] slot injection skipped:', mountName, '-', err && err.message);
        return false;
      }
    }

    function apply(ctx) {
      ensureStyles();

      // Register the English canonical strings; rebinding the translator lets
      // the translation plugin drive the active language at runtime (#87).
      try {
        if (ctx.locale && typeof ctx.locale.register === 'function') {
          ctx.locale.register(NS, STRINGS);
        }
      } catch (e) {
        // Re-registration in the same session throws — the dictionary is live already.
      }
      try {
        if (ctx.locale && typeof ctx.locale.bind === 'function') {
          translate = ctx.locale.bind(NS);
        }
      } catch (err) {
        /* locale bind unavailable, fallback to default translate */
      }

      const toggle = createToggle();

      // The settings card lives ONLY in the plugins settings tab (#102): no
      // top-level section fallback — the flat sidebar list is a shared core
      // resource, and the card slot is proven on current builds (#85).
      function SettingsCardWithBoundary(props) {
        return React.createElement(ErrorBoundary, null, CronSettingsCard(props));
      }
      // List seat (plugins.item): the seat the Plugins page renders as the plugin's own
      // page with its configuration. The label is a static string on purpose — it is
      // resolved while the page renders, and a locale lookup there would take the whole
      // client batch down with it.
      const itemOk = registerIntoMount(ctx, 'plugins.item', {
        name: 'plugins.item',
        id: ROW_ID,
        order: 60,
        label: () => 'Cron',
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, SettingsCardWithBoundary);
      if (!itemOk) {
        console.warn('[dsh-cron] plugins.item slot unavailable — plugin page card not registered');
      }
      // Row seat and the legacy settings.plugin.item seat stay as fallbacks
      // (#102: still no top-level section fallback).
      const rowOk = registerIntoMount(ctx, 'plugins.row.config', {
        name: 'plugins.row.config',
        key: ROW_CONFIG_KEY,
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, SettingsCardWithBoundary);
      const cardOk = registerIntoMount(ctx, 'settings.plugin.item', {
        name: 'settings.plugin.item',
        key: NS,
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, SettingsCardWithBoundary);
      if (!cardOk) {
        console.warn('[dsh-cron] settings.plugin.item slot unavailable — settings card not registered');
      }

      const chipOk = registerIntoMount(ctx, 'conversation.session.header.utilities', {
        name: 'conversation.session.header.utilities',
        id: PLUGIN_ID + '.chip',
        order: 27,
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, CronChip);
      const cardSlot = cardOk ? 'settings.plugin.item' : undefined;
      const chipSlot = chipOk ? 'conversation.session.header.utilities' : undefined;

      function CronChip(props) {
        const chipT = props.t || translate;
        return React.createElement('button', {
          type: 'button',
          style: { background: 'none', border: 'none', color: 'var(--dsw-alias-label-secondary, #999)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' },
          title: T_KEY(chipT, 'chip.title'),
          'aria-label': T_KEY(chipT, 'chip.title'),
          onClick: () => toggle.toggle(),
          dangerouslySetInnerHTML: { __html: ICON_TIMER }
        });
      }

      ctx.effect(() => {
        const off = [
          mountSidebarEntry(toggle, translate('sidebar.label')),
          mountSidebarJobs(toggle, translate('sidebar.jobsTitle'), (taskId) => { pendingTaskHighlight = taskId; }),
          mountCronScreen(ctx, toggle)
        ];
        return () => { for (const dispose of off) dispose(); };
      }, 'dsh-cron: client overlay');

      exports.slots = { card: cardSlot, chip: chipSlot };
    }

    module.exports = { apply, inject: ['slots', 'locale'] };
    return module.exports;
  }
})
