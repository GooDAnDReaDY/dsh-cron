/**
 * Failure inspector (#43): after a run fails, ask the model what went wrong and
 * what to change in the task.
 *
 * The value is speed: instead of reading a stack trace or a wall of logs, the
 * history entry carries a short diagnosis and a proposed prompt change the user
 * can apply with one click. Nothing is applied automatically.
 *
 * Fail-open like the silent rule: no flag, no model, a failed call or an
 * unreadable answer leave the run exactly as it was.
 */

import { askModel, parseJsonAnswer, resolveAskTarget } from './llm-ask.js';

/** Agent-mediated tasks have a prompt worth revising. */
export const INSPECTABLE_TASK_TYPES = ['llm', 'skill', 'workflow'];

export function supportsInspection(task) {
  const type = String((task && task.type) || 'llm');
  return INSPECTABLE_TASK_TYPES.includes(type);
}

const SYSTEM_PROMPT = [
  'You diagnose a failed scheduled agent task.',
  'Answer with a single JSON object and nothing else:',
  '{"diagnosis": "what went wrong, in one or two sentences", "suggestion": "a concrete improved prompt or configuration change", "confidence": "low"|"medium"|"high"}',
  'Be specific and short. If the cause is unclear from the material, say so and set confidence to low.',
].join(' ');

export function buildInspectPrompt(task, runInfo) {
  const error = String((runInfo && runInfo.error) || '').slice(0, 2000);
  const output = String((runInfo && runInfo.output) || '').slice(0, 2000);
  return [
    `Task: ${task.title || 'scheduled task'} (type: ${task.type || 'llm'})`,
    `Schedule: ${task.scheduleText || task.schedule || ''}`,
    task.model ? `Model: ${task.model}` : '',
    '',
    'Current prompt:',
    '```',
    String(task.prompt || '').slice(0, 2000),
    '```',
    '',
    `Result: ${(runInfo && runInfo.status) || 'error'}`,
    'Error:',
    '```',
    error || '(no error text)',
    '```',
    output ? 'Last output:' : '',
    output ? '```' : '',
    output,
    output ? '```' : '',
  ].filter((line) => line !== '').join('\n');
}

/** Read a diagnosis out of a model answer; anything unusable is rejected. */
export function readDiagnosis(text) {
  const parsed = parseJsonAnswer(text);
  if (!parsed || !parsed.diagnosis) return { ok: false, error: 'the model did not answer with a diagnosis' };
  const confidence = ['low', 'medium', 'high'].includes(String(parsed.confidence || '').toLowerCase())
    ? String(parsed.confidence).toLowerCase()
    : 'low';
  return {
    ok: true,
    diagnosis: String(parsed.diagnosis).slice(0, 1000),
    suggestion: String(parsed.suggestion || '').slice(0, 2000),
    confidence,
  };
}

/**
 * Inspect a failed run. Returns `{ inspected: true, diagnosis, suggestion,
 * confidence }` or `{ inspected: false, error }` — never throws.
 */
export async function inspectFailure({ task, runInfo, ask, preferredModel, timeoutMs }) {
  // Order matters: an inspection only ever concerns failed runs, so a healthy
  // run must not produce a "no model available" warning.
  const status = (runInfo && runInfo.status) || '';
  if (status !== 'error' && status !== 'timeout') return { inspected: false };
  if (!task || !task.inspectOnFailure) return { inspected: false };
  if (!supportsInspection(task)) return { inspected: false, error: 'this task type has no prompt to revise' };
  if (typeof ask !== 'function') return { inspected: false, error: 'no model is available for the inspection' };

  try {
    const result = await ask({
      task,
      prompt: buildInspectPrompt(task, runInfo),
      system: SYSTEM_PROMPT,
      preferredModel,
      maxTokens: 400,
      timeoutMs,
    });
    if (!result || !result.ok) return { inspected: false, error: (result && result.error) || 'the model call failed' };
    const diagnosis = readDiagnosis(result.text);
    if (!diagnosis.ok) return { inspected: false, error: diagnosis.error };
    return { inspected: true, diagnosis: diagnosis.diagnosis, suggestion: diagnosis.suggestion, confidence: diagnosis.confidence };
  } catch (err) {
    return { inspected: false, error: (err && err.message) || String(err) };
  }
}

/** Ask helper bound to a context, used by the scheduler. */
export function makeInspectAsk(ctx) {
  return async ({ prompt, system, preferredModel, maxTokens, timeoutMs, task }) => {
    const target = resolveAskTarget(ctx, task || {}, preferredModel);
    return askModel(ctx, { ...target, prompt, system, maxTokens, timeoutMs });
  };
}
