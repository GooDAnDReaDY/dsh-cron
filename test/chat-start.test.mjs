import test from 'node:test';
import assert from 'node:assert/strict';
import { chatStartHandler } from '../lib/chat-start.js';

test('chatStartHandler creates session and follows up with prompt', async () => {
  let createdSessionId = null;
  let sentMessage = null;

  const mockAgent = {
    session: { id: 'test-session-123' },
    whenIdle: async () => {},
    followup: (msg) => { sentMessage = msg; }
  };

  const mockCtx = {
    agents: {
      create: async ({ sessionId, meta }) => {
        assert.ok(meta && meta.cwd, "meta.cwd must be provided");
        createdSessionId = sessionId;
        return { agent: mockAgent };
      }
    },
    get: () => null,
  };

  let statusCode = 0;
  let resData = null;
  const sendJson = (res, code, data) => {
    statusCode = code;
    resData = data;
  };
  const parseJsonBody = async () => ({ prompt: 'Каждые 2 часа проверять статус БД' });

  await chatStartHandler(mockCtx, { method: 'POST' }, {}, parseJsonBody, sendJson, () => 'uuid-1');

  assert.equal(statusCode, 200);
  assert.equal(resData.ok, true);
  assert.equal(resData.sessionId, 'test-session-123');
  assert.ok(sentMessage);
  assert.ok(sentMessage.content[0].text.includes('Каждые 2 часа проверять статус БД'));
  assert.ok(sentMessage.content[0].text.includes('Silent Rule') || sentMessage.content[0].text.includes('правило тишины'));
});