/**
 * Credential handling for dsh-cron (#51).
 *
 * Settings store only the NAME of a credential (an environment-variable-style
 * reference); the value is resolved at send time through the DSH credentials
 * service, with an environment fallback. This mirrors the pattern already
 * used by dsh-clinebot and dsh-agentrouter.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOKEN_LIKE = /^[A-Za-z0-9:_-]{24,}$/;

export function isCredentialRefName(value) {
  return REF_PATTERN.test(String(value || '').trim());
}

/** Heuristic: a pasted secret instead of a credential name. */
export function looksLikeSecret(value) {
  const s = String(value || '').trim();
  if (!s || isCredentialRefName(s)) return false;
  return TOKEN_LIKE.test(s);
}

/**
 * Validate a credential-reference field. Returns { ok, name } or
 * { ok: false, error } with actionable text for the settings card.
 */
export function credentialRefStatus(value) {
  const name = String(value || '').trim();
  if (!name) return { ok: true, name: '' };
  if (looksLikeSecret(name)) {
    return {
      ok: false,
      error: 'That looks like a secret value. Store it in DSH credentials and enter only the credential name (for example CRON_TELEGRAM_BOT_TOKEN).',
    };
  }
  if (!isCredentialRefName(name)) {
    return { ok: false, error: 'Credential name must look like an environment variable name, e.g. CRON_TELEGRAM_BOT_TOKEN.' };
  }
  return { ok: true, name };
}

/** Resolve a credential through the harness service, then the environment. */
export async function resolveCredentialValue(ctx, refName) {
  const name = String(refName || '').trim();
  if (!name) return null;
  try {
    const creds = (ctx && typeof ctx.get === 'function' ? ctx.get('credentials') : null)
      || (ctx && ctx.credentials);
    if (creds && typeof creds.resolve === 'function') {
      // Prefer the harness ref factory; fall back to the plain name when the
      // package is not installed (keeps tests and trimmed builds working).
      let ref = name;
      try {
        const mod = await import('@deepseek-ai/dsh-credentials');
        if (mod && typeof mod.credentialRef === 'function') ref = mod.credentialRef(name);
      } catch {}
      const hit = await creds.resolve(ref);
      if (hit && hit.value) return String(hit.value);
    }
  } catch {
    // credentials service unavailable — fall back to the environment
  }
  const fromEnv = process.env[name];
  return fromEnv ? String(fromEnv) : null;
}

/** Read the best-effort Telegram defaults from the messenger-gateway file. */
function readGatewayToken() {
  try {
    const p = path.join(process.env.HOME || os.homedir(), '.dsh', 'settings.yaml');
    if (!fs.existsSync(p)) return null;
    const text = fs.readFileSync(p, 'utf-8');
    const lines = text.split('\n');
    let inside = false;
    for (const line of lines) {
      if (/^[^\s#]/.test(line)) inside = line.startsWith('dsh-messenger-gateway:');
      if (!inside) continue;
      const hit = /^[ \t]+botToken:[ \t]*(.+?)[ \t]*$/.exec(line);
      if (hit) return hit[1].replace(/^['"]|['"]$/g, '').trim() || null;
    }
  } catch {}
  return null;
}

/**
 * Resolve the Telegram delivery secrets for a run.
 * Precedence: credential reference → legacy stored token → messenger-gateway
 * settings file → environment variable.
 */
export async function resolveTelegramSecrets(ctx, settings = {}) {
  const out = { botToken: '', chatId: '', tokenSource: 'none' };

  const fromRef = await resolveCredentialValue(ctx, settings.botTokenRef);
  if (fromRef) {
    out.botToken = fromRef;
    out.tokenSource = 'credential';
  }
  if (!out.botToken && settings.botToken) {
    out.botToken = String(settings.botToken);
    out.tokenSource = 'legacy-settings';
  }
  if (!out.botToken) {
    const gateway = readGatewayToken();
    if (gateway) {
      out.botToken = gateway;
      out.tokenSource = 'messenger-gateway';
    }
  }
  if (!out.botToken) {
    const fromEnv = await resolveCredentialValue(ctx, 'CRON_TELEGRAM_BOT_TOKEN');
    if (fromEnv) {
      out.botToken = fromEnv;
      out.tokenSource = 'env';
    }
  }

  out.chatId = String(settings.chatId || '').trim();
  return out;
}
