/**
 * Weekly AI Analytics & Cost Digest Engine (#330)
 *
 * Aggregates automation performance, success rates, token and USD spending,
 * identifies top unstable and top expensive tasks, and formats delivery payloads.
 */

export function buildAnalyticsDigest({ tasks = [], history = [], costLedger = [], periodDays = 7, now = Date.now() }) {
  const windowDays = typeof periodDays === 'number' && periodDays > 0 ? periodDays : 7;
  const windowStart = now - (windowDays * 86400000);

  const taskList = Array.isArray(tasks) ? tasks : [];
  const historyList = Array.isArray(history) ? history : [];
  const costList = Array.isArray(costLedger) ? costLedger : [];

  // Filter history runs in window
  const runsInWindow = historyList.filter((r) => {
    const t = r.startedAt || r.completedAt || r.timestamp;
    return typeof t === 'number' && t >= windowStart;
  });

  let totalRuns = 0;
  let successfulRuns = 0;
  let failedRuns = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let healedCount = 0;

  const taskStatsMap = new Map();

  for (const task of taskList) {
    taskStatsMap.set(task.id, {
      id: task.id,
      name: task.name || task.id,
      runs: 0,
      failures: 0,
      tokens: 0,
      costUsd: 0,
    });
  }

  if (runsInWindow.length > 0) {
    totalRuns = runsInWindow.length;
    for (const r of runsInWindow) {
      const isFailed = r.status === 'failure' || r.status === 'failed' || Boolean(r.error);
      if (isFailed) {
        failedRuns += 1;
      } else {
        successfulRuns += 1;
      }

      if (r.healed || r.autoHealed || (typeof r.retryCount === 'number' && r.retryCount > 0 && !isFailed)) {
        healedCount += 1;
      }

      const tokens = typeof r.tokens === 'number' ? r.tokens : (typeof r.tokensUsed === 'number' ? r.tokensUsed : 0);
      totalTokens += tokens;

      const cost = typeof r.costUsd === 'number' ? r.costUsd : 0;
      totalCostUsd += cost;

      if (r.taskId && taskStatsMap.has(r.taskId)) {
        const ts = taskStatsMap.get(r.taskId);
        ts.runs += 1;
        if (isFailed) ts.failures += 1;
        ts.tokens += tokens;
        ts.costUsd += cost;
      }
    }
  } else {
    // Fallback: aggregate from task summary counters
    for (const task of taskList) {
      const runs = typeof task.runs === 'number' ? task.runs : 0;
      const failures = typeof task.failures === 'number' ? task.failures : 0;
      const successes = Math.max(0, runs - failures);
      const tokens = typeof task.tokensUsed === 'number' ? task.tokensUsed : 0;
      const cost = typeof task.costUsd === 'number' ? task.costUsd : 0;

      totalRuns += runs;
      successfulRuns += successes;
      failedRuns += failures;
      totalTokens += tokens;
      totalCostUsd += cost;

      const ts = taskStatsMap.get(task.id);
      if (ts) {
        ts.runs = runs;
        ts.failures = failures;
        ts.tokens = tokens;
        ts.costUsd = cost;
      }
    }
  }

  // Calculate cost from ledger if available and higher
  const ledgerCostInWindow = costList
    .filter((c) => typeof c.timestamp === 'number' && c.timestamp >= windowStart)
    .reduce((sum, c) => sum + (typeof c.costUsd === 'number' ? c.costUsd : 0), 0);
  if (ledgerCostInWindow > totalCostUsd) {
    totalCostUsd = ledgerCostInWindow;
  }

  const successRate = totalRuns > 0 ? Number(((successfulRuns / totalRuns) * 100).toFixed(1)) : 100.0;

  // Identify top unstable tasks
  const topUnstableTasks = Array.from(taskStatsMap.values())
    .filter((ts) => ts.failures > 0)
    .sort((a, b) => b.failures - a.failures || (b.runs - a.runs))
    .slice(0, 3)
    .map((ts) => ({
      id: ts.id,
      name: ts.name,
      runs: ts.runs,
      failures: ts.failures,
      successRate: ts.runs > 0 ? Number((((ts.runs - ts.failures) / ts.runs) * 100).toFixed(1)) : 0.0,
    }));

  // Identify top expensive tasks
  const topExpensiveTasks = Array.from(taskStatsMap.values())
    .filter((ts) => ts.tokens > 0 || ts.costUsd > 0)
    .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens)
    .slice(0, 3)
    .map((ts) => ({
      id: ts.id,
      name: ts.name,
      tokens: ts.tokens,
      costUsd: Number(ts.costUsd.toFixed(4)),
    }));

  const activeTasksCount = taskList.filter((t) => t.status !== 'paused').length;
  const pausedTasksCount = taskList.filter((t) => t.status === 'paused').length;

  return {
    periodDays: windowDays,
    windowStart,
    windowEnd: now,
    totalRuns,
    successfulRuns,
    failedRuns,
    successRate,
    totalTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
    healedCount,
    activeTasksCount,
    pausedTasksCount,
    totalTasksCount: taskList.length,
    topUnstableTasks,
    topExpensiveTasks,
  };
}

export function formatDigestMarkdown(digest) {
  const {
    periodDays,
    totalRuns,
    successfulRuns,
    failedRuns,
    successRate,
    totalTokens,
    totalCostUsd,
    healedCount,
    activeTasksCount,
    pausedTasksCount,
    topUnstableTasks,
    topExpensiveTasks,
  } = digest;

  const lines = [
    `📊 **DSH Cron Automation Digest (Last ${periodDays} Days)**`,
    `• **Total Executions:** ${totalRuns} (✅ ${successfulRuns} succeeded, ❌ ${failedRuns} failed — **${successRate}%** SR)`,
    `• **Token Consumption:** ${totalTokens.toLocaleString('en-US')} tokens (~$${totalCostUsd.toFixed(4)} USD)`,
    `• **Task Fleet:** ${activeTasksCount} active, ${pausedTasksCount} paused`,
  ];

  if (healedCount > 0) {
    lines.push(`• **Self-Healed Runs:** 🔄 ${healedCount} recovered via retry/failure-inspector`);
  }

  lines.push('');
  lines.push('⚠️ **Top Unstable Automations:**');
  if (topUnstableTasks.length === 0) {
    lines.push('*(All automations healthy — 0 failures recorded!)*');
  } else {
    topUnstableTasks.forEach((t, i) => {
      lines.push(`${i + 1}. \`${t.name}\` — **${t.successRate}%** success (${t.failures} failed of ${t.runs} runs)`);
    });
  }

  lines.push('');
  lines.push('💰 **Top Resource Consumers:**');
  if (topExpensiveTasks.length === 0) {
    lines.push('*(No significant token consumption recorded)*');
  } else {
    topExpensiveTasks.forEach((t, i) => {
      lines.push(`${i + 1}. \`${t.name}\` — ${t.tokens.toLocaleString('en-US')} tokens ($${t.costUsd.toFixed(4)})`);
    });
  }

  return lines.join('\n');
}

export function formatDigestTelegram(digest) {
  // Return clean plain Markdown compatible with standard bot message formatting
  return formatDigestMarkdown(digest);
}

export async function sendAnalyticsDigest({ digest, channels, deliveryConfig }) {
  if (!channels || !digest) {
    throw new Error('channels and digest are required to send analytics digest');
  }

  const message = formatDigestMarkdown(digest);
  const results = { telegram: null, webhook: null };

  if (deliveryConfig?.telegram && typeof channels.sendTelegram === 'function') {
    try {
      results.telegram = await channels.sendTelegram(message, { parseMode: 'Markdown' });
    } catch (err) {
      results.telegram = { error: err.message };
    }
  }

  if (deliveryConfig?.webhookUrl && typeof channels.sendWebhook === 'function') {
    try {
      results.webhook = await channels.sendWebhook(deliveryConfig.webhookUrl, {
        event: 'analytics.digest',
        digest,
        text: message,
      });
    } catch (err) {
      results.webhook = { error: err.message };
    }
  }

  return results;
}
