/**
 * Pure slot / availability helpers (no DB access), so they are easy to unit test.
 * `booked` is a Map of "YYYY-MM-DD|HH:mm" -> number of active bookings (see countBooked).
 * `capacity` is how many bookings one time slot can hold.
 */
const { todayInTimezone, minutesNowInTimezone, addDays } = require('./validators');

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (date, time) => `${date}|${time}`;

/** Every bookable start time of a day: [{ time: "09:00", minutes: 540 }, ...] */
function allSlotTimes(rules) {
  const slots = [];
  const last = rules.closeHour * 60 - rules.slotMinutes;
  for (let minutes = rules.openHour * 60; minutes <= last; minutes += rules.slotMinutes) {
    slots.push({ time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, minutes });
  }
  return slots;
}

/** entries: [{ date: "YYYY-MM-DD", time: "HH:mm" }] -> Map of key -> count */
function countBooked(entries) {
  const booked = new Map();
  for (const { date, time } of entries) {
    const key = keyOf(date, time);
    booked.set(key, (booked.get(key) || 0) + 1);
  }
  return booked;
}

/** Free slots on one day: [{ time: "10:30", left: 2 }]. Empty for closed, past or fully booked days. */
function freeSlots(iso, rules, booked, capacity, now = new Date()) {
  const today = todayInTimezone(rules.timezone, now);
  if (iso < today) return [];

  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (!rules.workingDays.includes(weekday)) return [];

  // Today: only slots that are still in the future.
  const nowMinutes = iso === today ? minutesNowInTimezone(rules.timezone, now) : -1;

  return allSlotTimes(rules)
    .filter((slot) => slot.minutes > nowMinutes)
    .map((slot) => ({ time: slot.time, left: capacity - (booked.get(keyOf(iso, slot.time)) || 0) }))
    .filter((slot) => slot.left > 0);
}

/** Days that still have at least one free slot: [{ date, free }] (free = number of open time slots). */
function availableDays(rules, booked, capacity, now = new Date()) {
  const today = todayInTimezone(rules.timezone, now);
  const days = [];
  for (let i = 0; i <= rules.maxAdvanceDays; i += 1) {
    const date = addDays(today, i);
    const free = freeSlots(date, rules, booked, capacity, now).length;
    if (free > 0) days.push({ date, free });
  }
  return days;
}

/**
 * WhatsApp lists hold at most 10 rows. Returns one page of items and, when more remain, the offset
 * of the next page; a "More" row then takes the 10th slot.
 */
function paginate(items, offset = 0, maxRows = 10) {
  const remaining = items.length - offset;
  if (remaining <= maxRows) return { page: items.slice(offset), nextOffset: null };
  const size = maxRows - 1;
  return { page: items.slice(offset, offset + size), nextOffset: offset + size };
}

module.exports = { allSlotTimes, countBooked, freeSlots, availableDays, paginate, keyOf };
