const { Router } = require('express');
const appointments = require('../controllers/appointments.controller');
const doctors = require('../controllers/doctors.controller');
const { NotFoundError } = require('../utils/errors');

const router = Router();

// Reject malformed ids up front (they would otherwise make Prisma throw on the UUID column).
router.param('id', (_req, _res, next, id) =>
  appointments.UUID.test(id) ? next() : next(new NotFoundError()),
);

router.get('/appointments', appointments.list);
router.patch('/appointments/:id/doctor', appointments.assignDoctor);
router.post('/appointments/:id/confirm', appointments.confirm);
router.post('/appointments/:id/resend', appointments.resend);
router.post('/appointments/:id/cancel', appointments.cancel);

router.get('/doctors', doctors.list);
router.post('/doctors', doctors.create);
router.patch('/doctors/:id', doctors.update);

module.exports = router;
