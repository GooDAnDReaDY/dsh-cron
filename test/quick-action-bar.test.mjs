import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { TaskStore } from '../lib/store.js';
import { Config, SETTINGS_SYNC_KEYS } from '../lib/settings.js';

test('client bundle exports conversation.session.header.actions slot for quick action bar', () => {
  const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js');
  const clientSrc = fs.readFileSync(clientPath, 'utf-8');

  // Verify component and slot presence in assembled bundle
  assert.ok(clientSrc.includes('SessionQuickActionBar'), 'SessionQuickActionBar defined in client bundle');
  assert.ok(clientSrc.includes('conversation.session.header.actions'), 'conversation.session.header.actions slot mounted');
  assert.ok(clientSrc.includes('dsh-cron-session-bar'), 'dsh-cron-session-bar styles/class present');
  assert.ok(clientSrc.includes('dsh-cron-session-add-btn'), 'dsh-cron-session-add-btn class present');
  assert.ok(clientSrc.includes('sessionBar.addRecurring'), 'sessionBar localization keys compiled');
  assert.ok(clientSrc.includes('sessionBar: barSlot'), 'sessionBar slot exported in module.exports.slots');
});

test('lib/client-src/75-quick-action-bar.js contains zero empty catch blocks and zero raw rgba', () => {
  const barPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client-src', '75-quick-action-bar.js');
  const barSrc = fs.readFileSync(barPath, 'utf-8');

  assert.ok(!barSrc.includes('rgba('), 'no raw rgba() in 75-quick-action-bar.js');

  // Verify catches have void statements
  const catches = barSrc.match(/catch\s*\([^\)]*\)\s*\{([^}]*)\}/g) || [];
  for (const c of catches) {
    assert.ok(c.includes('void '), `catch block must have void statement: ${c}`);
  }
});

test('chat header visibility settings schema and store persistence (Issue #422)', () => {
  // 1. Verify Config schema includes header visibility flags
  const defaultConfig = Config();
  assert.equal(defaultConfig.showChatHeaderButton, true, 'showChatHeaderButton defaults to true');
  assert.equal(defaultConfig.showChatHeaderActions, true, 'showChatHeaderActions defaults to true');

  // 2. Verify SETTINGS_SYNC_KEYS includes both keys
  assert.ok(SETTINGS_SYNC_KEYS.includes('showChatHeaderButton'), 'SETTINGS_SYNC_KEYS includes showChatHeaderButton');
  assert.ok(SETTINGS_SYNC_KEYS.includes('showChatHeaderActions'), 'SETTINGS_SYNC_KEYS includes showChatHeaderActions');

  // 3. Verify store defaults and persistence
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-header-test-'));
  const storePath = path.join(tmpDir, 'cron.json');
  try {
    const store = new TaskStore(storePath);
    const initialSettings = store.getSettings();
    assert.equal(initialSettings.showChatHeaderButton, true, 'store defaults showChatHeaderButton to true');
    assert.equal(initialSettings.showChatHeaderActions, true, 'store defaults showChatHeaderActions to true');

    const clientSettings = store.getClientSettings();
    assert.equal(clientSettings.showChatHeaderButton, true, 'clientSettings reflects showChatHeaderButton = true');
    assert.equal(clientSettings.showChatHeaderActions, true, 'clientSettings reflects showChatHeaderActions = true');

    // Save disabled state
    store.saveSettings({
      showChatHeaderButton: false,
      showChatHeaderActions: false,
    });

    const updatedSettings = store.getSettings();
    assert.equal(updatedSettings.showChatHeaderButton, false, 'store persists showChatHeaderButton = false');
    assert.equal(updatedSettings.showChatHeaderActions, false, 'store persists showChatHeaderActions = false');

    // Reload from disk to verify cold persistence across restarts
    const reloadedStore = new TaskStore(storePath);
    const reloadedSettings = reloadedStore.getSettings();
    assert.equal(reloadedSettings.showChatHeaderButton, false, 'persists across restart');
    assert.equal(reloadedSettings.showChatHeaderActions, false, 'persists across restart');

    // Re-enable individual toggle
    reloadedStore.saveSettings({ showChatHeaderButton: true });
    const finalSettings = reloadedStore.getSettings();
    assert.equal(finalSettings.showChatHeaderButton, true, 're-enabled showChatHeaderButton');
    assert.equal(finalSettings.showChatHeaderActions, false, 'kept showChatHeaderActions false');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('client bundle integrates header visibility hooks and reactive updates (Issue #422)', () => {
  const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js');
  const clientSrc = fs.readFileSync(clientPath, 'utf-8');

  // Verify hook and functions exist
  assert.ok(clientSrc.includes('useHeaderVisibility'), 'useHeaderVisibility defined in client bundle');
  assert.ok(clientSrc.includes('updateHeaderSettings'), 'updateHeaderSettings defined in client bundle');
  assert.ok(clientSrc.includes('dsh-cron:header-settings'), 'localStorage cache key defined');
  assert.ok(clientSrc.includes("useHeaderVisibility('showChatHeaderButton')"), 'CronChip checks showChatHeaderButton');
  assert.ok(clientSrc.includes("useHeaderVisibility('showChatHeaderActions')"), 'SessionQuickActionBar checks showChatHeaderActions');

  // Verify Settings card includes the toggles
  assert.ok(clientSrc.includes('settings.showChatHeaderButton'), 'Settings card uses settings.showChatHeaderButton label');
  assert.ok(clientSrc.includes('settings.showChatHeaderActions'), 'Settings card uses settings.showChatHeaderActions label');

  // Verify main sidebar navigation button is always preserved (not gated by header visibility)
  assert.ok(clientSrc.includes("mountSidebarEntry(toggle, translate('sidebar.label'))"), 'Sidebar entry is mounted unconditionally');
});
