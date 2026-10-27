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
const ALIAS_PATTERN = /(через|кажды|будни|мин|сек|час|день|дня|дней|утра|вечера|ночи|пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|сред|четверг|пятниц|суббот|воскресен|числ|месяц|выходн|полноч|полден|ежедневно)/;

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
      if ((file === 'scheduler.js' || file === 'nl-schedule.js') && ALIAS_PATTERN.test(line)) return;
      offenders.push(`${file}:${idx + 1}: ${line.trim().slice(0, 90)}`);
    });
  }

  assert.deepEqual(offenders, [], `Cyrillic found outside schedule input aliases:\n${offenders.join('\n')}`);
});

test('client locale dictionary registers English sources under the dsh-cron namespace', async () => {
  const indexSrc = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf-8');
  assert.ok(indexSrc.includes("export const name = '@goodandready/dsh-cron'"), 'server package name is @goodandready/dsh-cron');
  // Issue #102, #184: REST settings writes must go through applySettingsToScope
  assert.ok(indexSrc.includes('applySettingsToScope(settingsService, payload)'), 'settings writes routed through settings target');

  const clientSrc = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  assert.ok(clientSrc.includes("'sidebar.label': 'Scheduled tasks'"), 'canonical English dictionary present');
  assert.ok(!clientSrc.includes("ru: {"), 'no hardcoded Russian duplicate in the plugin package');
});

test('GH #19: Chinese (zh) dictionary in client-src and locales.json is complete and parity with en', () => {
  const localesSrc = fs.readFileSync(new URL('../lib/client-src/10-locales.js', import.meta.url), 'utf-8');
  const enMatch = localesSrc.match(/en:\s*\{([\s\S]*?)\},\s*zh:/);
  const zhMatch = localesSrc.match(/zh:\s*\{([\s\S]*?)\}\s*\};/);
  assert.ok(enMatch, 'en dictionary found');
  assert.ok(zhMatch, 'zh dictionary found');

  const enKeys = [...enMatch[1].matchAll(/'([^']+)':/g)].map(m => m[1]);
  const zhKeys = [...zhMatch[1].matchAll(/'([^']+)':/g)].map(m => m[1]);
  assert.ok(enKeys.length >= 390, `at least 390 keys in en (found ${enKeys.length})`);
  assert.equal(zhKeys.length, enKeys.length, `zh has identical key count (${zhKeys.length} vs ${enKeys.length})`);

  const enSet = new Set(enKeys);
  const zhSet = new Set(zhKeys);
  const missingInZh = enKeys.filter(k => !zhSet.has(k));
  assert.deepEqual(missingInZh, [], 'no keys missing in zh dictionary');

  // Verify locales.json matches en keys
  const localesJson = JSON.parse(fs.readFileSync(new URL('../lib/locales.json', import.meta.url), 'utf-8'));
  assert.ok(localesJson.zh, 'locales.json defines zh');
  const localesZhKeys = Object.keys(localesJson.zh);
  assert.equal(localesZhKeys.length, enKeys.length, 'locales.json zh matches en key count');

  // Verify registration pattern uses ctx.effect with safe fallback in 90-close.js
  const closeSrc = fs.readFileSync(new URL('../lib/client-src/90-close.js', import.meta.url), 'utf-8');
  assert.ok(closeSrc.includes('ctx.effect(() => ctx.locale.register(NS, STRINGS)'), 'registers via ctx.effect');
  assert.ok(closeSrc.includes('ctx.locale.register(NS, STRINGS)'), 'has fallback ctx.locale.register');
});
