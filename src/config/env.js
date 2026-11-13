require('dotenv').config();

const REQUIRED = [
  'DATABASE_URL',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

if (isProduction && !process.env.WHATSAPP_APP_SECRET) {
  throw new Error('WHATSAPP_APP_SECRET is required in production (webhook signature verification)');
}

const int = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

// The admin dashboard is only enabled when all three values are present.
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const adminSecret = process.env.ADMIN_SESSION_SECRET;

if (adminUsername && adminPassword) {
  if (adminPassword.length < 10) {
    throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  }
  if (!adminSecret || adminSecret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must be a random string of at least 32 characters');
  }
}

module.exports = {
  nodeEnv,
  isProduction,
  port: int(process.env.PORT, 3000),
  company: {
    name: process.env.COMPANY_NAME || 'Our Clinic',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET || null,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v26.0',
    // Approved template used to tell clients their booking is confirmed when the
    // 24-hour free-form messaging window has closed (optional).
    confirmTemplate: process.env.WHATSAPP_CONFIRM_TEMPLATE || null,
    confirmTemplateLanguage: process.env.WHATSAPP_CONFIRM_TEMPLATE_LANG || 'en',
  },
  admin: {
    enabled: Boolean(adminUsername && adminPassword && adminSecret),
    username: adminUsername,
    password: adminPassword,
    sessionSecret: adminSecret,
  },
  booking: {
    timezone: process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata',
    openHour: int(process.env.BUSINESS_OPEN_HOUR, 9),
    closeHour: int(process.env.BUSINESS_CLOSE_HOUR, 18),
    slotMinutes: int(process.env.SLOT_MINUTES, 30),
    workingDays: (process.env.WORKING_DAYS || '1,2,3,4,5,6')
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => d >= 0 && d <= 6),
    maxAdvanceDays: int(process.env.MAX_ADVANCE_DAYS, 60),
    // Bookings allowed per time slot. 0 (default) = one per active doctor, minimum 1.
    slotCapacity: int(process.env.SLOT_CAPACITY, 0),
  },
  session: {
    timeoutMinutes: int(process.env.SESSION_TIMEOUT_MINUTES, 30),
  },
};
