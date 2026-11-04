"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const autoLootSource = fs.readFileSync(path.join(root, "public", "js", "auto-loot.js"), "utf8");
const movementSource = fs.readFileSync(path.join(root, "public", "js", "movement-feedback.js"), "utf8");
const netSource = fs.readFileSync(path.join(root, "public", "js", "net.js"), "utf8");
const skillsSource = fs.readFileSync(path.join(root, "public", "js", "skills.js"), "utf8");
const combatSource = fs.readFileSync(path.join(root, "public", "js", "combat.js"), "utf8");
const monsterSource = fs.readFileSync(path.join(root, "public", "js", "monster.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "public", "js", "ui.js"), "utf8");
const gameHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

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

function movementHarness() {
  const context = vm.createContext({ CFG: { TS: 1 } });
  vm.runInContext(`${movementSource}\nglobalThis.__MovementFeedback = MovementFeedback;`, context, { filename: "movement-feedback.js" });
  return context.__MovementFeedback;
}

function netHarness(drops = []) {
  const sent = [];
  const context = vm.createContext({
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, removeItem() {} },
    S: { player: { px: 10, py: 10 }, groundItems: drops, combatPending: false },
    CFG: { TS: 1 },
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
  ]);
  let nextTimer = 1;
  const context = vm.createContext({
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
  return { ui: context.__UI, elements };
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
  assert.match(gameHtml, /id="game-notifications"[^>]+aria-live="polite"/);
  assert.match(gameHtml, /js\/auto-loot\.js/);
  assert.match(gameHtml, /js\/movement-feedback\.js/);
});

test("movement correction stays visually continuous and converges to server position", () => {
  const movement = movementHarness();
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

test("large position corrections snap safely instead of blending across the map", () => {
  const movement = movementHarness();
  const player = { x: 0, y: 0, px: 400, py: 400 };
  movement.reconcile(player, 4, 5, 1, 1000);
  assert.equal(player.visualCorrection, null);
  assert.equal(player.px, 4.5);
  assert.equal(player.py, 5.5);
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
