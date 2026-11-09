const express = require('express');
const asyncRoute = require('./async-route');

function createShopRouter({ auth, shop }) {
  const router = express.Router();

  router.get('/catalog/items', (_req, res) => res.json({ items: shop.listCatalog() }));

  router.post('/player/shop/buy', auth.authenticate, asyncRoute(async (req, res) => {
    const { requestId, itemCode, quantity } = req.body || {};
    return res.json({ ok: true, ...await shop.buy(req.auth.sub, requestId, itemCode, quantity) });
  }));

  router.post('/player/shop/sell', auth.authenticate, asyncRoute(async (req, res) => {
    const { requestId, itemCode, quantity } = req.body || {};
    return res.json({ ok: true, ...await shop.sell(req.auth.sub, requestId, itemCode, quantity) });
  }));

  return router;
}

module.exports = { createShopRouter };
