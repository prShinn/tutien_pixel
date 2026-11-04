"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const fixtureRoot = path.join(root, "public", "mock-api");
const readJson = (filename) => fs.readFileSync(path.join(fixtureRoot, filename), "utf8");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

async function harness(search = "?mockBackend=1") {
  const origin = "http://game.test";
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, origin);
    calls.push({ pathname: url.pathname, method: init.method || "GET" });
    if (url.pathname === "/mock-api/catalog.json") return new Response(readJson("catalog.json"));
    if (url.pathname.startsWith("/mock-api/worlds/")) {
      const code = path.basename(url.pathname).replace(/\.json$/, "");
      const filename = path.join(fixtureRoot, "worlds", `${code}.json`);
      return fs.existsSync(filename) ? new Response(fs.readFileSync(filename, "utf8")) : new Response("not found", { status: 404 });
    }
    return new Response("native response", { status: 200 });
  };
  const scope = {
    fetch: fetchImpl,
    location: { search, origin, href: `${origin}/${search}` },
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    Response,
    Headers,
  };
  const { installMockBackend } = await import("../public/js/core/mock-backend.mjs");
  const backend = installMockBackend({ scope, storage: scope.localStorage, session: scope.sessionStorage, fixtureRoot: `${origin}/mock-api/` });
  return { backend, scope, calls, origin };
}

async function call(scope, origin, pathname, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await scope.fetch(`${origin}${pathname}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

test("mock API flag leaves normal requests untouched when disabled", async () => {
  const { backend, scope, calls, origin } = await harness("");
  assert.equal(backend.enabled, false);
  const response = await scope.fetch(`${origin}/api/items`);
  assert.equal(await response.text(), "native response");
  assert.deepEqual(calls.map((entry) => entry.pathname), ["/api/items"]);
});

test("mock API preserves REST paths, persists a local player, and supplies local map loot", async () => {
  const { backend, scope, calls, origin } = await harness();
  await backend.ready;

  const auth = await call(scope, origin, "/api/auth/demo", { method: "POST", body: {} });
  assert.equal(auth.status, 200);
  const token = auth.body.token;
  const created = await call(scope, origin, "/api/player", {
    method: "POST",
    token,
    body: { userId: auth.body.user.id, name: "Tu sĩ test", linhCan: "KIM", stats: { str: 10, agi: 7, vit: 6, ene: 7 } },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.mapCode, "thanh_van_tran");

  const saved = await call(scope, origin, `/api/player/${created.body.id}`, {
    method: "PUT",
    token,
    body: { jsonIventory: JSON.stringify([{ id: "STONE_LINH_NHO", type: "POTION", giaTriTuVi: 999999, count: 1 }]) },
  });
  assert.equal(saved.status, 200);
  const consumed = await call(scope, origin, "/api/player/inventory/use", { method: "POST", token, body: { index: 0 } });
  const stone = JSON.parse(readJson("catalog.json")).items.find((entry) => entry.id === "STONE_LINH_NHO");
  assert.equal(consumed.status, 200);
  assert.equal(consumed.body.result.amount, stone.giaTriTuVi);
  assert.equal(consumed.body.player.tuViHienTai, stone.giaTriTuVi);

  await backend.recordQuestEvent("monster_kill", { monsterId: "wolf-1" });
  const quests = await call(scope, origin, "/api/quests", { token });
  assert.equal(quests.status, 200);
  assert.equal(quests.body.quests.find((quest) => quest.id === "first-journey").progress, 1);

  const world = await call(scope, origin, "/api/worlds/by-code?code=binh_nguyen");
  assert.equal(world.status, 200);
  assert.ok(world.body.monsters.some((monster) => monster.dropTable?.some((drop) => drop.item?.id)));

  await scope.fetch(`${origin}/api/admin/content/items`);
  await scope.fetch(`${origin}/images/test.png`);
  assert.ok(calls.some((entry) => entry.pathname === "/mock-api/catalog.json"));
  assert.ok(calls.some((entry) => entry.pathname === "/mock-api/worlds/binh_nguyen.json"));
  assert.ok(calls.some((entry) => entry.pathname === "/api/admin/content/items"));
  assert.ok(calls.some((entry) => entry.pathname === "/images/test.png"));
});
