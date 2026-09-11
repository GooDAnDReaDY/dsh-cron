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
import { unknownChannelIds } from './channels.js';
import { isConfigOwned, configOwnedMessage } from './config-jobs.js';

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
  if (patch.channels !== undefined) {
    // #121: a typo in a channel id used to be dropped silently, so the client
    // got ok: true and a task that never notified anyone. The refusal lives
    // here so the HTTP route and the tool behave identically.
    const unknown = unknownChannelIds(patch.channels);
    if (unknown.length) {
      return { ok: false, error: 'Unknown channel ids: ' + unknown.join(', '), unknownChannels: unknown };
    }
  }
  if (patch.schedule !== undefined) {
    // An empty schedule would leave an armed task that can never fire.
    if (!String(patch.schedule).trim()) return { ok: false, error: 'Schedule cannot be empty' };
    const parsed = parseScheduleExpression(patch.schedule);
    patch.schedule = parsed.cronPattern || patch.schedule;
    patch.scheduleText = (body && body.scheduleText) || parsed.humanText;
    patch.oneShot = Boolean(parsed.isOneShot || (body && body.oneShot));
  }
  return { ok: true, patch };
}

/**
 * Apply a patch to a stored task and re-arm or pause it.
 *
 * Switching a task into a code-executing type is the one change that turns a
 * harmless schedule into code execution, so it needs explicit confirmation on
 * EVERY surface: the HTTP route passes the result of its confirmation header,
 * and the tool exposes its own switch. A prose request in a tool description is
 * not a gate, so the refusal lives here instead.
 *
 * Returns `{ ok: true, task }`, `{ ok: false, error }`, or
 * `{ ok: false, needsConfirmation: true, error }` for that switch.
 */
export function applyTaskPatch({ store, scheduler, id, body, allowCodeSwitch = false }) {
  const current = store.get(id);
  if (!current) return { ok: false, notFound: true, error: 'Task not found' };
  // A task declared in the profile config (#50) is owned by that file: any
  // change made here disappears at the next start, so the refusal lives with
  // the patch logic and covers both the HTTP route and the agent tool.
  if (isConfigOwned(current)) {
    return { ok: false, configOwned: true, error: configOwnedMessage(id) };
  }
  if (isCodeTypeSwitch(current, body && body.type) && allowCodeSwitch !== true) {
    return {
      ok: false,
      needsConfirmation: true,
      error: `Switching this task to ${normalizeTaskType(body.type)} makes it execute code; confirm that explicitly and retry`,
    };
  }
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
