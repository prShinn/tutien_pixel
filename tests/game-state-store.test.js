"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const GameStateStore = require("../game/game-state-store");

function temporaryStore(t) {
  const scratchRoot = path.join(__dirname, "..", "scratch");
  fs.mkdirSync(scratchRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratchRoot, "tutien-game-state-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new GameStateStore(path.join(directory, "game-state.json"), { writeDelayMs: 5 });
}

function sampleState() {
  return {
    schemaVersion: 1,
    users: [{ id: 1, username: "tester_1", passwordHash: `$2b$10$${"a".repeat(53)}` }],
    players: [{ id: 1, userId: 1, name: "Thanh Vân", xu: 30, inventory: [{ id: "STONE_LINH_NHO", count: 1 }] }],
  };
}

test("new state store starts empty without creating a data file", (t) => {
  const store = temporaryStore(t);
  assert.deepEqual(store.load(), { schemaVersion: 1, users: [], players: [] });
});

test("scheduled snapshots coalesce and survive a store restart", async (t) => {
  const store = temporaryStore(t);
  let state = sampleState();
  store.schedule(() => state);
  state = { ...state, players: [{ ...state.players[0], xu: 10, tuViHienTai: 45 }] };
  store.schedule(() => state);
  await store.flush();

  const restored = new GameStateStore(store.filename).load();
  assert.equal(restored.users[0].username, "tester_1");
  assert.equal(restored.players[0].xu, 10);
  assert.equal(restored.players[0].tuViHienTai, 45);
  assert.equal(restored.players[0].inventory[0].count, 1);
});

test("flush writes valid JSON by replacing the previous snapshot", async (t) => {
  const store = temporaryStore(t);
  let state = sampleState();
  store.schedule(() => state);
  await store.flush();
  state = { ...state, players: [{ ...state.players[0], xu: 99 }] };
  store.schedule(() => state);
  await store.flush();

  assert.equal(JSON.parse(fs.readFileSync(store.filename, "utf8")).players[0].xu, 99);
  assert.deepEqual(fs.readdirSync(path.dirname(store.filename)), ["game-state.json"]);
});

test("invalid or corrupt persisted state fails closed instead of starting empty", (t) => {
  const store = temporaryStore(t);
  fs.writeFileSync(store.filename, "{broken", "utf8");
  assert.throws(() => store.load(), /restore it before starting the server/);

  fs.writeFileSync(store.filename, JSON.stringify({ schemaVersion: 99, users: [], players: [] }), "utf8");
  assert.throws(() => store.load(), /Unsupported or invalid game state schema/);
});

test("invalid ownership and duplicate account identities are rejected", (t) => {
  const store = temporaryStore(t);
  const orphanPlayer = sampleState();
  orphanPlayer.players[0].userId = 2;
  fs.writeFileSync(store.filename, JSON.stringify(orphanPlayer), "utf8");
  assert.throws(() => store.load(), /persisted player owner/);

  const duplicateUser = sampleState();
  duplicateUser.users.push({ ...duplicateUser.users[0], id: 2, username: "TESTER_1" });
  fs.writeFileSync(store.filename, JSON.stringify(duplicateUser), "utf8");
  assert.throws(() => store.load(), /Duplicate persisted user/);
});
