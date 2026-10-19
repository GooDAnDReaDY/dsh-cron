import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import { createCronApiHandler } from '../lib/api.js';
import {
  isTrustedRequest,
  getRequestRejection,
  rejectCrossOrigin,
  getConnection,
  getDshConnection,
} from '../lib/http-utils.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

function makeEnv(t) {
  const filePath = path.join(
    os.tmpdir(),
    `dsh-cron-sec357-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  const store = new TaskStore(filePath);
  t.after(() => {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {}
  });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = headers;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(payload) {
      this.payload = payload ? JSON.parse(payload) : null;
    },
  };
}

function mockReqStream(bodyObj, options = {}) {
  const req = new EventEmitter();
  req.method = options.method || 'POST';
  req.url = options.url || '/dsh-cron/tasks';
  req.headers = options.headers || {};
  if (options.socket !== undefined) {
    req.socket = options.socket;
  }
  if (options.connectionService !== undefined) {
    req.connectionService = options.connectionService;
  }
  const chunks = bodyObj !== undefined ? [Buffer.from(JSON.stringify(bodyObj), 'utf8')] : [];
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

test('Issue #357: getRequestRejection rejects requests without socket and token (fail-closed)', () => {
  // Request with missing socket and no auth token -> 401
  const reqNoSocket = { method: 'GET', url: '/dsh-cron/tasks', headers: {} };
  assert.equal(getRequestRejection(reqNoSocket), 401);
  assert.equal(isTrustedRequest(reqNoSocket), false);

  // Request with invalid token -> 401
  const reqBadToken = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    headers: { authorization: 'Bearer wrong-token' },
  };
  assert.equal(getRequestRejection(reqBadToken, { apiToken: 'expected-token' }), 401);
  assert.equal(isTrustedRequest(reqBadToken, { apiToken: 'expected-token' }), false);

  // Remote non-loopback IP without token -> 403
  const reqRemote = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    socket: { remoteAddress: '203.0.113.50' },
    headers: {},
  };
  assert.equal(getRequestRejection(reqRemote), 403);
  assert.equal(isTrustedRequest(reqRemote), false);

  // Remote non-loopback IP with forged Origin -> 403
  const reqRemoteForged = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    socket: { remoteAddress: '203.0.113.50' },
    headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' },
  };
  assert.equal(getRequestRejection(reqRemoteForged), 403);
  assert.equal(isTrustedRequest(reqRemoteForged), false);

  // Verified loopback caller without DSH connection service -> admitted
  const reqLoopback = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
  };
  assert.equal(getRequestRejection(reqLoopback), undefined);
  assert.equal(isTrustedRequest(reqLoopback), true);

  // Valid Bearer token from remote IP -> admitted
  const reqTokenAuth = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    socket: { remoteAddress: '203.0.113.50' },
    headers: { authorization: 'Bearer super-secret-token' },
  };
  assert.equal(getRequestRejection(reqTokenAuth, { apiToken: 'super-secret-token' }), undefined);
  assert.equal(isTrustedRequest(reqTokenAuth, { apiToken: 'super-secret-token' }), true);
});

test('Issue #357: DSH connection service rejection (401 and 403) is strictly enforced', () => {
  // Connection service reports 401 (unauthenticated session)
  const mockConn401 = {
    requestRejection: () => 401,
  };
  const req = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    headers: {},
  };
  assert.equal(getRequestRejection(req, { connection: mockConn401 }), 401);
  assert.equal(isTrustedRequest(req, { connection: mockConn401 }), false);

  // Connection service reports 403 (untrusted host / CSRF)
  const mockConn403 = {
    requestRejection: () => 403,
  };
  assert.equal(getRequestRejection(req, { connection: mockConn403 }), 403);
  assert.equal(isTrustedRequest(req, { connection: mockConn403 }), false);

  // Connection service admits (undefined rejection) -> admitted
  const mockConnAdmitted = {
    requestRejection: () => undefined,
  };
  assert.equal(getRequestRejection(req, { connection: mockConnAdmitted }), undefined);
  assert.equal(isTrustedRequest(req, { connection: mockConnAdmitted }), true);

  // Valid API token overrides connection service 401
  const reqWithToken = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    headers: { authorization: 'Bearer my-api-token' },
  };
  assert.equal(getRequestRejection(reqWithToken, { connection: mockConn401, apiToken: 'my-api-token' }), undefined);
  assert.equal(isTrustedRequest(reqWithToken, { connection: mockConn401, apiToken: 'my-api-token' }), true);

  // But connection service 403 (CSRF/Host mismatch) cannot be bypassed by token
  assert.equal(getRequestRejection(reqWithToken, { connection: mockConn403, apiToken: 'my-api-token' }), 403);
  assert.equal(isTrustedRequest(reqWithToken, { connection: mockConn403, apiToken: 'my-api-token' }), false);
});

test('Issue #357: GET /dsh-cron/tasks without socket and token answers 401', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  const unauthenticatedReq = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    headers: {},
    // Notice: NO socket property
  };
  const res = mockRes();
  await handler(unauthenticatedReq, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.ok, false);
  assert.match(res.payload.error, /Unauthorized: authentication required/);
});

test('Issue #357: POST /dsh-cron/tasks cannot create shell/script tasks without authentication (RCE prevented)', async (t) => {
  const { store, scheduler } = makeEnv(t);
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  // Unauthenticated attacker attempts to create a script task executing malicious command
  const maliciousReq = mockReqStream(
    {
      title: 'Malicious Remote Task',
      schedule: '* * * * *',
      prompt: 'rm -rf /',
      type: 'script',
      command: 'echo pwned > /tmp/pwned.txt',
    },
    {
      method: 'POST',
      url: '/dsh-cron/tasks',
      headers: {
        'x-dsh-cron-confirm': 'script',
      },
      // Missing socket (wrapped / remote caller)
    }
  );

  const res = mockRes();
  await handler(maliciousReq, res);

  // Must be rejected with 401 before body is parsed or task is created
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.ok, false);
  assert.equal(store.list().length, 0, 'No task must be created by unauthenticated caller');
});

test('Issue #357: Authenticated caller with valid Bearer token can read and create tasks', async (t) => {
  const { store, scheduler } = makeEnv(t);
  store.saveSettings({ apiToken: 'secret-master-token' });
  const handler = createCronApiHandler(store, scheduler, { recommendations: [] });

  // 1. GET with valid token
  const authedGet = {
    method: 'GET',
    url: '/dsh-cron/tasks',
    socket: { remoteAddress: '203.0.113.50' },
    headers: {
      authorization: 'Bearer secret-master-token',
    },
  };
  const getRes = mockRes();
  await handler(authedGet, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.payload.ok, true);

  // 2. POST with valid token
  const authedPost = mockReqStream(
    {
      title: 'Legitimate Remote Task',
      schedule: '0 8 * * *',
      prompt: 'Summarize news',
      type: 'llm',
    },
    {
      method: 'POST',
      url: '/dsh-cron/tasks',
      socket: { remoteAddress: '203.0.113.50' },
      headers: {
        authorization: 'Bearer secret-master-token',
      },
    }
  );
  const postRes = mockRes();
  await handler(authedPost, postRes);
  assert.equal(postRes.statusCode, 200);
  assert.equal(postRes.payload.ok, true);
  assert.equal(store.list().length, 1);
});
