import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  parseJsonBody,
  isCrossOrigin,
  pickPatchableFields,
  SCRIPT_CONFIRM_HEADER,
} from '../lib/http-utils.js';

function mockReq(chunks) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

test('parseJsonBody parses JSON bodies and tolerates empty bodies', async () => {
  const ok = await parseJsonBody(mockReq(['{"a"', ':1}']));
  assert.deepEqual(ok, { a: 1 });

  const empty = await parseJsonBody(mockReq([]));
  assert.deepEqual(empty, {});
});

test('parseJsonBody rejects invalid JSON', async () => {
  await assert.rejects(() => parseJsonBody(mockReq(['{not json'])));
});

test('parseJsonBody enforces the size cap with a 413 status (#86)', async () => {
  const big = 'x'.repeat(70 * 1024);
  const req = new EventEmitter();
  const promise = parseJsonBody(req, 64 * 1024);
  let destroyed = false;
  req.destroy = () => { destroyed = true; };

  req.emit('data', big);
  req.emit('data', big);

  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, 413);
    assert.ok(err.message.includes('size'));
    return true;
  });
  assert.equal(destroyed, true, 'connection destroyed after overflow');
});

test('isCrossOrigin detects forged browser requests and allows local API clients (#86)', () => {
  // Plain local API clients send neither Origin nor Sec-Fetch-Site
  assert.equal(isCrossOrigin({ headers: {} }), false);
  assert.equal(isCrossOrigin({ headers: { host: '127.0.0.1:3080' } }), false);

  // Same-origin browser request
  assert.equal(isCrossOrigin({ headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' } }), false);

  // Forged cross-site post from a malicious page
  assert.equal(isCrossOrigin({ headers: { host: '127.0.0.1:3080', origin: 'https://evil.example' } }), true);
  assert.equal(isCrossOrigin({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' } }), true);
  assert.equal(isCrossOrigin({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-site' } }), true);

  // Sandboxed iframe sends Origin: null
  assert.equal(isCrossOrigin({ headers: { host: '127.0.0.1:3080', origin: 'null' } }), true);

  // Malformed Origin is rejected
  assert.equal(isCrossOrigin({ headers: { host: '127.0.0.1:3080', origin: '::not a url' } }), true);
});

test('pickPatchableFields whitelists task fields and blocks service-owned state (#90)', () => {
  const ALLOWED = ['title', 'schedule', 'status', 'oneShot'];
  const patch = pickPatchableFields({
    title: 'new name',
    schedule: 'every 5m',
    status: 'paused',
    oneShot: true,
    totalTokens: 999999,
    totalCostUsd: 42,
    createdAt: 0,
    lastStatus: 'success',
    nextRunAt: 12345,
    id: 'spoofed-id',
  }, ALLOWED);

  assert.deepEqual(patch, {
    title: 'new name',
    schedule: 'every 5m',
    status: 'paused',
    oneShot: true,
  });

  assert.deepEqual(pickPatchableFields(null, ALLOWED), {});
  assert.deepEqual(pickPatchableFields(undefined, ALLOWED), {});
});

test('script confirm header constant is stable for the client contract (#86)', () => {
  assert.equal(SCRIPT_CONFIRM_HEADER, 'x-dsh-cron-confirm');
});
