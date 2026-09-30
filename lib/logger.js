// Unified logging wrapper for dsh-cron (#204)
// Routes logs through ctx.logger when running inside DSH/Cordis,
// and safely falls back to console in tests or standalone runs.

let currentLogger = console;

export function setLogger(logger) {
  if (logger && typeof logger === 'object') {
    currentLogger = logger;
  }
}

function getLogger() {
  return currentLogger;
}

export const logger = {
  info(...args) {
    const fn = currentLogger.info || currentLogger.log || console.log;
    return fn.call(currentLogger, ...args);
  },
  warn(...args) {
    const fn = currentLogger.warn || currentLogger.log || console.warn;
    return fn.call(currentLogger, ...args);
  },
  error(...args) {
    const fn = currentLogger.error || currentLogger.log || console.error;
    return fn.call(currentLogger, ...args);
  },
  debug(...args) {
    const fn = currentLogger.debug || currentLogger.log || console.debug;
    return fn.call(currentLogger, ...args);
  },
  log(...args) {
    const fn = currentLogger.info || currentLogger.log || console.log;
    return fn.call(currentLogger, ...args);
  },
};
