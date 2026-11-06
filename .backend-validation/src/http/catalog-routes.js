const express = require('express');
const asyncRoute = require('./async-route');

function notFound(res, resource) {
  const message = `${resource} not found`;
  return res.status(404).json({ ok: false, error: message, code: 'NOT_FOUND', message });
}

function createCatalogRouter({ auth, catalog, players, world }) {
  const router = express.Router();

  router.get('/worlds', (_req, res) => res.json(world.listSummaries()));
  router.get('/worlds/default', (_req, res) => {
    const entry = world.getDefault();
    return entry ? res.json(entry) : notFound(res, 'World');
  });
  router.get('/worlds/by-code', (req, res) => {
    const entry = world.getByCode(req.query.code);
    return entry ? res.json(entry) : notFound(res, 'World');
  });
  router.get('/world-structure', (_req, res) => res.json(world.getStructure()));

  router.get('/canh-gioi', (_req, res) => res.json(catalog.listRealms()));
  router.get('/canh-gioi/stt/:stt', (req, res) => {
    const realm = catalog.getRealmByStt(req.params.stt);
    return realm ? res.json(realm) : notFound(res, 'Realm');
  });
  router.get('/canh-gioi/:id', (req, res) => {
    const realm = catalog.getRealmById(req.params.id);
    return realm ? res.json(realm) : notFound(res, 'Realm');
  });
  router.get('/linh-can', (_req, res) => res.json(catalog.listRoots()));
  router.get('/items', (_req, res) => res.json(catalog.listItems()));
  router.get('/skills', (_req, res) => res.json(catalog.listSkills()));
  router.get('/skills/catalog', auth.authenticate, asyncRoute(async (req, res) => (
    res.json(await catalog.getSkillsForPlayer(players, req.auth.sub))
  )));
  router.get('/skill-vfx', (_req, res) => res.set('Cache-Control', 'no-store').json({ profiles: catalog.listSkillVfxProfiles() }));
  router.get('/monsters', (_req, res) => res.json(catalog.listMonsters()));
  router.get('/balance', (_req, res) => res.json(catalog.getBalance()));

  return router;
}

module.exports = { createCatalogRouter };
