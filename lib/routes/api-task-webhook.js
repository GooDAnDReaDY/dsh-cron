/**
 * lib/api-task-webhook.js — Incoming HTTP Webhook Triggers (#348).
 *
 * Implements POST /dsh-cron/webhook/:taskId and POST /dsh-cron/api/webhook/:taskId.
 * Authenticates via HMAC SHA-256 signature (GitHub/Stripe style), per-task token,
 * or master apiToken, applies debouncing, parses JSON/text payload, and triggers
 * the task with variable interpolation.
 */

import crypto from 'node:crypto';
import { logger } from '../logger.js';
import { sendJson } from '../http-utils.js';

const MAX_WEBHOOK_BYTES = 512 * 1024; // 512 KiB limit
const NOT_ALLOWED = { ok: false, error: 'Method not allowed' };
const lastWebhookRuns = new Map();

/**
 * Constant-time string/buffer comparison.
 */
export function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify HMAC SHA-256 signature from headers.
 * Supports x-hub-signature-256 (sha256=...), x-signature-256, or x-dsh-cron-signature.
 */
export function verifyHmacSignature(rawBuffer, secret, signatureHeader) {
  if (!secret || !signatureHeader) return false;
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');
  const provided = String(signatureHeader).replace(/^sha256=/i, '').trim();
  return safeCompare(expectedHex, provided);
}

/**
 * Verify token from header or Bearer auth.
 * Query parameter authentication is strictly rejected to prevent token leakage in proxy logs and browser history (#358).
 */
export function verifyToken(expectedToken, req, url) {
  if (!expectedToken) return false;
  const headers = req?.headers || {};
  const headerToken = headers['x-dsh-cron-webhook-token'] || headers['x-webhook-token'];
  const authHeader = headers['authorization'];
  let bearerToken = '';
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  const candidate = headerToken || bearerToken;
  if (!candidate) return false;
  return safeCompare(expectedToken, candidate);
}

/**
 * Read request body with raw Buffer preserved for signature verification.
 */
export function readRawBody(req, limit = MAX_WEBHOOK_BYTES) {
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
        fail(Object.assign(new Error('Webhook payload exceeds 512 KiB limit'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
      let parsed = null;
      const text = raw.toString('utf8').trim();
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      } else {
        parsed = {};
      }
      resolve({ raw, parsed });
    });

    req.on('error', (err) => {
      fail(Object.assign(err, { statusCode: 400 }));
    });
  });
}

/**
 * Handle incoming webhook request for a task.
 */
export async function handleTaskWebhookRoute({ store, scheduler, req, res, taskId: explicitTaskId }) {
  if (req.method !== 'POST') {
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  let taskId = explicitTaskId;
  if (!taskId) {
    const parts = url.pathname.split('/').filter(Boolean);
    // /dsh-cron/webhook/:taskId or /dsh-cron/api/webhook/:taskId
    const webhookIdx = parts.indexOf('webhook');
    if (webhookIdx !== -1 && parts[webhookIdx + 1]) {
      taskId = parts[webhookIdx + 1];
    }
  }

  if (!taskId) {
    sendJson(res, 400, { ok: false, error: 'Task ID is required in webhook URL path' });
    return;
  }

  const task = store.get(taskId);
  if (!task) {
    sendJson(res, 404, { ok: false, error: `Task "${taskId}" not found` });
    return;
  }

  if (task.status !== 'active') {
    sendJson(res, 400, { ok: false, error: `Task "${taskId}" is not active (current status: ${task.status})` });
    return;
  }

  const isEnabled = Boolean(
    task.webhookEnabled ||
    (task.webhookTrigger && task.webhookTrigger.enabled)
  );
  if (!isEnabled) {
    logger.warn(`[dsh-cron] Webhook received for task "${taskId}" but webhooks are not enabled for this task`);
    sendJson(res, 403, { ok: false, error: `Webhooks are not enabled for task "${taskId}"` });
    return;
  }

  // Read raw body
  let bodyData;
  try {
    bodyData = await readRawBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { ok: false, error: err.message });
    return;
  }

  const { raw, parsed } = bodyData;
  const headers = req.headers || {};
  const settings = typeof store.getSettings === 'function' ? store.getSettings() : {};

  // Authentication check (fail-closed)
  const taskSecret = task.webhookSecret || (task.webhookTrigger && task.webhookTrigger.secret);
  const taskToken = task.webhookToken || (task.webhookTrigger && task.webhookTrigger.token);
  const masterToken = settings.apiToken;

  let authenticated = false;

  if (taskSecret) {
    const sigHeader = headers['x-hub-signature-256'] || headers['x-signature-256'] || headers['x-dsh-cron-signature'];
    if (sigHeader && verifyHmacSignature(raw, taskSecret, sigHeader)) {
      authenticated = true;
    } else {
      logger.warn(`[dsh-cron] Invalid HMAC signature for webhook task "${taskId}"`);
      sendJson(res, 401, { ok: false, error: 'Invalid HMAC signature' });
      return;
    }
  } else if (taskToken) {
    if (verifyToken(taskToken, req, url)) {
      authenticated = true;
    } else {
      logger.warn(`[dsh-cron] Invalid webhook token for task "${taskId}"`);
      sendJson(res, 401, { ok: false, error: 'Invalid webhook token' });
      return;
    }
  } else if (masterToken) {
    if (verifyToken(masterToken, req, url)) {
      authenticated = true;
    } else {
      logger.warn(`[dsh-cron] Invalid API token for webhook task "${taskId}"`);
      sendJson(res, 401, { ok: false, error: 'Unauthorized: missing or invalid token' });
      return;
    }
  } else {
    logger.warn(`[dsh-cron] Webhook task "${taskId}" rejected: no secret or token configured (fail-closed)`);
    sendJson(res, 403, { ok: false, error: 'Webhook secret or token must be configured for security' });
    return;
  }

  // Debounce check
  const debounceMs = Math.max(0, Number(task.webhookDebounceMs || (task.webhookTrigger && task.webhookTrigger.debounceMs) || 0));
  if (debounceMs > 0) {
    const now = Date.now();
    const last = lastWebhookRuns.get(taskId) || 0;
    if (now - last < debounceMs) {
      logger.info(`[dsh-cron] Webhook for task "${taskId}" debounced (${now - last}ms < ${debounceMs}ms)`);
      sendJson(res, 200, { ok: true, debounced: true, message: `Webhook debounced (${debounceMs}ms cooldown)` });
      return;
    }
    lastWebhookRuns.set(taskId, now);
  } else {
    lastWebhookRuns.set(taskId, Date.now());
  }

  const query = Object.fromEntries(url.searchParams.entries());
  const webhookPayload = {
    body: parsed,
    raw: raw.toString('utf8'),
    headers,
    query,
  };

  logger.info(`[dsh-cron] Webhook accepted for task "${taskId}", triggering execution`);

  try {
    const runPromise = scheduler.triggerManualRun(taskId, {
      webhook: webhookPayload,
      triggeredBy: 'webhook',
    });

    sendJson(res, 200, {
      ok: true,
      triggered: true,
      taskId,
      message: `Webhook received and task "${task.title}" triggered`,
    });
  } catch (runErr) {
    logger.error(`[dsh-cron] Failed to trigger task "${taskId}" from webhook: ${runErr.message}`);
    sendJson(res, 500, { ok: false, error: `Failed to trigger task: ${runErr.message}` });
  }
}
