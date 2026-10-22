import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateYmd, SessionRunner } from '../lib/runner.js';
import { cronToolParameters, executeCronTool } from '../lib/cron-tool.js';
import { TaskStore } from '../lib/store.js';
import { TaskScheduler } from '../lib/scheduler.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

function makeEnv(t) {
  const filePath = path.join(
    os.tmpdir(),
    `dsh-cron-sec369-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  const store = new TaskStore(filePath);
  t.after(() => {
    try {
      fs.rmSync(filePath, { force: true });
    } catch (_err) {
      // ignore
    }
  });
  const scheduler = new TaskScheduler(store, async () => 'ok');
  t.after(() => scheduler.stopAll());
  return { store, scheduler };
}

test('Issue #369 (GH #15): formatDateYmd formats date as YYYY-MM-DD', () => {
  const d = new Date(2026, 9, 22); // Month is 0-indexed, 9 = October
  assert.equal(formatDateYmd(d), '2026-10-22');
  const dJan = new Date(2026, 0, 5);
  assert.equal(formatDateYmd(dJan), '2026-01-05');
});

test('Issue #369 (GH #15): _nameSession renames sessions and handles {{date}} interpolation', () => {
  const ymd = formatDateYmd();
  let renamedSession = null;
  let renamedLabel = null;

  const mockSessionTitle = {
    rename(session, label) {
      renamedSession = session;
      renamedLabel = label;
    },
  };

  const fakeCtx = {
    get(name) {
      if (name === 'sessionTitle') return mockSessionTitle;
      return undefined;
    },
  };

  const runner = new SessionRunner(fakeCtx, { get() { return null; } });
  const mockHandle = {
    agent: {
      session: { id: 'sess-123' },
    },
  };

  // 1. Empty sessionTitle defaults to "<YYYY-MM-DD> <task.title>"
  renamedSession = null;
  renamedLabel = null;
  runner._nameSession({ title: 'a-share-review', sessionTitle: '' }, mockHandle, false);
  assert.equal(renamedSession?.id, 'sess-123');
  assert.equal(renamedLabel, `${ymd} a-share-review`);

  // 2. Explicit sessionTitle with {{date}} is interpolated
  renamedSession = null;
  renamedLabel = null;
  runner._nameSession({ title: 'midday-review', sessionTitle: '[午间] {{date}} A股+港股' }, mockHandle, false);
  assert.equal(renamedLabel, `[午间] ${ymd} A股+港股`);

  // 3. Explicit static sessionTitle is preserved verbatim
  renamedSession = null;
  renamedLabel = null;
  runner._nameSession({ title: 'static-task', sessionTitle: 'Fixed Session Title' }, mockHandle, false);
  assert.equal(renamedLabel, 'Fixed Session Title');

  // 4. isResumed = true without explicit sessionTitle does NOT rename existing session
  renamedSession = null;
  renamedLabel = null;
  runner._nameSession({ title: 'resumed-task', sessionTitle: '' }, mockHandle, true);
  assert.equal(renamedLabel, null, 'Resumed session without explicit sessionTitle must not be renamed');

  // 5. isResumed = true WITH explicit sessionTitle DOES rename
  renamedSession = null;
  renamedLabel = null;
  runner._nameSession({ title: 'resumed-task', sessionTitle: 'Explicit Resume Title' }, mockHandle, true);
  assert.equal(renamedLabel, 'Explicit Resume Title');
});

test('Issue #369 (GH #15): cron tool schema and actions expose sessionTitle', async (t) => {
  const { store, scheduler } = makeEnv(t);

  // 1. Verify schema definition
  assert.ok(cronToolParameters.sessionTitle, 'sessionTitle must be in cronToolParameters');
  assert.equal(cronToolParameters.sessionTitle.type, 'string');

  // 2. Verify executeCronTool action: "create" with sessionTitle
  const createRes = await executeCronTool(store, scheduler, {
    action: 'create',
    title: 'Automated Market Review',
    schedule: '0 9 * * *',
    prompt: 'Analyze today stock performance',
    type: 'llm',
    sessionTitle: '{{date}} Market-Review',
  });

  assert.equal(createRes.success, true);
  const taskId = createRes.task.id;
  const stored = store.get(taskId);
  assert.equal(stored.sessionTitle, '{{date}} Market-Review');

  // 3. Verify executeCronTool action: "update" with sessionTitle
  const updateRes = await executeCronTool(store, scheduler, {
    action: 'update',
    id: taskId,
    sessionTitle: '[Updated] {{date}} Market-Review',
  });

  assert.equal(updateRes.success, true);
  const updatedStored = store.get(taskId);
  assert.equal(updatedStored.sessionTitle, '[Updated] {{date}} Market-Review');
});
