export async function getModelsHandler(ctx, req, res, sendJson) {
  const current = ctx.get('agentDefaultModel')?.currentSelection?.() ?? null;
  let providers = [];
  try {
    if (ctx.llm && typeof ctx.llm.listProviders === 'function') {
      providers = (ctx.llm.listProviders() ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id }));
    }
  } catch {
    providers = [];
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  const wanted = url.searchParams.get('provider') || '';
  if (wanted === '') {
    sendJson(res, 200, { current, providers, models: [] });
    return;
  }

  try {
    let rows = [];
    if (ctx.llm && typeof ctx.llm.listModels === 'function') {
      rows = await ctx.llm.listModels(wanted);
    }
    sendJson(res, 200, {
      current,
      providers,
      models: (rows ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id })),
    });
  } catch {
    sendJson(res, 200, { current, providers, models: [] });
  }
}