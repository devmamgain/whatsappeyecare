const prisma = require('../lib/prisma');
const config = require('../config/env');
const notifications = require('./notification.service');
const { referenceFor, toDbDate } = require('./booking.service');
const { todayInTimezone } = require('../utils/validators');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');

const STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'];
const include = { client: true, doctor: true };
const MAX_ROWS = 500;

const today = () => toDbDate(todayInTimezone(config.booking.timezone));

function serialize(a) {
  return {
    id: a.id,
    reference: referenceFor(a),
    date: a.appointmentDate.toISOString().slice(0, 10),
    time: a.appointmentTime,
    notes: a.notes,
    status: a.status,
    doctorId: a.doctorId,
    doctor: a.doctor ? { id: a.doctor.id, name: a.doctor.name, specialization: a.doctor.specialization } : null,
    client: { id: a.client.id, name: a.client.name, phone: a.client.phone },
    confirmedAt: a.confirmedAt,
    notifiedAt: a.notifiedAt,
    notificationError: a.notificationError,
    createdAt: a.createdAt,
  };
}

const load = (id) => prisma.appointment.findUnique({ where: { id }, include });

async function list({ status, when, q } = {}) {
  const where = {};
  if (STATUSES.includes(status)) where.status = status;

  if (when === 'today') where.appointmentDate = today();
  else if (when === 'upcoming') where.appointmentDate = { gte: today() };
  else if (when === 'past') where.appointmentDate = { lt: today() };

  const term = String(q || '').trim().slice(0, 100);
  if (term) {
    where.OR = [
      { client: { name: { contains: term, mode: 'insensitive' } } },
      { client: { phone: { contains: term } } },
    ];
  }

  const order = when === 'past' ? 'desc' : 'asc';
  const rows = await prisma.appointment.findMany({
    where,
    include,
    orderBy: [{ appointmentDate: order }, { appointmentTime: order }],
    take: MAX_ROWS,
  });
  return rows.map(serialize);
}

async function counts() {
  const t = today();
  const [pending, confirmed, todayTotal] = await Promise.all([
    prisma.appointment.count({ where: { status: 'PENDING' } }),
    prisma.appointment.count({ where: { status: 'CONFIRMED', appointmentDate: { gte: t } } }),
    prisma.appointment.count({ where: { appointmentDate: t, status: { not: 'CANCELLED' } } }),
  ]);
  return { pending, confirmed, today: todayTotal };
}

async function assignDoctor(id, doctorId) {
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Appointment not found');
  if (existing.status === 'CANCELLED') throw new ConflictError('Cancelled appointments cannot be changed');

  if (doctorId) {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor || !doctor.isActive) throw new ValidationError('That doctor was not found or is inactive');
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { doctorId: doctorId || null },
    include,
  });
  return serialize(updated);
}

/**
 * PENDING -> CONFIRMED, then notify the client on WhatsApp.
 * The status change is a single conditional update, so a double click can't send two messages.
 */
async function confirm(id) {
  const { count } = await prisma.appointment.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });

  const current = await load(id);
  if (!current) throw new NotFoundError('Appointment not found');

  if (count === 0) {
    if (current.status === 'CANCELLED') throw new ConflictError('Cancelled appointments cannot be confirmed');
    return { appointment: serialize(current), notification: null }; // already confirmed
  }

  const notification = await notifications.notifyConfirmation(current);
  return { appointment: serialize(await load(id)), notification };
}

/** Send the confirmation message again (e.g. after it failed, or the doctor changed). */
async function resendConfirmation(id) {
  const current = await load(id);
  if (!current) throw new NotFoundError('Appointment not found');
  if (current.status !== 'CONFIRMED') throw new ConflictError('Only confirmed appointments can be re-sent');

  const notification = await notifications.notifyConfirmation(current);
  return { appointment: serialize(await load(id)), notification };
}

async function cancel(id) {
  const { count } = await prisma.appointment.updateMany({
    where: { id, status: { in: ['PENDING', 'CONFIRMED'] } },
    data: { status: 'CANCELLED' },
  });
  const current = await load(id);
  if (!current) throw new NotFoundError('Appointment not found');
  return { appointment: serialize(current), changed: count > 0 };
}

module.exports = { list, counts, assignDoctor, confirm, resendConfirmation, cancel, serialize };
