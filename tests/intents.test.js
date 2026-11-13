const test = require('node:test');
const assert = require('node:assert/strict');
const intents = require('../src/bot/intents');

test('greetings ignore case and punctuation', () => {
  assert.equal(intents.isGreeting('Hi!'), true);
  assert.equal(intents.isGreeting('  HELLO '), true);
  assert.equal(intents.isGreeting('Good morning.'), true);
  assert.equal(intents.isGreeting('Hiten Shah'), false);
});

test('restart / cancel keywords', () => {
  assert.equal(intents.isRestart('Restart'), true);
  assert.equal(intents.isRestart('start over'), true);
  assert.equal(intents.isCancel('CANCEL'), true);
  assert.equal(intents.isCancel('cancel my cold'), false);
});

test('skip, yes and no keywords', () => {
  assert.equal(intents.isSkip('Skip'), true);
  assert.equal(intents.isSkip('-'), true);
  assert.equal(intents.isSkip('N/A'), true);
  assert.equal(intents.isSkip('Back pain since Monday'), false);
  assert.equal(intents.isYes('Yes!'), true);
  assert.equal(intents.isYes('maybe'), false);
  assert.equal(intents.isNo('No'), true);
});
