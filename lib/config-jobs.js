/**
 * Jobs declared in the profile config (#50, ADR-0001).
 *
 * The config file owns the jobs it declares: at startup every declared job is
 * created or updated, and a job that disappears from the config is removed.
 * Tasks created by a user through the UI, the REST API or an agent tool are
 * never touched — when a declared id collides with one of them the entry is
 * skipped and reported, because silently overwriting a user's task is worse
 * than a visible conflict.
 *
 * Entries are validated one by one with a precise message, so one broken job
 * cannot take the plugin down or stop the remaining jobs from syncing.
 */

import { normalizeTaskType, CODE_EXECUTING_TYPES } from './runtimes.js';
import { parseScheduleExpression } from './scheduler.js';
import { unknownChannelIds } from './channels.js';
import { PATCHABLE_TASK_FIELDS, validateTaskType } from './task-transfer.js';
import { pickPatchableFields } from './http-utils.js';

/** Marker that makes a task owned by the config (#50). */
export const MANAGED_BY_CONFIG = 'config';

/**
 * One message for every surface that refuses to change a config-owned task, so
 * the panel, the REST routes, the tools and the external API all say the same
 * thing about where the task really lives.
 */
export function configOwnedMessage(id) {
  return 'Task "' + id + '" is declared in the profile config (config.jobs); change the config file instead';
}

/** True when a stored task is owned by the config file. */
export function isConfigOwned(task) {
  return Boolean(task) && task.managedBy === MANAGED_BY_CONFIG;
}

/**
 * Fields an entry may pass through, minus the ones the sync handles itself:
 * identity, the parsed schedule and the derived one-shot flag.
 */
const PASSTHROUGH_FIELDS = PATCHABLE_TASK_FIELDS.filter(
  (key) => !['title', 'schedule', 'prompt', 'type', 'status', 'oneShot'].includes(key)
);

/**
 * Task types whose payload is the prompt itself (see validateTaskType).
 * ssh and docker are included because their dedicated fields only describe how
 * to connect or which image to use — without a prompt the runner executes
 * `true`, which reports success while doing nothing. http is excluded on
 * purpose: it accepts the target in httpUrl.
 */
const PROMPT_TYPES = ['script', 'node', 'python', 'ssh', 'docker', 'llm', 'skill', 'workflow'];

function reject(index, message) {
  return { ok: false, error: 'config.jobs[' + index + ']: ' + message };
}

/**
 * Validate one declared job and turn it into a task record. Returns
 * `{ ok: false, error }` with the entry index so the operator can find it.
 */
export function buildConfigJob(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return reject(index, 'entry must be an object');

  const id = String(entry.id || '').trim();
  if (!id) return reject(index, 'id is required');
  if (!String(entry.title || '').trim()) return reject(index, 'title is required');
  if (!String(entry.schedule || '').trim()) return reject(index, 'schedule is required');

  const unknown = unknownChannelIds(entry.channels);
  if (unknown.length) return reject(index, 'unknown channel ids: ' + unknown.join(', '));

  const type = normalizeTaskType(entry.type || 'llm');
  // These types carry their payload in the prompt: a job declared without one
  // would be created, armed and report success while doing nothing.
  if (PROMPT_TYPES.includes(type) && !String(entry.prompt || '').trim()) {
    return reject(index, type + ' jobs require a non-empty prompt (the command or instruction to run)');
  }
  let parsed;
  try {
    parsed = parseScheduleExpression(entry.schedule);
  } catch (err) {
    return reject(index, 'invalid schedule: ' + err.message);
  }

  const job = {
    ...pickPatchableFields(entry, PASSTHROUGH_FIELDS),
    id,
    title: String(entry.title),
    type,
    status: entry.status === 'paused' ? 'paused' : 'active',
    schedule: parsed.cronPattern || String(entry.schedule).trim(),
    scheduleText: parsed.humanText,
    oneShot: Boolean(parsed.isOneShot),
    managedBy: MANAGED_BY_CONFIG,
  };
  if (entry.prompt !== undefined) job.prompt = String(entry.prompt);

  const typeError = validateTaskType(type, job);
  if (typeError) return reject(index, typeError);
  return { ok: true, job };
}

/**
 * Names of the config-owned fields in which the stored task differs from the
 * declared job. An empty list means the stored task is already in sync.
 */
export function diffConfigJob(stored, declared) {
  const changed = [];
  for (const key of Object.keys(declared)) {
    if (key === 'id' || key === 'managedBy') continue;
    const next = declared[key];
    const prev = stored ? stored[key] : undefined;
    const same = Array.isArray(next)
      ? Array.isArray(prev) && next.length === prev.length && next.every((value, i) => value === prev[i])
      : next === prev;
    if (!same) changed.push(key);
  }
  return changed;
}

/** Decide what the sync would create, update and remove. Pure, for tests. */
export function planConfigSync(entries, existingTasks) {
  const list = Array.isArray(entries) ? entries : [];
  const existing = new Map((Array.isArray(existingTasks) ? existingTasks : []).map((task) => [task.id, task]));
  const plan = { create: [], update: [], remove: [], skipped: [], warnings: [] };
  const declaredIds = new Set();

  list.forEach((entry, index) => {
    // An entry keeps its id "declared" even when the rest of it is invalid:
    // otherwise one typo in a schedule would look like "the job was removed
    // from the config" and the sync would delete the working task.
    const rawId = entry && typeof entry === 'object' && entry.id !== undefined ? String(entry.id).trim() : '';
    if (rawId) declaredIds.add(rawId);

    const built = buildConfigJob(entry, index);
    if (!built.ok) {
      plan.skipped.push({ index, error: built.error });
      return;
    }
    const job = built.job;
    declaredIds.add(job.id);

    const stored = existing.get(job.id);
    if (!stored) {
      plan.create.push(job);
    } else if (stored.managedBy !== MANAGED_BY_CONFIG) {
      plan.skipped.push({
        index,
        id: job.id,
        error: 'config.jobs[' + index + ']: a task with id "' + job.id + '" exists but is not managed by the config; it was left untouched',
      });
    } else {
      const changed = diffConfigJob(stored, job);
      if (changed.length) plan.update.push({ job, changed });
    }

    if (CODE_EXECUTING_TYPES.includes(job.type)) {
      plan.warnings.push('job "' + job.id + '" executes code (' + job.type + '); the config file is its only source');
    }
  });

  for (const task of existing.values()) {
    if (task.managedBy === MANAGED_BY_CONFIG && !declaredIds.has(task.id)) plan.remove.push(task.id);
  }
  return plan;
}

/**
 * Apply the plan: create, update and remove tasks, then arm or pause them.
 * Never throws for a single bad entry — that entry is reported and skipped.
 */
export function applyConfigSync({ store, scheduler, entries, log = console }) {
  const plan = planConfigSync(entries, store.list({ status: 'all' }));
  for (const warning of plan.warnings) log.warn('[dsh-cron] config jobs: ' + warning);
  for (const entry of plan.skipped) log.error('[dsh-cron] config jobs: skipped: ' + entry.error);

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const job of plan.create) {
    const task = store.set({ ...job });
    if (task.status === 'active') scheduler.scheduleTask(task);
    created += 1;
  }

  for (const item of plan.update) {
    const current = store.get(item.job.id);
    const task = store.set({ ...current, ...item.job, id: item.job.id });
    if (task.status === 'active') scheduler.scheduleTask(task);
    else scheduler.pauseTask(task.id);
    updated += 1;
    log.log('[dsh-cron] config job "' + task.id + '" updated: ' + item.changed.join(', '));
  }

  for (const id of plan.remove) {
    scheduler.pauseTask(id);
    store.delete(id);
    removed += 1;
    log.log('[dsh-cron] config job "' + id + '" removed: it is no longer declared');
  }

  return { created, updated, removed, skipped: plan.skipped.length };
}
