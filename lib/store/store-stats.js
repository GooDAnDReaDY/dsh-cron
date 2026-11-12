export function getTaskStats(store, id) {
  const runs = store.history.get(id) || [];
  const total = runs.length;
  let success = 0;
  let error = 0;
  let timeout = 0;
  const recentDurations = [];

  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r.status === 'success') success++;
    else if (r.status === 'error') error++;
    else if (r.status === 'timeout') timeout++;

    if (recentDurations.length < 10 && r.durationMs !== undefined) {
      recentDurations.push({
        at: r.at,
        durationMs: r.durationMs,
        status: r.status,
      });
    }
  }

  const successRate = total > 0 ? Number((success / total).toFixed(2)) : 1.0;
  return {
    totalRuns: total,
    successRuns: success,
    errorRuns: error,
    timeoutRuns: timeout,
    successRate,
    recentDurations,
  };
}

export function getAggregatedStats(store) {
  let totalRuns = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let activeTasks = 0;

  for (const t of store.tasks.values()) {
    if (t.status === 'active') activeTasks++;
    totalTokens += (t.totalTokens || 0);
    totalCostUsd += (t.totalCostUsd || 0);
    const h = store.history.get(t.id) || [];
    totalRuns += h.length;
  }

  return {
    activeTasks,
    totalRuns,
    totalTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
  };
}
