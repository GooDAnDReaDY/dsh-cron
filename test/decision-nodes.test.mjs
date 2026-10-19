import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveField,
  getNestedValue,
  evaluateCondition,
  sanitizeBranchRules,
  evaluateBranchRules,
  resolveBranchTargets,
} from '../lib/branching.js';
import {
  validateDAG,
  topologicalSort,
  buildTaskGraphModel,
  getTaskOutgoingTargets,
} from '../lib/dag.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';

test('Decision Nodes (#352) - resolveField extracts direct, nested, and JSON values', () => {
  const context = {
    outcome: { status: 'success', exitCode: 0, output: '{"severity": "CRITICAL", "count": 5, "items": [{"id": 42}]}' },
    runInfo: { durationMs: 120, error: 'Warning: slow network' },
    task: { id: 'task_audit', type: 'script' },
  };

  assert.equal(resolveField(context, 'status'), 'success');
  assert.equal(resolveField(context, 'exitCode'), 0);
  assert.equal(resolveField(context, 'durationMs'), 120);
  assert.equal(resolveField(context, 'task.type'), 'script');

  // JSON sub-path extraction
  assert.equal(resolveField(context, 'output.json.severity'), 'CRITICAL');
  assert.equal(resolveField(context, 'output.json.count'), 5);
  assert.equal(resolveField(context, 'output.json.items[0].id'), 42);
  assert.equal(resolveField(context, 'output.json.nonexistent'), undefined);

  // Markdown fence JSON extraction
  const fencedContext = {
    outcome: { output: 'Some preamble\n```json\n{"status": "ok", "alert": true}\n```\nTrailing info' },
  };
  assert.equal(resolveField(fencedContext, 'output.json.status'), 'ok');
  assert.equal(resolveField(fencedContext, 'output.json.alert'), true);
});

test('Decision Nodes (#352) - evaluateCondition supports all standard operators', () => {
  // equals / notEquals
  assert.equal(evaluateCondition('CRITICAL', 'equals', 'critical'), true);
  assert.equal(evaluateCondition(42, 'equals', '42'), true);
  assert.equal(evaluateCondition(42, 'notEquals', '43'), true);
  assert.equal(evaluateCondition(true, 'equals', 'true'), true);

  // contains / notContains
  assert.equal(evaluateCondition('deploy successful on host', 'contains', 'successful'), true);
  assert.equal(evaluateCondition('error: disk full', 'notContains', 'memory'), true);
  assert.equal(evaluateCondition(['prod', 'stage'], 'contains', 'prod'), true);

  // numeric gt, gte, lt, lte
  assert.equal(evaluateCondition(5, 'greaterThan', 3), true);
  assert.equal(evaluateCondition(5, '>', 5), false);
  assert.equal(evaluateCondition(5, '>=', 5), true);
  assert.equal(evaluateCondition('10', 'lessThan', '20'), true);
  assert.equal(evaluateCondition(10, '<=', 10), true);

  // regex
  assert.equal(evaluateCondition('Build #1042 failed with exit code 1', 'regex', 'failed with exit code [0-9]+'), true);
  assert.equal(evaluateCondition('Everything fine', 'regex', '^error'), false);

  // exists / notExists
  assert.equal(evaluateCondition('data', 'exists'), true);
  assert.equal(evaluateCondition(0, 'exists'), true);
  assert.equal(evaluateCondition(null, 'exists'), false);
  assert.equal(evaluateCondition(undefined, 'notExists'), true);
  assert.equal(evaluateCondition('', 'notExists'), true);
});

test('Decision Nodes (#352) - evaluateBranchRules matches first rule or falls back to elseTask', () => {
  const rules = [
    { field: 'output.json.severity', operator: 'equals', value: 'critical', targetTask: 'task_pagerduty' },
    { field: 'output.json.severity', operator: 'equals', value: 'warning', targetTask: 'task_slack_warn' },
  ];
  const elseTask = 'task_log_clean';

  // Case 1: First rule matches
  const ctx1 = { outcome: { output: '{"severity": "critical"}' } };
  const res1 = evaluateBranchRules(rules, elseTask, ctx1);
  assert.equal(res1.matched, true);
  assert.equal(res1.targetTask, 'task_pagerduty');
  assert.equal(res1.matchedIndex, 0);

  // Case 2: Second rule matches
  const ctx2 = { outcome: { output: '{"severity": "warning"}' } };
  const res2 = evaluateBranchRules(rules, elseTask, ctx2);
  assert.equal(res2.matched, true);
  assert.equal(res2.targetTask, 'task_slack_warn');
  assert.equal(res2.matchedIndex, 1);

  // Case 3: No rule matches -> elseTask fallback
  const ctx3 = { outcome: { output: '{"severity": "info"}' } };
  const res3 = evaluateBranchRules(rules, elseTask, ctx3);
  assert.equal(res3.matched, false);
  assert.equal(res3.targetTask, 'task_log_clean');
  assert.equal(res3.isElse, true);

  // Case 4: No rule matches and no elseTask
  const res4 = evaluateBranchRules(rules, null, ctx3);
  assert.equal(res4.matched, false);
  assert.equal(res4.targetTask, null);
});

test('Decision Nodes (#352) - validateDAG and topologicalSort check branch targets and detect cycles', () => {
  // Self-trigger cycle via branchRules
  const tasksWithSelfCycle = [
    {
      id: 't1',
      title: 'T1',
      branchRules: [{ field: 'exitCode', operator: 'equals', value: 0, targetTask: 't1' }],
    },
  ];
  const checkSelf = validateDAG(tasksWithSelfCycle);
  assert.equal(checkSelf.ok, false);
  assert.match(checkSelf.error, /cannot trigger itself/i);

  // Circular dependency via branchRules (A -> B -> A)
  const circularTasks = [
    {
      id: 'task_a',
      title: 'Task A',
      branchRules: [{ field: 'exitCode', operator: 'equals', value: 0, targetTask: 'task_b' }],
    },
    {
      id: 'task_b',
      title: 'Task B',
      elseTask: 'task_a',
    },
  ];
  const checkCircular = validateDAG(circularTasks);
  assert.equal(checkCircular.ok, false);
  assert.match(checkCircular.error, /cyclic dependency detected/i);

  // Valid branch DAG
  const validTasks = [
    {
      id: 'audit',
      title: 'Audit',
      branchRules: [
        { field: 'output.json.issues', operator: 'greaterThan', value: 0, targetTask: 'notify_alert' },
      ],
      elseTask: 'deploy_prod',
    },
    { id: 'notify_alert', title: 'Notify Alert' },
    { id: 'deploy_prod', title: 'Deploy Prod' },
  ];
  const checkValid = validateDAG(validTasks);
  assert.equal(checkValid.ok, true);

  const order = topologicalSort(validTasks);
  assert.equal(order[0], 'audit');
  assert.ok(order.indexOf('notify_alert') > order.indexOf('audit'));
  assert.ok(order.indexOf('deploy_prod') > order.indexOf('audit'));
});

test('Decision Nodes (#352) - buildTaskGraphModel renders decision badges and branch edges', () => {
  const tasks = [
    {
      id: 'check_vuln',
      title: 'Vulnerability Scanner',
      branchRules: [
        { field: 'exitCode', operator: 'notEquals', value: 0, targetTask: 'isolate_host', label: '[if: error]' },
      ],
      elseTask: 'continue_pipeline',
    },
    { id: 'isolate_host', title: 'Isolate Host' },
    { id: 'continue_pipeline', title: 'Continue Pipeline' },
  ];

  const model = buildTaskGraphModel(tasks, []);
  assert.equal(model.nodes.length, 3);

  const checkNode = model.nodes.find((n) => n.id === 'check_vuln');
  assert.equal(checkNode.isDecisionNode, true);
  assert.equal(checkNode.branchRulesCount, 1);
  assert.equal(checkNode.elseTask, 'continue_pipeline');

  // Check edges
  const branchEdge = model.edges.find((e) => e.type === 'branch');
  assert.ok(branchEdge);
  assert.equal(branchEdge.from, 'check_vuln');
  assert.equal(branchEdge.to, 'isolate_host');
  assert.equal(branchEdge.label, '[if: error]');

  const elseEdge = model.edges.find((e) => e.type === 'branch_else');
  assert.ok(elseEdge);
  assert.equal(elseEdge.from, 'check_vuln');
  assert.equal(elseEdge.to, 'continue_pipeline');
  assert.equal(elseEdge.isElse, true);
});

test('Decision Nodes (#352) - resolveBranchTargets routes execution in scheduler outcome', () => {
  const taskWithRules = {
    id: 'eval_task',
    title: 'Evaluator',
    branchRules: [
      { field: 'exitCode', operator: 'equals', value: 0, targetTask: 'task_green' },
      { field: 'exitCode', operator: 'greaterThan', value: 0, targetTask: 'task_red' },
    ],
    elseTask: 'task_grey',
  };

  // Exit code 0
  const r0 = resolveBranchTargets(taskWithRules, { exitCode: 0, status: 'success' }, {});
  assert.deepEqual(r0.targets, ['task_green']);

  // Exit code 2
  const r2 = resolveBranchTargets(taskWithRules, { exitCode: 2, status: 'error' }, {});
  assert.deepEqual(r2.targets, ['task_red']);

  // Undefined exit code -> fallback elseTask
  const rFallback = resolveBranchTargets(taskWithRules, { status: 'uncertain' }, {});
  assert.deepEqual(rFallback.targets, ['task_grey']);

  // Task without rules returns null (standard chaining)
  const taskPlain = { id: 'plain', onSuccess: 'task_next' };
  assert.equal(resolveBranchTargets(taskPlain, { status: 'success' }, {}), null);
});

