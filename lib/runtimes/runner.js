import { executeAgentTurn } from "./runner-turn.js";
import { logStreamer } from '../log-streamer.js';
import { logger } from '../logger.js';
import { bestEffort } from '../best-effort.js';
import { estimateTokenCost } from '../integrations.js';
import { resolveDynamicCredentialsInText, resolveDynamicCredentialsInObject } from '../secrets.js';
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

import {
  formatDateYmd,
  resolveTargetSessionId,
  getAgentsService,
  getSessionService,
  getWorkspaceRegistry,
  resolveWorkspace,
  applyPermissionPreset,
  pinApprovalPolicy,
  nameSession,
  extractUsage,
  disposeAgentRun,
  makeAbortRacer,
  resolveRunContext,
  shapeAgentPrompt,
  runOriginalDispatch,
  runLegacySession,
  runBare,
} from './runner-session.js';

export {
  formatDateYmd,
  resolveTargetSessionId,
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
export class SessionRunner {
  constructor(ctx, store = null) {
    this.ctx = ctx;
    this.store = store;
  }

  _getAgentsService() {
    return getAgentsService(this.ctx);
  }

  _getSessionService() {
    return getSessionService(this.ctx);
  }

  _getWorkspaceRegistry() {
    return getWorkspaceRegistry(this.ctx);
  }

  _resolveWorkspace(task) {
    return resolveWorkspace(this, task);
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

    const streamRunId = options.runId || `run_${Date.now()}`;
    logStreamer.startStream(task.id, streamRunId);
    logStreamer.appendLog(task.id, `[dsh-cron] Starting task "${task.title}" (type: ${task.type || 'llm'})
`, 'stdout');

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutErr = new Error(`Task execution timed out after ${timeoutSeconds} seconds`);
        controller.abort(timeoutErr);
        reject(timeoutErr);
      }, timeoutMs);
    });

    const executionPromise = this._run(task, controller.signal, options);

    try {
      const res = await Promise.race([executionPromise, timeoutPromise]);
      logStreamer.appendLog(task.id, `
[dsh-cron] Task execution finished
`, 'stdout');
      logStreamer.completeStream(task.id, { status: 'success' });
      return res;
    } catch (err) {
      logStreamer.appendLog(task.id, `
[dsh-cron] Task execution error: ${err.message}
`, 'stderr');
      logStreamer.completeStream(task.id, { status: 'error', error: err.message });
      throw err;
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
    logger.info(`[dsh-cron] executing task "${task.title}" (${task.id})`);

    // Dynamic credentials resolution in-memory (#335)
    let effectiveTask = task;
    const resolvedSecrets = [];
    const settings = (this.store && typeof this.store.getSettings === 'function')
      ? this.store.getSettings()
      : {};

    if (settings.enableDynamicCredentials) {
      effectiveTask = { ...task };
      if (typeof effectiveTask.prompt === 'string') {
        const res = await resolveDynamicCredentialsInText(effectiveTask.prompt, this.ctx);
        effectiveTask.prompt = res.text;
        resolvedSecrets.push(...res.resolvedSecrets);
      }
      if (typeof effectiveTask.script === 'string') {
        const res = await resolveDynamicCredentialsInText(effectiveTask.script, this.ctx);
        effectiveTask.script = res.text;
        resolvedSecrets.push(...res.resolvedSecrets);
      }
      if (typeof effectiveTask.command === 'string') {
        const res = await resolveDynamicCredentialsInText(effectiveTask.command, this.ctx);
        effectiveTask.command = res.text;
        resolvedSecrets.push(...res.resolvedSecrets);
      }
      if (typeof effectiveTask.httpUrl === 'string') {
        const res = await resolveDynamicCredentialsInText(effectiveTask.httpUrl, this.ctx);
        effectiveTask.httpUrl = res.text;
        resolvedSecrets.push(...res.resolvedSecrets);
      }
      if (typeof effectiveTask.httpBody === 'string') {
        const res = await resolveDynamicCredentialsInText(effectiveTask.httpBody, this.ctx);
        effectiveTask.httpBody = res.text;
        resolvedSecrets.push(...res.resolvedSecrets);
      }
      if (effectiveTask.httpHeaders) {
        const res = await resolveDynamicCredentialsInObject(effectiveTask.httpHeaders, this.ctx);
        effectiveTask.httpHeaders = res.data;
        resolvedSecrets.push(...res.resolvedSecrets);
      }
      if (effectiveTask.env) {
        const res = await resolveDynamicCredentialsInObject(effectiveTask.env, this.ctx);
        effectiveTask.env = res.data;
        resolvedSecrets.push(...res.resolvedSecrets);
      }
    }

    const maskSecrets = (result) => {
      if (!result || typeof result !== 'object') return result;
      if (resolvedSecrets.length > 0 && typeof result.output === 'string') {
        let out = result.output;
        for (const secret of resolvedSecrets) {
          if (secret && String(secret).length >= 4 && out.includes(secret)) {
            out = out.replaceAll(secret, '[REDACTED_CREDENTIAL]');
          }
        }
        result.output = out;
      }
      return result;
    };

    const runInternal = async () => {
      // 1. Non-LLM runtimes: shell, Node.js, Python, HTTP, SSH, Docker (#4 #5 #7 #8 #9)
      const runtime = normalizeTaskType(effectiveTask.type);
      if (EXTERNAL_RUNTIMES.includes(runtime) || effectiveTask.mode === 'no-llm') {
        return this._runExternal(effectiveTask, runtime === 'llm' ? 'script' : runtime, signal, options);
      }

      // 2. Agent session, when the harness exposes one
      const agentsSvc = this._getAgentsService();
      if (agentsSvc && typeof agentsSvc.create === 'function') {
        return this._runAgentSession(effectiveTask, runtime, signal, options);
      }

      // 3. Legacy session service
      const sessionSvc = this._getSessionService();
      if (sessionSvc && typeof sessionSvc.create === 'function') {
        return this._runLegacySession(effectiveTask, options);
      }

      // 4. Nothing to run through: report the prompt as triggered
      return this._runBare(effectiveTask, options);
    };

    try {
      const outcome = await runInternal();
      return maskSecrets(outcome);
    } catch (err) {
      if (resolvedSecrets.length > 0 && err && err.message) {
        for (const secret of resolvedSecrets) {
          if (secret && String(secret).length >= 4 && err.message.includes(secret)) {
            err.message = err.message.replaceAll(secret, '[REDACTED_CREDENTIAL]');
          }
        }
      }
      throw err;
    }
  }

  // Legacy dispatch replaced above; original runner helpers remain unchanged below:
  _normalizeTaskType(t) { return normalizeTaskType(t); }
  get _externalRuntimes() { return EXTERNAL_RUNTIMES; }

  async _runOriginalDispatch(task, signal, options = {}) {
    return runOriginalDispatch(this, task, signal, options);
  }

  async _runLegacySession(task, options = {}) {
    return runLegacySession(this, task, options);
  }

  _runBare(task, execOptions = {}) {
    return runBare(task, execOptions);
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
        logger.warn(`[dsh-cron] Persistent session "${prep.targetSessionId}" exceeded context window (${err.message}). Auto-recovering with fresh session...`);
        // workspace attach & archive: the host SessionStore has no archive() method — the durable
        // archive set lives on the workspaceRegistry. Archive the exhausted
        // session there (the dispose in _executeAgentTurn's finally has already
        // run, so the session is inactive).
        await bestEffort('archive-rotated-session', async () => {
          const registry = this._getWorkspaceRegistry();
          if (registry && typeof registry.archiveSession === 'function') {
            await registry.archiveSession(prep.targetSessionId);
            return;
          }
          const sessions = this.ctx?.get?.('sessions');
          if (sessions && typeof sessions.archive === 'function') {
            sessions.archive(prep.targetSessionId);
          }
        });
        const rotatedSessionId = `${prep.targetSessionId}-${Date.now().toString(36)}`;
        logger.info(`[dsh-cron] Rotated persistent session "${prep.targetSessionId}" -> "${rotatedSessionId}"`);
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
      logger.error(`[dsh-cron] agent execution failed:`, err.message);
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

    const mintSessionId = ({ fresh = false } = {}) => {
      if (targetSessionId && !fresh) {
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
    return makeAbortRacer(signal);
  }

  async _resolveRunContext(task) {
    return resolveRunContext(this, task);
  }

  _shapeAgentPrompt(task, runtime) {
    return shapeAgentPrompt(task, runtime);
  }

  async _executeAgentTurn(task, prep) {
    return executeAgentTurn(this, task, prep);
  }

  _applyPermissionPreset(task, handle) {
    return applyPermissionPreset(this, task, handle);
  }

  _pinApprovalPolicy(handle) {
    return pinApprovalPolicy(this, handle);
  }

  _nameSession(task, handle, isResumed) {
    return nameSession(this, task, handle, isResumed);
  }

  _extractUsage(handle, turnEvents = []) {
    return extractUsage(this, handle, turnEvents);
  }

  async _disposeAgentRun(task, prep, handle) {
    return disposeAgentRun(this, task, prep, handle);
  }
}
