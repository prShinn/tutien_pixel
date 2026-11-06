const express = require('express');
const { DomainError } = require('../domain');
const asyncRoute = require('./async-route');

function createPlayerRouter({ auth, players }) {
  const router = express.Router();
  router.use(auth.authenticate);

  router.get('/me', asyncRoute(async (req, res) => res.json({ player: await players.snapshot(req.auth.sub) })));
  router.get('/state', asyncRoute(async (req, res) => res.json(await players.snapshot(req.auth.sub))));
  router.get('/power', asyncRoute(async (req, res) => res.json(await players.power(req.auth.sub))));
  router.get('/by-user/:userId', asyncRoute(async (req, res) => {
    if (req.params.userId !== req.auth.sub) throw new DomainError('FORBIDDEN', 'Không được phép truy cập nhân vật này', 403);
    return res.json(await players.snapshot(req.auth.sub));
  }));
  router.post('/', asyncRoute(async (req, res) => {
    const player = await players.create(req.auth.sub, req.body);
    return res.status(201).json({ ...player, player });
  }));
  router.post('/respawn', asyncRoute(async (req, res) => res.json(await players.respawn(req.auth.sub, req.body))));
  router.post('/stats/allocate', asyncRoute(async (req, res) => res.json(await players.allocateStats(req.auth.sub, req.body))));
  router.put('/:id', asyncRoute(async (req, res) => res.json(await players.update(req.auth.sub, req.params.id, req.body))));

  return router;
}

module.exports = { createPlayerRouter };
