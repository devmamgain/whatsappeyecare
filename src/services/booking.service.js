const prisma = require('../lib/prisma');
const { DuplicateAppointmentError, SlotFullError } = require('../utils/errors');
const { toDbDate } = require('../utils/validators');
const { getCapacity } = require('./availability.service');

/** Short human-friendly reference shown to the client. */
const referenceFor = (appointment) => appointment.id.slice(0, 8).toUpperCase();

/**
 * Find-or-create the client by WhatsApp phone number (reusing existing records)
 * and create a PENDING appointment, atomically.
 * Throws DuplicateAppointmentError or SlotFullError when the booking can't be made.
 */
async function createBooking({ phone, name, date, time, notes }) {
  const appointmentDate = toDbDate(date);

  return prisma.$transaction(async (tx) => {
    // Serialise concurrent bookings of the same slot, so two clients can't both take the last place.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${date}|${time}`}))`;

    const client = await tx.client.upsert({
      where: { phone },
      update: { name },
      create: { phone, name },
    });

    const duplicate = await tx.appointment.findFirst({
      where: {
        clientId: client.id,
        appointmentDate,
        appointmentTime: time,
        status: { not: 'CANCELLED' },
      },
    });
    if (duplicate) throw new DuplicateAppointmentError();

    const taken = await tx.appointment.count({
      where: { appointmentDate, appointmentTime: time, status: { not: 'CANCELLED' } },
    });
    if (taken >= (await getCapacity(tx))) throw new SlotFullError();

    const appointment = await tx.appointment.create({
      data: {
        clientId: client.id,
        appointmentDate,
        appointmentTime: time,
        notes: notes || null,
        status: 'PENDING',
      },
    });

    return { client, appointment };
  });
}

module.exports = { createBooking, referenceFor, toDbDate };
