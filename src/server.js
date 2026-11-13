const config = require('./config/env');
const logger = require('./config/logger');
const prisma = require('./lib/prisma');
const app = require('./app');

const server = app.listen(config.port, () => {
  logger.info(`WhatsApp booking bot listening on port ${config.port} (${config.nodeEnv})`);
});

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
