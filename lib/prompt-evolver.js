/**
 * Prompt Auto-Evolver & Versioning Engine (#331)
 *
 * Tracks prompt revisions, maintains versioned prompt history, computes
 * empirical Success Rates across versions, and enables 1-click rollback.
 */

const MAX_PROMPT_HISTORY = 20;

export function sanitizePromptHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h === 'object' && typeof h.prompt === 'string')
    .slice(-MAX_PROMPT_HISTORY)
    .map((h, idx) => ({
      version: typeof h.version === 'number' && h.version > 0 ? h.version : (idx + 1),
      prompt: String(h.prompt || ''),
      note: typeof h.note === 'string' ? h.note.slice(0, 100) : 'Revision',
      runs: typeof h.runs === 'number' && h.runs >= 0 ? h.runs : 0,
      successes: typeof h.successes === 'number' && h.successes >= 0 ? h.successes : 0,
      successRate: typeof h.successRate === 'number' && h.successRate >= 0 && h.successRate <= 1
        ? Number(h.successRate.toFixed(3))
        : (typeof h.runs === 'number' && h.runs > 0 ? Number(((h.successes || 0) / h.runs).toFixed(3)) : 1.0),
      createdAt: typeof h.createdAt === 'number' ? h.createdAt : Date.now(),
      lastRunAt: typeof h.lastRunAt === 'number' ? h.lastRunAt : null,
    }));
}

export function trackPromptEdit(currentTask, newPrompt, note = 'Manual edit') {
  if (!currentTask || typeof newPrompt !== 'string') {
    return {
      prompt: currentTask ? currentTask.prompt : newPrompt,
      promptVersion: currentTask ? (currentTask.promptVersion || 1) : 1,
      promptHistory: currentTask ? sanitizePromptHistory(currentTask.promptHistory) : [],
    };
  }

  const trimmedNew = newPrompt.trim();
  const trimmedOld = (currentTask.prompt || '').trim();

  let history = sanitizePromptHistory(currentTask.promptHistory);

  // If prompt has not changed, keep current version and baseline history if needed
  if (trimmedNew === trimmedOld) {
    if (history.length === 0 && trimmedOld) {
      history.push({
        version: currentTask.promptVersion || 1,
        prompt: currentTask.prompt,
        note: 'Initial baseline',
        runs: typeof currentTask.runs === 'number' ? currentTask.runs : 0,
        successes: typeof currentTask.successes === 'number' ? currentTask.successes : 0,
        successRate: currentTask.runs > 0
          ? Number(((currentTask.successes || 0) / currentTask.runs).toFixed(3))
          : 1.0,
        createdAt: currentTask.createdAt || Date.now(),
        lastRunAt: currentTask.lastRun || null,
      });
    }
    return {
      prompt: currentTask.prompt,
      promptVersion: currentTask.promptVersion || 1,
      promptHistory: history,
    };
  }

  // If no history exists yet, record baseline version 1 with existing task metrics before bumping
  if (history.length === 0 && trimmedOld) {
    history.push({
      version: 1,
      prompt: currentTask.prompt,
      note: 'Initial baseline',
      runs: typeof currentTask.runs === 'number' ? currentTask.runs : 0,
      successes: typeof currentTask.successes === 'number' ? currentTask.successes : 0,
      successRate: currentTask.runs > 0
        ? Number(((currentTask.successes || 0) / currentTask.runs).toFixed(3))
        : 1.0,
      createdAt: currentTask.createdAt || Date.now(),
      lastRunAt: currentTask.lastRun || null,
    });
  }

  const maxVersion = history.reduce((max, h) => Math.max(max, h.version || 1), currentTask.promptVersion || 1);
  const nextVersion = maxVersion + 1;

  history.push({
    version: nextVersion,
    prompt: newPrompt,
    note: String(note || 'Manual edit').slice(0, 100),
    runs: 0,
    successes: 0,
    successRate: 1.0,
    createdAt: Date.now(),
    lastRunAt: null,
  });

  return {
    prompt: newPrompt,
    promptVersion: nextVersion,
    promptHistory: sanitizePromptHistory(history),
  };
}

export function recordPromptRunOutcome(task, isSuccess) {
  if (!task || typeof task.prompt !== 'string') return task?.promptHistory || [];

  let history = sanitizePromptHistory(task.promptHistory);
  const activeVersion = task.promptVersion || 1;

  let entry = history.find((h) => h.version === activeVersion);
  if (!entry) {
    entry = {
      version: activeVersion,
      prompt: task.prompt,
      note: 'Active prompt',
      runs: 0,
      successes: 0,
      successRate: 1.0,
      createdAt: Date.now(),
      lastRunAt: null,
    };
    history.push(entry);
  }

  entry.runs = (entry.runs || 0) + 1;
  if (isSuccess) {
    entry.successes = (entry.successes || 0) + 1;
  }
  entry.successRate = Number((entry.successes / entry.runs).toFixed(3));
  entry.lastRunAt = Date.now();

  task.promptHistory = sanitizePromptHistory(history);
  return task.promptHistory;
}

export function rollbackPromptVersion(task, targetVersion) {
  if (!task) return null;
  const history = sanitizePromptHistory(task.promptHistory);
  const target = history.find((h) => h.version === targetVersion);
  if (!target) {
    throw new Error(`Target prompt version ${targetVersion} not found in history`);
  }

  const edit = trackPromptEdit(task, target.prompt, `Rollback to v${targetVersion}`);
  task.prompt = edit.prompt;
  task.promptVersion = edit.promptVersion;
  task.promptHistory = edit.promptHistory;
  return task;
}
