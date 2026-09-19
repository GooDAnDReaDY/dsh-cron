# Changelog

Notable changes to `@goodandready/dsh-cron`.

## 0.2.20

### Fixed
- **Settings reachable again**: the card registered into `settings.plugin.item`, a
  slot the current DSH core (0.1.6-alpha.2) no longer renders, so the plugin's
  settings were unreachable. The surface now registers into the Plugins page row
  seat `plugins.row.config` first, keyed `@goodandready/dsh-cron#dsh-cron`
  (`rowConfigKey(package, rowId)`): the plugin's row gains a configure control whose
  page is the settings form (`view: 'page'`, open and without our card chrome — the
  host page draws the title, icon, crumb and padding) plus a one-line state for
  `view: 'summary'`. The legacy seat stays registered as a fallback, and the rule
  from #102 (no top-level section fallback) is preserved.
- The card contract test (#100) now expects the head to honour the row-seat page
  view as well as the local collapse state.

### Added
- This changelog.
