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
const monsterStudioJs = fs.readFileSync(path.join(publicDir, "admin", "monster-studio.js"), "utf8");
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
    shopCategory: makeInput("shopCategory", ""),
    shopTab: makeInput("shopTab", ""),
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

  // Shop & Premium test
  handle.loadRecord({
    id: "DAN_TRUONG_SINH",
    tenDo: "Đan Trường Sinh",
    type: "POTION",
    currency: "LINH_THACH",
    shopCategory: "ALCHEMY",
    shopTab: "PREMIUM",
    giaMua: 50,
    giaBan: 0,
    healHp: 500,
  });
  assert.equal(controls.shopCategory.value, "ALCHEMY");
  assert.equal(controls.shopTab.value, "PREMIUM");
  assert.equal(controls.currency.value, "LINH_THACH");
  await formHandlers.submit({ preventDefault() {} });
  assert.equal(savedCalls[3].record.shopCategory, "ALCHEMY");
  assert.equal(savedCalls[3].record.shopTab, "PREMIUM");
  assert.equal(savedCalls[3].record.currency, "LINH_THACH");
});

test("mountMonsterStudio supports loadRecord, edit mode banner, keeps sprite without re-upload, and saves via existingId", async () => {
  const listeners = new Map();
  const savedMonsterCalls = [];
  function makeInput(name, initial = "", type = "text") {
    return {
      name,
      type,
      value: initial,
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
    removeBg: makeInput("removeBg", "", "checkbox"),
    outline: makeInput("outline", "", "checkbox"),
    monsterName: makeInput("monsterName"),
    code: makeInput("code"),
    type: makeInput("type", "NORMAL"),
    linhCan: makeInput("linhCan", "KIM"),
    level: makeInput("level", "1"),
    hp: makeInput("hp", "90"),
    atk: makeInput("atk", "9"),
    def: makeInput("def", "2"),
    speed: makeInput("speed", "1.25"),
    respawn: makeInput("respawn", "15"),
    lootTableId: { ...makeInput("lootTableId", ""), dataset: { loaded: "1" }, replaceChildren() {} },
  };
  const elements = Object.assign({ namedItem: (k) => controls[k] || null }, controls);
  const saveBtn = { disabled: false, textContent: "" };
  const status = { textContent: "" };
  const modeBanner = { hidden: true };
  const modeLabel = { textContent: "" };
  const resetModeBtn = { addEventListener(ev, fn) { formHandlers["resetMode"] = fn; } };
  const listBtn = { hidden: true, addEventListener() {} };
  const download = { hidden: true, href: "", download: "", removeAttribute() {} };
  const mapLink = { hidden: true, href: "" };
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
      if (sel === "[data-monster-status]") return status;
      if (sel === "[data-monster-download]") return download;
      if (sel === "[data-monster-map]") return mapLink;
      if (sel === "[type=submit]") return saveBtn;
      if (sel === "#monster-studio-mode-banner") return modeBanner;
      if (sel === "#monster-studio-mode-label") return modeLabel;
      if (sel === "#monster-studio-new-mode") return resetModeBtn;
      if (sel === "#monster-studio-list") return listBtn;
      if (sel === "canvas") return previewCanvas;
      if (sel === "[data-art-status]") return { textContent: "" };
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
    Option: function (label, val) { return { label, value: val }; },
    API: { BASE: "http://127.0.0.1:3800", PATHS: { admin: { content: (c) => `/api/admin/content/${c}` } } },
    AdminAuth: { fetch: async () => ({ ok: true, json: async () => ({ data: [] }) }) },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(`
    ${itemStudioJs}
    globalThis.ItemStudio = ItemStudio;
    ${monsterStudioJs}
    globalThis.mountMonsterStudio = mountMonsterStudio;
  `, ctx);

  let openedMonstersCount = 0;
  const handle = ctx.mountMonsterStudio({
    form,
    async saveMonster(record, existingId) {
      savedMonsterCalls.push({ record, existingId });
    },
    openMonsters() { openedMonstersCount += 1; },
  });

  // 1. Check loadRecord prefill
  handle.loadRecord({
    code: "BOSS_HAC_HO",
    name: "Hắc Hổ Thần",
    type: "BOSS",
    linhCan: "AM",
    level: 50,
    hp: 50000,
    atk: 1200,
    def: 600,
    speed: 1.8,
    respawnMs: 120000,
    lootTableId: "table_boss_hac_ho",
    img: "data:image/png;base64,sample_sprite_data",
  });

  assert.equal(controls.code.readOnly, true);
  assert.equal(controls.code.value, "BOSS_HAC_HO");
  assert.equal(controls.monsterName.value, "Hắc Hổ Thần");
  assert.equal(controls.type.value, "BOSS");
  assert.equal(controls.linhCan.value, "AM");
  assert.equal(controls.hp.value, 50000);
  assert.equal(controls.respawn.value, 120);
  assert.equal(modeBanner.hidden, false);
  assert.match(modeLabel.textContent, /BOSS_HAC_HO/);
  assert.equal(saveBtn.textContent, "Lưu thay đổi quái vật");

  // 2. Submit update without needing new PNG
  controls.hp.value = 65000;
  await formHandlers.submit({ preventDefault() {} });

  assert.equal(savedMonsterCalls.length, 1);
  assert.equal(savedMonsterCalls[0].existingId, "BOSS_HAC_HO");
  assert.equal(savedMonsterCalls[0].record.hp, 65000);
  assert.equal(savedMonsterCalls[0].record.maxHp, 65000);
  assert.equal(savedMonsterCalls[0].record.respawnMs, 120000);
  assert.equal(savedMonsterCalls[0].record.img, "data:image/png;base64,sample_sprite_data");
  assert.match(status.textContent, /Đã cập nhật/);

  // 3. Reset to create mode
  handle.resetToCreate();
  assert.equal(controls.code.readOnly, false);
  assert.equal(controls.source.required, true);
  assert.equal(modeBanner.hidden, true);
  assert.equal(saveBtn.textContent, "Lưu vào ngân hàng quái");
});

test("AdminEditors mount exposes openQuests and openSkills with visual two-way editing", async () => {
  const elements = new Map();
  function registerEl(id, tag = "div") {
    const listeners = {};
    const children = [];
    const el = {
      id,
      tagName: tag.toUpperCase(),
      elements: {},
      children,
      classList: {
        contains: () => false,
        add: () => {},
        remove: () => {},
        toggle: () => {},
      },
      dataset: {},
      style: {},
      innerHTML: "",
      textContent: "",
      value: "",
      hidden: false,
      readOnly: false,
      required: false,
      placeholder: "",
      firstChild: { textContent: "" },
      addEventListener(evt, fn) {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        (listeners[evt.type] || []).forEach((fn) => fn(evt));
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      replaceChildren(...nodes) {
        children.length = 0;
        children.push(...nodes);
      },
      querySelector(sel) {
        if (!el._qsMap) el._qsMap = new Map();
        if (el._qsMap.has(sel)) return el._qsMap.get(sel);
        const nameMatch = sel.match(/\[name="([^"]+)"\]/);
        const name = nameMatch ? nameMatch[1] : sel.replace(/[.#]/, "");
        const mockChild = makeInput(name);
        mockChild._sel = sel;
        mockChild.className = sel.startsWith(".") ? sel.slice(1) : "";
        el._qsMap.set(sel, mockChild);
        children.push(mockChild);
        return mockChild;
      },
      querySelectorAll(sel) {
        return children.filter((c) => c._sel === sel || (c.className && c.className.includes(sel.replace(".", ""))));
      },
      setAttribute(name, val) { el[name] = val; },
      removeAttribute(name) { delete el[name]; },
      reset() {
        for (const input of Object.values(el.elements)) {
          if (input && typeof input === "object") input.value = input.defaultValue || "";
        }
      },
    };
    elements.set(id, el);
    return el;
  }

  function makeInput(name, defaultValue = "") {
    return {
      name,
      value: defaultValue,
      defaultValue,
      readOnly: false,
      required: false,
      placeholder: "",
      dataset: {},
      style: {},
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
    };
  }

  // Pre-register IDs needed by AdminEditors
  for (const id of [
    "admin-item-code-list", "admin-monster-code-list", "admin-quest-id-list",
    "alchemy-form", "alchemy-list", "alchemy-ingredients", "alchemy-status", "alchemy-delete-btn", "alchemy-search", "alchemy-new-btn", "alchemy-add-ingredient", "alchemy-form-title",
    "loot-form", "loot-list", "loot-entries", "loot-status", "loot-delete-btn", "loot-search", "loot-new-btn", "loot-add-entry", "loot-form-title",
    "admin-mail-form", "mail-items-list", "mail-send-status", "mail-add-item",
    "balance-settings-grid",
    "quest-form", "quest-list", "quest-rewards-list", "quest-status", "quest-delete-btn", "quest-search", "quest-category-filter", "quest-new-btn", "quest-add-reward", "quest-target-id-label", "quest-form-title",
    "skill-form", "skill-list", "skill-status", "skill-delete-btn", "skill-passives-box", "skill-search", "skill-root-filter", "skill-new-btn", "skill-open-vfx-btn", "skill-form-title",
  ]) {
    registerEl(id);
  }

  // Set up quest-form elements
  const questForm = elements.get("quest-form");
  const questInputs = {
    id: makeInput("id"),
    title: makeInput("title"),
    category: makeInput("category", "main"),
    giver: makeInput("giver", "Lão Tu Sĩ"),
    location: makeInput("location", "Thanh Vân Trấn"),
    objective: makeInput("objective"),
    eventType: makeInput("eventType", "monster_kill"),
    target: makeInput("target", "5"),
    targetCode: makeInput("targetCode"),
    requiresQuestId: makeInput("requiresQuestId"),
    initialStatus: makeInput("initialStatus", "available"),
    summary: makeInput("summary"),
  };
  questForm.elements = questInputs;

  // Set up skill-form elements
  const skillForm = elements.get("skill-form");
  const skillInputs = {
    code: makeInput("code"),
    name: makeInput("name"),
    linhCan: makeInput("linhCan", "COMMON"),
    tier: makeInput("tier", "1"),
    type: makeInput("type", "COMMON"),
    category: makeInput("category", "ACTIVE"),
    mpTieuHao: makeInput("mpTieuHao", "10"),
    hoiChieu: makeInput("hoiChieu", "1.5"),
    range: makeInput("range", "3.5"),
    satThuong: makeInput("satThuong", "1.2"),
    dienRong: makeInput("dienRong", "0"),
    scalingStat: makeInput("scalingStat", "ene"),
    effect: makeInput("effect", ""),
    effectVal: makeInput("effectVal", "0"),
    thoiGianBuff: makeInput("thoiGianBuff", "0"),
    moTa: makeInput("moTa", ""),
    pass_maxHpPct: makeInput("pass_maxHpPct", "0"),
    pass_maxMpPct: makeInput("pass_maxMpPct", "0"),
    pass_skillDamagePct: makeInput("pass_skillDamagePct", "0"),
    pass_pDefPenPct: makeInput("pass_pDefPenPct", "0"),
    pass_defensePct: makeInput("pass_defensePct", "0"),
    pass_speedPct: makeInput("pass_speedPct", "0"),
    pass_critPct: makeInput("pass_critPct", "0"),
    pass_shieldPct: makeInput("pass_shieldPct", "0"),
    pass_hpRegenPct: makeInput("pass_hpRegenPct", "0"),
    pass_resistPct: makeInput("pass_resistPct", "0"),
    pass_cooldownPct: makeInput("pass_cooldownPct", "0"),
    pass_statusEffectPct: makeInput("pass_statusEffectPct", "0"),
  };
  skillForm.elements = skillInputs;

  const savedQuestCalls = [];
  const savedSkillCalls = [];
  const fakeContentManager = {
    list: async (col) => ({ data: [] }),
    save: async (col, payload) => {
      if (col === "quests") savedQuestCalls.push(payload);
      if (col === "skills") savedSkillCalls.push(payload);
      return { data: { id: payload.id } };
    },
    remove: async () => {},
  };

  const oldDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      const el = registerEl(`_created_${Date.now()}_${Math.random()}`, tag);
      el.className = "";
      return el;
    },
  };

  try {
    const adminEditors = require(path.join(publicDir, "admin", "admin-editors.js"));
    const handle = adminEditors.mount({
      api: { BASE: "http://127.0.0.1:3800", PATHS: { data: {}, admin: {} } },
      getJson: async () => [],
      adminHeaders: () => ({}),
      contentManager: fakeContentManager,
      escapeHtml: (s) => s,
    });

    assert.equal(typeof handle.openQuests, "function");
    assert.equal(typeof handle.openSkills, "function");
    assert.equal(typeof handle.loadQuest, "function");
    assert.equal(typeof handle.loadSkill, "function");

    // 1. Test loadQuest
    handle.loadQuest({
      id: "novice-plain-wolves",
      title: "Tiêu Diệt Dã Lang",
      category: "main",
      giver: "Trưởng Thôn",
      location: "Bình Nguyên",
      objective: "Diệt 5 Dã Lang",
      eventType: "monster_kill",
      target: 5,
      targetMonsterId: "HOANG_SOI",
      initialStatus: "available",
      summary: "Dã lang hoành hành, cần dẹp yên.",
      rewards: [
        { type: "xu", amount: 500, label: "500 Xu" },
        { type: "item", amount: 2, itemId: "THAO_DUOC", label: "2 Thảo Dược" },
      ],
    });

    assert.equal(questInputs.id.value, "novice-plain-wolves");
    assert.equal(questInputs.id.readOnly, true);
    assert.equal(questInputs.title.value, "Tiêu Diệt Dã Lang");
    assert.equal(questInputs.targetCode.value, "HOANG_SOI");
    assert.equal(questInputs.target.value, 5);

    // 2. Test saving quest
    questInputs.title.value = "Tiêu Diệt Đàn Dã Lang";
    questForm.dispatchEvent({ type: "submit", preventDefault() {} });

    assert.equal(savedQuestCalls.length, 1);
    assert.equal(savedQuestCalls[0].existingId, "novice-plain-wolves");
    const parsedQuest = JSON.parse(savedQuestCalls[0].json);
    assert.equal(parsedQuest.title, "Tiêu Diệt Đàn Dã Lang");
    assert.equal(parsedQuest.targetMonsterId, "HOANG_SOI");
    assert.equal(parsedQuest.eventType, "monster_kill");

    // 3. Test loadSkill with passive modifiers fraction conversion
    handle.loadSkill({
      code: "KIM_TAM_PHAP",
      name: "Kim Thể Chi Pháp",
      linhCan: "KIM",
      category: "PASSIVE",
      tier: 1,
      type: "COMMON",
      mpTieuHao: 0,
      hoiChieu: 0,
      range: 0,
      satThuong: 0,
      effect: "passive",
      passiveModifiers: {
        skillDamagePct: 0.003,
        pDefPenPct: 0.005,
      },
      moTa: "Nội tại Kim",
    });

    assert.equal(skillInputs.code.value, "KIM_TAM_PHAP");
    assert.equal(skillInputs.code.readOnly, true);
    assert.equal(skillInputs.category.value, "PASSIVE");
    assert.equal(skillInputs.pass_skillDamagePct.value, 0.3); // 0.003 * 100 = 0.3%
    assert.equal(skillInputs.pass_pDefPenPct.value, 0.5); // 0.005 * 100 = 0.5%

    // 4. Test saving skill with passive percentage to fraction conversion
    skillInputs.pass_skillDamagePct.value = 5; // user enters 5%
    skillInputs.pass_defensePct.value = 2.5; // user enters 2.5%
    skillForm.dispatchEvent({ type: "submit", preventDefault() {} });

    assert.equal(savedSkillCalls.length, 1);
    assert.equal(savedSkillCalls[0].existingId, "KIM_TAM_PHAP");
    const parsedSkill = JSON.parse(savedSkillCalls[0].json);
    assert.equal(parsedSkill.code, "KIM_TAM_PHAP");
    assert.equal(parsedSkill.passiveModifiers.skillDamagePct, 0.05); // 5% -> 0.05 fraction
    assert.equal(parsedSkill.passiveModifiers.defensePct, 0.025); // 2.5% -> 0.025 fraction

    // Allow async submit handler microtasks to settle before restoring global document
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    globalThis.document = oldDoc;
  }
});

test("Admin Mail & Name-First UX displays character names and protects raw ID from manual edits", () => {
  const currentAdminHtml = fs.readFileSync(path.join(publicDir, "admin", "index.html"), "utf8");
  const currentAdminJs = fs.readFileSync(path.join(publicDir, "admin", "admin.js"), "utf8");

  // 1. Mail HTML contains recipient selector and visual recipient card, raw ID input is hidden and readonly
  assert.ok(currentAdminHtml.includes('id="mail-player-select"'), "Missing #mail-player-select in index.html");
  assert.ok(currentAdminHtml.includes('id="mail-recipient-card"'), "Missing #mail-recipient-card in index.html");
  assert.match(currentAdminHtml, /name="playerId"[^>]*hidden[^>]*readonly/, "playerId input should be hidden and readonly");

  // 2. Alchemy output selection uses dropdowns instead of raw code inputs
  assert.ok(currentAdminHtml.includes('id="alchemy-output-select"'), "Missing #alchemy-output-select");
  assert.ok(currentAdminHtml.includes('id="alchemy-upgraded-select"'), "Missing #alchemy-upgraded-select");

  // 3. Accounts display prioritizes Vietnamese character name over username and raw IDs
  assert.match(currentAdminJs, /record\.playerName\s*\?\s*`\$\{record\.playerName\}\s*\(Tài khoản:\s*\$\{record\.username/);
  assert.match(currentAdminJs, /🎁 Gửi quà cho \$\{AdminContentUtils\.escapeHtml\(record\.playerName/);

  // 4. Quest Studio uses dropdowns with Vietnamese names for monsters, items and prerequisite quests
  assert.ok(currentAdminHtml.includes('id="quest-target-monster-select"'), "Missing #quest-target-monster-select");
  assert.ok(currentAdminHtml.includes('id="quest-target-item-select"'), "Missing #quest-target-item-select");
  assert.ok(currentAdminHtml.includes('id="quest-requires-select"'), "Missing #quest-requires-select");

  // 5. Map Editor uses select dropdown for required quest
  const currentMapEditorHtml = fs.readFileSync(path.join(publicDir, "admin", "map-editor.html"), "utf8");
  assert.match(currentMapEditorHtml, /<select\s+id="portal-required-quest"/);

  // 6. Content table displays gameplay attributes (subInfo) instead of raw IDs across items, monsters, quests, skills
  assert.match(currentAdminJs, /title="Mã ID: \$\{id\}"/);
  assert.match(currentAdminJs, /Cảnh giới:\s*\$\{record\.realmCode\}/);
});

test("CRUD View Detail & Universal Back Buttons across all admin studios and content collections", () => {
  const currentAdminHtml = fs.readFileSync(path.join(publicDir, "admin", "index.html"), "utf8");
  const currentAdminJs = fs.readFileSync(path.join(publicDir, "admin", "admin.js"), "utf8");

  // 1. Record Detail dialog exists in HTML with header, body and action buttons
  assert.ok(currentAdminHtml.includes('id="record-detail-dialog"'), "Missing #record-detail-dialog in index.html");
  assert.ok(currentAdminHtml.includes('id="detail-title"'), "Missing #detail-title in index.html");
  assert.ok(currentAdminHtml.includes('id="detail-body"'), "Missing #detail-body in index.html");
  assert.ok(currentAdminHtml.includes('id="detail-edit-btn"'), "Missing #detail-edit-btn in index.html");
  assert.ok(currentAdminHtml.includes('id="detail-close-btn"'), "Missing #detail-close-btn in index.html");

  // 2. Admin table provides explicit View button (👁 Xem) on every record
  assert.match(currentAdminJs, /data-content-action="view"[^>]*title="Xem chi tiết/);
  assert.ok(currentAdminJs.includes("openRecordDetailModal"));

  // 3. Back buttons with data-back-collection exist across all studio views
  assert.ok(currentAdminHtml.includes('id="monster-studio-back-top"'));
  assert.ok(currentAdminHtml.includes('id="monster-studio-back-banner"'));
  assert.ok(currentAdminHtml.includes('id="item-studio-back-top"'));
  assert.ok(currentAdminHtml.includes('id="item-studio-back-banner"'));
  assert.match(currentAdminHtml, /data-back-collection="monsters"/);
  assert.match(currentAdminHtml, /data-back-collection="items"/);
  assert.match(currentAdminHtml, /data-back-collection="quests"/);
  assert.match(currentAdminHtml, /data-back-collection="skills"/);

  // 4. Admin JS contains universal listener for back buttons and row click to view
  assert.match(currentAdminJs, /data-back-collection/);
  assert.match(currentAdminJs, /data-content-action="view"/);
});

test("Editor Lists and Select dropdown support paging and scroll to bottom load more", () => {
  const currentAdminEditorsJs = fs.readFileSync(path.join(publicDir, "admin", "admin-editors.js"), "utf8");
  const currentAdminHtml = fs.readFileSync(path.join(publicDir, "admin", "index.html"), "utf8");

  // 1. Alchemy, Loot, Quests, Skills editor lists support scroll to bottom listener and page state
  assert.match(currentAdminEditorsJs, /alchemyList\?\.addEventListener\("scroll"/);
  assert.match(currentAdminEditorsJs, /lootList\?\.addEventListener\("scroll"/);
  assert.match(currentAdminEditorsJs, /questList\?\.addEventListener\("scroll"/);
  assert.match(currentAdminEditorsJs, /skillList\?\.addEventListener\("scroll"/);
  assert.match(currentAdminEditorsJs, /loadMoreAlchemy/);
  assert.match(currentAdminEditorsJs, /loadMoreLoot/);
  assert.match(currentAdminEditorsJs, /loadMoreQuests/);
  assert.match(currentAdminEditorsJs, /loadMoreSkills/);

  // 2. GM Mail player select supports scroll to bottom and loadMore button
  assert.match(currentAdminEditorsJs, /mailPlayerSelect\?\.addEventListener\("scroll"/);
  assert.match(currentAdminEditorsJs, /loadMoreMailPlayers/);
  assert.ok(currentAdminHtml.includes('id="mail-player-load-more-btn"'));
  assert.match(currentAdminEditorsJs, /__LOAD_MORE__/);
});

test("Account moderation actions (toggle status, change role, reset password) and Server operation controls", () => {
  const currentAdminJs = fs.readFileSync(path.join(publicDir, "admin", "admin.js"), "utf8");
  const currentAdminEditorsJs = fs.readFileSync(path.join(publicDir, "admin", "admin-editors.js"), "utf8");
  const currentAdminCss = fs.readFileSync(path.join(publicDir, "admin", "admin.css"), "utf8");

  // 1. Account moderation actions in admin table
  assert.match(currentAdminJs, /data-content-action="toggle-status"/);
  assert.match(currentAdminJs, /data-content-action="change-role"/);
  assert.match(currentAdminJs, /data-content-action="reset-password"/);
  assert.match(currentAdminJs, /toggleAccountStatus/);
  assert.match(currentAdminJs, /changeAccountRole/);
  assert.match(currentAdminJs, /resetAccountPassword/);

  // 2. Status badges in admin CSS
  assert.match(currentAdminCss, /\.badge-active/);
  assert.match(currentAdminCss, /\.badge-suspended/);
  assert.match(currentAdminCss, /\.badge-role/);

  // 3. Server operation controls in balance-settings
  assert.match(currentAdminEditorsJs, /SERVER OPERATIONS/);
  assert.match(currentAdminEditorsJs, /server-maintenance-mode/);
  assert.match(currentAdminEditorsJs, /server-drop-rate/);
  assert.match(currentAdminEditorsJs, /server-exp-rate/);
  assert.match(currentAdminEditorsJs, /server-gold-rate/);
  assert.match(currentAdminEditorsJs, /server-announcement/);
  assert.match(currentAdminEditorsJs, /save-server-config-btn/);
  assert.match(currentAdminEditorsJs, /\/api\/admin\/server-config/);
});

test("Map Editor performance cache (terrainDirty) and Monster Pack paging & instant search", () => {
  const mapEditorJs = fs.readFileSync(path.join(publicDir, "admin", "map-editor.js"), "utf8");
  const mapEditorHtml = fs.readFileSync(path.join(publicDir, "admin", "map-editor.html"), "utf8");
  const serverJs = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const beWorldService = fs.readFileSync(path.join("D:", "Setup", "mine", "tutien_pixel_be", "src", "admin", "admin-world-service.js"), "utf8");

  // 1. Terrain dirty flag for 60fps input typing performance
  assert.match(mapEditorJs, /terrainDirty:\s*true/);
  assert.match(mapEditorJs, /if\s*\(editor\.terrainDirty\s*\|\|\s*!previewCanvas\)/);
  assert.match(mapEditorJs, /editor\.terrainDirty\s*=\s*false/);

  // 2. Monster paging & instant search in Map Editor
  assert.match(mapEditorJs, /monsterPagingState/);
  assert.match(mapEditorJs, /fetchMonstersPaged/);
  assert.match(mapEditorJs, /monster-search-input/);
  assert.match(mapEditorJs, /monster-root-filter/);
  assert.match(mapEditorJs, /__LOAD_MORE__/);

  // 3. Map Editor HTML controls
  assert.ok(mapEditorHtml.includes('id="monster-search-input"'));
  assert.ok(mapEditorHtml.includes('id="monster-root-filter"'));
  assert.ok(mapEditorHtml.includes('id="quick-save-map-monster"'));
  assert.ok(mapEditorHtml.includes('id="admin-toast-container"'));

  // 4. Server route for map editor
  assert.match(serverJs, /app\.get\(\["\/admin\/map-editor",\s*"\/admin\/map-editor\/"\]/);

  // 5. Backend world list is lightweight without blocking event loop
  assert.match(beWorldService, /list:\s*\(\)\s*=>\s*world\.listAdminSummaries\(\)/);
});
