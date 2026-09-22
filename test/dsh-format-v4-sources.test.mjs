import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRunner } from '../lib/runner.js';
import { chatStartHandler } from '../lib/chat-start.js';
import { askModel } from '../lib/llm-ask.js';

// Best-effort loader for official format v4 validator
let assertV4RowAdmission = null;
try {
  const v4Module = await import(
    '/home/vadim/.nvm/versions/node/v24.15.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-format-v3-to-v4/lib/index.js'
  );
  if (typeof v4Module.assertV4RowAdmission === 'function') {
    assertV4RowAdmission = v4Module.assertV4RowAdmission;
  }
} catch {
  // Standalone environment fallback
}

/** Standalone validator mirroring DSH format-v4 message source contract */
function assertV4MessageSource(message) {
  assert.ok(message && typeof message === 'object', 'message must be an object');
  const source = message.source;
  assert.ok(source && typeof source === 'object' && !Array.isArray(source), 'message.source must be an object');
  assert.equal(typeof source.kind, 'string', 'source.kind must be a string');
  assert.ok(source.kind.length > 0, 'source.kind must be non-empty');
  assert.notEqual(source.kind, 'plugin', 'format v4 message requires a producer-owned source kind');
  assert.equal(source.kind, 'plugin:dsh-cron', 'format v4 producer kind must be plugin:dsh-cron');
  assert.equal(source.plugin, undefined, 'format v4 message source must not declare legacy plugin property');

  if (assertV4RowAdmission) {
    const row = {
      type: 'user/message',
      data: message,
    };
    assert.doesNotThrow(() => assertV4RowAdmission(row), 'must pass official DSH assertV4RowAdmission');
  }
}

test('DSH format-v4 contract: scheduled execution uses producer-owned source kind', async () => {
  let followedUpMessage = null;

  const mockAgent = {
    session: { id: 'scheduled-cron-session-1' },
    whenIdle: async () => {},
    followup: (msg) => { followedUpMessage = msg; },
  };

  const mockCtx = {
    agents: {
      create: async () => ({ agent: mockAgent }),
      resume: async () => { throw new Error('should not resume'); },
    },
    get: () => null,
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'scheduled-task-1',
    title: 'Scheduled Health Check',
    prompt: 'Check cluster health',
    type: 'llm',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.ok(followedUpMessage, 'followup message must be dispatched');
  assertV4MessageSource(followedUpMessage);
  assert.equal(followedUpMessage.source.form, 'cron-execute');
});

test('DSH format-v4 contract: resumed execution uses producer-owned source kind', async () => {
  let followedUpMessage = null;

  const mockAgent = {
    session: { id: 'resumed-session-42' },
    whenIdle: async () => {},
    followup: (msg) => { followedUpMessage = msg; },
  };

  const mockCtx = {
    agents: {
      create: async () => { throw new Error('should not create'); },
      resume: async () => ({ agent: mockAgent }),
    },
    get: () => null,
  };

  const runner = new SessionRunner(mockCtx);
  const task = {
    id: 'resumed-task-1',
    title: 'Resumed Audit',
    prompt: 'Continue audit investigation',
    type: 'llm',
    targetSessionId: 'resumed-session-42',
    targetSessionReset: 'never',
  };

  const res = await runner.execute(task);
  assert.ok(res);
  assert.ok(followedUpMessage, 'followup message must be dispatched');
  assertV4MessageSource(followedUpMessage);
  assert.equal(followedUpMessage.source.form, 'cron-execute');
});

test('DSH format-v4 contract: chat/start interactive followup uses producer-owned source kind', async () => {
  let followedUpMessage = null;

  const mockAgent = {
    session: { id: 'chat-session-77' },
    whenIdle: async () => {},
    followup: (msg) => { followedUpMessage = msg; },
  };

  const mockCtx = {
    agents: {
      create: async () => ({ agent: mockAgent }),
    },
    get: () => null,
  };

  let statusCode = 0;
  let resData = null;
  const sendJson = (res, code, data) => {
    statusCode = code;
    resData = data;
  };
  const parseJsonBody = async () => ({ prompt: 'РќР°СЃС‚СЂРѕР№ РµР¶РµС‡Р°СЃРЅС‹Р№ Р±СЌРєР°Рї' });

  await chatStartHandler(mockCtx, { method: 'POST' }, {}, parseJsonBody, sendJson, () => 'uuid-chat');

  assert.equal(statusCode, 200);
  assert.equal(resData.ok, true);
  assert.ok(followedUpMessage, 'followup message must be dispatched');
  assertV4MessageSource(followedUpMessage);
  assert.equal(followedUpMessage.source.form, 'cron-setup');
});

test('DSH format-v4 contract: helper LLM ask message uses producer-owned source kind', async () => {
  let capturedMessages = null;

  const mockCtx = {
    llm: {
      stream(opts) {
        capturedMessages = opts.messages;
        return (async function* () {
          yield { type: 'text-delta', text: '{"notify":true}' };
          yield { type: 'finish', reason: { kind: 'stop' } };
        })();
      },
    },
  };

  const result = await askModel(mockCtx, {
    provider: 'test-p',
    model: 'test-m',
    prompt: 'Check output urgency',
  });

  assert.equal(result.ok, true);
  assert.ok(capturedMessages && capturedMessages.length > 0);
  const msg = capturedMessages[0];
  assertV4MessageSource(msg);
  assert.equal(msg.source.form, 'helper-call');
});

test('DSH format-v4 contract: legacy retired wrapper { kind: "plugin" } fails validation', () => {
  const legacyMessage = {
    role: 'user',
    content: [{ type: 'text', text: 'Run task' }],
    source: { kind: 'plugin', plugin: 'dsh-cron', form: 'cron-execute' },
  };

  assert.throws(
    () => assertV4MessageSource(legacyMessage),
    /format v4 message requires a producer-owned source kind/
  );
});
