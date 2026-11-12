import path from 'node:path';

export const CURRENT_SCHEMA_VERSION = 2;

export function runStoreMigrations(data, fromVersion = 1, toVersion = CURRENT_SCHEMA_VERSION) {
  if (!data || typeof data !== 'object') return data;
  let current = { ...data };

  // Migration from version 1 to 2 (Issue #390 & #393)
  if (fromVersion < 2 && toVersion >= 2) {
    if (Array.isArray(current.tasks)) {
      current.tasks = current.tasks.map((task) => {
        if (!task || typeof task !== 'object') return task;
        return {
          ...task,
          maxMemoryMb: task.maxMemoryMb !== undefined ? Number(task.maxMemoryMb) : 0,
          executionTimeoutMs: task.executionTimeoutMs !== undefined
            ? Number(task.executionTimeoutMs)
            : (Number(task.timeoutSeconds) > 0 ? Number(task.timeoutSeconds) * 1000 : 900000),
          maxLogBytesPerRun: task.maxLogBytesPerRun !== undefined ? Number(task.maxLogBytesPerRun) : (5 * 1024 * 1024),
          cpus: task.cpus !== undefined ? Number(task.cpus) : 0,
          maxArchiveMonths: task.maxArchiveMonths !== undefined ? Number(task.maxArchiveMonths) : 6,
        };
      });
    }
    current.schemaVersion = 2;
  }

  return current;
}

export function getDefaultStorePath() {
  const base = process.env.DSH_DATA_DIR
    || (process.env.DSH_HOME
      ? path.join(process.env.DSH_HOME, 'data')
      : path.join(process.env.HOME || '.', '.dsh', 'data'));
  return path.join(base, 'cron', 'tasks.json');
}
