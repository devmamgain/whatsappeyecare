const logger = require('../config/logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error({ err, path: req.path }, 'Unhandled request error');
  } else {
    logger.warn({ message: err.message, path: req.path }, 'Request rejected');
  }
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
}

module.exports = { notFound, errorHandler };
