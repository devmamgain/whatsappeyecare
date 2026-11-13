const config = require('../config/env');
const logger = require('../config/logger');
const { WhatsAppApiError } = require('../utils/errors');

const ENDPOINT = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
const TIMEOUT_MS = 10_000;

async function post(payload) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new WhatsAppApiError('Network error calling WhatsApp Cloud API', { cause: err });
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = body?.error;
    logger.error({ status: response.status, apiError }, 'WhatsApp Cloud API request failed');
    throw new WhatsAppApiError(apiError?.message || `HTTP ${response.status}`, {
      status: response.status,
      code: apiError?.code,
      details: apiError,
    });
  }
  return body;
}

/** `to` is the recipient's wa_id (digits only), exactly as received in the webhook. */
function sendText(to, body) {
  return post({ to, type: 'text', text: { body, preview_url: false } });
}

/** Up to 3 reply buttons. Titles max 20 chars, body max 1024 chars. */
function sendButtons(to, body, buttons) {
  return post({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
      },
    },
  });
}

function markAsRead(messageId) {
  return post({ status: 'read', message_id: messageId });
}

module.exports = { sendText, sendButtons, markAsRead };
