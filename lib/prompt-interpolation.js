import { formatDuration } from './templates.js';

function formatDate(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(d) {
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Build dictionary of prompt interpolation variables for a task and run options.
 */
export function buildPromptContext(task = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const prevOutput = options.prevOutput != null ? String(options.prevOutput) : '';
  const prevStatus = options.prevStatus != null ? String(options.prevStatus) : '';
  const prevTaskId = options.prevTaskId != null ? String(options.prevTaskId) : '';
  const prevDuration = formatDuration(options.prevDurationMs);
  const prevCost = options.prevCostUsd != null ? `$${Number(options.prevCostUsd || 0).toFixed(4)}` : '';

  return {
    // Chaining context
    'prev.output': prevOutput,
    'prev_output': prevOutput,
    'prev.status': prevStatus,
    'prev_status': prevStatus,
    'prev.taskId': prevTaskId,
    'prev.task_id': prevTaskId,
    'prev_task_id': prevTaskId,
    'prev.duration': prevDuration,
    'prev_duration': prevDuration,
    'prev.cost': prevCost,
    'prev_cost': prevCost,

    // Time context
    'date': formatDate(now),
    'time': formatTime(now),
    'now': now.toISOString(),
    'datetime': now.toISOString(),
    'iso': now.toISOString(),
    'timestamp': String(now.getTime()),

    // Task metadata
    'task.id': task.id || '',
    'task_id': task.id || '',
    'task.title': task.title || '',
    'task_title': task.title || '',
  };
}

/**
 * Replace {{var}} or {var} placeholders with values from context.
 * Supports dot notation like {{prev.output}}. Unknown variables are left untouched.
 */
export function interpolateTaskPrompt(text, context = {}) {
  if (typeof text !== 'string') return text;
  if (!text) return '';

  return text.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, varName) => {
    if (Object.prototype.hasOwnProperty.call(context, varName)) {
      const val = context[varName];
      return val == null ? '' : String(val);
    }
    return match;
  }).replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, varName) => {
    if (Object.prototype.hasOwnProperty.call(context, varName)) {
      const val = context[varName];
      return val == null ? '' : String(val);
    }
    return match;
  });
}

/**
 * Resolve a task copy with interpolated prompt and executable fields.
 */
export function resolveTaskForExecution(task, options = {}) {
  if (!task || typeof task !== 'object') return task;
  const context = buildPromptContext(task, options);

  const resolved = { ...task };
  if (typeof resolved.prompt === 'string') {
    resolved.prompt = interpolateTaskPrompt(resolved.prompt, context);
  }
  if (typeof resolved.script === 'string') {
    resolved.script = interpolateTaskPrompt(resolved.script, context);
  }
  if (typeof resolved.command === 'string') {
    resolved.command = interpolateTaskPrompt(resolved.command, context);
  }
  if (typeof resolved.url === 'string') {
    resolved.url = interpolateTaskPrompt(resolved.url, context);
  }
  return resolved;
}
