const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
process.env.WHATSAPP_TOKEN = 'test-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '12345';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.ADMIN_SESSION_SECRET = 'y'.repeat(40);
process.env.LOG_LEVEL = 'silent';

const auth = require('../src/middleware/adminAuth');

test('checkCredentials accepts only the configured username and password', () => {
  assert.equal(auth.checkCredentials('admin', 'correct-horse-battery'), true);
  assert.equal(auth.checkCredentials('admin', 'wrong'), false);
  assert.equal(auth.checkCredentials('root', 'correct-horse-battery'), false);
  assert.equal(auth.checkCredentials('', ''), false);
});

test('session tokens verify, expire and reject tampering', () => {
  const now = Date.now();
  const token = auth.createToken(now);
  assert.equal(auth.isValidToken(token, now + 1000), true);
  assert.equal(auth.isValidToken(token, now + 13 * 60 * 60 * 1000), false, 'expired after 12h');

  const [expires, signature] = token.split('.');
  assert.equal(auth.isValidToken(`${Number(expires) + 99999999}.${signature}`, now), false, 'expiry edited');
  assert.equal(auth.isValidToken(`${expires}.${signature.slice(0, -1)}A`, now), false, 'signature edited');
  assert.equal(auth.isValidToken('garbage', now), false);
  assert.equal(auth.isValidToken(undefined, now), false);
});

test('login lockout after repeated failures, cleared on success', () => {
  const ip = '203.0.113.9';
  const now = Date.now();
  for (let i = 0; i < 4; i++) auth.recordFailure(ip, now);
  assert.equal(auth.isLockedOut(ip, now), false);
  auth.recordFailure(ip, now);
  assert.equal(auth.isLockedOut(ip, now), true);
  assert.equal(auth.isLockedOut(ip, now + 16 * 60 * 1000), false, 'lockout expires');

  auth.recordFailure('198.51.100.1', now);
  auth.clearFailures('198.51.100.1');
  assert.equal(auth.isLockedOut('198.51.100.1', now), false);
});
