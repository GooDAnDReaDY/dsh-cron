import { estimateTokenCost } from './integrations.js';
import {
  EXTERNAL_RUNTIMES,
  normalizeTaskType,
  buildInvocation,
} from './runtimes.js';

/**
 * Runner executing scheduled tasks in DeepSeek Harness sessions.
 */
export class SessionRunner {
  constructor(ctx) {
    this.ctx = ctx;
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

    const executionPromise = this._run(task, controller.signal);

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
      try {
        const workspaces = this.ctx.get('workspaces');
        const ws = workspaces && (typeof workspaces.get === 'function'
          ? workspaces.get(task.workspaceId)
          : (workspaces[task.workspaceId] || null));
        const resolved = ws && (ws.path || ws.cwd || ws.root || ws.dir);
        if (resolved) return String(resolved);
      } catch {}
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

  /** HTTP trigger runtime (#7). */
  async _runHttp(task, request, signal) {
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
    });
    const text = await res.text().catch(() => '');
    const summary = `${request.method} ${request.url} -> ${res.status} ${res.statusText || ''}`.trim();
    if (!res.ok) {
      throw new Error(`${summary}\n${String(text).slice(0, 500)}`);
    }
    return {
      output: `${summary}\n${String(text).trim().slice(0, 4000)}`.trim(),
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    };
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
    try {
      svc = this.ctx.get('remoteSsh');
    } catch {}
    if (!svc || typeof svc.exec !== 'function') return null;

    let profile = null;
    try {
      const settings = this.ctx.get('settings');
      if (settings && typeof settings.get === 'function') {
        const snap = settings.get('dsh-remote-workspace');
        const profiles = snap && Array.isArray(snap.profiles) ? snap.profiles : [];
        profile = profiles.find((p) => p && p.id === task.sshProfileId) || null;
      }
    } catch {}
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
  async _runExternal(task, runtime, signal) {
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

    const { exec, execFile } = await import('node:child_process');
    return new Promise((resolve, reject) => {
      const done = (err, stdout, stderr) => {
        if (err) {
          if (signal && signal.aborted) {
            return reject(signal.reason || new Error('Command aborted'));
          }
          const detail = String(stderr || '').trim();
          return reject(new Error(detail ? `${err.message}\n${detail}` : err.message));
        }
        const out = (stdout || stderr || '').trim();
        resolve({
          output: out || `${runtime} task completed with code 0`,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        });
      };
      const options = { cwd, signal, maxBuffer: 10 * 1024 * 1024, env: invocation.env };
      if (invocation.file) {
        execFile(invocation.file, invocation.args || [], options, done);
      } else {
        const shellPath = process.platform === 'win32' ? undefined : (process.env.SHELL || '/bin/bash');
        exec(invocation.shellCommand, { ...options, shell: shellPath }, done);
      }
    });
  }

  async _run(task, signal) {
    console.log(`[dsh-cron] executing task "${task.title}" (${task.id})`);

    // 1. Non-LLM runtimes: shell, Node.js, Python, HTTP, SSH, Docker (#4 #5 #7 #8 #9)
    const runtime = normalizeTaskType(task.type);
    if (EXTERNAL_RUNTIMES.includes(runtime) || task.mode === 'no-llm') {
      return this._runExternal(task, runtime === 'llm' ? 'script' : runtime, signal);
    }

    // 2. Agent session, when the harness exposes one
    if (this.ctx && this.ctx.agents && typeof this.ctx.agents.create === 'function') {
      return this._runAgentSession(task, runtime, signal);
    }

    // 3. Legacy session service
    if (this.ctx && this.ctx.session && typeof this.ctx.session.create === 'function') {
      return this._runLegacySession(task);
    }

    // 4. Nothing to run through: report the prompt as triggered
    return this._runBare(task);
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

  _runBare(task) {
    return {
      output: `[dsh-cron] Prompt triggered: "${task.prompt.slice(0, 100)}..."`,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    };
  }

  async _runAgentSession(task, runtime, signal) {
    try {
      const prep = await this._prepareAgentRun(task, runtime, signal);
      return await this._executeAgentTurn(task, prep);
    } catch (err) {
      console.error(`[dsh-cron] agent execution failed:`, err.message);
      throw err;
    }
  }
  /** Everything an agent run needs before the session is created. */
  async _prepareAgentRun(task, runtime, signal) {
    const { randomUUID } = await import('node:crypto');
    let createUserMessage = (m) => m;
    try {
      const llmModule = await import('@deepseek-ai/dsh-llm');
      if (llmModule && typeof llmModule.createUserMessage === 'function') {
        createUserMessage = llmModule.createUserMessage;
      }
    } catch {}
    let sessionModule = null;
    try {
      sessionModule = await import('@deepseek-ai/dsh-session');
    } catch {}

    const mintSessionId = () => {
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
    try {
      handle = await this.ctx.agents.create({
        sessionId: prep.mintSessionId(),
        meta: { cwd: prep.cwd, ephemeral: true, internal: true },
        agentOptions: prep.provider && prep.model ? { provider: prep.provider, model: prep.model } : undefined,
      });
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
      return {
        output: `[dsh-cron] Agent finished turn for task "${task.title}" (session: ${handle.agent.session?.id || 'cron'})`,
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
    try {
      const sessionUsage = handle.agent.session?.usage || handle.agent.usage;
      if (sessionUsage) {
        usage.inputTokens = sessionUsage.inputTokens || sessionUsage.promptTokens || 0;
        usage.outputTokens = sessionUsage.outputTokens || sessionUsage.completionTokens || 0;
        usage.cacheReadTokens = sessionUsage.cacheReadTokens || sessionUsage.cachedTokens || 0;
      }
    } catch {}
    return usage;
  }

  /** Dispose the session, archive it best-effort, drop the worktree (#30, #29). */
  async _disposeAgentRun(task, prep, handle) {
    let archivedSessionId = null;
    try {
      archivedSessionId = (handle && handle.agent && handle.agent.session && handle.agent.session.id) || null;
    } catch {}
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
    if (archivedSessionId && this.ctx && this.ctx.get) {
      try {
        const sessions = this.ctx.get('sessions');
        if (sessions && typeof sessions.archive === 'function') {
          sessions.archive(archivedSessionId);
        }
      } catch {}
    }
    // #29: dispose the isolated worktree (kept when keepWorktree is set).
    if (prep.taskWorktree && !task.keepWorktree) {
      await this.removeTaskWorktree(prep.baseCwd, prep.taskWorktree);
    }
  }
}
