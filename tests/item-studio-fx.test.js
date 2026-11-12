"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const publicDir = path.join(__dirname, "..", "public");
const balanceSource = fs.readFileSync(path.join(publicDir, "js", "balance.js"), "utf8");
const itemFxSource = fs.readFileSync(path.join(publicDir, "js", "item-fx.js"), "utf8");
const gamedataSource = fs.readFileSync(path.join(publicDir, "js", "gamedata.js"), "utf8");
const forgeSource = fs.readFileSync(path.join(publicDir, "js", "forge.js"), "utf8");
const apiSource = fs.readFileSync(path.join(publicDir, "js", "api.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(publicDir, "js", "bootstrap.js"), "utf8");
const styleCss = fs.readFileSync(path.join(publicDir, "css", "style.css"), "utf8");
const gameHubCss = fs.readFileSync(path.join(publicDir, "css", "game-hub.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const uiSource = fs.readFileSync(path.join(publicDir, "js", "ui.js"), "utf8");
const combatSource = fs.readFileSync(path.join(publicDir, "js", "combat.js"), "utf8");
const shopSource = fs.readFileSync(path.join(publicDir, "js", "shop.js"), "utf8");
const inventorySource = fs.readFileSync(path.join(publicDir, "js", "inventory.js"), "utf8");
const renderSource = fs.readFileSync(path.join(publicDir, "js", "render.js"), "utf8");
const adminContentUtils = require(path.join(publicDir, "admin", "content-utils.js"));

function makeFakeElement(tag = "div") {
  const classes = new Set();
  const children = [];
  const styleProps = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    className: "",
    textContent: "",
    innerHTML: "",
    title: "",
    dataset: {},
    children,
    style: {
      setProperty(k, v) { styleProps.set(k, String(v)); },
      getPropertyValue(k) { return styleProps.get(k) || ""; },
    },
    classList: {
      add(...tokens) { tokens.forEach((t) => classes.add(t)); },
      remove(...tokens) { tokens.forEach((t) => classes.delete(t)); },
      contains(t) { return classes.has(t); },
      toggle(t, force) {
        if (force === undefined) {
          if (classes.has(t)) { classes.delete(t); return false; }
          classes.add(t);
          return true;
        }
        if (force) classes.add(t); else classes.delete(t);
        return Boolean(force);
      },
    },
    appendChild(child) {
      if (child && typeof child === "object") children.push(child);
      return child;
    },
    querySelector(sel) {
      if (!sel.startsWith(".")) return null;
      const cls = sel.slice(1);
      return children.find((c) => String(c.className || "").split(/\s+/).includes(cls)) || null;
    },
    remove() {
      this._removed = true;
    },
  };
  return el;
}

function loadItemFx(persistentEnabled = true) {
  const document = {
    createElement: (tag) => makeFakeElement(tag),
  };
  const context = vm.createContext({
    VisualEffects: { arePersistentEffectsEnabled: () => persistentEnabled },
    document,
  });
  vm.runInContext(`${itemFxSource}\nglobalThis.__ItemFX = ItemFX;`, context, { filename: "item-fx.js" });
  return { ItemFX: context.__ItemFX, document };
}

test("ItemFX computes glow tiers, rarity colors, sparkle profiles, and slot badges while respecting FX toggle", () => {
  const { ItemFX } = loadItemFx(true);

  assert.equal(ItemFX.enhanceGlowTier(0), 0);
  assert.equal(ItemFX.enhanceGlowTier(6), 0);
  assert.equal(ItemFX.enhanceGlowTier(7), 1);
  assert.equal(ItemFX.enhanceGlowTier(9), 2);
  assert.equal(ItemFX.enhanceGlowTier(11), 3);
  assert.equal(ItemFX.enhanceGlowTier(13), 4);
  assert.equal(ItemFX.enhanceGlowTier(15), 4);

  for (const key of ["NORMAL", "MAGIC", "EXL", "ANCIENT"]) {
    assert.match(ItemFX.RARITY_META[key].color, /^#[0-9a-f]{6}$/i);
  }

  const ancientProf = ItemFX.resolveItemFxProfile({ rarity: "ANCIENT", enhanceLevel: 0, hasLuck: true });
  assert.equal(ancientProf.preset, "MYTHIC_PRISM");
  assert.equal(ancientProf.sparkleEnabled, true);
  assert.equal(ancientProf.hasLuck, true);

  const customElem = ItemFX.resolveItemFxProfile({
    rarity: "NORMAL",
    linhCan: "HOA",
    sparkle: { preset: "ELEMENTAL", intensity: 3 },
  });
  assert.equal(customElem.preset, "ELEMENTAL");
  assert.equal(customElem.color, ItemFX.ELEMENT_COLORS.HOA);
  assert.equal(customElem.intensity, 3);

  const slotEl = makeFakeElement("div");
  ItemFX.decorateSlotElement(slotEl, { rarity: "EXL", enhanceLevel: 11, hasLuck: true });
  assert.equal(slotEl.classList.contains("fx-rarity-exl"), true);
  assert.equal(slotEl.classList.contains("fx-enh-t3"), true);
  assert.equal(slotEl.classList.contains("fx-has-luck"), true);
  assert.equal(slotEl.classList.contains("fx-animated"), true);
  assert.equal(slotEl.querySelector(".fx-enh-badge")?.textContent, "+11");
  assert.equal(slotEl.querySelector(".fx-luck-badge")?.textContent, "✦");
  assert.ok(slotEl.querySelector(".fx-sparkle-layer"));

  const { ItemFX: FxOff } = loadItemFx(false);
  const mutedSlot = makeFakeElement("div");
  FxOff.decorateSlotElement(mutedSlot, { rarity: "ANCIENT", enhanceLevel: 15, hasLuck: true });
  assert.equal(mutedSlot.classList.contains("fx-animated"), false);
  assert.equal(mutedSlot.querySelector(".fx-sparkle-layer"), null);
  assert.equal(mutedSlot.querySelector(".fx-enh-badge")?.textContent, "+15");
});

test("AdminContentUtils validates new item taxonomy, rarities, and 2D sparkle presets", () => {
  const validGearObj = {
    id: "SWORD_TEST_MU",
    maDo: "SWORD_TEST_MU",
    tenDo: "Huyền Thiết Trọng Kiếm",
    name: "Huyền Thiết Trọng Kiếm",
    type: "EQUIPMENT",
    loai: "EQUIPMENT",
    slot: "weapon",
    weaponKind: "sword",
    itemLevel: 40,
    rarity: "EXL",
    hasLuck: true,
    sparkle: { preset: "SHIMMER", color: "#5ef2a8", intensity: 2 },
    stats: { pAtk: 42, spd: 8 },
  };
  const validGear = adminContentUtils.parseRecord(JSON.stringify(validGearObj), validGearObj.id, validGearObj.id, "items");
  assert.equal(validGear.id, "SWORD_TEST_MU");
  assert.equal(validGear.sparkle.preset, "SHIMMER");

  const validGemObj = {
    id: "GEM_BLESS_CUSTOM",
    maDo: "GEM_BLESS_CUSTOM",
    name: "Ngọc Ước Nguyện",
    type: "ENHANCE_GEM",
    loai: "ENHANCE_GEM",
    gemTier: "BLESS",
    giaMua: 1000,
    giaBan: 200,
  };
  const validGem = adminContentUtils.parseRecord(JSON.stringify(validGemObj), validGemObj.id, validGemObj.id, "items");
  assert.equal(validGem.type, "ENHANCE_GEM");

  assert.throws(() => adminContentUtils.parseRecord(JSON.stringify({
    id: "BAD_RARITY",
    maDo: "BAD_RARITY",
    name: "Bad",
    type: "EQUIPMENT",
    loai: "EQUIPMENT",
    rarity: "MYTHIC_INVALID",
  }), "BAD_RARITY", "BAD_RARITY", "items"), /Phẩm chất/);

  assert.throws(() => adminContentUtils.parseRecord(JSON.stringify({
    id: "BAD_SPARKLE",
    maDo: "BAD_SPARKLE",
    name: "Bad",
    type: "EQUIPMENT",
    loai: "EQUIPMENT",
    sparkle: { preset: "LASER_3D" },
  }), "BAD_SPARKLE", "BAD_SPARKLE", "items"), /lấp lánh 2D/);
});

test("FE balance scale matches BE curve and GameData preserves instance traits when hydrating catalog metadata", () => {
  const ctx = vm.createContext({
    console,
    CFG: { ITEMS: {}, REALMS: [], ROOTS: [], SKILLS: {}, MONSTERS: {}, SHOP_SELL: [] },
    API: { PATHS: { data: {} } },
  });
  vm.runInContext(`${balanceSource}\nglobalThis.GAME_BALANCE = GAME_BALANCE;\nglobalThis.enhanceStatMultiplier = enhanceStatMultiplier;\nglobalThis.scaledEquipmentStats = scaledEquipmentStats;`, ctx);
  vm.runInContext(`${gamedataSource}\nglobalThis.GameData = GameData;`, ctx);

  assert.equal(Math.round(ctx.enhanceStatMultiplier(0) * 100) / 100, 1);
  assert.equal(Math.round(ctx.enhanceStatMultiplier(7) * 100) / 100, 1.56);
  assert.equal(Math.round(ctx.enhanceStatMultiplier(9) * 100) / 100, 1.72);
  assert.equal(Math.round(ctx.enhanceStatMultiplier(10) * 100) / 100, 1.84);
  assert.equal(Math.round(ctx.enhanceStatMultiplier(13) * 100) / 100, 2.2);
  assert.equal(Math.round(ctx.enhanceStatMultiplier(15) * 100) / 100, 2.44);

  const scaled13 = ctx.scaledEquipmentStats({ stats: { pAtk: 100, maxHp: 50 }, enhanceLevel: 13 });
  assert.equal(scaled13.pAtk, 220);
  assert.equal(scaled13.maxHp, 110);

  ctx.GameData.updateItemCatalog({
    id: "SWORD_BAO_KHI_1",
    item: {
      id: "SWORD_BAO_KHI_1",
      maDo: "SWORD_BAO_KHI_1",
      name: "Thanh Vân Kiếm",
      type: "EQUIPMENT",
      loai: "EQUIPMENT",
      slot: "weapon",
      rarity: "NORMAL",
      itemLevel: 35,
      stats: { pAtk: 50 },
      sparkle: { preset: "ELEMENTAL", color: "#54db7b", intensity: 2 },
    },
  });

  const hydrated = ctx.GameData.itemWithCurrentDetails({
    itemCode: "SWORD_BAO_KHI_1",
    instanceId: "11111111-1111-4111-8111-111111111111",
    isInstance: true,
    rarity: "EXL",
    enhanceLevel: 9,
    hasLuck: true,
    exlOptions: [{ code: "DMG_PCT", val: 3 }],
  });

  assert.equal(hydrated.name, "Thanh Vân Kiếm");
  assert.equal(hydrated.itemLevel, 35);
  assert.equal(hydrated.sparkle.preset, "ELEMENTAL");
  assert.equal(hydrated.instanceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(hydrated.rarity, "EXL");
  assert.equal(hydrated.enhanceLevel, 9);
  assert.equal(hydrated.hasLuck, true);
  assert.equal(hydrated.exlOptions.length, 1);
});

test("ForgeUI collects gear from S.player.equipment + inventory, includes Luck +15% bonus, and submits enhance mutation", async () => {
  const { ItemFX } = loadItemFx(true);
  const apiCtx = vm.createContext({
    URL,
    window: { TuTienConfig: { dataMode: "real", apiBase: "http://localhost:3800" }, location: { origin: "http://game.test" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, apiCtx);
  assert.equal(apiCtx.__API.PATHS.enhance.config, "/api/player/enhance/config");
  assert.equal(apiCtx.__API.PATHS.enhance.attempt, "/api/player/equipment/enhance");

  const calls = [];
  const notifications = [];
  const docElements = new Map([
    ["forge-modal", makeFakeElement("div")],
    ["forge-xu", makeFakeElement("em")],
    ["forge-linhthach", makeFakeElement("em")],
    ["forge-equip-list", makeFakeElement("div")],
    ["forge-detail", makeFakeElement("div")],
  ]);
  const swordUuid = "22222222-2222-4222-8222-222222222222";
  const armorUuid = "33333333-3333-4333-8333-333333333333";

  const ctx = vm.createContext({
    console,
    performance: { now: () => 100 },
    window: { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} },
    document: {
      createElement: (tag) => makeFakeElement(tag),
      getElementById: (id) => docElements.get(id) || null,
    },
    API: apiCtx.__API,
    ItemFX,
    CFG: {
      ITEMS: {
        GEM_BLESS: { id: "GEM_BLESS", name: "Ngọc Ước Nguyện", icon: "💎" },
        CHARM_BAO_VE: { id: "CHARM_BAO_VE", name: "Bùa Bảo Vệ", icon: "🧿" },
      },
    },
    S: {
      session: { accessToken: "tok" },
      player: {
        xu: 5000,
        linhThach: 20,
        equipment: {
          weapon: { itemCode: "SWORD_A", name: "Huyền Kiếm", type: "EQUIPMENT", slot: "weapon", instanceId: swordUuid, rarity: "EXL", enhanceLevel: 6, hasLuck: true, stats: { pAtk: 100 } },
        },
      },
      inventory: [
        { itemCode: "ARMOR_A", name: "Thanh Giáp", type: "EQUIPMENT", slot: "armor", instanceId: armorUuid, rarity: "NORMAL", enhanceLevel: 0, stats: { pDef: 40 } },
        { itemCode: "GEM_BLESS", count: 5 },
      ],
    },
    GameData: { itemWithCurrentDetails: (entry) => entry },
    Net: {
      async get() { return { ok: true, tiers: [], logs: [] }; },
      async mutate(method, route, body) {
        calls.push({ method, route, body });
        return {
          ok: true,
          player: {
            xu: 1800,
            linhThach: 20,
            equipment: {
              weapon: { itemCode: "SWORD_A", name: "Huyền Kiếm", type: "EQUIPMENT", slot: "weapon", instanceId: swordUuid, rarity: "EXL", enhanceLevel: 7, hasLuck: true, stats: { pAtk: 100 } },
            },
            inventory: [{ itemCode: "ARMOR_A", name: "Thanh Giáp", type: "EQUIPMENT", slot: "armor", instanceId: armorUuid, rarity: "NORMAL", enhanceLevel: 0, stats: { pDef: 40 } }, { itemCode: "GEM_BLESS", count: 3 }],
          },
          result: { outcome: "SUCCESS", itemCode: "SWORD_A", itemName: "Huyền Kiếm", fromLevel: 6, toLevel: 7, usedProtection: false },
        };
      },
      applyPlayerSnapshot(player) {
        ctx.S.player = player;
        ctx.S.inventory = player.inventory;
      },
    },
    UI: {
      notify: (msg, kind) => notifications.push({ msg, kind }),
      log: () => {},
      buildInv: () => {},
      update: () => {},
    },
  });
  docElements.get("forge-modal").querySelectorAll = () => [];

  vm.runInContext(`${balanceSource}\nglobalThis.GAME_BALANCE = GAME_BALANCE;`, ctx);
  vm.runInContext(`${forgeSource}\nglobalThis.ForgeUI = ForgeUI;`, ctx);

  ctx.ForgeUI._config = {
    maxLevel: 15,
    luckSuccessBonus: 0.15,
    protectionItemCode: "CHARM_BAO_VE",
    tiers: [{ targetLevel: 7, rate: 0.55, xu: 3200, linhThach: 0, gems: [{ itemCode: "GEM_BLESS", quantity: 2 }], failOutcome: "FAIL_DOWN" }],
  };

  const items = ctx.ForgeUI.collectEnhanceables();
  assert.equal(items.length, 2);
  assert.equal(items[0].instanceId, swordUuid);
  assert.equal(items[1].instanceId, armorUuid);

  ctx.ForgeUI._selectedInstanceId = swordUuid;
  const plan = ctx.ForgeUI._planPreview(items[0]);
  assert.equal(plan.targetLevel, 7);
  assert.equal(plan.luckBonus, 0.15);
  assert.equal(plan.finalRate, 0.7);
  assert.equal(plan.canEnhance, true);

  await ctx.ForgeUI.enhanceSelected();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].route, "/api/player/equipment/enhance");
  assert.deepEqual({ ...calls[0].body }, { instanceId: swordUuid, useProtection: false });
  assert.equal(ctx.S.player.equipment.weapon.enhanceLevel, 7);
  assert.equal(notifications[0].kind, "success");

  // HTML, bootstrap, and CSS contracts are wired
  assert.match(bootstrapSource, /js\/item-fx\.js/);
  assert.match(bootstrapSource, /js\/forge\.js/);
  assert.match(indexHtml, /id="forge-modal"/);
  assert.match(indexHtml, /ForgeUI\.open\(\)/);
  assert.match(styleCss, /\.fx-sparkle-mythic_prism/);
  assert.match(gameHubCss, /#forge-modal\.open/);
});

test("Phase 4 FE regressions: scaled sell/describeEquipment, gemTier string, safe itemImageSource, Combat derivedStats, ForgeUI charm/reset, gloves slot, and aura/CSS contracts", () => {
  const ctx = vm.createContext({
    console,
    CFG: { ITEMS: {}, REALMS: [], ROOTS: [], SKILLS: {}, MONSTERS: {}, SHOP_SELL: [], INV_BASE: 40, INV_MAX: 80 },
    API: { PATHS: { data: {} } },
    S: {
      player: {
        stats: { str: 5, agi: 5, vit: 5, ene: 5 },
        derivedStats: { pAtk: 188, mAtk: 99, pDef: 77, crit: 0.28, evasion: 0.14 },
        equipment: {},
        buffs: {},
      },
      inventory: [],
    },
    GAME_BALANCE: undefined,
    document: { createElement: (tag) => makeFakeElement(tag) },
  });
  vm.runInContext(`${balanceSource}\nglobalThis.GAME_BALANCE = GAME_BALANCE;`, ctx);
  vm.runInContext(`${gamedataSource}\nglobalThis.GameData = GameData;`, ctx);
  vm.runInContext(`${combatSource}\nglobalThis.Combat = Combat;`, ctx);
  vm.runInContext(`${uiSource}\nglobalThis.UI = UI;`, ctx);

  // GAME_BALANCE helpers & GameData scaled equipmentInfo + string gemTier
  assert.equal(typeof ctx.GAME_BALANCE.scaledEquipmentStats, "function");
  assert.equal(typeof ctx.GAME_BALANCE.calcEquipmentSellPrice, "function");
  assert.equal(typeof ctx.GAME_BALANCE.describeEquipment, "function");
  assert.equal(ctx.GAME_BALANCE.calcEquipmentSellPrice(100, 10, "EXL"), 500);
  const scaledStr = ctx.GAME_BALANCE.scaledEquipmentStats({ stats: { str: 10 }, enhanceLevel: 10 });
  assert.equal(scaledStr.str, 18);

  const normGem = ctx.GameData.normalizeItem({ id: "GEM_BLESS", name: "Ngọc", loai: "ENHANCE_GEM", gemTier: "bless" });
  assert.equal(normGem.gemTier, "BLESS");

  ctx.GameData.updateItemCatalog({
    id: "SWORD_SCALE_1",
    item: {
      id: "SWORD_SCALE_1", maDo: "SWORD_SCALE_1", name: "Kiếm Cân Bằng",
      type: "EQUIPMENT", loai: "EQUIPMENT", slot: "weapon",
      stats: { pAtk: 50 }, equipmentInfo: { bonuses: { pAtk: 50 }, enhanceLevel: 0 },
    },
  });
  const upgraded = ctx.GameData.itemWithCurrentDetails({
    itemCode: "SWORD_SCALE_1", instanceId: "55555555-5555-4555-8555-555555555555",
    isInstance: true, enhanceLevel: 10, rarity: "EXL",
  });
  assert.equal(upgraded.equipmentInfo.enhanceLevel, 10);
  assert.equal(upgraded.equipmentInfo.bonuses.pAtk, 92);

  // UI.itemImageSource blocks XSS schemes
  assert.equal(ctx.UI.itemImageSource('javascript:alert(1)'), "");
  assert.equal(ctx.UI.itemImageSource('https://evil.test/x.png") background:red'), "");
  assert.equal(ctx.UI.itemImageSource("./assets/items/sword.png"), "./assets/items/sword.png");
  assert.equal(ctx.UI.itemImageSource("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");

  // Combat prefers BE derivedStats
  assert.equal(ctx.Combat.pAtk(), 188);
  assert.equal(ctx.Combat.mAtk(), 99);
  assert.equal(ctx.Combat.pDef(), 77);
  assert.equal(ctx.Combat.evasion(), 0.14);
  assert.equal(ctx.Combat.critChance(), 0.28);

  // ForgeUI: luckRateBonus support, charm disabled when finalRate >= 1, reset() works
  const forgeCtx = vm.createContext({
    console,
    performance: { now: () => 0 },
    window: { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} },
    document: { getElementById: () => null },
    CFG: { ITEMS: {} },
    S: { session: { accessToken: "t" }, player: { xu: 99999, linhThach: 99 }, inventory: [{ itemCode: "GEM_BLESS", count: 5 }, { itemCode: "CHARM_BAO_VE", count: 2 }] },
    GAME_BALANCE: ctx.GAME_BALANCE,
  });
  vm.runInContext(`${forgeSource}\nglobalThis.ForgeUI = ForgeUI;`, forgeCtx);
  forgeCtx.ForgeUI._config = {
    maxLevel: 15,
    luckRateBonus: 0.15,
    protectionItemCode: "CHARM_BAO_VE",
    tiers: [{ targetLevel: 4, rate: 0.85, xu: 1000, linhThach: 0, gems: [{ itemCode: "GEM_BLESS", quantity: 1 }], failOutcome: "FAIL_DOWN" }],
  };
  forgeCtx.ForgeUI._useProtection = true;
  const plan100 = forgeCtx.ForgeUI._planPreview({ itemCode: "SWORD_A", enhanceLevel: 3, hasLuck: true });
  assert.equal(plan100.finalRate, 1);
  assert.equal(plan100.riskAllowsCharm, false);
  assert.equal(plan100.useProtection, false);
  forgeCtx.ForgeUI.reset();
  assert.equal(forgeCtx.ForgeUI._useProtection, false);
  assert.equal(forgeCtx.ForgeUI._config, null);

  // Source contracts: instanceId guard on shop/inventory, gloves slot, evasion*100, CSS reduced motion, avgArmor aura
  assert.match(shopSource, /item\.isInstance && item\.instanceId/);
  assert.match(inventorySource, /item\.isInstance && item\.instanceId/);
  assert.match(inventorySource, /gloves:\s*"gloves"/);
  assert.match(indexHtml, /id="slot-gloves"/);
  assert.match(uiSource, /Combat\.evasion\(\)\s*\*\s*100/);
  assert.match(styleCss, /\.fx-enh-t1\b/);
  assert.match(styleCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.fx-star/);
  assert.match(renderSource, /armorSlots\s*=\s*\["hat",\s*"armor",\s*"pants",\s*"boots",\s*"gloves"\]/);
});
