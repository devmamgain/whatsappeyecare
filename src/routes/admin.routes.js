const fs = require('fs');
const path = require('path');
const express = require('express');
const logger = require('../config/logger');
const auth = require('../middleware/adminAuth');
const apiRoutes = require('./api.routes');

const PUBLIC_DIR = path.join(__dirname, '../../public/admin');
const loginTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'login.html'), 'utf8');

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const renderLogin = (error) =>
  loginTemplate.replace('{{ERROR}}', error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : '');

const router = express.Router();

// Pages and data behind the login must never be cached or framed.
router.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'",
  });
  next();
});

router.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));
router.use('/api', auth.requireApiAuth, auth.sameOriginOnly, apiRoutes);

router.get('/login', (req, res) => {
  if (auth.isAuthenticated(req)) return res.redirect('/admin');
  return res.type('html').send(renderLogin(''));
});

router.post('/login', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
  const ip = req.ip;

  if (auth.isLockedOut(ip)) {
    logger.warn({ ip }, 'Admin login blocked: too many failed attempts');
    return res.status(429).type('html').send(renderLogin('Too many attempts. Please try again in 15 minutes.'));
  }

  const { username = '', password = '' } = req.body || {};
  if (!auth.checkCredentials(username, password)) {
    auth.recordFailure(ip);
    logger.warn({ ip }, 'Failed admin login');
    return res.status(401).type('html').send(renderLogin('Incorrect username or password.'));
  }

  auth.clearFailures(ip);
  auth.setSessionCookie(res);
  logger.info('Admin signed in');
  return res.redirect(303, '/admin');
});

router.post('/logout', (_req, res) => {
  auth.clearSessionCookie(res);
  res.sendStatus(204);
});

router.get('/', auth.requirePageAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

module.exports = router;
