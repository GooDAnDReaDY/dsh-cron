/**
 * HTTP helpers shared by the dsh-cron REST routes.
 * The plugin is served from the local DSH web UI, so mutating endpoints
 * accept only same-origin browser requests (Issue #86) and bounded bodies.
 */

export const MAX_BODY_BYTES = 1024 * 1024;
export const SCRIPT_CONFIRM_HEADER = 'x-dsh-cron-confirm';

/**
 * Parse a JSON request body with a hard byte size cap.
 * Chunks are accumulated as Buffers so multi-byte UTF-8 characters split
 * across chunk boundaries decode correctly (#106, #97 follow-up).
 * Rejects with err.statusCode = 413 when the body exceeds the limit.
 */
export function parseJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buf.length;
      if (bytes > limit) {
        fail(Object.assign(new Error('Request body exceeds the allowed size'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', fail);
  });
}

/**
 * Detect cross-origin (drive-by/CSRF) requests.
 * Browsers attach Origin to every non-GET request and Sec-Fetch-Site on
 * modern fetches; plain local API clients (curl, server-side calls) send
 * neither and stay allowed.
 */
export function isCrossOrigin(req) {
  const headers = req.headers || {};
  const origin = headers.origin;
  if (origin !== undefined) {
    if (origin === 'null') return true;
    try {
      const parsed = new URL(origin);
      const host = headers.host || '';
      if (parsed.host && parsed.host !== host) return true;
    } catch (err) {
      return true;
    }
  }
  const site = headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return true;
  return false;
}

/**
 * Extract only whitelisted task fields from a PATCH body so that
 * service-owned state (stats, timestamps) cannot be overwritten (Issue #90).
 */
export function pickPatchableFields(body, allowed) {
  const patch = {};
  if (!body || typeof body !== 'object') return patch;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      patch[key] = body[key];
    }
  }
  return patch;
}
