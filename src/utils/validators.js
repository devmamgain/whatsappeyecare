/**
 * Pure validation helpers (no env / DB access) so they are easy to unit test.
 * `rules` = { timezone, openHour, closeHour, slotMinutes, workingDays, maxAdvanceDays }
 * Dates are handled as "YYYY-MM-DD" strings, times as "HH:mm" (24h).
 */

const NAME_REGEX = /^\p{L}[\p{L}\p{M}\s.'’-]{1,59}$/u;
const pad = (n) => String(n).padStart(2, '0');

function validateName(input) {
  const name = String(input || '').replace(/\s+/g, ' ').trim();
  return NAME_REGEX.test(name) ? { valid: true, value: name } : { valid: false };
}

// ---------- date helpers ----------

function todayInTimezone(timezone, now = new Date()) {
  // The en-CA locale formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function minutesNowInTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Parse free-text into "YYYY-MM-DD", or null if it cannot be understood. */
function parseDateInput(input, { timezone, now = new Date() }) {
  const text = String(input || '').trim().toLowerCase();
  const today = todayInTimezone(timezone, now);

  if (text === 'today') return today;
  if (['tomorrow', 'tmrw', 'tmr'].includes(text)) return addDays(today, 1);

  let y;
  let m;
  let d;
  let match;

  if ((match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2})[/\-.](\d{1,2})$/))) {
    // No year given: assume this year, or next year if that date has already passed.
    [d, m] = [Number(match[1]), Number(match[2])];
    y = Number(today.slice(0, 4));
    if (isRealDate(y, m, d) && `${y}-${pad(m)}-${pad(d)}` < today) y += 1;
  } else {
    return null;
  }

  return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/**
 * @returns {{valid: true, value: string} | {valid: false, reason: string}}
 * reasons: format | past | too_far | closed | today_over
 */
function validateDate(input, rules, now = new Date()) {
  const iso = parseDateInput(input, { timezone: rules.timezone, now });
  if (!iso) return { valid: false, reason: 'format' };

  const today = todayInTimezone(rules.timezone, now);
  if (iso < today) return { valid: false, reason: 'past' };
  if (iso > addDays(today, rules.maxAdvanceDays)) return { valid: false, reason: 'too_far' };

  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (!rules.workingDays.includes(weekday)) return { valid: false, reason: 'closed' };

  if (iso === today) {
    const lastSlot = rules.closeHour * 60 - rules.slotMinutes;
    if (minutesNowInTimezone(rules.timezone, now) >= lastSlot) {
      return { valid: false, reason: 'today_over' };
    }
  }

  return { valid: true, value: iso };
}

// ---------- time helpers ----------

/** Parse "10:30", "10.30", "3pm", "3:15 PM", "15:00" into minutes since midnight, or null. */
function parseTimeInput(input) {
  const text = String(input || '')
    .toLowerCase()
    .replace(/a\.?m\.?/g, 'am')
    .replace(/p\.?m\.?/g, 'pm')
    .replace(/\s+/g, '');
  const match = text.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/**
 * @returns {{valid: true, value: string} | {valid: false, reason: string}}
 * reasons: format | outside_hours | bad_slot | past_time
 */
function validateTime(input, rules, { date, now = new Date() } = {}) {
  const minutes = parseTimeInput(input);
  if (minutes === null) return { valid: false, reason: 'format' };

  const firstSlot = rules.openHour * 60;
  const lastSlot = rules.closeHour * 60 - rules.slotMinutes;
  if (minutes < firstSlot || minutes > lastSlot) return { valid: false, reason: 'outside_hours' };
  if (minutes % rules.slotMinutes !== 0) return { valid: false, reason: 'bad_slot' };

  if (date && date === todayInTimezone(rules.timezone, now)) {
    if (minutes <= minutesNowInTimezone(rules.timezone, now)) {
      return { valid: false, reason: 'past_time' };
    }
  }

  return { valid: true, value: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` };
}

module.exports = {
  validateName,
  validateDate,
  validateTime,
  parseDateInput,
  parseTimeInput,
  todayInTimezone,
  addDays,
};
