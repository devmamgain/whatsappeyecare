const prisma = require('../lib/prisma');
const { ValidationError, NotFoundError } = require('../utils/errors');

const serialize = (d) => ({
  id: d.id,
  name: d.name,
  specialization: d.specialization,
  isActive: d.isActive,
});

async function list() {
  const rows = await prisma.doctor.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  return rows.map(serialize);
}

async function create({ name, specialization }) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const cleanSpec = String(specialization || '').replace(/\s+/g, ' ').trim();
  if (cleanName.length < 2 || cleanName.length > 100) {
    throw new ValidationError('Doctor name must be 2 to 100 characters');
  }
  if (cleanSpec.length > 100) throw new ValidationError('Specialization is too long');

  const doctor = await prisma.doctor.create({
    data: { name: cleanName, specialization: cleanSpec || null },
  });
  return serialize(doctor);
}

async function setActive(id, isActive) {
  if (typeof isActive !== 'boolean') throw new ValidationError('isActive must be true or false');
  const existing = await prisma.doctor.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Doctor not found');
  return serialize(await prisma.doctor.update({ where: { id }, data: { isActive } }));
}

module.exports = { list, create, setActive };
