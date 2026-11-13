class DuplicateAppointmentError extends Error {
  constructor() {
    super('Client already has an active appointment for this date and time');
    this.name = 'DuplicateAppointmentError';
  }
}

class WhatsAppApiError extends Error {
  constructor(message, { status, code, details, cause } = {}) {
    super(message, { cause });
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { DuplicateAppointmentError, WhatsAppApiError };
