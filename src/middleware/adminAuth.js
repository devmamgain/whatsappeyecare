const crypto = require('crypto');
const config = require('../config/env');

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// ---------- credentials ----------

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest();
// Hash first so both buffers have equal length, then compare in constant time.
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));

function checkCredentials(username, password) {
  const userOk = safeEqual(username, config.admin.username);
  const passOk = safeEqual(password, config.admin.password);
  return userOk && passOk;
}

// ---------- stateless signed session token: "<expiry-ms>.<hmac>" ----------

const sign = (value) =>
  crypto.createHmac('sha256', config.admin.sessionSecret).update(value).digest('base64url');

function createToken(now = Date.now()) {
  const expires = String(now + SESSION_TTL_MS);
  return `${expires}.${sign(expires)}`;
}

function isValidToken(token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expires, signature] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < now) return false;

  const expected = Buffer.from(sign(expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

const isAuthenticated = (req) => isValidToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);

function cookieFlags(maxAgeSeconds) {
  const flags = ['HttpOnly', 'SameSite=Strict', 'Path=/admin', `Max-Age=${maxAgeSeconds}`];
  if (config.isProduction) flags.push('Secure');
  return flags.join('; ');
}

function setSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=${createToken()}; ${cookieFlags(SESSION_TTL_MS / 1000)}`);
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; ${cookieFlags(0)}`);
}

// ---------- login throttling (per IP, in memory) ----------

const failures = new Map();

function isLockedOut(ip, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry?.until) return false;
  if (entry.until > now) return true;
  failures.delete(ip);
  return false;
}

function recordFailure(ip, now = Date.now()) {
  if (failures.size > 1000) {
    for (const [key, value] of failures) if (value.until && value.until <= now) failures.delete(key);
  }
  const entry = failures.get(ip) || { count: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.until = now + LOCKOUT_MS;
  failures.set(ip, entry);
}

const clearFailures = (ip) => failures.delete(ip);

// ---------- middleware ----------

function requireApiAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Not signed in' });
}

function requirePageAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.redirect('/admin/login');
}

/** Defence in depth on top of SameSite=Strict: block cross-origin writes, require JSON bodies. */
function sameOriginOnly(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      return res.status(403).json({ error: 'Blocked request' });
    }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  if (!req.is('application/json')) return res.status(415).json({ error: 'Expected application/json' });
  return next();
}

module.exports = {
  COOKIE_NAME,
  checkCredentials,
  createToken,
  isValidToken,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie,
  isLockedOut,
  recordFailure,
  clearFailures,
  requireApiAuth,
  requirePageAuth,
  sameOriginOnly,
};
