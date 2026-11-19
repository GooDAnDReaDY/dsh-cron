    // True while the desktop shell renders the panel through `shell.overlay`.
    // That shell does not render third-party entries of the `main` slot, so the
    // legacy column overlay must step aside only when the shell really took over
    // (GH #27) — never on a `layout.panelInfo.activePanelId` guess.
    let shellOverlayActive = false;

    function mountCronScreen(ctx, toggle) {
      if (typeof document === 'undefined') return () => {};
      let root;
      let container;

      const teardownPanel = () => {
        if (root !== undefined) {
          try { root.unmount(); } catch (e) { void e; }
          root = undefined;
        }
        if (container !== undefined) {
          try { container.remove(); } catch (e) { void e; }
          container = undefined;
        }
      };

      const ensure = () => {
        if (!toggle.isOpen()) {
          teardownPanel();
          return;
        }
        if (shellOverlayActive) {
          teardownPanel();
          return;
        }
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
          // Repair a dropped stylesheet before the panel paints, so opening the
          // screen never shows an unstyled page (see startStyleSelfHeal).
          ensureStyles();
          document.documentElement.setAttribute(ACTIVE_ATTR, '');
          document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL }));
          ensure();
        } else {
          document.documentElement.removeAttribute(ACTIVE_ATTR);
          teardownPanel();
        }
      };

      const onOtherActivate = (event) => {
        if (event.detail !== PANEL && toggle.isOpen()) toggle.set(false);
      };
      const onOutsideClick = (event) => {
        // The shell owns the surface and its own navigation while the overlay is
        // mounted; a document-level dismissal here would close the panel on the
        // first click inside it (GH #27).
        if (shellOverlayActive) return;
        if (!toggle.isOpen()) return;
        if (!shouldDismissPanel(event.target)) return;
        toggle.set(false);
      };

      const waitObserver = new MutationObserver(ensure);
      waitObserver.observe(document.body, { childList: true, subtree: true });
      document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
      document.addEventListener('click', onOutsideClick, true);
      const unsubscribe = toggle.subscribe(applyActive);
      applyActive();
      ensure();

      return () => {
        waitObserver.disconnect();
        document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
        document.removeEventListener('click', onOutsideClick, true);
        unsubscribe();
        document.documentElement.removeAttribute(ACTIVE_ATTR);
        teardownPanel();
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
      const stopStyleSelfHeal = startStyleSelfHeal();

      // Register the English canonical strings; rebinding the translator lets
      // the translation plugin drive the active language at runtime (#87).
      // Own the dictionary as an effect: fiber dispose/HMR removes exactly this
      // registration, so a re-applied plugin registers again instead of throwing
      // "locale namespace ... already has locale ..." into a swallowed catch and
      // leaving the previously registered (stale) dictionary in place.
      try {
        if (ctx.locale && typeof ctx.locale.register === 'function' && typeof ctx.effect === 'function') {
          ctx.effect(() => ctx.locale.register(NS, STRINGS), 'dsh-cron: locale dictionaries');
        } else if (ctx.locale && typeof ctx.locale.register === 'function') {
          ctx.locale.register(NS, STRINGS);
        }
      } catch (e) {
        // A plain re-registration in the same session throws; the effect form above avoids it.
        void e;
      }
      try {
        if (ctx.locale && typeof ctx.locale.bind === 'function') {
          translate = ctx.locale.bind(NS);
        }
      } catch (err) { void err; }

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

      function CronNavIcon(props) {
        const size = (props && props.size) || 16;
        return React.createElement('span', {
          className: 'dsh-cron-nav-icon',
          'data-dsh-cron-entry': '',
          'data-dsh-plugin': 'dsh-cron',
          style: { width: size, height: size },
          // The panellist row is rendered by the host; when its selection does
          // not reach the layout service, clicking our own icon still opens the
          // panel.
          onClick: () => toggle.set(true),
          dangerouslySetInnerHTML: { __html: ICON_TIMER }
        });
      }

      const navOk = registerIntoMount(ctx, 'sidebar.panellist', {
        name: 'sidebar.panellist',
        id: 'dsh-cron',
        order: 12,
        label: () => translate('sidebar.label'),
        locale: NS,
      }, CronNavIcon);

      function CronMainPage(props) {
        if (shellOverlayActive) return null;
        return React.createElement(ErrorBoundary, null, React.createElement(CronScreen, {
          ...props,
          ctx: props.ctx || ctx,
          toggle: props.toggle || toggle,
          t: translate,
          onClose: () => {
            const layoutService = optionalService(ctx, 'layout');
            if (layoutService && typeof layoutService.selectPanel === 'function') {
              layoutService.selectPanel(null);
            }
            toggle.set(false);
          }
        }));
      }

      const mainOk = registerIntoMount(ctx, 'main', {
        name: 'main',
        key: 'dsh-cron',
        locale: NS,
        inject: () => ({ ctx, toggle }),
      }, CronMainPage);

      /**
       * The desktop shell (document served from `dsh-app://`) renders
       * `shell.overlay` but ignores third-party `main` entries. Mount the same
       * screen there; the flag keeps the legacy column overlay from tearing
       * itself down for a `main` that never appears (GH #27).
       */
      function CronShellOverlay() {
        const [open, setOpen] = React.useState(toggle.isOpen());
        React.useEffect(() => {
          shellOverlayActive = true;
          const off = toggle.subscribe(setOpen);
          setOpen(toggle.isOpen());
          return () => {
            shellOverlayActive = false;
            off();
          };
        }, []);
        if (!open) return null;
        return React.createElement('div', {
          className: 'dsh-cron-shell-overlay',
          'data-dsh-plugin': 'dsh-cron',
          [VIEW_ATTR]: '',
        }, React.createElement('div', { className: 'dsh-cron-shell-overlay-inner' },
          React.createElement(ErrorBoundary, null, React.createElement(CronScreen, {
            ctx,
            toggle,
            pinned: true,
            t: translate,
            onClose: () => {
              const layoutService = optionalService(ctx, 'layout');
              if (layoutService && typeof layoutService.selectPanel === 'function') {
                layoutService.selectPanel(null);
              }
              toggle.set(false);
            },
          }))));
      }

      const isDesktopShell = (() => {
        try {
          if (typeof location === 'undefined') return false;
          if (location.protocol === 'dsh-app:') return true;
          return String(location.host || '').toLowerCase() === 'app';
        } catch (err) {
          return false;
        }
      })();
      if (isDesktopShell) {
        registerIntoMount(ctx, 'shell.overlay', {
          name: 'shell.overlay',
          id: PLUGIN_ID,
          order: 900,
          locale: NS,
          inject: () => ({ ctx, toggle }),
        }, CronShellOverlay);
      }

      const layout = optionalService(ctx, 'layout');
      if (layout && typeof layout.selectPanel === 'function') {
        toggle.subscribe((isOpen) => {
          if (isOpen) {
            layout.selectPanel('dsh-cron');
          } else if (layout.panelInfo && typeof layout.panelInfo.getSnapshot === 'function') {
            if (layout.panelInfo.getSnapshot()?.activePanelId === 'dsh-cron') {
              layout.selectPanel(null);
            }
          }
        });
        if (layout.panelInfo && typeof layout.panelInfo.subscribe === 'function') {
          layout.panelInfo.subscribe(() => {
            const active = layout.panelInfo.getSnapshot()?.activePanelId === 'dsh-cron';
            if (toggle.isOpen() !== active) {
              toggle.set(active);
            }
          });
        }
      }

      const barOk = registerIntoMount(ctx, 'conversation.session.header.actions', {
        name: 'conversation.session.header.actions',
        id: PLUGIN_ID + '.sessionBar',
        order: 28,
        locale: NS,
        inject: (slotParam) => {
          const sid = typeof slotParam === 'string' ? slotParam : (slotParam && (slotParam.sessionId || slotParam.id));
          const extra = (typeof slotParam === 'object' && slotParam !== null) ? slotParam : {};
          return { ctx, toggle, sessionId: sid, ...extra };
        },
      }, function QuickBarBoundary(props) {
        return React.createElement(ErrorBoundary, null, React.createElement(SessionQuickActionBar, props));
      });
      const barSlot = barOk ? 'conversation.session.header.actions' : undefined;

      function CronChip(props) {
        const visible = useHeaderVisibility('showChatHeaderButton');
        if (!visible) return null;
        const chipT = props.t || translate;
        return React.createElement('button', {
          type: 'button',
          'data-dsh-plugin': 'dsh-cron',
          style: { background: 'none', border: 'none', color: 'var(--dsw-alias-label-secondary, #999)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' },
          title: T_KEY(chipT, 'chip.title'),
          'aria-label': T_KEY(chipT, 'chip.title'),
          onClick: () => toggle.toggle(),
          dangerouslySetInnerHTML: { __html: ICON_TIMER }
        });
      }

      ctx.effect(() => {
        const off = [
          mountSidebarJobs(toggle, translate('sidebar.jobsTitle'), (taskId) => { pendingTaskHighlight = taskId; }),
          mountCronScreen(ctx, toggle)
        ];
        return () => { for (const dispose of off) dispose(); stopStyleSelfHeal(); };
      }, 'dsh-cron: client overlay');

      exports.slots = { card: cardSlot, chip: chipSlot, sessionBar: barSlot, nav: navOk ? 'sidebar.panellist' : undefined, main: mainOk ? 'main' : undefined };
      module.exports.panelDismissRule = shouldDismissPanel;
      module.exports.sidebarJobsSeatIsCurrent = sidebarJobsSeatIsCurrent;
      module.exports.updateHeaderSettings = updateHeaderSettings;
      module.exports.useHeaderVisibility = useHeaderVisibility;
      module.exports.getHeaderSettings = () => currentHeaderSettings;
    }

    module.exports = { apply, inject: ['slots', 'locale'] };
    return module.exports;
  }
})
