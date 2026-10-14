import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { validateRunResult } from '../lib/validators.js';
import { handleRunArtifactRoutes, handleChainRoutes, registerRoutes } from '../lib/routes.js';
import { createMetricsHandler } from '../lib/metrics.js';
import { TaskStore } from '../lib/store.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      if (headers) Object.assign(this.headers, headers);
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(data) {
      if (data !== undefined && data !== null) {
        this.body = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      }
    },
  };
  return res;
}

function mockReq({ method = 'GET', url = '/', headers = {}, remoteAddress = '127.0.0.1' }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1:3000', ...headers };
  req.socket = { remoteAddress };
  req.connection = { remoteAddress };
  return req;
}

test('Issue #337 Item 3: lib/validators.js boundary check includes path.sep to prevent prefix bypass', (t) => {
  const tmpRoot = path.join(os.tmpdir(), `dsh-cron-val-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const baseDir = path.join(tmpRoot, 'store');
  const siblingDir = path.join(tmpRoot, 'store_sibling');

  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(siblingDir, { recursive: true });
  t.after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  fs.writeFileSync(path.join(baseDir, 'valid.txt'), 'hello world', 'utf8');
  fs.writeFileSync(path.join(siblingDir, 'secret.txt'), 'super-secret-password', 'utf8');

  // 1. Valid file inside baseDir passes
  const validTask = {
    validators: [{ type: 'file', path: 'valid.txt', mustExist: true }]
  };
  const validRes = validateRunResult(validTask, {}, { workspaceDir: baseDir });
  assert.equal(validRes.ok, true);
  assert.equal(validRes.status, 'passed');

  // 2. Traversal into sibling directory with shared string prefix MUST escape boundary and fail
  const escapeTask = {
    validators: [{ type: 'file', path: '../store_sibling/secret.txt', mustExist: true }]
  };
  const escapeRes = validateRunResult(escapeTask, {}, { workspaceDir: baseDir });
  assert.equal(escapeRes.ok, false);
  assert.equal(escapeRes.status, 'failed');
  assert.ok(escapeRes.error.includes('escapes allowed directory boundary'), 'Must report directory escape error');

  // 3. Traversal outside tmpRoot completely MUST escape boundary and fail
  const deepEscapeTask = {
    validators: [{ type: 'file', path: '../../../../../../etc/passwd', mustExist: false }]
  };
  const deepRes = validateRunResult(deepEscapeTask, {}, { workspaceDir: baseDir });
  assert.equal(deepRes.ok, false);
  assert.equal(deepRes.status, 'failed');
  assert.ok(deepRes.error.includes('escapes allowed directory boundary'));
});

test('Issue #337 Item 1: handleRunArtifactRoutes enforces Bearer token & blocks untrusted/cross-origin', async (t) => {
  const dbFile = path.join(os.tmpdir(), `dsh-cron-store-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(dbFile);
  t.after(() => {
    try { fs.rmSync(dbFile, { force: true }); } catch {}
  });

  store.saveSettings({ apiToken: 'test-audit-token-337' });

  // 1. Untrusted remote IP without token -> 403 Forbidden
  const unauthReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/runs/run_999/artifacts',
    remoteAddress: '203.0.113.10'
  });
  const unauthRes = mockRes();
  await handleRunArtifactRoutes(store, unauthReq, unauthRes);
  assert.equal(unauthRes.statusCode, 403);
  assert.ok(unauthRes.body.includes('Forbidden'), 'Untrusted remote caller must receive 403');

  // 2. Cross-origin browser caller -> 403 Forbidden
  const crossReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/runs/run_999/artifacts',
    headers: { origin: 'https://evil-site.com', 'sec-fetch-site': 'cross-site' },
    remoteAddress: '127.0.0.1'
  });
  const crossRes = mockRes();
  await handleRunArtifactRoutes(store, crossReq, crossRes);
  assert.equal(crossRes.statusCode, 403);

  // 3. Remote caller with valid Bearer token -> 200 OK (authorized, empty list)
  const authReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/runs/run_999/artifacts',
    headers: { authorization: 'Bearer test-audit-token-337' },
    remoteAddress: '203.0.113.10'
  });
  const authRes = mockRes();
  await handleRunArtifactRoutes(store, authReq, authRes);
  assert.equal(authRes.statusCode, 200);
  const data = JSON.parse(authRes.body);
  assert.equal(data.ok, true);
  assert.deepEqual(data.artifacts, []);

  // 4. Local loopback caller -> 200 OK
  const localReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/runs/run_999/artifacts',
    remoteAddress: '127.0.0.1'
  });
  const localRes = mockRes();
  await handleRunArtifactRoutes(store, localReq, localRes);
  assert.equal(localRes.statusCode, 200);
});

test('Issue #337 Item 2: GET /recipes, /heartbeat, and /metrics reject cross-origin & untrusted callers', async (t) => {
  const dbFile = path.join(os.tmpdir(), `dsh-cron-store-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(dbFile);
  t.after(() => {
    try { fs.rmSync(dbFile, { force: true }); } catch {}
  });

  store.saveSettings({ apiToken: 'test-audit-token-337' });
  const scheduler = { runningCount: () => 0, getRunCounters: () => ({}) };

  const registeredRoutes = new Map();
  const mockCtx = {
    effect(fn) { fn(); },
    webServer: {
      register({ path: routePath, handler }) {
        registeredRoutes.set(routePath, handler);
      }
    }
  };
  registerRoutes(mockCtx, { store, scheduler, recommendations: [] });

  const recipesHandler = registeredRoutes.get('/dsh-cron/recipes');
  const heartbeatHandler = registeredRoutes.get('/dsh-cron/heartbeat');
  assert.ok(recipesHandler, 'recipes route must be registered');
  assert.ok(heartbeatHandler, 'heartbeat route must be registered');

  // --- /recipes ---
  // Remote without token -> 403
  const rRemoteReq = mockReq({ method: 'GET', url: '/dsh-cron/recipes', remoteAddress: '203.0.113.5' });
  const rRemoteRes = mockRes();
  await recipesHandler(rRemoteReq, rRemoteRes);
  assert.equal(rRemoteRes.statusCode, 403);

  // Cross-origin -> 403
  const rCrossReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/recipes',
    headers: { origin: 'https://evil.attacker.org', 'sec-fetch-site': 'cross-site' },
    remoteAddress: '127.0.0.1'
  });
  const rCrossRes = mockRes();
  await recipesHandler(rCrossReq, rCrossRes);
  assert.equal(rCrossRes.statusCode, 403);

  // Local loopback -> 200
  const rLocalReq = mockReq({ method: 'GET', url: '/dsh-cron/recipes', remoteAddress: '127.0.0.1' });
  const rLocalRes = mockRes();
  await recipesHandler(rLocalReq, rLocalRes);
  assert.equal(rLocalRes.statusCode, 200);

  // --- /heartbeat ---
  // Remote without token -> 403
  const hRemoteReq = mockReq({ method: 'GET', url: '/dsh-cron/heartbeat', remoteAddress: '203.0.113.5' });
  const hRemoteRes = mockRes();
  await heartbeatHandler(hRemoteReq, hRemoteRes);
  assert.equal(hRemoteRes.statusCode, 403);

  // Cross-origin -> 403
  const hCrossReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/heartbeat',
    headers: { origin: 'https://evil.attacker.org', 'sec-fetch-site': 'cross-site' },
    remoteAddress: '127.0.0.1'
  });
  const hCrossRes = mockRes();
  await heartbeatHandler(hCrossReq, hCrossRes);
  assert.equal(hCrossRes.statusCode, 403);

  // Local loopback -> 200
  const hLocalReq = mockReq({ method: 'GET', url: '/dsh-cron/heartbeat', remoteAddress: '127.0.0.1' });
  const hLocalRes = mockRes();
  await heartbeatHandler(hLocalReq, hLocalRes);
  assert.equal(hLocalRes.statusCode, 200);

  // --- /metrics ---
  const metricsHandler = createMetricsHandler({ store, scheduler });

  // Remote without token -> 403
  const mRemoteReq = mockReq({ method: 'GET', url: '/dsh-cron/metrics', remoteAddress: '203.0.113.5' });
  const mRemoteRes = mockRes();
  await metricsHandler(mRemoteReq, mRemoteRes);
  assert.equal(mRemoteRes.statusCode, 403);

  // Cross-origin -> 403
  const mCrossReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/metrics',
    headers: { origin: 'https://evil.attacker.org', 'sec-fetch-site': 'cross-site' },
    remoteAddress: '127.0.0.1'
  });
  const mCrossRes = mockRes();
  await metricsHandler(mCrossReq, mCrossRes);
  assert.equal(mCrossRes.statusCode, 403);

  // Local loopback scraper -> 200
  const mLocalReq = mockReq({ method: 'GET', url: '/dsh-cron/metrics', remoteAddress: '127.0.0.1' });
  const mLocalRes = mockRes();
  await metricsHandler(mLocalReq, mLocalRes);
  assert.equal(mLocalRes.statusCode, 200);
  assert.ok(mLocalRes.body.includes('dsh_cron_tasks_total'));
});

test('Issue #337 Item 1 & 2: handleChainRoutes guards both GET and POST against untrusted callers', async (t) => {
  const dbFile = path.join(os.tmpdir(), `dsh-cron-store-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new TaskStore(dbFile);
  t.after(() => {
    try { fs.rmSync(dbFile, { force: true }); } catch {}
  });

  store.saveSettings({ apiToken: 'test-audit-token-337' });
  const scheduler = { runningCount: () => 0 };

  // 1. GET chains from remote without token -> 403
  const getRemoteReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/chains/chain_123',
    remoteAddress: '203.0.113.5'
  });
  const getRemoteRes = mockRes();
  await handleChainRoutes(store, scheduler, getRemoteReq, getRemoteRes);
  assert.equal(getRemoteRes.statusCode, 403);

  // 2. GET chains with cross-origin -> 403
  const getCrossReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/chains/chain_123',
    headers: { origin: 'https://evil.attacker.org', 'sec-fetch-site': 'cross-site' },
    remoteAddress: '127.0.0.1'
  });
  const getCrossRes = mockRes();
  await handleChainRoutes(store, scheduler, getCrossReq, getCrossRes);
  assert.equal(getCrossRes.statusCode, 403);

  // 3. GET chains from local loopback -> 200
  const getLocalReq = mockReq({
    method: 'GET',
    url: '/dsh-cron/chains/chain_123',
    remoteAddress: '127.0.0.1'
  });
  const getLocalRes = mockRes();
  await handleChainRoutes(store, scheduler, getLocalReq, getLocalRes);
  assert.equal(getLocalRes.statusCode, 200);

  // 4. POST chain retry from remote without token -> 403
  const postRemoteReq = mockReq({
    method: 'POST',
    url: '/dsh-cron/chains/chain_123/retry-from/step_1',
    remoteAddress: '203.0.113.5'
  });
  const postRemoteRes = mockRes();
  await handleChainRoutes(store, scheduler, postRemoteReq, postRemoteRes);
  assert.equal(postRemoteRes.statusCode, 403);
});
