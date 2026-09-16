import { bestEffort } from './best-effort.js';
/**
 * Helper to detect context window overflow errors in persistent sessions (#145).
 */
export function isContextOverflowError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('context length') ||
         msg.includes('context window') ||
         msg.includes('maximum context') ||
         msg.includes('too many tokens') ||
         msg.includes('prompt too long') ||
         msg.includes('token limit') ||
         msg.includes('context_length_exceeded') ||
         msg.includes('string_above_max_length');
}

/**
 * Cross-platform process tree killer (#145).
 * On Windows, calls `taskkill /pid <pid> /T /F` to terminate the entire process hierarchy.
 */
export function terminateProcessTree(child, sig = 'SIGTERM', { isPosix = process.platform !== 'win32', execFn } = {}) {
  if (!child || child.killed) return;
  bestEffort('terminate-process-tree', () => {
    if (isPosix && child.pid) {
      bestEffort('kill-posix-pid', () => process.kill(-child.pid, sig));
    } else if (child.pid) {
      const runner = execFn || ((cmd) => {
        bestEffort('exec-taskkill-fn', () => {
          import('node:child_process').then(({ exec }) => {
            exec(cmd, { windowsHide: true }, () => {});
          }).catch(() => {});
        });
      });
      bestEffort('exec-taskkill', () => runner(`taskkill /pid ${child.pid} /T /F`));
      bestEffort('child-kill', () => child.kill(sig));
    }
  });
}

/**
 * Helper to test if an error code or status is transient and eligible for retry (#134).
 */
export function isTransientError(errOrStatus) {
  if (typeof errOrStatus === 'number') {
    return errOrStatus === 429 || errOrStatus === 502 || errOrStatus === 503 || errOrStatus === 504;
  }
  const str = String(errOrStatus?.message || errOrStatus || '').toLowerCase();
  return str.includes('429') || str.includes('too many requests') ||
         str.includes('502') || str.includes('bad gateway') ||
         str.includes('503') || str.includes('service unavailable') ||
         str.includes('504') || str.includes('gateway timeout') ||
         str.includes('econnreset') || str.includes('etimedout');
}

import { estimateTokenCost } from './integrations.js';
import {
  EXTERNAL_RUNTIMES,
  normalizeTaskType,
  buildInvocation,
} from './runtimes.js';

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

  /**
   * Resolve the working directory for a task: explicit cwd, a bound
   * workspace id resolved through the harness, or the process cwd (#31).
   */
  resolveCwd(task) {
    if (task.cwd) return String(task.cwd);
    if (task.workspaceId && this.ctx && typeof this.ctx.get === 'function') {
      const resolved = bestEffort('resolve-workspace-path', () => {
        const workspaces = this.ctx.get('workspaces');
        const ws = workspaces && (typeof workspaces.get === 'function'
          ? workspaces.get(task.workspaceId)
          : (workspaces[task.workspaceId] || null));
        return ws && (ws.path || ws.cwd || ws.root || ws.dir);
      });
      if (resolved) return String(resolved);
      return String(task.workspaceId);
    }
    return process.cwd();
  }

  /** Create an isolated git worktree for a code-modifying task (#29). */
  async createTaskWorktree(cwd, task) {
    const { execFile } = await import('node:child_process');
    const path = await import('node:path');
    const wtPath = path.join(cwd, '.dsh-cron-worktrees', `${task.id}-${Date.now()}`);
    await new Promise((resolve, reject) => {
      execFile('git', ['-C', cwd, 'worktree', 'add', '--detach', wtPath, 'HEAD'], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error(String(stderr || err.message).trim()));
        else resolve(stdout);
      });
    });
    return wtPath;
  }

  /**
   * Remove a task worktree; never throws (best-effort cleanup).
   * Plain removal only — no force flags anywhere (workspace rule). A dirty
   * worktree is left in place and reported instead of being force-deleted.
   */
  async removeTaskWorktree(cwd, wtPath) {
    const { execFile } = await import('node:child_process');
    await new Promise((resolve) => {
      execFile('git', ['-C', cwd, 'worktree', 'remove', wtPath], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          console.warn(`[dsh-cron] task worktree kept (not removable without force): ${wtPath} — ${String(stderr || err.message).trim()}`);
        }
        execFile('git', ['-C', cwd, 'worktree', 'prune'], () => resolve());
      });
    });
  }

  /** HTTP trigger runtime (#7) with transient retry (#134). */
  async _runHttp(task, request, signal) {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        const res = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal,
        });
        const text = await res.text().catch(() => '');
        const summary = `${request.method} ${request.url} -> ${res.status} ${res.statusText || ''}`.trim();
        if (!res.ok) {
          const err = new Error(`${summary}\n${String(text).slice(0, 500)}`);
          if (isTransientError(res.status) && attempts < maxAttempts && !signal?.aborted) {
            console.warn(`[dsh-cron] HTTP request returned ${res.status}, retrying attempt ${attempts + 1}/${maxAttempts}...`);
            await new Promise((r) => setTimeout(r, attempts * 1000));
            continue;
          }
          throw err;
        }
        return {
          output: `${summary}\n${String(text).trim().slice(0, 4000)}`.trim(),
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        };
      } catch (err) {
        if (isTransientError(err) && attempts < maxAttempts && !signal?.aborted) {
          console.warn(`[dsh-cron] HTTP request failed (${err.message}), retrying attempt ${attempts + 1}/${maxAttempts}...`);
          await new Promise((r) => setTimeout(r, attempts * 1000));
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * #9 reuse-first path: when the task names a dsh-remote-workspace profile,
   * execute through that plugin's `remoteSsh` service so host settings and
   * credentials stay owned by it (we only reference the profile id).
   * Returns null when the service or the profile is unavailable so the caller
   * can fall back to a direct ssh invocation.
   */
  async _runViaRemoteWorkspace(task, signal) {
    if (!task.sshProfileId || !this.ctx || typeof this.ctx.get !== 'function') return null;
    let svc = null;
    svc = bestEffort('get-remoteSsh', () => this.ctx.get('remoteSsh'));
    if (!svc || typeof svc.exec !== 'function') return null;

    let profile = null;
    profile = bestEffort('get-remoteSsh-profile', () => {
      const settings = this.ctx.get('settings');
      if (settings && typeof settings.get === 'function') {
        const snap = settings.get('dsh-remote-workspace');
        const profiles = snap && Array.isArray(snap.profiles) ? snap.profiles : [];
        return profiles.find((p) => p && p.id === task.sshProfileId) || null;
      }
      return null;
    });
    if (!profile) {
      throw new Error(`remote-workspace profile "${task.sshProfileId}" was not found — check dsh-remote-workspace settings, or use sshTarget instead`);
    }
    const res = await svc.exec(profile, String(task.prompt || 'true'), task.cwd || profile.remoteWorkspace || undefined);
    const output = [res && res.stdout, res && res.stderr].filter((x) => x && String(x).trim()).join('\n').trim();
    const code = res && typeof res.code === 'number' ? res.code : 0;
    if (code !== 0) {
      throw new Error(`Remote command exited with code ${code}\n${output}`.slice(0, 4000));
    }
    return {
      output: output || 'Remote command completed with code 0',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    };
  }

  /** Non-LLM runtimes: shell, Node.js, Python, HTTP, SSH, Docker (#4 #5 #7 #8 #9). */
  async _runExternal(task, runtime, signal, execOptions = {}) {
    if (runtime === 'ssh' && task.sshProfileId) {
      const viaService = await this._runViaRemoteWorkspace(task, signal);
      if (viaService) return viaService;
      if (!task.sshTarget) {
        throw new Error('SSH task needs either a working dsh-remote-workspace profile (sshProfileId) or an sshTarget');
      }
    }
    const cwd = this.resolveCwd(task);
    const invocation = buildInvocation({ ...task, type: runtime }, cwd);
    if (invocation.http) return this._runHttp(task, invocation.http, signal);

    const { spawn, exec } = await import('node:child_process');
    return new Promise((resolve, reject) => {
      let child = null;
      let settled = false;
      let stdout = '';
      let stderr = '';
      const maxBuffer = 10 * 1024 * 1024;
      const isPosix = process.platform !== 'win32';

      const killProcessTree = (sig = 'SIGTERM') => {
        terminateProcessTree(child, sig, {
          isPosix,
          execFn: (cmd) => {
            bestEffort('exec-cmd', () => exec(cmd, { windowsHide: true }, () => {}));
          }
        });
      };

      const abortHandler = () => {
        killProcessTree('SIGTERM');
        setTimeout(() => killProcessTree('SIGKILL'), 300);
      };

      if (signal) {
        if (signal.aborted) {
          return reject(signal.reason || new Error('Command aborted'));
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      const runEnv = { ...invocation.env };
      if (execOptions?.prevOutput !== undefined) {
        runEnv.DSH_PREV_OUTPUT = String(execOptions.prevOutput);
      }
      const options = {
        cwd,
        env: runEnv,
        detached: isPosix,
        stdio: ['ignore', 'pipe', 'pipe'],
      };

      if (invocation.file) {
        child = spawn(invocation.file, invocation.args || [], options);
      } else {
        const shellPath = isPosix ? (process.env.SHELL || '/bin/bash') : (process.env.ComSpec || 'cmd.exe');
        const shellArgs = isPosix ? ['-c', invocation.shellCommand] : ['/d', '/s', '/c', invocation.shellCommand];
        child = spawn(shellPath, shellArgs, options);
      }

      child.stdout.on('data', (chunk) => {
        if (stdout.length < maxBuffer) stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        if (stderr.length < maxBuffer) stderr += chunk;
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', abortHandler);
        reject(err);
      });

      child.on('close', (code, sig) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', abortHandler);

        if (signal && signal.aborted) {
          return reject(signal.reason || new Error('Command aborted'));
        }

        if (code !== 0 && code !== null) {
          const detail = String(stderr || '').trim();
          const msg = `${runtime} task exited with code ${code}`;
          return reject(new Error(detail ? `${msg}\n${detail}` : msg));
        }

        const out = (stdout || stderr || '').trim();
        resolve({
          output: out || `${runtime} task completed with code 0`,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        });
      });
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
      return `Use the DSH skill "${task.skillName}" for this task:
${prompt}`;
    }
    if (runtime === 'workflow' && task.workflowName) {
      return `Execute this through the DSH workflow "${task.workflowName}" step by step:
${prompt}`;
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
