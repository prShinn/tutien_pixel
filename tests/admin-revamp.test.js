"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const publicDir = path.join(__dirname, "..", "public");
const apiSource = fs.readFileSync(path.join(publicDir, "js", "api.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(publicDir, "admin", "index.html"), "utf8");
const mapEditorHtml = fs.readFileSync(path.join(publicDir, "admin", "map-editor.html"), "utf8");
const adminJs = fs.readFileSync(path.join(publicDir, "admin", "admin.js"), "utf8");
const itemStudioJs = fs.readFileSync(path.join(publicDir, "admin", "item-studio.js"), "utf8");
const contentUtils = require(path.join(publicDir, "admin", "content-utils.js"));
const contentManager = require(path.join(publicDir, "admin", "content-manager.js"));

test("Admin HTML & Map Editor expose all revamped gameplay menus without dead placeholders", () => {
  assert.doesNotMatch(adminHtml, /class="nav-item disabled"/);
  assert.doesNotMatch(adminHtml, /Sắp tới/);
  for (const id of [
    "alchemy-recipes-view",
    "loot-tables-view",
    "mail-sender-view",
    "balance-settings-view",
    "item-type-filter",
    "item-rarity-filter",
    "open-item-studio",
    "item-studio-mode-banner",
  ]) {
    assert.ok(adminHtml.includes(`id="${id}"`), `Missing #${id} in public/admin/index.html`);
  }
  for (const field of ['name="str"', 'name="agi"', 'name="vit"', 'name="ene"', 'value="BAG_EXPAND"', 'value="STAT_RESET"', 'value="EXCHANGE_XU"']) {
    assert.ok(adminHtml.includes(field), `Missing ${field} in Item Studio`);
  }

  const adminEditorsJs = fs.readFileSync(path.join(publicDir, "admin", "admin-editors.js"), "utf8");
  assert.ok(adminHtml.includes('name="playerId" type="text"'));
  assert.ok(!adminHtml.includes('name="playerId" type="number"'));
  assert.ok(adminHtml.includes('name="elemTuVi"'));
  assert.ok(adminEditorsJs.includes("bal?.enhance?.tiers"));
  assert.ok(!adminEditorsJs.includes("bal?.enhance?.levels"));

  assert.ok(mapEditorHtml.includes('id="npc-shop-category"'));
  assert.ok(mapEditorHtml.includes('value="MOUNTAIN_FOOTHILL"'));
  assert.ok(mapEditorHtml.includes("08 · Kiểm tra &amp; xuất bản"));
  assert.equal((mapEditorHtml.match(/07 ·/g) || []).length, 1);
});

test("API contract includes admin.mail endpoint and AdminContent supports alchemyRecipes & lootTables", () => {
  const ctx = {
    window: { TuTienConfig: { apiBase: "http://127.0.0.1:4000", dataMode: "real" } },
    globalThis: null,
    URL,
    AbortSignal,
    fetch: async () => ({}),
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(`${apiSource}\nglobalThis.API = API;`, ctx);
  assert.equal(ctx.API.PATHS.admin.mail, "/api/admin/mail/send");

  assert.equal(contentManager.EDITABLE_COLLECTIONS.has("alchemyRecipes"), true);
  assert.equal(contentManager.EDITABLE_COLLECTIONS.has("lootTables"), true);

  const blankRecipe = contentUtils.createBlankRecord("alchemyRecipes", 1001);
  assert.equal(blankRecipe.code, "REC_NEW_1001");
  assert.throws(
    () => contentUtils.parseRecord(JSON.stringify({ ...blankRecipe, craftSuccessRate: 0.9 }), blankRecipe.id, null, "alchemyRecipes"),
    /0\.7/,
  );

  const blankLoot = contentUtils.createBlankRecord("lootTables", 1002);
  assert.equal(blankLoot.id, "loot_new_1002");
  const parsedLoot = contentUtils.parseRecord(JSON.stringify(blankLoot), blankLoot.id, null, "lootTables");
  assert.equal(parsedLoot.entries[0].itemId, "STONE_LINH_NHO");
});

test("admin.js does not require PNG upload when creating or editing items via modal", () => {
  assert.ok(!adminJs.includes('if (pixelImage === "" && (!wasEdit'));
  assert.match(adminJs, /collection === "monsters" && !wasEdit/);
});

test("ItemStudio.mount loadRecord prefills an existing item without PNG and saves via existingId (PUT)", async () => {
  const listeners = new Map();
  const savedCalls = [];
  function makeInput(name, initial = "", type = "text") {
    return {
      name,
      type,
      value: initial,
      checked: false,
      disabled: false,
      readOnly: false,
      required: false,
      files: [],
      addEventListener(ev, fn) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push({ ev, fn });
      },
      focus() {},
    };
  }
  const controls = {
    source: makeInput("source", "", "file"),
    size: makeInput("size", "48"),
    colors: makeInput("colors", "24"),
    removeBg: { ...makeInput("removeBg", "", "checkbox"), checked: true },
    outline: { ...makeInput("outline", "", "checkbox"), checked: true },
    sparklePreset: makeInput("sparklePreset", "SHIMMER"),
    sparkleColor: makeInput("sparkleColor", "#ffd966"),
    sparkleIntensity: makeInput("sparkleIntensity", "2"),
    itemName: makeInput("itemName"),
    code: makeInput("code"),
    type: makeInput("type", "MATERIAL"),
    rarity: makeInput("rarity", "NORMAL"),
    requiredRealmStt: makeInput("requiredRealmStt", "1"),
    itemLevel: makeInput("itemLevel", "10"),
    linhCan: makeInput("linhCan", ""),
    currency: makeInput("currency", "XU"),
    giaMua: makeInput("giaMua", "0"),
    giaBan: makeInput("giaBan", "0"),
    hasLuck: makeInput("hasLuck", "", "checkbox"),
    moTa: makeInput("moTa"),
    slot: makeInput("slot", "weapon"),
    weaponKind: makeInput("weaponKind", "sword"),
    pAtk: makeInput("pAtk", "0"),
    mAtk: makeInput("mAtk", "0"),
    pDef: makeInput("pDef", "0"),
    mDef: makeInput("mDef", "0"),
    maxHp: makeInput("maxHp", "0"),
    maxMp: makeInput("maxMp", "0"),
    spd: makeInput("spd", "0"),
    crit: makeInput("crit", "0"),
    str: makeInput("str", "0"),
    agi: makeInput("agi", "0"),
    vit: makeInput("vit", "0"),
    ene: makeInput("ene", "0"),
    gemTier: makeInput("gemTier", "BLESS"),
    healHp: makeInput("healHp", "0"),
    healMp: makeInput("healMp", "0"),
    giaTriTuVi: makeInput("giaTriTuVi", "120"),
    elemTuVi: makeInput("elemTuVi", "80"),
    tuViLinhCanVal: makeInput("tuViLinhCanVal", "120"),
    bagSlots: makeInput("bagSlots", "6"),
    xuAmount: makeInput("xuAmount", "1000"),
    realmCode: makeInput("realmCode", "TRUC_CO"),
    quality: makeInput("quality", "HA"),
    qualityLabel: makeInput("qualityLabel", "Hạ phẩm"),
    breakthroughRate: makeInput("breakthroughRate", "0.55"),
  };
  const elements = Object.assign({ namedItem: (k) => controls[k] || null }, controls);
  const saveBtn = { disabled: false, textContent: "" };
  const saveStatus = { textContent: "" };
  const listBtn = { hidden: true, addEventListener() {} };
  const artStatus = { textContent: "" };
  const fakeCtx = { clearRect() {}, drawImage() {} };
  const previewCanvas = { width: 48, height: 48, getContext: () => fakeCtx };
  const formHandlers = {};
  const form = {
    elements,
    isConnected: false,
    closest: () => null,
    reportValidity: () => true,
    reset() {},
    querySelector(sel) {
      if (sel === "#item-save-status") return saveStatus;
      if (sel === "[type=submit]") return saveBtn;
      if (sel === "#item-studio-list") return listBtn;
      if (sel === "canvas") return previewCanvas;
      if (sel === "[data-art-status]") return artStatus;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener(ev, fn) { formHandlers[ev] = fn; },
  };
  const ctx = {
    window: null,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx }) },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(`${itemStudioJs}\nglobalThis.ItemStudio = ItemStudio;`, ctx);

  const handle = ctx.ItemStudio.mount({
    form,
    async saveItem(record, existingId) { savedCalls.push({ record, existingId }); },
    openItems() {},
  });

  handle.loadRecord({
    id: "LEGACY_SWORD",
    tenDo: "Thiết Kiếm Cũ",
    type: "EQUIPMENT",
    slot: "weapon",
    weaponKind: "sword",
    rarity: "MAGIC",
    hasLuck: true,
    stats: { pAtk: 18, str: 6, agi: 4 },
  });

  assert.equal(controls.code.readOnly, true);
  assert.equal(saveBtn.disabled, false);
  assert.equal(controls.str.value, 6);
  assert.equal(controls.agi.value, 4);

  controls.str.value = "12";
  await formHandlers.submit({ preventDefault() {} });

  assert.equal(savedCalls.length, 1);
  assert.equal(savedCalls[0].existingId, "LEGACY_SWORD");
  assert.equal(savedCalls[0].record.stats.str, 12);
  assert.equal(savedCalls[0].record.img, undefined);
  assert.equal(controls.sparklePreset.value, "NONE");

  handle.loadRecord({
    id: "STONE_LINH_NHO",
    tenDo: "Linh Thạch Nhỏ",
    type: "STONE",
    giaTriTuVi: 250,
  });
  await formHandlers.submit({ preventDefault() {} });
  assert.equal(savedCalls[1].record.giaTriTuVi, 250);

  handle.loadRecord({
    id: "ELEM_FIRE_1",
    tenDo: "Hỏa Linh Thạch",
    type: "ELEMSTONE",
    giaTriTuVi: 320,
  });
  await formHandlers.submit({ preventDefault() {} });
  assert.equal(savedCalls[2].record.giaTriTuVi, 320);
});
