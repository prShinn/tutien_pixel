const express = require('express');
const asyncRoute = require('./async-route');

function createQuestRouter({ auth, quests }) {
  const router = express.Router();
  router.get('/quests', auth.authenticate, asyncRoute(async (req, res) => res.json(await quests.snapshot(req.auth.sub))));
  for (const action of ['accept', 'track', 'claim']) {
    router.post(`/quests/:id/${action}`, auth.authenticate, asyncRoute(async (req, res) => (
      res.json(await quests.mutate(req.auth.sub, req.body?.requestId, req.params.id, action))
    )));
  }
  return router;
}

module.exports = { createQuestRouter };
