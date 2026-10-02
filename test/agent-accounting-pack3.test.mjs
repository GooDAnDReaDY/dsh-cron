import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionRunner } from "../lib/runner.js";
import { TaskStore } from "../lib/store.js";
import { TaskScheduler } from "../lib/scheduler.js";
import { checkTaskBudgetLimits, calculateRollingCost } from "../lib/burn-guard.js";
import { executeLlmActionDirectives, parseLlmActionDirectives } from "../lib/llm-actions.js";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dsh-cron-pack3-"));
}

test("Issue #227: _executeAgentTurn extracts assistant output from turn events and isolates history", async () => {
  const runner = new SessionRunner({
    get: () => null,
  });

  const sessionEvents = [
    // Prior history from earlier turns
    { type: "assistant/message", data: { message: { content: [{ type: "text", text: "Old message from past turn" }] } } },
  ];

  let seqCounter = 1; // startSeq will be 1
  const session = {
    id: "session-123",
    get seq() { return seqCounter; },
    log: sessionEvents,
    snapshotEvents(fromSeq) {
      return sessionEvents.slice(fromSeq);
    }
  };

  const fakeAgent = {
    session,
    whenIdle: async () => {},
    followup: () => {
      // Simulate new events produced during this turn
      sessionEvents.push(
        { type: "assistant/chunk", data: { turn: 1, step: 0, chunk: { type: "text", text: "New " } } },
        { type: "assistant/message", data: { turn: 1, step: 0, message: { content: [{ type: "text", text: "assistant response" }] }, usage: { inputTokens: 50, outputTokens: 25 } } }
      );
      seqCounter = sessionEvents.length;
    }
  };

  const handle = { agent: fakeAgent };
  const task = { id: "t1", title: "Test Turn Output", type: "llm" };
  const prep = {
    model: "deepseek-chat",
    agentPrompt: "hello",
    targetSessionId: null,
    raceAbort: (p) => p,
    createUserMessage: (m) => m,
    handle,
  };

  const result = await runner._executeAgentTurn(task, prep, handle, false);
  assert.equal(result.output, "assistant response");
  assert.ok(!result.output.includes("Old message from past turn"), "Past turn history must not be included");
  assert.equal(result.usage.inputTokens, 50);
  assert.equal(result.usage.outputTokens, 25);
  assert.ok(result.costUsd > 0, "Cost should be calculated");
});

test("Issue #227: _executeAgentTurn fails when turn/end reports error or interruption", async () => {
  const runner = new SessionRunner({ get: () => null });
  const sessionEvents = [];
  const session = {
    id: "session-err",
    seq: 0,
    snapshotEvents: () => sessionEvents,
    log: sessionEvents,
  };

  const fakeAgent = {
    session,
    whenIdle: async () => {},
    followup: () => {
      sessionEvents.push({
        type: "turn/end",
        data: {
          reason: { kind: "error", message: "Model context overflowed or rate limited" }
        }
      });
    }
  };

  const handle = { agent: fakeAgent };
  const task = { id: "t2", title: "Failing Turn Task", type: "llm" };
  const prep = {
    model: "deepseek-chat",
    agentPrompt: "do task",
    raceAbort: (p) => p,
    createUserMessage: (m) => m,
    handle,
  };

  await assert.rejects(
    () => runner._executeAgentTurn(task, prep, handle, false),
    (err) => {
      assert.ok(err.message.includes("Model context overflowed") || err.turnFailed);
      return true;
    }
  );
});

test("Issue #228: _extractUsage sums events including streaming chunks, finalized message, and paid failed attempts", () => {
  const runner = new SessionRunner({ get: () => null });

  const turnEvents = [
    // Failed attempt 1 (paid tokens)
    {
      type: "assistant/attempt",
      data: { turn: 1, step: 0, attempt: 1, failed: true, usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 5 } }
    },
    // Streaming usage chunk for final attempt
    {
      type: "assistant/chunk",
      data: { turn: 1, step: 0, chunk: { type: "usage", usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 10 } } }
    },
    // Finalized assistant message (overwrites intermediate chunk for step 0)
    {
      type: "assistant/message",
      data: { turn: 1, step: 0, usage: { inputTokens: 120, outputTokens: 40, cacheReadTokens: 10 } }
    }
  ];

  const usage = runner._extractUsage({ agent: {} }, turnEvents);
  // Total: failed attempt (100 in, 10 out, 5 cache) + final message (120 in, 40 out, 10 cache) = 220 in, 50 out, 15 cache
  assert.equal(usage.inputTokens, 220);
  assert.equal(usage.outputTokens, 50);
  assert.equal(usage.cacheReadTokens, 15);
});

test("Issue #221: Rolling 24h cost ledger preserves expenses across >100 runs archive rotation and restarts", () => {
  const tmpDir = makeTmpDir();
  const storePath = path.join(tmpDir, "tasks.json");
  const store = new TaskStore(storePath);

  const task = {
    id: "task-heavy",
    title: "Heavy Frequent Task",
    dailyCostLimitUsd: 1.0,
    status: "active",
    costLedger: [],
  };
  store.set(task);

  // Record 110 runs in the last hour, each costing $0.01 (Total = $1.10)
  const now = Date.now();
  for (let i = 0; i < 110; i++) {
    store.recordRun("task-heavy", {
      at: now - (110 - i) * 1000,
      status: "success",
      durationMs: 50,
      costUsd: 0.01,
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0 },
    });
  }

  // Active history should be capped at 100
  const activeRuns = store.history.get("task-heavy");
  assert.equal(activeRuns.length, 100);

  // Archive should contain the 10 overflow runs
  const archivePath = path.join(tmpDir, "tasks-history-archive.json");
  assert.ok(fs.existsSync(archivePath), "Archive file must exist");
  const archive = JSON.parse(fs.readFileSync(archivePath, "utf8"));
  assert.equal(archive["task-heavy"].length, 10);

  // Rolling ledger on task object must retain all 110 runs
  const storedTask = store.get("task-heavy");
  assert.equal(storedTask.costLedger.length, 110);
  const rollingCost = calculateRollingCost(storedTask);
  assert.equal(rollingCost, 1.10);

  // Burn Guard must detect budget breach ($1.10 >= $1.00 daily limit)
  const guard = checkTaskBudgetLimits(storedTask, activeRuns);
  assert.equal(guard.exceeded, true);
  assert.equal(guard.type, "dailyCostLimitUsd");

  // Restart store from disk and verify costLedger persists
  store.flushSync();
  const restartedStore = new TaskStore(storePath);
  const reloadedTask = restartedStore.get("task-heavy");
  assert.equal(reloadedTask.costLedger.length, 110);
  assert.equal(calculateRollingCost(reloadedTask), 1.10);

  const guardAfterRestart = checkTaskBudgetLimits(reloadedTask, restartedStore.history.get("task-heavy") || []);
  assert.equal(guardAfterRestart.exceeded, true);
});

test("Issue #216: Concurrency and overlap queue preserve chainDepth and prev context", async () => {
  const tmpDir = makeTmpDir();
  const store = new TaskStore(path.join(tmpDir, "tasks.json"));

  store.set({
    id: "task-concur",
    title: "Concurrency Task",
    status: "active",
    overlapPolicy: "queue",
    type: "script",
    command: "echo test",
  });

  const executedOptions = [];
  const scheduler = new TaskScheduler(store, {
    maxConcurrent: 1,
    executeFn: async (task, opts) => {
      executedOptions.push({ taskId: task.id, ...opts });
      // Keep running briefly so second run is queued
      await new Promise((r) => setTimeout(r, 60));
      return { status: "success", output: "done" };
    }
  });

  // Start run 1 with context
  const p1 = scheduler.runTask("task-concur", { chainDepth: 1, prevOutput: "output-1", prevTaskId: "root-task" });

  // Concurrently attempt run 2 with different context (will be queued by overlapPolicy: queue)
  await new Promise((r) => setTimeout(r, 10));
  const p2 = scheduler.runTask("task-concur", { chainDepth: 2, prevOutput: "output-2", prevTaskId: "task-concur" });

  await Promise.all([p1, p2]);
  // Wait for queued run to complete
  await new Promise((r) => setTimeout(r, 100));

  scheduler.stopAll();

  assert.equal(executedOptions.length, 2);
  assert.equal(executedOptions[0].chainDepth, 1);
  assert.equal(executedOptions[0].prevOutput, "output-1");
  assert.equal(executedOptions[1].chainDepth, 2);
  assert.equal(executedOptions[1].prevOutput, "output-2");
});

test("Issue #218: Croner scheduled runs deliver ticks to overlap policy without protect suppression", async () => {
  const tmpDir = makeTmpDir();
  const store = new TaskStore(path.join(tmpDir, "tasks.json"));

  store.set({
    id: "cron-overlap",
    title: "Cron Overlap Task",
    status: "active",
    schedule: "* * * * * *", // every second
    overlapPolicy: "replace",
    type: "script",
    command: "sleep 2",
  });

  const scheduler = new TaskScheduler(store, {
    executeFn: async () => ({ status: "success", output: "ok" })
  });

  // Schedule task
  scheduler.scheduleTask(store.get("cron-overlap"));
  const job = scheduler.jobs.get("cron-overlap");
  assert.ok(job, "Cron job should be registered");

  // In Croner, protect option is false/undefined, enabling tick handlers to fire
  // Verify Croner instance was constructed without protect: true
  assert.notEqual(job.options.protect, true);

  scheduler.stopAll();
});

test("Issue #230: Structured LLM action trigger_task enforces chain depth limit", async () => {
  const tmpDir = makeTmpDir();
  const store = new TaskStore(path.join(tmpDir, "tasks.json"));

  store.set({
    id: "task-loop",
    title: "Loop Task",
    status: "active",
    type: "llm",
  });

  const triggeredCalls = [];
  const fakeScheduler = {
    runNow: async (targetId, options) => {
      triggeredCalls.push({ targetId, options });
    }
  };

  const directives = parseLlmActionDirectives(`
    Agent result text.
    \`\`\`json
    { "dsh_action": "trigger_task", "taskId": "task-loop" }
    \`\`\`
  `);

  assert.equal(directives.length, 1);

  // Depth 0 -> should trigger next task at depth 1
  const res1 = await executeLlmActionDirectives({
    directives,
    task: { id: "task-loop", title: "Loop Task" },
    runInfo: { output: "done", status: "success" },
    scheduler: fakeScheduler,
    store,
    settings: { llmActionsEnabled: true },
    options: { chainDepth: 0 },
  });

  assert.equal(res1[0].status, "triggered");
  assert.equal(triggeredCalls.length, 1);
  assert.equal(triggeredCalls[0].options.chainDepth, 1);

  // Depth 4 (at maximum recursion depth limit) -> must be rejected
  const res2 = await executeLlmActionDirectives({
    directives,
    task: { id: "task-loop", title: "Loop Task" },
    runInfo: { output: "done", status: "success" },
    scheduler: fakeScheduler,
    store,
    settings: { llmActionsEnabled: true },
    options: { chainDepth: 4 },
  });

  assert.equal(res2[0].status, "rejected");
  assert.ok(res2[0].error.includes("limit reached"));
  assert.equal(triggeredCalls.length, 1, "Must not trigger beyond recursion limit");
});