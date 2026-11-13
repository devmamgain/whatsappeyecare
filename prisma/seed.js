// Sample doctors so staff have someone to assign appointments to.
// Run with: npm run prisma:seed
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const doctors = [
  { name: 'Dr. Anita Verma', specialization: 'General Physician', email: 'anita.verma@example.com' },
  { name: 'Dr. Rahul Mehta', specialization: 'Dermatologist', email: 'rahul.mehta@example.com' },
];

async function main() {
  for (const doctor of doctors) {
    const existing = await prisma.doctor.findFirst({ where: { name: doctor.name } });
    if (!existing) await prisma.doctor.create({ data: doctor });
  }
  console.log('Seeded doctors');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
