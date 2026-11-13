const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateName,
  validateDate,
  validateTime,
  parseTimeInput,
} = require('../src/utils/validators');

const rules = {
  timezone: 'Asia/Kolkata',
  openHour: 9,
  closeHour: 18,
  slotMinutes: 30,
  workingDays: [1, 2, 3, 4, 5, 6],
  maxAdvanceDays: 60,
};

// Fri 13 Nov 2026, 12:30 in Asia/Kolkata
const NOW = new Date('2026-11-13T07:00:00Z');

test('validateName accepts normal names and rejects junk', () => {
  assert.deepEqual(validateName('  Dev   Mamgain '), { valid: true, value: 'Dev Mamgain' });
  assert.equal(validateName("Anne-Marie O'Neil").valid, true);
  assert.equal(validateName('12345').valid, false);
  assert.equal(validateName('A').valid, false);
  assert.equal(validateName('').valid, false);
});

test('validateDate parses supported formats', () => {
  assert.deepEqual(validateDate('today', rules, NOW), { valid: true, value: '2026-11-13' });
  assert.deepEqual(validateDate('tomorrow', rules, NOW), { valid: true, value: '2026-11-14' });
  assert.deepEqual(validateDate('16/11/2026', rules, NOW), { valid: true, value: '2026-11-16' });
  assert.deepEqual(validateDate('2026-11-17', rules, NOW), { valid: true, value: '2026-11-17' });
  assert.deepEqual(validateDate('18-11-2026', rules, NOW), { valid: true, value: '2026-11-18' });
  assert.deepEqual(validateDate('19/11', rules, NOW), { valid: true, value: '2026-11-19' });
});

test('validateDate rejects bad, past, closed and far-future dates', () => {
  assert.equal(validateDate('banana', rules, NOW).reason, 'format');
  assert.equal(validateDate('31/02/2026', rules, NOW).reason, 'format');
  assert.equal(validateDate('12/11/2026', rules, NOW).reason, 'past');
  assert.equal(validateDate('15/11/2026', rules, NOW).reason, 'closed'); // Sunday
  assert.equal(validateDate('01/06/2027', rules, NOW).reason, 'too_far');
});

test('validateDate: a no-year date that already passed rolls to next year', () => {
  assert.equal(validateDate('01/01', rules, NOW).value, '2027-01-01');
});

test('validateDate rejects today once the last slot has passed', () => {
  const lateEvening = new Date('2026-11-13T12:00:00Z'); // 17:30 IST
  assert.equal(validateDate('today', rules, lateEvening).reason, 'today_over');
});

test('parseTimeInput handles 12h and 24h formats', () => {
  assert.equal(parseTimeInput('10:30'), 630);
  assert.equal(parseTimeInput('3pm'), 900);
  assert.equal(parseTimeInput('3 PM'), 900);
  assert.equal(parseTimeInput('3:15 p.m.'), 915);
  assert.equal(parseTimeInput('12am'), 0);
  assert.equal(parseTimeInput('12pm'), 720);
  assert.equal(parseTimeInput('14.00'), 840);
  assert.equal(parseTimeInput('25:00'), null);
  assert.equal(parseTimeInput('13pm'), null);
  assert.equal(parseTimeInput('10:75'), null);
  assert.equal(parseTimeInput('soon'), null);
});

test('validateTime enforces business hours and slot size', () => {
  assert.deepEqual(validateTime('10:30 AM', rules, { date: '2026-11-16', now: NOW }), {
    valid: true,
    value: '10:30',
  });
  assert.equal(validateTime('5:30pm', rules, { date: '2026-11-16', now: NOW }).value, '17:30');
  assert.equal(validateTime('8:00', rules, { date: '2026-11-16', now: NOW }).reason, 'outside_hours');
  assert.equal(validateTime('6pm', rules, { date: '2026-11-16', now: NOW }).reason, 'outside_hours');
  assert.equal(validateTime('10:15', rules, { date: '2026-11-16', now: NOW }).reason, 'bad_slot');
  assert.equal(validateTime('whenever', rules, { date: '2026-11-16', now: NOW }).reason, 'format');
});

test('validateTime rejects times already passed today', () => {
  assert.equal(validateTime('10:00', rules, { date: '2026-11-13', now: NOW }).reason, 'past_time');
  assert.equal(validateTime('2pm', rules, { date: '2026-11-13', now: NOW }).value, '14:00');
});
