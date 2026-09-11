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

/** Collect the assistant text and how the stream ended. */
async function collectText(stream) {
  let text = '';
  let finishKind = '';
  for await (const chunk of stream) {
    if (!chunk) continue;
    if (chunk.type === 'text-delta' && chunk.text) text += chunk.text;
    if (chunk.type === 'finish') {
      finishKind = (chunk.reason && chunk.reason.kind) || '';
      break;
    }
  }
  return { text, finishKind };
}

/** A stream that stopped for any other reason is not a usable answer. */
function isCleanFinish(kind) {
  return kind === 'stop';
}

async function buildUserMessage(text) {
  const content = [{ type: 'text', text }];
  const source = { kind: 'plugin', plugin: 'dsh-cron', form: 'helper-call' };
  try {
    const mod = await import('@deepseek-ai/dsh-llm');
    if (mod && typeof mod.createUserMessage === 'function') {
      return mod.createUserMessage({ content, source });
    }
  } catch {}
  return { role: 'user', content, source };
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

  const limit = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timer;
  // The abort signal only helps a stream that honours it, so the whole call is
  // raced against the same deadline: a model helper must never hold a run open.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`the model call did not finish within ${limit} ms`));
    }, limit);
  });

  try {
    const work = (async () => {
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
      const { text, finishKind } = await collectText(stream);
      return { text: String(text || '').trim(), finishKind };
    })();
    // The abandoned stream must not surface as an unhandled rejection.
    work.catch(() => {});

    const { text, finishKind } = await Promise.race([work, deadline]);
    if (!isCleanFinish(finishKind)) {
      return { ok: false, error: `the model call ended with ${finishKind || 'no finish reason'}` };
    }
    return { ok: true, text };
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
