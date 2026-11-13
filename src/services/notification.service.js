const config = require('../config/env');
const logger = require('../config/logger');
const prisma = require('../lib/prisma');
const whatsapp = require('./whatsapp.service');
const conversations = require('./conversation.service');
const { referenceFor } = require('./booking.service');
const msg = require('../bot/messages');
const { formatDisplayDate, formatDisplayTime } = require('../utils/format');
const { WhatsAppApiError } = require('../utils/errors');

// WhatsApp only allows free-form messages within 24h of the client's last message.
// We stop a little short of that so clock skew can't push us over the edge.
const SERVICE_WINDOW_MS = 23 * 60 * 60 * 1000;
const ERR_REENGAGEMENT = 131047; // free-form message outside the 24h window
const ERR_NOT_ALLOWED = 131030; // recipient not on the test number's allowed list
const ERR_TEMPLATE_MISSING = 132001;

/** The client's last inbound message time is tracked on their conversation row. */
async function withinServiceWindow(phone) {
  const convo = await conversations.get(phone);
  return Boolean(convo) && Date.now() - new Date(convo.updatedAt).getTime() < SERVICE_WINDOW_MS;
}

function sendViaTemplate(waId, d) {
  return whatsapp.sendTemplate(waId, config.whatsapp.confirmTemplate, config.whatsapp.confirmTemplateLanguage, [
    d.name,
    formatDisplayDate(d.date),
    formatDisplayTime(d.time),
    d.doctor || 'our team',
    d.reference,
  ]);
}

/** Free-form text inside the 24h window (free); otherwise the approved template. */
async function deliver(waId, phone, details) {
  const hasTemplate = Boolean(config.whatsapp.confirmTemplate);

  if (await withinServiceWindow(phone)) {
    try {
      await whatsapp.sendText(waId, msg.appointmentConfirmed(details));
      return 'text';
    } catch (err) {
      const windowClosed = err instanceof WhatsAppApiError && err.code === ERR_REENGAGEMENT;
      if (!(windowClosed && hasTemplate)) throw err;
    }
  }

  if (!hasTemplate) {
    throw new Error(
      "The client's 24-hour WhatsApp chat window has closed and no message template is configured (WHATSAPP_CONFIRM_TEMPLATE).",
    );
  }
  await sendViaTemplate(waId, details);
  return 'template';
}

function explain(err) {
  if (err instanceof WhatsAppApiError) {
    if (err.code === ERR_REENGAGEMENT) return 'The 24-hour chat window has closed; a message template is required.';
    if (err.code === ERR_NOT_ALLOWED) return "The client's number is not on the allowed recipient list (test number).";
    if (err.code === ERR_TEMPLATE_MISSING) return 'The configured message template was not found or is not approved.';
    return `WhatsApp error ${err.code ?? err.status ?? ''}: ${err.message}`.trim();
  }
  return err.message || 'Unknown error';
}

/**
 * Tell the client their appointment is confirmed. Never throws: the outcome is stored on the
 * appointment (notifiedAt / notificationError) and returned so the dashboard can show it.
 * @param appointment Prisma appointment including `client` and `doctor`
 */
async function notifyConfirmation(appointment) {
  const phone = appointment.client.phone;
  const waId = phone.replace(/\D/g, '');
  const log = logger.child({ appointmentId: appointment.id });

  const details = {
    company: config.company.name,
    reference: referenceFor(appointment),
    name: appointment.client.name,
    date: appointment.appointmentDate.toISOString().slice(0, 10),
    time: appointment.appointmentTime,
    doctor: appointment.doctor?.name || null,
  };

  try {
    const via = await deliver(waId, phone, details);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { notifiedAt: new Date(), notificationError: null },
    });
    log.info({ via }, 'Confirmation sent to client');
    return { sent: true, via };
  } catch (err) {
    const reason = explain(err).slice(0, 300);
    log.error({ err }, 'Could not send confirmation to client');
    await prisma.appointment
      .update({ where: { id: appointment.id }, data: { notificationError: reason } })
      .catch((dbErr) => log.error({ err: dbErr }, 'Could not record notification failure'));
    return { sent: false, error: reason };
  }
}

module.exports = { notifyConfirmation, withinServiceWindow };
