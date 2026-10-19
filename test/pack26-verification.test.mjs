import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBranchRules,
  resolveBranchTargets,
  sanitizeBranchRules,
} from '../lib/branching.js';
import {
  classifyFailure,
  generateUnifiedDiff,
  diagnoseFailure,
  applyDoctorFix,
  revertDoctorFix,
  shouldAutoHeal,
  FAILURE_CATEGORIES,
} from '../lib/doctor.js';
import {
  validateDAG,
  topologicalSort,
  buildTaskGraphModel,
  getTaskOutgoingTargets,
} from '../lib/dag.js';
import { inspectFailure } from '../lib/failure-inspector.js';

test('Pack 26 E2E Integration - Decision Nodes & Self-Healing Doctor', async () => {
  // 1. Setup a multi-node DAG with a Decision Node (Task B)
  // Task A -> Task B (Decision Node) -> Task C (if exitCode === 0)
  //                                  -> Task D (else fallback)
  //                                  -> Task E (error branch if exitCode !== 0)
  const taskA = { id: 'task_a', title: 'Data Extraction', schedule: '0 * * * *', onSuccess: 'task_b', type: 'script' };
  const taskB = {
    id: 'task_b',
    title: 'Quality Check Gate',
    type: 'script',
    prompt: 'python check_quality.py',
    branchRules: [
      { field: 'exitCode', operator: 'equals', value: 0, targetTask: 'task_c' },
      { field: 'output.json.status', operator: 'equals', value: 'critical_failure', targetTask: 'task_e' },
    ],
    elseTask: 'task_d',
    autoHeal: true,
  };
  const taskC = { id: 'task_c', title: 'Normal ETL Pipeline', type: 'script' };
  const taskD = { id: 'task_d', title: 'Fallback Sync', type: 'script' };
  const taskE = { id: 'task_e', title: 'Alert Oncall', type: 'script' };

  const taskList = [taskA, taskB, taskC, taskD, taskE];

  // 2. Validate DAG structure
  const dagValidation = validateDAG(taskList);
  assert.equal(dagValidation.ok, true);

  const topoOrder = topologicalSort(taskList);
  assert.equal(topoOrder.indexOf('task_a') < topoOrder.indexOf('task_b'), true);
  assert.equal(topoOrder.indexOf('task_b') < topoOrder.indexOf('task_c'), true);

  // 3. Verify Graph Model representation
  const graphModel = buildTaskGraphModel(taskList);
  const nodeB = graphModel.nodes.find(n => n.id === 'task_b');
  assert.ok(nodeB);
  assert.equal(nodeB.isDecisionNode, true);
  assert.equal(nodeB.branchRulesCount, 2);
  assert.equal(nodeB.elseTask, 'task_d');

  // Verify branch edges
  const edgesFromB = graphModel.edges.filter(e => e.from === 'task_b');
  assert.equal(edgesFromB.length, 3); // targetTask C, targetTask E, elseTask D
  const edgeToC = edgesFromB.find(e => e.to === 'task_c');
  assert.ok(edgeToC);
  assert.equal(edgeToC.type, 'branch');
  assert.equal(edgeToC.condition.field, 'exitCode');
  assert.equal(edgeToC.condition.operator, 'equals');
  assert.equal(edgeToC.condition.value, 0);

  // 4. Test Decision Node Execution Outcome (Success path -> Task C, Task D skipped)
  const runSuccess = {
    id: 'run_b_1',
    taskId: 'task_b',
    status: 'success',
    exitCode: 0,
    output: JSON.stringify({ itemsProcessed: 100 }),
  };

  const branchEvalSuccess = evaluateBranchRules(taskB.branchRules, taskB.elseTask, runSuccess);
  assert.equal(branchEvalSuccess.matched, true);
  assert.equal(branchEvalSuccess.targetTask, 'task_c');

  const resolvedSuccess = resolveBranchTargets(taskB, runSuccess);
  assert.deepEqual(resolvedSuccess.targets, ['task_c']);
  assert.equal(resolvedSuccess.decision.matched, true);
  assert.equal(resolvedSuccess.decision.targetTask, 'task_c');

  // 5. Test Decision Node Execution Outcome (JSON path match -> Task E)
  const runCrit = {
    id: 'run_b_2',
    taskId: 'task_b',
    status: 'error',
    exitCode: 2,
    output: JSON.stringify({ status: 'critical_failure', error: 'DB corruption' }),
  };
  const branchEvalCrit = evaluateBranchRules(taskB.branchRules, taskB.elseTask, runCrit);
  assert.equal(branchEvalCrit.matched, true);
  assert.equal(branchEvalCrit.targetTask, 'task_e');

  // 6. Test Self-Healing Doctor on Task B failure
  const runFailure = {
    id: 'run_b_3',
    taskId: 'task_b',
    status: 'error',
    exitCode: 1,
    error: 'SyntaxError: invalid syntax in check_quality.py line 12: if x = 5:',
    stderr: 'SyntaxError: invalid syntax',
  };

  // Diagnose failure via Self-Healing Doctor (#353)
  const inspection = await diagnoseFailure({ task: taskB, runInfo: runFailure });
  assert.equal(inspection.ok, true);
  assert.equal(inspection.category, FAILURE_CATEGORIES.SYNTAX_ERROR);
  assert.ok(inspection.diff);

  // Check auto-healing policy
  const doctorReport = {
    category: FAILURE_CATEGORIES.SYNTAX_ERROR,
    cause: 'Assignment operator used instead of comparison in line 12',
    suggestedFix: '#!/usr/bin/env python3\n# Fixed check_quality.py\nif x == 5:\n    pass\n',
    confidence: 'high',
  };

  assert.equal(shouldAutoHeal(taskB, doctorReport), true);

  // Apply doctor fix
  const store = {
    tasks: { [taskB.id]: taskB },
    updateTask: async (id, patch) => {
      Object.assign(store.tasks[id], patch);
    },
  };

  const applyResult = await applyDoctorFix(taskB, doctorReport, { store, user: 'autonomous_healer', isAutoHeal: true });
  assert.equal(applyResult.ok, true);
  assert.equal(taskB.prompt, doctorReport.suggestedFix);
  assert.equal(taskB.revisions.length, 1);
  assert.ok(taskB.selfHealing.lastPatchedAt);
  assert.equal(taskB.selfHealing.autoPatchesCount, 1);

  // Ensure 24h rate limit blocks immediate second auto-heal
  assert.equal(shouldAutoHeal(taskB, doctorReport), false);

  // Revert doctor fix
  const revertResult = await revertDoctorFix(taskB, { store, user: 'operator' });
  assert.equal(revertResult.ok, true);
  assert.equal(taskB.prompt, 'python check_quality.py');
  assert.equal(taskB.revisions.length, 2);
});
