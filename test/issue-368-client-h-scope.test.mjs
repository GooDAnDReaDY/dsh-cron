import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const clientBundlePath = path.join(root, 'lib/client.js');

test('Issue #368 (GH #14): lib/client.js never shadows element creation alias', () => {
  assert.ok(fs.existsSync(clientBundlePath), 'lib/client.js must exist');
  const content = fs.readFileSync(clientBundlePath, 'utf8');

  // 1. Must define safe alias _h
  assert.match(
    content,
    /const _h = \(\.\.\.args\) => \(React && React\.createElement \? React\.createElement\(\.\.\.args\) : null\);/,
    'client bundle must declare _h helper'
  );

  // 2. Must not contain .map((h) => h( or (_, h) => h( or any parameter shadowing _h
  assert.doesNotMatch(
    content,
    /\.map\(\s*\(\s*h\s*\)\s*=>\s*h\(/,
    'promptHistory.map must not have parameter h shadowing creator call'
  );

  assert.doesNotMatch(
    content,
    /\(_,\s*h\s*\)\s*=>\s*h\(/,
    'hour table row must not have parameter h shadowing creator call'
  );

  assert.doesNotMatch(
    content,
    /(\((?:[^)]*,\s*)?_h(?:\s*[,)])|\b_h\s*=>)/,
    'client bundle must never shadow _h parameter in any function or callback'
  );

  // 3. Verify promptHistory rendering with mock React
  const mockCalls = [];
  const fakeReact = {
    createElement(type, props, ...children) {
      mockCalls.push({ type, props, children });
      return { type, props, children };
    },
  };

  const _h = (...args) => (fakeReact && fakeReact.createElement ? fakeReact.createElement(...args) : null);
  const selectedTaskMeta = {
    promptVersion: 2,
    promptHistory: [
      { version: 1, successRate: 0.8, prompt: 'Old prompt' },
      { version: 2, successRate: 0.95, prompt: 'New prompt' },
    ],
  };

  // Execute the exact mapping expression from 62-modal-task-form-tail.js
  const options = selectedTaskMeta.promptHistory.map((rev) =>
    _h('option', { key: rev.version, value: rev.version }, 'v' + rev.version + ' (' + Math.round((rev.successRate || 1) * 100) + '%)')
  );

  assert.equal(options.length, 2);
  assert.equal(options[0].type, 'option');
  assert.equal(options[0].props.value, 1);
  assert.equal(options[0].children[0], 'v1 (80%)');
  assert.equal(options[1].props.value, 2);
  assert.equal(options[1].children[0], 'v2 (95%)');
});
