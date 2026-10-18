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
 * Safely extract nested property from object by path.
 * Supports dot and array bracket notation: "alerts[0].labels.container" or "issue.title".
 */
export function getNestedValue(obj, path) {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  // If property exists directly (e.g. headers with dashes like "x-github-event")
  if (Object.prototype.hasOwnProperty.call(obj, path)) {
    return obj[path];
  }
  // Try lowercase lookup for headers
  const lowerPath = path.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lowerPath) return v;
  }

  const normalized = path.replace(/\[(\w+)\]/g, '.$1');
  const parts = normalized.split('.');
  let current = obj;
  for (const p of parts) {
    if (current == null) return undefined;
    if (typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, p)) {
      current = current[p];
    } else {
      return undefined;
    }
  }
  return current;
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

  const filePath = options.filePath != null ? String(options.filePath) : '';
  const fileName = options.fileName != null ? String(options.fileName) : '';
  const fileSize = options.fileSize != null ? String(options.fileSize) : '';
  const fileEvent = options.fileEvent != null ? String(options.fileEvent) : '';

  const ctx = {
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

    // File watcher context (#327)
    'filePath': filePath,
    'file.path': filePath,
    'file_path': filePath,
    'fileName': fileName,
    'file.name': fileName,
    'file_name': fileName,
    'fileSize': fileSize,
    'file.size': fileSize,
    'file_size': fileSize,
    'fileEvent': fileEvent,
    'file.event': fileEvent,
    'file_event': fileEvent,

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

  // Webhook context (#348)
  if (options.webhook && typeof options.webhook === 'object') {
    ctx.__webhook = options.webhook;
    if (options.webhook.body !== undefined) {
      ctx['webhook.body'] = typeof options.webhook.body === 'object'
        ? JSON.stringify(options.webhook.body)
        : String(options.webhook.body);
    }
  }

  // DAG / Fan-In predecessor outputs (#328)
  if (options.prevOutputs && typeof options.prevOutputs === 'object') {
    for (const [k, v] of Object.entries(options.prevOutputs)) {
      const valStr = v != null ? String(v) : '';
      ctx[`prevOutputs.${k}`] = valStr;
      ctx[`outputs.${k}`] = valStr;
      ctx[`step.${k}.output`] = valStr;
      ctx[`prevOutputs['${k}']`] = valStr;
      ctx[`prevOutputs["${k}"]`] = valStr;
    }
  }

  return ctx;
}

/**
 * Replace {{var}} or {var} placeholders with values from context.
 * Supports dot notation like {{prev.output}}, bracket notation like {{prevOutputs['step1']}},
 * and nested webhook properties like {{webhook.body.alerts[0].labels.container}} (#348).
 */
export function interpolateTaskPrompt(text, context = {}) {
  if (typeof text !== 'string') return text;
  if (!text) return '';

  let result = text;

  // 1. Bracket notation for DAG: {{prevOutputs['step1']}} or {prevOutputs['step1']}
  result = result.replace(/\{\{?prevOutputs\[['"]([^'"]+)['"]\]\}?\}/g, (match, stepId) => {
    const key = `prevOutputs.${stepId}`;
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key];
    }
    return match;
  });

  // 2. Webhook payload interpolation (#348): {webhook.body.path}, {webhook.headers.key}, {webhook.query.param}
  if (context.__webhook && typeof context.__webhook === 'object') {
    result = result.replace(/\{\{?webhook\.(body|headers|query)(?:\.([a-zA-Z0-9_.\[\]-]+))?\}?\}/g, (match, source, path) => {
      const srcObj = context.__webhook[source];
      if (!path) {
        if (srcObj === undefined) return '';
        return typeof srcObj === 'object' ? JSON.stringify(srcObj) : String(srcObj);
      }
      const val = getNestedValue(srcObj, path);
      if (val === undefined) return '';
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    });
  }

  // 3. Standard {{var}} and {var}
  result = result.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, varName) => {
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

  return result;
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

  // Expose webhook payload in process environment for scripts (#348)
  if (options.webhook && typeof options.webhook === 'object') {
    const env = { ...(resolved.env || {}) };
    if (options.webhook.body !== undefined) {
      env.DSH_CRON_WEBHOOK_BODY = typeof options.webhook.body === 'object'
        ? JSON.stringify(options.webhook.body)
        : String(options.webhook.body);
    }
    if (options.webhook.headers !== undefined) {
      env.DSH_CRON_WEBHOOK_HEADERS = JSON.stringify(options.webhook.headers);
    }
    resolved.env = env;
  }

  return resolved;
}
