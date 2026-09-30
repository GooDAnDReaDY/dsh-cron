import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentCronPrompt } from '../lib/prompt.js';

test('buildAgentCronPrompt includes user text, silent rule and task-type guidance', () => {
  const userText = 'reminder test';
  const prompt = buildAgentCronPrompt(userText);

  assert.ok(prompt.includes('`cron` tool'));
  assert.ok(prompt.includes('action: "create"'));
  assert.ok(prompt.includes('schedule_create'));
  assert.ok(prompt.includes('Silent Rule'));
  assert.ok(prompt.includes('NO-LLM'));
  assert.ok(prompt.includes('STRICTLY FORBIDDEN'));
  // No hardcoded model identifiers: the agent proposes a model from the
  // user's actual DSH installation (#92)
  assert.ok(prompt.includes('economical model from those available'));
  assert.ok(prompt.includes(userText));
});
