const express = require('express');
const asyncRoute = require('./async-route');
const { createRateLimiter } = require('./rate-limit');

function createAuthRouter(auth, config) {
  const router = express.Router();
  const credentialsLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 12 });
  const refreshLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

  router.post('/register', credentialsLimit, asyncRoute(async (req, res) => res.status(201).json(await auth.register(req.body))));
  router.all('/register', (_req, res) => {
    res.set('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Đăng ký yêu cầu HTTP POST với username và password',
      code: 'METHOD_NOT_ALLOWED',
      message: 'Đăng ký yêu cầu HTTP POST với username và password',
    });
  });
  router.post('/login', credentialsLimit, asyncRoute(async (req, res) => res.json(await auth.login(req.body))));
  router.all('/login', (_req, res) => {
    res.set('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Đăng nhập yêu cầu HTTP POST với username và password',
      code: 'METHOD_NOT_ALLOWED',
      message: 'Đăng nhập yêu cầu HTTP POST với username và password',
    });
  });
  router.post('/refresh', refreshLimit, asyncRoute(async (req, res) => res.json(await auth.refresh(req.body))));
  router.post('/logout', refreshLimit, asyncRoute(async (req, res) => res.json(await auth.logout(req.body))));
  router.post('/demo', credentialsLimit, asyncRoute(async (_req, res) => {
    if (config.isProduction) return res.status(404).json({ ok: false, error: 'Không tìm thấy endpoint', code: 'NOT_FOUND', message: 'Không tìm thấy endpoint' });
    return res.status(201).json(await auth.createDemo());
  }));
  router.get('/me', auth.authenticate, asyncRoute(async (req, res) => res.json({ user: await auth.me(req.auth.sub) })));

  return router;
}

module.exports = { createAuthRouter };
