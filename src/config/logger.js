const pino = require('pino');
const config = require('./env');

const logger = pino({
  level: process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug'),
  transport: config.isProduction
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});

module.exports = logger;
