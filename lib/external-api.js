/**
 * External REST surface under /dsh-cron/api/* (#54, ADR-0001).
 *
 * Everything a browser panel needs stays on the local, cross-origin-protected
 * routes; this prefix exists for CI and host-side automation, so it is the only
 * surface guarded by a bearer token. The token lives in the plugin settings as
 * a masked value: an unconfigured token disables the surface (503) instead of
 * leaving it open, and a wrong token is answered with 401.
 *
 * The operations themselves are shared with the panel routes (lib/api.js), so
 * the confirmation gate for code-executing tasks and the config-owned refusals
 * apply here exactly as they do over HTTP from the UI.
 */

import { timingSafeEqual } from 'node:crypto';
import { sendJson } from './http-utils.js';
import { handleExternalTaskRequest } from './api.js';

/** Settings key that holds the bearer token. */
export const API_TOKEN_SETTING_KEY = 'apiToken';

/** Route prefix owned by this surface. */
export const EXTERNAL_API_PREFIX = '/dsh-cron/api';

/**
 * Constant-time token comparison. Length is compared first because
 * timingSafeEqual throws on buffers of different sizes; a length mismatch is
 * not a secret worth hiding for a fixed-length token.
 */
export function tokenMatches(expected, provided) {
  if (!expected || !provided) return false;
  const a = Buffer.from(String(expected), 'utf8');
  const b = Buffer.from(String(provided), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Bearer token of a request, or an empty string when there is none. */
export function readBearerToken(req) {
  const header = String((req.headers && req.headers.authorization) || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

/**
 * Guard the external prefix, then hand the request to the shared task
 * operations. `getToken` is read per request so a settings change applies
 * without a restart.
 */
export function createExternalApiHandler({ store, scheduler, getToken }) {
  return async function handleExternalApi(req, res) {
    const expected = typeof getToken === 'function' ? getToken() : '';
    if (!expected) {
      sendJson(res, 503, {
        ok: false,
        error: 'External API is disabled: set the "' + API_TOKEN_SETTING_KEY + '" setting to enable it',
      });
      return;
    }
    if (!tokenMatches(expected, readBearerToken(req))) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    // `url` must be inside the try: a malformed body (an unparseable schedule,
    // for example) surfaces as a thrown error from the shared handlers, and an
    // unhandled rejection here would answer nothing at all.
    try {
      await handleExternalTaskRequest({ store, scheduler, req, res, url });
    } catch (err) {
      sendJson(res, (err && err.statusCode) || 500, { ok: false, error: (err && err.message) || String(err) });
    }
  };
}
