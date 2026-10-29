import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNodeInvocation, buildDockerInvocation } from '../lib/runtimes.js';
import { runExternal } from '../lib/runner-external.js';

test('script-guardrails: buildNodeInvocation adds --max-old-space-size when maxMemoryMb set', () => {
  const inv = buildNodeInvocation({ prompt: 'console.log("hi")', maxMemoryMb: 512 });
  assert.ok(inv.args.includes('--max-old-space-size=512'));

  const invNoMem = buildNodeInvocation({ prompt: 'console.log("hi")' });
  assert.ok(!invNoMem.args.some(a => a.startsWith('--max-old-space-size')));
});

test('script-guardrails: buildDockerInvocation adds --memory and --cpus flags', () => {
  const inv = buildDockerInvocation({
    prompt: 'echo 1',
    dockerImage: 'alpine:latest',
    maxMemoryMb: 256,
    cpus: 1.5,
  });
  assert.ok(inv.args.includes('--memory=256m'));
  assert.ok(inv.args.includes('--cpus=1.5'));
});

test('script-guardrails: runExternal times out and terminates on long-running process', async () => {
  const task = {
    id: 'test_timeout_task',
    title: 'Timeout Task',
    type: 'shell',
    prompt: 'sleep 5',
    executionTimeoutMs: 200, // 200ms timeout
  };

  const started = Date.now();
  await assert.rejects(
    async () => {
      await runExternal(task, 'shell', null);
    },
    (err) => {
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 4000, `Should terminate within reasonable time, took ${elapsed}ms`);
      assert.match(err.message, /Execution timed out after 200ms/);
      return true;
    }
  );
});

test('script-guardrails: runExternal truncates stdout when exceeding maxLogBytesPerRun', async () => {
  // Generate 2000 bytes with limit 500 bytes
  const task = {
    id: 'test_trunc_task',
    title: 'Truncate Task',
    type: 'node',
    prompt: 'process.stdout.write("A".repeat(2000))',
    maxLogBytesPerRun: 500,
    executionTimeoutMs: 5000,
  };

  const res = await runExternal(task, 'node', null);
  assert.ok(res.output.includes('[TRUNCATED: log output exceeded maxLogBytesPerRun'));
  assert.ok(res.output.length < 1500, `Output length ${res.output.length} should be tightly bounded`);
});
