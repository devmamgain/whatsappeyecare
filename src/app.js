const express = require('express');
const logger = require('./config/logger');
const webhookRoutes = require('./routes/webhook.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');

// Keep the raw body: it is required to verify Meta's HMAC signature.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/webhook', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
