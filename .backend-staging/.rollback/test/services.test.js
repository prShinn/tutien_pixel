const test = require('node:test');
const assert = require('node:assert/strict');
const { createInventoryService } = require('../src/inventory/inventory-service');
const { createCultivationService } = require('../src/cultivation/cultivation-service');
const { createSkillService } = require('../src/skills/skill-service');
const { validateWorld } = require('../src/admin/admin-world-service');
const { createPlayerService } = require('../src/player');
const { publicPlayer } = require('../src/domain');
const { errorHandler } = require('../src/http/error-handler');
const { createRateLimiter } = require('../src/http/rate-limit');

test('inventory use reads effect from catalog and returns decorated committed player', async () => {
  let storedCall;
  const item = { id: 'STONE_LINH_NHO', type: 'STONE', giaTriTuVi: 120 };
  const service = createInventoryService({
    catalog: { getItemByCode: (code) => code === item.id ? item : null },
    players: { decorate: (player) => ({ ...player, dto: true }) },
    store: { useInventoryItem: async (...args) => { storedCall = args; return { player: { id: 'p1' }, result: { type: 'cultivation_absorbed', amount: 120 } }; } },
  });

  const result = await service.use('u1', 'request-123', item.id);
  assert.equal(storedCall[0], 'u1');
  assert.equal(storedCall[2], item.id);
  assert.deepEqual(storedCall[4], { kind: 'cultivation', amount: 120 });
  assert.equal(result.player.dto, true);
  assert.equal(result.result.amount, 120);
});

test('inventory service rejects unknown item codes before persistence', async () => {
  let called = false;
  const service = createInventoryService({
    catalog: { getItemByCode: () => null },
    players: { decorate: (player) => player },
    store: { useInventoryItem: async () => { called = true; } },
  });
  await assert.rejects(service.use('u1', 'request-123', 'UNKNOWN'), { code: 'ITEM_NOT_FOUND' });
  assert.equal(called, false);
});

test('breakthrough derives threshold and gains from server realm catalog', async () => {
  const realm = { id: 1, stt: 1, code: 'LUYEN_THE', soTang: 9, danPhaCanh: 'DAN_PHI_THANG' };
  let progression;
  const service = createCultivationService({
    catalog: { listItems: () => [], getRealmByCode: () => realm, getRealmByStt: (stt) => stt === 2 ? { id: 2, stt: 2, code: 'KHI_DONG', soTang: 9 } : null },
    players: {
      snapshot: async () => ({ realmCode: realm.code, realmStage: 1, tuVi: 1000, tuViHienTai: 1000, tuViLinhCan: 0, stats: { str: 5, agi: 5, vit: 5, ene: 5 }, canhGioi: realm, tuViLenCap: 1000 }),
      decorate: (player) => ({ ...player, dto: true }),
    },
    inventory: { absorb: async () => ({}) },
    store: { replayBreakthrough: async () => null, breakthrough: async (_userId, _requestId, input) => { progression = input; return { player: { id: 'p1' }, result: { type: 'stage_breakthrough', major: false } }; } },
  });
  const result = await service.breakthrough('u1', 'request-456');
  assert.equal(progression.realm.code, 'LUYEN_THE');
  assert.equal(progression.threshold, 1000);
  assert.equal(progression.major, false);
  assert.equal(result.player.dto, true);
});

test('breakthrough retry returns the prior result even after tu vi was spent', async () => {
  const player = { realmCode: 'KHI_DONG', realmStage: 1, tuVi: 0 };
  const result = { type: 'realm_breakthrough', major: true };
  const service = createCultivationService({
    catalog: {},
    players: { snapshot: async () => player },
    inventory: {},
    store: {
      replayBreakthrough: async () => ({ result }),
      breakthrough: async () => assert.fail('retry cannot consume a second pill'),
    },
  });
  assert.deepEqual(await service.breakthrough('u1', 'request-replay'), { player, result });
});

test('breakthrough rejects insufficient tu vi without calling storage', async () => {
  const realm = { stt: 1, code: 'LUYEN_THE', soTang: 9 };
  let called = false;
  const service = createCultivationService({
    catalog: { getRealmByCode: () => realm, getRealmByStt: () => null },
    players: { snapshot: async () => ({ realmCode: realm.code, realmStage: 1, tuVi: 0, stats: { str: 5, agi: 5, vit: 5, ene: 5 }, canhGioi: realm, tuViLenCap: 1000 }) },
    inventory: {},
    store: { replayBreakthrough: async () => null, breakthrough: async () => { called = true; } },
  });
  await assert.rejects(service.breakthrough('u1', 'request-456'), { code: 'INSUFFICIENT_TUVI' });
  assert.equal(called, false);
});

test('skill service enforces root and realm before learning', async () => {
  let called = false;
  const skill = { code: 'KIM_KICH', name: 'Kim Kích', linhCan: 'KIM', tier: 1, category: 'ACTIVE' };
  const service = createSkillService({
    catalog: { listSkills: () => [skill] },
    players: { snapshot: async () => ({ linhCan: 'MOC', realmCode: 'LUYEN_THE', canhGioi: { stt: 1 } }) },
    store: { learnSkill: async () => { called = true; } },
  });
  await assert.rejects(service.learn('u1', { requestId: 'request-789', skillCode: skill.code }), { code: 'SKILL_ROOT_MISMATCH' });
  assert.equal(called, false);
});

test('world validation catches spawn outside map and rejects malformed layer dimensions', () => {
  const result = validateWorld({
    code: 'test_map', w: 2, h: 2, spawnX: 2, spawnY: 0,
    layers: { ground: [[0], [0]], objects: [], elevation: [] }, portals: [],
  }, []);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes('spawn')));
  assert.ok(result.errors.some((message) => message.includes('layers.ground')));
});

test('player creation ignores client-controlled wallet, location, vitals and progression', async () => {
  let created;
  const start = { code: 'start_map', spawnX: 2, spawnY: 3, jsonMap: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] };
  const realm = { stt: 1, code: 'LUYEN_THE', tuViTienCap: 1000, tangTuVi: [{ stt: 1 }] };
  const service = createPlayerService({
    store: { createPlayer: async (_userId, input) => { created = input; return { ...input, userId: 'u1' }; } },
    catalog: {
      getRealmByStt: () => realm,
      getRealmByCode: () => realm,
      getRootByCode: () => ({ id: 'KIM' }),
      listSkills: () => [],
      decoratePlayer: (player) => player,
    },
    world: { getDefault: () => start, getByCode: () => start },
  });
  await service.create('u1', {
    name: 'Tester', gender: 'MALE', linhCan: 'KIM', stats: { str: 15, agi: 5, vit: 5, ene: 5 },
    xu: 999999, hp: 999999, mp: 999999, mapCode: 'admin_map', x: 900, y: 900,
    realmCode: 'NHAT_TON', tuVi: 999999, inventory: [{ id: 'THIEN_TAI_DIA_BAO', count: 99 }],
  });
  assert.equal(created.mapCode, 'start_map');
  assert.deepEqual([created.x, created.y], [2, 3]);
  assert.equal(created.hp, 160);
  assert.equal(created.mp, 90);
  assert.equal('xu' in created, false);
  assert.equal('inventory' in created, false);
  assert.equal(created.realmCode, 'LUYEN_THE');
});

test('player update rejects snapshot fields instead of mass-assigning state', async () => {
  let called = false;
  const service = createPlayerService({
    store: { updatePlayerName: async () => { called = true; } },
    catalog: {}, world: {},
  });
  await assert.rejects(service.update('u1', 'p1', { name: 'Tester', xu: 500000 }), { code: 'PLAYER_SNAPSHOT_WRITE_FORBIDDEN' });
  assert.equal(called, false);
});

test('PlayerDTO retains compatibility aliases and REST errors echo a valid requestId', () => {
  const player = publicPlayer({ id: 'p1', userId: 'u1', name: 'Tester', x: 1.5, y: 2.5, mapCode: 'start_map', stats: {} }, { xu: 12 }, [{ id: 'row1', itemCode: 'STONE', quantity: 2, slot: 0 }]);
  assert.equal(player.jsonIventory, JSON.stringify(player.inventory));
  assert.deepEqual(player.trangBi, {});
  assert.deepEqual(player.equip_slot, {});

  let status;
  let body;
  const response = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  errorHandler(new Error('sensitive SQL details'), { requestId: 'shop_req_0001', get: () => undefined, body: {} }, response, () => {});
  assert.equal(status, 500);
  assert.equal(body.code, 'INTERNAL_ERROR');
  assert.equal(body.error, 'Lỗi máy chủ');
  assert.equal(body.requestId, 'shop_req_0001');
});

test('request limiter returns a JSON 429 response with retry and correlation id', () => {
  const limiter = createRateLimiter({ windowMs: 10000, max: 1, key: () => 'test-ip' });
  let status = 200;
  let body;
  let retryAfter;
  let nextCount = 0;
  const response = {
    set(name, value) { if (name === 'Retry-After') retryAfter = value; return this; },
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  };
  limiter({ ip: '127.0.0.1', requestId: 'limit_req_01' }, response, () => { nextCount += 1; });
  limiter({ ip: '127.0.0.1', requestId: 'limit_req_02' }, response, () => { nextCount += 1; });
  assert.equal(nextCount, 1);
  assert.equal(status, 429);
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(body.requestId, 'limit_req_02');
  assert.ok(Number(retryAfter) > 0);
});
