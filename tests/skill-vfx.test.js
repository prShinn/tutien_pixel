"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "skill-vfx.js"), "utf8");
const adminSource = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "admin.js"), "utf8");
const contentUtilsSource = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "content-utils.js"), "utf8");
const contentManagerSource = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "content-manager.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "index.html"), "utf8");
const gameHtml = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const gameBootstrap = fs.readFileSync(path.join(__dirname, "..", "public", "js", "bootstrap.js"), "utf8");

function createHarness(storage = new Map(), { API, fetch, VisualEffects, CFG } = {}) {
  const listeners = new Map();
  const draws = [];
  const canvasContext = {
    globalAlpha: 1,
    fillStyle: "#000000",
    save() {},
    restore() {},
    fillRect(x, y, width, height) {
      draws.push([x, y, width, height, this.fillStyle, this.globalAlpha]);
    },
  };
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
    },
    addEventListener(name, listener) { listeners.set(name, listener); },
    matchMedia() { return { matches: false }; },
    S: { player: null },
    CFG: CFG || { SKILLS: {}, SKILL_RANGE_SCALE: 1 },
    ctx: canvasContext,
    console: { warn() {} },
    API,
    fetch,
    VisualEffects,
  });
  context.window = context;
  vm.runInContext(`${source}\nglobalThis.__SkillVFX = SkillVFX;`, context, { filename: "skill-vfx.js" });
  return { vfx: context.__SkillVFX, draws, storage, listeners, context };
}

function createAdminHarness({ authorized = true, failMutations = false } = {}) {
  const storage = new Map();
  const ids = new Set([...adminHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const elements = new Map();
  const listeners = new Map();
  const windowListeners = new Map();
  const frames = [];
  const draws = [];
  const profiles = {};
  const canvasContext = {
    globalAlpha: 1,
    fillStyle: "#000000",
    save() {},
    restore() {},
    fillRect(x, y, width, height) { draws.push([x, y, width, height, this.fillStyle, this.globalAlpha]); },
    fillText() {},
  };
  const navClasses = new Set(["nav-item"]);
  const nav = {
    dataset: { view: "skill-vfx" },
    classList: {
      contains(name) { return navClasses.has(name); },
      add(name) { navClasses.add(name); },
      remove(name) { navClasses.delete(name); },
    },
    addEventListener(name, listener) { listeners.set(`nav:${name}`, listener); },
  };
  function element(id) {
    if (!ids.has(id)) throw new Error(`Admin handler references missing HTML id: ${id}`);
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id,
        value: "",
        textContent: "",
        innerHTML: "",
        disabled: false,
        hidden: false,
        readOnly: false,
        getContext() { return id === "vfx-preview" ? canvasContext : null; },
        focus() {},
        showModal() { this.open = true; },
        close() { this.open = false; },
        classList: {
          add(name) { classes.add(name); },
          remove(name) { classes.delete(name); },
          contains(name) { return classes.has(name); },
          toggle(name, force) {
            if (force === undefined ? !classes.has(name) : force) classes.add(name);
            else classes.delete(name);
          },
        },
        addEventListener(name, listener) { listeners.set(`${id}:${name}`, listener); },
      });
    }
    return elements.get(id);
  }
  const skill = { ...fireSkill };
  const document = {
    getElementById: element,
    querySelectorAll(selector) { return selector === ".nav-item" || selector === ".nav-item[data-view]" ? [nav] : []; },
    querySelector(selector) { return selector === ".nav-item.active" && navClasses.has("active") ? nav : null; },
  };
  const fetch = async (url, options = {}) => {
    let data;
    let status = 200;
    const method = options.method || "GET";
    if (url.includes("/api/admin/") && (!authorized || options.headers?.Authorization !== "Bearer demo-admin")) {
      return { ok: false, status: 401, json: async () => ({ error: "Phiên Admin cần role GM/ADMIN" }) };
    }
    if (url.endsWith("/api/admin/skill-vfx")) {
      if (method === "GET") data = { profiles: structuredClone(profiles) };
      else if (failMutations) return { ok: false, status: 500, json: async () => ({ error: "Không lưu được cấu hình animation" }) };
      else if (method === "POST") {
        const profile = JSON.parse(options.body);
        if (profiles[profile.skillCode]) return { ok: false, status: 409, json: async () => ({ error: "Skill đã có cấu hình tùy chỉnh" }) };
        profiles[profile.skillCode] = profile;
        data = { profile };
        status = 201;
      } else throw new Error(`Unexpected VFX method: ${method}`);
    } else if (url.includes("/api/admin/skill-vfx/")) {
      const code = decodeURIComponent(url.split("/api/admin/skill-vfx/")[1]);
      if (failMutations) return { ok: false, status: 500, json: async () => ({ error: "Không lưu được cấu hình animation" }) };
      if (method === "PUT") {
        if (!profiles[code]) return { ok: false, status: 404, json: async () => ({ error: "Chưa có cấu hình tùy chỉnh cho skill" }) };
        profiles[code] = JSON.parse(options.body);
        data = { profile: profiles[code] };
      } else if (method === "DELETE") {
        if (!profiles[code]) return { ok: false, status: 404, json: async () => ({ error: "Chưa có cấu hình tùy chỉnh cho skill" }) };
        delete profiles[code];
        data = { removed: code };
      } else throw new Error(`Unexpected VFX method: ${method}`);
    }
    else if (url.endsWith("/api/skills")) data = [skill];
    else if (url.endsWith("/api/admin/content/skills")) data = { data: [skill] };
    else if (url.endsWith("/api/admin/worlds")) data = [];
    else if (url.endsWith("/api/canh-gioi")) data = [];
    else throw new Error(`Unexpected Admin request: ${url}`);
    return { ok: true, status, json: async () => data };
  };
  const addWindowEventListener = (name, listener) => {
    if (!windowListeners.has(name)) windowListeners.set(name, []);
    windowListeners.get(name).push(listener);
  };
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
    },
    location: { origin: "http://localhost:3000" },
    requestAnimationFrame(callback) { frames.push(callback); },
    addEventListener: addWindowEventListener,
    document,
    fetch,
    API: {
      BASE: "http://localhost:3000",
      PATHS: {
        data: { skills: "/api/skills", realms: "/api/canh-gio" },
        admin: {
          worlds: "/api/admin/worlds", content: (name) => `/api/admin/content/${name}`,
          contentItem: (name, id) => `/api/admin/content/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
          skillVfx: "/api/admin/skill-vfx", skillVfxItem: (code) => `/api/admin/skill-vfx/${encodeURIComponent(code)}`,
        },
      },
    },
    S: { player: null },
    CFG: { SKILLS: {}, SKILL_RANGE_SCALE: 1 },
    ctx: null,
    performance: { now: () => 1000 },
    console: { warn() {}, error() {} },
    setImmediate,
    AdminAuth: {
      ready: Promise.resolve(true),
      isAdminUrl(url) { return String(url).includes("/api/admin/"); },
      fetch(url, options = {}) {
        const headers = { ...(options.headers || {}), Authorization: "Bearer demo-admin" };
        return fetch(url, { ...options, headers });
      },
    },
  });
  context.window = context;
  vm.runInContext(`${source}\nglobalThis.__SkillVFX = SkillVFX;\n${contentUtilsSource}\n${contentManagerSource}\n${adminSource}`, context, { filename: "admin.js" });
  return { context, elements, listeners, windowListeners, nav, storage, skill, profiles, frames, draws, canvasContext };
}

const fireSkill = {
  code: "HOA_CAU",
  id: "HOA_CAU",
  name: "Hỏa cầu",
  linhCan: "HOA",
  tier: 2,
  damageType: "MAGIC",
  effectDur: 0,
};

test("built-in profile keeps skill form, element palette, and default duration", () => {
  const { vfx } = createHarness();
  const profile = vfx.profile(fireSkill);

  assert.equal(profile.code, "HOA_CAU");
  assert.equal(profile.form, "fireball");
  assert.equal(profile.root, "HOA");
  assert.equal(profile.palette.main, "#e56a3e");
  assert.equal(profile.durationMs, null);
});

test("self-bound charge and support effects render behind actors while impacts stay in front", () => {
  const { vfx } = createHarness();
  const layers = [];
  vfx.drawCharge = () => layers.push("charge");
  vfx.drawSupport = () => layers.push("support");
  vfx.drawImpact = () => layers.push("impact");
  const startedAt = Date.now();
  const base = { root: "HOA", tier: 1, palette: {}, durationMs: 1000 };
  vfx.active = [
    { profile: { ...base, form: "fireball", category: "ACTIVE" }, from: { x: 0, y: 0 }, targets: [], mode: "charge", startedAt, duration: 1000 },
    { profile: { ...base, form: "shield", category: "ACTIVE" }, from: { x: 0, y: 0 }, targets: [{ x: 0, y: 0 }], mode: "support", startedAt, duration: 1000 },
    { profile: { ...base, form: "fireball", category: "ACTIVE" }, from: { x: 0, y: 0 }, targets: [{ x: 4, y: 0 }], mode: "impact", startedAt, duration: 1000 },
  ];

  vfx.draw(0, 0, "behind");
  assert.deepEqual(layers, ["charge", "support"]);

  layers.length = 0;
  vfx.draw(0, 0, "front");
  assert.deepEqual(layers, ["impact"]);
});

test("persistent passive aura obeys the player visibility toggle", () => {
  let enabled = false;
  let passiveDraws = 0;
  const { vfx } = createHarness(new Map(), {
    VisualEffects: { arePersistentEffectsEnabled: () => enabled },
  });
  vfx.drawOwnedPassive = () => { passiveDraws += 1; };

  vfx.draw(0, 0, "behind");
  assert.equal(passiveDraws, 0);
  enabled = true;
  vfx.draw(0, 0, "behind");
  assert.equal(passiveDraws, 1);
});

test("learned lightning passive and active thunder shield keep their distinct aura", () => {
  const passive = { code: "LOI_TAM_PHAP", name: "Lôi thể", linhCan: "LOI", category: "PASSIVE", tier: 1 };
  const shield = { code: "LOI_HO", name: "Thần Lôi Hộ Thể", linhCan: "LOI", category: "ACTIVE", effect: "shield", damageType: "MAGIC", tier: 1 };
  const { vfx, context } = createHarness(new Map(), {
    VisualEffects: { arePersistentEffectsEnabled: () => true },
    CFG: { SKILLS: { LOI: [passive, shield] }, SKILL_RANGE_SCALE: 1 },
  });
  let passiveForm = null;
  let lightningCalls = 0;
  vfx.drawPassive = (_point, profile) => { passiveForm = profile.form; };
  vfx.drawLightningAura = () => { lightningCalls += 1; };
  context.S.player = {
    linhCan: "LOI",
    px: 24,
    py: 32,
    learnedSkills: ["LOI_TAM_PHAP"],
    skills: [],
  };

  vfx.draw(0, 0, "behind");
  assert.equal(passiveForm, "passive-lightning");

  context.S.player.learnedSkills = [];
  context.S.player.skills = [shield];
  context.S.player.buffs = { shield: { expiresAt: Date.now() + 4000 } };
  vfx.draw(0, 0, "behind");
  assert.equal(lightningCalls, 1);
});

test("lightning aura uses a ground seal and an alternating bolt outside the character", () => {
  const { vfx, draws } = createHarness();
  const palette = { light: "#fff5a8", main: "#f6d447", accent: "#9feaff" };
  vfx.drawLightningAura({ x: 50, y: 50 }, palette, 0.12, null, "behind");
  assert.ok(draws.length >= 8, "broken ground marks should remain visible under the actor");

  draws.length = 0;
  vfx.drawLightningAura({ x: 50, y: 50 }, palette, 0.12, null, "front");
  assert.ok(draws.length >= 6, "the timed lightning bolt should render");
  assert.ok(draws.every(([x]) => Math.abs(x - 50) >= 8), "foreground bolts must stay outside the actor's center");
});

test("non-lightning passive shows an element glyph outside the sprite and keeps its ground mark", () => {
  const { vfx, draws } = createHarness();
  const profile = { form: "passive-flame", root: "HOA" };
  const palette = { light: "#ffe6a2", main: "#e56a3e", accent: "#fff0b2", dark: "#573144" };

  vfx.drawPassive({ x: 50, y: 50 }, profile, palette, 0.25, "front");
  assert.ok(draws.length > 0, "the moving elemental glyph should render in front of the sprite");
  assert.ok(draws.every(([x]) => Math.abs(x - 50) >= 8), "foreground glyph must stay outside the sprite silhouette");
  draws.length = 0;
  vfx.drawPassive({ x: 50, y: 50 }, profile, palette, 0.25, "behind");
  assert.equal(draws.length, 8, "the ground mark should stay sparse and readable");
});

test("named lightning shield keeps its lightning form when the BE code differs", () => {
  const { vfx } = createHarness();
  const profile = vfx.profile({ code: "SERVER_SKILL_181", name: "Thần Lôi Hộ Thể", linhCan: "LOI", category: "ACTIVE", effect: "shield" });
  assert.equal(profile.form, "thunder-shield");
});

test("active thunder shield persists visually when a skill response omits buff state", () => {
  const shield = { code: "LOI_HO", name: "Thần Lôi Hộ Thể", linhCan: "LOI", category: "ACTIVE", effect: "shield", damageType: "MAGIC", effectDur: 240, tier: 1 };
  const { vfx, context } = createHarness(new Map(), {
    VisualEffects: { arePersistentEffectsEnabled: () => true },
  });
  let lightningCalls = 0;
  vfx.drawLightningAura = () => { lightningCalls += 1; };
  context.S.player = { px: 24, py: 32, linhCan: "LOI", skills: [shield], buffs: {} };

  assert.equal(vfx.activateBuff(shield, 4000), true);
  vfx.drawOwnedBuffs(0, 0, Date.now());
  assert.equal(lightningCalls, 1);
});

test("game bootstrap and Admin shell request the current VFX and Admin assets", () => {
  assert.match(gameHtml, /js\/bootstrap\.js\?v=17/);
  assert.match(gameBootstrap, /js\/skill-vfx\.js\?v=16/);
  assert.match(adminHtml, /js\/api\.js\?v=5/);
  assert.match(adminHtml, /admin\.css\?v=5/);
  assert.match(adminHtml, /js\/skill-vfx\.js\?v=16/);
  assert.match(adminHtml, /admin\/content-utils\.js\?v=2/);
  assert.match(adminHtml, /admin\/content-manager\.js\?v=2/);
  assert.match(adminHtml, /admin\/admin-auth\.js\?v=2/);
  assert.match(adminHtml, /admin\.js\?v=10/);
  assert.match(adminHtml, /Cấu hình được dùng chung trên máy chủ game hiện tại/);
  assert.doesNotMatch(adminHtml, /trong hồ sơ trình duyệt hiện tại/);
});

test("custom profile overrides form, palette, label, root, and bounded duration", () => {
  const { vfx } = createHarness();
  vfx.saveCustomProfiles({
    HOA_CAU: {
      root: "THUY",
      form: "ice-arrow",
      label: "Băng hỏa",
      durationMs: 1500,
      colors: { main: "#123456", light: "#abcdef", dark: "#101010", accent: "#fedcba" },
    },
  });

  const profile = vfx.profile(fireSkill);
  assert.equal(profile.root, "THUY");
  assert.equal(profile.form, "ice-arrow");
  assert.equal(profile.label, "Băng hỏa");
  assert.equal(profile.durationMs, 1200);
  assert.equal(profile.palette.main, "#123456");
  assert.equal(profile.palette.accent, "#fedcba");
});

test("invalid custom fields fall back to safe skill defaults", () => {
  const { vfx } = createHarness();
  vfx.saveCustomProfiles({
    HOA_CAU: {
      root: "UNKNOWN",
      form: "run-arbitrary-code",
      durationMs: "not-a-number",
      colors: { main: "url(javascript:alert(1))" },
    },
  });

  const profile = vfx.profile(fireSkill);
  assert.equal(profile.root, "HOA");
  assert.equal(profile.form, "fireball");
  assert.equal(profile.durationMs, null);
  assert.equal(profile.palette.main, "#e56a3e");
});

test("create, reload, update and delete round-trip through browser storage", () => {
  const storage = new Map();
  const first = createHarness(storage);
  const profile = {
    skillCode: "HOA_CAU",
    root: "HOA",
    form: "starburst",
    label: "Tinh hỏa",
    durationMs: 850,
    colors: { main: "#aa3300", light: "#ffcc55", dark: "#551100", accent: "#fff0aa" },
  };
  assert.equal(first.vfx.saveCustomProfiles({ HOA_CAU: profile }), true);

  const reloaded = createHarness(storage);
  assert.equal(reloaded.vfx.profile(fireSkill).form, "starburst");
  assert.equal(reloaded.vfx.profile(fireSkill).durationMs, 850);

  assert.equal(reloaded.vfx.saveCustomProfiles({}), true);
  const afterDelete = createHarness(storage);
  assert.equal(afterDelete.vfx.profile(fireSkill).form, "fireball");
  assert.equal(afterDelete.vfx.profile(fireSkill).durationMs, null);
});

test("runtime refreshes a saved profile after a cross-tab storage event", () => {
  const storage = new Map();
  const game = createHarness(storage);
  storage.set("tutien.skillVfxProfiles.v1", JSON.stringify({ HOA_CAU: { form: "starburst", durationMs: 700 } }));

  game.listeners.get("storage")({ key: "tutien.skillVfxProfiles.v1" });
  assert.equal(game.vfx.profile(fireSkill).form, "starburst");
  assert.equal(game.vfx.profile(fireSkill).durationMs, 700);
});

test("runtime loads canonical VFX profiles from the server", async () => {
  const profile = { skillCode: "HOA_CAU", root: "HOA", form: "starburst", label: "Tinh hỏa", durationMs: 760, colors: { main: "#aa3300", light: "#ffcc55", dark: "#551100", accent: "#fff0aa" } };
  const runtime = createHarness(new Map(), {
    API: { BASE: "http://game.test", PATHS: { data: { skillVfx: "/api/skill-vfx" } } },
    fetch: async (url, options) => {
      assert.equal(url, "http://game.test/api/skill-vfx");
      assert.equal(options.cache, "no-store");
      return { ok: true, json: async () => ({ profiles: { HOA_CAU: profile } }) };
    },
  });
  assert.equal(await runtime.vfx.loadRemoteProfiles(), true);
  assert.equal(runtime.vfx.profile(fireSkill).form, "starburst");
  assert.equal(runtime.vfx.profile(fireSkill).durationMs, 760);
});

test("runtime keeps its local fallback when the server profile request fails", async () => {
  const runtime = createHarness(new Map([["tutien.skillVfxProfiles.v1", JSON.stringify({ HOA_CAU: { form: "ice-arrow", durationMs: 710 } })]]), {
    API: { BASE: "http://game.test", PATHS: { data: { skillVfx: "/api/skill-vfx" } } },
    fetch: async () => ({ ok: false }),
  });
  assert.equal(await runtime.vfx.loadRemoteProfiles(), false);
  assert.equal(runtime.vfx.profile(fireSkill).form, "ice-arrow");
});

test("failed local storage writes do not replace the active profile set", () => {
  const storage = new Map();
  storage.set = () => { throw new Error("storage full"); };
  const { vfx } = createHarness(storage);
  const original = vfx.customProfiles;

  assert.equal(vfx.saveCustomProfiles({ HOA_CAU: { form: "starburst" } }), false);
  assert.equal(vfx.customProfiles, original);
});

test("impact duration uses the saved profile and renderer emits distinct pixel patterns", () => {
  const { vfx, draws } = createHarness();
  vfx.saveCustomProfiles({ HOA_CAU: { form: "fireball", durationMs: 910 } });
  vfx.spawn(fireSkill, { px: 20, py: 30 }, [{ px: 60, py: 30 }]);
  assert.equal(vfx.active.at(-1).duration, 910);

  const palette = vfx.palette.HOA;
  const origin = { x: 20, y: 30 };
  const target = { x: 60, y: 30 };
  const renderForm = (form) => {
    draws.length = 0;
    const profile = { ...vfx.profile(fireSkill), form, tier: 2, aoeR: 0 };
    vfx.drawImpact(origin, target, profile, palette, 0.5, { miss: false, critical: false }, true);
    return draws.map((item) => item.join(",")).join("|");
  };
  const slash = renderForm("slash");
  const fireball = renderForm("fireball");
  assert.ok(slash.length > 0);
  assert.ok(fireball.length > 0);
  assert.notEqual(slash, fireball);
});

test("cast-up and default impact timings leave time to read the skill animation", () => {
  const { vfx } = createHarness();
  vfx.charge(fireSkill, { px: 20, py: 30 }, { px: 60, py: 30 });
  assert.equal(vfx.active.at(-1).mode, "charge");
  assert.equal(vfx.active.at(-1).duration, 420);

  vfx.impact(fireSkill, { px: 20, py: 30 }, [{ px: 60, py: 30 }]);
  assert.equal(vfx.active.at(-1).duration, 980);
  vfx.impact({ ...fireSkill, tier: 3 }, { px: 20, py: 30 }, [{ px: 60, py: 30 }]);
  assert.equal(vfx.active.at(-1).duration, 1120);
});

test("Admin HTML bindings load catalog and complete create, update, and delete", async () => {
  const admin = createAdminHarness();
  admin.listeners.get("nav:click")({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  const list = admin.elements.get("vfx-skill-list");
  assert.equal(admin.elements.get("skill-vfx-view").classList.contains("active"), true);
  assert.equal(admin.elements.get("overview").classList.contains("hidden"), true);
  assert.match(list.innerHTML, /HOA_CAU/);
  assert.equal(admin.elements.get("vfx-form").value, "fireball");
  assert.equal(typeof admin.frames[0], "function");
  admin.frames.shift()(1600);
  assert.equal(admin.context.ctx, admin.canvasContext);
  assert.ok(admin.draws.some((item) => item[4] === "#e56a3e"), "preview should invoke the actual pixel VFX renderer");

  admin.elements.get("vfx-label").value = "Tinh hỏa thử nghiệm";
  admin.elements.get("vfx-form").value = "starburst";
  admin.elements.get("vfx-duration").value = "900";
  await admin.listeners.get("vfx-create:click")();
  let saved = JSON.parse(admin.storage.get("tutien.skillVfxProfiles.v1"));
  assert.equal(saved.HOA_CAU.label, "Tinh hỏa thử nghiệm");
  assert.equal(saved.HOA_CAU.form, "starburst");
  assert.equal(saved.HOA_CAU.durationMs, 900);
  assert.equal(admin.elements.get("vfx-profile-badge").textContent, "Đã tùy chỉnh");

  admin.elements.get("vfx-label").value = "Tinh hỏa đã sửa";
  await admin.listeners.get("vfx-save:click")();
  saved = JSON.parse(admin.storage.get("tutien.skillVfxProfiles.v1"));
  assert.equal(saved.HOA_CAU.label, "Tinh hỏa đã sửa");

  await admin.listeners.get("vfx-delete:click")();
  saved = JSON.parse(admin.storage.get("tutien.skillVfxProfiles.v1"));
  assert.equal(Object.hasOwn(saved, "HOA_CAU"), false);
  assert.equal(admin.elements.get("vfx-profile-badge").textContent, "Mặc định");
});

test("Admin VFX controls stay disabled when the Bearer session is rejected", async () => {
  const admin = createAdminHarness({ authorized: false });
  admin.listeners.get("nav:click")({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(admin.elements.get("vfx-skill-list").innerHTML, /role GM\/ADMIN/);
  assert.equal(admin.elements.get("vfx-create").disabled, true);
  assert.equal(admin.elements.get("vfx-label").disabled, true);
  admin.listeners.get("vfx-create:click")();
  assert.equal(admin.storage.has("tutien.skillVfxProfiles.v1"), false);
});

test("open Admin editor refreshes the selected profile from the server after another tab saves", async () => {
  const admin = createAdminHarness();
  admin.listeners.get("nav:click")({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  admin.profiles.HOA_CAU = { skillCode: "HOA_CAU", root: "THUY", form: "ice-arrow", label: "Băng cầu", durationMs: 700, colors: { main: "#123456", light: "#abcdef", dark: "#101010", accent: "#fedcba" } };
  for (const listener of admin.windowListeners.get("storage")) listener({ key: "tutien.skillVfxProfiles.v1" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(admin.elements.get("vfx-form").value, "ice-arrow");
  assert.equal(admin.elements.get("vfx-root").value, "THUY");
  assert.equal(admin.elements.get("vfx-label").value, "Băng cầu");
  assert.equal(admin.elements.get("vfx-profile-badge").textContent, "Đã tùy chỉnh");
});

test("Admin VFX mutation failure keeps unsaved form values and does not claim success", async () => {
  const admin = createAdminHarness({ failMutations: true });
  admin.listeners.get("nav:click")({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  admin.elements.get("vfx-label").value = "Chưa lưu";
  await admin.listeners.get("vfx-create:click")();

  assert.equal(admin.elements.get("vfx-label").value, "Chưa lưu");
  assert.match(admin.elements.get("vfx-save-state").textContent, /Không lưu được/);
  assert.equal(admin.elements.get("vfx-profile-badge").textContent, "Mặc định");
});
