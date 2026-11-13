const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }],
});

module.exports = prisma;
