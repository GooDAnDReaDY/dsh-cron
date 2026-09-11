import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTaskParameters } from '../lib/index.js';

/**
 * The harness validates tool parameter schemas at load time and REFUSES to
 * start on an unsupported schema (seen live: `parameters.env.additionalProperties
 * must be explicitly true or false` took the whole test server down). Walk the
 * create-task parameter map and require every object type to declare
 * additionalProperties explicitly.
 */
test('every object-typed tool parameter declares additionalProperties explicitly', () => {
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.ok(
        node.additionalProperties === true || node.additionalProperties === false,
        `${path} must declare additionalProperties explicitly`
      );
    }
    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        walk(value, `${path}.${key}`);
      }
    }
    if (node.items) walk(node.items, `${path}[]`);
  };
  for (const [key, value] of Object.entries(createTaskParameters)) {
    walk(value, key);
  }
});

test('all tools in lib/index.js follow dsh-tools defineTool contract (flat parameters, output.render)', () => {
  const code = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf-8');

  // Verify that defineTool is imported from @deepseek-ai/dsh-tools
  assert.ok(code.includes("import { defineTool } from '@deepseek-ai/dsh-tools';"));

  // Check all tool names (including cron_schedule_task alias)
  const expectedTools = [
    'cron_create_task',
    'cron_schedule_task',
    'cron_list_tasks',
    'cron_pause_task',
    'cron_resume_task',
    'cron_delete_task',
    'cron_run_task',
  ];

  for (const name of expectedTools) {
    assert.ok(code.includes(`name: '${name}'`), `Tool ${name} must be defined`);
  }

  // Verify NO tool definition uses type: 'object' at parameters root
  // Regex looks for: parameters:\s*\{\s*type:\s*'object',\s*properties:
  const badParamPattern = /parameters:\s*\{\s*type:\s*['"]object['"],\s*properties:/g;
  assert.equal(badParamPattern.test(code), false, 'parameters must be a flat property map, not root type: object');

  // Verify that all defineTool blocks declare an output spec.
  // The create/alias pair shares createTaskOutput via the single
  // executeCreateTask implementation (#92); the other five keep inline specs.
  const toolBlocks = code.split('defineTool({');
  // First element is before first defineTool
  assert.equal(toolBlocks.length, 8, 'Expected exactly 7 defineTool blocks (6 tools + 1 alias)');

  for (let i = 1; i <= 7; i++) {
    const block = toolBlocks[i];
    const shared = block.includes('output: createTaskOutput');
    assert.ok(shared || block.includes('output: {'), `Tool block ${i} must declare an output spec`);
  }

  const sharedSpec = code.match(/const createTaskOutput = \{[\s\S]*?\n\};/);
  assert.ok(sharedSpec, 'shared create-task output spec present');
  assert.ok(sharedSpec[0].includes('schema: {'), 'shared output spec has schema');
  assert.ok(sharedSpec[0].includes('render'), 'shared output spec has render function');

  for (let i = 3; i <= 7; i++) {
    const block = toolBlocks[i];
    assert.ok(block.includes('schema: {'), `Tool block ${i} must have schema: {`);
    assert.ok(block.includes('render(') || block.includes('render:'), `Tool block ${i} must have render: function`);
  }
});
