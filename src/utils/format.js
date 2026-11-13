const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

/** "2026-11-16" -> "Mon 16 Nov 2026" */
function formatDisplayDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "14:30" -> "2:30 PM" */
function formatDisplayTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${meridiem}`;
}

/** 9 -> "9:00 AM" */
function formatHour(hour) {
  return formatDisplayTime(`${pad(hour)}:00`);
}

/** [1,2,3,4,5,6] -> "Mon–Sat"; non-contiguous -> "Mon, Wed, Fri" */
function formatWorkingDays(days) {
  const sorted = [...new Set(days)].sort((a, b) => (a || 7) - (b || 7)); // Sunday last
  const keys = sorted.map((d) => d || 7);
  const contiguous = keys.every((d, i) => i === 0 || d === keys[i - 1] + 1);
  if (contiguous && sorted.length > 2) {
    return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}

module.exports = { formatDisplayDate, formatDisplayTime, formatHour, formatWorkingDays };
