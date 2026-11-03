import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeScopes,
  scopesOverlap,
  hasScopeConflict,
  ScopeLockManager,
} from '../lib/scope-locks.js';
import { TaskScheduler } from '../lib/scheduler/scheduler.js';

test('normalizeScopes cleans and dedupes relative path scopes', () => {
  assert.deepEqual(normalizeScopes(null), []);
  assert.deepEqual(normalizeScopes(''), []);
  assert.deepEqual(normalizeScopes(['./src/', 'src/components/', '/docs//']), ['src', 'src/components', 'docs']);
  assert.deepEqual(normalizeScopes('src, docs/api.md, src'), ['src', 'docs/api.md']);
  assert.deepEqual(normalizeScopes(String.raw`src\components\auth`), ['src/components/auth']);
});

test('scopesOverlap detects equality, ancestry, and root wildcards', () => {
  // Identical
  assert.equal(scopesOverlap('src', 'src'), true);
  // Ancestor / descendant
  assert.equal(scopesOverlap('src', 'src/components'), true);
  assert.equal(scopesOverlap('src/components', 'src'), true);
  assert.equal(scopesOverlap('src/components', 'src/components/ui/button.js'), true);
  // Sibling non-overlapping
  assert.equal(scopesOverlap('src/components', 'src/utils'), false);
  assert.equal(scopesOverlap('src/app.js', 'src/index.js'), false);
  assert.equal(scopesOverlap('frontend', 'backend'), false);
  // Root wildcards
  assert.equal(scopesOverlap('.', 'src'), true);
  assert.equal(scopesOverlap('*', 'docs'), true);
});

test('hasScopeConflict detects conflicts between list of scopes', () => {
  assert.equal(hasScopeConflict(['src/a', 'src/b'], ['docs', 'src/b/c'])?.conflict, true);
  assert.equal(hasScopeConflict(['src/a'], ['src/b']), null);
  assert.equal(hasScopeConflict([], ['src']), null);
});

test('ScopeLockManager tracks locks per workspace and isolates conflicts', () => {
  const manager = new ScopeLockManager();

  const task1 = { id: 'task-1', workspaceId: 'ws-alpha', writeScopes: ['src/'] };
  const task2 = { id: 'task-2', workspaceId: 'ws-alpha', writeScopes: ['src/components/'] };
  const task3 = { id: 'task-3', workspaceId: 'ws-alpha', writeScopes: ['docs/'] };
  const task4 = { id: 'task-4', workspaceId: 'ws-beta', writeScopes: ['src/'] };
  const taskWorktree = { id: 'task-wt', workspaceId: 'ws-alpha', writeScopes: ['src/'], worktree: true };

  // Task 1 acquires lock on ws-alpha
  assert.equal(manager.canAcquire(task1, 'task-1').ok, true);
  manager.acquire(task1, 'task-1');

  // Task 2 conflicts with Task 1 (src vs src/components on ws-alpha)
  const can2 = manager.canAcquire(task2, 'task-2');
  assert.equal(can2.ok, false);
  assert.equal(can2.conflictTaskId, 'task-1');
  assert.equal(can2.conflictingScope, 'src/components');

  // Task 3 does NOT conflict (docs vs src on ws-alpha)
  assert.equal(manager.canAcquire(task3, 'task-3').ok, true);

  // Task 4 does NOT conflict (different workspace ws-beta)
  assert.equal(manager.canAcquire(task4, 'task-4').ok, true);

  // Task in isolated worktree does NOT conflict with workspace
  assert.equal(manager.canAcquire(taskWorktree, 'task-wt').ok, true);

  // Releasing task 1 unblocks task 2
  manager.release(task1, 'task-1');
  assert.equal(manager.canAcquire(task2, 'task-2').ok, true);
});

test('TaskScheduler queues task on scope conflict and drains queue upon completion', async () => {
  const tasks = new Map();
  const history = new Map();

  const mockStore = {
    get: (id) => tasks.get(id),
    getSettings: () => ({}),
    history: {
      get: (id) => history.get(id) || [],
    },
    recordRun: (id, run) => {
      const list = history.get(id) || [];
      list.push(run);
      history.set(id, list);
    },
    patch: () => {},
    set: () => {},
  };

  let executionOrder = [];
  let finishTaskA;
  const taskAPromise = new Promise((resolve) => { finishTaskA = resolve; });

  const executeFn = async (task) => {
    executionOrder.push(`start:${task.id}`);
    if (task.id === 'task-a') {
      await taskAPromise;
    }
    executionOrder.push(`end:${task.id}`);
    return { status: 'ok', output: `Done ${task.id}` };
  };

  const scheduler = new TaskScheduler(mockStore, executeFn, { maxConcurrent: 5 });

  const taskA = {
    id: 'task-a',
    title: 'Task A',
    status: 'active',
    workspaceId: 'ws-1',
    writeScopes: ['src/core/'],
    overlapPolicy: 'queue',
    priority: 5,
  };
  const taskB = {
    id: 'task-b',
    title: 'Task B',
    status: 'active',
    workspaceId: 'ws-1',
    writeScopes: ['src/core/utils/'],
    overlapPolicy: 'queue',
    priority: 5,
  };

  tasks.set('task-a', taskA);
  tasks.set('task-b', taskB);

  // 1. Run Task A (starts running and holds scope lock)
  const pA = scheduler.runTask('task-a');
  await new Promise((r) => setImmediate(r));
  assert.equal(scheduler.isRunning('task-a'), true);

  // 2. Run Task B (conflicts on scope -> enqueued)
  const resB = await scheduler.runTask('task-b');
  assert.equal(resB, null, 'Task B should be enqueued due to scope conflict');
  assert.equal(scheduler.queue.length, 1);
  assert.equal(scheduler.queue[0].taskId, 'task-b');
  assert.equal(scheduler.queue[0].waitReason, 'scope-conflict');

  // 3. Complete Task A -> releases scope lock -> drains queue -> Task B automatically starts
  finishTaskA();
  await pA;

  // Give setImmediate queue drain time to execute
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(scheduler.queue.length, 0, 'Queue should be drained');
  assert.deepEqual(executionOrder, ['start:task-a', 'end:task-a', 'start:task-b', 'end:task-b']);
});
