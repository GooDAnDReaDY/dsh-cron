/**
 * The "silent rule" (#44): a plain-language condition that decides whether a
 * successful run is worth alerting about.
 *
 * A script that runs every 30 minutes usually produces nothing interesting, and
 * `onlyOnFailure` cannot tell "the disk is at 12%" from "the disk is at 96%".
 * The rule is written by the user in words; a cheap model call turns it into a
 * yes/no verdict with a reason.
 *
 * Fail-open by design: no rule, no model, a broken call or an unusable answer all
 * mean "deliver the report". Silence is only ever produced by an explicit
 * verdict.
 */

import { askModel, parseJsonAnswer, resolveAskTarget } from './llm-ask.js';

/** Task types whose runs produce output a rule can judge. */
export const SILENT_RULE_TASK_TYPES = ['script', 'node', 'python', 'http'];

export function supportsSilentRule(task) {
  return SILENT_RULE_TASK_TYPES.includes(String(task && task.type ? task.type : 'script'));
}

const SYSTEM_PROMPT = [
  'You decide whether a monitoring job should notify its owner.',
  'Answer with a single JSON object and nothing else:',
  '{"notify": true|false, "reason": "short explanation"}',
  'Be conservative: when the output shows a problem, a warning, an error or anything uncertain, notify.',
  'Only stay silent when the output clearly matches the condition for silence.',
].join(' ');

export function buildSilentRulePrompt(task, runInfo) {
  const output = String((runInfo && runInfo.output) || '').slice(0, 4000);
  return [
    `Task: ${task.title || 'scheduled task'} (type: ${task.type || 'script'})`,
    `Schedule: ${task.scheduleText || task.schedule || ''}`,
    `Exit status: ${(runInfo && runInfo.status) || 'success'}`,
    '',
    'Condition for staying silent:',
    String(task.silentRule || '').trim(),
    '',
    'Output of the run:',
    '```',
    output || '(no output)',
    '```',
  ].join('\n');
}

/** Turn a model answer into a verdict; anything unusable means "notify". */
export function readVerdict(text) {
  const parsed = parseJsonAnswer(text);
  if (!parsed || typeof parsed.notify !== 'boolean') {
    return { ok: false, error: 'the model did not answer with a notify verdict' };
  }
  return { ok: true, notify: parsed.notify, reason: String(parsed.reason || '').slice(0, 500) };
}

/**
 * Decide whether a finished run should be delivered.
 * Returns `{ skipped, reason, verdictError? }`; `skipped` is true only after an
 * explicit "stay silent" verdict.
 */
export async function applySilentRule({ task, runInfo, ask, preferredModel, timeoutMs }) {
  if (!task || !task.silentRule || String(task.silentRule).trim() === '') {
    return { skipped: false, reason: '' };
  }
  if ((runInfo && runInfo.status) !== 'success') {
    return { skipped: false, reason: '', note: 'the rule only judges successful runs' };
  }
  if (typeof ask !== 'function') {
    return { skipped: false, reason: '', verdictError: 'no model is available for the silent rule' };
  }
  try {
    const result = await ask({
      prompt: buildSilentRulePrompt(task, runInfo),
      system: SYSTEM_PROMPT,
      preferredModel,
      maxTokens: 200,
      timeoutMs,
    });
    if (!result || !result.ok) {
      return { skipped: false, reason: '', verdictError: (result && result.error) || 'the model call failed' };
    }
    const verdict = readVerdict(result.text);
    if (!verdict.ok) return { skipped: false, reason: '', verdictError: verdict.error };
    return { skipped: verdict.notify === false, reason: verdict.reason };
  } catch (err) {
    // The rule never decides by failing: a thrown model call means "deliver".
    return { skipped: false, reason: '', verdictError: (err && err.message) || String(err) };
  }
}

/** Ask helper bound to a context, used by the scheduler. */
export function makeAsk(ctx) {
  return async ({ prompt, system, preferredModel, maxTokens, timeoutMs, task }) => {
    const target = resolveAskTarget(ctx, task || {}, preferredModel);
    return askModel(ctx, { ...target, prompt, system, maxTokens, timeoutMs });
  };
}
