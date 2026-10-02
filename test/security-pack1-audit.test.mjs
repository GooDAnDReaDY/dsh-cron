import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTelegramWebhook } from '../lib/api-webhook.js';
import { handleTelegramCommand } from '../lib/telegram-commands.js';
import { hasCodeExecutingTask, isCodeExecutingTask, planImport } from '../lib/task-transfer.js';
import { applyTaskPatch } from '../lib/task-patch.js';
import { buildInvocation, buildDockerInvocation } from '../lib/runtimes.js';
import { resolveCwd } from '../lib/runner-worktree.js';
import { SessionRunner } from '../lib/runner.js';
import { SCRIPT_CONFIRM_HEADER } from '../lib/http-utils.js';

function createMockRes() {
  let statusCode = 200;
  let payload = null;
  const headers = {};
  return {
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    writeHead(code) { statusCode = code; },
    end(data) {
      if (data) {
        try {
          payload = JSON.parse(data);
        } catch {
          payload = data;
        }
      }
    },
    get statusCode() { return statusCode; },
    get payload() { return payload; },
    get headers() { return headers; },
  };
}

function createMockReq({ method = 'POST', headers = {}, body = null }) {
  const json = body ? JSON.stringify(body) : '';
  const handlers = {};
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    on(ev, cb) {
      handlers[ev] = cb;
      if (ev === 'data' && json) {
        process.nextTick(() => {
          cb(Buffer.from(json));
          if (handlers['end']) handlers['end']();
        });
      } else if (ev === 'end' && !json) {
        process.nextTick(() => cb());
      }
      return this;
    }
  };
}

// =========================================================================
// ISSUE #208: Telegram Webhook Authentication & Authorization
// =========================================================================

test('Issue #208: webhook rejects requests when secret token is configured but missing or invalid', async () => {
  const store = {
    getSettings: () => ({ telegramWebhookSecret: 'top-secret-token', chatId: '12345' }),
    get: () => null,
  };
  const scheduler = {};

  // 1. Missing secret token header -> 401
  const reqNoSecret = createMockReq({
    body: { message: { text: '/status', chat: { id: 12345 } } }
  });
  const resNoSecret = createMockRes();
  await handleTelegramWebhook({ store, scheduler, req: reqNoSecret, res: resNoSecret });
  assert.equal(resNoSecret.statusCode, 401);
  assert.equal(resNoSecret.payload.ok, false);

  // 2. Invalid secret token header -> 401
  const reqBadSecret = createMockReq({
    headers: { 'x-telegram-bot-api-secret-token': 'wrong-token' },
    body: { message: { text: '/status', chat: { id: 12345 } } }
  });
  const resBadSecret = createMockRes();
  await handleTelegramWebhook({ store, scheduler, req: reqBadSecret, res: resBadSecret });
  assert.equal(resBadSecret.statusCode, 401);
  assert.equal(resBadSecret.payload.ok, false);

  // 3. Valid secret token header -> passes secret check
  const reqGoodSecret = createMockReq({
    headers: { 'x-telegram-bot-api-secret-token': 'top-secret-token' },
    body: { message: { text: '/status', chat: { id: 12345 } } }
  });
  const resGoodSecret = createMockRes();
  await handleTelegramWebhook({ store, scheduler, req: reqGoodSecret, res: resGoodSecret });
  assert.equal(resGoodSecret.statusCode, 200);
});

test('Issue #208: webhook fails closed when allowedChatId is empty or sender does not match', async () => {
  const store = {
    getSettings: () => ({ chatId: '' }), // Empty allowlist
    get: () => null,
  };
  const scheduler = {};

  // Empty allowlist must deny control (403 Forbidden)
  const req = createMockReq({
    body: { message: { text: '/status', chat: { id: 12345 }, from: { id: 12345 } } }
  });
  const res = createMockRes();
  await handleTelegramWebhook({ store, scheduler, req, res });
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.ok, false);
});

test('Issue #208: callback query pause rejects modifying config-owned tasks', async () => {
  let paused = false;
  const task = { id: 'cfg-1', title: 'Config Task', source: 'config', status: 'active' };
  const store = {
    getSettings: () => ({ chatId: '12345' }),
    get: (id) => (id === 'cfg-1' ? task : null),
  };
  const scheduler = {
    pauseTask: () => { paused = true; },
  };

  const req = createMockReq({
    body: {
      callback_query: {
        id: 'cb-1',
        data: 'cron:pause:cfg-1',
        from: { id: 12345 },
        message: { chat: { id: 12345 } }
      }
    }
  });
  const res = createMockRes();
  await handleTelegramWebhook({ store, scheduler, req, res });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.ok, false);
  assert.match(res.payload.error, /Cannot modify config-owned task/);
  assert.equal(paused, false, 'scheduler.pauseTask should not be called');
});

test('Issue #208: text command /pause rejects modifying config-owned tasks', async () => {
  let paused = false;
  const task = { id: 'cfg-1', title: 'Config Task', source: 'config', status: 'active' };
  const store = {
    get: (id) => (id === 'cfg-1' ? task : null),
    list: () => [task],
  };
  const scheduler = {
    pauseTask: () => { paused = true; },
  };

  const result = await handleTelegramCommand({
    store,
    scheduler,
    text: '/pause cfg-1',
    chatId: '12345',
    botToken: 'fake-token',
    fetchFn: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Cannot modify config-owned task/);
  assert.equal(paused, false);
});

test('Issue #208: webhook deduplicates duplicate update_id', async () => {
  const store = {
    getSettings: () => ({ chatId: '12345' }),
    get: () => null,
  };
  const scheduler = {};

  const makeReq = () => createMockReq({
    body: { update_id: 998877, message: { text: '/status', chat: { id: 12345 } } }
  });

  const res1 = createMockRes();
  await handleTelegramWebhook({ store, scheduler, req: makeReq(), res: res1 });
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.payload.duplicate, undefined);

  const res2 = createMockRes();
  await handleTelegramWebhook({ store, scheduler, req: makeReq(), res: res2 });
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.payload.duplicate, true);
});

// =========================================================================
// ISSUE #212: Code Confirmation for Shell Hooks and Preflight
// =========================================================================

test('Issue #212: hasCodeExecutingTask detects shell hooks on LLM and HTTP tasks', () => {
  const llmPlain = { type: 'llm', prompt: 'Summarise' };
  const llmWithPreflight = { type: 'llm', prompt: 'Summarise', preflightType: 'command', preflightCommand: 'git pull' };
  const llmWithSelfHealing = { type: 'llm', prompt: 'Summarise', selfHealingCommand: 'npm run heal' };
  const httpWithHook = { type: 'http', httpUrl: 'https://example.com', command: 'curl test' };

  assert.equal(hasCodeExecutingTask([llmPlain]), false);
  assert.equal(hasCodeExecutingTask([llmWithPreflight]), true);
  assert.equal(hasCodeExecutingTask([llmWithSelfHealing]), true);
  assert.equal(hasCodeExecutingTask([httpWithHook]), true);

  assert.equal(isCodeExecutingTask(llmPlain), false);
  assert.equal(isCodeExecutingTask(llmWithPreflight), true);
  assert.equal(isCodeExecutingTask(llmWithSelfHealing), true);
  assert.equal(isCodeExecutingTask(httpWithHook), true);
});

test('Issue #212: applyTaskPatch rejects introducing selfHealingCommand without confirmation', () => {
  const current = { id: 'task-1', type: 'llm', title: 'AI Task', prompt: 'Help' };
  const store = {
    get: (id) => (id === 'task-1' ? current : null),
    set: (t) => t,
  };
  const scheduler = { scheduleTask: () => {}, pauseTask: () => {} };

  // Attempt to add selfHealingCommand without allowCodeSwitch -> needs confirmation
  const resDenied = applyTaskPatch({
    store,
    scheduler,
    id: 'task-1',
    body: { selfHealingCommand: 'rm -rf /tmp/cache' },
    allowCodeSwitch: false,
  });
  assert.equal(resDenied.ok, false);
  assert.equal(resDenied.needsConfirmation, true);

  // With allowCodeSwitch: true -> accepted
  const resAllowed = applyTaskPatch({
    store,
    scheduler,
    id: 'task-1',
    body: { selfHealingCommand: 'rm -rf /tmp/cache' },
    allowCodeSwitch: true,
  });
  assert.equal(resAllowed.ok, true);
  assert.equal(resAllowed.task.selfHealingCommand, 'rm -rf /tmp/cache');
});

// =========================================================================
// ISSUE #226: Docker Runtime Environment Isolation
// =========================================================================

test('Issue #226: buildInvocation for docker runtime isolates container and does not leak host secrets', () => {
  const hostEnv = {
    SECRET_TEST: 'dummy-secret-key-12345',
    API_TOKEN: 'super-sensitive-host-token',
    PATH: '/usr/bin:/bin',
    HOME: '/root',
    TZ: 'UTC',
  };

  const task = {
    type: 'docker',
    dockerImage: 'alpine:latest',
    prompt: 'echo hello',
    env: {
      TASK_VAR: 'custom-task-value',
      REMOVED_VAR: null,
    }
  };

  const inv = buildInvocation(task, '/tmp', hostEnv);
  const argsJoined = inv.args.join(' ');

  // Must include explicit task variables
  assert.match(argsJoined, /-e TASK_VAR=custom-task-value/);

  // Must NOT leak host secrets
  assert.doesNotMatch(argsJoined, /dummy-secret/);
  assert.doesNotMatch(argsJoined, /super-sensitive/);
  assert.doesNotMatch(argsJoined, /SECRET_TEST/);
  assert.doesNotMatch(argsJoined, /API_TOKEN/);

  // PATH and HOME must not be overridden
  assert.doesNotMatch(argsJoined, /-e PATH=/);
  assert.doesNotMatch(argsJoined, /-e HOME=/);

  // Null values must not be passed
  assert.doesNotMatch(argsJoined, /REMOVED_VAR/);
});

// =========================================================================
// ISSUE #231: Worktree & Workspace Fail-Closed
// =========================================================================

test('Issue #231: resolveCwd throws when explicit workspaceId cannot be resolved (fail-closed)', () => {
  const task = { id: 't1', workspaceId: 'missing-workspace-id' };
  const ctx = {
    get: (name) => {
      if (name === 'workspaces') return { get: () => null };
      return null;
    }
  };

  assert.throws(
    () => resolveCwd(task, ctx),
    /Workspace "missing-workspace-id" requested by task could not be resolved/
  );
});

test('Issue #231: SessionRunner._resolveRunContext rejects when worktree creation fails (fail-closed)', async () => {
  const runner = new SessionRunner({ get: () => null });
  runner.resolveCwd = () => '/tmp/intended-workspace';
  runner.createTaskWorktree = async () => {
    throw new Error('fatal: cannot create worktree (disk full)');
  };

  const task = { id: 't-wt', title: 'Worktree Task', worktree: true };

  await assert.rejects(
    async () => runner._resolveRunContext(task),
    /fatal: cannot create worktree/
  );
});
