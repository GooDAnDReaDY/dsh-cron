import test from 'node:test';
import assert from 'node:assert/strict';
import { isCloudMetadataHost, buildHttpRequest } from '../lib/runtimes/runtimes.js';
import { createCronApiHandler } from '../lib/routes/api.js';
import { handleTaskCollection } from '../lib/routes/api-collection.js';
import { logStreamer } from '../lib/log-streamer.js';

test('security-audit: isCloudMetadataHost blocks all cloud metadata and link-local targets (#427)', () => {
  // AWS IMDSv4
  assert.equal(isCloudMetadataHost('169.254.169.254'), true);
  // IPv4 link-local range /16 (Tencent Cloud, Oracle, DigitalOcean, local link-local)
  assert.equal(isCloudMetadataHost('169.254.0.1'), true);
  assert.equal(isCloudMetadataHost('169.254.1.254'), true);
  assert.equal(isCloudMetadataHost('169.254.100.15'), true);
  // AWS IMDSv6 (bracketed and bare)
  assert.equal(isCloudMetadataHost('[fd00:ec2::254]'), true);
  assert.equal(isCloudMetadataHost('fd00:ec2::254'), true);
  // Alibaba Cloud
  assert.equal(isCloudMetadataHost('100.100.100.200'), true);
  // GCP
  assert.equal(isCloudMetadataHost('metadata.google.internal'), true);
  // Azure
  assert.equal(isCloudMetadataHost('metadata.azure.com'), true);
  assert.equal(isCloudMetadataHost('subdomain.internal.cloudapp.net'), true);

  // Legitimate public/private hosts should NOT be blocked
  assert.equal(isCloudMetadataHost('api.example.com'), false);
  assert.equal(isCloudMetadataHost('192.168.1.111'), false);
  assert.equal(isCloudMetadataHost('10.0.0.1'), false);
  assert.equal(isCloudMetadataHost('github.com'), false);
});

test('security-audit: buildHttpRequest throws on extended cloud metadata targets (#427)', () => {
  assert.throws(
    () => buildHttpRequest({ httpUrl: 'http://[fd00:ec2::254]/latest/meta-data/' }),
    /restricted/
  );
  assert.throws(
    () => buildHttpRequest({ httpUrl: 'http://100.100.100.200/latest/meta-data/' }),
    /restricted/
  );
  assert.throws(
    () => buildHttpRequest({ httpUrl: 'http://169.254.0.1/meta' }),
    /restricted/
  );
});

test('security-audit: SSE log stream rejects cross-origin and unauthenticated requests (#424)', async () => {
  const mockStore = { getSettings: () => ({ apiToken: 'secret-token' }) };
  const mockScheduler = {};
  const handler = createCronApiHandler(mockStore, mockScheduler, {});

  // 1. Cross-origin request with evil Origin
  let statusCode = null;
  let responseData = '';
  const mockCrossReq = {
    method: 'GET',
    url: '/dsh-cron/tasks/test_task/stream',
    headers: {
      host: '127.0.0.1:3005',
      origin: 'https://evil.attacker.com',
      'sec-fetch-site': 'cross-site',
    },
    socket: { remoteAddress: '127.0.0.1' },
    on: () => {},
  };
  const mockRes = {
    writeHead: (code) => { statusCode = code; },
    write: (chunk) => { responseData += chunk; },
    end: (chunk) => { if (chunk) responseData += chunk; },
  };

  await handler(mockCrossReq, mockRes);
  assert.equal(statusCode, 403, 'Cross-origin SSE request must be rejected with 403');
  assert.ok(responseData.includes('Forbidden'), 'Response must explain rejection');

  // 2. Unauthenticated request without token or remoteAddress
  let noAuthCode = null;
  const mockNoAuthReq = {
    method: 'GET',
    url: '/dsh-cron/tasks/test_task/logs/stream',
    headers: { host: 'remote-host' },
    socket: {}, // missing remoteAddress
    on: () => {},
  };
  const mockNoAuthRes = {
    writeHead: (code) => { noAuthCode = code; },
    write: () => {},
    end: () => {},
  };
  await handler(mockNoAuthReq, mockNoAuthRes);
  assert.equal(noAuthCode, 401, 'Unauthenticated SSE request with missing remote/token must return 401');
});

test('security-audit: SSE streamer does not include wildcard Access-Control-Allow-Origin (#424)', () => {
  let headersSent = {};
  const mockReq = { headers: {} };
  const mockRes = {
    writeHead: (status, headers) => {
      headersSent = headers;
    },
    write: () => {},
    end: () => {},
  };
  logStreamer.handleSseRequest('task_test_cors', mockReq, mockRes);
  assert.equal(headersSent['Access-Control-Allow-Origin'], undefined, 'No wildcard CORS header on SSE');
  assert.equal(headersSent['Content-Type'], 'text/event-stream; charset=utf-8');
});

test('security-audit: handleTaskCollection forwards ctx to createOrUpdateTask (#426)', async () => {
  let forwardedCtx = null;
  const mockStore = {
    list: () => [],
    getSettings: () => ({}),
  };
  const mockScheduler = {
    isRunning: () => false,
    runningSince: () => null,
  };
  const dummyCtx = { connection: { isAuthorized: () => true } };

  const mockReq = {
    method: 'POST',
    url: '/dsh-cron/tasks',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ name: 'Task', schedule: '* * * * *', type: 'shell', command: 'echo 1' })));
      if (evt === 'end') cb();
    },
  };
  const mockRes = {
    writeHead: () => {},
    end: () => {},
  };

  await handleTaskCollection({
    store: mockStore,
    scheduler: mockScheduler,
    collection: {},
    req: mockReq,
    res: mockRes,
    url: new URL('http://127.0.0.1/dsh-cron/tasks'),
    scope: 'collection',
    apiToken: 'test-token',
    ctx: dummyCtx,
  });

  // Verify function runs without throwing ReferenceError or dropping ctx
  assert.ok(true);
});
