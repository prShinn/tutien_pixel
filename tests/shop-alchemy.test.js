"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const apiSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "api.js"), "utf8");
const gamedataSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "gamedata.js"), "utf8");
const shopSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "shop.js"), "utf8");
const alchemySource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "alchemy.js"), "utf8");
const cultivationSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "cultivation.js"), "utf8");
const uiSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "ui.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "bootstrap.js"), "utf8");

function makeElement(tag = "div") {
  const classes = new Set();
  const attrs = new Map();
  let htmlValue = "";
  const el = {
    tagName: tag.toUpperCase(),
    className: "",
    textContent: "",
    get innerHTML() { return htmlValue; },
    set innerHTML(v) {
      htmlValue = String(v || "");
      this.children = [];
    },
    hidden: false,
    disabled: false,
    value: "1",
    dataset: {},
    style: {},
    children: [],
    add(...nodes) {},
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k); },
    append(...nodes) {
      for (const n of nodes) if (n && typeof n === "object") this.children.push(n);
    },
    appendChild(n) {
      if (n && typeof n === "object") this.children.push(n);
      return n;
    },
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    },
    querySelectorAll() { return []; },
    focus() {},
  };
  delete el.add;
  el.classList = {
    add: (c) => classes.add(c),
    remove: (c) => classes.delete(c),
    toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
    contains: (c) => classes.has(c),
  };
  return el;
}

function makeFakeDocument(extraIds = []) {
  const byId = new Map();
  for (const id of extraIds) {
    const el = makeElement("div");
    el.id = id;
    byId.set(id, el);
  }
  return {
    createElement: (tag) => makeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    createDocumentFragment: () => makeElement("fragment"),
    getElementById: (id) => byId.get(id) || null,
    _elements: byId,
  };
}

test("API alchemy routes, bootstrap script loading, and index.html modals are registered", () => {
  const ctx = vm.createContext({ URL, window: { TuTienConfig: { dataMode: "real", apiBase: "http://localhost:3800" }, location: { origin: "http://game.test" } } });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, ctx);
  assert.equal(ctx.__API.PATHS.alchemy.recipes, "/api/alchemy/recipes");
  assert.equal(ctx.__API.PATHS.alchemy.history, "/api/alchemy/history");
  assert.equal(ctx.__API.PATHS.alchemy.brew, "/api/player/alchemy/brew");

  assert.match(bootstrapSource, /js\/alchemy\.js\?v=\d+/);
  for (const id of ["alchemy-modal", "breakthrough-modal", "shop-tabs", "shop-alchemy-shortcut", "breakthrough-pill-list"]) {
    assert.ok(indexHtml.includes(`id="${id}"`), `Missing DOM element #${id} in index.html`);
  }
});

test("GameData.normalizeItem and UI.itemFacts surface pill qualityLabel & breakthroughRate", () => {
  const doc = makeFakeDocument();
  const ctx = vm.createContext({
    document: doc,
    window: {},
    CFG: { ITEMS: {}, SHOP_SELL: [], REALMS: [{ stt: 1, tenCanhGioi: "Luyện Thể" }] },
    S: { player: { equipment: {} } },
    Combat: { getRole: () => ({ name: "Tu sĩ", color: "#fff" }) },
    Net: {},
    console,
  });
  vm.runInContext(`${gamedataSource}\n${uiSource}\nglobalThis.__GD = GameData; globalThis.__UI = UI;`, ctx);

  const normalized = ctx.__GD.normalizeItem({
    id: "DAN_PHI_THANG_CUC",
    name: "Đan Phi Thăng (Cực phẩm)",
    loai: "BREAKTHROUGH_PILL",
    pillGroup: "DAN_PHI_THANG",
    quality: "CUC_PHAM",
    qualityTier: 4,
    qualityLabel: "Cực phẩm",
    breakthroughRate: 1.0,
    shopCategory: "ALCHEMY",
    giaMua: 0,
    giaBan: 200,
  });
  assert.equal(normalized.qualityLabel, "Cực phẩm");
  assert.equal(normalized.breakthroughRate, 1.0);
  assert.equal(normalized.pillGroup, "DAN_PHI_THANG");
  assert.equal(normalized.shopCategory, "ALCHEMY");

  const facts = ctx.__UI.itemFacts(normalized);
  assert.ok(facts.rows.some((r) => r.label === "Tỷ lệ phá cảnh" && r.value === "100%"));
  assert.ok(facts.rows.some((r) => r.label === "Phẩm chất" && r.value === "Cực phẩm"));
});

test("Shop filters by NPC shopCategory, guards xu formatting, and handles failed buy safely", async () => {
  const doc = makeFakeDocument([
    "shop-modal", "shop-title", "shop-greeting", "shop-xu",
    "shop-buy-list", "shop-sell-list", "shop-alchemy-shortcut",
  ]);
  const logs = [];
  const notices = [];
  const items = {
    WEAPON_KIEM_GO: { id: "WEAPON_KIEM_GO", name: "Kiếm Gỗ", type: "EQUIPMENT", shopCategory: "EQUIPMENT", currency: "XU", giaMua: 40, giaBan: 12 },
    STONE_LINH_NHO: { id: "STONE_LINH_NHO", name: "Linh Thạch Nhỏ", type: "STONE", shopCategory: "ALCHEMY", currency: "XU", giaMua: 35, giaBan: 10 },
    POTION_TIEU_HOAN: { id: "POTION_TIEU_HOAN", name: "Tiểu Hoàn Đan", type: "POTION", shopCategory: "ALCHEMY", currency: "XU", giaMua: 25, giaBan: 8 },
  };
  const ctx = vm.createContext({
    document: doc,
    authToken: "jwt-123",
    API: { PATHS: { player: { buy: "/api/player/shop/buy", sell: "/api/player/shop/sell" } } },
    CFG: { ITEMS: items, SHOP_SELL: Object.keys(items) },
    S: { player: { xu: undefined }, inventory: [] },
    GameData: { itemWithCurrentDetails: (entry) => entry },
    UI: {
      createPixelIcon: () => makeElement("span"),
      itemEffectSummary: () => "",
      showTip() {}, moveTip() {}, hideTip() {}, buildInv() {}, update() {},
      log: (msg) => logs.push(msg),
      notify: (msg, type) => notices.push({ msg, type }),
    },
    Net: {
      async mutate() { throw new Error("Không đủ Xu"); },
      applyPlayerSnapshot() {},
    },
    console,
  });
  vm.runInContext(`${shopSource}\nglobalThis.__Shop = Shop;`, ctx);

  // Open Blacksmith (EQUIPMENT)
  ctx.__Shop.open({ id: "npc_tho_ren", name: "Thợ Rèn Thiết Trảm", type: "shop", role: "blacksmith", shopCategory: "EQUIPMENT" });
  assert.equal(doc.getElementById("shop-modal").classList.contains("open"), true);
  assert.equal(doc.getElementById("shop-xu").textContent, "0");
  assert.equal(doc.getElementById("shop-buy-list").children.length, 1);

  // Switch to Alchemist tab
  ctx.__Shop.setCategory("ALCHEMY");
  assert.equal(doc.getElementById("shop-buy-list").children.length, 2);

  // Buy failure triggers error notification without crashing
  await ctx.__Shop.buy("STONE_LINH_NHO", 2);
  assert.deepEqual(notices[0], { msg: "Không đủ Xu", type: "error" });
});

test("AlchemyUI loads recipes, brews mutated result via BE, and Cultivation handles breakthrough failure", async () => {
  const doc = makeFakeDocument([
    "alchemy-modal", "alchemy-xu", "alchemy-linhthach",
    "alchemy-recipes-view", "alchemy-history-view", "alchemy-recipe-list", "alchemy-recipe-detail",
  ]);
  const notices = [];
  const logs = [];
  const snapshots = [];
  const recipePayload = {
    ok: true,
    recipes: [
      {
        code: "RECIPE_DAN_PHI_THANG_HA",
        pillGroup: "DAN_PHI_THANG",
        category: "BREAKTHROUGH",
        quality: "HA_PHAM",
        qualityLabel: "Hạ phẩm",
        name: "Luyện Phi Thăng Đan (Hạ phẩm)",
        craftSuccessRate: 0.7,
        mutationChance: 0.05,
        requiredRealmStt: 1,
        costXu: 80,
        costLinhThach: 0,
        outputItemCode: "DAN_PHI_THANG",
        outputItem: { id: "DAN_PHI_THANG", name: "Đan Phi Thăng (Hạ phẩm)", breakthroughRate: 0.7 },
        upgradedItem: { id: "DAN_PHI_THANG_TRUNG", name: "Đan Phi Thăng (Trung phẩm)" },
        ingredients: [{ itemCode: "STONE_LINH_NHO", name: "Linh Thạch Nhỏ", quantity: 3, owned: 3, enough: true }],
      },
    ],
  };

  let btCalls = [];
  const ctx = vm.createContext({
    document: doc,
    authToken: "jwt-123",
    API: { PATHS: { alchemy: { recipes: "/api/alchemy/recipes", history: "/api/alchemy/history", brew: "/api/player/alchemy/brew" }, player: { breakthrough: "/api/player/cultivation/breakthrough" } } },
    CFG: {
      REALMS: [{ stt: 1, code: "LUYEN_THE", tenCanhGioi: "Luyện Thể" }],
      ITEMS: {
        DAN_PHI_THANG: { id: "DAN_PHI_THANG", name: "Đan Phi Thăng (Hạ phẩm)", pillGroup: "DAN_PHI_THANG", quality: "HA_PHAM", qualityTier: 1, breakthroughRate: 0.7 },
        DAN_PHI_THANG_CUC: { id: "DAN_PHI_THANG_CUC", name: "Đan Phi Thăng (Cực phẩm)", pillGroup: "DAN_PHI_THANG", quality: "CUC_PHAM", qualityTier: 4, qualityLabel: "Cực phẩm", breakthroughRate: 1.0 },
      },
    },
    GAME_BALANCE: { base: { hp: 100, mp: 50 }, stats: { vit: { maxHp: 12 }, ene: { maxMp: 8 } } },
    S: {
      player: {
        xu: 500, linhThach: 5, realm: 1, tangTuVi: 9, tuViHienTai: 2000, tuViLenCap: 1000,
        canhGioi: { stt: 1, tenCanhGioi: "Luyện Thể", soTang: 9, danPhaCanh: "DAN_PHI_THANG", tangTuVi: [] },
      },
      inventory: [
        { itemCode: "STONE_LINH_NHO", count: 5 },
        { itemCode: "DAN_PHI_THANG", count: 1 },
        { itemCode: "DAN_PHI_THANG_CUC", count: 1 },
      ],
    },
    GameData: {
      itemWithCurrentDetails: (entry) => ({ ...(ctx.CFG.ITEMS[entry.itemCode || entry.id] || {}), ...entry }),
    },
    UI: {
      notify: (msg, type) => notices.push({ msg, type }),
      log: (msg, kind) => logs.push({ msg, kind }),
      buildInv() {},
      update() {},
    },
    Net: {
      async get(url) { return url === "/api/alchemy/recipes" ? recipePayload : { ok: true, items: [] }; },
      async mutate(method, url, body) {
        if (url === "/api/alchemy/brew" || url === "/api/player/alchemy/brew") {
          return {
            player: { ...ctx.S.player, xu: 420 },
            result: { outcome: "MUTATED", success: true, mutated: true, recipeCode: body.recipeCode, outputItemCode: "DAN_PHI_THANG_TRUNG", outputItemName: "Đan Phi Thăng (Trung phẩm)" },
          };
        }
        btCalls.push(body);
        return {
          player: { ...ctx.S.player, tangTuVi: 8, xu: 350 },
          result: { type: "realm_breakthrough_failed", success: false, major: true, toStage: 8, xuLost: 150, linhThachLost: 1, breakthroughRate: 0.7 },
        };
      },
      applyPlayerSnapshot(p) {
        snapshots.push(p);
        ctx.S.player = { ...ctx.S.player, ...p };
      },
    },
    Sound: { play() {} },
    console,
  });
  vm.runInContext(`${alchemySource}\n${cultivationSource}\nglobalThis.__Alc = AlchemyUI; globalThis.__Cult = Cultivation;`, ctx);

  await ctx.__Alc.open("PHI_THANG");
  await ctx.__Alc.brewSelected();
  assert.equal(ctx.__Alc._lastResult.outcome, "MUTATED");
  assert.equal(notices.some((n) => n.type === "success" && n.msg.includes("Đột biến")), true);

  // Breakthrough picks highest quality pill first
  const owned = ctx.__Cult.getAvailableBreakthroughPills();
  assert.equal(owned[0].id, "DAN_PHI_THANG_CUC");

  // Breakthrough failure reports error notification (not success!)
  notices.length = 0;
  await ctx.__Cult.tryBreakthrough("DAN_PHI_THANG");
  assert.deepEqual(structuredClone(btCalls[0]), { pillCode: "DAN_PHI_THANG" });
  assert.equal(notices[0].type, "error");
  assert.match(notices[0].msg, /lùi về .* tầng 8/i);
});

test("XSS-safe DialogUI & toggleContinent (P1-7), AlchemyUI sync memoization & scroll preservation (P1-5), and Net.mutate 4xx/realm sync (P1-4, P2-4)", async () => {
  const netSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "net.js"), "utf8");
  const doc = makeFakeDocument([
    "dialog-npc-n", "dialog-text", "dialog-modal",
    "continent-modal", "continent-name", "continent-summary", "continent-regions",
    "alchemy-modal", "alchemy-xu", "alchemy-linhthach", "alchemy-recipes-view", "alchemy-history-view",
    "alchemy-recipe-list", "alchemy-recipe-detail",
  ]);

  let continentRenderHtmlCalled = false;
  const regionsEl = doc.getElementById("continent-regions");
  Object.defineProperty(regionsEl, "innerHTML", {
    get() { return ""; },
    set() { continentRenderHtmlCalled = true; },
  });

  const dialogTextEl = doc.getElementById("dialog-text");
  let dialogHtmlCalled = false;
  Object.defineProperty(dialogTextEl, "innerHTML", {
    get() { return ""; },
    set() { dialogHtmlCalled = true; },
  });

  const listEl = doc.getElementById("alchemy-recipe-list");
  listEl.scrollTop = 120;
  let listReplaceCount = 0;
  const origReplace = listEl.replaceChildren.bind(listEl);
  listEl.replaceChildren = (...nodes) => {
    listReplaceCount += 1;
    return origReplace(...nodes);
  };

  const sessionMap = new Map([["tu_tien_token", "jwt-test"]]);
  let nextReq = 0;
  let fetchMode = "CONFLICT_409";
  let socketHandlers = new Map();
  const sentIds = [];

  const ctx = vm.createContext({
    document: doc,
    window: {},
    setTimeout,
    clearTimeout,
    Headers,
    Response,
    crypto: { randomUUID: () => `req-test-${++nextReq}` },
    sessionStorage: {
      getItem: (k) => sessionMap.get(k) ?? null,
      setItem: (k, v) => sessionMap.set(k, String(v)),
      removeItem: (k) => sessionMap.delete(k),
    },
    AutoLoot: { isEnabled: () => false },
    fetch: async (_url, opts) => {
      const parsed = JSON.parse(opts.body);
      sentIds.push(parsed.requestId);
      if (fetchMode === "NETWORK_FAIL") throw new Error("ECONNRESET");
      if (fetchMode === "CONFLICT_409") {
        return new Response(JSON.stringify({ ok: false, error: "Conflict", code: "STATE_CONFLICT" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    io: () => ({
      connected: true,
      on(ev, fn) { socketHandlers.set(ev, fn); },
      emit() {},
    }),
    API: {
      BASE: "http://be.test",
      SOCKET_URL: "http://be.test",
      AUTO_SAVE_MS: 30000,
      PATHS: {
        auth: { refresh: "/api/auth/refresh", logout: "/api/auth/logout", login: "/api/auth/login", register: "/api/auth/register", demo: "/api/auth/demo" },
        worlds: { structure: "/api/worlds/structure" },
        alchemy: { recipes: "/api/alchemy/recipes", history: "/api/alchemy/history", brew: "/api/player/alchemy/brew" },
        player: { update: (id) => `/api/player/${id}` },
      },
    },
    CFG: { ITEMS: {}, SHOP_SELL: [], REALMS: [{ stt: 1, code: "LUYEN_THE", tenCanhGioi: "Luyện Thể" }] },
    GAME_BALANCE: { base: { hp: 100, mp: 50 }, stats: { vit: { maxHp: 12 }, ene: { maxMp: 8 } } },
    S: {
      player: {
        hp: 100, maxHp: 100, mp: 50, maxMp: 50, xu: 500, linhThach: 2,
        realm: 1, realmCode: "LUYEN_THE", realmStage: 9, tangTuVi: 9,
        canhGioi: { stt: 1, code: "LUYEN_THE", tenCanhGioi: "Luyện Thể" },
      },
      inventory: [{ itemCode: "STONE_LINH_NHO", count: 5 }],
      session: { user: null },
    },
    Combat: { getRole: () => ({ name: "Tu sĩ", color: "#fff" }) },
    GameData: { itemWithCurrentDetails: (entry) => ({ ...entry }) },
    UI_Extra: {},
    console,
  });
  // Reuse minimal UI.notify/update stubs while testing real DialogUI, toggleContinent, AlchemyUI, Net
  vm.runInContext(`
    ${shopSource}
    ${uiSource}
    ${alchemySource}
    ${netSource}
    UI.notify = () => {};
    UI.log = () => {};
    UI.buildInv = () => {};
    UI.update = () => {};
    globalThis.__DialogUI = DialogUI;
    globalThis.__UI = UI;
    globalThis.__Alc = AlchemyUI;
    globalThis.__Net = Net;
  `, ctx);

  // P1-7a: DialogUI.open never sets innerHTML and preserves line/XSS string as plain text
  const xssPayload = "<img src=x onerror=alert(1)>\nDong 2";
  ctx.__DialogUI.open({ name: "Lão Già", dialog: xssPayload });
  assert.equal(dialogHtmlCalled, false);
  assert.equal(dialogTextEl.textContent, xssPayload);

  // P1-7b: toggleContinent uses safe DOM construction instead of innerHTML
  doc.getElementById("continent-modal").style.display = "none";
  ctx.__Net.get = async () => ({
    name: "Đông Thắng",
    description: "Mô tả",
    regions: [{
      name: "<script>alert(1)</script>",
      description: "Vùng",
      maps: [{ name: "<b>Map X</b>", type: "WILD", level: 3, playable: true }],
    }],
  });
  await ctx.__UI.toggleContinent(true);
  assert.equal(continentRenderHtmlCalled, false);
  assert.equal(regionsEl.children.length, 1);
  assert.equal(regionsEl.children[0].children[0].children[0].textContent, "<script>alert(1)</script>");

  // P1-5: AlchemyUI.onPlayerSync skips DOM rebuild on 1Hz hp regen & preserves scrollTop when xu changes
  ctx.__Net.get = async () => ({
    ok: true,
    recipes: [{
      code: "RECIPE_DAN_PHI_THANG_HA",
      category: "BREAKTHROUGH",
      pillGroup: "DAN_PHI_THANG",
      quality: "HA_PHAM",
      qualityLabel: "Hạ phẩm",
      name: "Luyện Phi Thăng Đan (Hạ phẩm)",
      craftSuccessRate: 0.7,
      mutationChance: 0.05,
      requiredRealmStt: 1,
      costXu: 80,
      costLinhThach: 0,
      outputItemCode: "DAN_PHI_THANG",
      outputItem: { id: "DAN_PHI_THANG", name: "Đan Phi Thăng (Hạ phẩm)" },
      ingredients: [{ itemCode: "STONE_LINH_NHO", name: "Linh Thạch Nhỏ", quantity: 3, owned: 5, enough: true }],
    }],
  });
  await ctx.__Alc.open("PHI_THANG");
  const countAfterOpen = listReplaceCount;
  listEl.scrollTop = 120;

  // Simulated 1Hz HP regeneration: should NOT rebuild recipe list DOM
  ctx.S.player.hp = 95;
  ctx.__Alc.onPlayerSync();
  assert.equal(listReplaceCount, countAfterOpen);
  assert.equal(listEl.scrollTop, 120);

  // Actual Xu change: should re-render once AND preserve scrollTop
  ctx.S.player.xu = 750;
  ctx.__Alc.onPlayerSync();
  assert.equal(listReplaceCount, countAfterOpen + 1);
  assert.equal(listEl.scrollTop, 120);

  // P2-4: Net.mutate clears deterministic 409 requestId but preserves requestId across NETWORK_ERROR
  fetchMode = "CONFLICT_409";
  await ctx.__Net.mutate("POST", "/api/player/alchemy/brew", { recipeCode: "R1" });
  fetchMode = "OK";
  await ctx.__Net.mutate("POST", "/api/player/alchemy/brew", { recipeCode: "R1" });
  assert.notEqual(sentIds[0], sentIds[1], "Deterministic 409 must clear pending idempotency requestId");

  fetchMode = "NETWORK_FAIL";
  await ctx.__Net.mutate("POST", "/api/player/alchemy/brew", { recipeCode: "R2" });
  fetchMode = "OK";
  await ctx.__Net.mutate("POST", "/api/player/alchemy/brew", { recipeCode: "R2" });
  assert.equal(sentIds[2], sentIds[3], "Transient NETWORK_ERROR must reuse identical idempotency requestId");

  // P1-4: Socket player_state_update syncs realmCode, realmStage, tangTuVi, realm, canhGioi, tenCanhGioi
  ctx.__Net.connectSocket();
  const stateHandler = socketHandlers.get("player_state_update");
  assert.ok(stateHandler);
  stateHandler({
    realmCode: "KHI_DONG",
    realmStage: 1,
    canhGioi: { stt: 2, code: "KHI_DONG", tenCanhGioi: "Khí Động" },
  });
  assert.equal(ctx.S.player.realmCode, "KHI_DONG");
  assert.equal(ctx.S.player.realmStage, 1);
  assert.equal(ctx.S.player.tangTuVi, 1);
  assert.equal(ctx.S.player.realm, 2);
  assert.equal(ctx.S.player.tenCanhGioi, "Khí Động");
});
