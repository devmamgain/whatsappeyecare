const test = require('node:test');
const assert = require('node:assert/strict');
const { allSlotTimes, countBooked, freeSlots, availableDays, paginate } = require('../src/utils/slots');

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

test('allSlotTimes covers opening hours in slot steps', () => {
  const slots = allSlotTimes(rules).map((s) => s.time);
  assert.equal(slots.length, 18);
  assert.equal(slots[0], '09:00');
  assert.equal(slots[slots.length - 1], '17:30');
});

test('freeSlots hides booked slots when capacity is reached', () => {
  const booked = countBooked([{ date: '2026-11-16', time: '10:30' }]);
  const times = freeSlots('2026-11-16', rules, booked, 1, NOW).map((s) => s.time);
  assert.equal(times.includes('10:30'), false);
  assert.equal(times.includes('10:00'), true);
  assert.equal(times.length, 17);
});

test('freeSlots keeps a slot while it has places left, and reports them', () => {
  const booked = countBooked([{ date: '2026-11-16', time: '10:30' }]);
  const slot = freeSlots('2026-11-16', rules, booked, 2, NOW).find((s) => s.time === '10:30');
  assert.equal(slot.left, 1);

  const full = countBooked([
    { date: '2026-11-16', time: '10:30' },
    { date: '2026-11-16', time: '10:30' },
  ]);
  assert.equal(freeSlots('2026-11-16', rules, full, 2, NOW).some((s) => s.time === '10:30'), false);
});

test('freeSlots returns only future slots today, nothing for past or closed days', () => {
  const today = freeSlots('2026-11-13', rules, new Map(), 1, NOW).map((s) => s.time);
  assert.equal(today[0], '13:00');
  assert.deepEqual(freeSlots('2026-11-12', rules, new Map(), 1, NOW), []);
  assert.deepEqual(freeSlots('2026-11-15', rules, new Map(), 1, NOW), []); // Sunday
});

test('availableDays skips closed days and fully booked days', () => {
  const everySlot = allSlotTimes(rules).map((s) => ({ date: '2026-11-16', time: s.time }));
  const days = availableDays(rules, countBooked(everySlot), 1, NOW).map((d) => d.date);

  assert.equal(days[0], '2026-11-13', 'today still has afternoon slots');
  assert.equal(days.includes('2026-11-14'), true, 'Saturday is a working day');
  assert.equal(days.includes('2026-11-15'), false, 'Sunday is closed');
  assert.equal(days.includes('2026-11-16'), false, 'fully booked day is hidden');
  assert.equal(days.includes('2026-11-17'), true);
  assert.equal(days[days.length - 1] <= '2027-01-12', true, 'stays inside the booking window');
});

test('availableDays drops today once the last slot has passed', () => {
  const lateEvening = new Date('2026-11-13T12:00:00Z'); // 17:30 IST: no future slot left
  const days = availableDays(rules, new Map(), 1, lateEvening).map((d) => d.date);
  assert.equal(days.includes('2026-11-13'), false);
  assert.equal(days[0], '2026-11-14');
});

test('paginate fits WhatsApp lists of 10 rows, using the last row for "More"', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  let result = paginate(items, 0);
  assert.equal(result.page.length, 9);
  assert.equal(result.nextOffset, 9);

  result = paginate(items, 9);
  assert.equal(result.page.length, 9);
  assert.equal(result.nextOffset, 18);

  result = paginate(items, 18); // 7 left: all fit
  assert.equal(result.page.length, 7);
  assert.equal(result.nextOffset, null);

  assert.equal(paginate(items.slice(0, 10), 0).page.length, 10, 'exactly 10 fit without a More row');
  assert.equal(paginate(items.slice(0, 11), 0).nextOffset, 9);
  assert.deepEqual(paginate(items, 99).page, []);
});
