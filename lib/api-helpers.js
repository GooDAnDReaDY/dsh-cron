import { previewSchedule } from './scheduler.js';
import { sendJson, readBody, rejectCrossOrigin } from './http-utils.js';

const NOT_ALLOWED = { ok: false, error: 'Method not allowed' };

export function handleHeartbeatPing({ store, req, res, taskId }) {
  if (req.method !== 'POST') {
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }
  const apiToken = store?.getSettings?.()?.apiToken;
  if (rejectCrossOrigin(req, res, { apiToken })) return;

  const task = store.get(taskId);
  if (!task) {
    sendJson(res, 404, { ok: false, error: 'Task not found' });
    return;
  }
  const result = typeof store.recordHeartbeat === 'function' ? store.recordHeartbeat(taskId) : null;
  if (!result) {
    sendJson(res, 500, { ok: false, error: 'Could not record heartbeat' });
    return;
  }
  sendJson(res, 200, result);
}

export async function handleSchedulePreview({ req, res, url, store }) {
  const apiToken = store?.getSettings?.()?.apiToken;
  if (rejectCrossOrigin(req, res, { apiToken })) return;

  let schedule = '';
  let timezone = '';
  let count = 5;

  if (req.method === 'POST') {
    const { body, error } = await readBody(req, res);
    if (error) return;
    schedule = body.schedule || '';
    timezone = body.timezone || '';
    count = body.count || 5;
  } else if (req.method === 'GET') {
    schedule = url.searchParams.get('schedule') || '';
    timezone = url.searchParams.get('timezone') || '';
    count = parseInt(url.searchParams.get('count') || '5', 10);
  } else {
    sendJson(res, 405, NOT_ALLOWED);
    return;
  }

  if (!schedule) {
    sendJson(res, 400, { ok: false, error: 'Field "schedule" is required' });
    return;
  }

  try {
    const preview = previewSchedule(schedule, { timezone, count });
    sendJson(res, 200, { ok: true, ...preview });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
  }
}

export async function handleDryRunTask({ store, scheduler, req, res, id }) {
  const apiToken = store?.getSettings?.()?.apiToken;
  if (rejectCrossOrigin(req, res, { apiToken })) return;
  const task = store.get(id);
  if (!task) {
    sendJson(res, 404, { ok: false, error: 'Task not found' });
    return;
  }

  try {
    const outcome = await scheduler.runTask(id, { dryRun: true });
    sendJson(res, 200, outcome || { ok: true, status: 'completed' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}
