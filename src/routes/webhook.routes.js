const { Router } = require('express');
const verifySignature = require('../middleware/verifySignature');
const { verifyWebhook, receiveWebhook } = require('../controllers/webhook.controller');

const router = Router();

router.get('/', verifyWebhook);
router.post('/', verifySignature, receiveWebhook);

module.exports = router;
