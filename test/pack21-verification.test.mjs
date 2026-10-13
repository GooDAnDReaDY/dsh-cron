import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDAG,
  topologicalSort,
  buildTaskGraphModel,
  sanitizeDependsOn,
  sanitizeJoinPolicy,
  parseChainTargets,
} from '../lib/dag.js';
import {
  buildPromptContext,
  interpolateTaskPrompt,
  resolveTaskForExecution,
} from '../lib/prompt-interpolation.js';
import { ChainCheckpointManager } from '../lib/chain-checkpoints.js';

describe('Pack 21 (v0.3.2) - DAG Fan-Out, Fan-In and Visual Chain Graph Verification', () => {

  describe('1. DAG Utilities & Sanitization', () => {
    it('sanitizes dependsOn from arrays, strings, and whitespace', () => {
      assert.deepEqual(sanitizeDependsOn(['taskA', 'taskB', 'taskA']), ['taskA', 'taskB']);
      assert.deepEqual(sanitizeDependsOn('taskA, taskB, taskC'), ['taskA', 'taskB', 'taskC']);
      assert.deepEqual(sanitizeDependsOn('taskA; taskB'), ['taskA', 'taskB']);
      assert.deepEqual(sanitizeDependsOn('taskA  taskB'), ['taskA', 'taskB']);
      assert.deepEqual(sanitizeDependsOn(null), []);
      assert.deepEqual(sanitizeDependsOn(''), []);
    });

    it('sanitizes joinPolicy defaults to all_success', () => {
      assert.equal(sanitizeJoinPolicy('any_success'), 'any_success');
      assert.equal(sanitizeJoinPolicy('all_success'), 'all_success');
      assert.equal(sanitizeJoinPolicy('unknown'), 'all_success');
      assert.equal(sanitizeJoinPolicy(undefined), 'all_success');
    });

    it('parses chain targets from strings and arrays', () => {
      assert.deepEqual(parseChainTargets('taskB, taskC'), ['taskB', 'taskC']);
      assert.deepEqual(parseChainTargets(['taskB', 'taskC']), ['taskB', 'taskC']);
      assert.deepEqual(parseChainTargets('taskSingle'), ['taskSingle']);
      assert.deepEqual(parseChainTargets(''), []);
    });
  });

  describe('2. DAG Cycle Detection & Topological Sort', () => {
    it('detects self-dependency in dependsOn and onSuccess', () => {
      const taskSelfDep = { id: 'task1', dependsOn: ['task1'] };
      const res1 = validateDAG([taskSelfDep]);
      assert.equal(res1.ok, false);
      assert.match(res1.error, /cannot depend on itself/);

      const taskSelfNext = { id: 'task2', onSuccess: 'task2' };
      const res2 = validateDAG([taskSelfNext]);
      assert.equal(res2.ok, false);
      assert.match(res2.error, /cannot trigger itself/);
    });

    it('detects simple cycle: A -> B -> A', () => {
      const tasks = [
        { id: 'taskA', onSuccess: 'taskB' },
        { id: 'taskB', onSuccess: 'taskA' },
      ];
      const res = validateDAG(tasks);
      assert.equal(res.ok, false);
      assert.match(res.error, /Cyclic dependency detected/);
    });

    it('detects cycle via dependsOn: A dependsOn B, B dependsOn A', () => {
      const tasks = [
        { id: 'taskA', dependsOn: ['taskB'] },
        { id: 'taskB', dependsOn: ['taskA'] },
      ];
      const res = validateDAG(tasks);
      assert.equal(res.ok, false);
      assert.match(res.error, /Cyclic dependency detected/);
    });

    it('validates acyclic diamond DAG: A -> (B, C) -> D', () => {
      const tasks = [
        { id: 'taskA', onSuccess: 'taskB, taskC' },
        { id: 'taskB' },
        { id: 'taskC' },
        { id: 'taskD', dependsOn: ['taskB', 'taskC'] },
      ];
      const res = validateDAG(tasks);
      assert.equal(res.ok, true);

      const order = topologicalSort(tasks);
      assert.ok(order.indexOf('taskA') < order.indexOf('taskB'));
      assert.ok(order.indexOf('taskA') < order.indexOf('taskC'));
      assert.ok(order.indexOf('taskB') < order.indexOf('taskD'));
      assert.ok(order.indexOf('taskC') < order.indexOf('taskD'));
    });
  });

  describe('3. Visual Graph Model Builder (#334)', () => {
    it('builds nodes and edges model with snapshot statuses', () => {
      const tasks = [
        { id: 'step1', title: 'Build', onSuccess: 'step2' },
        { id: 'step2', title: 'Test', dependsOn: ['step1'] },
      ];
      const snapshots = [
        { stepTaskId: 'step1', status: 'completed', durationMs: 150, output: 'Build OK' },
        { stepTaskId: 'step2', status: 'failed', durationMs: 50, output: 'Test Failed' },
      ];

      const model = buildTaskGraphModel(tasks, snapshots, 'step2');
      assert.equal(model.nodes.length, 2);
      assert.equal(model.hasFailure, true);

      const node1 = model.nodes.find((n) => n.id === 'step1');
      assert.equal(node1.status, 'success');
      assert.equal(node1.durationMs, 150);
      assert.equal(node1.outputSnippet, 'Build OK');
      assert.equal(node1.isRetryable, false);

      const node2 = model.nodes.find((n) => n.id === 'step2');
      assert.equal(node2.status, 'failed');
      assert.equal(node2.durationMs, 50);
      assert.equal(node2.isFocus, true);
      assert.equal(node2.isRetryable, true);

      assert.ok(model.edges.length >= 2);
    });
  });

  describe('4. Prompt Interpolation with Predecessor Outputs', () => {
    it('interpolates {prevOutputs[\'taskId\']} and {{prevOutputs[\'taskId\']}}', () => {
      const task = {
        id: 'stepDeploy',
        prompt: "Deploy commit: {prevOutputs['taskBuild']} and test status: {{prevOutputs['taskTest']}}",
      };
      const options = {
        prevOutputs: {
          taskBuild: 'sha-abcdef123',
          taskTest: 'PASS: 42/42',
        },
      };

      const resolved = resolveTaskForExecution(task, options);
      assert.equal(resolved.prompt, 'Deploy commit: sha-abcdef123 and test status: PASS: 42/42');
    });

    it('interpolates dot notation and double quotes', () => {
      const task = {
        id: 'stepNotify',
        command: 'echo "{prevOutputs[\"taskLint\"]}"',
      };
      const options = {
        prevOutputs: {
          taskLint: 'clean',
        },
      };
      const resolved = resolveTaskForExecution(task, options);
      assert.equal(resolved.command, 'echo "clean"');
    });
  });

  describe('5. ChainCheckpointManager & Join Barrier (#328, #319)', () => {
    function createMockStore() {
      return {
        chainCheckpoints: {},
        tasks: {},
        get(id) { return this.tasks[id]; },
        scheduleSave() {},
      };
    }

    it('manages step snapshots and retrieves chain snapshots', () => {
      const store = createMockStore();
      const manager = new ChainCheckpointManager(store);

      manager.recordStepSnapshot('chain_100', 'stepA', {
        status: 'completed',
        output: 'Step A Finished',
        durationMs: 80,
      });

      const snaps = manager.getChainSnapshots('chain_100');
      assert.equal(snaps.length, 1);
      assert.equal(snaps[0].stepTaskId, 'stepA');
      assert.equal(snaps[0].status, 'completed');
      assert.equal(snaps[0].output, 'Step A Finished');
    });

    it('evaluates DAG Join Barrier under all_success', () => {
      const store = createMockStore();
      const manager = new ChainCheckpointManager(store);
      const chainId = 'chain_200';

      const taskJoin = {
        id: 'taskJoin',
        dependsOn: ['step1', 'step2'],
        joinPolicy: 'all_success',
      };

      // Initially no steps done: barrier pending
      let barrier = manager.checkJoinBarrier(chainId, taskJoin);
      assert.equal(barrier.ready, false);
      assert.equal(barrier.pending, true);
      assert.deepEqual(barrier.waitingFor, ['step1', 'step2']);

      // step1 succeeds: still waiting for step2
      manager.recordStepSnapshot(chainId, 'step1', { status: 'completed', output: 'Out 1' });
      barrier = manager.checkJoinBarrier(chainId, taskJoin);
      assert.equal(barrier.ready, false);
      assert.equal(barrier.pending, true);
      assert.deepEqual(barrier.waitingFor, ['step2']);

      // step2 succeeds: barrier satisfied!
      manager.recordStepSnapshot(chainId, 'step2', { status: 'completed', output: 'Out 2' });
      barrier = manager.checkJoinBarrier(chainId, taskJoin);
      assert.equal(barrier.ready, true);
      assert.deepEqual(barrier.outputs, { step1: 'Out 1', step2: 'Out 2' });
    });

    it('evaluates DAG Join Barrier failure under all_success', () => {
      const store = createMockStore();
      const manager = new ChainCheckpointManager(store);
      const chainId = 'chain_300';

      const taskJoin = {
        id: 'taskJoin',
        dependsOn: ['step1', 'step2'],
        joinPolicy: 'all_success',
      };

      manager.recordStepSnapshot(chainId, 'step1', { status: 'completed', output: 'Out 1' });
      manager.recordStepSnapshot(chainId, 'step2', { status: 'failed', output: 'Error in 2' });

      const barrier = manager.checkJoinBarrier(chainId, taskJoin);
      assert.equal(barrier.ready, false);
      assert.equal(barrier.failed, true);
      assert.equal(barrier.failedDep, 'step2');
    });

    it('evaluates DAG Join Barrier under any_success', () => {
      const store = createMockStore();
      const manager = new ChainCheckpointManager(store);
      const chainId = 'chain_400';

      const taskJoin = {
        id: 'taskJoin',
        dependsOn: ['stepA', 'stepB'],
        joinPolicy: 'any_success',
      };

      // stepA fails, but stepB has not run yet: barrier pending
      manager.recordStepSnapshot(chainId, 'stepA', { status: 'failed', output: 'Err A' });
      let barrier = manager.checkJoinBarrier(chainId, taskJoin);
      assert.equal(barrier.ready, false);
      assert.equal(barrier.pending, true);

      // stepB succeeds: barrier unblocks because of any_success!
      manager.recordStepSnapshot(chainId, 'stepB', { status: 'completed', output: 'OK B' });
      barrier = manager.checkJoinBarrier(chainId, taskJoin);
      assert.equal(barrier.ready, true);
      assert.equal(barrier.outputs.stepB, 'OK B');
    });

    it('barrier idempotency: canTriggerBarrier and markBarrierTriggered', () => {
      const store = createMockStore();
      const manager = new ChainCheckpointManager(store);

      assert.equal(manager.canTriggerBarrier('c1', 't1'), true);
      manager.markBarrierTriggered('c1', 't1');
      assert.equal(manager.canTriggerBarrier('c1', 't1'), false);
    });

    it('retryChainFromStep validates step and re-executes', async () => {
      const store = createMockStore();
      store.tasks['failedStep'] = { id: 'failedStep', title: 'Failed Step' };
      const manager = new ChainCheckpointManager(store);
      const chainId = 'chain_500';

      // Preceding step snapshot
      manager.recordStepSnapshot(chainId, 'priorStep', { status: 'completed', output: 'Prior OK' });
      // Failed step snapshot
      manager.recordStepSnapshot(chainId, 'failedStep', { status: 'failed', output: 'Timeout' });

      // Cannot retry completed step
      const badRetry = manager.canRetryFromStep(chainId, 'priorStep');
      assert.equal(badRetry.ok, false);

      // Can retry failed step
      const goodRetry = manager.canRetryFromStep(chainId, 'failedStep');
      assert.equal(goodRetry.ok, true);

      // Mock scheduler
      let executedOptions = null;
      const mockScheduler = {
        runNow: async (taskId, opts) => {
          executedOptions = opts;
          return { status: 'success', output: 'Retried OK' };
        },
      };

      const result = await manager.retryChainFromStep(mockScheduler, chainId, 'failedStep');
      assert.equal(result.ok, true);
      assert.equal(result.result.status, 'success');
      assert.equal(executedOptions.isRetry, true);
      assert.equal(executedOptions.chainRunId, chainId);
      assert.deepEqual(executedOptions.prevOutputs, { priorStep: 'Prior OK' });
    });
  });
});
