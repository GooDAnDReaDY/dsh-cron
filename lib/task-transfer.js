/**
 * Task transfer helpers: duplication, export and import (#41, #42).
 *
 * Pure functions over plain task objects with no I/O, so the whole
 * configuration-transfer contract is unit-testable and the HTTP layer stays a
 * thin adapter. Kept out of index.js both for cohesion and to keep that file
 * from growing further (see issue #97).
 */

import { randomUUID } from 'node:crypto';
import { normalizeTaskType } from './runtimes.js';
import { CHANNEL_IDS } from './channels.js';

/** Task fields a client may patch; the single source of truth below. */
export const PATCHABLE_TASK_FIELDS = [
  'title',
  'schedule',
  'scheduleText',
  'prompt',
  'type',
  'delivery',
  'provider',
  'model',
  'fallbackProvider',
  'fallbackModel',
  'silentRule',
  'timezone',
  'misfirePolicy',
  'maxRetries',
  'retryBackoffMs',
  'permissionPreset',
  'env',
  'cwd',
  'workspaceId',
  'worktree',
  'keepWorktree',
  'httpMethod',
  'httpUrl',
  'httpHeaders',
  'httpBody',
  'sshTarget',
  'sshPort',
  'sshKeyPath',
  'sshProfileId',
  'dockerImage',
  'pythonPath',
  'nodePath',
  'skillName',
  'workflowName',
  'notifyTelegram',
  'onlyOnFailure',
  'timeoutSeconds',
  'overlapPolicy',
  'kanbanMode',
  'channels',
  'template',
  'status',
  'oneShot',
];

/** Fields a duplicate inherits; anything else is runtime state, not config. */
export const DUPLICATE_TASK_FIELDS = PATCHABLE_TASK_FIELDS.filter((key) => key !== 'status');

/**
 * Task ids that would shadow the collection routes under /dsh-cron/tasks.
 * A task may not use them, otherwise it could never be fetched, paused or
 * deleted again (#42 review finding).
 */
export const RESERVED_TASK_IDS = ['export', 'import'];

/**
 * Task-level fields that can carry a secret the user typed in by hand
 * (`env` values, authorization headers). The export includes them, so the UI
 * and docs must say so instead of promising a secret-free file.
 */
export const EXPORT_SECRET_BEARING_FIELDS = ['env', 'httpHeaders', 'httpBody'];

/**
 * Validate runtime-specific task configuration. Returns an error string or
 * null when the payload is usable for the given type.
 */
export function validateTaskType(type, payload) {
  const t = normalizeTaskType(type);
  if (t === 'http') {
    const raw = String((payload && (payload.httpUrl || payload.prompt)) || '').trim();
    if (!raw) return 'HTTP tasks require a URL (httpUrl or prompt)';
    try {
      // eslint-disable-next-line no-new
      new URL(raw);
    } catch {
      return `Invalid HTTP URL: ${raw}`;
    }
  }
  if (t === 'ssh') {
    const hasProfile = Boolean(payload && String(payload.sshProfileId || '').trim());
    const hasTarget = Boolean(payload && String(payload.sshTarget || '').trim());
    if (!hasProfile && !hasTarget) return 'SSH tasks require sshProfileId (remote-workspace profile) or sshTarget (user@host)';
  }
  if (t === 'docker' && !String((payload && payload.dockerImage) || '').trim()) {
    return 'Docker tasks require dockerImage';
  }
  return null;
}

/**
 * Build a paused copy of a task (#41).
 *
 * Configuration is copied, execution state is not: the copy starts paused with
 * no history, no token/cost totals, no last-run info and no retry counter, so a
 * duplicate can be reviewed before it ever runs. A duplicated one-shot keeps
 * its original schedule string and stays inert until the user resumes it.
 */
export function buildDuplicateTask(source, { id } = {}) {
  const copy = {
    id: id || randomUUID(),
    title: `${source.title || 'Task'} (copy)`,
    status: 'paused',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  for (const key of DUPLICATE_TASK_FIELDS) {
    if (key === 'title') continue;
    if (source[key] !== undefined) copy[key] = Array.isArray(source[key]) ? [...source[key]] : source[key];
  }
  return copy;
}

// ---------------------------------------------------- export / import (#42)

/** Document kind marker so a random JSON file is not mistaken for an export. */
export const TASK_EXPORT_KIND = 'dsh-cron-tasks';
export const TASK_EXPORT_VERSION = 1;

/** Fields an exported task carries: identity + configuration, never run state. */
export const EXPORT_TASK_FIELDS = ['id', 'title', ...DUPLICATE_TASK_FIELDS.filter((k) => k !== 'title')];

/** Import strategies: add (new ids), replace (overwrite by id), skip (leave existing). */
export const IMPORT_STRATEGIES = ['add', 'replace', 'skip'];

/**
 * Serialise tasks for transfer/backup. Run state (history, token and cost
 * totals, last-run info) is deliberately excluded — the file is a
 * configuration artefact. Channels reference credentials by name, but task-level
 * `env` and headers can contain hand-typed secrets, so the caller must not
 * claim the file is secret-free.
 */
export function buildTaskExport(tasks, { now = Date.now() } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  return {
    kind: TASK_EXPORT_KIND,
    version: TASK_EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    tasks: list.map((task) => {
      const out = {};
      for (const key of EXPORT_TASK_FIELDS) {
        if (task[key] === undefined || key === 'status') continue;
        out[key] = Array.isArray(task[key]) ? [...task[key]] : task[key];
      }
      return out;
    }),
  };
}

/**
 * Validate an import document and return sanitised tasks.
 *
 * An import file is external input, so it is treated as untrusted: only
 * whitelisted configuration fields survive, the file's `status` is ignored
 * (imported tasks always start paused, matching the documented behaviour), and
 * a document that would shadow a collection route id is refused. A malformed
 * file is rejected as a whole so nothing is written.
 */
export function validateImportDocument(doc) {
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'Import file is not a JSON object' };
  if (doc.kind !== TASK_EXPORT_KIND) return { ok: false, error: `Not a ${TASK_EXPORT_KIND} export (missing kind marker)` };
  if (Number(doc.version) > TASK_EXPORT_VERSION) {
    return { ok: false, error: `Export version ${doc.version} is newer than this plugin understands (${TASK_EXPORT_VERSION})` };
  }
  if (!Array.isArray(doc.tasks)) return { ok: false, error: 'Export has no tasks array' };
  const tasks = [];
  for (const [index, raw] of doc.tasks.entries()) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: `Task #${index + 1} is not an object` };
    if (!raw.title || !String(raw.title).trim()) return { ok: false, error: `Task #${index + 1} has no title` };
    if (!raw.schedule || !String(raw.schedule).trim()) return { ok: false, error: `Task #${index + 1} has no schedule` };
    if (!raw.prompt || !String(raw.prompt).trim()) return { ok: false, error: `Task #${index + 1} has no prompt` };
    const id = raw.id === undefined ? undefined : String(raw.id);
    if (id && RESERVED_TASK_IDS.includes(id)) {
      return { ok: false, error: `Task #${index + 1} uses the reserved id "${id}" which would shadow a task route` };
    }
    const type = normalizeTaskType(raw.type);
    const typeError = validateTaskType(type, raw);
    if (typeError) return { ok: false, error: `Task #${index + 1} ("${raw.title}"): ${typeError}` };
    const channels = Array.isArray(raw.channels) ? raw.channels.filter((c) => CHANNEL_IDS.includes(c)) : undefined;
    // Whitelist: drop anything the file tried to smuggle in (counters, history
    // pointers, unknown keys) and never inherit the file's status.
    const clean = { status: 'paused', type };
    for (const key of DUPLICATE_TASK_FIELDS) {
      if (raw[key] !== undefined) clean[key] = Array.isArray(raw[key]) ? [...raw[key]] : raw[key];
    }
    if (id) clean.id = id;
    if (channels) clean.channels = channels;
    tasks.push(clean);
  }
  return { ok: true, tasks };
}

/** True when any task in a validated batch executes code on the host. */
export function hasCodeExecutingTask(tasks) {
  const CODE_TYPES = ['script', 'node', 'python', 'ssh', 'docker'];
  return (tasks || []).some((task) => CODE_TYPES.includes(normalizeTaskType(task.type)));
}

/**
 * Decide what an import would do, without touching anything. Existing ids are
 * compared against tasks already in the store.
 */
export function planImport(tasks, existingIds, strategy = 'skip') {
  const mode = IMPORT_STRATEGIES.includes(strategy) ? strategy : 'skip';
  const existing = new Set(existingIds || []);
  const plan = { strategy: mode, add: [], replace: [], skip: [] };
  for (const task of tasks || []) {
    const hasId = Boolean(task.id) && existing.has(task.id);
    if (!hasId) plan.add.push(task);
    else if (mode === 'replace') plan.replace.push(task);
    else if (mode === 'skip') plan.skip.push(task);
    else plan.add.push({ ...task, id: undefined });
  }
  return plan;
}
