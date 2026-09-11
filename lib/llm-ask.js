/**
 * Small helper for asking the configured model a short question (#44, #43).
 *
 * The harness exposes the model through `ctx.llm.stream(...)`, which yields
 * text deltas and a finish chunk. That is enough for a cheap side question such
 * as "is this output worth alerting about?".
 *
 * Everything here fails open: any problem returns `{ ok: false }` and the caller
 * falls back to its normal behaviour, so a broken model call can never silence a
 * report or lose a diagnosis.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_TOKENS = 400;

function getLlm(ctx) {
  if (!ctx) return null;
  if (ctx.llm && typeof ctx.llm.stream === 'function') return ctx.llm;
  if (typeof ctx.get === 'function') {
    const service = ctx.get('llm');
    if (service && typeof service.stream === 'function') return service;
  }
  return null;
}

/** Provider and model for an auxiliary question: task first, then the default. */
export function resolveAskTarget(ctx, task = {}, preferredModel = '') {
  let defaultSelection = null;
  try {
    defaultSelection = ctx && typeof ctx.get === 'function'
      ? ctx.get('agentDefaultModel')?.currentSelection?.() || null
      : null;
  } catch {}
  return {
    provider: task.provider || defaultSelection?.provider || '',
    model: preferredModel || task.model || defaultSelection?.model || '',
  };
}

/** Collect the assistant text out of a chunk stream. */
async function collectText(stream) {
  let text = '';
  for await (const chunk of stream) {
    if (!chunk) continue;
    if (chunk.type === 'text-delta' && chunk.text) text += chunk.text;
    if (chunk.type === 'finish') break;
  }
  return text;
}

async function buildUserMessage(text) {
  try {
    const mod = await import('@deepseek-ai/dsh-llm');
    if (mod && typeof mod.createUserMessage === 'function') {
      return mod.createUserMessage({ content: [{ type: 'text', text }] });
    }
  } catch {}
  return { role: 'user', content: [{ type: 'text', text }] };
}

/**
 * Ask the model one question and return its text.
 * @returns {Promise<{ok: true, text: string} | {ok: false, error: string}>}
 */
export async function askModel(ctx, options = {}) {
  const { provider, model, prompt, system, maxTokens, timeoutMs, purpose } = options;
  const llm = getLlm(ctx);
  if (!llm) return { ok: false, error: 'the harness exposes no model stream' };
  if (!provider || !model) return { ok: false, error: 'no provider/model is configured for this call' };
  if (!prompt) return { ok: false, error: 'no prompt given' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS);
  try {
    const messages = [await buildUserMessage(prompt)];
    const stream = llm.stream({
      provider,
      model,
      messages,
      ...(system ? { system } : {}),
      maxTokens: Number(maxTokens) > 0 ? Number(maxTokens) : DEFAULT_MAX_TOKENS,
      signal: controller.signal,
      ...(purpose ? { purpose } : {}),
    });
    const text = await collectText(stream);
    return { ok: true, text: String(text || '').trim() };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the first JSON object out of a model answer.
 * Models like to wrap JSON in prose or fences, so the text is searched rather
 * than parsed directly. Returns null when nothing usable is found.
 */
export function parseJsonAnswer(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
