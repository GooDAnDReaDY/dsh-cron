import { Cron } from 'croner';
import { parseNaturalSchedule } from '../nl-schedule.js';

function pad(v) {
  return String(v).padStart(2, '0');
}

export function describeCron(cronPattern) {
  const parts = cronPattern.trim().split(/\s+/);
  if (parts.length === 5) {
    const [m, h, dom, mon, dow] = parts;
    if (m.startsWith('*/')) return `Every ${m.slice(2)} minutes`;
    if (dow === '1-5' && dom === '*' && mon === '*') {
      return `Weekdays at ${pad(h)}:${pad(m)}`;
    }
    if (dow === '*' && dom === '*' && mon === '*') {
      return `Every day at ${pad(h)}:${pad(m)}`;
    }
    if (dow === '5' && dom === '*' && mon === '*') {
      return `Fridays at ${pad(h)}:${pad(m)}`;
    }
  }
  return cronPattern;
}

/** One-shot from an ISO timestamp or an explicit "at:" prefix, else null. */
function parseAtExpression(str) {
  const atPrefixMatch = str.match(/^(?:at:\s*|at\s+)(.+)$/i);
  const candidateIso = atPrefixMatch ? atPrefixMatch[1].trim() : str;
  const parsedDate = new Date(candidateIso);
  if (isNaN(parsedDate.getTime()) || !(candidateIso.includes('-') || candidateIso.includes('T') || atPrefixMatch)) {
    return null;
  }
  const targetMs = parsedDate.getTime();
  return {
    cronPattern: null,
    isOneShot: true,
    targetTimestamp: targetMs,
    humanText: `One-shot at ${parsedDate.toISOString()}`,
    nextRun: targetMs
  };
}

/**
 * Relative one-shot: "in 20m", "in 2h", "in 30s", "in 1d" and the accepted
 * Russian input aliases ("через 15 минут").
 */
function parseRelativeOneShot(str) {
  const match = str.match(/^(?:in\s+|через\s+)(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|мин|минут|часа?|часов)?$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  let delayMs = num * 60 * 1000;
  let unitText = `${num} min`;
  if (unit.startsWith('s')) {
    delayMs = num * 1000;
    unitText = `${num} sec`;
  } else if (unit.startsWith('h') || unit.startsWith('час')) {
    delayMs = num * 3600 * 1000;
    unitText = `${num} h`;
  } else if (unit.startsWith('d')) {
    delayMs = num * 86400 * 1000;
    unitText = `${num} d`;
  }
  const targetMs = Date.now() + delayMs;
  return {
    cronPattern: null,
    isOneShot: true,
    targetTimestamp: targetMs,
    humanText: `One-shot in ${unitText} (at ${new Date(targetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
    nextRun: targetMs
  };
}

/** Repeating interval: "every 5m", "every 2h", "every 1d". */
function parseIntervalExpression(str) {
  const match = str.match(/^every\s+(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  let pattern = null;
  let humanText = null;

  if (unit.startsWith('m')) {
    if (num < 1) {
      throw new Error('Invalid interval: minute interval must be at least 1 minute');
    }
    if (num >= 60) {
      if (num % 60 === 0) {
        const hours = num / 60;
        if (hours >= 24) {
          if (hours % 24 === 0) {
            const days = hours / 24;
            if (days > 31) {
              throw new Error(`Invalid interval: minute interval "${num}m" (${days} days) exceeds 31 days`);
            }
            pattern = `0 0 */${days} * *`;
            humanText = `Every ${days} days`;
          } else {
            throw new Error(`Invalid interval: minute interval "${num}m" (${hours} hours) cannot be expressed as a cron step`);
          }
        } else {
          pattern = `0 */${hours} * * *`;
          humanText = `Every ${hours} hours`;
        }
      } else {
        throw new Error(`Invalid interval: minute interval "${num}m" exceeds 59 minutes and is not a multiple of 60. Use hours (e.g. every 2h) or a multiple of 60m`);
      }
    } else {
      pattern = `*/${num} * * * *`;
      humanText = `Every ${num} minutes`;
    }
  } else if (unit.startsWith('h')) {
    if (num < 1) {
      throw new Error('Invalid interval: hour interval must be at least 1 hour');
    }
    if (num >= 24) {
      if (num % 24 === 0) {
        const days = num / 24;
        if (days > 31) {
          throw new Error(`Invalid interval: hour interval "${num}h" (${days} days) exceeds 31 days`);
        }
        pattern = `0 0 */${days} * *`;
        humanText = `Every ${days} days`;
      } else {
        throw new Error(`Invalid interval: hour interval "${num}h" exceeds 23 hours and is not a multiple of 24. Use days (e.g. every 2d) or a multiple of 24h`);
      }
    } else {
      pattern = `0 */${num} * * *`;
      humanText = `Every ${num} hours`;
    }
  } else if (unit.startsWith('d')) {
    if (num < 1 || num > 31) {
      throw new Error(`Invalid interval: day interval "${num}d" must be between 1 and 31 days`);
    }
    pattern = `0 0 */${num} * *`;
    humanText = `Every ${num} days`;
  }

  if (pattern) {
    try {
      const testJob = new Cron(pattern, { sloppyRanges: true });
      const next = testJob.nextRun();
      return {
        cronPattern: pattern,
        humanText,
        isInterval: true,
        nextRun: next ? next.getTime() : null,
      };
    } catch (err) {
      throw new Error(`Invalid interval pattern "${pattern}": ${err.message}`);
    }
  }
  return null;
}

/**
 * @-shorthands (#15) and the friendly aliases, including the Russian input
 * aliases. Russian keywords are accepted input, not display strings.
 */
function makeAliasResult(cronPattern, humanText) {
  try {
    const job = new Cron(cronPattern, { sloppyRanges: true });
    const next = job.nextRun();
    return { cronPattern, humanText, nextRun: next ? next.getTime() : null };
  } catch {
    return { cronPattern, humanText };
  }
}

function parseAliasExpression(str) {
  const lower = str.toLowerCase();
  if (lower === '@hourly') return makeAliasResult('0 * * * *', 'Every hour');
  if (lower === '@daily' || lower === '@midnight') return makeAliasResult('0 0 * * *', 'Every day at 00:00');
  if (lower === '@weekly') return makeAliasResult('0 0 * * 0', 'Every week on Sunday at 00:00');
  if (lower === '@monthly') return makeAliasResult('0 0 1 * *', 'Every month on the 1st at 00:00');
  if (lower === '@yearly' || lower === '@annually') return makeAliasResult('0 0 1 1 *', 'Every year on Jan 1 at 00:00');
  const everyAlias = str.match(/^@every\s+(\d+)\s*(sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (everyAlias) {
    return parseIntervalExpression(`every ${everyAlias[1]} ${everyAlias[2]}`);
  }
  if (lower === 'daily' || lower === 'каждый день') {
    return makeAliasResult('0 9 * * *', 'Every day at 09:00');
  }
  if (lower === 'weekdays' || lower === 'в будние дни' || lower === 'по будням') {
    return makeAliasResult('0 9 * * 1-5', 'Weekdays at 09:00');
  }
  if (lower === 'hourly' || lower === 'каждый час') {
    return makeAliasResult('0 * * * *', 'Every hour');
  }
  return null;
}

/** Validate a 5-field cron expression; the only branch that throws. */
function parseCronExpression(str) {
  try {
    const testJob = new Cron(str, { sloppyRanges: true });
    const next = testJob.nextRun();
    return {
      cronPattern: str,
      humanText: describeCron(str),
      nextRun: next ? next.getTime() : null,
    };
  } catch (err) {
    throw new Error('Invalid cron schedule: ' + err.message);
  }
}

/**
 * Turn a typed schedule into a cron pattern or a one-shot target.
 */
export function parseScheduleExpression(input) {
  const str = String(input || '').trim();
  if (!str) throw new Error('Schedule expression must not be empty');

  return parseAtExpression(str)
    || parseRelativeOneShot(str)
    || parseIntervalExpression(str)
    || parseAliasExpression(str)
    || parseNaturalSchedule(str)
    || parseCronExpression(str);
}

/**
 * Preview future execution timestamps for a cron or interval schedule.
 */
export function previewSchedule(scheduleStr, options = {}) {
  const str = String(scheduleStr || '').trim();
  if (!str) throw new Error('Schedule expression must not be empty');
  const parsed = parseScheduleExpression(str);
  const count = Math.min(Math.max(Number(options.count) || 5, 1), 10);
  const timezone = options.timezone || undefined;

  if (parsed.isOneShot) {
    return {
      isOneShot: true,
      humanText: parsed.humanText,
      runs: [new Date(parsed.nextRun).toISOString()],
    };
  }

  const job = new Cron(parsed.cronPattern, {
    timezone,
    sloppyRanges: true,
  });
  const runs = [];
  let current = new Date();
  for (let i = 0; i < count; i++) {
    const next = job.nextRun(current);
    if (!next) break;
    runs.push(next.toISOString());
    current = new Date(next.getTime() + 1000);
  }
  return {
    isOneShot: false,
    cronPattern: parsed.cronPattern,
    humanText: describeCron(parsed.cronPattern),
    runs,
  };
}

