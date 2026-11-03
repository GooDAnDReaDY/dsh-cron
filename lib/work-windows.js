import { logger } from './logger.js';

/**
 * Parses an hours range string like "22:00-06:00", "09:00-18:00", "22-6".
 * Returns { startMinute, endMinute, spansMidnight } or null if invalid.
 */
export function parseHoursRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  const match = rangeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  const startH = parseInt(match[1], 10);
  const startM = match[2] ? parseInt(match[2], 10) : 0;
  const endH = parseInt(match[3], 10);
  const endM = match[4] ? parseInt(match[4], 10) : 0;

  if (startH < 0 || startH > 23 || startM < 0 || startM > 59) return null;
  if (endH < 0 || endH > 23 || endM < 0 || endM > 59) return null;

  const startMinute = startH * 60 + startM;
  const endMinute = endH * 60 + endM;
  const spansMidnight = startMinute > endMinute;

  return { startMinute, endMinute, spansMidnight };
}

/**
 * Normalizes workWindow configuration.
 */
export function normalizeWorkWindow(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const enabled = cfg.enabled !== false;
  const hours = typeof cfg.hours === 'string' ? cfg.hours.trim() : '';
  const parsedHours = parseHoursRange(hours);

  let daysOfWeek = [];
  if (Array.isArray(cfg.daysOfWeek)) {
    daysOfWeek = cfg.daysOfWeek
      .map((d) => parseInt(d, 10))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  }

  const outsidePolicy = ['defer', 'skip'].includes(String(cfg.outsidePolicy || '').toLowerCase())
    ? String(cfg.outsidePolicy).toLowerCase()
    : 'skip';

  const timeBoxMinutes = Number(cfg.timeBoxMinutes) > 0 ? Number(cfg.timeBoxMinutes) : null;
  const offPeakOnly = Boolean(cfg.offPeakOnly);

  // If offPeakOnly is set and hours are not specified, default to 22:00-07:00
  const effectiveHours = offPeakOnly && !hours ? '22:00-07:00' : hours;

  return {
    enabled,
    hours: effectiveHours,
    daysOfWeek,
    outsidePolicy,
    timeBoxMinutes,
    offPeakOnly,
  };
}

/**
 * Extracts current hour, minute, and day of week for a Date in a specific timezone.
 */
export function getTimeInTimezone(date, timezone) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour12: false,
      weekday: 'narrow',
      hour: 'numeric',
      minute: 'numeric',
    });
    const parts = formatter.formatToParts(d);
    let hour = 0;
    let minute = 0;
    for (const part of parts) {
      if (part.type === 'hour') hour = parseInt(part.value, 10) % 24;
      if (part.type === 'minute') minute = parseInt(part.value, 10);
    }
    // Calculate 0-6 day of week in timezone
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      weekday: 'numeric', // 1..7 (Sunday is 1 or 7 depending on locale, let's use short)
    });
    const shortDay = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      weekday: 'short',
    }).format(d);
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[shortDay] !== undefined ? dayMap[shortDay] : d.getDay();

    return { hour, minute, currentMinute: hour * 60 + minute, dayOfWeek };
  } catch (_err) {
    void _err;
    const d = date instanceof Date ? date : new Date(date);
    return {
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      currentMinute: d.getUTCHours() * 60 + d.getUTCMinutes(),
      dayOfWeek: d.getUTCDay(),
    };
  }
}

/**
 * Checks if current time is inside the work window.
 */
export function isInsideWorkWindow(workWindow, date = new Date(), timezone = 'UTC') {
  const norm = normalizeWorkWindow(workWindow);
  if (!norm || !norm.enabled) return { inside: true };

  const { currentMinute, dayOfWeek } = getTimeInTimezone(date, timezone);

  // 1. Day of week check
  if (norm.daysOfWeek && norm.daysOfWeek.length > 0) {
    if (!norm.daysOfWeek.includes(dayOfWeek)) {
      return {
        inside: false,
        reason: `Day of week (${dayOfWeek}) not in allowed days [${norm.daysOfWeek.join(',')}]`,
      };
    }
  }

  // 2. Hours check
  if (norm.hours) {
    const parsed = parseHoursRange(norm.hours);
    if (parsed) {
      const { startMinute, endMinute, spansMidnight } = parsed;
      let inRange = false;
      if (spansMidnight) {
        inRange = currentMinute >= startMinute || currentMinute < endMinute;
      } else {
        inRange = currentMinute >= startMinute && currentMinute < endMinute;
      }
      if (!inRange) {
        return {
          inside: false,
          reason: `Current time (${Math.floor(currentMinute / 60)}:${String(currentMinute % 60).padStart(2, '0')}) is outside allowed window ${norm.hours}`,
        };
      }
    }
  }

  return { inside: true };
}

/**
 * Calculates the next timestamp (ms) when the window opens.
 */
export function getNextWindowStart(workWindow, date = new Date(), timezone = 'UTC') {
  const norm = normalizeWorkWindow(workWindow);
  if (!norm || !norm.enabled) return Date.now();

  const now = date instanceof Date ? date.getTime() : new Date(date).getTime();
  // Step forward minute by minute (up to 7 days = 10080 minutes) to find when window opens
  for (let m = 1; m <= 10080; m++) {
    const candidate = new Date(now + m * 60 * 1000);
    const check = isInsideWorkWindow(norm, candidate, timezone);
    if (check.inside) {
      return candidate.getTime();
    }
  }
  return now + 3600000; // Fallback 1 hour
}
