import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerRoutes } from '../lib/routes.js';

test('Issue #384: /dsh-cron/health route reports plugin status and task count', async () => {
  const routes = new Map();
  const mockCtx = {
    webServer: {
      register: (desc) => {
        routes.set(desc.path, desc.handler);
        return () => routes.delete(desc.path);
      }
    },
    effect: (fn) => fn()
  };

  const mockStore = {
    list: () => [{ id: 't1' }, { id: 't2' }]
  };

  registerRoutes(mockCtx, { store: mockStore, scheduler: {}, recommendations: {} });

  const healthHandler = routes.get('/dsh-cron/health');
  assert.ok(healthHandler, '/dsh-cron/health route must be registered');

  // 1. Rejects non-GET
  let postStatus = 0;
  let postBody = '';
  const postRes = {
    writeHead: (code) => { postStatus = code; },
    end: (data) => { postBody = data; }
  };
  healthHandler({ method: 'POST', headers: {} }, postRes);
  assert.equal(postStatus, 405);
  assert.equal(postBody, 'GET only');

  // 2. Returns 200 with status: ok, plugin name, and task count on GET
  let getStatus = 0;
  let getHeaders = {};
  let getBody = '';
  const getRes = {
    writeHead: (code, headers) => {
      getStatus = code;
      getHeaders = headers;
    },
    end: (data) => { getBody = data; }
  };
  healthHandler({ method: 'GET', headers: {} }, getRes);
  assert.equal(getStatus, 200);
  assert.equal(getHeaders['cache-control'], 'no-store');
  assert.equal(getHeaders['content-type'], 'application/json; charset=utf-8');

  const json = JSON.parse(getBody);
  assert.equal(json.status, 'ok');
  assert.equal(json.plugin, '@goodandready/dsh-cron');
  assert.equal(json.tasks, 2);
  assert.equal(typeof json.uptimeSec, 'number');
  assert.ok(json.uptimeSec >= 0);
});
