/**
 * Real-time Task Execution Log Streaming (SSE) (#336)
 *
 * Keeps an in-memory Ring Buffer of output chunks for active tasks and
 * broadcasts them to connected Server-Sent Events (SSE) clients.
 */

import { EventEmitter } from 'node:events';
import { logger } from './logger.js';

const MAX_BUFFER_LINES = 500;
const RETENTION_MS = 60000; // retain logs for 60s after completion for late inspectors

export class LogStreamer extends EventEmitter {
  constructor() {
    super();
    this.streams = new Map(); // taskId -> StreamEntry
  }

  startStream(taskId, runId) {
    if (!taskId) return;
    const existing = this.streams.get(taskId);
    if (existing && existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer);
    }
    const entry = {
      taskId,
      runId: runId || `run_${Date.now()}`,
      startTime: Date.now(),
      buffer: [],
      subscribers: new Set(),
      completed: false,
      outcome: null,
      cleanupTimer: null,
    };
    this.streams.set(taskId, entry);
    this.emit('start', { taskId, runId: entry.runId });
    return entry;
  }

  appendLog(taskId, text, streamType = 'stdout') {
    if (!taskId || text === undefined || text === null) return;
    const entry = this.streams.get(taskId);
    if (!entry) return;

    const chunkStr = String(text);
    const item = {
      chunk: chunkStr,
      stream: streamType,
      ts: Date.now(),
    };

    entry.eventSeq = (entry.eventSeq || 0) + 1;
    item.id = entry.eventSeq;

    entry.buffer.push(item);
    if (entry.buffer.length > MAX_BUFFER_LINES) {
      entry.buffer.shift();
    }

    const ssePayload = `id: ${item.id}\nevent: log\ndata: ${JSON.stringify(item)}\n\n`;
    for (const res of entry.subscribers) {
      try {
        res.write(ssePayload);
      } catch (err) {
        entry.subscribers.delete(res);
      }
    }
  }

  completeStream(taskId, outcome = {}) {
    if (!taskId) return;
    const entry = this.streams.get(taskId);
    if (!entry) return;

    entry.completed = true;
    entry.outcome = {
      status: outcome.status || 'success',
      durationMs: Date.now() - entry.startTime,
      error: outcome.error || null,
      exitCode: outcome.exitCode !== undefined ? outcome.exitCode : (outcome.status === 'error' ? 1 : 0),
    };

    const ssePayload = `event: complete\ndata: ${JSON.stringify(entry.outcome)}\n\n`;
    for (const res of entry.subscribers) {
      try {
        res.write(ssePayload);
        res.end();
      } catch (err) {
        // client closed
      }
    }
    entry.subscribers.clear();

    // Schedule cleanup of memory after retention period
    entry.cleanupTimer = setTimeout(() => {
      this.streams.delete(taskId);
    }, RETENTION_MS);
    if (entry.cleanupTimer.unref) entry.cleanupTimer.unref();
  }

  getStream(taskId) {
    return this.streams.get(taskId) || null;
  }

  handleSseRequest(taskId, req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    const entry = this.streams.get(taskId);

    // Support W3C Last-Event-ID for reconnection (#392)
    const lastEventIdStr = req?.headers ? req.headers['last-event-id'] : undefined;
    const lastEventId = lastEventIdStr ? parseInt(lastEventIdStr, 10) : 0;
    const effectiveLogs = (entry?.buffer || []).filter((item) => !lastEventId || (item.id && item.id > lastEventId));

    // Initial event with current state and buffered logs
    const initData = {
      taskId,
      runId: entry?.runId || null,
      status: entry ? (entry.completed ? 'completed' : 'running') : 'idle',
      bufferedLogs: effectiveLogs,
    };
    res.write(`event: init\ndata: ${JSON.stringify(initData)}\n\n`);

    if (!entry || entry.completed) {
      // Not running or already completed
      if (entry?.completed) {
        res.write(`event: complete\ndata: ${JSON.stringify(entry.outcome)}\n\n`);
      }
      res.end();
      return;
    }

    // Subscribe to live events
    entry.subscribers.add(res);

    // Keepalive ping every 15 seconds
    const pingTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch (e) {
        clearInterval(pingTimer);
        entry.subscribers.delete(res);
      }
    }, 15000);
    if (pingTimer.unref) pingTimer.unref();

    req.on('close', () => {
      clearInterval(pingTimer);
      entry.subscribers.delete(res);
    });
  }
}

export const logStreamer = new LogStreamer();
