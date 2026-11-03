import { logger } from './logger.js';
import { sendTelegramMessage } from './telegram.js';
import { bestEffort } from './best-effort.js';

/**
 * Aggregates execution metrics over a rolling time window (#414).
 */
export function collectDigestMetrics(store, options = {}) {
  const windowMs = Number(options.windowMs) > 0 ? Number(options.windowMs) : 86400000;
  const since = Date.now() - windowMs;

  const tasksMap = new Map();
  if (store && store.tasks) {
    const list = Array.isArray(store.tasks)
      ? store.tasks
      : (typeof store.tasks.values === 'function' ? Array.from(store.tasks.values()) : Object.values(store.tasks));
    for (const t of list) {
      if (t && t.id) tasksMap.set(t.id, t);
    }
  }

  let totalRuns = 0;
  let successRuns = 0;
  let failedRuns = 0;
  let skippedRuns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let totalCostUsd = 0;

  const failures = [];
  const perTask = new Map();

  let allRunArrays = [];
  if (store && store.history) {
    if (typeof store.history.values === 'function') {
      allRunArrays = Array.from(store.history.values());
    } else if (typeof store.history === 'object') {
      allRunArrays = Object.values(store.history);
    }
  }

  for (const runs of allRunArrays) {
    if (!Array.isArray(runs)) continue;
    for (const run of runs) {
      if (!run) continue;
      const ts = run.finishedAt || run.startedAt || 0;
      if (ts < since) continue;

      totalRuns++;
      const isSuccess = run.status === 'success' || run.status === 'completed';
      const isFailed = run.status === 'error' || run.status === 'timeout' || run.status === 'failed';
      const isSkipped = run.status === 'skipped';

      if (isSuccess) successRuns++;
      else if (isFailed) failedRuns++;
      else if (isSkipped) skippedRuns++;

      const u = run.usage || {};
      const runIn = Number(u.inputTokens) || 0;
      const runOut = Number(u.outputTokens) || 0;
      const runCache = Number(u.cacheReadTokens) || 0;
      const runCost = Number(run.costUsd) || 0;

      inputTokens += runIn;
      outputTokens += runOut;
      cacheReadTokens += runCache;
      totalCostUsd += runCost;

      const taskId = run.taskId || 'unknown';
      const taskObj = tasksMap.get(taskId);
      const title = (taskObj && taskObj.title) || run.taskTitle || taskId;

      if (isFailed) {
        failures.push({
          taskId,
          title,
          status: run.status,
          error: run.error || 'Unknown error',
          diagnosis: run.diagnosis || null,
          finishedAt: ts,
        });
      }

      if (!perTask.has(taskId)) {
        perTask.set(taskId, {
          id: taskId,
          title,
          total: 0,
          success: 0,
          failed: 0,
          skipped: 0,
          costUsd: 0,
          tokens: 0,
        });
      }
      const p = perTask.get(taskId);
      p.total++;
      if (isSuccess) p.success++;
      if (isFailed) p.failed++;
      if (isSkipped) p.skipped++;
      p.costUsd += runCost;
      p.tokens += (runIn + runOut);
    }
  }

  const taskBreakdown = Array.from(perTask.values()).sort((a, b) => b.costUsd - a.costUsd || b.total - a.total);

  return {
    windowHours: Math.round(windowMs / 3600000),
    since,
    generatedAt: Date.now(),
    totalRuns,
    successRuns,
    failedRuns,
    skippedRuns,
    totalTokens: inputTokens + outputTokens + cacheReadTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
    failures: failures.slice(0, 10),
    taskBreakdown,
  };
}

/**
 * Formats digest metrics into standard GitHub-flavored Markdown.
 */
export function formatDigestReport(metrics) {
  const hours = metrics.windowHours || 24;
  let md = `📊 **DSH-Cron Daily Digest** (Past ${hours} Hours)\n`;
  md += `──────────────────────────────\n`;
  md += `• **Total Runs**: ${metrics.totalRuns} (✅ ${metrics.successRuns} success, ❌ ${metrics.failedRuns} failed, ⏭️ ${metrics.skippedRuns} skipped)\n`;
  md += `• **Estimated Cost**: $${metrics.totalCostUsd.toFixed(4)} USD\n`;
  md += `• **Tokens**: ${metrics.totalTokens.toLocaleString()} (${metrics.inputTokens.toLocaleString()} in, ${metrics.outputTokens.toLocaleString()} out)\n`;

  if (metrics.failures.length > 0) {
    md += `\n⚠️ **Failures & Alerts (${metrics.failures.length})**:\n`;
    for (const f of metrics.failures) {
      const diag = f.diagnosis ? ` (${f.diagnosis})` : '';
      md += `- **${f.title}**: ${f.error}${diag}\n`;
    }
  }

  if (metrics.taskBreakdown.length > 0) {
    md += `\n📈 **Top Tasks by Activity / Spend**:\n`;
    for (const t of metrics.taskBreakdown.slice(0, 5)) {
      md += `- **${t.title}**: ${t.total} runs (✅ ${t.success}, ❌ ${t.failed}), $${t.costUsd.toFixed(4)}\n`;
    }
  }

  md += `──────────────────────────────\n`;
  return md;
}

/**
 * Sends formatted digest report to notification channels.
 */
export async function dispatchDigest(metricsOrText, settings = {}, options = {}) {
  const text = typeof metricsOrText === 'string' ? metricsOrText : formatDigestReport(metricsOrText);
  const channels = options.channels || ['telegram'];
  const results = { delivered: [], failed: [] };

  if (channels.includes('telegram')) {
    const token = settings.telegramToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;
    if (token && chatId) {
      try {
        await sendTelegramMessage(token, chatId, text);
        results.delivered.push('telegram');
      } catch (err) {
        results.failed.push({ channel: 'telegram', error: err.message });
      }
    }
  }

  return results;
}
