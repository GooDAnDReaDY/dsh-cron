/**
 * Integration module for dsh-kanban and LLM token cost estimation.
 */

/**
 * Model pricing per 1M tokens in USD: [promptPrice, completionPrice, cachePrice]
 */
export const MODEL_PRICING = {
  'deepseek-chat': { prompt: 0.14, completion: 0.28, cacheRead: 0.014 },
  'deepseek-reasoner': { prompt: 0.55, completion: 2.19, cacheRead: 0.14 },
  'deepseek-v4-flash': { prompt: 0.10, completion: 0.20, cacheRead: 0.01 },
  'deepseek-v4-pro': { prompt: 0.50, completion: 2.00, cacheRead: 0.10 },
  'gpt-4o': { prompt: 2.50, completion: 10.00, cacheRead: 1.25 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.60, cacheRead: 0.075 },
  'claude-3-5-sonnet': { prompt: 3.00, completion: 15.00, cacheRead: 0.30 },
  'claude-3-5-haiku': { prompt: 0.80, completion: 4.00, cacheRead: 0.08 },
  'gemini-1.5-flash': { prompt: 0.075, completion: 0.30, cacheRead: 0.01875 },
  'gemini-1.5-pro': { prompt: 1.25, completion: 5.00, cacheRead: 0.3125 },
};

/**
 * Calculate token cost in USD based on model and token counts.
 */
export function estimateTokenCost(model, usage = {}) {
  if (!usage) return 0;
  const inputTokens = Number(usage.inputTokens) || 0;
  const outputTokens = Number(usage.outputTokens) || 0;
  const cacheReadTokens = Number(usage.cacheReadTokens) || 0;

  const modelKey = Object.keys(MODEL_PRICING).find(k => model && model.toLowerCase().includes(k.toLowerCase())) || 'deepseek-v4-flash';
  const pricing = MODEL_PRICING[modelKey] || { prompt: 0.14, completion: 0.28, cacheRead: 0.014 };

  const inputCost = (inputTokens / 1_000_000) * pricing.prompt;
  const outputCost = (outputTokens / 1_000_000) * pricing.completion;
  const cacheCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead;

  const total = inputCost + outputCost + cacheCost;
  return Number(total.toFixed(6));
}

/**
 * Create an issue card in dsh-kanban.
 * Can use ctx.webServer or direct HTTP to http://127.0.0.1:3000/dsh-kanban/task
 */
export async function createKanbanCard({
  title,
  body,
  board = 'main',
  column = 'backlog',
  labels = ['cron', 'alert'],
  fetchFn = globalThis.fetch,
  kanbanBaseUrl = 'http://127.0.0.1:3000'
}) {
  try {
    const url = `${kanbanBaseUrl.replace(/\/$/, '')}/dsh-kanban/task`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify({
        title,
        body,
        board,
        column,
        labels,
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, task: data.task };
  } catch (err) {
    console.error('[dsh-cron] failed to create kanban card:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Check if kanban card should be created for this run.
 */
export function shouldCreateKanbanCard(task, runInfo) {
  const mode = task.kanbanMode || 'none'; // 'none' | 'on_failure' | 'always'
  if (mode === 'none') return false;
  if (mode === 'always') return true;
  if (mode === 'on_failure') {
    return runInfo.status === 'error' || runInfo.status === 'timeout';
  }
  return false;
}
