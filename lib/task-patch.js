/**
 * Partial task updates, shared by the HTTP PATCH route and the cron_update_task
 * tool (#49).
 *
 * One implementation keeps the whitelist, the type validation, the schedule
 * re-parse and the re-scheduling identical on both surfaces; the HTTP route adds
 * its own cross-origin and confirmation checks on top, while an agent calling the
 * tool acts on the user's explicit instruction.
 */

import { parseScheduleExpression } from './scheduler.js';
import { normalizeTaskType, CODE_EXECUTING_TYPES } from './runtimes.js';
import { PATCHABLE_TASK_FIELDS, validateTaskType } from './task-transfer.js';
import { pickPatchableFields } from './http-utils.js';

/** True when a patch changes a task into a type that executes code. */
export function isCodeTypeSwitch(current, nextType) {
  if (!current || nextType === undefined) return false;
  const target = normalizeTaskType(nextType);
  return CODE_EXECUTING_TYPES.includes(target) && !CODE_EXECUTING_TYPES.includes(current.type);
}

/**
 * Normalise a patch: whitelist the fields, resolve the type, re-parse the
 * schedule so cron patterns and one-shot markers stay consistent.
 * Returns `{ ok: false, error }` when the merged task would be invalid.
 */
export function buildTaskPatch(current, body) {
  const patch = pickPatchableFields(body || {}, PATCHABLE_TASK_FIELDS);
  if (patch.type !== undefined) {
    patch.type = normalizeTaskType(patch.type);
    const typeError = validateTaskType(patch.type, { ...current, ...patch });
    if (typeError) return { ok: false, error: typeError };
  }
  if (patch.schedule) {
    const parsed = parseScheduleExpression(patch.schedule);
    patch.schedule = parsed.cronPattern || patch.schedule;
    patch.scheduleText = (body && body.scheduleText) || parsed.humanText;
    patch.oneShot = Boolean(parsed.isOneShot || (body && body.oneShot));
  }
  // Never let a client rewrite server-owned bookkeeping.
  delete patch.status_bookkeeping;
  return { ok: true, patch };
}

/**
 * Apply a patch to a stored task and re-arm or pause it.
 * Returns `{ ok: true, task }` or `{ ok: false, error }`. A missing task is
 * reported as 404 by the caller, which owns the transport.
 */
export function applyTaskPatch({ store, scheduler, id, body }) {
  const current = store.get(id);
  if (!current) return { ok: false, notFound: true, error: 'Task not found' };
  const built = buildTaskPatch(current, body);
  if (!built.ok) return built;
  const task = store.set({ ...current, ...built.patch, id });
  if (task.status === 'active') scheduler.scheduleTask(task);
  else scheduler.pauseTask(id);
  return { ok: true, task, patch: built.patch };
}

/** Human-readable summary of what changed, for tool output and logs. */
export function describeTaskPatch(task, patch) {
  const keys = Object.keys(patch || {}).filter((k) => k !== 'scheduleText');
  if (!keys.length) return 'no changes';
  return keys.map((key) => `${key}=${JSON.stringify(patch[key])}`).join(', ');
}
