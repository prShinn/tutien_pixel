const express = require('express');
const asyncRoute = require('./async-route');

function createAdminRouter({ auth, adminWorlds, adminContent, skillVfx }) {
  const router = express.Router();
  const authorize = require('./admin-auth').createAdminAuth({ auth });
  router.use(authorize);

  router.get('/worlds', (_req, res) => res.json(adminWorlds.list()));
  router.post('/worlds', asyncRoute(async (req, res) => res.status(201).json(await adminWorlds.create(req.body, req.auth.sub, req))));
  router.get('/worlds/:code/validate', (req, res) => res.json(adminWorlds.validate(req.params.code)));
  router.post('/worlds/:code/publish', asyncRoute(async (req, res) => res.json(await adminWorlds.publish(req.params.code, req.auth.sub, req))));
  router.get('/worlds/:code', (req, res) => res.json(adminWorlds.get(req.params.code)));
  router.put('/worlds/:code', asyncRoute(async (req, res) => res.json(await adminWorlds.update(req.params.code, req.body, req.auth.sub, req))));
  router.delete('/worlds/:code', asyncRoute(async (req, res) => res.json(await adminWorlds.remove(req.params.code, req.auth.sub, req))));
  router.post('/portals/link', asyncRoute(async (req, res) => res.status(201).json(await adminWorlds.linkPortal(req.body, req.auth.sub, req))));
  router.delete('/worlds/:code/portals/:portalId', asyncRoute(async (req, res) => res.json(await adminWorlds.deletePortal(req.params.code, req.params.portalId, req.auth.sub, req))));

  router.get('/content/:collection', asyncRoute(async (req, res) => res.json(await adminContent.list(req.params.collection, req.query))));
  router.post('/content/:collection', asyncRoute(async (req, res) => res.status(201).json(await adminContent.create(req.params.collection, req.body, req.auth.sub, req.requestId || req.get('x-request-id')))));
  router.put('/content/:collection/:id', asyncRoute(async (req, res) => res.json(await adminContent.update(req.params.collection, req.params.id, req.body, req.auth.sub, req.requestId || req.get('x-request-id')))));
  router.delete('/content/:collection/:id', asyncRoute(async (req, res) => res.json(await adminContent.remove(req.params.collection, req.params.id, req.auth.sub, req.requestId || req.get('x-request-id')))));

  router.get('/skill-vfx', asyncRoute(async (_req, res) => res.json(await skillVfx.list())));
  router.post('/skill-vfx', asyncRoute(async (req, res) => res.status(201).json(await skillVfx.create(req.body, req.auth.sub, req.requestId || req.get('x-request-id')))));
  router.put('/skill-vfx/:skillCode', asyncRoute(async (req, res) => res.json(await skillVfx.update(req.params.skillCode, req.body, req.auth.sub, req.requestId || req.get('x-request-id')))));
  router.delete('/skill-vfx/:skillCode', asyncRoute(async (req, res) => res.json(await skillVfx.remove(req.params.skillCode, req.auth.sub, req.requestId || req.get('x-request-id')))));
  return router;
}

module.exports = { createAdminRouter };
