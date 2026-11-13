const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../config/logger');

let warnedNoSecret = false;

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * Skipped (with a one-time warning) only when no app secret is configured outside production.
 */
function verifySignature(req, res, next) {
  const secret = config.whatsapp.appSecret;

  if (!secret) {
    if (!warnedNoSecret) {
      logger.warn('WHATSAPP_APP_SECRET not set: webhook signatures are NOT being verified');
      warnedNoSecret = true;
    }
    return next();
  }

  const header = req.get('x-hub-signature-256');
  if (!header || !req.rawBody) {
    logger.warn('Webhook request missing signature');
    return res.sendStatus(401);
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    logger.warn('Webhook signature mismatch');
    return res.sendStatus(401);
  }
  return next();
}

module.exports = verifySignature;
