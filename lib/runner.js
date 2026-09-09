import { estimateTokenCost } from './integrations.js';

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

  async _run(task, signal) {
    console.log(`[dsh-cron] executing task "${task.title}" (${task.id})`);

    // 1. Direct shell / script task fallback (NO-LLM)
    if (task.type === 'script' || task.mode === 'no-llm') {
      const { exec } = await import('node:child_process');
      return new Promise((resolve, reject) => {
        const shellPath = process.platform === 'win32' ? undefined : (process.env.SHELL || '/bin/bash');
        const child = exec(task.prompt, {
          cwd: process.cwd(),
          signal,
          maxBuffer: 10 * 1024 * 1024,
          shell: shellPath,
          env: { ...process.env },
        }, (err, stdout, stderr) => {
          if (err) {
            if (signal && signal.aborted) {
              return reject(signal.reason || new Error('Command aborted'));
            }
            return reject(err);
          }
          const out = (stdout || stderr || '').trim();
          resolve({
            output: out || 'Script completed with code 0',
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
            costUsd: 0
          });
        });
      });
    }

    // 2. If ctx.agents is available, run through agent session (LLM)
    if (this.ctx && this.ctx.agents && typeof this.ctx.agents.create === 'function') {
      try {
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
        const provider = task.provider || defaultSel?.provider;
        const model = task.model || defaultSel?.model || undefined;

        // The agent session cannot take the AbortSignal natively, so any abort
        // (timeout, overlap replace, pause, scheduler stop) races against the
        // session awaits and forces an immediate dispose (#88).
        const abortError = () => (signal && signal.reason) || new Error('Task aborted');
        const raceAbort = (promise) => {
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

        const cwd = process.cwd();
        let handle = null;
        try {
          handle = await this.ctx.agents.create({
            sessionId: mintSessionId(),
            meta: { cwd, ephemeral: true, internal: true },
            agentOptions: provider && model ? { provider, model } : undefined,
          });

          await raceAbort(handle.agent.whenIdle());
          handle.agent.followup(createUserMessage({
            content: [{ type: 'text', text: task.prompt }],
            source: { kind: 'plugin', plugin: 'dsh-cron', form: 'cron-execute' },
          }));

          // Await agent turn completion (#67), abortable on timeout/overlap (#88)
          if (typeof handle.agent.whenIdle === 'function') {
            await raceAbort(handle.agent.whenIdle());
          }

          // Try extracting token usage from session history if available
          let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
          try {
            const sessionUsage = handle.agent.session?.usage || handle.agent.usage;
            if (sessionUsage) {
              usage = {
                inputTokens: sessionUsage.inputTokens || sessionUsage.promptTokens || 0,
                outputTokens: sessionUsage.outputTokens || sessionUsage.completionTokens || 0,
                cacheReadTokens: sessionUsage.cacheReadTokens || sessionUsage.cachedTokens || 0,
              };
            }
          } catch {}

          const costUsd = estimateTokenCost(model, usage);

          return {
            output: `[dsh-cron] Agent finished turn for task "${task.title}" (session: ${handle.agent.session?.id || 'cron'})`,
            usage,
            costUsd
          };
        } finally {
          try {
            if (handle && typeof handle.dispose === 'function') {
              await handle.dispose();
            } else if (handle && handle.agent && typeof handle.agent.destroy === 'function') {
              await handle.agent.destroy();
            }
          } catch (disposeErr) {
            console.warn('[dsh-cron] session dispose notice:', disposeErr.message);
          }
        }
      } catch (err) {
        console.error(`[dsh-cron] agent execution failed:`, err.message);
        throw err;
      }
    }

    // 3. Check if legacy session service is present
    if (this.ctx && this.ctx.session && typeof this.ctx.session.create === 'function') {
      try {
        const session = await this.ctx.session.create({
          title: `[Cron] ${task.title}`,
          ephemeral: task.delivery === 'isolated',
        });

        if (session && typeof session.send === 'function') {
          const result = await session.send(task.prompt);
          const out = typeof result === 'string' ? result : JSON.stringify(result);
          const usage = session.usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
          const costUsd = estimateTokenCost(task.model, usage);
          return {
            output: out,
            usage,
            costUsd
          };
        }
      } catch (err) {
        console.error(`[dsh-cron] session execution failed:`, err.message);
        throw err;
      }
    }

    return {
      output: `[dsh-cron] Prompt triggered: "${task.prompt.slice(0, 100)}..."`,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      costUsd: 0
    };
  }
}
