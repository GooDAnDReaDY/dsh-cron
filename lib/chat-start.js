export async function chatStartHandler(ctx, req, res, parseJsonBody, sendJson, randomUUID) {
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    const body = await parseJsonBody(req);
    const userPrompt = (body.prompt || '').trim();
    if (!userPrompt) {
      sendJson(res, 400, { ok: false, error: 'Текст задачи не может быть пустым' });
      return;
    }

    const agents = ctx.agents;
    if (!agents || typeof agents.create !== 'function') {
      sendJson(res, 500, { ok: false, error: 'Служба agents недоступна в DSH' });
      return;
    }

    let createUserMessage = (m) => m;
    try {
      const llmModule = await import('@deepseek-ai/dsh-llm');
      if (llmModule && typeof llmModule.createUserMessage === 'function') {
        createUserMessage = llmModule.createUserMessage;
      }
    } catch {}

    let mintSessionId = () => `cron-setup-${randomUUID()}`;
    try {
      const sessionModule = await import('@deepseek-ai/dsh-session');
      if (sessionModule && typeof sessionModule.SessionId === 'function') {
        const sid = mintSessionId();
        mintSessionId = () => sessionModule.SessionId(sid);
      }
    } catch {}

    const defaultSel = ctx.get('agentDefaultModel')?.currentSelection?.();
    const provider = body.provider || defaultSel?.provider;
    const model = body.model || defaultSel?.model;

    const cwd = process.cwd();
    const handle = await agents.create({
      sessionId: mintSessionId(),
      meta: { cwd },
      agentOptions: provider && model ? { provider, model } : undefined,
    });

    const { buildAgentCronPrompt } = await import('./prompt.js');
    const fullPrompt = buildAgentCronPrompt(userPrompt);

    await handle.agent.whenIdle();
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: fullPrompt }],
      source: { kind: 'plugin', plugin: 'dsh-cron', form: 'cron-setup' },
    }));

    sendJson(res, 200, { ok: true, sessionId: handle.agent.session.id });
  } catch (err) {
    ctx.logger?.warn?.(`[dsh-cron] chat/start error: ${err.message}`);
    sendJson(res, 500, { ok: false, error: err.message });
  }
}