const express = require('express');
const asyncRoute = require('./async-route');

function createCultivationRouter({ auth, cultivation }) {
  const router = express.Router();
  router.post('/player/cultivation/absorb', auth.authenticate, asyncRoute(async (req, res) => {
    const { requestId, itemCode } = req.body || {};
    return res.json(await cultivation.absorb(req.auth.sub, requestId, itemCode));
  }));
  router.post('/player/cultivation/breakthrough', auth.authenticate, asyncRoute(async (req, res) => {
    const { requestId } = req.body || {};
    return res.json(await cultivation.breakthrough(req.auth.sub, requestId));
  }));
  return router;
}

module.exports = { createCultivationRouter };
