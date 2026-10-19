import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { createCronApiHandler } from '../lib/api.js';
import { sanitizeSwarmConfig, executeSwarmTask } from '../lib/swarm.js';
import { captureGitDiff, discardGitChanges, applyGitDiff } from '../lib/git-diff.js';

const execFileAsync = promisify(execFile);

test('Pack 27 Integration - Swarm Delegation & Git Diff Patch Review (#350, #351)', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `dsh-cron-p27-git-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const tmpStoreDir = path.join(os.tmpdir(), `dsh-cron-p27-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const storePath = path.join(tmpStoreDir, 'tasks.json');
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(tmpStoreDir, { recursive: true });

  t.after(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await fs.rm(tmpStoreDir, { recursive: true, force: true });
    } catch {}
  });

  // 1. Initialize git repository in tmpDir
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.name', 'AgentTester'], { cwd: tmpDir });
  await execFileAsync('git', ['config', 'user.email', 'tester@agent.local'], { cwd: tmpDir });

  const trackedFile = path.join(tmpDir, 'service.py');
  await fs.writeFile(trackedFile, 'PORT = 8080\nDEBUG = False\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
  await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

  // 2. Setup TaskStore & TaskScheduler
  const store = new TaskStore(storePath);

  let executedTasks = [];
  const mockExecuteFn = async (taskDef) => {
    executedTasks.push(taskDef.id);
    if (taskDef.id.includes('w2')) {
      throw new Error('Worker 2 timeout or error');
    }
    return { output: `Success from ${taskDef.title || taskDef.id}` };
  };

  const scheduler = new TaskScheduler(store, mockExecuteFn);
  t.after(() => scheduler.stopAll());

  // 3. Test Swarm Task Execution (#350)
  const swarmTask = {
    id: 'swarm_job_1',
    title: 'Cluster Audit Swarm',
    type: 'swarm',
    schedule: '0 * * * *',
    status: 'paused',
    swarm: {
      concurrencyLimit: 2,
      subtasks: [
        { id: 'w1', title: 'Audit Auth', prompt: 'check auth' },
        { id: 'w2', title: 'Audit Network', prompt: 'check network' },
        { id: 'w3', title: 'Audit Storage', prompt: 'check storage' },
      ],
      synthesizer: { prompt: 'Compile cluster audit report' },
    },
  };

  store.set(swarmTask);

  const swarmOutcome = await scheduler.runTask(swarmTask.id);
  const swarmRuns = store.getHistory(swarmTask.id);
  assert.equal(swarmRuns.length, 1);
  const lastSwarmRun = swarmRuns[0];

  assert.ok(lastSwarmRun.subtaskRuns, 'subtaskRuns recorded');
  assert.equal(lastSwarmRun.subtaskRuns.length, 3);
  assert.equal(lastSwarmRun.subtaskRuns[0].status, 'success');
  assert.equal(lastSwarmRun.subtaskRuns[1].status, 'error');
  assert.equal(lastSwarmRun.subtaskRuns[2].status, 'success');
  assert.ok(lastSwarmRun.output.includes('Audit Auth'));
  assert.ok(lastSwarmRun.output.includes('Audit Storage'));

  // 4. Test Git Diff Capture on Code-Modifying Task (#351)
  const codeTask = {
    id: 'code_patch_job',
    title: 'Refactor Port',
    type: 'script',
    cwd: tmpDir,
    schedule: '0 * * * *',
    status: 'paused',
  };
  store.set(codeTask);

  // Modify file in tmpDir as if task executed
  await fs.writeFile(trackedFile, 'PORT = 9000\nDEBUG = True\nNEW_KEY = "xyz"\n', 'utf8');

  // Scheduler runTask triggers diff capture in diffDir
  await scheduler.runTask(codeTask.id);
  const codeRuns = store.getHistory(codeTask.id);
  assert.equal(codeRuns.length, 1);
  const lastCodeRun = codeRuns[0];

  assert.ok(lastCodeRun.gitDiff, 'gitDiff recorded in runInfo');
  assert.equal(lastCodeRun.gitDiff.hasChanges, true);
  assert.equal(lastCodeRun.gitDiff.files.length, 1);
  assert.ok(lastCodeRun.gitDiff.diff.includes('+PORT = 9000'));
  assert.ok(lastCodeRun.gitDiff.diff.includes('-PORT = 8080'));

  // 5. Test REST API Endpoints for Git Diff Discard & Apply (#351)
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  // 5a. GET /dsh-cron/tasks/:id/git-diff
  const getReq = {
    method: 'GET',
    url: `/dsh-cron/tasks/${codeTask.id}/git-diff`,
    headers: { host: 'localhost' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const getRes = createMockResponse();
  await handler(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.ok, true);
  assert.equal(getRes.body.gitDiff.hasChanges, true);

  // 5b. POST /dsh-cron/tasks/:id/git-diff/discard
  const discardReq = {
    method: 'POST',
    url: `/dsh-cron/tasks/${codeTask.id}/git-diff/discard`,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); },
  };
  const discardRes = createMockResponse();
  await handler(discardReq, discardRes);
  assert.equal(discardRes.statusCode, 200);
  assert.equal(discardRes.body.ok, true);

  // Verify file was restored
  const restoredCode = await fs.readFile(trackedFile, 'utf8');
  assert.equal(restoredCode, 'PORT = 8080\nDEBUG = False\n');

  // 5c. POST /dsh-cron/tasks/:id/git-diff/apply
  const patchToApply = lastCodeRun.gitDiff.diff;
  const applyReq = {
    method: 'POST',
    url: `/dsh-cron/tasks/${codeTask.id}/git-diff/apply`,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ diff: patchToApply })); },
  };
  const applyRes = createMockResponse();
  await handler(applyReq, applyRes);
  assert.equal(applyRes.statusCode, 200);
  assert.equal(applyRes.body.ok, true);

  // Verify file was patched back
  const patchedBackCode = await fs.readFile(trackedFile, 'utf8');
  assert.ok(patchedBackCode.includes('PORT = 9000'));
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
