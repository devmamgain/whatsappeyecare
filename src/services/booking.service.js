const prisma = require('../lib/prisma');
const { DuplicateAppointmentError } = require('../utils/errors');

/** "YYYY-MM-DD" -> Date at UTC midnight (stored in a Postgres DATE column). */
const toDbDate = (iso) => new Date(`${iso}T00:00:00.000Z`);

/** Short human-friendly reference shown to the client. */
const referenceFor = (appointment) => appointment.id.slice(0, 8).toUpperCase();

/**
 * Find-or-create the client by WhatsApp phone number (reusing existing records)
 * and create a PENDING appointment, atomically.
 */
async function createBooking({ phone, name, date, time, notes }) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.upsert({
      where: { phone },
      update: { name },
      create: { phone, name },
    });

    const duplicate = await tx.appointment.findFirst({
      where: {
        clientId: client.id,
        appointmentDate: toDbDate(date),
        appointmentTime: time,
        status: { not: 'CANCELLED' },
      },
    });
    if (duplicate) throw new DuplicateAppointmentError();

    const appointment = await tx.appointment.create({
      data: {
        clientId: client.id,
        appointmentDate: toDbDate(date),
        appointmentTime: time,
        notes: notes || null,
        status: 'PENDING',
      },
    });

    return { client, appointment };
  });
}

module.exports = { createBooking, referenceFor, toDbDate };
