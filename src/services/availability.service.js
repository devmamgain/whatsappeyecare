const prisma = require('../lib/prisma');
const config = require('../config/env');
const slots = require('../utils/slots');
const { toDbDate, todayInTimezone, addDays } = require('../utils/validators');

const rules = config.booking;

/**
 * How many bookings one time slot can hold: SLOT_CAPACITY if set, otherwise one per
 * active doctor (never less than 1).
 */
async function getCapacity(db = prisma) {
  if (rules.slotCapacity > 0) return rules.slotCapacity;
  const activeDoctors = await db.doctor.count({ where: { isActive: true } });
  return Math.max(1, activeDoctors);
}

/** Active (non-cancelled) bookings between two dates, inclusive, as a Map for the slot helpers. */
async function loadBooked(fromIso, toIso, db = prisma) {
  const rows = await db.appointment.findMany({
    where: {
      appointmentDate: { gte: toDbDate(fromIso), lte: toDbDate(toIso) },
      status: { not: 'CANCELLED' },
    },
    select: { appointmentDate: true, appointmentTime: true },
  });
  return slots.countBooked(
    rows.map((r) => ({ date: r.appointmentDate.toISOString().slice(0, 10), time: r.appointmentTime })),
  );
}

/** Days (within the booking window) that still have at least one free slot. */
async function getAvailableDays(now = new Date()) {
  const today = todayInTimezone(rules.timezone, now);
  const [booked, capacity] = await Promise.all([
    loadBooked(today, addDays(today, rules.maxAdvanceDays)),
    getCapacity(),
  ]);
  return slots.availableDays(rules, booked, capacity, now);
}

/** Free time slots on one day: [{ time: "10:30", left }]. */
async function getFreeSlots(iso, now = new Date()) {
  const [booked, capacity] = await Promise.all([loadBooked(iso, iso), getCapacity()]);
  return slots.freeSlots(iso, rules, booked, capacity, now);
}

module.exports = { getCapacity, getAvailableDays, getFreeSlots };
