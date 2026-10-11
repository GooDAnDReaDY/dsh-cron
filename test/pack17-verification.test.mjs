import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sendToChannel } from '../lib/channels.js';
import { sanitizeValidators, validateRunResult } from '../lib/validators.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';

test('Pack 17 verification suite: #323 (Desktop TTS port), #316 (Declarative validators), #315 (Run card & stages)', async (t) => {
  const repoRoot = path.resolve(import.meta.dirname, '..');

  await t.test('1. #323 Desktop TTS port auto-resolution', async () => {
    let capturedUrl = null;
    const mockFetch = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ provider: 'dsh-tts', tookMs: 12 }) };
    };

    const task = { id: 'tts-task', title: 'TTS Task' };
    const runInfo = { status: 'success', output: 'Done' };

    // 1a. Default empty ttsBaseUrl resolves dynamic port from settings._webServerPort
    await sendToChannel({
      channelId: 'tts',
      task,
      runInfo,
      settings: { ttsBaseUrl: '', _webServerPort: 49152 },
      fetchFn: mockFetch,
      timeoutMs: 5000,
    });
    assert.equal(capturedUrl, 'http://127.0.0.1:49152/dsh-tts/speak');

    // 1b. Default empty ttsBaseUrl falls back to 3080 if no port provided
    await sendToChannel({
      channelId: 'tts',
      task,
      runInfo,
      settings: { ttsBaseUrl: '' },
      fetchFn: mockFetch,
      timeoutMs: 5000,
    });
    assert.equal(capturedUrl, 'http://127.0.0.1:3080/dsh-tts/speak');

    // 1c. Explicit ttsBaseUrl overrides dynamic port
    await sendToChannel({
      channelId: 'tts',
      task,
      runInfo,
      settings: { ttsBaseUrl: 'http://custom-harness:8888', _webServerPort: 49152 },
      fetchFn: mockFetch,
      timeoutMs: 5000,
    });
    assert.equal(capturedUrl, 'http://custom-harness:8888/dsh-tts/speak');
  });

  await t.test('2. #316 Declarative output validators (pure validator tests)', () => {
    // 2a. sanitizeValidators removes invalid entries and normalizes
    const rawValidators = [
      { type: 'json' },
      { type: 'regex', pattern: 'ok.*' },
      { type: 'invalid_type' },
      null,
      'not_an_object',
    ];
    const sanitized = sanitizeValidators(rawValidators);
    assert.equal(sanitized.length, 2);
    assert.equal(sanitized[0].type, 'json');
    assert.equal(sanitized[1].type, 'regex');

    // 2b. JSON validator: valid and invalid
    const taskJson = {
      id: 't-json',
      validators: [{ type: 'json' }],
    };
    const validJsonRes = validateRunResult(taskJson, { status: 'success', output: '{"status": "ok", "count": 42}' });
    assert.equal(validJsonRes.ok, true);

    const invalidJsonRes = validateRunResult(taskJson, { status: 'success', output: 'Not JSON at all' });
    assert.equal(invalidJsonRes.ok, false);
    assert.match(invalidJsonRes.error, /JSON/i);

    // 2c. JSON property check
    const taskJsonProp = {
      id: 't-json-prop',
      validators: [{ type: 'json', statusKey: 'status', expected: 'healthy' }],
    };
    const goodPropRes = validateRunResult(taskJsonProp, { status: 'success', output: '{"status": "healthy"}' });
    assert.equal(goodPropRes.ok, true);

    const badPropRes = validateRunResult(taskJsonProp, { status: 'success', output: '{"status": "degraded"}' });
    assert.equal(badPropRes.ok, false);
    assert.match(badPropRes.error, /healthy/);

    // 2d. Regex & text validators
    const taskRegex = {
      id: 't-regex',
      validators: [
        { type: 'regex', pattern: '^SUCCESS:' },
        { type: 'text', text: 'FATAL', negate: true },
      ],
    };
    const passRegex = validateRunResult(taskRegex, { status: 'success', output: 'SUCCESS: backup completed' });
    assert.equal(passRegex.ok, true);

    const failNegate = validateRunResult(taskRegex, { status: 'success', output: 'SUCCESS: backup completed with FATAL error' });
    assert.equal(failNegate.ok, false);
    assert.match(failNegate.error, /FATAL/);

    // 2e. Malformed regex does not crash; returns error status
    const taskBadRegex = {
      id: 't-bad-regex',
      validators: [{ type: 'regex', pattern: '[unclosed' }],
    };
    const badRegexRes = validateRunResult(taskBadRegex, { status: 'success', output: 'anything' });
    assert.equal(badRegexRes.ok, false);
    assert.equal(badRegexRes.status, 'error');

    // 2f. File validator with security checks against path traversal
    const tmpDir = path.join(repoRoot, 'test', 'tmp-pack17-files-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      const targetFile = path.join(tmpDir, 'output.txt');
      fs.writeFileSync(targetFile, 'Hello world report');

      const taskFile = {
        id: 't-file',
        validators: [{ type: 'file', path: 'output.txt', mustExist: true, minBytes: 5 }],
      };
      const fileRes = validateRunResult(taskFile, { status: 'success', output: 'wrote output.txt' }, { cwd: tmpDir });
      assert.equal(fileRes.ok, true);

      // Traversal check
      const taskTraversal = {
        id: 't-trav',
        validators: [{ type: 'file', path: '../../../../../../etc/passwd', mustExist: true }],
      };
      const travRes = validateRunResult(taskTraversal, { status: 'success', output: 'done' }, { cwd: tmpDir });
      assert.equal(travRes.ok, false);
      assert.match(travRes.error, /escapes allowed directory/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('3. #316 Lifecycle integration: validation failure transitions status, suppresses onSuccess, triggers onFailure', async () => {
    const tmpDir = path.join(repoRoot, 'test', 'tmp-pack17-lifecycle-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const store = new TaskStore(path.join(tmpDir, 'tasks.json'));

    let chainedSuccessRan = false;
    let chainedFailureRan = false;

    const scheduler = new TaskScheduler(store, async (task) => {
      if (task.id === 'task-success-chain') chainedSuccessRan = true;
      if (task.id === 'task-failure-chain') chainedFailureRan = true;
      if (task.id === 'main-task') {
        return {
          status: 'success',
          output: 'INVALID_OUTPUT',
          usage: { inputTokens: 10, outputTokens: 20 },
          costUsd: 0.001,
        };
      }
      return { status: 'success', output: 'ok' };
    });

    t.after(() => {
      scheduler.stopAll();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // Create chain target tasks
    store.set({
      id: 'task-success-chain',
      title: 'Success Handler',
      type: 'script',
      schedule: '0 9 * * 1-5',
      prompt: 'echo ok',
      status: 'active',
    });
    store.set({
      id: 'task-failure-chain',
      title: 'Failure Handler',
      type: 'script',
      schedule: '0 9 * * 1-5',
      prompt: 'echo ok',
      status: 'active',
    });

    // Create main task with json validator that will fail on 'INVALID_OUTPUT'
    store.set({
      id: 'main-task',
      title: 'Main Validated Task',
      type: 'script',
      schedule: '0 9 * * 1-5',
      prompt: 'echo 1',
      status: 'active',
      validators: [{ type: 'json' }],
      onSuccess: 'task-success-chain',
      onFailure: 'task-failure-chain',
    });

    await scheduler.runTask('main-task');
    // Allow chained setImmediate execution
    await new Promise((r) => setTimeout(r, 100));

    const runs = store.getHistory('main-task');
    assert.equal(runs.length, 1);
    const mainRun = runs[0];

    // Status should be validation_failed
    assert.equal(mainRun.status, 'validation_failed');
    assert.match(mainRun.stoppedReason, /Validation failed/i);
    assert.equal(mainRun.validation?.ok, false);

    // Chaining: onSuccess must NOT run, onFailure MUST run
    assert.equal(chainedSuccessRan, false, 'onSuccess must be suppressed when validation fails');
    assert.equal(chainedFailureRan, true, 'onFailure must be triggered when validation fails');
  });

  await t.test('4. #315 Run card stages, cost classification, and decoupled delivery retry', async () => {
    const tmpDir = path.join(repoRoot, 'test', 'tmp-pack17-stages-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const store = new TaskStore(path.join(tmpDir, 'tasks.json'));

    let deliverCount = 0;
    let executedTaskRuns = 0;

    const scheduler = new TaskScheduler(store, async () => {
      executedTaskRuns++;
      return {
        status: 'success',
        output: 'Stage task finished',
        usage: { inputTokens: 50, outputTokens: 100 },
        costUsd: 0.005,
      };
    });

    scheduler.deliver = async (task, runInfo) => {
      deliverCount++;
      return {
        channels: ['telegram'],
        delivered: [{ channel: 'telegram', detail: { ok: true } }],
        skipped: [],
        failures: [],
      };
    };

    t.after(() => {
      scheduler.stopAll();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const task = store.set({
      id: 'stage-task',
      title: 'Stage Task',
      type: 'llm',
      schedule: '0 9 * * 1-5',
      prompt: 'Summarize',
      status: 'active',
      notifyTelegram: true,
    });

    await scheduler.runTask('stage-task');

    const history = store.getHistory('stage-task');
    assert.equal(history.length, 1);
    const run = history[0];

    // Check stable runId
    assert.ok(run.id && typeof run.id === 'string');
    assert.ok(run.id.startsWith('run_'));

    // Check stages
    assert.ok(Array.isArray(run.stages), 'Run must have stages array');
    const stageNames = run.stages.map((s) => s.name);
    assert.deepEqual(stageNames, ['queue', 'preflight', 'execution', 'validation', 'delivery']);

    assert.equal(run.stages[0].status, 'success');
    assert.equal(run.stages[1].status, 'success');
    assert.equal(run.stages[2].status, 'success');
    assert.equal(run.stages[3].status, 'skipped'); // no validators configured
    assert.equal(run.stages[4].status, 'delivered');

    // Check stoppedReason & cost
    assert.equal(run.stoppedReason, 'Completed successfully');
    assert.equal(run.cost?.amount, 0.005);
    assert.equal(run.cost?.kind, 'exact');
    assert.equal(run.delivery?.status, 'delivered');
    assert.equal(deliverCount, 1);
    assert.equal(executedTaskRuns, 1);

    // 4b. Test delivery retry does NOT re-execute task body
    const retryRes = await scheduler.deliverNotifications(task, run);
    assert.equal(retryRes.status, 'delivered');
    assert.equal(deliverCount, 2, 'Delivery runner called again');
    assert.equal(executedTaskRuns, 1, 'Task execution payload must NOT be re-executed');

    // 4c. Backward compatibility: verify old run without stages does not throw
    store.recordRun('stage-task', {
      at: Date.now() - 5000,
      status: 'success',
      durationMs: 120,
      output: 'Legacy run without stages',
    });
    const loadedRuns = store.getHistory('stage-task');
    assert.equal(loadedRuns.length, 2);
    assert.equal(loadedRuns[1].output, 'Stage task finished'); // older run is second
    assert.equal(loadedRuns[0].stages, null); // legacy run has null stages
  });

  await t.test('5. Documentation and package version synchronization to 0.2.51 (#315, #316, #323)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(pkg.version, /^0\.2\.(?:51|52)$/, 'package.json version is 0.2.51');

    const indexMd = fs.readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
    assert.match(indexMd, /0\.2\.51/, 'index.md references version 0.2.51');
    assert.match(indexMd, /0\.2\.50/, 'index.md references previous release 0.2.50');

    const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /`0\.2\.51`/, 'AGENTS.md current version is 0.2.51');

    const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 0\.2\.51 \(2026-10-11\)/, 'CHANGELOG.md contains 0.2.51 section');

    const designMd = fs.readFileSync(path.join(repoRoot, 'docs', 'design', 'DESIGN.md'), 'utf8');
    assert.match(designMd, /0\.2\.51/, 'DESIGN.md contains 0.2.51 contract');
  });
});

