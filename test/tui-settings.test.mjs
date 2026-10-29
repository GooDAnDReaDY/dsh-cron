import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTuiSection, applyTuiSettings } from '../lib/tui-settings.js';

test('buildTuiSection builds descriptor with expected namespace, groups, and fields', () => {
  const section = buildTuiSection({
    live: () => ({
      botTokenRef: 'MY_CUSTOM_BOT_TOKEN',
      chatId: '-100999',
      defaultTimezone: 'Europe/Berlin',
      maxConcurrent: 4,
      globalDailyCostLimitUsd: 15.5,
    }),
  });

  assert.equal(section.ns, 'dsh-cron');
  assert.equal(section.title, 'Cron Automations');
  assert.equal(section.groups.length, 3);
  assert.ok(section.groups.some((g) => g.id === 'delivery'));
  assert.ok(section.groups.some((g) => g.id === 'scheduler'));
  assert.ok(section.groups.some((g) => g.id === 'budgets'));

  const botTokenField = section.fields.find((f) => f.path[0] === 'botToken');
  assert.ok(botTokenField);
  assert.equal(botTokenField.secret.ref, 'MY_CUSTOM_BOT_TOKEN');

  const maxConcurrentField = section.fields.find((f) => f.path[0] === 'maxConcurrent');
  assert.ok(maxConcurrentField);
  assert.equal(maxConcurrentField.format(5), '5');
  assert.deepEqual(maxConcurrentField.parse('8'), { kind: 'set', value: 8 });
  assert.deepEqual(maxConcurrentField.parse('-1'), { kind: 'clear' });
  assert.deepEqual(maxConcurrentField.parse('invalid'), { kind: 'clear' });

  const costLimitField = section.fields.find((f) => f.path[0] === 'globalDailyCostLimitUsd');
  assert.ok(costLimitField);
  assert.deepEqual(costLimitField.parse('25.5'), { kind: 'set', value: 25.5 });
  assert.deepEqual(costLimitField.parse(''), { kind: 'clear' });

  const tzField = section.fields.find((f) => f.path[0] === 'defaultTimezone');
  assert.ok(tzField);
  assert.equal(tzField.format('UTC'), 'UTC');
  assert.deepEqual(tzField.parse('  Asia/Tokyo  '), { kind: 'set', value: 'Asia/Tokyo' });
  assert.deepEqual(tzField.parse('   '), { kind: 'clear' });
});

test('applyTuiSettings registers section through ctx.inject and cleans up on effect', () => {
  let registeredSection = null;
  let disposed = false;
  let effectCleanup = null;

  const mockService = {
    register: (section) => {
      registeredSection = section;
      return () => { disposed = true; };
    },
  };

  const mockCtx = {
    inject: (deps, cb) => {
      assert.deepEqual(deps, ['tuiSettingsSections']);
      cb({ tuiSettingsSections: mockService });
    },
    effect: (fn) => {
      effectCleanup = fn();
    },
  };

  applyTuiSettings(mockCtx, { live: () => ({}) });

  assert.ok(registeredSection);
  assert.equal(registeredSection.ns, 'dsh-cron');
  assert.equal(disposed, false);

  assert.equal(typeof effectCleanup, 'function');
  effectCleanup();
  assert.equal(disposed, true);
});

test('applyTuiSettings is safe when inject or service is unavailable', () => {
  assert.doesNotThrow(() => {
    applyTuiSettings(null, {});
    applyTuiSettings({}, {});
    applyTuiSettings({ inject: (deps, cb) => cb({}) }, {});
  });
});
