import test from 'node:test';
import assert from 'node:assert/strict';
import { LogStreamer } from '../lib/log-streamer.js';
import { createCronApiHandler } from '../lib/api.js';

test('sse-log-stream: appendLog assigns sequential IDs and broadcasts to subscribers', () => {
  const streamer = new LogStreamer();
  const entry = streamer.startStream('t_sse_1', 'run_1');
  assert.equal(entry.taskId, 't_sse_1');

  const receivedChunks = [];
  const mockSubscriber = {
    write: (data) => receivedChunks.push(data),
    end: () => {},
  };
  entry.subscribers.add(mockSubscriber);

  streamer.appendLog('t_sse_1', 'chunk number 1', 'stdout');
  streamer.appendLog('t_sse_1', 'chunk number 2', 'stderr');

  assert.equal(entry.buffer.length, 2);
  assert.equal(entry.buffer[0].id, 1);
  assert.equal(entry.buffer[0].chunk, 'chunk number 1');
  assert.equal(entry.buffer[0].stream, 'stdout');
  assert.equal(entry.buffer[1].id, 2);
  assert.equal(entry.buffer[1].chunk, 'chunk number 2');
  assert.equal(entry.buffer[1].stream, 'stderr');

  assert.equal(receivedChunks.length, 2);
  assert.ok(receivedChunks[0].includes('id: 1\nevent: log\ndata:'));
  assert.ok(receivedChunks[1].includes('id: 2\nevent: log\ndata:'));
});

test('sse-log-stream: handleSseRequest respects Last-Event-ID resumption protocol', () => {
  const streamer = new LogStreamer();
  streamer.startStream('t_sse_2', 'run_2');

  streamer.appendLog('t_sse_2', 'Line 1', 'stdout'); // id 1
  streamer.appendLog('t_sse_2', 'Line 2', 'stdout'); // id 2
  streamer.appendLog('t_sse_2', 'Line 3', 'stdout'); // id 3

  let output = '';
  let headersSent = {};
  const mockReq = {
    headers: { 'last-event-id': '2' }, // Reconnecting after event 2
    on: () => {},
  };
  const mockRes = {
    writeHead: (code, hdrs) => { headersSent = hdrs; },
    write: (data) => { output += data; },
    end: () => {},
  };

  streamer.handleSseRequest('t_sse_2', mockReq, mockRes);
  assert.equal(headersSent['Content-Type'], 'text/event-stream; charset=utf-8');

  // Should only contain Line 3 in bufferedLogs, skipping 1 and 2
  const initMatch = output.match(/event: init\ndata: (.*)\n\n/);
  assert.ok(initMatch, 'Should send init event');
  const initData = JSON.parse(initMatch[1]);
  assert.equal(initData.bufferedLogs.length, 1);
  assert.equal(initData.bufferedLogs[0].id, 3);
  assert.equal(initData.bufferedLogs[0].chunk, 'Line 3');
});

test('sse-log-stream: completeStream broadcasts complete event and closes subscribers', () => {
  const streamer = new LogStreamer();
  const entry = streamer.startStream('t_sse_3', 'run_3');

  let ended = false;
  let lastPayload = '';
  const mockSubscriber = {
    write: (data) => { lastPayload = data; },
    end: () => { ended = true; },
  };
  entry.subscribers.add(mockSubscriber);

  streamer.completeStream('t_sse_3', { status: 'success', exitCode: 0 });
  assert.ok(ended, 'Subscriber should be ended');
  assert.ok(lastPayload.includes('event: complete\ndata:'));
  const completeData = JSON.parse(lastPayload.split('data: ')[1].trim());
  assert.equal(completeData.status, 'success');
  assert.equal(completeData.exitCode, 0);
});

test('sse-log-stream: routes /tasks/:id/logs/stream and /tasks/:id/stream dispatch to SSE handler', async () => {
  const mockStore = {
    getSettings: () => ({}),
  };
  const mockScheduler = {};
  const handler = createCronApiHandler(mockStore, mockScheduler, {});

  // Test /dsh-cron/tasks/test-task/logs/stream
  let sseWritten = '';
  let sseHeaders = {};
  const mockReqLogsStream = {
    method: 'GET',
    url: '/dsh-cron/tasks/task_logs_route/logs/stream',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    on: () => {},
  };
  const mockResLogsStream = {
    writeHead: (code, hdrs) => { sseHeaders = hdrs; },
    write: (data) => { sseWritten += data; },
    end: () => {},
  };

  await handler(mockReqLogsStream, mockResLogsStream);
  assert.equal(sseHeaders['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.ok(sseWritten.includes('event: init\ndata:'));

  // Test legacy alias /dsh-cron/tasks/test-task/stream
  let sseWritten2 = '';
  let sseHeaders2 = {};
  const mockReqStream = {
    method: 'GET',
    url: '/dsh-cron/tasks/task_stream_route/stream',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    on: () => {},
  };
  const mockResStream = {
    writeHead: (code, hdrs) => { sseHeaders2 = hdrs; },
    write: (data) => { sseWritten2 += data; },
    end: () => {},
  };

  await handler(mockReqStream, mockResStream);
  assert.equal(sseHeaders2['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.ok(sseWritten2.includes('event: init\ndata:'));
});
