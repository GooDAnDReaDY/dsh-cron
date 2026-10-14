/**
 * Adaptive Polling & Exponential Backoff (#329)
 *
 * Automatically scales execution intervals up when no changes / idle runs are detected
 * (e.g. silent skips, unchanged outputs) and instantly resets back to minInterval
 * when new data is returned.
 */

import { logger } from './logger.js';

export const DEFAULT_ADAPTIVE_CONFIG = {
  enabled: false,
  minInterval: '5m',
  maxInterval: '2h',
  backoffFactor: 1.5,
  idleRunsThreshold: 3,
  detectUnchangedOutput: true,
};

/**
 * Parse human interval string (e.g. "30s", "5m", "2h", "1d") or number into milliseconds.
 */
export function parseIntervalMs(val, defaultMs = 300000) {
  if (typeof val === 'number' && !isNaN(val) && val > 0) {
    return Math.round(val);
  }
  if (!val || typeof val !== 'string') return defaultMs;

  const match = val.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!match) return defaultMs;

  const num = parseFloat(match[1]);
  const unit = (match[2] || 'm').toLowerCase();

  switch (unit) {
    case 'ms': return Math.round(num);
    case 's': return Math.round(num * 1000);
    case 'm': return Math.round(num * 60 * 1000);
    case 'h': return Math.round(num * 3600 * 1000);
    case 'd': return Math.round(num * 86400 * 1000);
    default: return defaultMs;
  }
}

/**
 * Format milliseconds into human readable interval (e.g. "5m", "1h 30m", "45s").
 */
export function formatInterval(ms) {
  if (!ms || typeof ms !== 'number' || ms <= 0) return '0s';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hrs = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hrs}h ${remMin}m` : `${hrs}h`;
}

/**
 * Sanitize and normalize adaptive configuration from payload.
 */
export function sanitizeAdaptiveConfig(adaptive) {
  if (!adaptive || typeof adaptive !== 'object') {
    return null;
  }
  const enabled = Boolean(adaptive.enabled);
  const minInterval = typeof adaptive.minInterval === 'string' ? adaptive.minInterval.trim() : (adaptive.minInterval ? String(adaptive.minInterval) : '5m');
  const maxInterval = typeof adaptive.maxInterval === 'string' ? adaptive.maxInterval.trim() : (adaptive.maxInterval ? String(adaptive.maxInterval) : '2h');
  const backoffFactor = (typeof adaptive.backoffFactor === 'number' && adaptive.backoffFactor >= 1) ? adaptive.backoffFactor : 1.5;
  const idleRunsThreshold = (typeof adaptive.idleRunsThreshold === 'number' && adaptive.idleRunsThreshold >= 1) ? Math.floor(adaptive.idleRunsThreshold) : 3;
  const detectUnchangedOutput = adaptive.detectUnchangedOutput !== false;

  return {
    enabled,
    minInterval,
    maxInterval,
    backoffFactor,
    idleRunsThreshold,
    detectUnchangedOutput,
  };
}

/**
 * Evaluate if a completed run constitutes an "idle / no-change" execution.
 */
export function evaluateAdaptiveRun(task, outcome, runInfo, lastRun) {
  if (outcome?.status === 'silentSkip' || runInfo?.silentSkip === true) {
    return { isIdle: true, reason: 'silent_rule' };
  }
  if (runInfo?.validation && runInfo.validation.noChange === true) {
    return { isIdle: true, reason: 'validator_no_change' };
  }
  if (task.adaptive?.detectUnchangedOutput !== false && lastRun && outcome?.status === 'success') {
    const currentOut = String(outcome.output || '').trim();
    const lastOut = String(lastRun.output || '').trim();
    if (currentOut && lastOut && currentOut === lastOut) {
      return { isIdle: true, reason: 'unchanged_output' };
    }
  }
  return { isIdle: false, reason: 'active_output' };
}

/**
 * Calculate the next adaptive state and schedule interval.
 */
export function calculateNextAdaptiveState(task, isIdle, now = Date.now()) {
  const config = sanitizeAdaptiveConfig(task.adaptive) || DEFAULT_ADAPTIVE_CONFIG;
  const minMs = parseIntervalMs(config.minInterval, 300000);
  const maxMs = parseIntervalMs(config.maxInterval, 7200000);
  const factor = config.backoffFactor || 1.5;
  const threshold = config.idleRunsThreshold || 3;

  const prevState = task.adaptiveState || {
    idleCount: 0,
    currentIntervalMs: minMs,
    effectiveIntervalStr: formatInterval(minMs),
    active: false,
    lastAdjustedAt: now,
  };

  if (!isIdle) {
    // Reset back to base minInterval immediately upon real changes
    return {
      idleCount: 0,
      currentIntervalMs: minMs,
      effectiveIntervalStr: formatInterval(minMs),
      active: false,
      lastAdjustedAt: now,
      backedOff: false,
    };
  }

  const idleCount = (prevState.idleCount || 0) + 1;
  let currentIntervalMs = prevState.currentIntervalMs || minMs;
  let backedOff = false;

  if (idleCount >= threshold) {
    backedOff = true;
    currentIntervalMs = Math.min(Math.round(currentIntervalMs * factor), maxMs);
  }

  return {
    idleCount,
    currentIntervalMs,
    effectiveIntervalStr: formatInterval(currentIntervalMs),
    active: backedOff,
    lastAdjustedAt: now,
    backedOff,
  };
}
