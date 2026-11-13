const { ConversationState: S } = require('@prisma/client');
const config = require('../config/env');
const logger = require('../config/logger');
const whatsapp = require('../services/whatsapp.service');
const conversations = require('../services/conversation.service');
const bookings = require('../services/booking.service');
const availability = require('../services/availability.service');
const { DuplicateAppointmentError, SlotFullError } = require('../utils/errors');
const { toPhone, maskPhone } = require('../utils/phone');
const { validateName, validateDate, validateTime } = require('../utils/validators');
const { paginate } = require('../utils/slots');
const { formatShortDate, formatDisplayTime } = require('../utils/format');
const intents = require('./intents');
const msg = require('./messages');
const { ACTIONS, LIST } = require('./constants');

const rules = config.booking;
const MAX_NOTES_LENGTH = 500;

// Which conversation step each list-menu row belongs to (used to ignore taps on old menus).
const LIST_OWNER = {
  [LIST.DATE]: S.AWAITING_DATE,
  [LIST.DATES_MORE]: S.AWAITING_DATE,
  [LIST.TIME]: S.AWAITING_TIME,
  [LIST.TIMES_MORE]: S.AWAITING_TIME,
};

// ---------------------------------------------------------------- entry point

async function handleIncomingMessage({ message }) {
  const waId = message.from;
  const phone = toPhone(waId);
  const log = logger.child({ phone: maskPhone(phone), messageId: message.id });
  const ctx = { waId, phone, log };

  try {
    const convo = await conversations.get(phone);
    if (convo?.lastMessageId === message.id) {
      log.info('Duplicate webhook delivery ignored');
      return;
    }

    const session = resolveSession(convo);
    await conversations.touch(phone, message.id);
    whatsapp.markAsRead(message.id).catch((err) => log.debug({ err }, 'Could not mark message as read'));

    await route(ctx, session, parseIncoming(message));
  } catch (err) {
    log.error({ err }, 'Failed to handle incoming message');
    await sendText(ctx, msg.genericError()).catch(() => {});
  }
}

function parseIncoming(message) {
  switch (message.type) {
    case 'text':
      return { kind: 'text', text: (message.text?.body || '').trim() };
    case 'interactive': {
      const reply = message.interactive?.button_reply || message.interactive?.list_reply;
      return { kind: 'text', text: reply?.title || '', actionId: reply?.id };
    }
    default:
      return { kind: 'unsupported' };
  }
}

function resolveSession(convo) {
  if (!convo) return { state: S.IDLE, data: {} };
  if (convo.state !== S.IDLE && conversations.isExpired(convo, config.session.timeoutMinutes)) {
    return { state: S.IDLE, data: {}, expired: true };
  }
  return { state: convo.state, data: convo.data || {} };
}

// -------------------------------------------------------------------- routing

async function route(ctx, session, input) {
  if (input.kind === 'unsupported') {
    if (session.state === S.IDLE) return sendText(ctx, msg.unsupportedType() + 'Send *hi* to start a booking.');
    return repromptStep(ctx, session, msg.unsupportedType());
  }

  const { text, actionId } = input;
  const idle = session.state === S.IDLE;

  if (intents.isRestart(text) || actionId === ACTIONS.RESTART) {
    return startBooking(ctx, idle ? '' : msg.restarted());
  }
  if (intents.isCancel(text) || actionId === ACTIONS.CANCEL) {
    return idle ? sendText(ctx, msg.nothingToCancel()) : cancelSession(ctx);
  }
  if (idle) {
    return startBooking(ctx, session.expired ? msg.sessionExpired() : '');
  }
  if (intents.isGreeting(text)) {
    return repromptStep(ctx, session, msg.midFlowGreeting());
  }

  // A tap on a date/time row from an earlier menu must not be mistaken for an answer to this step.
  const listKind = actionId ? actionId.split(':')[0] : null;
  if (listKind && Object.hasOwn(LIST_OWNER, listKind) && LIST_OWNER[listKind] !== session.state) {
    return repromptStep(ctx, session, msg.staleMenu());
  }

  switch (session.state) {
    case S.AWAITING_NAME:
      return handleName(ctx, session, text);
    case S.AWAITING_DATE:
      return handleDate(ctx, session, input);
    case S.AWAITING_TIME:
      return handleTime(ctx, session, input);
    case S.AWAITING_NOTES:
      return handleNotes(ctx, session, text);
    case S.AWAITING_CONFIRMATION:
      return handleConfirmation(ctx, session, input);
    default:
      return startBooking(ctx, '');
  }
}

// ------------------------------------------------------------------- handlers

async function startBooking(ctx, prefix) {
  await conversations.save(ctx.phone, { state: S.AWAITING_NAME, data: {} });
  ctx.log.info('Booking flow started');
  return sendText(ctx, msg.welcome(config.company.name, prefix));
}

async function cancelSession(ctx) {
  await conversations.reset(ctx.phone);
  ctx.log.info('Booking flow cancelled by user');
  return sendText(ctx, msg.cancelled());
}

async function handleName(ctx, session, text) {
  const result = validateName(text);
  if (!result.valid) return sendText(ctx, msg.invalidName());

  const data = { ...session.data, name: result.value };
  await conversations.save(ctx.phone, { state: S.AWAITING_DATE, data });
  return promptDate(ctx, data);
}

async function handleDate(ctx, session, { text, actionId }) {
  if (actionId?.startsWith(`${LIST.DATES_MORE}:`)) {
    return promptDate(ctx, session.data, { offset: offsetFrom(actionId) });
  }

  const raw = actionId?.startsWith(`${LIST.DATE}:`) ? valueFrom(actionId) : text;
  const result = validateDate(raw, rules);
  if (!result.valid) return sendText(ctx, msg.dateError(result.reason, rules));

  const slots = await availability.getFreeSlots(result.value);
  if (slots.length === 0) {
    return promptDate(ctx, session.data, { prefix: msg.dayFull(result.value) });
  }

  const data = { ...session.data, date: result.value };
  await conversations.save(ctx.phone, { state: S.AWAITING_TIME, data });
  return promptTime(ctx, data);
}

async function handleTime(ctx, session, { text, actionId }) {
  const { date } = session.data;

  if (actionId?.startsWith(`${LIST.TIMES_MORE}:`)) {
    return promptTime(ctx, session.data, { offset: offsetFrom(actionId) });
  }

  const raw = actionId?.startsWith(`${LIST.TIME}:`) ? valueFrom(actionId) : text;
  const result = validateTime(raw, rules, { date });
  if (!result.valid) return sendText(ctx, msg.timeError(result.reason, rules));

  const slots = await availability.getFreeSlots(date);
  if (!slots.some((slot) => slot.time === result.value)) {
    return promptTime(ctx, session.data, { prefix: msg.slotFull() });
  }

  const data = { ...session.data, time: result.value };
  await conversations.save(ctx.phone, { state: S.AWAITING_NOTES, data });
  return sendText(ctx, msg.askNotes());
}

async function handleNotes(ctx, session, text) {
  let notes = null;
  if (!intents.isSkip(text)) {
    if (text.length > MAX_NOTES_LENGTH) return sendText(ctx, msg.notesTooLong());
    notes = text;
  }

  const data = { ...session.data, notes };
  await conversations.save(ctx.phone, { state: S.AWAITING_CONFIRMATION, data });
  return sendSummary(ctx, data);
}

async function handleConfirmation(ctx, session, { text, actionId }) {
  if (actionId === ACTIONS.CONFIRM || intents.isYes(text)) {
    return confirmBooking(ctx, session);
  }
  if (intents.isNo(text)) {
    return cancelSession(ctx);
  }
  return sendSummary(ctx, session.data, msg.invalidConfirmation());
}

async function confirmBooking(ctx, session) {
  const { name, date, time, notes } = session.data;

  if (!name || !date || !time) {
    ctx.log.warn('Incomplete session data at confirmation; restarting');
    return startBooking(ctx, msg.restarted());
  }

  // The slot may have passed while the user was idle on the confirmation step.
  const dateCheck = validateDate(date, rules);
  const timeCheck = dateCheck.valid ? validateTime(time, rules, { date }) : null;
  if (!dateCheck.valid || !timeCheck.valid) {
    return backToDatePicker(ctx, name, msg.slotNoLongerAvailable());
  }

  try {
    const { appointment } = await bookings.createBooking({ phone: ctx.phone, name, date, time, notes });
    await conversations.reset(ctx.phone);
    ctx.log.info({ appointmentId: appointment.id }, 'Appointment request created');
    return sendText(
      ctx,
      msg.bookingReceived({ reference: bookings.referenceFor(appointment), name, date, time, notes }),
    );
  } catch (err) {
    if (err instanceof DuplicateAppointmentError) {
      await conversations.reset(ctx.phone);
      return sendText(ctx, msg.duplicateBooking());
    }
    if (err instanceof SlotFullError) {
      ctx.log.info('Slot was taken before the client confirmed');
      return backToDatePicker(ctx, name, msg.slotJustTaken());
    }
    throw err; // generic error reply; state is kept so the user can tap Confirm again
  }
}

// ------------------------------------------------------- date / time menus

async function backToDatePicker(ctx, name, prefix) {
  const data = { name };
  await conversations.save(ctx.phone, { state: S.AWAITING_DATE, data });
  return promptDate(ctx, data, { prefix });
}

/** Tap-to-choose list of days that still have free slots (full and closed days are left out). */
async function promptDate(ctx, data, { prefix = '', offset = 0 } = {}) {
  const days = await availability.getAvailableDays();
  if (days.length === 0) {
    await conversations.reset(ctx.phone);
    return sendText(ctx, prefix + msg.noAvailability());
  }

  const { page, nextOffset } = paginate(days, offset);
  if (page.length === 0) return promptDate(ctx, data, { prefix }); // stale "More" tap: start over

  const rows = page.map((day) => ({
    id: `${LIST.DATE}:${day.date}`,
    title: formatShortDate(day.date),
    description: `${day.free} ${day.free === 1 ? 'time slot' : 'time slots'} free`,
  }));
  if (nextOffset !== null) {
    rows.push({ id: `${LIST.DATES_MORE}:${nextOffset}`, title: 'More dates', description: 'Show later days' });
  }

  return whatsapp.sendList(ctx.waId, {
    body: prefix + msg.chooseDate(data.name),
    buttonText: msg.dateListButton,
    sectionTitle: msg.dateListTitle,
    rows,
  });
}

/** Tap-to-choose list of the free time slots on the chosen day (booked slots are left out). */
async function promptTime(ctx, data, { prefix = '', offset = 0 } = {}) {
  const slots = await availability.getFreeSlots(data.date);
  if (slots.length === 0) {
    return backToDatePicker(ctx, data.name, prefix + msg.dayFull(data.date));
  }

  const { page, nextOffset } = paginate(slots, offset);
  if (page.length === 0) return promptTime(ctx, data, { prefix }); // stale "More" tap: first page

  const rows = page.map((slot) => ({ id: `${LIST.TIME}:${slot.time}`, title: formatDisplayTime(slot.time) }));
  if (nextOffset !== null) {
    rows.push({ id: `${LIST.TIMES_MORE}:${nextOffset}`, title: 'More times', description: 'Show later slots' });
  }

  return whatsapp.sendList(ctx.waId, {
    body: prefix + msg.chooseTime(data.date),
    buttonText: msg.timeListButton,
    sectionTitle: msg.timeListTitle,
    rows,
  });
}

// -------------------------------------------------------------------- helpers

/** Re-ask the question for the current step (after a greeting, unsupported message, etc). */
async function repromptStep(ctx, session, prefix = '') {
  const { state, data } = session;
  switch (state) {
    case S.AWAITING_NAME:
      return sendText(ctx, prefix + msg.askName());
    case S.AWAITING_DATE:
      return promptDate(ctx, data, { prefix });
    case S.AWAITING_TIME:
      return promptTime(ctx, data, { prefix });
    case S.AWAITING_NOTES:
      return sendText(ctx, prefix + msg.askNotes());
    case S.AWAITING_CONFIRMATION:
      return sendSummary(ctx, data, prefix);
    default:
      return startBooking(ctx, '');
  }
}

/** "DATE:2026-11-16" / "TIME:10:30" -> everything after the first colon. */
const valueFrom = (actionId) => actionId.slice(actionId.indexOf(':') + 1);
const offsetFrom = (actionId) => Math.max(0, parseInt(valueFrom(actionId), 10) || 0);

function sendSummary(ctx, data, prefix = '') {
  return whatsapp.sendButtons(ctx.waId, msg.summary({ ...data, phone: ctx.phone }, prefix), msg.confirmButtons);
}

function sendText(ctx, body) {
  return whatsapp.sendText(ctx.waId, body);
}

module.exports = { handleIncomingMessage };
