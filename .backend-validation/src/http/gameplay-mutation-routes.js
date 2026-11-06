const express = require('express');
const asyncRoute = require('./async-route');

function createGameplayMutationRouter({ auth, equipment, skills }) {
  const router = express.Router();
  router.post('/player/equipment/equip', auth.authenticate, asyncRoute(async (req, res) => res.json(await equipment.equip(req.auth.sub, req.body))));
  router.post('/player/equipment/unequip', auth.authenticate, asyncRoute(async (req, res) => res.json(await equipment.unequip(req.auth.sub, req.body))));
  router.post('/player/skills/learn', auth.authenticate, asyncRoute(async (req, res) => res.json(await skills.learn(req.auth.sub, req.body))));
  router.put('/player/skills/equip', auth.authenticate, asyncRoute(async (req, res) => res.json(await skills.equip(req.auth.sub, req.body))));
  return router;
}

module.exports = { createGameplayMutationRouter };
