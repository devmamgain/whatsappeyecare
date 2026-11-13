const service = require('../services/appointment.service');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError } = require('../utils/errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (value) => (typeof value === 'string' ? value : undefined);

const list = asyncHandler(async (req, res) => {
  const [appointments, counts] = await Promise.all([
    service.list({ status: str(req.query.status), when: str(req.query.when), q: str(req.query.q) }),
    service.counts(),
  ]);
  res.json({ appointments, counts });
});

const assignDoctor = asyncHandler(async (req, res) => {
  const doctorId = req.body?.doctorId ?? null;
  if (doctorId !== null && !(typeof doctorId === 'string' && UUID.test(doctorId))) {
    throw new ValidationError('Invalid doctor');
  }
  res.json({ appointment: await service.assignDoctor(req.params.id, doctorId) });
});

const confirm = asyncHandler(async (req, res) => {
  res.json(await service.confirm(req.params.id));
});

const resend = asyncHandler(async (req, res) => {
  res.json(await service.resendConfirmation(req.params.id));
});

const cancel = asyncHandler(async (req, res) => {
  res.json(await service.cancel(req.params.id));
});

module.exports = { list, assignDoctor, confirm, resend, cancel, UUID };
