/**
 * Runner executing scheduled tasks in DeepSeek Harness sessions.
 */
export class SessionRunner {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async execute(task) {
    console.log(`[dsh-cron] executing task "${task.title}" (${task.id})`);
    
    // 1. If ctx.agents is available, run through agent session
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

        const handle = await this.ctx.agents.create({
          sessionId: mintSessionId(),
          meta: {},
          agentOptions: provider && model ? { provider, model } : undefined,
        });

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

    // 2. Check if legacy session service is present
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

    // 3. Direct shell / script task fallback
    if (task.type === 'script' && task.prompt) {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      const { stdout, stderr } = await execAsync(task.prompt, { timeout: 60000 });
      return stdout || stderr || 'Script completed with code 0';
    }

    return `[dsh-cron] Prompt triggered: "${task.prompt.slice(0, 100)}..."`;
  }
}