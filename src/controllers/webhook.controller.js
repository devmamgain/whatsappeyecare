const config = require('../config/env');
const logger = require('../config/logger');
const { handleIncomingMessage } = require('../bot/botHandler');

// Serialise processing per user so rapid-fire messages can't race on conversation state.
// (Single-instance only; with multiple instances use a DB lock or a queue.)
const queues = new Map();
function enqueue(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queues.set(key, next);
  next.catch(() => {}).finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

/** GET /webhook: Meta's one-time verification handshake. */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  logger.warn('Webhook verification failed (mode or token mismatch)');
  return res.sendStatus(403);
}

/** Flatten Meta's nested payload into a list of incoming user messages. */
function extractMessages(body) {
  if (body?.object !== 'whatsapp_business_account') return [];

  const out = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue; // delivery/read status updates etc.
      if (value.metadata?.phone_number_id !== config.whatsapp.phoneNumberId) continue;

      for (const message of value.messages) {
        const contact = value.contacts?.find((c) => c.wa_id === message.from);
        out.push({ message, profileName: contact?.profile?.name });
      }
    }
  }
  return out;
}

/** POST /webhook: acknowledge immediately (Meta retries slow responses), then process. */
function receiveWebhook(req, res) {
  res.sendStatus(200);

  let events;
  try {
    events = extractMessages(req.body);
  } catch (err) {
    logger.error({ err }, 'Could not parse webhook payload');
    return;
  }

  for (const event of events) {
    enqueue(event.message.from, () => handleIncomingMessage(event)).catch((err) =>
      logger.error({ err }, 'Unexpected error while processing webhook event'),
    );
  }
}

module.exports = { verifyWebhook, receiveWebhook, extractMessages };
