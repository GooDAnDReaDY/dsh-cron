/**
 * Runner executing scheduled tasks in DeepSeek Harness sessions.
 */
export class SessionRunner {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async execute(task) {
    console.log(`[dsh-cron] executing task "${task.title}" (${task.id})`);
    
    // Check if session / agent service is present in DSH context
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

    // Direct shell / script task fallback
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