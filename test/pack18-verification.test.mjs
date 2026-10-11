import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalManager, APPROVAL_STATES } from '../lib/approval.js';
import { globalBudgetManager } from '../lib/global-budgets.js';
import { listVerifiedRecipes, validateRecipeDependencies, EXTENDED_RECIPES } from '../lib/recipes-catalog.js';
import { executeTask } from '../lib/scheduler-execution.js';
import { TaskStore } from '../lib/store.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function createTempStore() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cron-test-18-'));
  const filePath = path.join(tmpDir, 'tasks.json');
  const store = new TaskStore(filePath);
  return { store, tmpDir };
}

test('Pack 18: 1. Action Approval Gate (#318) - proposal lifecycle and replay protection', () => {
  const taskId = 'task_approval_test_' + Date.now();
  
  // 1. Create proposal
  const prop = approvalManager.createProposal(taskId, 'run_123', {
    actionType: 'run',
    summary: 'Test execution requires approval',
    details: { prompt: 'dangerous command' },
    timeoutMs: 60000,
  });

  assert.equal(prop.taskId, taskId);
  assert.equal(prop.state, APPROVAL_STATES.PENDING);

  // 2. Lookup pending proposal
  const found = approvalManager.getPendingProposalForTask(taskId);
  assert.equal(found.id, prop.id);

  // 3. Approve proposal
  const decision = approvalManager.decide(prop.id, 'approve', { decidedBy: 'admin', reason: 'Reviewed and safe' });
  assert.equal(decision.ok, true);
  assert.equal(decision.proposal.state, APPROVAL_STATES.APPROVED);
  assert.equal(decision.proposal.decidedBy, 'admin');

  // 4. Replay protection: deciding again returns error
  const replay = approvalManager.decide(prop.id, 'approve', { decidedBy: 'attacker' });
  assert.equal(replay.ok, false);
  assert.match(replay.error, /already resolved/);

  // 5. Pending lookup returns null after approval
  assert.equal(approvalManager.getPendingProposalForTask(taskId), null);
});

test('Pack 18: 2. Scheduler halts on requireApproval when unapproved (#318)', async () => {
  const { store, tmpDir } = createTempStore();
  const task = {
    id: 'task_gate_1',
    title: 'Gated Task',
    type: 'script',
    prompt: 'echo hello',
    status: 'active',
    requireApproval: true,
  };
  store.set(task);

  const scheduler = {
    store,
    running: new Map(),
    queue: [],
    maxConcurrent: 2,
    recordSkipped: (id, reason) => {},
    pauseTask: () => {},
  };

  // Run without approvedBy -> blocked with waiting_approval status
  const res = await executeTask(scheduler, task.id);
  assert.equal(res.status, 'waiting_approval');
  assert.ok(res.proposalId);

  // Proposal exists
  const prop = approvalManager.getProposal(res.proposalId);
  assert.equal(prop.state, APPROVAL_STATES.PENDING);

  // Deciding on proposal
  approvalManager.decide(res.proposalId, 'approve', { decidedBy: 'user' });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Pack 18: 3. Global & Provider/Model Budgets (#320)', () => {
  const { store, tmpDir } = createTempStore();

  const task = {
    id: 'budget_task_1',
    title: 'LLM Task',
    type: 'llm',
    provider: 'deepseek',
    model: 'deepseek-chat',
    status: 'active',
  };
  store.set(task);

  // Record a simulated expensive run in history
  store.recordRun(task.id, {
    id: 'run_b1',
    at: Date.now() - 1000,
    costUsd: 12.50,
    status: 'success',
  });

  const settings = {
    globalDailyCostLimitUsd: 10.00, // $10 limit breached by $12.50
    providerHourlyRunLimits: { deepseek: 50 },
  };

  const budgetCheck = globalBudgetManager.checkBudget(store, task, settings);
  assert.equal(budgetCheck.exceeded, true);
  assert.equal(budgetCheck.type, 'globalDailyCostLimitUsd');
  assert.match(budgetCheck.reason, /Global daily budget exceeded/);

  // Provider limit check
  const providerSettings = {
    globalDailyCostLimitUsd: 0,
    providerHourlyRunLimits: { deepseek: 1 }, // limit = 1, already ran 1
  };
  const providerCheck = globalBudgetManager.checkBudget(store, task, providerSettings);
  assert.equal(providerCheck.exceeded, true);
  assert.equal(providerCheck.type, 'providerHourlyLimit');

  // Reservation & settlement
  const resId = globalBudgetManager.reserve(task, 0.10);
  assert.ok(globalBudgetManager.getActiveReservationsCost() > 0);
  globalBudgetManager.settle(resId);
  assert.equal(globalBudgetManager.getActiveReservationsCost(), 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Pack 18: 4. Verified Recipes Catalog & Dependency Validation (#322)', () => {
  assert.ok(EXTENDED_RECIPES.length >= 13);

  const giteaRecipe = EXTENDED_RECIPES.find((r) => r.id === 'recipe_gitea_issues_digest');
  assert.ok(giteaRecipe);
  assert.deepEqual(giteaRecipe.dependencies.integrations, ['gitea']);

  // Missing credentials check
  const invalidSettings = {};
  const depCheck = validateRecipeDependencies(giteaRecipe, invalidSettings);
  assert.equal(depCheck.ok, false);
  assert.ok(depCheck.missing.length > 0);

  // Valid settings check
  const validSettings = { giteaBaseUrl: 'http://localhost:3005', giteaTokenRef: 'gitea_tok' };
  const validCheck = validateRecipeDependencies(giteaRecipe, validSettings);
  assert.equal(validCheck.ok, true);

  const verified = listVerifiedRecipes(validSettings);
  const foundGitea = verified.find((r) => r.id === 'recipe_gitea_issues_digest');
  assert.equal(foundGitea.dependenciesValid, true);
});

test('Pack 18: 5. Documentation and package version synchronization to 0.2.52 (#318, #320, #322)', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.2.52', 'package.json version is 0.2.52');

  const indexMd = fs.readFileSync(path.join(repoRoot, 'index.md'), 'utf8');
  assert.match(indexMd, /0\.2\.52/, 'index.md references version 0.2.52');
  assert.match(indexMd, /0\.2\.51/, 'index.md references previous release 0.2.51');

  const agentsMd = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /0\.2\.52/, 'AGENTS.md current version is 0.2.52');

  const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## 0\.2\.52 \(2026-10-11\)/, 'CHANGELOG.md contains 0.2.52 section');

  const designMd = fs.readFileSync(path.join(repoRoot, 'docs', 'design', 'DESIGN.md'), 'utf8');
  assert.match(designMd, /0\.2\.52/, 'DESIGN.md contains 0.2.52 contract');
});
