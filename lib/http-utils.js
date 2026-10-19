/**
 * HTTP helpers shared by the dsh-cron REST routes.
 * The plugin is served from the local DSH web UI, so mutating endpoints
 * accept only same-origin browser requests (Issue #86) and bounded bodies.
 */

export const MAX_BODY_BYTES = 1024 * 1024;
export const SCRIPT_CONFIRM_HEADER = 'x-dsh-cron-confirm';
export const REDACTED_SECRET = '[REDACTED]';

/**
 * Check if an IP address is a local loopback address.
 */
export function isLoopbackAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1' ||
    addr === 'localhost'
  );
}

/**
 * Extract bearer authorization or custom token from request headers.
 */
export function extractBearerToken(req) {
  const auth = req?.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const custom = req?.headers?.['x-dsh-cron-token'];
  if (typeof custom === 'string') {
    return custom.trim();
  }
  return '';
}

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
 * Safe helper to get the DSH connection service from context or request (#357).
 */
export function getConnection(ctx) {
  if (!ctx) return null;
  return Reflect.get(ctx, 'connection') || ctx.connection || null;
}

export function getDshConnection(req, options = {}) {
  if (options.connection) return options.connection;
  if (options.ctx) {
    const conn = getConnection(options.ctx);
    if (conn) return conn;
  }
  if (req) {
    if (req.connectionService) return req.connectionService;
    if (req.ctx) {
      const conn = getConnection(req.ctx);
      if (conn) return conn;
    }
  }
  return null;
}

/**
 * Determine if an incoming request should be rejected, and with which HTTP status (401 or 403).
 * Returns undefined if the request is admitted, or 401 / 403 if rejected (#357).
 *
 * Rules:
 * 1. If DSH connection service is available, consult its admission first.
 *    - Connection service rejection 403 (untrusted Host / Origin / CSRF) is strictly rejected.
 *    - Connection service admission (undefined rejection) admits the request (browser session / Peer).
 * 2. Token authentication: valid Bearer token matching options.apiToken, DSH_AUTH_TOKEN or DSH_TOKEN.
 * 3. Local loopback caller: 127.0.0.1 or ::1 when connection service is not bound (standalone/CLI/test).
 * 4. FAIL-CLOSED: if connection service is bound, request must have DSH admission or valid API token.
 *    If connection service is not bound, request must have valid API token or verified loopback IP.
 *    Requests with missing socket / missing remoteAddress and no token are rejected (401).
 * 5. Origin and Sec-Fetch-Site: cannot be null, Origin host must match Host, Sec-Fetch-Site must be same-origin or none.
 */
export function getRequestRejection(req, options = {}) {
  if (!req) return 403;

  // 1. Validate Origin header if present: cannot be null, must match Host (CSRF guard)
  const headers = req.headers || {};
  const origin = headers.origin;
  const host = headers.host || '';
  if (origin !== undefined) {
    if (origin === 'null' || !origin) return 403;
    try {
      const parsed = new URL(origin);
      if (!parsed.host || !host || parsed.host !== host) return 403;
    } catch {
      return 403;
    }
  }

  // 2. Validate Sec-Fetch-Site header if present
  const site = headers['sec-fetch-site'];
  if (site !== undefined) {
    if (site !== 'same-origin' && site !== 'none') {
      return 403;
    }
  }

  // 3. Check DSH connection service if available (#357)
  const conn = getDshConnection(req, options);
  let connRejection;
  if (conn && typeof conn.requestRejection === 'function') {
    connRejection = conn.requestRejection(req);
    if (connRejection === 403) {
      return 403;
    }
  }

  // 4. Check token authentication
  const token = extractBearerToken(req);
  const expectedToken = options.apiToken || process.env.DSH_AUTH_TOKEN || process.env.DSH_TOKEN;
  const isTokenAuthenticated = Boolean(expectedToken && token && token === expectedToken);

  // If DSH connection service admitted the request (undefined rejection)
  const isConnectionAdmitted = Boolean(conn && connRejection === undefined);

  // Check loopback address
  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress;
  const hasRemote = Boolean(remote && typeof remote === 'string');
  const isLoopback = Boolean(hasRemote && isLoopbackAddress(remote));

  // FAIL-CLOSED AUTHENTICATION CHECK (#357):
  if (conn) {
    if (!isConnectionAdmitted && !isTokenAuthenticated) {
      return connRejection === 403 ? 403 : 401;
    }
  } else {
    if (!isTokenAuthenticated && !isLoopback) {
      if (token || !hasRemote) {
        return 401;
      }
      return 403;
    }
  }

  return undefined; // Admitted
}

/**
 * Validate that an incoming request originates from a trusted local caller,
 * an admitted DSH browser session, or an authenticated client (Issue #86, #357).
 */
export function isTrustedRequest(req, options = {}) {
  return getRequestRejection(req, options) === undefined;
}

/**
 * Backward-compatible helper for checking cross-origin browser headers (Origin / Sec-Fetch-Site).
 */
export function isCrossOrigin(req, options) {
  if (!req) return true;
  const headers = req.headers || {};
  const origin = headers.origin;
  const host = headers.host || '';
  if (origin !== undefined) {
    if (origin === 'null' || !origin) return true;
    try {
      const parsed = new URL(origin);
      if (!parsed.host || !host || parsed.host !== host) return true;
    } catch {
      return true;
    }
  }

  const site = headers['sec-fetch-site'];
  if (site !== undefined) {
    if (site !== 'same-origin' && site !== 'none') {
      return true;
    }
  }
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

export function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function rejectCrossOrigin(req, res, options = {}) {
  const rejection = getRequestRejection(req, options);
  if (rejection !== undefined) {
    const errorMsg = rejection === 401
      ? 'Unauthorized: authentication required'
      : 'Forbidden: untrusted or cross-origin request';
    sendJson(res, rejection, { ok: false, error: errorMsg });
    return true;
  }
  return false;
}

export async function readBody(req, res) {
  try {
    return { body: await parseJsonBody(req) };
  } catch (err) {
    sendJson(res, err.statusCode || 400, { ok: false, error: err.message });
    return { error: true };
  }
}

/**
 * Redact sensitive fields (env, httpHeaders, httpBody) from task records before returning in GET responses (Issue #86).
 */
export function redactTaskSecrets(task) {
  if (!task || typeof task !== 'object') return task;
  // Issue #310 / GH #5: sanitize to lossless JSON by omitting any undefined properties
  const clone = {};
  for (const [k, v] of Object.entries(task)) {
    if (v !== undefined) {
      clone[k] = v;
    }
  }

  if (clone.env && typeof clone.env === 'object') {
    const redactedEnv = {};
    for (const [k, v] of Object.entries(clone.env)) {
      redactedEnv[k] = v ? REDACTED_SECRET : v;
    }
    clone.env = redactedEnv;
  }

  if (clone.httpHeaders) {
    if (typeof clone.httpHeaders === 'object' && clone.httpHeaders !== null) {
      const redactedHeaders = {};
      for (const [k, v] of Object.entries(clone.httpHeaders)) {
        redactedHeaders[k] = v ? REDACTED_SECRET : v;
      }
      clone.httpHeaders = redactedHeaders;
    } else if (typeof clone.httpHeaders === 'string') {
      try {
        const parsed = JSON.parse(clone.httpHeaders);
        if (parsed && typeof parsed === 'object') {
          const redactedHeaders = {};
          for (const [k, v] of Object.entries(parsed)) {
            redactedHeaders[k] = v ? REDACTED_SECRET : v;
          }
          clone.httpHeaders = JSON.stringify(redactedHeaders);
        } else {
          clone.httpHeaders = REDACTED_SECRET;
        }
      } catch {
        clone.httpHeaders = REDACTED_SECRET;
      }
    }
  }

  if (clone.httpBody) {
    clone.httpBody = REDACTED_SECRET;
  }
  if (clone.webhookToken) {
    clone.webhookToken = REDACTED_SECRET;
  }
  if (clone.webhookSecret) {
    clone.webhookSecret = REDACTED_SECRET;
  }

  return clone;
}

/**
 * Restore redacted secret fields from the existing record when updating a task (Issue #86).
 */
export function restoreTaskSecrets(incoming, current) {
  if (!incoming || typeof incoming !== 'object' || !current || typeof current !== 'object') {
    return incoming;
  }
  const restored = { ...incoming };

  // Restore env values
  if (restored.env && typeof restored.env === 'object' && current.env && typeof current.env === 'object') {
    const mergedEnv = { ...restored.env };
    for (const [k, v] of Object.entries(mergedEnv)) {
      if (v === REDACTED_SECRET && current.env[k] !== undefined) {
        mergedEnv[k] = current.env[k];
      }
    }
    restored.env = mergedEnv;
  }

  // Restore httpHeaders values
  if (restored.httpHeaders && current.httpHeaders) {
    if (typeof restored.httpHeaders === 'object' && typeof current.httpHeaders === 'object') {
      const mergedHeaders = { ...restored.httpHeaders };
      for (const [k, v] of Object.entries(mergedHeaders)) {
        if (v === REDACTED_SECRET && current.httpHeaders[k] !== undefined) {
          mergedHeaders[k] = current.httpHeaders[k];
        }
      }
      restored.httpHeaders = mergedHeaders;
    } else if (typeof restored.httpHeaders === 'string') {
      try {
        const parsedRestored = JSON.parse(restored.httpHeaders);
        const parsedCurrent = typeof current.httpHeaders === 'object'
          ? current.httpHeaders
          : JSON.parse(current.httpHeaders);
        if (parsedRestored && typeof parsedRestored === 'object' && parsedCurrent && typeof parsedCurrent === 'object') {
          for (const [k, v] of Object.entries(parsedRestored)) {
            if (v === REDACTED_SECRET && parsedCurrent[k] !== undefined) {
              parsedRestored[k] = parsedCurrent[k];
            }
          }
          restored.httpHeaders = JSON.stringify(parsedRestored);
        }
      } catch {
        if (restored.httpHeaders === REDACTED_SECRET) {
          restored.httpHeaders = current.httpHeaders;
        }
      }
    }
  }

  // Restore httpBody value
  if (restored.httpBody === REDACTED_SECRET && current.httpBody !== undefined) {
    restored.httpBody = current.httpBody;
  }

  if (restored.webhookToken === REDACTED_SECRET && current.webhookToken !== undefined) {
    restored.webhookToken = current.webhookToken;
  }
  if (restored.webhookSecret === REDACTED_SECRET && current.webhookSecret !== undefined) {
    restored.webhookSecret = current.webhookSecret;
  }
  return restored;
}
