import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentCronPrompt } from '../lib/prompt.js';

test('buildAgentCronPrompt includes user text, silent rule, and model recommendation', () => {
  const userText = "Проверять свободное место на диске каждый час";
  const prompt = buildAgentCronPrompt(userText);

  assert.ok(prompt.includes('cron_schedule_task'));
  assert.ok(prompt.includes('Qwen/Qwen3.8-Flash') || prompt.includes('deepseek-v4-flash'));
  assert.ok(prompt.includes('Silent Rule') || prompt.includes('правило тишины'));
  assert.ok(prompt.includes(userText));
});