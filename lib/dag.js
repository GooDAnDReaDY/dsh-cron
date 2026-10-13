/**
 * Directed Acyclic Graph (DAG) Engine for Chained Tasks (#328, #334)
 * Provides cycle detection, topological sorting, dependency resolution,
 * and graph visualization modeling for multi-step task workflows.
 */

/**
 * Normalizes dependency specifications into an array of string task IDs.
 * Accepts arrays, comma/space separated strings, or single task IDs.
 *
 * @param {string|string[]|undefined|null} deps
 * @returns {string[]} Deduplicated array of valid task IDs
 */
export function sanitizeDependsOn(deps) {
  if (!deps) return [];
  let rawList = [];
  if (Array.isArray(deps)) {
    rawList = deps;
  } else if (typeof deps === 'string') {
    rawList = deps.split(/[,;\s]+/);
  }
  const result = [];
  const seen = new Set();
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Validates join policy string.
 *
 * @param {string|undefined} policy
 * @returns {'all_success'|'any_success'}
 */
export function sanitizeJoinPolicy(policy) {
  if (policy === 'any_success') return 'any_success';
  return 'all_success';
}

/**
 * Parses and returns a list of target task IDs for chaining (onSuccess / onFailure).
 * Supports single ID, comma-separated IDs, or arrays of IDs.
 *
 * @param {string|string[]|undefined|null} target
 * @returns {string[]}
 */
export function parseChainTargets(target) {
  if (!target) return [];
  if (Array.isArray(target)) {
    return target.map((t) => String(t || '').trim()).filter(Boolean);
  }
  if (typeof target === 'string') {
    return target.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Validates that adding or updating a task does not introduce cyclic dependencies.
 * Analyzes both `dependsOn` relationships and `onSuccess` chain links.
 *
 * @param {Array<Object>|Map<string, Object>|Object} allTasks All current tasks
 * @param {Object} [pendingTask] Task being created or updated
 * @returns {{ ok: boolean, error?: string, cycle?: string[] }}
 */
export function validateDAG(allTasks, pendingTask = null) {
  // Build task dictionary
  const taskMap = new Map();
  if (Array.isArray(allTasks)) {
    for (const t of allTasks) {
      if (t && t.id) taskMap.set(t.id, t);
    }
  } else if (allTasks instanceof Map) {
    for (const [k, v] of allTasks.entries()) {
      if (v && v.id) taskMap.set(v.id, v);
    }
  } else if (allTasks && typeof allTasks === 'object') {
    for (const k of Object.keys(allTasks)) {
      const t = allTasks[k];
      if (t && t.id) taskMap.set(t.id, t);
    }
  }

  // Merge pending task if provided
  if (pendingTask && pendingTask.id) {
    taskMap.set(pendingTask.id, { ...(taskMap.get(pendingTask.id) || {}), ...pendingTask });
  }

  // Self-dependency check
  for (const [id, task] of taskMap.entries()) {
    const deps = sanitizeDependsOn(task.dependsOn);
    if (deps.includes(id)) {
      return { ok: false, error: `Task "${task.title || id}" cannot depend on itself`, cycle: [id, id] };
    }
    const chainTargets = parseChainTargets(task.onSuccess);
    if (chainTargets.includes(id)) {
      return { ok: false, error: `Task "${task.title || id}" cannot trigger itself as next step`, cycle: [id, id] };
    }
  }

  // Construct adjacency list: Edge from U to V means U must complete before V runs.
  // Sources of edges:
  // 1) dependsOn: If V depends on U, then U -> V
  // 2) onSuccess: If U has onSuccess V, then U -> V
  const adj = new Map();
  for (const id of taskMap.keys()) {
    adj.set(id, new Set());
  }

  for (const [id, task] of taskMap.entries()) {
    // 1) dependsOn (deps -> id)
    const deps = sanitizeDependsOn(task.dependsOn);
    for (const depId of deps) {
      if (!adj.has(depId)) adj.set(depId, new Set());
      adj.get(depId).add(id);
    }

    // 2) onSuccess (id -> target)
    const targets = parseChainTargets(task.onSuccess);
    for (const targetId of targets) {
      if (!adj.has(id)) adj.set(id, new Set());
      adj.get(id).add(targetId);
    }
  }

  // DFS Cycle Detection (3 colors: 0=unvisited, 1=visiting, 2=visited)
  const state = new Map(); // id -> 0 | 1 | 2
  const path = [];

  for (const node of adj.keys()) {
    state.set(node, 0);
  }

  function dfs(u) {
    state.set(u, 1);
    path.push(u);

    const neighbors = adj.get(u) || new Set();
    for (const v of neighbors) {
      const vState = state.get(v) || 0;
      if (vState === 1) {
        // Cycle detected
        const cycleStartIndex = path.indexOf(v);
        const cyclePath = path.slice(cycleStartIndex).concat(v);
        return { ok: false, error: `Cyclic dependency detected: ${cyclePath.join(' -> ')}`, cycle: cyclePath };
      }
      if (vState === 0) {
        const res = dfs(v);
        if (!res.ok) return res;
      }
    }

    path.pop();
    state.set(u, 2);
    return { ok: true };
  }

  for (const node of adj.keys()) {
    if ((state.get(node) || 0) === 0) {
      const res = dfs(node);
      if (!res.ok) return res;
    }
  }

  return { ok: true };
}

/**
 * Returns topological sort of task IDs or throws error if cycle exists.
 *
 * @param {Array<Object>|Map<string, Object>} tasks
 * @returns {string[]} Ordered task IDs
 */
export function topologicalSort(tasks) {
  const check = validateDAG(tasks);
  if (!check.ok) {
    throw new Error(check.error || 'Cyclic dependency in task DAG');
  }

  const taskMap = new Map();
  if (Array.isArray(tasks)) {
    for (const t of tasks) if (t?.id) taskMap.set(t.id, t);
  } else if (tasks instanceof Map) {
    for (const [k, v] of tasks.entries()) if (v?.id) taskMap.set(v.id, v);
  }

  // In-degree calculation
  const inDegree = new Map();
  const adj = new Map();
  for (const id of taskMap.keys()) {
    inDegree.set(id, 0);
    adj.set(id, new Set());
  }

  for (const [id, task] of taskMap.entries()) {
    const deps = sanitizeDependsOn(task.dependsOn);
    for (const depId of deps) {
      if (taskMap.has(depId)) {
        adj.get(depId).add(id);
        inDegree.set(id, (inDegree.get(id) || 0) + 1);
      }
    }
    const targets = parseChainTargets(task.onSuccess);
    for (const targetId of targets) {
      if (taskMap.has(targetId)) {
        adj.get(id).add(targetId);
        inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
      }
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const order = [];
  while (queue.length > 0) {
    const u = queue.shift();
    order.push(u);
    for (const v of adj.get(u) || []) {
      const newDeg = (inDegree.get(v) || 0) - 1;
      inDegree.set(v, newDeg);
      if (newDeg === 0) queue.push(v);
    }
  }

  return order;
}

/**
 * Builds a visual graph model (nodes and edges) for UI rendering (#334).
 *
 * @param {Array<Object>} tasks All relevant tasks
 * @param {Array<Object>} [snapshots] Checkpoints for the chain run
 * @param {string} [focusTaskId] Task ID to center or highlight
 * @returns {{ nodes: Array<Object>, edges: Array<Object>, hasFailure: boolean }}
 */
export function buildTaskGraphModel(tasks = [], snapshots = [], focusTaskId = null) {
  const taskMap = new Map();
  for (const t of tasks) {
    if (t?.id) taskMap.set(t.id, t);
  }

  const snapshotMap = new Map();
  for (const s of snapshots) {
    if (s?.stepTaskId) snapshotMap.set(s.stepTaskId, s);
  }

  const nodes = [];
  const edges = [];
  let hasFailure = false;

  for (const [id, task] of taskMap.entries()) {
    const snap = snapshotMap.get(id);
    let nodeStatus = 'pending';
    let durationMs = 0;
    let outputSnippet = '';
    let retryCount = 0;

    if (snap) {
      nodeStatus = snap.status === 'completed' || snap.status === 'success' ? 'success' : 'failed';
      durationMs = snap.durationMs || 0;
      retryCount = snap.retryCount || 0;
      if (snap.output) {
        outputSnippet = String(snap.output).slice(0, 200);
      }
      if (nodeStatus === 'failed') {
        hasFailure = true;
      }
    } else if (task.status === 'running') {
      nodeStatus = 'running';
    }

    nodes.push({
      id,
      title: task.title || id,
      type: task.type || 'prompt',
      status: nodeStatus,
      durationMs,
      retryCount,
      outputSnippet,
      isFocus: Boolean(focusTaskId && id === focusTaskId),
      isRetryable: nodeStatus === 'failed',
      dependsOn: sanitizeDependsOn(task.dependsOn),
      joinPolicy: sanitizeJoinPolicy(task.joinPolicy),
    });

    // Edges from dependsOn
    const deps = sanitizeDependsOn(task.dependsOn);
    for (const depId of deps) {
      edges.push({
        from: depId,
        to: id,
        type: 'dependsOn',
        label: task.joinPolicy === 'any_success' ? 'join:any' : 'join:all',
      });
    }

    // Edges from onSuccess
    const targets = parseChainTargets(task.onSuccess);
    for (const targetId of targets) {
      edges.push({
        from: id,
        to: targetId,
        type: 'onSuccess',
        label: 'onSuccess',
      });
    }

    // Edges from onFailure
    const failTargets = parseChainTargets(task.onFailure);
    for (const failId of failTargets) {
      edges.push({
        from: id,
        to: failId,
        type: 'onFailure',
        label: 'onFailure',
      });
    }
  }

  return { nodes, edges, hasFailure };
}
