import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #87: English is the canonical source language. User-facing strings in
 * lib/ must be English; the translation plugin provides other languages at
 * runtime. The only allowed Cyrillic is the Russian *input* alias vocabulary
 * in the schedule parser (users may type "через 15 минут", "каждый день").
 */
const CYRILLIC = /[\u0400-\u04FF]/;
const ALIAS_PATTERN = /(через|каждый|будние|будням|минут|час)/;

test('lib source strings are English-canonical (Cyrillic only in schedule input aliases)', () => {
  const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
  const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js'));

  assert.ok(files.length >= 8, 'lib modules discovered');
  const offenders = [];

  for (const file of files) {
    const text = fs.readFileSync(path.join(libDir, file), 'utf-8');
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      if (!CYRILLIC.test(line)) return;
      if (file === 'scheduler.js' && ALIAS_PATTERN.test(line)) return;
      offenders.push(`${file}:${idx + 1}: ${line.trim().slice(0, 90)}`);
    });
  }

  assert.deepEqual(offenders, [], `Cyrillic found outside schedule input aliases:\n${offenders.join('\n')}`);
});

test('client locale dictionary registers English sources under the dsh-cron namespace', async () => {
  const indexSrc = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf-8');
  assert.ok(indexSrc.includes("register('dsh-cron', Config"), 'server settings namespace is dsh-cron');
  // Issue #102: REST settings writes must go through the registered scope
  assert.ok(indexSrc.includes('applySettingsToScope(cronSettingsScope, payload)'), 'settings writes routed through the scope');

  const clientSrc = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  assert.ok(clientSrc.includes("'sidebar.label': 'Scheduled tasks'"), 'canonical English dictionary present');
  assert.ok(!clientSrc.includes("ru: {"), 'no hardcoded Russian duplicate in the plugin package');
});
