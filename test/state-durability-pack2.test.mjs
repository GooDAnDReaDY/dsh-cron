import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../lib/store.js";
import { TaskScheduler } from "../lib/scheduler.js";
import { finishRun } from "../lib/scheduler-execution.js";
import { createCronApiHandler, TASK_EXPORT_KIND } from "../lib/index.js";

function mockReq(chunks) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) req.emit("data", chunk);
    req.emit("end");
  });
  return req;
}

function mockPost(url, body, headers = {}) {
  const req = mockReq([Buffer.from(JSON.stringify(body), "utf8")]);
  req.method = "POST";
  req.url = url;
  req.headers = headers;
  return req;
}

function mockPatch(url, body, headers = {}) {
  const req = mockReq([Buffer.from(JSON.stringify(body), "utf8")]);
  req.method = "PATCH";
  req.url = url;
  req.headers = headers;
  return req;
}

function mockDelete(url, headers = {}) {
  const req = mockReq([]);
  req.method = "DELETE";
  req.url = url;
  req.headers = headers;
  return req;
}

function mockRes() {
  const res = {
    statusCode: 0,
    payload: null,
    writeHead(code) { this.statusCode = code; },
    end(payload) {
      if (!payload) {
        this.payload = null;
        return;
      }
      try {
        this.payload = JSON.parse(payload);
      } catch {
        this.payload = payload;
      }
    },
  };
  return res;
}

function makeEnv(t) {
  const filePath = path.join(os.tmpdir(), `dsh-cron-pack2-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(filePath);
  const scheduler = new TaskScheduler(store, async () => "ok");
  t.after(() => {
    scheduler.stopAll();
    try { fs.rmSync(filePath, { force: true }); } catch {}
  });
  return { store, scheduler, filePath };
}

// ---------------------------------------------------------------------
// Issue #215: finishRun state consistency
// ---------------------------------------------------------------------

test("Issue #215: finishRun does not resurrect a task deleted during run", (t) => {
  const { store, scheduler } = makeEnv(t);
  const task = store.set({
    title: "Temporary Job",
    schedule: "0 9 * * *",
    prompt: "echo hi",
    status: "active",
  });

  scheduler.beginRun(task, task.id);
  assert.ok(scheduler.isRunning(task.id));

  // Concurrently delete the task while run is in progress
  const deleted = store.delete(task.id);
  assert.equal(deleted, true);
  assert.equal(store.get(task.id), undefined);

  // Run completes
  finishRun(scheduler, task, task.id, "success", 0, { isCurrentRun: true });

  // Task MUST NOT be resurrected in store
  assert.equal(store.get(task.id), undefined, "deleted task must not be recreated by finishRun");
});

test("Issue #215: finishRun preserves concurrent user edits (does not overwrite)", (t) => {
  const { store, scheduler } = makeEnv(t);
  const initialTask = store.set({
    title: "Original Title",
    schedule: "0 9 * * *",
    prompt: "original prompt",
    oneShot: true,
    status: "active",
  });

  scheduler.beginRun(initialTask, initialTask.id);

  // User edits title and prompt concurrently while task is running
  store.set({
    ...store.get(initialTask.id),
    title: "Updated User Title",
    prompt: "updated user prompt",
  });

  // Task completes
  finishRun(scheduler, initialTask, initialTask.id, "success", 0, { isCurrentRun: true });

  const current = store.get(initialTask.id);
  assert.ok(current);
  assert.equal(current.title, "Updated User Title", "user title edit was preserved");
  assert.equal(current.prompt, "updated user prompt", "user prompt edit was preserved");
  assert.equal(current.status, "completed", "one-shot completed status was applied");
});

test("Issue #215: finishRun ignores superseded run results", (t) => {
  const { store, scheduler } = makeEnv(t);
  const task = store.set({
    title: "Superseded Job",
    schedule: "0 9 * * *",
    oneShot: true,
    status: "active",
  });

  // Call finishRun with isCurrentRun: false
  finishRun(scheduler, task, task.id, "success", 0, { isCurrentRun: false });

  // Status should NOT have been set to completed because this run was not current
  const stored = store.get(task.id);
  assert.equal(stored.status, "active");
});

// ---------------------------------------------------------------------
// Issue #217: stopAll clears concurrency queue & blocks late execution
// ---------------------------------------------------------------------

test("Issue #217: stopAll clears concurrency queue and prevents queued tasks from executing", async (t) => {
  const { store, scheduler } = makeEnv(t);
  scheduler.maxConcurrent = 1;

  let task1Resolve;
  const task1Gate = new Promise((resolve) => { task1Resolve = resolve; });
  let task2Executed = false;

  scheduler.executeFn = async (task) => {
    if (task.id === "task-1") {
      await task1Gate;
      return "task 1 done";
    }
    if (task.id === "task-2") {
      task2Executed = true;
      return "task 2 done";
    }
  };

  const t1 = store.set({ id: "task-1", title: "Task 1", schedule: "0 9 * * *", status: "active" });
  const t2 = store.set({ id: "task-2", title: "Task 2", schedule: "0 9 * * *", status: "active", overlapPolicy: "queue" });

  // Start task 1 - it will hold concurrency slot
  const p1 = scheduler.runTask(t1.id);
  assert.equal(scheduler.running.size, 1);

  // Queue task 2 - concurrency is 1, so it enters scheduler.queue
  const p2 = scheduler.runTask(t2.id);
  assert.equal(scheduler.queue.length, 1, "task 2 is queued");
  assert.equal(scheduler.queue[0].taskId, "task-2");

  // Call stopAll while task 1 is running and task 2 is queued
  scheduler.stopAll();

  assert.equal(scheduler.isStopped, true, "scheduler marked as stopped");
  assert.equal(scheduler.queue.length, 0, "concurrency queue was cleared on stopAll");

  // Unblock task 1 so it finishes
  task1Resolve();
  await p1;
  await p2;

  // Let event loop drain setImmediate
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(task2Executed, false, "queued task 2 was never executed after shutdown");
});

test("Issue #217: stopAll cancels retry timers and ignores retry execution", async (t) => {
  const { store, scheduler } = makeEnv(t);

  let runCount = 0;
  scheduler.executeFn = async () => {
    runCount++;
    throw new Error("Task failure");
  };

  const task = store.set({
    id: "retry-task",
    title: "Retry Job",
    schedule: "0 9 * * *",
    status: "active",
    maxRetries: 2,
    retryBackoffMs: 20,
  });

  await scheduler.runTask(task.id);
  assert.equal(runCount, 1);
  assert.ok(scheduler.retryTimers.has(task.id), "retry timer was scheduled");

  // Stop scheduler before retry fires
  scheduler.stopAll();
  assert.equal(scheduler.retryTimers.size, 0, "retry timers map cleared");

  // Wait past backoff delay
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(runCount, 1, "retry did not execute after stopAll");
});

// ---------------------------------------------------------------------
// Issue #223: TaskStore save errors propagate and trigger rollback
// ---------------------------------------------------------------------

test("Issue #223: TaskStore.set rolls back in-memory additions when save fails", (t) => {
  const { store } = makeEnv(t);

  const origSave = store.save.bind(store);
  store.save = () => {
    throw new Error("ENOSPC: no space left on device");
  };

  assert.throws(() => {
    store.set({ id: "fail-task", title: "Will Fail" });
  }, /ENOSPC/);

  assert.equal(store.get("fail-task"), undefined, "in-memory state was rolled back");

  store.save = origSave;
});

test("Issue #223: TaskStore.set rolls back in-memory updates when save fails", (t) => {
  const { store } = makeEnv(t);
  const task = store.set({ id: "update-task", title: "Original Title" });

  store.save = () => {
    throw new Error("EACCES: permission denied");
  };

  assert.throws(() => {
    store.set({ id: "update-task", title: "Mutated Title" });
  }, /EACCES/);

  assert.equal(store.get("update-task").title, "Original Title", "in-memory update was rolled back");
});

test("Issue #223: TaskStore.delete restores deleted task when save fails", (t) => {
  const { store } = makeEnv(t);
  const task = store.set({ id: "delete-task", title: "Keep Me" });

  store.save = () => {
    throw new Error("EIO: I/O error");
  };

  assert.throws(() => {
    store.delete("delete-task");
  }, /EIO/);

  assert.ok(store.get("delete-task"), "task remains in memory after delete save failure");
  assert.equal(store.get("delete-task").title, "Keep Me");
});

test("Issue #223: TaskStore.saveSettings rolls back settings on save error", (t) => {
  const { store } = makeEnv(t);
  const before = store.getSettings();

  store.save = () => {
    throw new Error("EROFS: read-only file system");
  };

  assert.throws(() => {
    store.saveSettings({ defaultTimezone: "Pacific/Honolulu" });
  }, /EROFS/);

  assert.equal(store.getSettings().defaultTimezone, before.defaultTimezone);
});

test("Issue #223: API routes return 500 when store save fails", async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  const existing = store.set({ id: "item-1", title: "Item 1", schedule: "0 9 * * *", prompt: "p", type: "llm" });

  // Simulate disk failure
  store.save = () => {
    throw new Error("ENOSPC: disk full");
  };

  // POST create task
  const createRes = mockRes();
  await handler(mockPost("/dsh-cron/tasks", { title: "New Job", schedule: "0 9 * * *", prompt: "echo", type: "llm" }), createRes);
  assert.equal(createRes.statusCode, 500);
  assert.match(createRes.payload.error, /Failed to persist task/);

  // POST duplicate task
  const dupRes = mockRes();
  await handler(mockPost(`/dsh-cron/tasks/${existing.id}/duplicate`, {}), dupRes);
  assert.equal(dupRes.statusCode, 500);
  assert.match(dupRes.payload.error, /Failed to persist duplicate/);

  // PATCH task
  const patchRes = mockRes();
  await handler(mockPatch(`/dsh-cron/tasks/${existing.id}`, { title: "New Patched Title" }), patchRes);
  assert.equal(patchRes.statusCode, 500);
  assert.match(patchRes.payload.error, /Failed to persist task patch/);

  // DELETE task
  const delRes = mockRes();
  await handler(mockDelete(`/dsh-cron/tasks/${existing.id}`), delRes);
  assert.equal(delRes.statusCode, 500);
  assert.match(delRes.payload.error, /Failed to delete task/);

  // POST import tasks
  const importRes = mockRes();
  const importDoc = {
    kind: TASK_EXPORT_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: [{ id: "imported_task", title: "Imported", schedule: "0 9 * * *", prompt: "echo", type: "llm" }],
  };
  await handler(mockPost("/dsh-cron/tasks/import", { document: importDoc, strategy: "add" }), importRes);
  assert.equal(importRes.statusCode, 500);
  assert.match(importRes.payload.error, /Import failed and was rolled back/);
  assert.equal(store.get("imported_task"), undefined, "imported task not left behind");
});

// ---------------------------------------------------------------------
// Issue #243: stopAll and shutdown synchronously flush pending saves
// ---------------------------------------------------------------------

test("Issue #243: scheduler.stopAll calls store.flushSync and writes debounced changes to disk", (t) => {
  const { store, scheduler, filePath } = makeEnv(t);

  const task = store.set({ id: "history-task", title: "History Task", schedule: "0 9 * * *" });

  // Record a run, which uses saveDebounced(500)
  store.recordRun(task.id, {
    status: "success",
    durationMs: 450,
    costUsd: 0.015,
    usage: { inputTokens: 250 },
  });

  // Verify timer is currently active
  assert.ok(store._saveTimer !== null, "debounced save timer is pending");

  // Read disk file before flushSync - cost and tokens are NOT written yet
  const fileBefore = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const diskTaskBefore = fileBefore.tasks.find((x) => x.id === task.id);
  assert.equal(diskTaskBefore.totalTokens, 0, "disk does not have new tokens yet");

  // Calling stopAll flushes synchronously
  scheduler.stopAll();

  assert.equal(store._saveTimer, null, "timer was cleared by flushSync");

  // Read disk file after stopAll - changes MUST be on disk
  const fileAfter = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const diskTaskAfter = fileAfter.tasks.find((x) => x.id === task.id);
  assert.equal(diskTaskAfter.totalTokens, 250, "tokens flushed to disk on shutdown");
  assert.equal(diskTaskAfter.totalCostUsd, 0.015, "cost flushed to disk on shutdown");
  assert.ok(fileAfter.history[task.id]?.length === 1, "history flushed to disk on shutdown");
});
