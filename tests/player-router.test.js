"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const createPlayerRouter = require("../routes/player");
const { items } = require("../data/mock-data");

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
