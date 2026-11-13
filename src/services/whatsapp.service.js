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

/**
 * A tap-to-choose menu. WhatsApp limits: 10 rows in total, row title 24 chars, row description
 * 72 chars, button text 20 chars. Rows are { id, title, description? }.
 */
function sendList(to, { body, buttonText, sectionTitle, rows }) {
  return post({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: { button: buttonText, sections: [{ title: sectionTitle, rows }] },
    },
  });
}

function markAsRead(messageId) {
  return post({ status: 'read', message_id: messageId });
}

/**
 * Send an approved message template (works outside the 24-hour window).
 * `bodyParams` fill the {{1}}, {{2}}... placeholders in the template body, in order.
 */
function sendTemplate(to, name, languageCode, bodyParams = []) {
  // Template parameters may not contain newlines/tabs or long runs of spaces.
  const clean = (v) => String(v).replace(/[\n\r\t]+/g, ' ').replace(/ {5,}/g, '    ').trim() || '-';
  return post({
    to,
    type: 'template',
    template: {
      name,
      language: { code: languageCode },
      components: bodyParams.length
        ? [{ type: 'body', parameters: bodyParams.map((p) => ({ type: 'text', text: clean(p) })) }]
        : [],
    },
  });
}

module.exports = { sendText, sendButtons, sendList, sendTemplate, markAsRead };
