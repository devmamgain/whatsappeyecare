const test = require('node:test');
const assert = require('node:assert/strict');

// The webhook controller loads config at import time, so give it dummy credentials.
process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
process.env.WHATSAPP_TOKEN = 'test-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '12345';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
process.env.LOG_LEVEL = 'silent';

const { verifyWebhook, extractMessages } = require('../src/controllers/webhook.controller');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
  };
}

test('verifyWebhook echoes the challenge when the token matches', () => {
  const res = fakeRes();
  verifyWebhook(
    { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': 'abc123' } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'abc123');
});

test('verifyWebhook rejects a wrong token', () => {
  const res = fakeRes();
  verifyWebhook(
    { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'abc123' } },
    res,
  );
  assert.equal(res.statusCode, 403);
});

test('extractMessages returns user messages and ignores status updates', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '12345' },
              contacts: [{ wa_id: '919876543210', profile: { name: 'Dev' } }],
              messages: [{ from: '919876543210', id: 'wamid.1', type: 'text', text: { body: 'Hi' } }],
            },
          },
          { value: { metadata: { phone_number_id: '12345' }, statuses: [{ id: 'wamid.0', status: 'read' }] } },
          {
            value: {
              metadata: { phone_number_id: 'other-number' },
              messages: [{ from: '1', id: 'wamid.2', type: 'text', text: { body: 'Hi' } }],
            },
          },
        ],
      },
    ],
  };

  const events = extractMessages(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].message.id, 'wamid.1');
  assert.equal(events[0].profileName, 'Dev');
  assert.deepEqual(extractMessages({ object: 'page' }), []);
});
