const { ACTIONS } = require('./constants');
const {
  formatDisplayDate,
  formatDisplayTime,
  formatHour,
  formatWorkingDays,
} = require('../utils/format');

const firstName = (name) => String(name || '').split(' ')[0];

module.exports = {
  confirmButtons: [
    { id: ACTIONS.CONFIRM, title: '✅ Confirm' },
    { id: ACTIONS.RESTART, title: '✏️ Start over' },
    { id: ACTIONS.CANCEL, title: '❌ Cancel' },
  ],

  welcome: (company, prefix = '') =>
    `${prefix}👋 Hello! Welcome to *${company}*.\nI can help you request an appointment in a few quick steps.\n\n` +
    `_You can type *restart* to start over or *cancel* to stop at any time._\n\n` +
    `To begin, what is your *full name*?`,

  sessionExpired: () => 'Your previous booking session expired, so let\'s start fresh.\n\n',
  restarted: () => 'No problem, starting over.\n\n',

  askName: () => 'What is your *full name*?',
  invalidName: () =>
    'Sorry, I couldn\'t read that as a name. Please send your *full name* using letters only (e.g. *Priya Sharma*).',

  chooseDate: (name) =>
    `Thanks${name ? `, ${firstName(name)}` : ''}! 📅 Please choose a *date*.\n` +
    `Tap the button below to see the days that still have free slots.\n\n` +
    `You can also type a date like *25/11/2026*.`,
  dateListButton: 'Choose date',
  dateListTitle: 'Available dates',
  noAvailability: () =>
    'Sorry, we have no free appointment slots at the moment. Please try again later or contact us directly.',
  dayFull: (date) => `Sorry, *${formatDisplayDate(date)}* is fully booked. Please pick another day.\n\n`,

  dateError: (reason, rules) => {
    switch (reason) {
      case 'past':
        return 'That date has already passed. Please choose today or a future date.';
      case 'too_far':
        return `We can only take bookings up to ${rules.maxAdvanceDays} days ahead. Please choose an earlier date.`;
      case 'closed':
        return `We're closed on that day. We're open ${formatWorkingDays(rules.workingDays)}. Please pick another date.`;
      case 'today_over':
        return 'There are no slots left today. Please choose tomorrow or a later date.';
      default:
        return 'I couldn\'t understand that date. Please tap *Choose date* on the menu above, or type a date like *25/11/2026*.';
    }
  },

  chooseTime: (date) =>
    `🕐 Now choose a *time* on *${formatDisplayDate(date)}*.\n` +
    `Tap the button below to see the free slots.\n\n` +
    `You can also type a time like *10:30 AM*.`,
  timeListButton: 'Choose time',
  timeListTitle: 'Free time slots',
  slotFull: () => 'Sorry, that time is already booked. Please pick another slot.\n\n',
  slotJustTaken: () => "Sorry, that slot was just taken by someone else. Let's pick another.\n\n",
  staleMenu: () => "That menu is out of date, so let's continue from here.\n\n",

  timeError: (reason, rules) => {
    switch (reason) {
      case 'outside_hours':
        return `That's outside our hours (${formatHour(rules.openHour)} – ${formatHour(rules.closeHour)}). Please choose a time within them. Include *AM/PM* if needed.`;
      case 'bad_slot':
        return `Appointments start on ${rules.slotMinutes}-minute marks (e.g. 10:00, 10:30). Please pick one of those.`;
      case 'past_time':
        return 'That time has already passed today. Please choose a later time.';
      default:
        return 'I couldn\'t understand that time. Please tap *Choose time* on the menu above, or type a time like *10:30 AM*.';
    }
  },

  askNotes: () =>
    '📝 Any *notes or reason* for the appointment?\n\nType your note, or send *skip* to continue without one.',
  notesTooLong: () => 'That note is a bit long. Please keep it under 500 characters.',

  summary: ({ name, phone, date, time, notes }, prefix = '') =>
    `${prefix}📋 *Please review your booking request*\n\n` +
    `👤 Name: ${name}\n` +
    `📱 Phone: ${phone}\n` +
    `📅 Date: ${formatDisplayDate(date)}\n` +
    `🕐 Time: ${formatDisplayTime(time)}\n` +
    `📝 Notes: ${notes || '—'}\n\n` +
    `Is everything correct?`,

  invalidConfirmation: () => 'Please tap one of the buttons below, or reply *yes* to confirm.\n\n',

  bookingReceived: ({ reference, name, date, time, notes }) =>
    `✅ *Booking request received!*\n\n` +
    `Reference: *${reference}*\n` +
    `👤 ${name}\n` +
    `📅 ${formatDisplayDate(date)} at ${formatDisplayTime(time)}\n` +
    `📝 ${notes || '—'}\n\n` +
    `Status: *Pending*. Our team will review it and message you once it's confirmed.\n\n` +
    `To book another appointment, just send me a message.`,

  slotNoLongerAvailable: () =>
    'Sorry, that date/time is no longer available. Let\'s pick again.\n\n',
  duplicateBooking: () =>
    'You already have an active appointment request for that exact date and time, so I haven\'t created another one.\n\nSend me a message any time to book a different slot.',

  cancelled: () => 'Okay, I\'ve cancelled this booking request. Send me a message any time to start a new one. 👋',
  nothingToCancel: () => 'There\'s no booking in progress. Send *hi* to start a new one.',
  midFlowGreeting: () => 'Welcome back! We\'re in the middle of your booking, so let\'s continue. (Type *restart* to start over.)\n\n',
  unsupportedType: () => 'Sorry, I can only read text messages. Please reply with text.\n\n',
  // Sent by the dashboard when staff confirm a booking.
  appointmentConfirmed: ({ company, reference, name, date, time, doctor }) =>
    `✅ *Your appointment is confirmed!*\n\n` +
    `🏥 ${company}\n` +
    `Reference: *${reference}*\n` +
    `👤 ${name}\n` +
    `📅 ${formatDisplayDate(date)} at ${formatDisplayTime(time)}\n` +
    (doctor ? `🩺 Doctor: ${doctor}\n` : '') +
    `\nPlease arrive a few minutes early. To book another appointment, just send us a message.`,

  genericError: () => 'Sorry, something went wrong on our side. Please try again in a moment.',
};
