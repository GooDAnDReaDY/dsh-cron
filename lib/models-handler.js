export async function getModelsHandler(ctx, req, res, sendJson) {
  if ((req.method || 'GET') !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }
  let current = null;
  try {
    const adm = (ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : null) || (ctx && ctx.agentDefaultModel);
    current = adm?.currentSelection?.() ?? null;
  } catch {
    current = null;
  }
  let providers = [];
  try {
    const llm = (ctx && typeof ctx.get === 'function' ? ctx.get('llm') : null) || (ctx && ctx.llm);
    if (llm && typeof llm.listProviders === 'function') {
      providers = (llm.listProviders() ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id }));
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
    const llm = (ctx && typeof ctx.get === 'function' ? ctx.get('llm') : null) || (ctx && ctx.llm);
    if (llm && typeof llm.listModels === 'function') {
      rows = await llm.listModels(wanted);
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
