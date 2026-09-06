import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('client.js registers with window.__ModuleLoader__ without error', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  let loadedId = null;
  let loadedFactory = null;

  const context = {
    window: {
      __ModuleLoader__: {
        load: ({ id, factory }) => {
          loadedId = id;
          loadedFactory = factory;
        }
      }
    },
    document: {
      head: { appendChild: () => {} },
      getElementById: () => null,
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    },
    console,
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  assert.equal(loadedId, '@goodandready/dsh-cron');
  assert.equal(typeof loadedFactory, 'function');
});

test('Issue #80: CronScreen declares setLoading and setRecs correctly in client.js', () => {
  const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8');
  assert.ok(code.includes('const [loading, setLoading] = React.useState(false);'), 'setLoading state declared');
  assert.ok(code.includes('const [fetchError, setFetchError] = React.useState(null);'), 'fetchError state declared');
  assert.ok(!code.includes('setRecommendations('), 'no undefined setRecommendations called');
  assert.ok(code.includes('setRecs('), 'setRecs used for recommendations');
  assert.ok(code.includes('Ошибка загрузки задач:'), 'fetchError banner present');
});
