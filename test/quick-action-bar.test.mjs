import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
