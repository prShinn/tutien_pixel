"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const createPlayerRouter = require("../routes/player");
const { items } = require("../data/mock-data");
const { BALANCE } = require("../data/balance");

function callPlayerRoute(pathname, { player, body = {}, catalogItems = items }) {
  const router = createPlayerRouter({
    authenticate() {},
    playerFor: () => player,
    players: new Map(),
    readInventory: (value) => value.inventory,
    writeInventory: (value, inventory) => { value.inventory = inventory; },
    combatPower: () => 1,
    items: catalogItems,
    BALANCE,
  });
  const layer = router.stack.find((entry) => entry.route?.path === pathname);
  const handler = layer.route.stack.at(-1).handle;
  let status = 200;
  let payload;
  handler({ userId: 7, body }, {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  });
  return { status, payload };
}

test("player router preserves the REST methods and paths mounted by the server", () => {
  const router = createPlayerRouter({ authenticate() {} });
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods).find((method) => layer.route.methods[method]).toUpperCase()} ${layer.route.path}`);

  assert.deepEqual(routes, [
    "POST /cultivation/absorb",
    "POST /cultivation/breakthrough",
    "GET /me",
    "GET /state",
    "GET /by-user/:userId",
    "POST /inventory/use",
    "POST /shop/buy",
    "POST /shop/sell",
    "POST /",
    "POST /stats/allocate",
    "PUT /:id",
    "GET /power",
    "POST /skills/learn",
    "PUT /skills/equip",
    "POST /equipment/equip",
    "POST /equipment/unequip",
  ]);

  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /app\.use\(["']\/api\/player["'], createPlayerRouter\(/);
});

test("character ownership comes only from the authenticated session", async () => {
  async function createForSession(userId, requestBody) {
    const players = new Map();
    const playersByUserId = new Map();
    const worlds = [{ code: "starter", isDefault: true, status: "PUBLISHED", w: 20, h: 20, spawnX: 4, spawnY: 5 }];
    const router = createPlayerRouter({
      authenticate() {},
      playerFor: (ownerId) => playersByUserId.get(Number(ownerId)),
      players,
      playersByUserId,
      createPlayerId: () => userId + 100,
      combatPower: () => 100,
      realms: [{ stt: 1, code: "LUYEN_KHI", tenCanhGioi: "Luyện Khí" }],
      breakthroughThreshold: () => 100,
      breakthroughGain: () => ({}),
      items,
      BALANCE,
      roots: [{ id: "KIM", code: "KIM" }],
      worlds,
      isWorldPublished: () => true,
      nearestWalkablePoint: (_world, x, y) => ({ x, y }),
      deriveStats: () => ({ maxHp: 160, maxMp: 90 }),
      calcTuViNeeded: () => 100,
      skills: [],
      emptyEquipment: () => ({ weapon: null }),
      gameStateStore: { async flush() {} },
      storePlayer(player) {
        players.set(player.id, player);
        playersByUserId.set(Number(player.userId), player);
      },
      users: new Map([[userId, { isDemo: userId === 7 }]]),
    });
    const layer = router.stack.find((entry) => entry.route?.path === "/");
    let status = 200;
    let payload;
    await layer.route.stack.at(-1).handle({ userId, body: requestBody }, {
      status(value) { status = value; return this; },
      json(value) { payload = value; return this; },
    });
    return { status, payload };
  }

  const validInput = { name: "Tân Tu Sĩ", gender: "MALE", linhCan: "KIM", stats: { str: 10, agi: 7, vit: 5, ene: 8 } };
  const demo = await createForSession(7, validInput);
  const registered = await createForSession(8, { ...validInput, userId: 7 });

  assert.equal(demo.status, 200);
  assert.equal(demo.payload.userId, 7, "demo character owner must come from its authenticated token");
  assert.equal(registered.status, 200);
  assert.equal(registered.payload.userId, 8, "forged request userId must not replace the registered account owner");
});

test("equipment equip enforces the catalog realm even when inventory metadata is spoofed", () => {
  const player = {
    id: "player-1",
    realm: 1,
    inventory: [{ id: "SWORD_BAO_KHI_1", type: "EQUIPMENT", requiredRealmStt: 1, stats: { pAtk: 9999 } }],
  };
  const players = new Map();
  const router = createPlayerRouter({
    authenticate() {},
    playerFor: () => player,
    players,
    readInventory: (value) => value.inventory,
    writeInventory: (value, inventory) => { value.inventory = inventory; },
    combatPower: () => 1,
    items: items.map((item) => item.id === "SWORD_BAO_KHI_1" ? { ...item, requiredRealmStt: 2 } : item),
    normalizeEquipment: () => ({ weapon: null }),
    EQUIPMENT_SLOTS: ["weapon"],
  });
  const layer = router.stack.find((entry) => entry.route?.path === "/equipment/equip");
  const handler = layer.route.stack.at(-1).handle;
  let status = 200;
  let payload;
  handler({ userId: "user-1", body: { itemId: "SWORD_BAO_KHI_1" } }, {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  });

  assert.equal(status, 400);
  assert.equal(payload.code, "REALM_TOO_LOW");
  assert.equal(player.inventory.length, 1);
  assert.equal(player.equipment, undefined);
});

test("shop selling uses the server catalog price instead of inventory metadata", () => {
  const catalogItem = items.find((item) => item.id === "STONE_LINH_NHO");
  const player = {
    id: "player-2",
    xu: 0,
    inventory: [{ ...catalogItem, giaBan: Number(catalogItem.giaBan) * 1000, count: 2 }],
  };
  const router = createPlayerRouter({
    authenticate() {},
    playerFor: () => player,
    players: new Map(),
    readInventory: (value) => value.inventory,
    writeInventory: (value, inventory) => { value.inventory = inventory; },
    items,
  });
  const layer = router.stack.find((entry) => entry.route?.path === "/shop/sell");
  const handler = layer.route.stack.at(-1).handle;
  let status = 200;
  let payload;
  handler({ userId: "user-2", body: { index: 0 } }, {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  });

  assert.equal(status, 200);
  assert.equal(payload.result.price, catalogItem.giaBan);
  assert.equal(player.xu, catalogItem.giaBan);
  assert.equal(player.inventory[0].count, 1);
});

test("using a cultivation stone reads its value and type from the server catalog", () => {
  const stone = items.find((item) => item.id === "STONE_LINH_NHO");
  const player = {
    id: 3,
    tuViHienTai: 20,
    inventory: [{ ...stone, type: "POTION", giaTriTuVi: 999999, count: 1 }],
  };

  const { status, payload } = callPlayerRoute("/inventory/use", { player, body: { index: 0 } });

  assert.equal(status, 200);
  assert.equal(payload.result.type, "cultivation_absorbed");
  assert.equal(payload.result.amount, stone.giaTriTuVi);
  assert.equal(player.tuViHienTai, 20 + stone.giaTriTuVi);
  assert.equal(player.inventory.length, 0);
});

test("direct cultivation absorption also ignores forged inventory type and value", () => {
  const stone = items.find((item) => item.id === "STONE_LINH_NHO");
  const player = {
    id: 6,
    tuViHienTai: 15,
    inventory: [{ ...stone, type: "POTION", giaTriTuVi: 999999, count: 1 }],
  };

  const { status, payload } = callPlayerRoute("/cultivation/absorb", {
    player,
    body: { itemId: stone.id, amount: 999999 },
  });

  assert.equal(status, 200);
  assert.equal(payload.result.amount, stone.giaTriTuVi);
  assert.equal(player.tuViHienTai, 15 + stone.giaTriTuVi);
  assert.equal(player.inventory.length, 0);
});

test("direct cultivation absorption rejects an item absent from the catalog without mutation", () => {
  const player = {
    id: 7,
    tuViHienTai: 15,
    inventory: [{ id: "FORGED_STONE", type: "STONE", giaTriTuVi: 999999, count: 1 }],
  };

  const { status, payload } = callPlayerRoute("/cultivation/absorb", {
    player,
    body: { itemId: "FORGED_STONE", amount: 999999 },
  });

  assert.equal(status, 400);
  assert.match(payload.error, /danh mục/);
  assert.equal(player.tuViHienTai, 15);
  assert.equal(player.inventory[0].count, 1);
});

test("using a potion ignores forged healing and stat metadata in the inventory", () => {
  const potion = items.find((item) => item.id === "HUYET_NGOC_NHO");
  const player = {
    id: 4,
    hp: 10,
    maxHp: 100,
    mp: 5,
    maxMp: 50,
    stats: { str: 5, agi: 5, vit: 5, ene: 5 },
    inventory: [{ ...potion, type: "STONE", healHp: 99999, statBoost: 50, statKey: "str", count: 1 }],
  };

  const { status, payload } = callPlayerRoute("/inventory/use", { player, body: { index: 0 } });

  assert.equal(status, 200);
  assert.equal(payload.result.hp, potion.healHp);
  assert.equal(payload.result.mp, 0);
  assert.equal(player.hp, 10 + potion.healHp);
  assert.equal(player.mp, 5);
  assert.equal(player.stats.str, 5);
  assert.equal(player.inventory.length, 0);
});

test("using an item without a catalog record leaves inventory and player state unchanged", () => {
  const player = { id: 5, tuViHienTai: 20, inventory: [{ id: "FORGED_STONE", type: "STONE", giaTriTuVi: 999999, count: 1 }] };

  const { status, payload } = callPlayerRoute("/inventory/use", { player, body: { index: 0 } });

  assert.equal(status, 400);
  assert.match(payload.error, /danh mục/);
  assert.equal(player.tuViHienTai, 20);
  assert.equal(player.inventory[0].count, 1);
});
