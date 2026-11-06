const test = require('node:test');
const assert = require('node:assert/strict');
const { DomainError } = require('../src/domain');
const { createGameplayService } = require('../src/realtime/gameplay-service');
const { createWorldRuntime } = require('../src/realtime/world-runtime');
const { attachGameGateway } = require('../src/realtime/game-gateway');

function makeMap(code, options = {}) {
  const jsonMap = Array.from({ length: 10 }, () => Array(10).fill(0));
  if (options.blocked) jsonMap[1][3] = 2;
  return {
    id: code,
    code,
    tenMap: code,
    type: 'PLAIN',
    status: 'PUBLISHED',
    version: 1,
    w: 10,
    h: 10,
    spawnX: 5,
    spawnY: 5,
    jsonMap,
    portals: options.portals || [],
    monsters: options.monsters || [],
    monsterSpawns: options.monsterSpawns || [],
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 'plr_test',
    userId: 'user_test',
    name: 'Tester',
    gender: 'MALE',
    linhCan: 'KIM',
    realmCode: 'LUYEN_THE',
    realmStage: 1,
    mapCode: 'field',
    x: 1.5,
    y: 1.5,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    xu: 50,
    stats: { str: 10, agi: 5, vit: 5, ene: 5 },
    derivedStats: { pAtk: 50, mAtk: 30, pDef: 15, mDef: 10, crit: 0, evasion: 0 },
    equipment: {},
    learnedSkills: [],
    equippedSkills: [],
    inventory: [],
    ...overrides,
  };
}

function fakeSocket(id = 'socket_test') {
  const handlers = new Map();
  const events = [];
  return {
    id,
    auth: { sub: 'user_test', username: 'tester', role: 'PLAYER' },
    data: {},
    events,
    handlers,
    handshake: { auth: { token: 'valid' } },
    on(name, callback) { handlers.set(name, callback); },
    emit(name, payload) { events.push({ name, payload }); },
    to(room) { return { emit(name, payload) { events.push({ name, payload, room, except: id }); } }; },
    async join(room) { this.data.joinedRoom = room; },
    leave(room) { if (this.data.joinedRoom === room) this.data.joinedRoom = null; },
  };
}

function makeHarness({ player = makePlayer(), maps, skills = [], lootTables = {}, items = [] } = {}) {
  const current = structuredClone(player);
  const mapsByCode = new Map(maps || [['field', makeMap('field')], ['target', makeMap('target')]]);
  const broadcastEvents = [];
  const io = { to(room) { return { emit(name, payload) { broadcastEvents.push({ room, name, payload }); } }; } };
  const store = {
    saves: [],
    pickups: new Set(),
    vitals: new Map(),
    async savePlayerPosition(userId, mapCode, x, y) {
      Object.assign(current, { mapCode, x, y });
      this.saves.push({ userId, mapCode, x, y });
      return structuredClone(current);
    },
    async updateVitals(userId, requestId, action, changes) {
      const existing = this.vitals.get(`${userId}:${requestId}`);
      if (existing) return structuredClone(existing);
      current.hp = Math.max(0, Math.min(current.maxHp, current.hp + Number(changes.hp || 0)));
      current.mp = Math.max(0, Math.min(current.maxMp, current.mp - Number(changes.mpCost || 0) + Number(changes.mp || 0)));
      const result = { player: structuredClone(current), result: { hp: current.hp, maxHp: current.maxHp, mp: current.mp, maxMp: current.maxMp } };
      this.vitals.set(`${userId}:${requestId}`, result);
      return structuredClone(result);
    },
    async pickupGroundItem(userId, requestId, dropId, itemCode, quantity) {
      if (this.pickups.has(dropId)) throw new DomainError('LOOT_ALREADY_CLAIMED', 'Already claimed', 409);
      this.pickups.add(dropId);
      const entry = current.inventory.find((item) => item.itemCode === itemCode);
      if (entry) entry.count += quantity;
      else current.inventory.push({ id: itemCode, itemCode, count: quantity, quantity, slot: current.inventory.length });
      return { player: structuredClone(current), result: { accepted: true, dropId, itemCode, quantity } };
    },
  };
  const players = {
    async snapshot() { return structuredClone(current); },
    decorate(value) { return structuredClone(value); },
  };
  let monsterCatalog = [];
  let monsterCatalogRevision = 0;
  const catalog = {
    listItems: () => structuredClone(items),
    listSkills: () => structuredClone(skills),
    listMonsters: () => structuredClone(monsterCatalog),
    getMonsterRevision: () => monsterCatalogRevision,
    getLootTableById: (id) => structuredClone(lootTables[id] || []),
  };
  const quests = { async applyEvent() { return { changed: false, revision: 0, quests: [] }; } };
  const world = {
    getByCode: (code) => mapsByCode.get(code) || null,
    getDefault: () => [...mapsByCode.values()][0] || null,
  };
  const gameplay = createGameplayService({ io, auth: {}, players, store, catalog, world, quests });
  return { gameplay, io, store, current, players, mapsByCode, broadcastEvents, quests,
    setMonsterCatalog(records) { monsterCatalog = structuredClone(records); monsterCatalogRevision += 1; } };
}

async function send(gameplay, socket, requestId, type, payload = {}) {
  return gameplay.command(socket, { requestId, type, payload });
}

test('runtime creates FE-compatible monster ids and honors spawn pack coordinates', () => {
  const map = makeMap('field', {
    monsterSpawns: [{ packId: 'PACK_WOLF', templateId: 'WOLF', centerX: 4, centerY: 4, count: 3, radius: 2 }],
    monsters: [{ id: 'WOLF', code: 'WOLF', hp: 20, maxHp: 20, def: 1 }],
  });
  const runtime = createWorldRuntime({ world: { getByCode: () => map } });
  const monsters = runtime.listMonsters('field');
  assert.deepEqual(monsters.map((monster) => monster.id), ['PACK_WOLF_0', 'PACK_WOLF_1', 'PACK_WOLF_2']);
  assert.ok(monsters.every((monster) => monster.templateId === 'WOLF' && monster.maxHp === 20));
});

test('configured monster packs use exact counts, safe tiles and an explicit empty list', () => {
  const map = makeMap('field', {
    monsterSpawns: [
      { packId: 'PACK_ONE', templateId: 'WOLF', centerX: 0, centerY: 1, count: 1, radius: 20 },
      { packId: 'PACK_MANY', templateId: 'WOLF', centerX: 1, centerY: 1, count: 8, radius: 20 },
    ],
    monsters: [{ id: 'WOLF', code: 'WOLF', hp: 20, img: 'wolf.png' }],
  });
  map.rules = { monsterPacksOnly: true };
  map.jsonMap[1][2] = 2;
  const runtime = createWorldRuntime({ world: { getByCode: () => map } });
  const monsters = runtime.listMonsters('field');
  assert.equal(monsters.length, 9);
  assert.equal(monsters[0].packCenterX, 0);
  assert.ok(monsters.every(({ x, y, img }) => img === 'wolf.png' && map.jsonMap[y]?.[x] === 0));
  map.monsterSpawns = [];
  map.version++;
  assert.deepEqual(runtime.listMonsters('field'), []);
});

test('admin monster edits update live entities without resetting health or position', async () => {
  const field = makeMap('field', {
    monsters: [{ id: 'WOLF', code: 'WOLF', name: 'Sói cũ', hp: 100, maxHp: 100, atk: 5, def: 1, speed: 1, img: 'wolf-old.png' }],
    monsterSpawns: [{ packId: 'PACK_WOLF', templateId: 'WOLF', centerX: 5, centerY: 5, count: 1, radius: 2 }],
  });
  field.rules = { monsterPacksOnly: true };
  const harness = makeHarness({ maps: [['field', field]] });
  harness.gameplay.runtime.listMonsters('field');
  const monster = harness.gameplay.runtime.getMonster('field', 'PACK_WOLF_0');
  const originalPosition = { x: monster.x, y: monster.y };
  harness.gameplay.runtime.damageMonster('field', monster.id, 30);
  harness.setMonsterCatalog([{ id: 'WOLF', code: 'WOLF', name: 'Sói mới', hp: 200, maxHp: 200, atk: 20, def: 4, speed: 1.5, img: 'wolf-new.png' }]);

  await new Promise((resolve) => setTimeout(resolve, 560));

  const updated = harness.gameplay.runtime.getMonster('field', monster.id);
  assert.equal(updated.name, 'Sói mới');
  assert.equal(updated.img, 'wolf-new.png');
  assert.equal(updated.maxHp, 200);
  assert.equal(updated.hp, 140, 'current health ratio should be retained');
  assert.deepEqual({ x: updated.x, y: updated.y }, originalPosition);
  assert.notEqual(updated.state, 'dead', 'a catalog refresh must preserve the monster life state');
  assert.ok(harness.broadcastEvents.some((event) => event.name === 'monster_update' && event.payload.monsters[0].img === 'wolf-new.png'));
  harness.gameplay.close();
});

test('world.join ignores client map and coordinates; movement clamps speed and stops at water', async () => {
  const field = makeMap('field', { blocked: true });
  const harness = makeHarness({ maps: [['field', field], ['other', makeMap('other')]] });
  const socket = fakeSocket();
  const joined = await send(harness.gameplay, socket, 'join_req_0001', 'world.join', { mapCode: 'other', x: 9, y: 9 });
  assert.equal(joined.result.mapCode, 'field');
  assert.equal(joined.result.player.x, 1.5);
  assert.equal(harness.broadcastEvents.filter((event) => event.name === 'player_join').length, 0);
  const lootState = socket.events.find((event) => event.name === 'ground_loot_state');
  assert.deepEqual(lootState.payload.items, []);

  await new Promise((resolve) => setTimeout(resolve, 20));
  const fast = await send(harness.gameplay, socket, 'move_req_0001', 'movement.intent', { mapCode: 'field', x: 9, y: 1.5 });
  assert.ok(fast.result.x - 1.5 <= 4.41);
  assert.equal(fast.result.corrected, true);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const blocked = await send(harness.gameplay, socket, 'move_req_0002', 'movement.intent', { mapCode: 'field', x: 4.5, y: 1.5 });
  assert.ok(blocked.result.x < 3);
  assert.equal(socket.events.some((event) => event.name === 'movement_corrected'), true);
  harness.gameplay.close();
});

test('reconnect replaces the previous socket session and resync returns current room state', async () => {
  const harness = makeHarness();
  const oldSocket = fakeSocket('socket_old');
  const newSocket = fakeSocket('socket_new');
  await send(harness.gameplay, oldSocket, 'join_req_0100', 'world.join');
  await send(harness.gameplay, newSocket, 'join_req_0101', 'world.join', { mapCode: 'another_map' });
  assert.equal(harness.gameplay.runtime.getPlayer('field', 'socket_old'), null);
  assert.equal(harness.gameplay.runtime.getPlayer('field', 'socket_new').userId, 'user_test');
  await new Promise((resolve) => setTimeout(resolve, 260));
  const resync = await send(harness.gameplay, newSocket, 'resync_req_01', 'world.resync');
  assert.equal(resync.result.mapCode, 'field');
  assert.ok(newSocket.events.filter((event) => event.name === 'world_init').length >= 2);
  harness.gameplay.close();
});

test('map.change requires a nearby portal and chooses its server destination', async () => {
  const field = makeMap('field', { portals: [{ id: 'gate', x: 1, y: 1, toMap: 'target', toX: 5, toY: 5 }] });
  const harness = makeHarness({ maps: [['field', field], ['target', makeMap('target')]] });
  const socket = fakeSocket();
  await send(harness.gameplay, socket, 'join_req_0002', 'world.join', { mapCode: 'field' });
  const moved = await send(harness.gameplay, socket, 'map_req_0001', 'map.change', { mapCode: 'target', x: 0, y: 0 });
  assert.equal(moved.result.mapCode, 'target');
  assert.equal(moved.result.x, 5);
  assert.equal(moved.result.y, 5);
  assert.equal(harness.current.mapCode, 'target');
  await assert.rejects(send(harness.gameplay, socket, 'map_req_0002', 'map.change', { mapCode: 'field' }), { code: 'PORTAL_NOT_FOUND_OR_OUT_OF_RANGE' });
  harness.gameplay.close();
});

test('combat attack damages authoritative monster and emits FE combat/death events', async () => {
  const field = makeMap('field', {
    monsters: [{ id: 'MOB', code: 'MOB', name: 'Mob', hp: 8, maxHp: 8, def: 0, atk: 1, speed: 0.5 }],
    monsterSpawns: [{ packId: 'PACK_MOB', templateId: 'MOB', centerX: 2, centerY: 1, count: 3, radius: 1, aggroRange: 1 }],
  });
  const harness = makeHarness({ maps: [['field', field]] });
  const socket = fakeSocket();
  await send(harness.gameplay, socket, 'join_req_0003', 'world.join');
  const result = await send(harness.gameplay, socket, 'attack_req_001', 'combat.attack', { targetId: 'PACK_MOB_0', mapCode: 'field' });
  assert.equal(result.result.hits[0].targetId, 'PACK_MOB_0');
  assert.equal(result.result.hits[0].dead, true);
  assert.ok(harness.broadcastEvents.some((event) => event.name === 'combat_result'));
  assert.ok(harness.broadcastEvents.some((event) => event.name === 'monster_death'));
  harness.gameplay.close();
});

test('area attack keeps its request ID across another command and spends MP once', async (t) => {
  const skill = { code: 'AREA', name: 'Area', linhCan: 'KIM', satThuong: 1, dienRong: 2, range: 5, effect: 'slow', effectVal: 25, thoiGianBuff: 4, mpTieuHao: 5, hoiChieu: 2 };
  const field = makeMap('field', {
    monsters: [{ id: 'MOB', code: 'MOB', name: 'Mob', hp: 1000, maxHp: 1000, def: 0, atk: 1, speed: 0.5 }],
    monsterSpawns: [{ packId: 'PACK_MOB', templateId: 'MOB', centerX: 2, centerY: 1, count: 3, radius: 1, aggroRange: 1 }],
  });
  const harness = makeHarness({
    maps: [['field', field]],
    player: makePlayer({ learnedSkills: ['AREA'], equippedSkills: ['AREA'] }),
    skills: [skill],
  });
  t.after(() => harness.gameplay.close());
  const socket = fakeSocket();
  await send(harness.gameplay, socket, 'join_area_req', 'world.join');
  const snapshot = harness.players.snapshot;
  let snapshotStarted;
  let resumeSnapshot;
  const started = new Promise((resolve) => { snapshotStarted = resolve; });
  const resume = new Promise((resolve) => { resumeSnapshot = resolve; });
  harness.players.snapshot = async () => {
    snapshotStarted();
    await resume;
    return snapshot();
  };

  const payload = { targetId: 'PACK_MOB_0', mapCode: 'field', skillCode: 'AREA' };
  const attack = send(harness.gameplay, socket, 'area_attack_req', 'combat.attack', payload);
  await started;
  try {
    await send(harness.gameplay, socket, 'chat_during_attack', 'chat.send', { message: 'ready' });
  } finally {
    resumeSnapshot();
  }
  const response = await attack;
  assert.equal(response.result.hits.length, 3);
  assert.equal(response.result.mp, 45);
  assert.ok(harness.store.vitals.has('user_test:area_attack_req'));
  assert.equal(harness.store.vitals.size, 1);
  const replay = await send(harness.gameplay, socket, 'area_attack_req', 'combat.attack', payload);
  assert.deepEqual(replay, response);
  assert.equal(harness.store.vitals.size, 1);
});

test('skill cast enforces loadout and persists MP/effect before success', async () => {
  const skill = { code: 'HEAL', name: 'Heal', linhCan: 'KIM', satThuong: 0, effect: 'heal', effectVal: 25, thoiGianBuff: 0, mpTieuHao: 5, hoiChieu: 2 };
  const harness = makeHarness({ player: makePlayer({ hp: 50, learnedSkills: ['HEAL'], equippedSkills: ['HEAL'] }), skills: [skill] });
  const socket = fakeSocket();
  await send(harness.gameplay, socket, 'join_req_0004', 'world.join');
  const result = await send(harness.gameplay, socket, 'skill_req_001', 'combat.skill', { skillCode: 'HEAL' });
  assert.equal(result.result.hp, 75);
  assert.equal(result.result.mp, 45);
  assert.ok(socket.events.some((event) => event.name === 'skill_result'));
  await assert.rejects(send(harness.gameplay, socket, 'skill_req_002', 'combat.skill', { skillCode: 'HEAL' }), { code: 'COOLDOWN_ACTIVE' });
  harness.gameplay.close();
});

test('concurrent loot pickup commits once and same request retry returns the cached ack', async () => {
  const harness = makeHarness();
  const socket = fakeSocket();
  await send(harness.gameplay, socket, 'join_req_0005', 'world.join');
  const drop = harness.gameplay.runtime.addDrop('field', {
    kind: 'item', itemCode: 'STONE', item: { id: 'STONE', name: 'Stone' }, count: 2, x: 1.5, y: 1.5, expiresAt: Date.now() + 10000,
  });
  await new Promise((resolve) => setTimeout(resolve, 260));
  const refreshedState = await send(harness.gameplay, socket, 'resync_req_02', 'world.resync');
  assert.equal(refreshedState.result.groundItems[0].id, drop.id);
  assert.equal(socket.events.filter((event) => event.name === 'ground_loot_state').at(-1).payload.items[0].id, drop.id);
  const attempts = await Promise.allSettled([
    send(harness.gameplay, socket, 'loot_req_001', 'loot.pickup', { itemId: drop.id }),
    send(harness.gameplay, socket, 'loot_req_002', 'loot.pickup', { itemId: drop.id }),
  ]);
  assert.equal(attempts.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(harness.store.pickups.size, 1);
  assert.equal(harness.current.inventory.find((item) => item.itemCode === 'STONE').count, 2);
  const replay = await send(harness.gameplay, socket, 'loot_req_001', 'loot.pickup', { itemId: drop.id });
  assert.equal(replay.result.accepted, true);
  assert.equal(harness.store.pickups.size, 1);
  harness.gameplay.close();
});

test('socket gateway rejects an unauthenticated handshake and returns timestamped error ack', async () => {
  let middleware;
  let connectionHandler;
  const io = {
    use(callback) { middleware = callback; },
    on(name, callback) { if (name === 'connection') connectionHandler = callback; },
  };
  attachGameGateway(io, {
    auth: { async authenticateToken() { throw new DomainError('UNAUTHORIZED', 'bad token', 401); } },
    gameplay: { async command() { return {}; }, async disconnect() {} },
  });
  const socket = fakeSocket();
  const handshakeError = await new Promise((resolve) => middleware(socket, resolve));
  assert.equal(handshakeError.message, 'UNAUTHORIZED');
  assert.equal(typeof connectionHandler, 'function');

  let validMiddleware;
  const validIo = { use(callback) { validMiddleware = callback; }, on(name, callback) { if (name === 'connection') connectionHandler = callback; } };
  attachGameGateway(validIo, {
    auth: { async authenticateToken() { return { sub: 'user_test' }; } },
    gameplay: { async command() { throw new DomainError('LOOT_NOT_FOUND', 'missing', 404); }, async disconnect() {} },
  });
  const accepted = fakeSocket();
  await new Promise((resolve, reject) => validMiddleware(accepted, (error) => error ? reject(error) : resolve()));
  connectionHandler(accepted);
  const ack = await new Promise((resolve) => accepted.handlers.get('game_command')({ requestId: 'loot_req_003', type: 'loot.pickup', payload: { itemId: 'x' } }, resolve));
  assert.equal(ack.ok, false);
  assert.equal(ack.error.code, 'LOOT_NOT_FOUND');
  assert.ok(Number.isFinite(ack.serverTime));
});
