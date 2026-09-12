import fs from 'node:fs';

/**
 * Extract structured action directives from LLM output text (#137).
 * Supports JSON code fences ```json ... ``` and inline { "dsh_action": ... } blocks.
 */
export function parseLlmActionDirectives(text) {
  if (!text || typeof text !== 'string') return [];
  const directives = [];

  // 1. Check for ```json ... ``` or ``` ... ``` blocks
  const blockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
      try {
        const parsed = JSON.parse(raw);
        collectDirectives(parsed, directives);
      } catch {}
    }
  }

  // 2. Check for inline JSON object with dsh_action or dsh_actions if nothing found in fences
  if (directives.length === 0) {
    const inlineMatch = /\{(?:[^{}]|(\{(?:[^{}]|\{[^{}]*\})*\}))*"dsh_action[s]?"(?:[^{}]|(\{(?:[^{}]|\{[^{}]*\})*\}))*\}/gi;
    let im;
    while ((im = inlineMatch.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(im[0]);
        collectDirectives(parsed, directives);
      } catch {}
    }
  }

  return directives;
}

function collectDirectives(obj, list) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectDirectives(item, list);
    return;
  }
  if (Array.isArray(obj.dsh_actions)) {
    for (const item of obj.dsh_actions) collectDirectives(item, list);
    return;
  }
  if (Array.isArray(obj.actions)) {
    for (const item of obj.actions) collectDirectives(item, list);
    return;
  }
  const type = obj.dsh_action || obj.action || obj.type;
  if (typeof type === 'string' && type.trim()) {
    list.push({
      type: type.trim(),
      payload: obj.payload || {},
      ...obj,
    });
  }
}

/**
 * Execute parsed LLM action directives if enabled in plugin settings (#137).
 */
export async function executeLlmActionDirectives({ directives, task, runInfo, scheduler, store, settings = {}, fetchFn = globalThis.fetch }) {
  if (!Array.isArray(directives) || directives.length === 0) return [];
  if (!settings.llmActionsEnabled) {
    return [];
  }

  const results = [];
  for (const dir of directives) {
    const type = dir.type || dir.action;
    try {
      if (type === 'trigger_task' || type === 'run_task') {
        const targetId = dir.taskId || dir.payload?.taskId;
        if (targetId && typeof scheduler.runNow === 'function') {
          await scheduler.runNow(targetId, {
            prevOutput: runInfo?.output || '',
            prevTaskId: task?.id || '',
          });
          results.push({ type, targetId, status: 'triggered' });
        }
      } else if (type === 'notify') {
        const msg = dir.message || dir.text || dir.payload?.message;
        const botToken = settings.botToken;
        const chatId = settings.chatId;
        if (msg && botToken && chatId) {
          const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
          await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: String(msg) }),
          });
          results.push({ type, status: 'sent' });
        }
      } else if (type === 'create_issue') {
        const title = dir.title || dir.payload?.title || `Issue from task ${task?.title || 'Cron'}`;
        const body = dir.body || dir.payload?.body || String(runInfo?.output || '');
        const giteaRes = await tryCreateGiteaIssue({ title, body, fetchFn });
        results.push({ type, status: giteaRes ? 'created' : 'skipped', details: giteaRes });
      }
    } catch (err) {
      console.warn(`[dsh-cron] action directive ${type} execution failed:`, err.message);
      results.push({ type, status: 'error', error: err.message });
    }
  }

  return results;
}

/**
 * Best-effort helper to post an issue to local Gitea if credentials are present.
 */
async function tryCreateGiteaIssue({ title, body, repo = 'goodandready/dsh-cron', fetchFn }) {
  try {
    let token = process.env.GITEA_TOKEN;
    const credPath = '/mnt/external/Project/DEV/.gitea-agent-credentials.json';
    if (!token && fs.existsSync(credPath)) {
      const data = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      token = data?.agents?.antigravity?.token || data?.token;
    }
    if (!token) return null;

    const url = `http://127.0.0.1:3005/api/v1/repos/${repo}/issues`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      return { number: json.number, url: json.html_url };
    }
  } catch {}
  return null;
}
