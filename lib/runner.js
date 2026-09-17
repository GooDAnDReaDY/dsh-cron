import { bestEffort } from './best-effort.js';
import { estimateTokenCost } from './integrations.js';
import {
  EXTERNAL_RUNTIMES,
  normalizeTaskType,
} from './runtimes.js';
import {
  isContextOverflowError,
  terminateProcessTree,
  isTransientError,
  runHttp,
  runViaRemoteWorkspace,
  runExternal,
} from './runner-external.js';
import {
  resolveCwd,
  createTaskWorktree,
  removeTaskWorktree,
} from './runner-worktree.js';

export {
  isContextOverflowError,
  terminateProcessTree,
  isTransientError,
  resolveCwd,
  createTaskWorktree,
  removeTaskWorktree,
};

/**
 * Runner executing scheduled tasks in DeepSeek Harness sessions.
 */

/**
 * Resolves the effective target session ID taking into account rotation policies (#143).
 * Supports {{date}} interpolation, 'daily' rotation (adds -YYYY-MM-DD), and 'weekly' rotation (-YYYY-Www).
 */
export function resolveTargetSessionId(targetSessionId, resetPolicy = 'never', date = new Date()) {
  if (!targetSessionId || typeof targetSessionId !== 'string') return null;
  let baseId = targetSessionId.trim();
  if (!baseId) return null;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyymmdd = `${yyyy}-${mm}-${dd}`;

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

export class SessionRunner {
  constructor(ctx, store = null) {
    this.ctx = ctx;
    this.store = store;
  }

  async execute(task, options = {}) {
    const timeoutSeconds = Number(task.timeoutSeconds) > 0 ? Number(task.timeoutSeconds) : 1800;
    const timeoutMs = timeoutSeconds * 1000;
    const externalSignal = options.signal;

    // Internal abort controller combining external signal + timeout
    const controller = new AbortController();
    let timeoutId = null;

    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new Error(externalSignal.reason?.message || 'Task aborted before execution');
      }
      externalSignal.addEventListener('abort', () => {
        controller.abort(externalSignal.reason || new Error('Task aborted by overlap policy'));
      }, { once: true });
    }

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutErr = new Error(`Task execution timed out after ${timeoutSeconds} seconds`);
        controller.abort(timeoutErr);
        reject(timeoutErr);
      }, timeoutMs);
    });

    const executionPromise = this._run(task, controller.signal, options);

    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /** Resolve working directory for task via runner-worktree */
  resolveCwd(task) {
    return resolveCwd(task, this.ctx);
  }

  /** Create isolated worktree via runner-worktree */
  async createTaskWorktree(cwd, task) {
    return createTaskWorktree(cwd, task);
  }

  /** Remove isolated worktree via runner-worktree */
  async removeTaskWorktree(cwd, wtPath) {
    return removeTaskWorktree(cwd, wtPath);
  }

  /** HTTP trigger runtime via runner-external */
  async _runHttp(task, request, signal) {
    return runHttp(task, request, signal);
  }

  /** Remote workspace execution via runner-external */
  async _runViaRemoteWorkspace(task, signal) {
    return runViaRemoteWorkspace(task, signal, this.ctx);
  }

  /** Non-LLM external runtimes via runner-external */
  async _runExternal(task, runtime, signal, execOptions = {}) {
    return runExternal(task, runtime, signal, execOptions, {
      ctx: this.ctx,
      resolveCwdFn: (t) => this.resolveCwd(t),
    });
  }

  async _run(task, signal, options = {}) {
    console.log(`[dsh-cron] executing task "${task.title}" (${task.id})`);

    // 1. Non-LLM runtimes: shell, Node.js, Python, HTTP, SSH, Docker (#4 #5 #7 #8 #9)
    const runtime = normalizeTaskType(task.type);
    if (EXTERNAL_RUNTIMES.includes(runtime) || task.mode === 'no-llm') {
      return this._runExternal(task, runtime === 'llm' ? 'script' : runtime, signal, options);
    }

    // 2. Agent session, when the harness exposes one
    if (this.ctx && this.ctx.agents && typeof this.ctx.agents.create === 'function') {
      return this._runAgentSession(task, runtime, signal, options);
    }

    // 3. Legacy session service
    if (this.ctx && this.ctx.session && typeof this.ctx.session.create === 'function') {
      return this._runLegacySession(task, options);
    }

    // 4. Nothing to run through: report the prompt as triggered
    return this._runBare(task, options);
  }

  /** Legacy session service path; falls back to the bare report. */
  async _runLegacySession(task) {
    try {
      const session = await this.ctx.session.create({
        title: `[Cron] ${task.title}`,
        ephemeral: task.delivery === 'isolated',
      });
      if (session && typeof session.send === 'function') {
        const result = await session.send(task.prompt);
        const out = typeof result === 'string' ? result : JSON.stringify(result);
        const usage = session.usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
        return { output: out, usage, costUsd: estimateTokenCost(task.model, usage) };
      }
    } catch (err) {
      console.error(`[dsh-cron] session execution failed:`, err.message);
      throw err;
    }
    return this._runBare(task);
  }

  _runBare(task, execOptions = {}) {
    return {
      output: `[dsh-cron] Prompt triggered: "${task.prompt.slice(0, 100)}..."`,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    };
  }

  async _runAgentSession(task, runtime, signal, execOptions = {}) {
    let effectiveTask = task;
    if (execOptions?.prevOutput) {
      const prev = String(execOptions.prevOutput);
      const prompt = task.prompt || '';
      const newPrompt = prompt.includes('{{prevOutput}}')
        ? prompt.replaceAll('{{prevOutput}}', prev)
        : `[Previous Output]:\n${prev}\n\n${prompt}`;
      effectiveTask = { ...task, prompt: newPrompt };
    }
    const prep = await this._prepareAgentRun(effectiveTask, runtime, signal);
    try {
      return await this._executeAgentTurn(task, prep);
    } catch (err) {
      // Context window overflow auto-recovery in persistent sessions (#145)
      if (prep.targetSessionId && isContextOverflowError(err) && !signal?.aborted) {
        console.warn(`[dsh-cron] Persistent session "${prep.targetSessionId}" exceeded context window (${err.message}). Auto-recovering with fresh session...`);
        bestEffort('archive-rotated-session', () => {
          const sessions = this.ctx?.get?.('sessions');
          if (sessions && typeof sessions.archive === 'function') {
            sessions.archive(prep.targetSessionId);
          }
        });
        const rotatedSessionId = `${prep.targetSessionId}-${Date.now().toString(36)}`;
        console.log(`[dsh-cron] Rotated persistent session "${prep.targetSessionId}" -> "${rotatedSessionId}"`);
        if (this.store) {
          bestEffort('update-stored-rotated-session', () => {
            const stored = this.store.get(task.id);
            if (stored) {
              stored.targetSessionId = rotatedSessionId;
              this.store.set(stored);
            }
          });
        }
        task.targetSessionId = rotatedSessionId;
        effectiveTask.targetSessionId = rotatedSessionId;
        const freshPrep = await this._prepareAgentRun(effectiveTask, runtime, signal);
        return await this._executeAgentTurn(task, freshPrep);
      }
      console.error(`[dsh-cron] agent execution failed:`, err.message);
      throw err;
    }
  }

  /** Everything an agent run needs before the session is created. */
  async _prepareAgentRun(task, runtime, signal) {
    const { randomUUID } = await import('node:crypto');
    let createUserMessage = (m) => m;
    const llmModule = await bestEffort('import-dsh-llm', () => import('@deepseek-ai/dsh-llm'));
    if (llmModule && typeof llmModule.createUserMessage === 'function') {
      createUserMessage = llmModule.createUserMessage;
    }
    const sessionModule = await bestEffort('import-dsh-session', () => import('@deepseek-ai/dsh-session'));

    const targetSessionId = resolveTargetSessionId(task.targetSessionId, task.targetSessionReset);

    const mintSessionId = () => {
      if (targetSessionId) {
        if (sessionModule && typeof sessionModule.SessionId === 'function') {
          return sessionModule.SessionId(targetSessionId);
        }
        return targetSessionId;
      }
      const sid = `cron-exec-${task.id}-${randomUUID()}`;
      if (sessionModule && typeof sessionModule.SessionId === 'function') {
        return sessionModule.SessionId(sid);
      }
      return sid;
    };

    const defaultSel = this.ctx.get?.('agentDefaultModel')?.currentSelection?.();
    return {
      createUserMessage,
      mintSessionId,
      targetSessionId,
      provider: task.provider || defaultSel?.provider,
      model: task.model || defaultSel?.model || undefined,
      ...(await this._resolveRunContext(task)),
      agentPrompt: this._shapeAgentPrompt(task, runtime),
      raceAbort: this._makeAbortRacer(signal),
    };
  }

  /**
   * The agent session cannot take the AbortSignal natively, so any abort
   * (timeout, overlap replace, pause, scheduler stop) races against the session
   * awaits and forces an immediate dispose (#88).
   */
  _makeAbortRacer(signal) {
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

  /** Working directory for the run, in an isolated worktree when requested (#29). */
  async _resolveRunContext(task) {
    const baseCwd = this.resolveCwd(task);
    let cwd = baseCwd;
    let taskWorktree = null;
    if (task.worktree) {
      try {
        taskWorktree = await this.createTaskWorktree(baseCwd, task);
        cwd = taskWorktree;
      } catch (wtErr) {
        console.warn('[dsh-cron] task worktree not created, running in the workspace:', wtErr.message);
      }
    }
    return { baseCwd, cwd, taskWorktree };
  }

  /** #6/#10: skill- and workflow-driven tasks name the skill/workflow. */
  _shapeAgentPrompt(task, runtime) {
    const prompt = String(task.prompt || '');
    if (runtime === 'skill' && task.skillName) {
      return `Use the DSH skill "${task.skillName}" for this task:\n${prompt}`;
    }
    if (runtime === 'workflow' && task.workflowName) {
      return `Execute this through the DSH workflow "${task.workflowName}" step by step:\n${prompt}`;
    }
    return prompt;
  }

  /** Create the session, drive one turn, and always clean up. */
  async _executeAgentTurn(task, prep) {
    let handle = null;
    let isResumed = false;
    try {
      // Resolve agent preset (#GH-1): scheduled llm sessions must join an agent preset
      // (default or task-configured), otherwise tools resolve against the empty global layer.
      const presets = this.ctx.agentPresets || (this.ctx.get && this.ctx.get('agentPresets'));
      let preset = null;
      if (presets && typeof presets.resolve === 'function') {
        try {
          preset = await presets.resolve(task.agentPreset || undefined);
          if (preset && typeof presets.standingKeyFor === 'function') {
            await presets.standingKeyFor(preset.id);
          }
        } catch (presetErr) {
          console.warn('[dsh-cron] agent preset unavailable, running without one:', presetErr && presetErr.message);
          preset = null;
        }
      }

      const presetSetup = preset ? {
        setup: async (agentCtx) => {
          if (typeof presets.mount === 'function') {
            await presets.mount(agentCtx, preset.id);
          }
        }
      } : {};

      // If targetSessionId is set, attempt to resume the existing session (#143)
      if (prep.targetSessionId && this.ctx.agents && typeof this.ctx.agents.resume === 'function') {
        try {
          handle = await this.ctx.agents.resume({
            sessionId: prep.targetSessionId,
            meta: {
              cwd: prep.cwd,
              ...(preset ? { agentPreset: preset.id } : {})
            },
            agentOptions: prep.provider && prep.model ? { provider: prep.provider, model: prep.model } : undefined,
            ...presetSetup,
          });
          isResumed = true;
          console.log(`[dsh-cron] resumed existing persistent session: ${prep.targetSessionId}`);
        } catch (resumeErr) {
          console.log(`[dsh-cron] could not resume session ${prep.targetSessionId} (${resumeErr.message}), creating new persistent session`);
          handle = null;
        }
      }

      // Create new session if not resumed
      if (!handle) {
        handle = await this.ctx.agents.create({
          sessionId: prep.mintSessionId(),
          meta: {
            cwd: prep.cwd,
            ephemeral: !prep.targetSessionId,
            internal: !prep.targetSessionId,
            ...(preset ? { agentPreset: preset.id } : {})
          },
          agentOptions: prep.provider && prep.model ? { provider: prep.provider, model: prep.model } : undefined,
          ...presetSetup,
        });
      }

      this._applyPermissionPreset(task, handle);
      await prep.raceAbort(handle.agent.whenIdle());
      handle.agent.followup(prep.createUserMessage({
        content: [{ type: 'text', text: prep.agentPrompt }],
        source: { kind: 'plugin', plugin: 'dsh-cron', form: 'cron-execute' },
      }));
      // Await agent turn completion (#67), abortable on timeout/overlap (#88)
      if (typeof handle.agent.whenIdle === 'function') {
        await prep.raceAbort(handle.agent.whenIdle());
      }
      const usage = this._extractUsage(handle);
      const sessionNote = isResumed
        ? `resumed: ${prep.targetSessionId}`
        : `session: ${handle.agent.session?.id || 'cron'}`;
      return {
        output: `[dsh-cron] Agent finished turn for task "${task.title}" (${sessionNote})`,
        usage,
        costUsd: estimateTokenCost(prep.model, usage),
        sessionId: handle.agent.session?.id || null,
      };
    } finally {
      await this._disposeAgentRun(task, prep, handle);
    }
  }

  /** Per-job permission preset (#32): read-only | workspace-write | full. */
  _applyPermissionPreset(task, handle) {
    if (!task.permissionPreset || task.permissionPreset === 'default') return;
    try {
      const presets = this.ctx.get && this.ctx.get('permissionPresets');
      if (presets && typeof presets.set === 'function') {
        presets.set(handle.agent.session, task.permissionPreset);
      }
    } catch (ppErr) {
      console.warn('[dsh-cron] permission preset not applied:', ppErr.message);
    }
  }

  /** Token usage reported by the session, when the core exposes it. */
  _extractUsage(handle) {
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    bestEffort('extract-session-usage', () => {
      const sessionUsage = handle.agent.session?.usage || handle.agent.usage;
      if (sessionUsage) {
        usage.inputTokens = sessionUsage.inputTokens || sessionUsage.promptTokens || 0;
        usage.outputTokens = sessionUsage.outputTokens || sessionUsage.completionTokens || 0;
        usage.cacheReadTokens = sessionUsage.cacheReadTokens || sessionUsage.cachedTokens || 0;
      }
    });
    return usage;
  }

  /** Dispose the session, archive it best-effort, drop the worktree (#30, #29). */
  async _disposeAgentRun(task, prep, handle) {
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
      console.warn('[dsh-cron] session dispose notice:', disposeErr.message);
    }
    // Best-effort: keep ephemeral cron sessions out of the main chat list (#30).
    // Persistent sessions (targetSessionId configured) stay unarchived so users can interact with them (#143).
    if (archivedSessionId && this.ctx && this.ctx.get && !prep.targetSessionId) {
      bestEffort('archive-session-cleanup', () => {
        const sessions = this.ctx.get('sessions');
        if (sessions && typeof sessions.archive === 'function') {
          sessions.archive(archivedSessionId);
        }
      });
    }
    // #29: dispose the isolated worktree (kept when keepWorktree is set).
    if (prep.taskWorktree && !task.keepWorktree) {
      await this.removeTaskWorktree(prep.baseCwd, prep.taskWorktree);
    }
  }
}

