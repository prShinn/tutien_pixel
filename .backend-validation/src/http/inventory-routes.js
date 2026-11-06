const express = require('express');
const asyncRoute = require('./async-route');

function createInventoryRouter({ auth, inventory }) {
  const router = express.Router();
  router.post('/player/inventory/use', auth.authenticate, asyncRoute(async (req, res) => {
    const { requestId, itemCode } = req.body || {};
    return res.json(await inventory.use(req.auth.sub, requestId, itemCode));
  }));
  return router;
}

module.exports = { createInventoryRouter };
