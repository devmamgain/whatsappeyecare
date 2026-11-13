/** WhatsApp "wa_id" (digits only) -> E.164 string with leading "+". */
function toPhone(waId) {
  return `+${String(waId).replace(/\D/g, '')}`;
}

/** Mask a phone number for logs: +91******3210 */
function maskPhone(phone) {
  const s = String(phone);
  if (s.length <= 6) return '***';
  return `${s.slice(0, 3)}${'*'.repeat(s.length - 6)}${s.slice(-3)}`;
}

module.exports = { toPhone, maskPhone };
