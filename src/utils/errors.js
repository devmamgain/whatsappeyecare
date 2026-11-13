class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

class DuplicateAppointmentError extends Error {
  constructor() {
    super('Client already has an active appointment for this date and time');
    this.name = 'DuplicateAppointmentError';
  }
}

class SlotFullError extends Error {
  constructor() {
    super('That time slot is fully booked');
    this.name = 'SlotFullError';
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

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  DuplicateAppointmentError,
  SlotFullError,
  WhatsAppApiError,
};
