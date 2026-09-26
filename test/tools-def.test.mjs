import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTaskParameters, cronToolParameters } from '../lib/index.js';
import { executeCronTool, LEGACY_TOOL_NAMES, LEGACY_ACTION_MAP, rejectLegacyTool } from '../lib/cron-tool.js';

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
  for (const [key, value] of Object.entries(cronToolParameters)) {
    walk(value, key);
  }
  // Backwards-compatible export
  assert.equal(createTaskParameters, cronToolParameters);
});

test('lib/index.js defines exactly one unified cron tool following dsh-tools defineTool contract', () => {
  const code = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf-8');

  // Verify that defineTool is imported from @deepseek-ai/dsh-tools
  assert.ok(code.includes("import { defineTool } from '@deepseek-ai/dsh-tools';"));

  // Check that only 'cron' is defined as a tool
  assert.ok(code.includes("name: 'cron'"), 'Tool cron must be defined');

  // Verify none of the 9 legacy tool names are registered
  const legacyTools = [
    'cron_create_task',
    'cron_schedule_task',
    'cron_list_tasks',
    'cron_pause_task',
    'cron_resume_task',
    'cron_delete_task',
    'cron_run_task',
    'cron_get_task',
    'cron_update_task',
  ];
  for (const name of legacyTools) {
    assert.ok(!code.includes(`name: '${name}'`), `Legacy tool ${name} must NOT be defined`);
  }

  // Verify NO tool definition uses type: 'object' at parameters root
  const badParamPattern = /parameters:\s*\{\s*type:\s*['"]object['"],\s*properties:/g;
  assert.equal(badParamPattern.test(code), false, 'parameters must be a flat property map, not root type: object');

  // Verify exactly 1 defineTool block exists
  const toolBlocks = code.split('defineTool({');
  assert.equal(toolBlocks.length, 2, 'Expected exactly 1 defineTool block in lib/index.js');

  const cronBlock = toolBlocks[1];
  assert.ok(cronBlock.includes('parameters: cronToolParameters'));
  assert.ok(cronBlock.includes('output: cronToolOutput'));
});

test('executeCronTool handles all 8 actions and validates inputs', async () => {
  const tasks = new Map();
  const mockStore = {
    list: ({ status } = {}) => Array.from(tasks.values()),
    get: (id) => tasks.get(id),
    set: (data) => {
      const id = data.id || 'task_1';
      const t = { id, ...data, status: data.status || 'active' };
      tasks.set(id, t);
      return t;
    },
    update: (id, patch) => {
      const t = tasks.get(id);
      if (!t) return null;
      Object.assign(t, patch);
      return t;
    },
    delete: (id) => tasks.delete(id),
  };
  const mockScheduler = {
    scheduleTask: () => {},
    reload: () => {},
    pauseTask: (id) => {
      const t = tasks.get(id);
      if (t) t.status = 'paused';
      return t;
    },
    resumeTask: (id) => {
      const t = tasks.get(id);
      if (t) t.status = 'active';
      return t;
    },
    triggerManualRun: (_id) => true,
  };

  // 1. Missing action
  const noAction = await executeCronTool(mockStore, mockScheduler, {});
  assert.equal(noAction.success, false);
  assert.match(noAction.message, /Parameter "action" is required/);

  // 2. Missing action with schedule + prompt -> hints create
  const hintCreate = await executeCronTool(mockStore, mockScheduler, { schedule: '0 * * * *', prompt: 'test' });
  assert.equal(hintCreate.success, false);
  assert.match(hintCreate.message, /Did you mean action: "create"/);

  // 3. Legacy action rejection
  for (const [legacy, canonical] of Object.entries(LEGACY_ACTION_MAP)) {
    const res = await executeCronTool(mockStore, mockScheduler, { action: legacy });
    assert.equal(res.success, false);
    assert.match(res.message, new RegExp(`use action: "${canonical}"`));
  }

  // 4. Action: create
  const created = await executeCronTool(mockStore, mockScheduler, {
    action: 'create',
    title: 'Test Cron',
    schedule: '0 9 * * *',
    prompt: 'echo hello',
    type: 'script',
  });
  assert.equal(created.success, true);
  assert.equal(created.task.title, 'Test Cron');

  // 5. Action: list
  const listRes = await executeCronTool(mockStore, mockScheduler, { action: 'list' });
  assert.equal(listRes.success, true);
  assert.equal(listRes.count, 1);

  // 6. Action: get
  const getRes = await executeCronTool(mockStore, mockScheduler, { action: 'get', id: 'task_1' });
  assert.equal(getRes.success, true);
  assert.equal(getRes.task.title, 'Test Cron');

  // 7. Action: update
  const updateRes = await executeCronTool(mockStore, mockScheduler, {
    action: 'update',
    id: 'task_1',
    title: 'Updated Cron',
  });
  assert.equal(updateRes.success, true);
  assert.equal(updateRes.task.title, 'Updated Cron');

  // 8. Action: pause
  const pauseRes = await executeCronTool(mockStore, mockScheduler, { action: 'pause', id: 'task_1' });
  assert.equal(pauseRes.success, true);
  assert.equal(mockStore.get('task_1').status, 'paused');

  // 9. Action: resume
  const resumeRes = await executeCronTool(mockStore, mockScheduler, { action: 'resume', id: 'task_1' });
  assert.equal(resumeRes.success, true);
  assert.equal(mockStore.get('task_1').status, 'active');

  // 10. Action: run
  const runRes = await executeCronTool(mockStore, mockScheduler, { action: 'run', id: 'task_1' });
  assert.equal(runRes.success, true);

  // 11. Action: delete
  const delRes = await executeCronTool(mockStore, mockScheduler, { action: 'delete', id: 'task_1' });
  assert.equal(delRes.success, true);
  assert.equal(mockStore.get('task_1'), undefined);
});

test('legacy tool helper rejectLegacyTool provides migration advice', () => {
  assert.equal(LEGACY_TOOL_NAMES.length, 9);
  for (const tool of LEGACY_TOOL_NAMES) {
    const res = rejectLegacyTool(tool);
    assert.equal(res.success, false);
    assert.match(res.message, /consolidated into the unified "cron" tool/);
  }
});
