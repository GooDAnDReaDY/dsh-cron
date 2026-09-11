import test from 'node:test';
import assert from 'node:assert/strict';
import { askModel, parseJsonAnswer } from '../lib/llm-ask.js';

/** A stand-in for ctx.llm that yields the given chunks. */
function ctxWithStream(chunks, { hang = false } = {}) {
  return {
    llm: {
      stream() {
        return (async function* () {
          // A stream that neither yields nor reacts to the abort signal.
          if (hang) await new Promise(() => {});
          for (const chunk of chunks) yield chunk;
        })();
      },
    },
  };
}

test('#44/#43: a clean stream returns the collected text', async () => {
  const ctx = ctxWithStream([
    { type: 'text-delta', text: '{"notify":' },
    { type: 'text-delta', text: 'false}' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]);
  const result = await askModel(ctx, { provider: 'p', model: 'm', prompt: 'q' });
  assert.equal(result.ok, true);
  assert.equal(result.text, '{"notify":false}');
});

test('#44/#43: a stream that did not stop cleanly is not an answer', async () => {
  for (const kind of ['error', 'aborted', 'max-tokens', 'tool-calls']) {
    const ctx = ctxWithStream([{ type: 'text-delta', text: '{"notify":false}' }, { type: 'finish', reason: { kind } }]);
    const result = await askModel(ctx, { provider: 'p', model: 'm', prompt: 'q' });
    assert.equal(result.ok, false, `${kind} must not be treated as a verdict`);
    assert.match(result.error, /ended with/);
  }
});

test('#44/#43: a stream without a finish chunk is not an answer either', async () => {
  const ctx = ctxWithStream([{ type: 'text-delta', text: '{"notify":false}' }]);
  const result = await askModel(ctx, { provider: 'p', model: 'm', prompt: 'q' });
  assert.equal(result.ok, false);
  assert.match(result.error, /no finish reason/);
});

test('#44/#43: a stream that never settles is cut off by the deadline', async () => {
  const ctx = ctxWithStream([], { hang: true });
  const started = Date.now();
  const result = await askModel(ctx, { provider: 'p', model: 'm', prompt: 'q', timeoutMs: 120 });
  const elapsed = Date.now() - started;
  assert.equal(result.ok, false, 'a model helper must never hold a run open');
  assert.match(result.error, /did not finish within 120 ms/);
  assert.ok(elapsed < 2000, `the deadline released the call (took ${elapsed} ms)`);
});

test('#44/#43: missing configuration is reported, not thrown', async () => {
  const noLlm = await askModel({}, { provider: 'p', model: 'm', prompt: 'q' });
  assert.equal(noLlm.ok, false);
  assert.match(noLlm.error, /no model stream/);

  const ctx = ctxWithStream([{ type: 'finish', reason: { kind: 'stop' } }]);
  const noTarget = await askModel(ctx, { provider: '', model: '', prompt: 'q' });
  assert.equal(noTarget.ok, false);
  assert.match(noTarget.error, /no provider\/model/);

  const noPrompt = await askModel(ctx, { provider: 'p', model: 'm', prompt: '' });
  assert.equal(noPrompt.ok, false);
});

test('#44/#43: the json reader survives prose and fences', () => {
  assert.deepEqual(parseJsonAnswer('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseJsonAnswer('nothing here'), null);
});
