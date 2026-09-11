/**
 * Prometheus exposition of the scheduler (#53).
 *
 * The renderer is hand-rolled on purpose: the profile has no prom-client and
 * adding a production dependency for a handful of counters is not justified.
 * Only counts, statuses and durations are exported — never prompts, run output
 * or task configuration, so the endpoint can be scraped without leaking work
 * content.
 */

export const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

/** Run statuses the scheduler can finish with. */
export const RUN_STATUSES = ['success', 'error', 'timeout', 'skipped', 'missed'];

const NL = String.fromCharCode(10);
const BACKSLASH = String.fromCharCode(92);
const QUOTE = String.fromCharCode(34);

/** Escape a label value for the Prometheus text format. */
export function escapeLabel(value) {
  return String(value)
    .split(BACKSLASH).join(BACKSLASH + BACKSLASH)
    .split(QUOTE).join(BACKSLASH + QUOTE)
    .split(NL).join(BACKSLASH + 'n');
}

function sample(name, labels, value) {
  const rendered = Object.keys(labels)
    .map((key) => key + '=' + QUOTE + escapeLabel(labels[key]) + QUOTE)
    .join(',');
  return name + (rendered ? '{' + rendered + '}' : '') + ' ' + value;
}

/**
 * Render the current scheduler state as Prometheus text exposition.
 * Pure function over plain data so it is testable without a store.
 */
export function renderMetrics({ tasks = [], stats = {}, runCounters = {} } = {}) {
  const lines = [];
  const byStatus = {};
  for (const task of tasks) {
    const status = task.status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  lines.push('# HELP dsh_cron_tasks_total Scheduled tasks by status.');
  // A gauge despite the name: this is a snapshot of how many tasks are in each
  // state, not a monotonically growing total.
  lines.push('# TYPE dsh_cron_tasks_total gauge');
  for (const status of Object.keys(byStatus).sort()) {
    lines.push(sample('dsh_cron_tasks_total', { status }, byStatus[status]));
  }

  lines.push('# HELP dsh_cron_task_last_duration_seconds Duration of the last finished run of a task.');
  lines.push('# TYPE dsh_cron_task_last_duration_seconds gauge');
  for (const task of tasks) {
    // lastRunAt marks a finished run: a task that never ran still carries
    // lastDurationMs = 0, and exporting that would show instant runs in
    // monitoring.
    if (!Number.isFinite(task.lastDurationMs) || !task.lastRunAt) continue;
    lines.push(sample('dsh_cron_task_last_duration_seconds', { task: task.id }, task.lastDurationMs / 1000));
  }

  lines.push('# HELP dsh_cron_runs_total Finished runs since the plugin started, by status.');
  lines.push('# TYPE dsh_cron_runs_total counter');
  for (const status of RUN_STATUSES) {
    lines.push(sample('dsh_cron_runs_total', { status }, Number(runCounters[status]) || 0));
  }

  lines.push('# HELP dsh_cron_run_records Run records currently kept in memory.');
  lines.push('# TYPE dsh_cron_run_records gauge');
  lines.push('dsh_cron_run_records ' + (Number(stats.totalRuns) || 0));

  return lines.join(NL) + NL;
}

/**
 * GET /dsh-cron/metrics — read-only. A scraper is a plain local client, so no
 * cross-origin check applies, and nothing sensitive is exposed.
 */
export function createMetricsHandler({ store, scheduler }) {
  return function handleMetrics(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed' + NL);
      return;
    }
    const body = renderMetrics({
      tasks: store.list({ status: 'all' }),
      stats: store.getAggregatedStats(),
      runCounters: typeof scheduler.getRunCounters === 'function' ? scheduler.getRunCounters() : {},
    });
    res.writeHead(200, { 'Content-Type': METRICS_CONTENT_TYPE, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
