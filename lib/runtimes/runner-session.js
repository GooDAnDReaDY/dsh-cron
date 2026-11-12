import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';

export function formatDateYmd(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function resolveTargetSessionId(targetSessionId, resetPolicy = 'never', date = new Date()) {
  if (!targetSessionId || typeof targetSessionId !== 'string') return null;
  let baseId = targetSessionId.trim();
  if (!baseId) return null;

  const yyyymmdd = formatDateYmd(date);

  if (baseId.includes('{{date}}')) {
    return baseId.replaceAll('{{date}}', yyyymmdd);
  }

  if (resetPolicy === 'daily') {
    return `${baseId}-${yyyymmdd}`;
  }

  if (resetPolicy === 'weekly') {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const ww = String(weekNo).padStart(2, '0');
    return `${baseId}-${d.getUTCFullYear()}-W${ww}`;
  }

  return baseId;
}

export function getAgentsService(ctx) {
  if (!ctx) return null;
  try {
    if (typeof ctx.get === 'function') {
      const svc = ctx.get('agents');
      if (svc) return svc;
    }
  } catch (_err) {
    // service unavailable via ctx.get
  }
  try {
    return ctx.agents || null;
  } catch (_err) {
    return null;
  }
}

export function getSessionService(ctx) {
  if (!ctx) return null;
  try {
    if (typeof ctx.get === 'function') {
      const svc = ctx.get('session') || ctx.get('sessions');
      if (svc) return svc;
    }
  } catch (_err) {
    // service unavailable via ctx.get
  }
  try {
    return ctx.session || ctx.sessions || null;
  } catch (_err) {
    return null;
  }
}

export function getWorkspaceRegistry(ctx) {
  if (!ctx) return null;
  try {
    if (typeof ctx.get === 'function') {
      const svc = ctx.get('workspaceRegistry') || ctx.get('workspaces');
      if (svc) return svc;
    }
  } catch (_err) {
    // service unavailable via ctx.get
  }
  try {
    return ctx.workspaceRegistry || ctx.workspaces || null;
  } catch (_err) {
    return null;
  }
}

export function resolveWorkspace(runner, task) {
  const rawId = task?.workspaceId ? String(task.workspaceId).trim() : '';
  if (!rawId) return null;
  return bestEffort('resolve-workspace', () => {
    const registry = runner._getWorkspaceRegistry();
    if (!registry) return null;
    if (typeof registry.get === 'function') {
      const ws = registry.get(rawId);
      if (ws && typeof ws.attachSession === 'function') return ws;
    }
    if (typeof registry.list === 'function') {
      const list = registry.list();
      if (Array.isArray(list)) {
        const matched = list.find((w) => w && (w.id === rawId || w.path === rawId || w.title === rawId));
        if (matched && typeof matched.attachSession === 'function') return matched;
      }
    }
    return null;
  }) || null;
}

export function applyPermissionPreset(runner, task, handle) {
  if (!task.permissionPreset || task.permissionPreset === 'default') {
    runner._pinApprovalPolicy(handle);
    return;
  }
  const targetPreset = task.permissionPreset === 'full' ? 'danger-full-access' : task.permissionPreset;
  try {
    const presets = runner.ctx.get ? runner.ctx.get('permissionPresets') : runner.ctx.permissionPresets;
    if (presets && typeof presets.set === 'function') {
      presets.set(handle.agent.session, targetPreset);
    }
  } catch (ppErr) {
    logger.warn(`[dsh-cron] permission preset "${task.permissionPreset}" (target: "${targetPreset}") not applied to task ${task.id || ''}:`, ppErr.message);
  }
  runner._pinApprovalPolicy(handle);
}

export function pinApprovalPolicy(runner, handle) {
  try {
    const approval = runner.ctx.get ? runner.ctx.get('approval') : runner.ctx.approval;
    if (approval && typeof approval.setPolicy === 'function') {
      if (handle?.agent) {
        bestEffort('approval-set-policy-agent', () => approval.setPolicy(handle.agent, 'never'), logger);
      }
    }
  } catch (appErr) {
    logger.warn('[dsh-cron] approval setPolicy not applied:', appErr.message);
  }
}

export function nameSession(runner, task, handle, isResumed) {
  if (!handle?.agent?.session) return;
  const session = handle.agent.session;
  try {
    const sessionTitle = runner.ctx.get ? runner.ctx.get('sessionTitle') : runner.ctx.sessionTitle;
    if (!sessionTitle || typeof sessionTitle.rename !== 'function') return;

    const explicitTitle = task.sessionTitle ? String(task.sessionTitle).trim() : '';
    const taskTitle = task.title ? String(task.title).trim() : '';
    const ymd = formatDateYmd();

    let label = '';
    if (explicitTitle) {
      label = explicitTitle.replaceAll('{{date}}', ymd);
    } else if (taskTitle.startsWith('[')) {
      label = taskTitle.replaceAll('{{date}}', ymd);
    } else if (taskTitle) {
      label = `${ymd} ${taskTitle}`;
    }

    if (!label.trim()) return;
    if (isResumed && !explicitTitle) return;

    sessionTitle.rename(session, label.trim());
    logger.info(`[dsh-cron] assigned session title "${label.trim()}" for session ${session.id}`);
  } catch (titleErr) {
    logger.debug?.(`[dsh-cron] could not rename session ${session?.id}: ${titleErr.message}`);
  }
}

export function extractUsage(runner, handle, turnEvents = []) {
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let hasEventUsage = false;

  bestEffort('extract-session-events-usage', () => {
    const stepUsage = new Map();
    const failedAttempts = [];

    for (const ev of turnEvents) {
      if (!ev || !ev.type) continue;

      if (ev.type === 'assistant/chunk' && ev.data?.chunk?.type === 'usage' && ev.data.chunk.usage) {
        const u = ev.data.chunk.usage;
        const key = `${ev.data.turn || 0}:${ev.data.step || 0}`;
        if (!stepUsage.has(key)) {
          stepUsage.set(key, {
            inputTokens: Number(u.inputTokens || u.promptTokens || u.uncachedInputTokens) || 0,
            outputTokens: Number(u.outputTokens || u.completionTokens) || 0,
            cacheReadTokens: Number(u.cacheReadTokens || u.cachedTokens) || 0,
          });
          hasEventUsage = true;
        }
      }

      if (ev.type === 'assistant/message') {
        const u = ev.data?.usage || ev.data?.message?.usage;
        if (u) {
          const key = `${ev.data.turn || 0}:${ev.data.step || 0}`;
          stepUsage.set(key, {
            inputTokens: Number(u.inputTokens || u.promptTokens || u.uncachedInputTokens) || 0,
            outputTokens: Number(u.outputTokens || u.completionTokens) || 0,
            cacheReadTokens: Number(u.cacheReadTokens || u.cachedTokens) || 0,
          });
          hasEventUsage = true;
        }
      }

      if (ev.type === 'assistant/attempt') {
        let attemptUsage = null;
        if (ev.data?.usage) {
          const u = ev.data.usage;
          attemptUsage = {
            inputTokens: Number(u.inputTokens || u.promptTokens || u.uncachedInputTokens) || 0,
            outputTokens: Number(u.outputTokens || u.completionTokens) || 0,
            cacheReadTokens: Number(u.cacheReadTokens || u.cachedTokens) || 0,
          };
        }
        if (Array.isArray(ev.data?.stream)) {
          for (const item of ev.data.stream) {
            const u = item?.chunk?.usage || item?.usage;
            if (u) {
              if (!attemptUsage) {
                attemptUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
              }
              attemptUsage.inputTokens += Number(u.inputTokens || u.promptTokens || u.uncachedInputTokens) || 0;
              attemptUsage.outputTokens += Number(u.outputTokens || u.completionTokens) || 0;
              attemptUsage.cacheReadTokens += Number(u.cacheReadTokens || u.cachedTokens) || 0;
            }
          }
        }
        if (attemptUsage) {
          failedAttempts.push(attemptUsage);
          hasEventUsage = true;
        }
      }
    }

    if (hasEventUsage) {
      for (const item of stepUsage.values()) {
        usage.inputTokens += item.inputTokens;
        usage.outputTokens += item.outputTokens;
        usage.cacheReadTokens += item.cacheReadTokens;
      }
      for (const item of failedAttempts) {
        usage.inputTokens += item.inputTokens;
        usage.outputTokens += item.outputTokens;
        usage.cacheReadTokens += item.cacheReadTokens;
      }
    }
  });

  if (!hasEventUsage) {
    bestEffort('extract-session-usage-fallback', () => {
      const sessionUsage = handle?.agent?.session?.usage || handle?.agent?.usage;
      if (sessionUsage) {
        usage.inputTokens = Number(sessionUsage.inputTokens || sessionUsage.promptTokens) || 0;
        usage.outputTokens = Number(sessionUsage.outputTokens || sessionUsage.completionTokens) || 0;
        usage.cacheReadTokens = Number(sessionUsage.cacheReadTokens || sessionUsage.cachedTokens) || 0;
      }
    });
  }

  return usage;
}

export async function disposeAgentRun(runner, task, prep, handle) {
  if (handle?.__borrowedLive) {
    logger.info(`[dsh-cron] skipping disposal of borrowed live session: ${prep.targetSessionId}`);
    return;
  }
  let archivedSessionId = null;
  archivedSessionId = bestEffort('get-archived-session-id', () => {
    return (handle && handle.agent && handle.agent.session && handle.agent.session.id) || null;
  }) || null;
  try {
    if (handle && typeof handle.dispose === 'function') {
      await handle.dispose();
    } else if (handle && handle.agent && typeof handle.agent.destroy === 'function') {
      await handle.agent.destroy();
    }
  } catch (disposeErr) {
    logger.warn('[dsh-cron] session dispose notice:', disposeErr.message);
  }
  if (archivedSessionId && runner.ctx && !prep.targetSessionId) {
    await bestEffort('archive-session-cleanup', async () => {
      const registry = runner._getWorkspaceRegistry();
      if (registry && typeof registry.archiveSession === 'function') {
        await registry.archiveSession(archivedSessionId);
        return;
      }
      const sessions = typeof runner.ctx.get === 'function' ? runner.ctx.get('sessions') : null;
      if (sessions && typeof sessions.archive === 'function') {
        sessions.archive(archivedSessionId);
      }
    });
  }
  if (prep.taskWorktree && !task.keepWorktree) {
    await runner.removeTaskWorktree(prep.baseCwd, prep.taskWorktree);
  }
}

export function makeAbortRacer(signal) {
  const abortError = () => (signal && signal.reason) || new Error('Task aborted');
  return (promise) => {
    if (!signal) return promise;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
      }),
    ]);
  };
}

export async function resolveRunContext(runner, task) {
  const baseCwd = runner.resolveCwd(task);
  let cwd = baseCwd;
  let taskWorktree = null;
  if (task.worktree) {
    taskWorktree = await runner.createTaskWorktree(baseCwd, task);
    cwd = taskWorktree;
  }
  return { baseCwd, cwd, taskWorktree };
}

export function shapeAgentPrompt(task, runtime) {
  const prompt = String(task.prompt || '');
  if (runtime === 'skill' && task.skillName) {
    return `Use the DSH skill "${task.skillName}" for this task:\n${prompt}`;
  }
  if (runtime === 'workflow' && task.workflowName) {
    return `Execute this through the DSH workflow "${task.workflowName}" step by step:\n${prompt}`;
  }
  return prompt;
}

export async function runOriginalDispatch(runner, task, signal, options = {}) {
  const runtime = runner._normalizeTaskType ? runner._normalizeTaskType(task.type) : (task.type || 'llm');
  if ((runner._externalRuntimes && runner._externalRuntimes.includes(runtime)) || task.mode === 'no-llm') {
    return runner._runExternal(task, runtime === 'llm' ? 'script' : runtime, signal, options);
  }
  const agentsSvc2 = runner._getAgentsService();
  if (agentsSvc2 && typeof agentsSvc2.create === 'function') {
    return runner._runAgentSession(task, runtime, signal, options);
  }
  const sessionSvc2 = runner._getSessionService();
  if (sessionSvc2 && typeof sessionSvc2.create === 'function') {
    return runner._runLegacySession(task, options);
  }
  return runner._runBare(task, options);
}

export async function runLegacySession(runner, task) {
  try {
    const ymd = formatDateYmd();
    const explicit = task.sessionTitle ? String(task.sessionTitle).trim().replaceAll('{{date}}', ymd) : '';
    const legacyTitle = explicit || `[Cron] ${ymd} ${task.title}`;
    const session = await runner.ctx.session.create({
      title: legacyTitle,
      ephemeral: task.delivery === 'isolated',
    });
    if (session && typeof session.send === 'function') {
      const result = await session.send(task.prompt);
      const out = typeof result === 'string' ? result : JSON.stringify(result);
      const usage = session.usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
      return { output: out, usage, costUsd: 0 };
    }
  } catch (err) {
    logger.error(`[dsh-cron] session execution failed:`, err.message);
    throw err;
  }
  return runner._runBare(task);
}

export function runBare(task, execOptions = {}) {
  return {
    output: `[dsh-cron] Prompt triggered: "${task.prompt.slice(0, 100)}..."`,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    costUsd: 0,
  };
}
