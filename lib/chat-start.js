export async function chatStartHandler(ctx, req, res, parseJsonBody, sendJson, randomUUID) {
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    const body = await parseJsonBody(req);
    const userPrompt = (body.prompt || '').trim();
    if (!userPrompt) {
      sendJson(res, 400, { ok: false, error: 'Prompt text must not be empty' });
      return;
    }

    const agents = ctx.agents;
    if (!agents || typeof agents.create !== 'function') {
      sendJson(res, 500, { ok: false, error: 'The agents service is unavailable in DSH' });
      return;
    }

    let createUserMessage = (m) => m;
    try {
      const llmModule = await import('@deepseek-ai/dsh-llm');
      if (llmModule && typeof llmModule.createUserMessage === 'function') {
        createUserMessage = llmModule.createUserMessage;
      }
    } catch (err) {
      (ctx.logger || console).debug?.('[dsh-cron] @deepseek-ai/dsh-llm createUserMessage unavailable, using identity fallback:', err?.message || err);
    }

    let mintSessionId = () => `cron-setup-${randomUUID()}`;
    try {
      const sessionModule = await import('@deepseek-ai/dsh-session');
      if (sessionModule && typeof sessionModule.SessionId === 'function') {
        const sid = mintSessionId();
        mintSessionId = () => sessionModule.SessionId(sid);
      }
    } catch (err) {
      (ctx.logger || console).debug?.('[dsh-cron] @deepseek-ai/dsh-session SessionId unavailable, using string fallback:', err?.message || err);
    }

    const defaultSel = ctx.get('agentDefaultModel')?.currentSelection?.();
    const provider = body.provider || defaultSel?.provider;
    const model = body.model || defaultSel?.model;

    const cwd = process.cwd();
    const presets = ctx.agentPresets || ctx.get?.('agentPresets');
    let preset = null;
    if (presets && typeof presets.resolve === 'function') {
      try {
        preset = await presets.resolve(body.agentPreset || 'standard');
        if (preset && typeof presets.standingKeyFor === 'function') {
          await presets.standingKeyFor(preset.id);
        }
      } catch (presetErr) {
        ctx.logger?.warn?.(`[dsh-cron] could not resolve agentPreset: ${presetErr.message}`);
      }
    }

    const handle = await agents.create({
      sessionId: mintSessionId(),
      meta: {
        cwd,
        agentPreset: preset ? preset.id : 'standard',
      },
      agentOptions: provider && model ? { provider, model } : undefined,
      ...(preset ? {
        setup: async (agentCtx) => {
          if (typeof presets.mount === 'function') {
            await presets.mount(agentCtx, preset.id);
          }
        }
      } : {}),
    });

    const permissions = ctx.get?.('permissionPresets');
    if (permissions && typeof permissions.set === 'function') {
      try {
        permissions.set(handle.agent.session, 'workspace-write');
      } catch (permErr) {
        ctx.logger?.warn?.(`[dsh-cron] could not set permissionPreset: ${permErr.message}`);
      }
    }

    const { buildAgentCronPrompt } = await import('./prompt.js');
    const fullPrompt = buildAgentCronPrompt(userPrompt);

    await handle.agent.whenIdle();
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: fullPrompt }],
      source: { kind: 'plugin:dsh-cron', form: 'cron-setup' },
    }));

    sendJson(res, 200, { ok: true, sessionId: handle.agent.session.id });
  } catch (err) {
    ctx.logger?.warn?.(`[dsh-cron] chat/start error: ${err.message}`);
    sendJson(res, 500, { ok: false, error: err.message });
  }
}
