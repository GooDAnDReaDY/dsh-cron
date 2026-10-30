import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRequestRejection,
  isTrustedRequest,
  isDesktopShellRequest,
  hasNonLoopbackForwarding,
  hasDshAuthCookie,
} from '../lib/http-utils.js';

test('Issue GH #20: hasNonLoopbackForwarding detects proxied remote IP headers', () => {
  assert.equal(hasNonLoopbackForwarding({ headers: {} }), false);
  assert.equal(hasNonLoopbackForwarding({ headers: { 'x-forwarded-for': '127.0.0.1' } }), false);
  assert.equal(hasNonLoopbackForwarding({ headers: { 'x-forwarded-for': '::1' } }), false);
  assert.equal(hasNonLoopbackForwarding({ headers: { 'x-forwarded-for': '127.0.0.1, ::1' } }), false);

  assert.equal(hasNonLoopbackForwarding({ headers: { 'x-forwarded-for': '203.0.113.100' } }), true);
  assert.equal(hasNonLoopbackForwarding({ headers: { 'x-forwarded-for': '127.0.0.1, 203.0.113.1' } }), true);
  assert.equal(hasNonLoopbackForwarding({ headers: { 'x-real-ip': '203.0.113.100' } }), true);
});

test('Issue GH #20: hasDshAuthCookie identifies DSH session cookie', () => {
  assert.equal(hasDshAuthCookie(null), false);
  assert.equal(hasDshAuthCookie({ headers: {} }), false);
  assert.equal(hasDshAuthCookie({ headers: { cookie: 'other=123' } }), false);
  assert.equal(hasDshAuthCookie({ headers: { cookie: 'dsh-auth-session=valid-token; foo=bar' } }), true);
});

test('Issue GH #20: isDesktopShellRequest verifies authentic local Desktop environment', () => {
  // Loopback + User-Agent with dsh-desktop
  const reqDesktopUa = {
    headers: {
      host: '127.0.0.1:3000',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) @deepseek-ai/dsh-desktop/0.2.1-rc.3 Chrome/120.0',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(isDesktopShellRequest(reqDesktopUa), true);

  // Loopback + dsh-auth- cookie
  const reqCookie = {
    headers: {
      host: 'localhost:3000',
      cookie: 'dsh-auth-session=token123',
    },
    socket: { remoteAddress: '::1' },
  };
  assert.equal(isDesktopShellRequest(reqCookie), true);

  // Loopback + Host: app (dsh-app protocol in Electron)
  const reqHostApp = {
    headers: {
      host: 'app',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(isDesktopShellRequest(reqHostApp), true);

  // Non-loopback remote address must be rejected fail-closed
  const reqRemote = {
    headers: {
      host: '127.0.0.1:3000',
      'user-agent': '@deepseek-ai/dsh-desktop/0.2.1-rc.3',
    },
    socket: { remoteAddress: '203.0.113.200' },
  };
  assert.equal(isDesktopShellRequest(reqRemote), false);

  // Forwarded from non-loopback IP must be rejected fail-closed
  const reqForwarded = {
    headers: {
      host: '127.0.0.1:3000',
      'user-agent': '@deepseek-ai/dsh-desktop/0.2.1-rc.3',
      'x-forwarded-for': '203.0.113.50',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(isDesktopShellRequest(reqForwarded), false);
});

test('Issue GH #20: getRequestRejection admits DSH Desktop mutating requests without Origin/Referer', () => {
  // POST /dsh-cron/settings from Desktop shell
  const reqSettings = {
    method: 'POST',
    url: '/dsh-cron/settings',
    headers: {
      host: '127.0.0.1:3000',
      'user-agent': 'Mozilla/5.0 @deepseek-ai/dsh-desktop/0.2.1-rc.3',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getRequestRejection(reqSettings), undefined, 'POST /settings admitted for Desktop shell');
  assert.equal(isTrustedRequest(reqSettings), true);

  // POST /dsh-cron/telegram/test from Desktop shell with Host: app
  const reqTgTest = {
    method: 'POST',
    url: '/dsh-cron/telegram/test',
    headers: {
      host: 'app',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getRequestRejection(reqTgTest), undefined, 'POST /telegram/test admitted for Host: app on loopback');

  // POST /dsh-cron/settings without Origin/Referer from normal non-desktop caller is rejected 403 (Issue #371)
  const reqNonDesktop = {
    method: 'POST',
    url: '/dsh-cron/settings',
    headers: {
      host: '127.0.0.1:3000',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getRequestRejection(reqNonDesktop), 403, 'Normal caller without Origin/Referer is rejected 403');

  // POST with spoofed Desktop headers over LAN proxy is rejected 403 fail-closed
  const reqSpoofed = {
    method: 'POST',
    url: '/dsh-cron/settings',
    headers: {
      host: '127.0.0.1:3000',
      'user-agent': '@deepseek-ai/dsh-desktop/0.2.1-rc.3',
      'x-forwarded-for': '203.0.113.150',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getRequestRejection(reqSpoofed), 403, 'Spoofed Desktop request over LAN is rejected 403');

  // POST with Origin: 'null' from Desktop shell is admitted
  const reqNullOriginDesktop = {
    method: 'POST',
    url: '/dsh-cron/settings',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'null',
      'user-agent': '@deepseek-ai/dsh-desktop/0.2.1-rc.3',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getRequestRejection(reqNullOriginDesktop), undefined, 'Origin: null admitted from desktop shell');

  // POST with Origin: 'null' without Desktop shell is rejected 403
  const reqNullOriginOther = {
    method: 'POST',
    url: '/dsh-cron/settings',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'null',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(getRequestRejection(reqNullOriginOther), 403, 'Origin: null without desktop shell is rejected 403');
});
