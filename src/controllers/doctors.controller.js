const service = require('../services/doctor.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (_req, res) => {
  res.json({ doctors: await service.list() });
});

const create = asyncHandler(async (req, res) => {
  const doctor = await service.create(req.body || {});
  res.status(201).json({ doctor });
});

const update = asyncHandler(async (req, res) => {
  res.json({ doctor: await service.setActive(req.params.id, req.body?.isActive) });
});

module.exports = { list, create, update };
