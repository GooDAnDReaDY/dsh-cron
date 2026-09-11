/**
 * Notification template engine (#25).
 *
 * Messages for every channel are rendered from a template with `{var}`
 * placeholders. Pure functions only — no I/O — so the whole matrix is
 * unit-testable.
 */

export const TEMPLATE_VARIABLES = [
  'title',
  'id',
  'status',
  'output',
  'error',
  'duration',
  'schedule',
  'time',
  'tokens',
  'cost',
  'model',
  'diagnosis',
];

export const DEFAULT_PLAIN_TEMPLATE = '⏰ {title}\nStatus: {status}\nSchedule: {schedule}\nDuration: {duration}\n{output}';

export const DEFAULT_FAILURE_TEMPLATE = '❌ {title} failed\nSchedule: {schedule}\nDuration: {duration}\n{error}';

const MAX_FIELD = 2000;

export function truncateText(text, limit = MAX_FIELD) {
  const s = String(text == null ? '' : text);
  if (s.length <= limit) return s;
  return s.slice(0, limit) + '…';
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined || ms === '') return '—';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${Math.round(n)} ms`;
  const seconds = n / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

/** Build the placeholder map for one run. */
export function buildTemplateVars(task, runInfo = {}) {
  const status = runInfo.status || 'unknown';
  const output = status === 'success' ? (runInfo.output || '') : '';
  const error = runInfo.error || (status === 'error' || status === 'timeout' ? runInfo.output || '' : '');
  const usage = runInfo.usage || {};
  const tokens = (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.cacheReadTokens || 0);
  return {
    title: task.title || 'Task',
    id: task.id || '',
    status,
    output: truncateText(output),
    error: truncateText(error),
    duration: formatDuration(runInfo.durationMs),
    schedule: task.scheduleText || task.schedule || '',
    time: new Date(runInfo.at || Date.now()).toISOString(),
    tokens: String(tokens),
    cost: `$${Number(runInfo.costUsd || 0).toFixed(4)}`,
    model: runInfo.model || '',
    diagnosis: truncateText(runInfo.diagnosis || ''),
  };
}

/** Replace {var} placeholders; unknown placeholders are left untouched. */
export function renderTemplate(template, vars) {
  return String(template == null ? '' : template).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      const value = vars[name];
      return value === null || value === undefined ? '' : String(value);
    }
    return match;
  });
}

/**
 * Pick the template for a run: failure template for failed runs unless a
 * custom template is configured, plain template otherwise.
 */
export function resolveTemplateText({ template, task, runInfo }) {
  const custom = typeof template === 'string' && template.trim() ? template.trim() : '';
  if (custom) return renderTemplate(custom, buildTemplateVars(task, runInfo));
  const failed = runInfo.status === 'error' || runInfo.status === 'timeout';
  const base = failed ? DEFAULT_FAILURE_TEMPLATE : DEFAULT_PLAIN_TEMPLATE;
  const text = renderTemplate(base, buildTemplateVars(task, runInfo));
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
