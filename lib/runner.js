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
        const child = exec(task.prompt, {
          cwd: process.cwd(),
          signal,
        }, (err, stdout, stderr) => {
          if (err) {
            if (signal && signal.aborted) {
              return reject(signal.reason || new Error('Command aborted'));
            }
            return reject(err);
          }
          const out = (stdout || stderr || '').trim();
          resolve(out || 'Script completed with code 0');
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

        let mintSessionId = () => `cron-exec-${task.id}-${randomUUID()}`;
        try {
          const sessionModule = await import('@deepseek-ai/dsh-session');
          if (sessionModule && typeof sessionModule.SessionId === 'function') {
            const sid = mintSessionId();
            mintSessionId = () => sessionModule.SessionId(sid);
          }
        } catch {}

        const defaultSel = this.ctx.get?.('agentDefaultModel')?.currentSelection?.();
        const provider = task.provider || defaultSel?.provider;
        const model = task.model || defaultSel?.model;

        const cwd = process.cwd();
        const handle = await this.ctx.agents.create({
          sessionId: mintSessionId(),
          meta: { cwd },
          agentOptions: provider && model ? { provider, model } : undefined,
        });

        if (signal && signal.aborted) {
          throw (signal.reason || new Error('Aborted'));
        }

        await handle.agent.whenIdle();
        handle.agent.followup(createUserMessage({
          content: [{ type: 'text', text: task.prompt }],
          source: { kind: 'plugin', plugin: 'dsh-cron', form: 'cron-execute' },
        }));

        return `[dsh-cron] Agent started session ${handle.agent.session?.id || 'cron'}`;
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
          return typeof result === 'string' ? result : JSON.stringify(result);
        }
      } catch (err) {
        console.error(`[dsh-cron] session execution failed:`, err.message);
        throw err;
      }
    }

    return `[dsh-cron] Prompt triggered: "${task.prompt.slice(0, 100)}..."`;
  }
}
