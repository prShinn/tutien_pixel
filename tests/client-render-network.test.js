"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const coreDirectory = path.join(root, "public", "js", "core");
const networkSource = fs.readFileSync(path.join(root, "public", "js", "net.js"), "utf8");

function networkHarness({ fetchImpl, session = {} }) {
  const values = new Map(Object.entries(session));
  const sessionStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const context = vm.createContext({
    sessionStorage,
    fetch: fetchImpl,
    Headers,
    Response,
    crypto: { randomUUID: () => "request-id-0001" },
    AutoLoot: { isEnabled: () => false },
    API: {
      BASE: "http://be.test",
      SOCKET_URL: "http://be.test",
      AUTO_SAVE_MS: 30000,
      PATHS: { auth: { refresh: "/api/auth/refresh", logout: "/api/auth/logout", login: "/api/auth/login", register: "/api/auth/register", demo: "/api/auth/demo" }, player: { update: (id) => `/api/player/${id}` } },
    },
    S: { player: null, session: { user: null }, inventory: [] },
    UI: { buildInv() {}, update() {} },
    console,
  });
  vm.runInContext(`${networkSource}\nglobalThis.__Net = Net;`, context, { filename: "net.js" });
  return { Net: context.__Net, values, state: context.S };
}

test("fixed-step clock gives the same 60 gameplay ticks at 240Hz and 20FPS", async () => {
  const { createFixedStepClock } = await import(pathToFileURL(path.join(coreDirectory, "fixed-step.mjs")).href);
  for (const frameInterval of [1000 / 240, 50]) {
    const clock = createFixedStepClock();
    clock.reset(0);
    let updates = 0;
    for (let frame = 1; frame <= Math.round(1000 / frameInterval); frame += 1) {
      updates += clock.advance(frame * frameInterval).steps;
    }
    assert.equal(updates, 60);
  }
});

test("fixed-step clock caps catch-up after a long stalled frame", async () => {
  const { createFixedStepClock } = await import(pathToFileURL(path.join(coreDirectory, "fixed-step.mjs")).href);
  const clock = createFixedStepClock({ maxCatchUpSteps: 5 });
  clock.reset(0);
  const stalledFrame = clock.advance(1000);
  assert.equal(stalledFrame.frameDelta, 100);
  assert.equal(stalledFrame.steps, 5);
  assert.equal(stalledFrame.alpha, 0);
});

test("snapshot buffer interpolates delayed samples and snaps teleports", async () => {
  const { createSnapshotBuffer } = await import(pathToFileURL(path.join(coreDirectory, "snapshot-buffer.mjs")).href);
  const snapshots = createSnapshotBuffer({ delayMs: 100, maxSamples: 3, snapDistance: 48 });
  const entity = {};
  snapshots.reset(entity, 0, 0, 0);
  snapshots.push(entity, 10, 4, 50);
  snapshots.push(entity, 20, 8, 100);
  assert.deepEqual(snapshots.sample(entity, 75), { x: 15, y: 6 });
  assert.equal(entity._snapshots.length, 3);
  assert.equal(snapshots.push(entity, 25, 9, 90), false, "out-of-order packets must not rewind the buffer");
  snapshots.push(entity, 100, 100, 150);
  assert.deepEqual(entity._snapshots, [{ x: 100, y: 100, time: 150 }], "teleport should reset stale interpolation history");
  assert.deepEqual(snapshots.sample(entity, 200), { x: 100, y: 100 });
});

test("state bus publishes HUD events only when displayed values change", async () => {
  const { StateBus } = await import(pathToFileURL(path.join(coreDirectory, "state.mjs")).href);
  const vitals = [];
  const positions = [];
  const unsubscribeVitals = StateBus.on("player:vitals_changed", (value) => vitals.push(value));
  const unsubscribePosition = StateBus.on("player:position_changed", (value) => positions.push(value));
  const player = { hp: 50.4, maxHp: 100, mp: 20, maxMp: 40, tuViHienTai: 7, tuViLenCap: 100, xu: 12, x: 1.1, y: 2.8 };
  StateBus.publishPlayerVitals(player);
  StateBus.publishPlayerVitals({ ...player, hp: 50.9 });
  StateBus.publishPlayerVitals({ ...player, hp: 49.9 });
  StateBus.publishPlayerPosition(player, "test-map");
  StateBus.publishPlayerPosition({ ...player, x: 1.9 }, "test-map");
  StateBus.publishPlayerPosition({ ...player, x: 2.1 }, "test-map");
  unsubscribeVitals();
  unsubscribePosition();
  assert.equal(vitals.length, 2);
  assert.equal(vitals[1].hp, 49);
  assert.equal(positions.length, 2);
  assert.equal(positions[1].x, 2);
});

test("HUD consumes vitals events using cultivation field names", async () => {
  const { StateBus } = await import(pathToFileURL(path.join(coreDirectory, "state.mjs")).href);
  const uiSource = fs.readFileSync(path.join(root, "public", "js", "ui.js"), "utf8");
  const elements = new Map(["ui-hp", "b-hp", "ui-mp", "b-mp", "ui-tu", "b-tu", "ui-xu"].map((id) => [id, { style: {}, textContent: "" }]));
  const context = vm.createContext({
    StateBus,
    document: { getElementById(id) { return elements.get(id) || null; } },
  });
  vm.runInContext(`${uiSource}\nglobalThis.__UI = UI;`, context);
  StateBus.publishPlayerVitals({ hp: 40, maxHp: 100, mp: 10, maxMp: 50, tuViHienTai: 25, tuViLenCap: 200, xu: 1234 });
  assert.equal(elements.get("ui-hp").textContent, "40/100");
  assert.equal(elements.get("ui-mp").textContent, "10/50");
  assert.equal(elements.get("ui-tu").textContent, "25/200");
  assert.equal(elements.get("ui-xu").textContent.replace(/[.,]/g, ""), "1234");
});

test("renderer uses stable global Y order for drawable entities", () => {
  const renderSource = fs.readFileSync(path.join(root, "public", "js", "render.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(`${renderSource}\nglobalThis.__Render = Render;`, context);
  const drawables = [
    { id: "near-player", y: 10, order: 4, sequence: 3 },
    { id: "loot", y: 5, order: 0, sequence: 0 },
    { id: "monster", y: 10, order: 2, sequence: 1 },
    { id: "npc", y: 10, order: 1, sequence: 2 },
  ];
  const sorted = context.__Render.sortDrawables(drawables);
  assert.deepEqual(Array.from(sorted, (entry) => entry.id), ["loot", "npc", "monster", "near-player"]);
});

test("walk sprite frame and body step phase advance together from traveled distance", () => {
  const renderSource = fs.readFileSync(path.join(root, "public", "js", "render.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(`${renderSource}\nglobalThis.__Render = Render;`, context);
  const actor = { walkDistance: 0 };

  assert.equal(context.__Render.walkFrame(actor), 0);
  assert.equal(context.__Render.walkPhase(actor), 0);
  actor.walkDistance = 13;
  assert.equal(context.__Render.walkFrame(actor), 1);
  assert.equal(context.__Render.walkPhase(actor), Math.PI / 2);
  actor.walkDistance = 52;
  assert.equal(context.__Render.walkFrame(actor), 0);
  assert.equal(context.__Render.walkPhase(actor), 0);
});

test("terrain renderer loads the 47-mask sprite atlas and rasterizes 8px ground cells", async () => {
  const renderSource = fs.readFileSync(path.join(root, "public", "js", "render.js"), "utf8");
  const atlasSource = fs.readFileSync(path.join(root, "public", "assets", "tilesets", "temperate-47.svg"), "utf8");
  assert.match(atlasSource, /width="1504" height="40"/);
  assert.equal((atlasSource.match(/<g transform=/g) || []).length, 47 * 4 * 5);

  const draws = [];
  function makeCanvas() {
    const canvas = { width: 0, height: 0 };
    canvas.getContext = () => ({
      imageSmoothingEnabled: true,
      clearRect() {},
      drawImage(...args) { draws.push(args); },
      createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData() {},
    });
    return canvas;
  }
  class FakeImage {
    constructor() { this.naturalWidth = 1504; this.naturalHeight = 40; }
    set src(value) {
      this.url = value;
      setTimeout(() => this.onload?.(), 0);
    }
  }
  const context = vm.createContext({
    Image: FakeImage,
    S: { tiles: Array.from({ length: 8 }, () => Array(8).fill(0)), mapW: 8, mapH: 8 },
    document: { createElement: () => makeCanvas() },
  });
  vm.runInContext(`${renderSource}\nglobalThis.__Render = Render;`, context, { filename: "render.js" });
  context.__Render.buildTerrainCache();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const atlasDraw = draws.find(([source]) => source instanceof FakeImage);
  assert.ok(atlasDraw, "the loaded sprite atlas should be used to build the terrain cache");
  assert.equal(atlasDraw[1] % 8, 0, "source X must begin on an 8px sprite boundary");
  assert.ok(atlasDraw[1] >= 0 && atlasDraw[1] < 32, "the grass mask must select one of four variants");
  assert.equal(atlasDraw[2], 0, "grass is the first atlas row");
  assert.deepEqual(Array.from(atlasDraw.slice(3)), [8, 8, 0, 0, 8, 8]);
});

test("expired access token refreshes once then retries the original request", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, authorization: new Headers(options.headers || {}).get("Authorization") });
    if (url.endsWith("/api/player/state") && calls.filter((call) => call.url.endsWith("/api/player/state")).length === 1) {
      return new Response(JSON.stringify({ ok: false, error: "Token expired" }), { status: 401 });
    }
    if (url.endsWith("/api/auth/refresh")) {
      return new Response(JSON.stringify({ token: "access-new", accessToken: "access-new", refreshToken: "refresh-new" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "player-1" }), { status: 200 });
  };
  const { Net, values } = networkHarness({ fetchImpl, session: { tu_tien_token: "access-old", tu_tien_refresh_token: "refresh-old" } });

  const result = await Net.get("/api/player/state");

  assert.equal(result.id, "player-1");
  assert.deepEqual(calls.map((call) => call.url.split("/").slice(-2).join("/")), ["player/state", "auth/refresh", "player/state"]);
  assert.equal(calls[2].authorization, "Bearer access-new");
  assert.equal(values.get("tu_tien_refresh_token"), "refresh-new");
});

test("a failed mutation retry reuses requestId and live autosave never writes snapshots", async () => {
  const requestIds = [];
  const failedNetwork = async (_url, options = {}) => {
    if (options.body) requestIds.push(JSON.parse(options.body).requestId);
    throw new TypeError("network offline");
  };
  const firstSession = networkHarness({ fetchImpl: failedNetwork, session: { tu_tien_token: "access-token" } });

  const failed = await firstSession.Net.mutate("POST", "/api/player/shop/buy", { itemCode: "stone", quantity: 1 });
  assert.equal(failed.code, "NETWORK_ERROR");

  let attempts = 0;
  const retrySession = networkHarness({ fetchImpl: async (_url, options = {}) => {
    requestIds.push(JSON.parse(options.body).requestId);
    attempts += 1;
    return new Response(JSON.stringify({ ok: true, player: { id: "player-1" } }), { status: 200 });
  }, session: Object.fromEntries(firstSession.values) });
  const { Net, state } = retrySession;
  const result = await Net.mutate("POST", "/api/player/shop/buy", { itemCode: "stone", quantity: 1 });
  assert.equal(result.ok, true);
  assert.equal(requestIds.length, 2);
  assert.equal(requestIds[0], requestIds[1]);

  state.player = { id: "player-1" };
  const beforeSave = attempts;
  const saved = await Net.saveNow({ type: "test" });
  assert.equal(saved.reason, "SERVER_AUTHORITATIVE_STATE");
  assert.equal(attempts, beforeSave);
});
