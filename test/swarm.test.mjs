import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeSwarmConfig,
  executeWorkerPool,
  synthesizeSwarmResults,
  executeSwarmTask,
  DEFAULT_SWARM_CONCURRENCY,
} from '../lib/swarm.js';

test('Swarm Delegation (#350) - sanitizeSwarmConfig enforces defaults and limits', () => {
  const empty = sanitizeSwarmConfig(null);
  assert.equal(empty.concurrencyLimit, DEFAULT_SWARM_CONCURRENCY);
  assert.deepEqual(empty.subtasks, []);

  const custom = sanitizeSwarmConfig({
    concurrencyLimit: 25, // should cap at 10
    subtasks: [
      { id: 't1', title: 'Task 1', prompt: 'echo 1' },
      { id: '', prompt: 'echo 2' },
      { prompt: '' }, // filtered out
    ],
    orchestrator: { prompt: 'Decompose this' },
    synthesizer: { prompt: 'Summarize', mode: 'summary' },
  });

  assert.equal(custom.concurrencyLimit, 10);
  assert.equal(custom.subtasks.length, 2);
  assert.equal(custom.subtasks[0].id, 't1');
  assert.equal(custom.subtasks[1].id, 'subtask_2');
  assert.equal(custom.orchestrator.prompt, 'Decompose this');
  assert.equal(custom.synthesizer.mode, 'summary');
});

test('Swarm Delegation (#350) - executeWorkerPool executes subtasks with concurrency control', async () => {
  const subtasks = [
    { id: 'w1', title: 'Worker 1', prompt: 'work 1' },
    { id: 'w2', title: 'Worker 2', prompt: 'work 2' },
    { id: 'w3', title: 'Worker 3', prompt: 'work 3' },
    { id: 'w4', title: 'Worker 4', prompt: 'work 4' },
  ];

  let activeWorkers = 0;
  let maxActive = 0;

  const mockExecutor = async (st) => {
    activeWorkers++;
    maxActive = Math.max(maxActive, activeWorkers);
    await new Promise((r) => setTimeout(r, 20));
    activeWorkers--;
    return { output: `Output from ${st.id}` };
  };

  const runs = await executeWorkerPool(subtasks, mockExecutor, { concurrencyLimit: 2 });
  assert.equal(runs.length, 4);
  assert.ok(maxActive <= 2, `maxActive was ${maxActive}, expected <= 2`);
  assert.equal(runs[0].status, 'success');
  assert.equal(runs[0].output, 'Output from w1');
});

test('Swarm Delegation (#350) - executeWorkerPool provides fault tolerance (single failure does not crash pool)', async () => {
  const subtasks = [
    { id: 'w1', title: 'Healthy Worker', prompt: 'ok' },
    { id: 'w2', title: 'Failing Worker', prompt: 'fail' },
    { id: 'w3', title: 'Another Worker', prompt: 'ok' },
  ];

  const mockExecutor = async (st) => {
    if (st.id === 'w2') {
      throw new Error('Database connection failed');
    }
    return { output: `Done ${st.id}` };
  };

  const runs = await executeWorkerPool(subtasks, mockExecutor, { concurrencyLimit: 3 });
  assert.equal(runs.length, 3);
  assert.equal(runs[0].status, 'success');
  assert.equal(runs[1].status, 'error');
  assert.match(runs[1].error, /Database connection failed/);
  assert.equal(runs[2].status, 'success');
});

test('Swarm Delegation (#350) - synthesizeSwarmResults generates formatted markdown report', async () => {
  const task = { id: 'swarm_test', title: 'Log Analyzer' };
  const subtaskRuns = [
    { id: 'w1', title: 'Auth Logs', status: 'success', output: 'Found 0 brute force attempts', durationMs: 120 },
    { id: 'w2', title: 'App Logs', status: 'error', error: 'File unreadable', output: '', durationMs: 45 },
  ];

  const synthesis = await synthesizeSwarmResults({ task, subtaskRuns });
  assert.ok(synthesis.includes('Swarm Execution Report: Log Analyzer'));
  assert.ok(synthesis.includes('1 / 2 subtasks completed successfully'));
  assert.ok(synthesis.includes('Auth Logs'));
  assert.ok(synthesis.includes('File unreadable'));
});

test('Swarm Delegation (#350) - executeSwarmTask end-to-end with dynamic decomposition and synthesis', async () => {
  const task = {
    id: 'swarm_full',
    title: 'Multi-Region Health Check',
    type: 'swarm',
    swarm: {
      concurrencyLimit: 2,
      orchestrator: { prompt: 'Decompose regions' },
      synthesizer: { prompt: 'Synthesize regional findings' },
    },
  };

  const mockAsk = async ({ prompt }) => {
    if (prompt.includes('Decompose regions')) {
      return {
        ok: true,
        text: JSON.stringify({
          subtasks: [
            { id: 'reg_eu', title: 'EU West Check', prompt: 'ping eu-west.internal' },
            { id: 'reg_us', title: 'US East Check', prompt: 'ping us-east.internal' },
          ],
        }),
      };
    }
    if (prompt.includes('Synthesize regional findings')) {
      return {
        ok: true,
        text: '# Executive Synthesis: All 2 regions are reachable with < 30ms latency.',
      };
    }
    return { ok: false };
  };

  const mockExecute = async (st) => ({
    output: `Region ${st.id} ping OK: 15ms`,
    status: 'success',
  });

  const result = await executeSwarmTask(task, {
    executeFn: mockExecute,
    askModel: mockAsk,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'success');
  assert.equal(result.stats.total, 2);
  assert.equal(result.stats.completed, 2);
  assert.equal(result.subtaskRuns.length, 2);
  assert.ok(result.output.includes('Executive Synthesis'));
});
