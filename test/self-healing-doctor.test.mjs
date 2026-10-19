import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  classifyFailure,
  generateUnifiedDiff,
  diagnoseFailure,
  applyDoctorFix,
  revertDoctorFix,
  shouldAutoHeal,
  FAILURE_CATEGORIES,
} from '../lib/doctor.js';
import { TaskStore } from '../lib/store.js';
import { createCronApiHandler } from '../lib/api.js';

test('Self-Healing Doctor (#353) - classifyFailure correctly categorizes error patterns', () => {
  // Syntax error
  const syntaxRun = { error: 'SyntaxError: Unexpected token )', exitCode: 1 };
  assert.equal(classifyFailure({}, syntaxRun).category, FAILURE_CATEGORIES.SYNTAX_ERROR);

  // Missing dependency
  const missingDepRun = { stderr: 'bash: line 4: jq: command not found', exitCode: 127 };
  assert.equal(classifyFailure({}, missingDepRun).category, FAILURE_CATEGORIES.DEPENDENCY_MISSING);

  // Rate limit
  const rateLimitRun = { error: 'HTTP 429 Too Many Requests: TPM quota exceeded', exitCode: 1 };
  assert.equal(classifyFailure({}, rateLimitRun).category, FAILURE_CATEGORIES.RATE_LIMIT);

  // Auth failed
  const authRun = { error: '401 Unauthorized: Invalid API Key', exitCode: 1 };
  assert.equal(classifyFailure({}, authRun).category, FAILURE_CATEGORIES.AUTH_FAILED);

  // Timeout
  const timeoutRun = { status: 'timeout', error: 'Command timed out after 30s' };
  assert.equal(classifyFailure({}, timeoutRun).category, FAILURE_CATEGORIES.TIMEOUT);

  // Schema mismatch
  const schemaRun = { error: 'TypeError: Cannot read properties of undefined (reading "name")' };
  assert.equal(classifyFailure({}, schemaRun).category, FAILURE_CATEGORIES.SCHEMA_CHANGE);

  // Network error
  const netRun = { error: 'connect ECONNREFUSED 127.0.0.1:8080' };
  assert.equal(classifyFailure({}, netRun).category, FAILURE_CATEGORIES.NETWORK_ERROR);
});

test('Self-Healing Doctor (#353) - generateUnifiedDiff produces clean line-by-line diff', () => {
  const orig = 'echo "hello world"\nexit 1';
  const fixed = 'echo "hello world"\nexit 0';
  const diff = generateUnifiedDiff(orig, fixed, 'test.sh');

  assert.ok(diff.includes('--- a/test.sh'));
  assert.ok(diff.includes('+++ b/test.sh'));
  assert.ok(diff.includes('-exit 1'));
  assert.ok(diff.includes('+exit 0'));
});

test('Self-Healing Doctor (#353) - diagnoseFailure supports deterministic and model-assisted diagnosis', async () => {
  const task = { id: 't1', title: 'Backup Script', prompt: 'tar -czf /backup.tar /data\nexit 1', type: 'script' };
  const runInfo = { status: 'error', error: 'timed out', exitCode: 143 };

  // Deterministic fallback
  const report = await diagnoseFailure({ task, runInfo });
  assert.equal(report.ok, true);
  assert.equal(report.category, FAILURE_CATEGORIES.TIMEOUT);
  assert.ok(report.cause.includes('timeout'));
  assert.ok(report.diff);

  // Model-assisted mock
  const mockAsk = async () => ({
    ok: true,
    text: JSON.stringify({
      cause: 'Backup timed out due to large /data size. Use tar with compression exclusions.',
      category: 'timeout',
      suggestedFix: 'tar --exclude=/data/tmp -czf /backup.tar /data\nexit 0',
      confidence: 'high',
      explanation: 'Excluded tmp dir to speed up backup',
    }),
  });

  const modelReport = await diagnoseFailure({ task, runInfo, ask: mockAsk });
  assert.equal(modelReport.ok, true);
  assert.equal(modelReport.confidence, 'high');
  assert.ok(modelReport.suggestedFix.includes('--exclude=/data/tmp'));
  assert.ok(modelReport.diff.includes('+tar --exclude=/data/tmp'));
});

test('Self-Healing Doctor (#353) - applyDoctorFix and revertDoctorFix manage task revisions', async () => {
  const task = {
    id: 'script_fix_test',
    title: 'Data Ingestion',
    prompt: 'python ingest.py --raw',
    type: 'script',
  };

  const store = {
    tasks: { [task.id]: task },
    updateTask: async (id, patch) => {
      Object.assign(store.tasks[id], patch);
    },
  };

  const doctorReport = {
    category: 'syntax_error',
    cause: 'Missing quotes on flag',
    suggestedFix: 'python ingest.py --raw "all"',
    confidence: 'high',
  };

  // 1. Apply fix
  const applyRes = await applyDoctorFix(task, doctorReport, { store, user: 'dev_user' });
  assert.equal(applyRes.ok, true);
  assert.equal(task.prompt, 'python ingest.py --raw "all"');
  assert.equal(task.previousPrompt, 'python ingest.py --raw');
  assert.equal(task.revisions.length, 1);
  assert.equal(task.revisions[0].author, 'user:dev_user');

  // 2. Revert fix
  const revertRes = await revertDoctorFix(task, { store, user: 'dev_user' });
  assert.equal(revertRes.ok, true);
  assert.equal(task.prompt, 'python ingest.py --raw');
  assert.equal(task.revisions.length, 2);
  assert.equal(task.revisions[0].category, 'revert');
});

test('Self-Healing Doctor (#353) - shouldAutoHeal enforces 24h limit and high confidence', () => {
  const taskNoAuto = { autoHeal: false };
  const highReport = { confidence: 'high', suggestedFix: 'new_code' };
  assert.equal(shouldAutoHeal(taskNoAuto, highReport), false);

  const taskAuto = { autoHeal: true, prompt: 'old_code' };
  assert.equal(shouldAutoHeal(taskAuto, highReport), true);

  // Rejects medium/low confidence
  assert.equal(shouldAutoHeal(taskAuto, { confidence: 'medium', suggestedFix: 'new_code' }), false);

  // Rejects if patched within 24h (rate limit)
  const taskRecentlyPatched = {
    autoHeal: true,
    prompt: 'old_code',
    selfHealing: { lastPatchedAt: Date.now() - 1000 * 60 * 30 }, // 30m ago
  };
  assert.equal(shouldAutoHeal(taskRecentlyPatched, highReport), false);

  // Allows if patched > 24h ago
  const taskOldPatch = {
    autoHeal: true,
    prompt: 'old_code',
    selfHealing: { lastPatchedAt: Date.now() - 1000 * 60 * 60 * 25 }, // 25h ago
  };
  assert.equal(shouldAutoHeal(taskOldPatch, highReport), true);
});

test('Self-Healing Doctor (#353) - REST API /doctor/apply, /doctor/revert, and /doctor endpoints', async () => {
  const task = {
    id: 'api_doc_task',
    title: 'API Health Check',
    schedule: '0 * * * *',
    prompt: 'curl -fs http://localhost/health || exit 1',
    type: 'script',
  };

  const store = {
    tasks: { [task.id]: task },
    get: (id) => store.tasks[id],
    getHistory: () => [
      {
        id: 'run_doc_1',
        status: 'error',
        doctorReport: {
          category: 'syntax_error',
          cause: 'Wrong URL',
          suggestedFix: 'curl -fs http://127.0.0.1:8080/health || exit 0',
          confidence: 'high',
        },
      },
    ],
    updateTask: async (id, patch) => {
      Object.assign(store.tasks[id], patch);
    },
    getSettings: () => ({ apiToken: '' }),
  };

  const scheduler = { isRunning: () => false, runningSince: () => null };
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  // 1. GET /dsh-cron/tasks/:id/doctor
  const getReq = {
    method: 'GET',
    url: `/dsh-cron/tasks/${task.id}/doctor`,
    headers: { host: 'localhost' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const getRes = createMockResponse();
  await handler(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.ok, true);
  assert.equal(getRes.body.doctorReport.category, 'syntax_error');

  // 2. POST /dsh-cron/tasks/:id/doctor/apply
  const applyReq = {
    method: 'POST',
    url: `/dsh-cron/tasks/${task.id}/doctor/apply`,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ user: 'admin_test' }));
    },
  };
  const applyRes = createMockResponse();
  await handler(applyReq, applyRes);
  assert.equal(applyRes.statusCode, 200);
  assert.equal(applyRes.body.ok, true);
  assert.ok(store.tasks[task.id].prompt.includes('127.0.0.1:8080'));
  assert.equal(store.tasks[task.id].revisions.length, 1);

  // 3. POST /dsh-cron/tasks/:id/doctor/revert
  const revertReq = {
    method: 'POST',
    url: `/dsh-cron/tasks/${task.id}/doctor/revert`,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{}');
    },
  };
  const revertRes = createMockResponse();
  await handler(revertReq, revertRes);
  assert.equal(revertRes.statusCode, 200);
  assert.equal(revertRes.body.ok, true);
  assert.ok(store.tasks[task.id].prompt.includes('localhost/health'));
});

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    writeHead(code, headers = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(chunk) {
      if (chunk) {
        try {
          this.body = JSON.parse(chunk.toString());
        } catch {
          this.body = chunk.toString();
        }
      }
    },
  };
}
