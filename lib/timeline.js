/**
 * Visual Schedule Timeline & Cost Heatmap Engine (#332, #333)
 *
 * 1. 24-hour schedule projection with collision and peak concurrency detection.
 * 2. 7x24 weekly hour-of-day cost and token burn heatmap matrix.
 */

import { Cron } from 'croner';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function calculate24hTimeline({
  tasks = [],
  maxConcurrent = 3,
  fromTimestamp = Date.now(),
  hoursCount = 24,
}) {
  const limit = Math.max(1, Number(maxConcurrent) || 3);
  const activeTasks = (Array.isArray(tasks) ? tasks : Object.values(tasks || {})).filter(
    (t) => t && t.status === 'active'
  );

  const startMs = typeof fromTimestamp === 'number' ? fromTimestamp : Date.now();
  const endMs = startMs + hoursCount * 3600000;

  const buckets = Array.from({ length: hoursCount }, (_, i) => {
    const bucketStart = startMs + i * 3600000;
    const d = new Date(bucketStart);
    const hourPad = String(d.getHours()).padStart(2, '0');
    return {
      index: i,
      label: `${hourPad}:00`,
      startMs: bucketStart,
      endMs: bucketStart + 3600000,
      runs: [],
      count: 0,
      isPeak: false,
    };
  });

  let totalRuns = 0;

  for (const task of activeTasks) {
    if (task.oneShot) {
      const runAt = Number(task.nextRunAt || task.targetTimestamp);
      if (runAt >= startMs && runAt < endMs) {
        const bIdx = Math.floor((runAt - startMs) / 3600000);
        if (bIdx >= 0 && bIdx < hoursCount) {
          buckets[bIdx].runs.push({
            taskId: task.id,
            title: task.title || task.id,
            runAt,
            durationEstMs: task.avgDuration || 2000,
            type: task.type || 'llm',
          });
          totalRuns += 1;
        }
      }
      continue;
    }

    if (task.schedule) {
      try {
        const c = new Cron(task.schedule, { timezone: task.timezone });
        let cursor = new Date(startMs - 1);
        // Bound to max 96 occurrences per task in 24h window
        for (let step = 0; step < 96; step++) {
          const nextDate = c.nextRun(cursor);
          if (!nextDate) break;
          const runMs = nextDate.getTime();
          if (runMs >= endMs) break;

          const bIdx = Math.floor((runMs - startMs) / 3600000);
          if (bIdx >= 0 && bIdx < hoursCount) {
            buckets[bIdx].runs.push({
              taskId: task.id,
              title: task.title || task.id,
              runAt: runMs,
              durationEstMs: task.avgDuration || 2000,
              type: task.type || 'llm',
            });
            totalRuns += 1;
          }
          cursor = new Date(runMs + 1000);
        }
      } catch (err) {
        // Fallback for custom or invalid cron schedules
        const runAt = Number(task.nextRunAt);
        if (runAt >= startMs && runAt < endMs) {
          const bIdx = Math.floor((runAt - startMs) / 3600000);
          if (bIdx >= 0 && bIdx < hoursCount) {
            buckets[bIdx].runs.push({
              taskId: task.id,
              title: task.title || task.id,
              runAt,
              durationEstMs: task.avgDuration || 2000,
              type: task.type || 'llm',
            });
            totalRuns += 1;
          }
        }
      }
    }
  }

  const peakHours = [];

  for (const b of buckets) {
    b.count = b.runs.length;
    b.isPeak = b.count > limit;
    if (b.isPeak) {
      peakHours.push(b.label);
    }
  }

  return {
    fromTimestamp: startMs,
    toTimestamp: endMs,
    maxConcurrent: limit,
    totalRuns,
    peakHoursCount: peakHours.length,
    peakHours,
    buckets,
  };
}

export function calculateCostHeatmap({
  costLedger = [],
  history = [],
  modelFilter = null,
  providerFilter = null,
}) {
  const ledger = Array.isArray(costLedger) ? costLedger : [];
  const historyList = Array.isArray(history) ? history : [];

  // Matrix: 7 rows (Mon..Sun) x 24 columns (00..23h)
  const matrix = Array.from({ length: 7 }, (_, dIdx) =>
    Array.from({ length: 24 }, (_, hIdx) => ({
      day: dIdx,
      dayLabel: DAY_LABELS[dIdx],
      hour: hIdx,
      hourLabel: `${String(hIdx).padStart(2, '0')}:00`,
      tokens: 0,
      costUsd: 0,
      runs: 0,
      costIntensity: 0,
      tokenIntensity: 0,
    }))
  );

  let totalCostUsd = 0;
  let totalTokens = 0;
  let totalRuns = 0;

  // Aggregate costLedger
  for (const entry of ledger) {
    if (!entry || typeof entry.timestamp !== 'number') continue;
    if (modelFilter && entry.model && entry.model !== modelFilter) continue;
    if (providerFilter && entry.provider && entry.provider !== providerFilter) continue;

    const d = new Date(entry.timestamp);
    const dayOfWeek = (d.getUTCDay() + 6) % 7; // Convert Sun(0) to 6, Mon(1) to 0
    const hour = d.getUTCHours();

    if (dayOfWeek >= 0 && dayOfWeek < 7 && hour >= 0 && hour < 24) {
      const cell = matrix[dayOfWeek][hour];
      const cost = typeof entry.costUsd === 'number' ? entry.costUsd : 0;
      const tokens = typeof entry.tokens === 'number' ? entry.tokens : 0;

      cell.costUsd += cost;
      cell.tokens += tokens;
      totalCostUsd += cost;
      totalTokens += tokens;
    }
  }

  // Aggregate run counts from history
  for (const r of historyList) {
    if (!r) continue;
    const t = r.startedAt || r.completedAt || r.timestamp;
    if (typeof t !== 'number') continue;
    if (modelFilter && r.model && r.model !== modelFilter) continue;
    if (providerFilter && r.provider && r.provider !== providerFilter) continue;

    const d = new Date(t);
    const dayOfWeek = (d.getUTCDay() + 6) % 7;
    const hour = d.getUTCHours();

    if (dayOfWeek >= 0 && dayOfWeek < 7 && hour >= 0 && hour < 24) {
      matrix[dayOfWeek][hour].runs += 1;
      totalRuns += 1;
    }
  }

  // Calculate maximums for intensity normalisation
  let maxCostHour = 0;
  let maxTokensHour = 0;

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = matrix[d][h];
      cell.costUsd = Number(cell.costUsd.toFixed(4));
      if (cell.costUsd > maxCostHour) maxCostHour = cell.costUsd;
      if (cell.tokens > maxTokensHour) maxTokensHour = cell.tokens;
    }
  }

  // Normalise intensity (0.0 to 1.0)
  const costDenom = maxCostHour > 0 ? maxCostHour : 1;
  const tokenDenom = maxTokensHour > 0 ? maxTokensHour : 1;

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = matrix[d][h];
      cell.costIntensity = Number((cell.costUsd / costDenom).toFixed(3));
      cell.tokenIntensity = Number((cell.tokens / tokenDenom).toFixed(3));
    }
  }

  return {
    dayLabels: DAY_LABELS,
    hourLabels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
    matrix,
    maxCostHour,
    maxTokensHour,
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
    totalTokens,
    totalRuns,
  };
}
