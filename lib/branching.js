/**
 * Decision Nodes and Branching Rules Engine (#352)
 *
 * Evaluates conditional IF/ELSE logic on task outcomes in DAG chains.
 * Inspects exit codes, execution statuses, stdout/stderr, and deep JSON paths.
 */

/**
 * Safely resolves a nested field from the execution context.
 *
 * Supported paths:
 * - Direct fields: 'status', 'exitCode', 'output', 'stdout', 'stderr', 'durationMs', 'costUsd'
 * - JSON paths: 'output.json.severity', 'json.data.status', 'stdout.json.items[0].id'
 * - Nested objects: 'outcome.status', 'runInfo.error', 'task.type'
 *
 * @param {Object} context Execution context containing outcome, runInfo, and/or task
 * @param {string} path Dot-separated property path
 * @returns {any} Resolved value or undefined
 */
export function resolveField(context, path) {
  if (!context || !path || typeof path !== 'string') return undefined;

  const trimmedPath = path.trim();
  if (!trimmedPath) return undefined;

  // Flattened lookup root: blend context, outcome, runInfo
  const root = {
    ...(context.outcome || {}),
    ...(context.runInfo || {}),
    ...(context.task ? { task: context.task } : {}),
    ...context,
  };

  // If path refers to stdout or stderr, fallback to output if not explicitly separated
  if (trimmedPath === 'stdout' && root.stdout === undefined) {
    return root.output;
  }
  if (trimmedPath === 'stderr' && root.stderr === undefined) {
    return root.error;
  }

  // Handle json sub-paths (e.g. output.json.foo, json.bar, stdout.json.baz)
  if (trimmedPath.startsWith('output.json.') || trimmedPath.startsWith('stdout.json.') || trimmedPath.startsWith('json.')) {
    let rawText = '';
    let jsonSubPath = '';

    if (trimmedPath.startsWith('output.json.')) {
      rawText = root.output ?? root.stdout ?? '';
      jsonSubPath = trimmedPath.slice('output.json.'.length);
    } else if (trimmedPath.startsWith('stdout.json.')) {
      rawText = root.stdout ?? root.output ?? '';
      jsonSubPath = trimmedPath.slice('stdout.json.'.length);
    } else {
      rawText = root.output ?? root.stdout ?? '';
      jsonSubPath = trimmedPath.slice('json.'.length);
    }

    let parsed = null;
    if (typeof rawText === 'object' && rawText !== null) {
      parsed = rawText;
    } else if (typeof rawText === 'string') {
      try {
        parsed = JSON.parse(rawText.trim());
      } catch {
        // Attempt to extract JSON from markdown fences if present
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[1].trim());
          } catch {
            return undefined;
          }
        } else {
          return undefined;
        }
      }
    }

    if (!parsed || typeof parsed !== 'object') return undefined;
    return getNestedValue(parsed, jsonSubPath);
  }

  return getNestedValue(root, trimmedPath);
}

/**
 * Traverses an object using a dot-path, supporting simple array indexing like `items[0].id` or `items.0.id`.
 *
 * @param {Object} obj Root object
 * @param {string} path Dot path
 * @returns {any}
 */
export function getNestedValue(obj, path) {
  if (obj === null || obj === undefined || !path) return undefined;

  // Normalize array notation `foo[0].bar` -> `foo.0.bar`
  const normalizedPath = path.replace(/\[(\w+)\]/g, '.$1');
  const parts = normalizedPath.split('.').filter(Boolean);

  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Evaluates a binary condition against an extracted value.
 *
 * Supported operators:
 * - 'equals', '==', 'eq'
 * - 'notEquals', '!=', 'neq'
 * - 'contains'
 * - 'notContains'
 * - 'greaterThan', '>', 'gt'
 * - 'greaterThanOrEqual', '>=', 'gte'
 * - 'lessThan', '<', 'lt'
 * - 'lessThanOrEqual', '<=', 'lte'
 * - 'regex', 'matches'
 * - 'exists'
 * - 'notExists'
 *
 * @param {any} actual
 * @param {string} operator
 * @param {any} expected
 * @returns {boolean}
 */
export function evaluateCondition(actual, operator, expected) {
  const op = String(operator || 'equals').trim().toLowerCase();

  if (op === 'exists') {
    return actual !== undefined && actual !== null && actual !== '';
  }

  if (op === 'notexists' || op === 'not_exists') {
    return actual === undefined || actual === null || actual === '';
  }

  if (actual === undefined || actual === null) {
    if (op === 'notequals' || op === '!=' || op === 'neq') {
      return expected !== undefined && expected !== null;
    }
    return false;
  }

  // Helper: check if value looks like a pure number
  const isNumeric = (val) => typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val)));

  switch (op) {
    case 'equals':
    case '==':
    case 'eq': {
      if (isNumeric(actual) && isNumeric(expected)) {
        return Number(actual) === Number(expected);
      }
      if (typeof actual === 'boolean' || typeof expected === 'boolean') {
        return Boolean(actual) === (expected === true || String(expected).toLowerCase() === 'true');
      }
      return String(actual).trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
    }

    case 'notequals':
    case '!=':
    case 'neq': {
      return !evaluateCondition(actual, 'equals', expected);
    }

    case 'contains': {
      if (Array.isArray(actual)) {
        return actual.some((item) => String(item).toLowerCase().includes(String(expected ?? '').toLowerCase()));
      }
      return String(actual).toLowerCase().includes(String(expected ?? '').toLowerCase());
    }

    case 'notcontains':
    case 'not_contains': {
      return !evaluateCondition(actual, 'contains', expected);
    }

    case 'greaterthan':
    case '>':
    case 'gt': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
    }

    case 'greaterthanorequal':
    case '>=':
    case 'gte': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a >= b;
    }

    case 'lessthan':
    case '<':
    case 'lt': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
    }

    case 'lessthanorequal':
    case '<=':
    case 'lte': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a <= b;
    }

    case 'regex':
    case 'matches': {
      try {
        const re = new RegExp(String(expected ?? ''), 'i');
        return re.test(String(actual));
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Sanitizes and validates branch rule configurations.
 *
 * @param {Array<Object>|any} rules
 * @returns {Array<{ field: string, operator: string, value: any, targetTask: string, label?: string }>}
 */
export function sanitizeBranchRules(rules) {
  if (!Array.isArray(rules)) return [];

  const sanitized = [];
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;

    const targetTask = String(r.targetTask || '').trim();
    const field = String(r.field || '').trim();
    const operator = String(r.operator || 'equals').trim().toLowerCase();

    if (!targetTask || !field) continue;

    sanitized.push({
      field,
      operator,
      value: r.value !== undefined ? r.value : '',
      targetTask,
      label: r.label ? String(r.label).trim() : `[if: ${field} ${operator} ${r.value ?? ''}]`.trim(),
    });
  }

  return sanitized;
}

/**
 * Evaluates an ordered list of branch rules against the execution context.
 * Returns the first matching target task, or the fallback elseTask if none match.
 *
 * @param {Array<Object>} rules Array of branch rule objects
 * @param {string|null} [elseTask] Fallback target task ID
 * @param {Object} context Execution context (outcome, runInfo, task)
 * @returns {{ matched: boolean, targetTask: string|null, rule?: Object, isElse?: boolean, matchedIndex?: number }}
 */
export function evaluateBranchRules(rules, elseTask, context) {
  const cleanRules = sanitizeBranchRules(rules);

  for (let i = 0; i < cleanRules.length; i++) {
    const rule = cleanRules[i];
    const actual = resolveField(context, rule.field);
    const matched = evaluateCondition(actual, rule.operator, rule.value);

    if (matched) {
      return {
        matched: true,
        targetTask: rule.targetTask,
        rule,
        matchedIndex: i,
        actualValue: actual,
      };
    }
  }

  const cleanElse = elseTask ? String(elseTask).trim() : null;
  if (cleanElse) {
    return {
      matched: false,
      targetTask: cleanElse,
      isElse: true,
    };
  }

  return {
    matched: false,
    targetTask: null,
  };
}

/**
 * Evaluates branch rules on task completion and determines next targets for the scheduler.
 * Returns null if no branch rules or elseTask are configured (allowing standard onSuccess/onFailure).
 *
 * @param {Object} task Current task definition
 * @param {Object} outcome Task execution outcome
 * @param {Object} runInfo History run record
 * @returns {{ targets: string[], decision: Object } | null}
 */
export function resolveBranchTargets(task, outcome, runInfo) {
  if (!task) return null;

  const rules = sanitizeBranchRules(task.branchRules);
  const elseTask = task.elseTask ? String(task.elseTask).trim() : null;

  if (rules.length === 0 && !elseTask) {
    return null;
  }

  const context = {
    outcome: outcome || {},
    runInfo: runInfo || {},
    task,
    status: outcome?.status || runInfo?.status,
    exitCode: outcome?.exitCode ?? runInfo?.exitCode,
    output: outcome?.output ?? runInfo?.output,
    error: outcome?.error ?? runInfo?.error,
    stdout: outcome?.stdout ?? runInfo?.stdout,
    stderr: outcome?.stderr ?? runInfo?.stderr,
  };

  const decision = evaluateBranchRules(rules, elseTask, context);
  const targets = decision.targetTask ? [decision.targetTask] : [];

  return {
    targets,
    decision,
  };
}

