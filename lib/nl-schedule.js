import { Cron } from 'croner';

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Parse time string into { hour, minute }.
 * Supports:
 * - "9:00", "09:30", "18:45"
 * - "9am", "9:30am", "6pm", "11:15pm"
 * - "9 утра", "2 дня", "6 вечера", "11 вечера", "1 ночи"
 * - Plain hour "9", "14"
 */
export function parseTimeString(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim().toLowerCase();

  // 1. English 12h: "9am", "9:30am", "6pm", "6:15pm"
  const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = ampmMatch[3] === 'pm';
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return { hour, minute };
  }

  // 2. Russian qualifiers: "9 утра", "2 дня", "6 вечера", "11 вечера", "1 ночи"
  const ruMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи)$/);
  if (ruMatch) {
    let hour = parseInt(ruMatch[1], 10);
    const minute = ruMatch[2] ? parseInt(ruMatch[2], 10) : 0;
    const period = ruMatch[3];
    if (minute < 0 || minute > 59) return null;
    if (period === 'вечера' && hour < 12) hour += 12;
    if (period === 'дня' && hour >= 1 && hour <= 11) hour += 12;
    if (period === 'ночи' && hour === 12) hour = 0;
    if (hour < 0 || hour > 23) return null;
    return { hour, minute };
  }

  // 3. 24h format: "14:30", "09:00", "9:00"
  const colonMatch = str.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const hour = parseInt(colonMatch[1], 10);
    const minute = parseInt(colonMatch[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }

  // 4. Plain hour: "9", "14", "22"
  const plainMatch = str.match(/^(\d{1,2})$/);
  if (plainMatch) {
    const hour = parseInt(plainMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return { hour, minute: 0 };
    }
  }

  return null;
}

const DAY_OF_WEEK_MAP = {
  // Sunday (0)
  'воскресенье': 0, 'воскресеньям': 0, 'воскресенья': 0, 'вс': 0,
  'sunday': 0, 'sundays': 0, 'sun': 0,
  // Monday (1)
  'понедельник': 1, 'понедельникам': 1, 'пн': 1,
  'monday': 1, 'mondays': 1, 'mon': 1,
  // Tuesday (2)
  'вторник': 2, 'вторникам': 2, 'вт': 2,
  'tuesday': 2, 'tuesdays': 2, 'tue': 2,
  // Wednesday (3)
  'среда': 3, 'среду': 3, 'средам': 3, 'ср': 3,
  'wednesday': 3, 'wednesdays': 3, 'wed': 3,
  // Thursday (4)
  'четверг': 4, 'четвергам': 4, 'чт': 4,
  'thursday': 4, 'thursdays': 4, 'thu': 4,
  // Friday (5)
  'пятница': 5, 'пятницу': 5, 'пятницам': 5, 'пт': 5,
  'friday': 5, 'fridays': 5, 'fri': 5,
  // Saturday (6)
  'суббота': 6, 'субботу': 6, 'субботам': 6, 'сб': 6,
  'saturday': 6, 'saturdays': 6, 'sat': 6,
};

const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function withNextRun(res) {
  if (res && res.cronPattern && !res.nextRun) {
    try {
      const job = new Cron(res.cronPattern, { sloppyRanges: true });
      const next = job.nextRun();
      res.nextRun = next ? next.getTime() : null;
    } catch {
      // ignore
    }
  }
  return res;
}

/**
 * Deterministically parse natural language schedule expression.
 * Returns parsed schedule object compatible with parseScheduleExpression or null.
 */
export function parseNaturalSchedule(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Normalize: lower case, single spaces, strip surrounding punctuation
  const s = raw.toLowerCase()
    .replace(/[.,;!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // A. Relative delay in Russian: "через 15 минут", "через 2 часа"
  const delayMatch = s.match(/^через\s+(\d+)\s*(секунд[ыа]?|сек|s|минут[ы]?|мин|m|часа?|часов|h|дней|дня|день|d)$/);
  if (delayMatch) {
    const num = parseInt(delayMatch[1], 10);
    const u = delayMatch[2];
    let unit = 'm';
    if (u.startsWith('сек') || u === 's') unit = 's';
    else if (u.startsWith('час') || u === 'h') unit = 'h';
    else if (u.startsWith('дн') || u === 'день' || u === 'd') unit = 'd';
    let delayMs = num * 60 * 1000;
    let unitText = `${num} min`;
    if (unit === 's') { delayMs = num * 1000; unitText = `${num} sec`; }
    else if (unit === 'h') { delayMs = num * 3600 * 1000; unitText = `${num} h`; }
    else if (unit === 'd') { delayMs = num * 86400 * 1000; unitText = `${num} d`; }
    const targetMs = Date.now() + delayMs;
    return {
      cronPattern: null,
      isOneShot: true,
      targetTimestamp: targetMs,
      humanText: `One-shot in ${unitText} (at ${new Date(targetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      nextRun: targetMs,
      isNatural: true,
    };
  }

  // B. Periodic intervals in Russian: "каждые 15 минут", "каждые 2 часа", "каждые полчаса"
  if (s === 'каждые полчаса' || s === 'каждые пол-часа' || s === 'every half hour') {
    return withNextRun({
      cronPattern: '*/30 * * * *',
      humanText: 'Every 30 minutes',
      isInterval: true,
      isNatural: true,
    });
  }

  const intervalRu = s.match(/^кажды[еяй]\s+(\d+)\s*(минут[ы]?|мин|часа?|часов|дней|дня|день)$/);
  if (intervalRu) {
    const num = parseInt(intervalRu[1], 10);
    const u = intervalRu[2];
    if (u.startsWith('мин')) {
      if (num < 1) return null;
      if (num < 60) {
        return withNextRun({
          cronPattern: `*/${num} * * * *`,
          humanText: `Every ${num} minutes`,
          isInterval: true,
          isNatural: true,
        });
      }
    } else if (u.startsWith('час')) {
      if (num >= 1 && num < 24) {
        return withNextRun({
          cronPattern: `0 */${num} * * *`,
          humanText: `Every ${num} hours`,
          isInterval: true,
          isNatural: true,
        });
      }
    } else if (u.startsWith('дн') || u === 'день') {
      if (num >= 1 && num <= 31) {
        return withNextRun({
          cronPattern: `0 0 */${num} * *`,
          humanText: `Every ${num} days`,
          isInterval: true,
          isNatural: true,
        });
      }
    }
  }

  // C. Hourly / Midnight / Noon
  if (s === 'каждый час' || s === 'в начале каждого часа' || s === 'в начале часа' || s === 'every hour' || s === 'hourly') {
    return withNextRun({
      cronPattern: '0 * * * *',
      humanText: 'Every hour',
      isNatural: true,
    });
  }
  if (s === 'в полночь' || s === 'at midnight' || s === 'midnight') {
    return withNextRun({
      cronPattern: '0 0 * * *',
      humanText: 'Every day at 00:00',
      isNatural: true,
    });
  }
  if (s === 'в полдень' || s === 'at noon' || s === 'noon') {
    return withNextRun({
      cronPattern: '0 12 * * *',
      humanText: 'Every day at 12:00',
      isNatural: true,
    });
  }

  // D. Daily at specific time:
  const dailyMatch = s.match(/^(?:каждый\s+день|ежедневно|every\s+day|daily)\s+(?:в|at)\s+(.+)$/);
  if (dailyMatch) {
    const t = parseTimeString(dailyMatch[1]);
    if (t) {
      return withNextRun({
        cronPattern: `${t.minute} ${t.hour} * * *`,
        humanText: `Every day at ${pad(t.hour)}:${pad(t.minute)}`,
        isNatural: true,
      });
    }
  }
  // Reverse: "в 9:00 каждый день", "at 9am daily"
  const dailyRevMatch = s.match(/^(?:в|at)\s+(.+?)\s+(?:каждый\s+день|ежедневно|every\s+day|daily)$/);
  if (dailyRevMatch) {
    const t = parseTimeString(dailyRevMatch[1]);
    if (t) {
      return withNextRun({
        cronPattern: `${t.minute} ${t.hour} * * *`,
        humanText: `Every day at ${pad(t.hour)}:${pad(t.minute)}`,
        isNatural: true,
      });
    }
  }

  // E. Weekdays at specific time:
  const weekdayMatch = s.match(/^(?:по\s+будням|в\s+будние(?:\s+дни)?|с\s+понедельника\s+по\s+пятницу|every\s+weekday|weekdays|on\s+weekdays|mon-fri)\s+(?:в|at)\s+(.+)$/);
  if (weekdayMatch) {
    const t = parseTimeString(weekdayMatch[1]);
    if (t) {
      return withNextRun({
        cronPattern: `${t.minute} ${t.hour} * * 1-5`,
        humanText: `Weekdays at ${pad(t.hour)}:${pad(t.minute)}`,
        isNatural: true,
      });
    }
  }
  // Reverse: "в 10:00 по будням"
  const weekdayRevMatch = s.match(/^(?:в|at)\s+(.+?)\s+(?:по\s+будням|в\s+будние(?:\s+дни)?|every\s+weekday|weekdays)$/);
  if (weekdayRevMatch) {
    const t = parseTimeString(weekdayRevMatch[1]);
    if (t) {
      return withNextRun({
        cronPattern: `${t.minute} ${t.hour} * * 1-5`,
        humanText: `Weekdays at ${pad(t.hour)}:${pad(t.minute)}`,
        isNatural: true,
      });
    }
  }

  // F. Weekends at specific time:
  const weekendMatch = s.match(/^(?:по\s+выходным|в\s+выходные(?:\s+дни)?|по\s+субботам\s+и\s+воскресеньям|every\s+weekend|weekends|on\s+weekends)\s+(?:в|at)\s+(.+)$/);
  if (weekendMatch) {
    const t = parseTimeString(weekendMatch[1]);
    if (t) {
      return withNextRun({
        cronPattern: `${t.minute} ${t.hour} * * 0,6`,
        humanText: `Weekends at ${pad(t.hour)}:${pad(t.minute)}`,
        isNatural: true,
      });
    }
  }

  // G. Specific day of week:
  const dowMatch = s.match(/^(?:по\s+|кажд(?:ый|ую|ое)\s+|every\s+|on\s+)?(понедельник(?:ам)?|вторник(?:ам)?|сред[ау]|средам|четверг(?:ам)?|пятниц[ау]|пятницам|суббот[ау]|субботам|воскресень[ея]|воскресеньям|monday|mondays|tuesday|tuesdays|wednesday|wednesdays|thursday|thursdays|friday|fridays|saturday|saturdays|sunday|sundays)\s+(?:в|at)\s+(.+)$/);
  if (dowMatch) {
    const dayWord = dowMatch[1];
    const dow = DAY_OF_WEEK_MAP[dayWord];
    if (dow !== undefined) {
      const t = parseTimeString(dowMatch[2]);
      if (t) {
        return withNextRun({
          cronPattern: `${t.minute} ${t.hour} * * ${dow}`,
          humanText: `${DAY_NAMES_EN[dow]}s at ${pad(t.hour)}:${pad(t.minute)}`,
          isNatural: true,
        });
      }
    }
  }

  // H. Monthly on specific day of month:
  const monthlyRu = s.match(/^(?:каждое\s+(\d+)\s+число|(\d+)\s+числа\s+каждого\s+месяца)\s+(?:в|at)\s+(.+)$/);
  if (monthlyRu) {
    const day = parseInt(monthlyRu[1] || monthlyRu[2], 10);
    if (day >= 1 && day <= 31) {
      const t = parseTimeString(monthlyRu[3]);
      if (t) {
        return withNextRun({
          cronPattern: `${t.minute} ${t.hour} ${day} * *`,
          humanText: `Day ${day} of every month at ${pad(t.hour)}:${pad(t.minute)}`,
          isNatural: true,
        });
      }
    }
  }

  const monthlyEn = s.match(/^(?:on\s+the\s+(\d+)(?:st|nd|rd|th)?\s+of\s+every\s+month|every\s+month\s+on\s+the\s+(\d+)(?:st|nd|rd|th)?)\s+at\s+(.+)$/);
  if (monthlyEn) {
    const day = parseInt(monthlyEn[1] || monthlyEn[2], 10);
    if (day >= 1 && day <= 31) {
      const t = parseTimeString(monthlyEn[3]);
      if (t) {
        return withNextRun({
          cronPattern: `${t.minute} ${t.hour} ${day} * *`,
          humanText: `Day ${day} of every month at ${pad(t.hour)}:${pad(t.minute)}`,
          isNatural: true,
        });
      }
    }
  }

  // I. Standalone day of week without time (defaults to 09:00):
  const standaloneDow = s.match(/^(?:по\s+|кажд(?:ый|ую|ое)\s+|every\s+|on\s+)(понедельник(?:ам)?|вторник(?:ам)?|сред[ау]|средам|четверг(?:ам)?|пятниц[ау]|пятницам|суббот[ау]|субботам|воскресень[ея]|воскресеньям|monday|mondays|tuesday|tuesdays|wednesday|wednesdays|thursday|thursdays|friday|fridays|saturday|saturdays|sunday|sundays)$/);
  if (standaloneDow) {
    const dow = DAY_OF_WEEK_MAP[standaloneDow[1]];
    if (dow !== undefined) {
      return withNextRun({
        cronPattern: `0 9 * * ${dow}`,
        humanText: `${DAY_NAMES_EN[dow]}s at 09:00`,
        isNatural: true,
      });
    }
  }

  return null;
}
