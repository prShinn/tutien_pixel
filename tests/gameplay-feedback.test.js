"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const autoLootSource = fs.readFileSync(path.join(root, "public", "js", "auto-loot.js"), "utf8");
const visualEffectsSource = fs.readFileSync(path.join(root, "public", "js", "visual-effects.js"), "utf8");
const worldSource = fs.readFileSync(path.join(root, "public", "js", "world.js"), "utf8");
const renderSource = fs.readFileSync(path.join(root, "public", "js", "render.js"), "utf8");
const inputSource = fs.readFileSync(path.join(root, "public", "js", "input.js"), "utf8");
const netSource = fs.readFileSync(path.join(root, "public", "js", "net.js"), "utf8");
const skillsSource = fs.readFileSync(path.join(root, "public", "js", "skills.js"), "utf8");
const combatSource = fs.readFileSync(path.join(root, "public", "js", "combat.js"), "utf8");
const monsterSource = fs.readFileSync(path.join(root, "public", "js", "monster.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "public", "js", "ui.js"), "utf8");
const gameHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const gameBootstrap = fs.readFileSync(path.join(root, "public", "js", "bootstrap.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "public", "js", "game.js"), "utf8");
const updateSource = gameSource.match(/^function update\(dt\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(updateSource, "game update loop must remain directly testable");

function autoLootHarness(saved) {
  const storage = new Map(saved === undefined ? [] : [["tutien.autoLoot.v1", saved]]);
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
    },
  });
  vm.runInContext(`${autoLootSource}\nglobalThis.__AutoLoot = AutoLoot;`, context, { filename: "auto-loot.js" });
  return { autoLoot: context.__AutoLoot, storage };
}

async function movementHarness() {
  const modulePath = pathToFileURL(path.join(root, "public", "js", "core", "movement-feedback.mjs")).href;
  const module = await import(modulePath);
  return module.MovementFeedback;
}

function worldHarness(tiles) {
  const context = vm.createContext({
    S: { tiles, mapW: tiles[0].length, mapH: tiles.length, player: null },
    CFG: { TS: 1, PLAYER_COLLISION_RADIUS: 0.45 },
  });
  vm.runInContext(`${worldSource}\nglobalThis.__World = World;`, context, { filename: "world.js" });
  return context.__World;
}

function renderHarness() {
  const calls = [];
  const context = vm.createContext({
    CFG: { TS: 1, DS: 3 },
    S: { cam: { x: 0, y: 0 }, mapW: 1000, mapH: 1000, tiles: [] },
    cW: 300,
    cH: 300,
    lerp(a, b, t) { return a + (b - a) * t; },
    VisualEffects: { arePersistentEffectsEnabled() { return context.__buffEffectsEnabled; } },
    ctx: {
      save() {}, restore() {}, beginPath() {}, stroke() {},
      ellipse(...args) { calls.push(args); },
      clearRect() {}, fillText() {},
    },
  });
  context.__buffEffectsEnabled = false;
  context.__calls = calls;
  vm.runInContext(`${renderSource}\nglobalThis.__Render = Render;`, context, { filename: "render.js" });
  context.__Render.__calls = calls;
  context.__Render.__context = context;
  return context.__Render;
}

function inputHarness(player) {
  const emitted = [];
  const context = vm.createContext({
    S: { player },
    World: {
      cancelPlayerMove(actor) { actor.targetMovePos = null; actor.movePath = []; },
    },
    Net: { emitMove(force) { emitted.push(force); } },
  });
  vm.runInContext(`${inputSource}\nglobalThis.__Input = Input;`, context, { filename: "input.js" });
  return { input: context.__Input, emitted };
}

async function gameplayHarness(tiles, player, { basicAttackRange = 24, tileSize = 1 } = {}) {
  const movementPath = pathToFileURL(path.join(root, "public", "js", "core", "movement-feedback.mjs")).href;
  const movement = (await import(movementPath)).MovementFeedback;
  const errors = [];
  const sentMoves = [];
  const attacks = [];
  const autoSkillAttempts = [];
  const canvas = { getBoundingClientRect() { return { left: 0, top: 0 }; } };
  const state = {
    player,
    tiles,
    mapW: tiles[0].length,
    mapH: tiles.length,
    portals: [],
    players: new Map(),
    monsters: [],
    groundItems: [],
    npcs: [],
    floatingTexts: [],
    combatFx: [],
    cam: { x: 0, y: 0 },
    target: null,
    autoFight: false,
    animT: 0,
    animF: 0,
    atkCd: 0,
    combatGcd: 0,
    mapCode: "movement-test",
  };
  const context = vm.createContext({
    S: state,
    MovementFeedback: movement,
    CFG: {
      TS: tileSize,
      DS: 1,
      PLAYER_COLLISION_RADIUS: 0.45,
      PLAYER_MOVE_SPEED: 44,
      BASIC_ATTACK_RANGE: basicAttackRange,
      INTERACTION_RANGE: 2,
      ATK_CD: 42,
      REGEN_HP: 0,
      REGEN_MP: 0,
    },
    document: { activeElement: null, getElementById(id) { return id === "game-canvas" ? canvas : null; } },
    canvas,
    Net: {
      _isOnline: true,
      emitMove(force) { sentMoves.push(Boolean(force)); },
      tickAutoLoot() {},
    },
    SkillSystem: {
      tickCooldowns() {},
      tryAutoSkill(target) { autoSkillAttempts.push(target?.id); return false; },
    },
    UI: { update() {}, log() {}, notify() {} },
    Shop: { open(npc) { opened.push({ type: "shop", id: npc.id }); } },
    Chest: { open(npc) { opened.push({ type: "chest", id: npc.id }); } },
    DialogUI: { open(npc) { opened.push({ type: "dialog", id: npc.id }); } },
    Monster: { update() {} },
    Combat: { attack(target) { attacks.push(target?.id); } },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    console: { error(...args) { errors.push(args); } },
  });
  const opened = [];
  vm.runInContext(`${inputSource}\n${worldSource}\n${updateSource}\nglobalThis.__Input = Input; globalThis.__World = World; globalThis.__update = update;`, context, { filename: "gameplay-movement.js" });
  return { state, input: context.__Input, world: context.__World, update: context.__update, sentMoves, attacks, autoSkillAttempts, errors, opened };
}

function netHarness(drops = []) {
  const sent = [];
  const context = vm.createContext({
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, removeItem() {} },
    S: { player: { px: 10, py: 10 }, groundItems: drops, combatPending: false },
    CFG: { TS: 1, PLAYER_COLLISION_RADIUS: 0.45 },
    API: { BASE: "http://game.test", PATHS: {} },
    UI: { log() {}, notify() {}, updateAutoLootToggle() {}, hideLoading() {} },
    setTimeout,
    clearTimeout,
    console: { warn() {}, error() {}, log() {} },
  });
  vm.runInContext(`${autoLootSource}\n${netSource}\nglobalThis.__Net = Net; globalThis.__setSocket = (value) => { socket = value; };`, context, { filename: "net.js" });
  context.__setSocket({
    connected: true,
    emit(event, envelope, ack) {
      sent.push({ event, ...envelope });
      ack({ ok: true, result: { accepted: true } });
    },
  });
  context.__Net._isOnline = true;
  return { net: context.__Net, sent };
}

function localMockLootHarness() {
  const events = [];
  const notifications = [];
  const inventory = [];
  const state = {
    player: { px: 5.5, py: 5.5, xu: 0 },
    groundItems: [],
    inventory,
    combatPending: false,
  };
  const context = vm.createContext({
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, removeItem() {} },
    S: state,
    CFG: { TS: 1 },
    API: { BASE: "http://game.test", PATHS: { player: { update: (id) => `/api/player/${id}` } } },
    MockBackend: { enabled: true, async recordQuestEvent(type, details) { events.push({ type, details }); } },
    Inventory: { add(item) { inventory.push({ ...item, count: 1 }); return true; } },
    UI: {
      notify(message, type) { notifications.push({ message, type }); },
      pushLoot() {}, update() {}, log() {}, updateAutoLootToggle() {},
    },
    randInt(min) { return min; },
    Date,
    console: { warn() {}, error() {}, log() {} },
  });
  vm.runInContext(`${autoLootSource}\n${netSource}\n${combatSource}\nglobalThis.__Net = Net; globalThis.__Combat = Combat;`, context, { filename: "local-mock-loot.js" });
  return { state, net: context.__Net, combat: context.__Combat, events, notifications };
}

function monsterPathHarness(tiles) {
  const context = vm.createContext({
    S: { tiles, mapW: tiles[0].length, mapH: tiles.length },
    CFG: { TS: 1, PLAYER_COLLISION_RADIUS: 0.45 },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    randInt(min) { return min; },
  });
  vm.runInContext(`${worldSource}\n${monsterSource}\nglobalThis.__World = World; globalThis.__Monster = Monster;`, context, { filename: "monster-path-client.js" });
  return { world: context.__World, monster: context.__Monster };
}

function skillHarness() {
  const context = vm.createContext({});
  vm.runInContext(`${skillsSource}\nglobalThis.__SkillSystem = SkillSystem;`, context, { filename: "skills.js" });
  return context.__SkillSystem;
}

function skillBookHarness(book) {
  const notifications = [];
  const context = vm.createContext({
    S: { player: { id: 1, linhCan: "THO", skills: [{ id: "THO_GIAP" }] } },
    Net: { async get() { return book; } },
    API: { PATHS: { data: { skillCatalog: "/api/skills/catalog" } } },
    UI: { notify(message, type) { notifications.push({ message, type }); } },
    console: { warn() {} },
  });
  vm.runInContext(`${skillsSource}\nglobalThis.__SkillSystem = SkillSystem;`, context, { filename: "skills.js" });
  context.__SkillSystem.renderSkillBook = () => {};
  return { skills: context.__SkillSystem, notifications };
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.isConnected = true;
    this.parentElement = null;
    const classes = new Set();
    this.classList = {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name); else classes.delete(name);
        return enabled;
      },
    };
  }

  appendChild(child) {
    child.parentElement = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    }
    this.isConnected = false;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  get firstElementChild() { return this.children[0] || null; }
  get scrollHeight() { return this.children.length; }
}

function uiHarness() {
  const elements = new Map([
    ["game-notifications", new FakeElement("game-notifications")],
    ["log-area", new FakeElement("log-area")],
    ["btn-auto-loot", new FakeElement("btn-auto-loot")],
    ["auto-loot-state", new FakeElement("auto-loot-state")],
    ["screen-game", new FakeElement("screen-game")],
    ["btn-hud-layout", new FakeElement("btn-hud-layout")],
  ]);
  const hudPreferences = new Map();
  let buffEffectsEnabled = false;
  const visualEffects = {
    arePersistentEffectsEnabled() { return buffEffectsEnabled; },
    setPersistentEffectsEnabled(value) { buffEffectsEnabled = Boolean(value); return buffEffectsEnabled; },
  };
  let nextTimer = 1;
  const context = vm.createContext({
    VisualEffects: visualEffects,
    localStorage: {
      getItem(key) { return hudPreferences.has(key) ? hudPreferences.get(key) : null; },
      setItem(key, value) { hudPreferences.set(key, String(value)); },
    },
    window: { matchMedia: () => ({ matches: true }) },
    document: {
      getElementById(id) { return elements.get(id) || null; },
      createElement(tag) { return new FakeElement(tag); },
    },
    setTimeout() { return nextTimer++; },
    clearTimeout() {},
    Date,
    console,
  });
  vm.runInContext(`${uiSource}\nglobalThis.__UI = UI;`, context, { filename: "ui.js" });
  return { ui: context.__UI, elements, visualEffects, hudPreferences };
}

test("auto-pickup defaults on and persists the user toggle", () => {
  const { autoLoot, storage } = autoLootHarness();
  assert.equal(autoLoot.isEnabled(), true);
  assert.equal(autoLoot.setEnabled(false), false);
  assert.equal(storage.get("tutien.autoLoot.v1"), "false");
  assert.equal(autoLoot.setEnabled(true), true);
  assert.equal(storage.get("tutien.autoLoot.v1"), "true");
  assert.equal(autoLootHarness("false").autoLoot.isEnabled(), false);
});

test("persistent buff visuals default visible and remember the player's choice", () => {
  const storage = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
  });
  vm.runInContext(`${visualEffectsSource}\nglobalThis.__VisualEffects = VisualEffects;`, context);
  assert.equal(context.__VisualEffects.arePersistentEffectsEnabled(), true);
  assert.equal(context.__VisualEffects.setPersistentEffectsEnabled(true), true);
  assert.equal(storage.get("tutien.persistentEffects.v3"), "true");
  assert.equal(context.__VisualEffects.setPersistentEffectsEnabled(false), false);
  assert.equal(storage.get("tutien.persistentEffects.v3"), "false");
});

test("auto-pickup selects only nearby drops, nearest first, and stops when disabled", () => {
  const { autoLoot } = autoLootHarness();
  const drops = [
    { id: "far", x: 32, y: 10 },
    { id: "nearer", x: 12, y: 10 },
    { id: "nearest", x: 10, y: 10 },
  ];
  const result = autoLoot.nearby(drops, { px: 10, py: 10 }, { radius: 22, tileSize: 1 });
  assert.deepEqual(Array.from(result, (drop) => drop.id), ["nearest", "nearer"]);
  autoLoot.setEnabled(false);
  assert.deepEqual(Array.from(autoLoot.nearby(drops, { px: 10, py: 10 })), []);
});

test("pickup claims prevent duplicate commands and allow a bounded retry", () => {
  const { autoLoot } = autoLootHarness();
  assert.equal(autoLoot.claim("drop-1", 1000), true);
  assert.equal(autoLoot.claim("drop-1", 1100), false);
  autoLoot.settle("drop-1", 5000, 1000);
  assert.equal(autoLoot.claim("drop-1", 5999), false);
  assert.equal(autoLoot.claim("drop-1", 6000), true);
  autoLoot.complete("drop-1");
  assert.equal(autoLoot.claim("drop-1", 6001), true);
});

test("online auto-pickup sends one authoritative command for the nearest eligible drop", async () => {
  const { net, sent } = netHarness([
    { id: "near", x: 10, y: 10 },
    { id: "far", x: 80, y: 10 },
  ]);
  await net.tickAutoLoot(320);
  await net.tickAutoLoot(320);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "loot.pickup");
  assert.equal(sent[0].payload.itemId, "near");
});

test("mock combat spawns catalog drops and auto-pickup grants item and currency locally", async () => {
  const game = localMockLootHarness();
  game.combat.dropLoot({
    id: "wolf-1",
    px: 5.5,
    py: 5.5,
    moneyDropChance: 1,
    moneyDropFrom: 4,
    moneyDropTo: 4,
    dropTable: [{ item: { id: "STONE_LINH_NHO", name: "Linh thạch nhỏ" }, chance: 1, min: 1, max: 1 }],
  });

  assert.equal(game.state.groundItems.length, 2);
  assert.ok(game.events.some((event) => event.type === "monster_kill"));
  await game.net.tickAutoLoot(320);
  assert.equal(game.state.groundItems.length, 1);
  await game.net.tickAutoLoot(320);
  assert.equal(game.state.inventory[0].id, "STONE_LINH_NHO");
  assert.equal(game.state.groundItems.length, 0);
  assert.equal(game.state.player.xu, 4);
  assert.ok(game.events.some((event) => event.type === "collect_item"));
});

test("local monsters path around a river and throttle unreachable path retries", () => {
  const tiles = Array.from({ length: 9 }, () => Array(10).fill(0));
  for (let y = 1; y < 7; y += 1) tiles[y][5] = 2;
  const game = monsterPathHarness(tiles);
  const monster = { px: 2.5, py: 4.5 };
  const waypoint = game.monster._pathTarget(monster, 8, 4, "player", 1000);
  assert.ok(waypoint);
  const route = game.world.findPath(2, 4, 8, 4);
  assert.ok(route.waypoints.some((point) => point.y !== 4), "the route should go around the water wall");
  let previous = { x: 2, y: 4 };
  for (const point of route.waypoints) {
    assert.ok(game.world.hasClearPath(previous.x, previous.y, point.x, point.y));
    previous = point;
  }

  const blockedTiles = Array.from({ length: 7 }, () => Array(8).fill(0));
  for (let y = 0; y < blockedTiles.length; y += 1) blockedTiles[y][4] = 2;
  const blocked = monsterPathHarness(blockedTiles);
  let pathCalls = 0;
  const findPath = blocked.world.findPath.bind(blocked.world);
  blocked.world.findPath = (...args) => { pathCalls += 1; return findPath(...args); };
  const stuck = { px: 2.5, py: 3.5 };
  assert.equal(blocked.monster._pathTarget(stuck, 6, 3, "player", 1000), null);
  assert.equal(blocked.monster._pathTarget(stuck, 6, 3, "player", 1200), null);
  assert.equal(pathCalls, 1);
  blocked.monster._pathTarget(stuck, 6, 3, "player", 1500);
  assert.equal(pathCalls, 2);
});

test("skill cast animation distinguishes physical strikes and magic or support skills", () => {
  const skills = skillHarness();
  assert.equal(skills.animationDuration({ satThuong: 1, damageType: "PHYS" }), 620);
  assert.equal(skills.animationDuration({ satThuong: 1, damageType: "MAGIC" }), 760);
  assert.equal(skills.animationDuration({ satThuong: 0, damageType: "MAGIC" }), 760);
});

test("basic attacks stamp the start time so the attack sprite advances", () => {
  const player = { px: 10, py: 10 };
  const context = vm.createContext({
    S: { player, atkCd: 0, combatGcd: 0, combatPending: false, mapCode: "demo" },
    CFG: { BASIC_ATTACK_RANGE: 3, TS: 1, ATTACK_RANGE_PADDING: 0 },
    dist() { return 0; },
    socket: { connected: true },
    Net: { command() {} },
    Date,
  });
  vm.runInContext(`${combatSource}\nglobalThis.__Combat = Combat;`, context, { filename: "combat.js" });
  context.__Combat.attack({ id: "monster-1", px: 10, py: 10, dead: false });
  assert.ok(Number.isFinite(player.animStartedAt));
  assert.equal(player.animState, "attack");
  assert.equal(player.animUntil - player.animStartedAt, 360);
});

test("offline monster damage stamps the hurt animation start", () => {
  assert.match(monsterSource, /p\.animStartedAt = Date\.now\(\);\s*p\.hitUntil = p\.animStartedAt \+ 220;\s*p\.animState = "hurt";\s*p\.animUntil = p\.animStartedAt \+ 260;/);
});

test("skill book drops stale, foreign-root, and passive codes from active slots", async () => {
  const { skills, notifications } = skillBookHarness({
    skills: [
      { code: "COMMON_TRAIN", linhCan: "COMMON", category: "ACTIVE" },
      { code: "THO_GIAP", linhCan: "THO", category: "ACTIVE" },
      { code: "THO_PASSIVE", linhCan: "THO", category: "PASSIVE" },
      { code: "KIM_OLD", linhCan: "KIM", category: "ACTIVE" },
    ],
    learnedSkills: ["COMMON_TRAIN", "THO_GIAP", "THO_PASSIVE", "KIM_OLD"],
    equippedSkills: ["COMMON_TRAIN", "THO_GIAP", "THO_PASSIVE", "KIM_OLD", "REMOVED_SKILL"],
  });
  await skills.loadBook();
  assert.deepEqual(Array.from(skills._selected), ["COMMON_TRAIN", "THO_GIAP"]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "warning");
  assert.match(notifications[0].message, /không còn phù hợp linh căn/);
});

test("game shell exposes auto-pickup control and loads the movement and loot helpers", () => {
  assert.match(gameHtml, /id="btn-auto-loot"[^>]+aria-pressed="true"/);
  assert.match(gameHtml, /id="btn-buff-effects"[^>]+aria-pressed="true"/);
  assert.match(gameHtml, /id="btn-hud-layout"[^>]+aria-expanded="true"/);
  assert.match(gameHtml, /id="game-notifications"[^>]+aria-live="polite"/);
  assert.match(gameBootstrap, /js\/auto-loot\.js/);
  assert.match(gameBootstrap, /js\/visual-effects\.js\?v=2/);
  assert.match(gameBootstrap, /movement-feedback\.mjs/);
});

test("movement correction stays visually continuous and converges to server position", async () => {
  const movement = await movementHarness();
  const player = { x: 10, y: 20, px: 14, py: 20, targetMovePos: { x: 30, y: 20 } };
  assert.equal(movement.reconcile(player, 11, 20, 1, 1000), true);
  assert.equal(player.x, 11);
  assert.equal(player.px, 14);
  assert.equal(player.targetMovePos, null);
  assert.equal(player.lastEmitX, 11);
  movement.apply(player, 1, 1090);
  assert.ok(player.px > 11.5 && player.px < 14);
  movement.apply(player, 1, 1180);
  assert.equal(player.px, 11.5);
  assert.equal(player.py, 20.5);
  assert.equal(player.visualCorrection, null);
});

test("large position corrections snap safely instead of blending across the map", async () => {
  const movement = await movementHarness();
  const player = { x: 0, y: 0, px: 400, py: 400 };
  movement.reconcile(player, 4, 5, 1, 1000);
  assert.equal(player.visualCorrection, null);
  assert.equal(player.px, 4.5);
  assert.equal(player.py, 5.5);
});

test("keyboard direction cancels opposing keys and keeps diagonal input explicit", () => {
  const world = worldHarness([[0, 0], [0, 0]]);
  const diagonal = world.movementVector({ KeyW: true, KeyD: true });
  assert.equal(diagonal.dx, 1);
  assert.equal(diagonal.dy, -1);
  assert.equal(diagonal.active, true);
  const cancelled = world.movementVector({ KeyA: true, KeyD: true });
  assert.equal(cancelled.dx, 0);
  assert.equal(cancelled.active, true);
});

test("click-to-move routes around water and each smoothed segment is collision-safe", () => {
  const tiles = Array.from({ length: 8 }, () => Array(9).fill(0));
  for (let y = 0; y < 7; y += 1) tiles[y][4] = 2;
  const world = worldHarness(tiles);
  const route = world.findPath(2, 3, 6, 3);
  assert.ok(route);
  assert.equal(route.reachedTarget, true);
  assert.deepEqual(Array.from(route.waypoints, (point) => [point.x, point.y]).at(-1), [6, 3]);
  let from = { x: 2, y: 3 };
  for (const point of route.waypoints) {
    assert.equal(world.hasClearPath(from.x, from.y, point.x, point.y), true);
    from = point;
  }
});

test("click navigation refuses diagonal corner cutting and bounds the final step", () => {
  const cornerWorld = worldHarness([[0, 2], [2, 0]]);
  assert.equal(cornerWorld.findPath(0, 0, 1, 1), null);

  const openWorld = worldHarness(Array.from({ length: 5 }, () => Array(5).fill(0)));
  const actor = { x: 2, y: 2 };
  const arrival = openWorld.moveTowards(actor, 2.25, 2, 1);
  assert.equal(arrival.reached, true);
  assert.ok(Math.abs(actor.x - 2.25) < 1e-8);
  const next = openWorld.moveTowards(actor, 4, 2, 0.25);
  assert.equal(next.reached, false);
  assert.ok(Math.abs(actor.x - 2.5) < 1e-8);
});

test("planned travel keeps making progress through a detour and settles at its destination", () => {
  const tiles = Array.from({ length: 8 }, () => Array(9).fill(0));
  for (let y = 0; y < 7; y += 1) tiles[y][4] = 2;
  const world = worldHarness(tiles);
  const route = world.findPath(2, 3, 6, 3);
  const actor = { x: 2, y: 3 };
  let steps = 0;
  for (const waypoint of route.waypoints) {
    while (Math.hypot(waypoint.x - actor.x, waypoint.y - actor.y) >= 0.6 && steps < 2000) {
      const result = world.moveTowards(actor, waypoint.x, waypoint.y, 44 / 60);
      assert.ok(result.moved > 0, "planned route stalled at a collision");
      assert.equal(world.collides(actor.x, actor.y), false);
      steps += 1;
    }
    assert.ok(Math.hypot(waypoint.x - actor.x, waypoint.y - actor.y) < 0.6);
  }
  assert.ok(Math.hypot(route.destination.x - actor.x, route.destination.y - actor.y) < 0.6);
});

test("game loop keeps keyboard travel frame-rate independent and diagonal speed normalized", async () => {
  for (const hz of [30, 60, 120]) {
    const tiles = Array.from({ length: 120 }, () => Array(120).fill(0));
    const player = { x: 10, y: 10, px: 10.5, py: 10.5, stats: { agi: 0 }, buffs: {}, movePath: [], lastEmitX: 10, lastEmitY: 10 };
    const game = await gameplayHarness(tiles, player);
    game.input.keys.KeyD = true;
    for (let frame = 0; frame < hz; frame += 1) game.update(1000 / hz);
    assert.ok(Math.abs(player.x - 54) < 0.1, `${hz} Hz horizontal travel drifted`);
    assert.ok(Math.abs(player.y - 10) < 0.1);
    assert.equal(player.isMoving, true);
    assert.ok(Math.abs(player.walkDistance - 44) < 0.1);
    assert.deepEqual(game.errors, []);
  }

  const tiles = Array.from({ length: 120 }, () => Array(120).fill(0));
  const player = { x: 60, y: 60, px: 60.5, py: 60.5, stats: { agi: 0 }, buffs: {}, movePath: [], lastEmitX: 60, lastEmitY: 60 };
  const game = await gameplayHarness(tiles, player);
  game.input.keys.KeyD = true;
  game.input.keys.KeyW = true;
  for (let frame = 0; frame < 60; frame += 1) game.update(1000 / 60);
  assert.ok(Math.abs(Math.hypot(player.x - 60, player.y - 60) - 44) < 0.1);
  assert.ok(Math.abs(player.x - 60 - (44 / Math.SQRT2)) < 0.1);
  assert.ok(Math.abs(60 - player.y - (44 / Math.SQRT2)) < 0.1);
});

test("game loop stores walked distance in canvas pixels for sprite gait", async () => {
  const tiles = Array.from({ length: 120 }, () => Array(120).fill(0));
  const player = { x: 10, y: 10, px: 10.5, py: 10.5, stats: { agi: 0 }, buffs: {}, movePath: [], lastEmitX: 10, lastEmitY: 10 };
  const game = await gameplayHarness(tiles, player, { tileSize: 32 });
  game.input.keys.KeyD = true;
  for (let frame = 0; frame < 60; frame += 1) game.update(1000 / 60);

  assert.ok(Math.abs(player.x - 54) < 0.1);
  assert.ok(Math.abs(player.walkDistance - 44 * 32) < 0.1);
});

test("game loop follows a planned detour to the click destination without overshooting", async () => {
  const tiles = Array.from({ length: 8 }, () => Array(9).fill(0));
  for (let y = 0; y < 7; y += 1) tiles[y][4] = 2;
  const player = { x: 2, y: 3, px: 2.5, py: 3.5, stats: { agi: 0 }, buffs: {}, movePath: [], lastEmitX: 2, lastEmitY: 3 };
  const game = await gameplayHarness(tiles, player);
  assert.equal(game.world.planPlayerMove(player, 6, 3), true);
  for (let frame = 0; frame < 300 && player.targetMovePos; frame += 1) game.update(1000 / 60);
  assert.equal(player.targetMovePos, null);
  assert.ok(Math.abs(player.x - 6) < 0.6);
  assert.ok(Math.abs(player.y - 3) < 0.6);
  assert.deepEqual(game.errors, []);
});

test("click-to-interact approaches a distant NPC by a collision-safe route before opening it", async () => {
  const tiles = Array.from({ length: 8 }, () => Array(9).fill(0));
  for (let y = 0; y < 7; y += 1) tiles[y][4] = 2;
  const player = { x: 2, y: 3, px: 2.5, py: 3.5, stats: { agi: 0 }, buffs: {}, movePath: [], lastEmitX: 2, lastEmitY: 3 };
  const game = await gameplayHarness(tiles, player);
  const npc = { id: "shop-1", x: 6, y: 3, px: 6.5, py: 3.5, type: "shop" };
  game.state.npcs.push(npc);

  assert.equal(game.world.approachNpc(npc), true);
  assert.deepEqual(game.opened, []);
  for (let frame = 0; frame < 300 && game.world.pendingNpcId !== null; frame += 1) game.update(1000 / 60);

  assert.deepEqual(game.opened, [{ type: "shop", id: "shop-1" }]);
  assert.equal(game.world.pendingNpcId, null);
  assert.ok(Math.hypot(player.px - npc.px, player.py - npc.py) < 2);
  assert.deepEqual(game.errors, []);
});

test("combat approach follows an A-star detour around water and stops in attack range", async () => {
  const tiles = Array.from({ length: 8 }, () => Array(9).fill(0));
  for (let y = 0; y < 7; y += 1) tiles[y][4] = 2;
  const player = { x: 2, y: 3, px: 2.5, py: 3.5, stats: { agi: 0 }, buffs: {}, movePath: [], lastEmitX: 2, lastEmitY: 3, combatMove: true };
  const game = await gameplayHarness(tiles, player, { basicAttackRange: 3 });
  const target = { id: "monster-1", x: 6, y: 3, px: 6.5, py: 3.5, dead: false };
  game.state.target = target;
  game.state.monsters.push(target);

  for (let frame = 0; frame < 300; frame += 1) {
    game.update(1000 / 60);
    assert.equal(game.world.collides(player.x, player.y), false);
    if (Math.hypot(player.px - target.px, player.py - target.py) <= 3 * 0.86) break;
  }

  assert.ok(Math.hypot(player.px - target.px, player.py - target.py) <= 3 * 0.86);
  assert.deepEqual(game.attacks, [], "approaching by target lock must not attack while Auto Fight is off");
  assert.deepEqual(game.errors, []);
});

test("clicking a nearby monster only locks the target while Auto Fight is off", async () => {
  const tiles = Array.from({ length: 8 }, () => Array(8).fill(0));
  const player = { x: 2, y: 2, px: 2.5, py: 2.5, stats: { agi: 0 }, buffs: {}, movePath: [] };
  const game = await gameplayHarness(tiles, player, { basicAttackRange: 3 });
  const target = { id: "monster-1", x: 4, y: 2, px: 4.5, py: 2.5, dead: false };
  game.state.monsters.push(target);

  game.input.onClick({ clientX: target.px, clientY: target.py });

  assert.equal(game.state.target, target);
  assert.equal(game.state.autoFight, false);
  assert.deepEqual(game.attacks, []);
});

test("Auto Fight enables automatic basic attacks, while Space remains a manual attack", async () => {
  const tiles = Array.from({ length: 8 }, () => Array(8).fill(0));
  const makeGame = async () => {
    const player = { x: 2, y: 2, px: 2.5, py: 2.5, stats: { agi: 0 }, buffs: {}, movePath: [] };
    const game = await gameplayHarness(tiles, player, { basicAttackRange: 3 });
    const target = { id: "monster-1", x: 4, y: 2, px: 4.5, py: 2.5, dead: false };
    game.state.target = target;
    game.state.monsters.push(target);
    return game;
  };

  const autoGame = await makeGame();
  autoGame.state.autoFight = true;
  autoGame.update(1000 / 60);
  assert.deepEqual(autoGame.attacks, ["monster-1"]);
  assert.deepEqual(autoGame.autoSkillAttempts, ["monster-1"]);

  const manualGame = await makeGame();
  manualGame.input.keys.Space = true;
  manualGame.update(1000 / 60);
  assert.deepEqual(manualGame.attacks, ["monster-1"]);
  assert.deepEqual(manualGame.autoSkillAttempts, []);
});

test("losing focus clears held keys and pending click movement", () => {
  const player = { isMoving: true, targetMovePos: { x: 8, y: 8 }, movePath: [{ x: 5, y: 5 }], combatMove: true };
  const { input, emitted } = inputHarness(player);
  input.keys.KeyD = true;
  assert.equal(input.hasActiveKeys(), true);
  input.stopMovement();
  assert.equal(input.hasActiveKeys(), false);
  assert.equal(player.isMoving, false);
  assert.equal(player.targetMovePos, null);
  assert.deepEqual(Array.from(player.movePath), []);
  assert.equal(player.combatMove, false);
  assert.deepEqual(Array.from(emitted), [true]);
});

test("walk sprite frames follow traveled distance rather than wall-clock phase", () => {
  const render = renderHarness();
  assert.equal(render.walkFrame({ walkDistance: 0 }), 0);
  assert.equal(render.walkFrame({ walkDistance: 13 }), 1);
  assert.equal(render.walkFrame({ walkDistance: 26 }), 2);
  assert.equal(render.walkFrame({ walkDistance: 52 }), 0);
});

test("render camera follows the same interpolated player position as the sprite", () => {
  const render = renderHarness();
  const position = render.interpolatePlayerPosition({ previousPx: 90, previousPy: 80, px: 100, py: 100 }, 0.5);
  assert.equal(position.x, 95);
  assert.equal(position.y, 90);

  render.__context.S.player = { previousPx: 90, previousPy: 80, px: 100, py: 100 };
  render.frame(80, 0.5, 100);
  const expectedCameraX = (95 - 50) * (1 - Math.exp(-1));
  assert.ok(Math.abs(render.__context.S.cam.x - expectedCameraX) < 1e-8);
});

test("persistent buff visuals stay hidden by default and, when enabled, stay at the feet", () => {
  const render = renderHarness();
  const actor = { buffs: { shield: { expiresAt: Date.now() + 5000 }, buff_atk: { expiresAt: Date.now() + 5000 }, buff_spd: { expiresAt: Date.now() + 5000 } } };
  render.drawBuffEffects(12, 20, actor, 14, 18);
  assert.equal(render.__calls.length, 0);

  render.__context.__buffEffectsEnabled = true;
  render.drawBuffEffects(12, 20, actor, 14, 18);
  assert.equal(render.__calls.length, 3);
  assert.ok(render.__calls.every(([, y, , ry]) => Math.abs(y - 21.2) < 1e-9 && ry <= 2.8));
});

test("system feedback uses the visible toast lane while chat stays in chat", () => {
  const { ui, elements } = uiHarness();
  ui.log("Đứng gần vật phẩm để nhặt", "system");
  ui.log("[Tôi]: xin chào", "chat");
  assert.equal(elements.get("game-notifications").children.length, 1);
  assert.match(elements.get("game-notifications").children[0].textContent, /Đứng gần vật phẩm/);
  assert.equal(elements.get("log-area").children.length, 1);
  assert.match(elements.get("log-area").children[0].textContent, /xin chào/);
});

test("notifications deduplicate, cap at three, and render messages as text", () => {
  const { ui, elements } = uiHarness();
  const host = elements.get("game-notifications");
  ui.notify("<img src=x>", "error");
  ui.notify("<img src=x>", "error");
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0].textContent, "<img src=x>");
  for (let i = 0; i < 5; i += 1) ui.notify(`Thông báo ${i}`, "info");
  assert.equal(host.children.length, 3);
});

test("auto-loot toggle exposes its current state to assistive technology", () => {
  const { ui, elements } = uiHarness();
  ui.updateAutoLootToggle(false);
  assert.equal(elements.get("btn-auto-loot").getAttribute("aria-pressed"), "false");
  assert.equal(elements.get("btn-auto-loot").getAttribute("aria-label"), "Tự nhặt vật phẩm gần: đang tắt");
  assert.equal(elements.get("auto-loot-state").textContent, "Nhặt: TẮT");
});

test("buff-effect toggle exposes hidden and visible state to the HUD", () => {
  const { ui, elements, visualEffects } = uiHarness();
  const button = new FakeElement("btn-buff-effects");
  const state = new FakeElement("buff-effects-state");
  elements.set("btn-buff-effects", button);
  elements.set("buff-effects-state", state);
  ui.initializeBuffEffectsToggle();
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(button.getAttribute("aria-label"), "Hiệu ứng duy trì quanh nhân vật: đang ẩn");
  assert.equal(state.textContent, "FX: ẨN");
  assert.equal(ui.toggleBuffEffects(), true);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("aria-label"), "Hiệu ứng duy trì quanh nhân vật: đang hiện");
  assert.equal(state.textContent, "FX: HIỆN");
  assert.equal(ui.toggleBuffEffects(), false);
  assert.equal(visualEffects.arePersistentEffectsEnabled(), false);
  assert.equal(button.getAttribute("aria-pressed"), "false");
});

test("short landscape starts with compact HUD and the toggle restores all panels", () => {
  const { ui, elements, hudPreferences } = uiHarness();
  const screen = elements.get("screen-game");
  const button = elements.get("btn-hud-layout");

  assert.equal(ui.initializeHudLayout(), true);
  assert.equal(screen.classList.contains("hud-compact"), true);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(button.textContent, "HUD +");
  assert.equal(ui.toggleHudLayout(), false);
  assert.equal(screen.classList.contains("hud-compact"), false);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(hudPreferences.get("tutien.hud-layout.v1"), "expanded");
});
