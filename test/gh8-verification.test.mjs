import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleScheduleTimeline } from '../lib/api-helpers.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('GH #8 / Gitea #343: Client runtime ReferenceError verification suite', async (t) => {
  const clientJs = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');

  await t.test('1. openAnalyticsDigest is declared, wired to button and fetches analytics', () => {
    assert.match(clientJs, /const openAnalyticsDigest\s*=\s*async/, 'openAnalyticsDigest function declared');
    assert.match(clientJs, /onClick:\s*openAnalyticsDigest/, 'openAnalyticsDigest wired to toolbar button');
    assert.match(clientJs, /\/dsh-cron\/analytics\?days=/, 'openAnalyticsDigest calls backend analytics endpoint');
  });

  await t.test('2. openTimelineModal is declared, wired to button and fetches timeline/heatmap', () => {
    assert.match(clientJs, /const openTimelineModal\s*=\s*async/, 'openTimelineModal function declared');
    assert.match(clientJs, /openTimelineModal\(['"]timeline['"]\)/, 'openTimelineModal wired to toolbar button');
    assert.match(clientJs, /\/dsh-cron\/schedule\/timeline-24h/, 'openTimelineModal fetches 24h timeline');
    assert.match(clientJs, /\/dsh-cron\/analytics\/heatmap/, 'openTimelineModal fetches heatmap');
  });

  await t.test('3. All 11 modal and view states are declared and modals rendered in dialog tree', () => {
    const expectedStates = [
      'digestOpen', 'digestData', 'digestMarkdown', 'digestLoading', 'periodDays', 'sendStatus',
      'timelineOpen', 'timelineData', 'heatmapData', 'timelineLoading', 'timelineTab'
    ];
    for (const st of expectedStates) {
      assert.match(clientJs, new RegExp(`\\[${st},\\s*set[A-Za-z0-9]+\\]\\s*=\\s*React\\.useState`), `state ${st} is declared`);
    }

    assert.match(clientJs, /renderAnalyticsDigestModal\(\{/, 'renderAnalyticsDigestModal is called');
    assert.match(clientJs, /renderTimelineHeatmapModal\(\{/, 'renderTimelineHeatmapModal is called');
  });

  await t.test('4. editingTask is eliminated (0 occurrences in client.js, replaced with selectedTaskMeta)', () => {
    const editingTaskMatches = clientJs.match(/\beditingTask\b/g);
    assert.equal(editingTaskMatches, null, 'editingTask must have 0 occurrences in lib/client.js');
    assert.match(clientJs, /selectedTaskMeta\s*&&\s*selectedTaskMeta\.promptHistory/, 'prompt history references selectedTaskMeta');
  });

  await t.test('5. buildTaskGraphModel is defined in client.js and models DAG nodes & edges', () => {
    assert.match(clientJs, /function buildTaskGraphModel\(/, 'buildTaskGraphModel function is defined in lib/client.js');

    // Dynamically evaluate buildTaskGraphModel logic including helpers
    const tasks = [
      { id: 't1', title: 'Task 1', status: 'active', onSuccess: 't2' },
      { id: 't2', title: 'Task 2', status: 'active', dependsOn: 't1', joinPolicy: 'all_success' },
      { id: 't3', title: 'Task 3', status: 'active', onFailure: 't1' }
    ];
    const snapshots = [
      { stepTaskId: 't1', status: 'completed', durationMs: 120, output: 'done' }
    ];

    const match = clientJs.match(/function parseChainTargets\(raw\)[\s\S]*?\n\s*return\s*\{\s*nodes,\s*edges,\s*hasFailure\s*\};\s*\}/);
    assert.ok(match, 'buildTaskGraphModel block extracted from lib/client.js');

    const fn = new Function('tasks', 'snapshots', 'focusTaskId', match[0] + '\nreturn buildTaskGraphModel(tasks, snapshots, focusTaskId);');
    const result = fn(tasks, snapshots, 't1');

    assert.equal(result.nodes.length, 3, 'builds 3 nodes');
    assert.equal(result.nodes[0].id, 't1');
    assert.equal(result.nodes[0].status, 'success');
    assert.equal(result.nodes[0].isFocus, true);
    assert.ok(result.edges.some(e => e.from === 't1' && e.to === 't2' && e.type === 'onSuccess'), 'has onSuccess edge');
    assert.ok(result.edges.some(e => e.from === 't1' && e.to === 't2' && e.type === 'dependsOn'), 'has dependsOn edge');
  });

  await t.test('6. handleScheduleTimeline answers GET /dsh-cron/schedule/timeline-24h', async () => {
    const store = {
      list: () => [
        { id: 'cron-1', title: 'Cron Task', status: 'active', schedule: '0 * * * *' }
      ],
      getSettings: () => ({ maxConcurrent: 2 })
    };

    let statusCode = 0;
    let responseBody = null;
    const res = {
      writeHead: (code, headers) => { statusCode = code; },
      end: (data) => { responseBody = JSON.parse(data); },
      setHeader: () => {}
    };
    const req = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const url = new URL('http://localhost/dsh-cron/schedule/timeline-24h?hours=12');

    await handleScheduleTimeline({ req, res, url, store, scheduler: {} });

    assert.equal(statusCode, 200);
    assert.equal(responseBody.ok, true);
    assert.equal(responseBody.timeline.buckets.length, 12);
  });
});
