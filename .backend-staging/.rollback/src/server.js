const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const config = require('./config');
const { createMysqlStore } = require('./store/mysql-store');
const { createAuth } = require('./auth');
const { createPlayerService } = require('./player');
const { createShopService } = require('./shop');
const { createAuthRouter } = require('./http/auth-routes');
const { createPlayerRouter } = require('./http/player-routes');
const { createShopRouter } = require('./http/shop-routes');
const { createCatalogRouter } = require('./http/catalog-routes');
const { errorHandler } = require('./http/error-handler');
const { attachGameGateway } = require('./realtime/game-gateway');
const { attachRedisAdapter } = require('./realtime/redis-adapter');
const { createGameplayService } = require('./realtime/gameplay-service');
const { createCatalogService } = require('./catalog/catalog-service');
const { createWorldService } = require('./world/world-service');
const { createInventoryService } = require('./inventory/inventory-service');
const { createCultivationService } = require('./cultivation/cultivation-service');
const { createInventoryRouter } = require('./http/inventory-routes');
const { createCultivationRouter } = require('./http/cultivation-routes');
const { createEquipmentService } = require('./equipment/equipment-service');
const { createSkillService } = require('./skills/skill-service');
const { createGameplayMutationRouter } = require('./http/gameplay-mutation-routes');
const { createQuestService } = require('./quests/quest-service');
const { createQuestRouter } = require('./http/quest-routes');
const { createAdminWorldService } = require('./admin/admin-world-service');
const { createAdminContentService } = require('./admin/admin-content-service');
const { createSkillVfxService } = require('./admin/skill-vfx-service');
const { createAdminRouter } = require('./http/admin-routes');
function mergeContentOverrides(base, overrides, key) {
  const records = new Map(base.map((record) => [String(key(record)), record]));
  for (const override of overrides) {
    if (override.deleted) records.delete(String(override.id));
    else records.set(String(override.id), override.data);
  }
  return [...records.values()];
}

async function createApp() {
  const store = createMysqlStore(config.db);
  await store.init();

  const catalog = createCatalogService();
  const [worldOverrides, itemOverrides, skillOverrides, monsterOverrides, questOverrides, vfxProfiles] = await Promise.all([
    store.listAdminWorlds(),
    store.listAdminContentRecords('items'),
    store.listAdminContentRecords('skills'),
    store.listAdminContentRecords('monsters'),
    store.listAdminContentRecords('quests'),
    store.listAdminSkillVfx(),
  ]);
  for (const record of itemOverrides) catalog.applyAdminRecord('items', record.id, record);
  catalog.applyAdminCollection('skills', mergeContentOverrides(catalog.getAdminCollection('skills'), skillOverrides, (skill) => skill.code || skill.id));
  for (const record of monsterOverrides) catalog.applyAdminRecord('monsters', record.id, record);
  for (const [skillCode, profile] of Object.entries(vfxProfiles)) catalog.setSkillVfxProfile(skillCode, profile);
  const world = createWorldService({ overrides: worldOverrides });
  const auth = createAuth({ store, secret: config.jwtSecret });
  const players = createPlayerService({ store, catalog, world });
  const inventory = createInventoryService({ store, catalog, players });
  const cultivation = createCultivationService({ store, catalog, players, inventory });
  const equipment = createEquipmentService({ store, catalog, players });
  const skills = createSkillService({ store, catalog, players });
  const quests = createQuestService({ store, catalog, initialOverrides: questOverrides });
  const adminWorlds = createAdminWorldService({ store, world });
  const skillVfx = createSkillVfxService({ store, catalog });
  const shop = createShopService({ store, catalog, players });
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: config.corsOrigin, credentials: true } });
  let realtimeAdapter;
  try { realtimeAdapter = await attachRedisAdapter(io, config.redisUrl); }
  catch (error) { await store.close(); throw error; }

  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use((req, res, next) => {
    const provided = req.get('x-request-id');
    const requestId = typeof provided === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(provided)
      ? provided
      : `http_${crypto.randomUUID()}`;
    const startedAt = process.hrtime.bigint();
    req.requestId = requestId;
    res.set('X-Request-Id', requestId);
    res.once('finish', () => {
      const route = typeof req.route?.path === 'string' ? `${req.baseUrl}${req.route.path}` : req.path;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      process.stdout.write(`${JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', event: 'http_request', requestId, method: req.method, route, status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100 })}\n`);
    });
    next();
  });
  app.use('/api/admin/worlds', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'tu-tien-pixel-be', time: new Date().toISOString() }));
  app.get('/api/health/ready', async (_req, res) => {
    let mysqlReady = false;
    let redisReady = !realtimeAdapter.enabled;
    try { await store.healthCheck(); mysqlReady = true; } catch { /* readiness reports the failed dependency */ }
    if (realtimeAdapter.enabled) {
      try { redisReady = await realtimeAdapter.healthCheck(); } catch { redisReady = false; }
    }
    const dependencies = { mysql: mysqlReady ? 'ready' : 'unavailable' };
    if (realtimeAdapter.enabled) dependencies.redis = redisReady ? 'ready' : 'unavailable';
    if (!mysqlReady || !redisReady) return res.status(503).json({ ok: false, dependencies });
    return res.json({ ok: true, dependencies });
  });

  app.use('/api/auth', createAuthRouter(auth, config));
  app.use('/api', createAuthRouter(auth, config));
  app.use('/api', createCatalogRouter({ auth, catalog, players, world }));
  app.use('/api', createShopRouter({ auth, shop }));
  app.use('/api', createInventoryRouter({ auth, inventory }));
  app.use('/api', createCultivationRouter({ auth, cultivation }));
  app.use('/api', createGameplayMutationRouter({ auth, equipment, skills }));
  app.use('/api', createQuestRouter({ auth, quests }));
  const gameplay = createGameplayService({ io, auth, players, store, catalog, world, quests });
  const adminContent = createAdminContentService({ store, catalog, world, quests, onCatalogChange(collection, id, saved) {
    gameplay.catalogChanged(collection, id, saved);
    if (realtimeAdapter.enabled) io.serverSideEmit("admin_catalog_committed", collection, id);
  } });
  if (realtimeAdapter.enabled) io.on("admin_catalog_committed", (collection, id) => {
    if (!["items", "monsters"].includes(collection) || typeof id !== "string") return;
    void store.getAdminContentRecord(collection, id).then((saved) => {
      if (saved && catalog.applyAdminRecord(collection, id, saved)) gameplay.catalogChanged(collection, id, saved);
    }).catch(() => process.stderr.write('{"level":"error","event":"catalog_peer_refresh_failed"}\n'));
  });
  app.use('/api/admin', createAdminRouter({ auth, adminWorlds, adminContent, skillVfx }));
  app.use('/api/player', createPlayerRouter({ auth, players }));
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'API không tồn tại', code: 'NOT_FOUND', message: 'API không tồn tại' }));
  app.use(errorHandler);
  attachGameGateway(io, { auth, gameplay });

  return {
    app,
    server,
    io,
    store,
    async close() {
      gameplay.stop();
      await new Promise((resolve) => io.close(resolve));
      await gameplay.drain();
      await realtimeAdapter.close();
      await store.close();
    },
  };
}

if (require.main === module) {
  createApp()
    .then((application) => {
      application.server.listen(config.port, () => console.log(`Tu Tien Pixel BE listening on ${config.port}`));
      let shuttingDown = false;
      const shutdown = async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        try { await application.close(); }
        catch { process.exitCode = 1; }
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch(() => {
      console.error('Tu Tien Pixel BE failed to start');
      process.exitCode = 1;
    });
}

module.exports = { createApp };
