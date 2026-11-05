// Pixel 2D skill animation layer. This is presentation-only: gameplay success,
// damage, status duration and rewards still come from the existing combat flow.
const SkillVFX = {
  maxActive: 32,
  active: [],
  customProfiles: {},
  storageKey: "tutien.skillVfxProfiles.v1",
  allowedForms: null,
  ownedBuffAuras: [],
  elementalImpactAtlas: "./assets/effects/elemental-impact-atlas-v3.png",

  loadCustomProfiles() {
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) || "{}");
      this.customProfiles = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      this.customProfiles = {};
    }
    return this.customProfiles;
  },

  async loadRemoteProfiles() {
    const path = typeof API !== "undefined" ? API.PATHS?.data?.skillVfx : null;
    if (!path || typeof fetch !== "function") return false;
    try {
      const response = await fetch(API.BASE + path, { cache: "no-store" });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data?.profiles || typeof data.profiles !== "object" || Array.isArray(data.profiles)) return false;
      this.customProfiles = data.profiles;
      return true;
    } catch {
      return false;
    }
  },

  saveCustomProfiles(profiles) {
    const nextProfiles = profiles && typeof profiles === "object" && !Array.isArray(profiles) ? profiles : {};
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(nextProfiles));
      this.customProfiles = nextProfiles;
      return true;
    } catch (error) {
      console.warn("Không thể lưu cấu hình VFX trên trình duyệt:", error.message);
      return false;
    }
  },

  // All 66 current catalog entries have an authored visual form here.
  forms: {
    KIM_KICH: "slash", THIET_HO: "shield", PHA_GIAP: "shatter", KIM_LUAN: "orbit",
    VAN_KIM_TRAM: "blade-rain", KIM_SAT_THANH: "crescent",
    MOC_DUONG: "heal", RE_MOC: "root", SINH_TRUONG: "growth", MOC_LAO: "branch",
    VAN_MOC_THANH: "forest", MOC_HON_DON: "wood-spirit",
    BANG_TIEN: "ice-arrow", THUY_KHIEN: "water-shield", HAN_TRI: "ice-pool",
    THUY_LUU: "water-current", CUU_THIEN_BANG: "snowfall", THUYET_HAI: "tide",
    HOA_CAU: "fireball", HOA_YEM: "candle-flame", LIEN_HOA: "fire-lotus",
    PHAN_THIEN: "solar-mark", THIEN_HOA_LIEN: "volcanic-lotus", HOA_VUC: "flame-field",
    THO_KICH: "stone-strike", THO_GIAP: "stone-armor", SON_CHAN: "quake",
    DIA_MACH: "earth-rune", SON_HA_DAI_THAN: "mountain-slam", THACH_LUYEN: "stone-cage",
    QUANG_DAO: "light-blade", TINH_LOC: "star-heal", THANH_TAY: "purify",
    QUANG_TOC: "light-speed", THIEN_QUANG: "sun-column", NHAT_DIEM: "starburst",
    AM_THICH: "shadow-needles", AM_CHU: "curse-web", THUC_HON: "dark-eye",
    U_MINH: "ghost-hand", CỬU_U_AM_GIOI: "void-field", AM_THUC: "soul-drain",
    PHONG_NHAN: "wind-blade", THANH_PHONG: "leaf-speed", PHONG_BO: "vortex",
    LOAN_PHONG: "cyclone-cage", CUU_TANG_PHONG: "nine-gales", PHONG_LIEU: "wind-wave",
    LOI_KICH: "thunder-strike", LOI_HO: "thunder-shield", DIEN_LIEN: "lightning-chain",
    THIEN_LOI: "sky-bolt", VAN_LOI_THIEN_PHAT: "lightning-rain", LOI_VUC: "storm-field",
    THIEN_CANH: "meditate", NGU_HANH_KICH: "five-elements", THANH_TAM: "clear-heart",
    KIM_TAM_PHAP: "passive-metal", MOC_TAM_PHAP: "passive-leaf", THUY_TAM_PHAP: "passive-water",
    HOA_TAM_PHAP: "passive-flame", THO_TAM_PHAP: "passive-stone", QUANG_TAM_PHAP: "passive-sun",
    AM_TAM_PHAP: "passive-shadow", PHONG_TAM_PHAP: "passive-wind", LOI_TAM_PHAP: "passive-lightning",
    // Older saved characters can still play their familiar starter skills.
    KIM_TRAM: "slash", THUYEN_BANG: "ice-arrow",
  },

  palette: {
    KIM: { main: "#e6c66d", light: "#fff0b2", dark: "#7b6132", accent: "#d7e0e9" },
    MOC: { main: "#71b96e", light: "#c8f29b", dark: "#315b3e", accent: "#e0d17a" },
    THUY: { main: "#4fa6d8", light: "#b9efff", dark: "#315a91", accent: "#e8f5ff" },
    HOA: { main: "#e56a3e", light: "#ffd16b", dark: "#873746", accent: "#fff0ae" },
    THO: { main: "#ae8551", light: "#e4c37a", dark: "#584538", accent: "#c9b9a0" },
    QUANG: { main: "#e8dc8a", light: "#fffbe0", dark: "#a18c4a", accent: "#fff4af" },
    AM: { main: "#9565c6", light: "#d7a6ed", dark: "#4c376f", accent: "#f1c8e7" },
    PHONG: { main: "#62c5b5", light: "#c6f6d2", dark: "#347a81", accent: "#e6f6c4" },
    LOI: { main: "#efcf4f", light: "#fff4a2", dark: "#5570a1", accent: "#a8e7ff" },
    COMMON: { main: "#91c9ba", light: "#e0f8d9", dark: "#456b73", accent: "#f3e4a4" },
  },

  labels: {
    slash: "Kiếm quang pixel",
    shield: "Khiên hộ thể",
    shatter: "Phá giáp",
    orbit: "Linh luân",
    "blade-rain": "Mưa kim nhận",
    crescent: "Trảm nguyệt",
    heal: "Hồi sinh lực",
    root: "Trói rễ",
    growth: "Sinh trưởng",
    branch: "Mộc lao",
    forest: "Lâm trận",
    "wood-spirit": "Mộc hồn",
    "ice-arrow": "Băng tiễn",
    "water-shield": "Thủy khiên",
    "ice-pool": "Hàn trì",
    "water-current": "Thủy lưu",
    snowfall: "Tuyết giáng",
    tide: "Tuyết hải",
    fireball: "Hỏa cầu",
    "candle-flame": "U hỏa",
    "fire-lotus": "Liên hoa hỏa",
    "solar-mark": "Dương ấn",
    "volcanic-lotus": "Hỏa sơn liên",
    "flame-field": "Hỏa vực",
    "stone-strike": "Thạch quyền",
    "stone-armor": "Thổ giáp",
    quake: "Địa chấn",
    "earth-rune": "Địa mạch",
    "mountain-slam": "Sơn hà giáng",
    "stone-cage": "Thạch lao",
    "light-blade": "Quang đao",
    "star-heal": "Tinh lộc",
    purify: "Thanh tẩy",
    "light-speed": "Quang tốc",
    "sun-column": "Thiên quang",
    starburst: "Tinh bạo",
    "shadow-needles": "Ám thích",
    "curse-web": "Ám chú",
    "dark-eye": "Thực hồn",
    "ghost-hand": "U minh",
    "void-field": "Cửu u",
    "soul-drain": "Ám thực",
    "wind-blade": "Phong nhận",
    "leaf-speed": "Thanh phong",
    vortex: "Phong bộ",
    "cyclone-cage": "Loạn phong",
    "nine-gales": "Cửu tầng phong",
    "wind-wave": "Phong liêu",
    "thunder-strike": "Lôi kích",
    "thunder-shield": "Lôi hộ",
    "lightning-chain": "Điện liên",
    "sky-bolt": "Thiên lôi",
    "lightning-rain": "Vạn lôi",
    "storm-field": "Lôi vực",
    meditate: "Thiền cảnh",
    "five-elements": "Ngũ hành kích",
    "clear-heart": "Thanh tâm",
    "passive-metal": "Kim thể",
    "passive-leaf": "Mộc linh",
    "passive-water": "Thủy đức",
    "passive-flame": "Hỏa tâm",
    "passive-stone": "Hậu thổ",
    "passive-sun": "Quang minh",
    "passive-shadow": "U ám",
    "passive-wind": "Phong hành",
    "passive-lightning": "Lôi thể",
  },

  findSkill(skillRef, actor = S.player) {
    const code = String(skillRef?.code || skillRef?.id || skillRef || "");
    if (!code) return null;
    const matches = (skill) => String(skill?.code || skill?.id || "") === code;
    const equipped = (actor?.skills || []).find(matches);
    if (equipped) return this.normalize(equipped);
    const catalog = Object.values(CFG.SKILLS || {}).flatMap((tiers) =>
      Array.isArray(tiers) ? tiers.flat() : [],
    );
    const found = catalog.find(matches);
    return found ? this.normalize(found) : null;
  },

  normalize(skill) {
    if (!skill) return null;
    if (skill.damageType || skill.effectDur !== undefined) {
      return { ...skill, code: skill.code || skill.id, damageType: skill.damageType || skill.type || "PHYS" };
    }
    return typeof mapBESkillToFE === "function" ? mapBESkillToFE(skill) : skill;
  },

  profile(skill) {
    const normalized = this.normalize(skill);
    const code = String(normalized?.code || normalized?.id || "");
    const root = String(normalized?.linhCan || "COMMON").toUpperCase();
    const custom = this.customProfiles[code] || {};
    const baseRoot = this.palette[root] ? root : "COMMON";
    const customRoot = this.palette[String(custom.root || "").toUpperCase()] ? String(custom.root).toUpperCase() : baseRoot;
    const effect = String(normalized?.effect || "").toLowerCase();
    const skillName = String(normalized?.name || normalized?.tenNangLuc || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const isLightningShield = (root === "LOI" && ["shield", "buff_def", "buff_vitals"].includes(effect))
      || /than loi ho the|loi ho/.test(skillName);
    if (!this.allowedForms) this.allowedForms = new Set(Object.values(this.forms));
    const form = this.allowedForms.has(custom.form)
      ? custom.form
      : (this.forms[code] || (isLightningShield ? "thunder-shield" : this.fallbackForm(normalized)));
    const tier = Math.max(1, Number(normalized?.tier || 1));
    const basePalette = this.palette[customRoot] || this.palette.COMMON;
    const colors = custom.colors && typeof custom.colors === "object" ? custom.colors : {};
    const requestedDuration = Number(custom.durationMs);
    return {
      code,
      root: customRoot,
      form,
      effect,
      tier,
      aoe: Boolean(normalized?.aoe || Number(normalized?.aoeR || 0) > 0),
      aoeR: Number(normalized?.aoeR || 0),
      category: String(normalized?.category || "ACTIVE").toUpperCase(),
      label: String(custom.label || this.labels[form] || normalized?.name || "Thần thông").slice(0, 60),
      durationMs: Number.isFinite(requestedDuration) && requestedDuration > 0
        ? Math.max(300, Math.min(1200, requestedDuration))
        : null,
      palette: {
        main: this.validColor(colors.main) ? colors.main : basePalette.main,
        light: this.validColor(colors.light) ? colors.light : basePalette.light,
        dark: this.validColor(colors.dark) ? colors.dark : basePalette.dark,
        accent: this.validColor(colors.accent) ? colors.accent : basePalette.accent,
      },
    };
  },

  validColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")); },

  fallbackForm(skill) {
    const effect = String(skill?.effect || "");
    if (effect === "heal") return "heal";
    if (effect === "restore_mp") return "meditate";
    if (effect === "cleanse") return "clear-heart";
    if (effect === "root") return "root";
    if (effect === "stun") return "lightning-chain";
    if (effect === "slow" || effect === "freeze") return "ice-pool";
    if (effect === "burn") return "flame-field";
    if (effect === "curse" || effect === "weaken" || effect === "drain") return "ghost-hand";
    if (effect === "shield" || effect === "buff_def" || effect === "buff_vitals") return "shield";
    if (effect.startsWith("buff_")) return "orbit";
    if (skill?.aoe || Number(skill?.aoeR || 0) > 0) return "field";
    return skill?.damageType === "PHYS" ? "slash" : "projectile";
  },

  point(actor) {
    return { x: Number(actor?.px ?? actor?.x ?? 0), y: Number(actor?.py ?? actor?.y ?? 0) };
  },

  spawn(skill, source, targets, mode = "impact") {
    if (!skill || !source) return;
    const profile = this.profile(skill);
    const from = this.point(source);
    const points = (targets || []).slice(0, 12).map((target) => ({
      ...this.point(target),
      miss: Boolean(target?.miss),
      critical: Boolean(target?.critical),
    }));
    if (!points.length) points.push({ ...from, miss: false, critical: false });
    const duration = mode === "charge" ? 420 : (profile.durationMs || (profile.tier >= 3 ? 1120 : 980));
    this.active.push({ profile, from, targets: points, mode, startedAt: Date.now(), duration });
    if (this.active.length > this.maxActive) this.active.splice(0, this.active.length - this.maxActive);
  },

  charge(skill, source, target = null) {
    this.spawn(skill, source, target ? [target] : [], "charge");
  },

  cancelCharge() {
    this.active = this.active.filter((entry) => entry.mode !== "charge");
  },

  impact(skill, source, targets) {
    this.spawn(skill, source, targets, "impact");
  },

  support(skill, source) {
    this.spawn(skill, source, [source], "support");
  },

  activateBuff(skillData, durationMs) {
    const skill = this.normalize(skillData);
    if (!skill) return false;
    const effect = String(skill.effect || "").toLowerCase();
    if (!["shield", "speed", "buff_atk", "buff_def", "buff_crit", "buff_spd", "buff_cast", "buff_hp_regen", "buff_mp_regen", "buff_vitals"].includes(effect)) return false;
    const duration = Number(durationMs) > 0
      ? Number(durationMs)
      : Number(skill.effectDur || 0) * (1000 / 60);
    if (!(duration > 0)) return false;
    const code = String(skill.code || skill.id || effect);
    const now = Date.now();
    this.ownedBuffAuras = this.ownedBuffAuras.filter((entry) => entry.code !== code && entry.expiresAt > now);
    this.ownedBuffAuras.push({ skill, code, effect, expiresAt: now + duration });
    return true;
  },

  basicAttack(source, target, outcome = {}) {
    if (!source || !target) return;
    const root = String(source.linhCan || "COMMON").toUpperCase();
    const profile = {
      code: "BASIC_ATTACK",
      root: this.palette[root] ? root : "COMMON",
      form: "slash",
      tier: 1,
      category: "ACTIVE",
      aoeR: 0,
    };
    this.active.push({
      profile,
      from: this.point(source),
      targets: [{ ...this.point(target), miss: Boolean(outcome.miss), critical: Boolean(outcome.critical) }],
      mode: "basic-attack",
      startedAt: Date.now(),
      duration: 300,
    });
    if (this.active.length > this.maxActive) this.active.splice(0, this.active.length - this.maxActive);
  },

  monsterAttack(monster, target, outcome = {}) {
    if (!monster || !target) return;
    const element = String(monster.linhCan || monster.element || monster.nguHanh?.[0] || "COMMON").toUpperCase();
    const attackType = String(monster.attackType || "PHYSICAL").toUpperCase();
    const forms = {
      KIM: "slash", MOC: "root", THUY: "ice-arrow", HOA: "fireball", THO: "stone-strike",
      QUANG: "light-blade", AM: "shadow-needles", PHONG: "wind-wave", LOI: "thunder-strike",
    };
    const root = this.palette[element] ? element : "COMMON";
    const profile = {
      code: `MONSTER_${root}_ATTACK`,
      root,
      form: attackType === "MAGIC" ? (forms[root] || "projectile") : "claw",
      tier: Math.max(1, Number(monster.tier || 1)),
      category: "ACTIVE",
      aoeR: 0,
    };
    this.active.push({
      profile,
      from: this.point(monster),
      targets: [{ ...this.point(target), miss: Boolean(outcome.miss), critical: false }],
      mode: "monster-attack",
      startedAt: Date.now(),
      duration: profile.form === "claw" ? 340 : 520,
    });
    if (this.active.length > this.maxActive) this.active.splice(0, this.active.length - this.maxActive);
  },

  preview(skillData) {
    const skill = this.normalize(skillData);
    if (!S.player || !skill) return;
    const source = S.player;
    if (String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE") {
      this.spawn(skill, source, [source], "preview");
      return;
    }
    const offensive = Number(skill.satThuong || 0) > 0 && !["heal", "shield", "cleanse", "speed"].includes(String(skill.effect || ""));
    if (!offensive) {
      this.spawn(skill, source, [source], "preview-support");
      return;
    }
    const maxRange = Number(skill.range || 5) * CFG.SKILL_RANGE_SCALE;
    const target = (S.target && !S.target.dead && dist(S.target.px, S.target.py, source.px, source.py) <= maxRange)
      ? S.target
      : (S.monsters || [])
          .filter((monster) => !monster.dead)
          .sort((a, b) => dist(a.px, a.py, source.px, source.py) - dist(b.px, b.py, source.px, source.py))
          .find((monster) => dist(monster.px, monster.py, source.px, source.py) <= maxRange);
    const previewTarget = target || { px: source.px + (source.direction === "left" ? -36 : 36), py: source.py };
    this.spawn(skill, source, [previewTarget], "preview");
  },

  draw(cameraX, cameraY, layer = "all") {
    if (!ctx) return;
    const now = Date.now();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    this.active = this.active.filter((entry) => now - entry.startedAt < (reduceMotion ? Math.min(entry.duration, 360) : entry.duration));
    ctx.save();
    try {
      for (const entry of this.active) {
        const staysBehindActors = entry.mode === "charge" || entry.mode === "support" || entry.mode === "preview-support" || entry.profile.category === "PASSIVE";
        const splitLightning = ["thunder-shield", "passive-lightning"].includes(entry.profile.form)
          && (entry.mode === "support" || entry.mode === "preview-support" || entry.profile.category === "PASSIVE");
        if (layer === "behind" && !staysBehindActors && !splitLightning) continue;
        if (layer === "front" && staysBehindActors && !splitLightning) continue;
        const elapsed = now - entry.startedAt;
        const progress = reduceMotion ? 0.55 : Math.max(0, Math.min(1, elapsed / entry.duration));
        const palette = entry.profile.palette || this.palette[entry.profile.root] || this.palette.COMMON;
        const origin = { x: entry.from.x - cameraX, y: entry.from.y - cameraY };
        if (entry.mode === "charge") this.drawCharge(origin, entry.profile, palette, progress);
        else if (entry.mode === "support" || entry.mode === "preview-support") {
          this.drawSupport(origin, entry.profile, palette, progress, layer);
          if (entry.mode === "preview-support" && layer !== "front") this.drawPixelRing(origin.x, origin.y - 4, 23, palette.light, 0.45, 1);
        }
        else if (entry.mode === "monster-attack") {
          const target = entry.targets[0];
          if (target) this.drawMonsterAttack(origin, { x: target.x - cameraX, y: target.y - cameraY }, entry.profile, palette, progress, target);
        } else if (entry.profile.category === "PASSIVE") this.drawPassive(origin, entry.profile, palette, progress, layer);
        else {
          for (const target of entry.targets) {
            const point = { x: target.x - cameraX, y: target.y - cameraY };
            if (entry.mode === "basic-attack") this.drawMelee(origin, point, palette, progress, target, entry.profile.tier);
            else this.drawImpact(origin, point, entry.profile, palette, progress, target, entry.mode === "preview");
          }
        }
      }
      if (typeof VisualEffects !== "undefined" && VisualEffects.arePersistentEffectsEnabled()) {
        this.drawOwnedPassive(cameraX, cameraY, now, reduceMotion, layer);
        this.drawOwnedBuffs(cameraX, cameraY, now, layer);
      }
    } finally {
      ctx.restore();
    }
  },

  colorStamp(x, y, size, color, alpha = 1) {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = color;
    const px = Math.round(x / 2) * 2;
    const py = Math.round(y / 2) * 2;
    ctx.fillRect(px - Math.floor(size / 2), py - Math.floor(size / 2), size, size);
  },

  drawCharge(origin, profile, palette, progress) {
    const pulse = progress < 0.55 ? 1 : 0.62;
    const lift = progress * 5;
    const forms = {
      KIM: [[-8, 1], [-4, -5], [4, -4], [8, 2]],
      MOC: [[-8, -2], [-4, -7], [3, -5], [8, 0]],
      THUY: [[-7, 1], [-4, -6], [4, -6], [7, 1]],
      HOA: [[-7, 1], [-3, -5], [3, -7], [7, 0]],
      THO: [[-8, 2], [-4, -4], [4, -4], [8, 2]],
      QUANG: [[-8, 0], [-4, -5], [0, -8], [5, -5], [8, 0]],
      AM: [[-8, 2], [-4, -4], [4, -4], [8, 2]],
      PHONG: [[-9, -1], [-5, -5], [2, -3], [8, 1]],
      LOI: [[-7, 2], [-3, -5], [3, 1], [7, -6]],
      COMMON: [[-7, 0], [-3, -6], [3, -6], [7, 0]],
    }[profile.root] || [];
    for (let i = 0; i < forms.length; i += 1) {
      const [x, y] = forms[i];
      const drift = Math.sin(progress * Math.PI * 2 + i * Math.PI / 2) * 2;
      this.colorStamp(origin.x + x + drift, origin.y + y - lift, i % 2 ? 3 : 4, i % 2 ? palette.main : palette.light, pulse);
    }
    this.colorStamp(origin.x, origin.y - 3 - lift, 3, palette.accent, pulse);
    this.drawPixelRing(origin.x, origin.y + 3, 7 + progress * 3, palette.dark, pulse * 0.5, 1);
  },

  drawImpact(origin, target, profile, palette, progress, outcome, preview) {
    const form = profile.form;
    const isSelf = form.startsWith("passive-") || ["heal", "growth", "shield", "water-shield", "stone-armor", "thunder-shield", "meditate", "clear-heart", "solar-mark", "light-speed", "leaf-speed", "earth-rune"].includes(form);
    const missOffset = outcome.miss ? 6 : 0;
    const point = isSelf
      ? origin
      : { x: target.x + missOffset, y: target.y - missOffset * 0.5 };
    if (form === "shatter") {
      this.drawShatter(point, palette, progress, profile.tier);
    } else if (["slash", "crescent", "light-blade", "wind-blade", "stone-strike"].includes(form)) {
      this.drawSlash(origin, point, palette, progress, profile.tier, form);
    } else if (["projectile", "fireball", "ice-arrow", "wood-spirit", "shadow-needles", "candle-flame"].includes(form)) {
      this.drawProjectile(origin, point, palette, progress, form, profile.tier);
    } else if (form === "forest") {
      this.drawForest(point, palette, progress, profile.tier);
    } else if (form === "stone-cage") {
      this.drawStoneCage(point, palette, progress, profile.tier);
    } else if (form === "cyclone-cage") {
      this.drawCycloneCage(point, palette, progress, profile.tier);
    } else if (["root", "branch", "curse-web"].includes(form)) {
      this.drawRoot(point, palette, progress, form, profile.tier);
    } else if (form === "growth") {
      this.drawGrowth(point, palette, progress, form, profile.tier);
    } else if (["shield", "water-shield", "stone-armor", "thunder-shield"].includes(form)) {
      this.drawShield(origin, palette, progress, profile.tier, form);
    } else if (form === "mountain-slam") {
      this.drawMountainSlam(point, palette, progress, profile.tier);
    } else if (["quake", "earth-rune"].includes(form)) {
      this.drawQuake(point, palette, progress, profile.tier);
    } else if (["lightning-chain", "sky-bolt", "thunder-strike", "lightning-rain"].includes(form)) {
      this.drawLightning(origin, point, palette, progress, form, profile.tier);
    } else if (["tide", "water-current", "wind-wave", "vortex", "nine-gales"].includes(form)) {
      this.drawWave(origin, point, palette, progress, form, profile.tier);
    } else if (["snowfall", "blade-rain", "sun-column", "volcanic-lotus"].includes(form)) {
      this.drawRain(point, palette, progress, form, profile.tier);
    } else if (form === "fire-lotus") {
      this.drawLotus(point, palette, progress, profile.tier);
    } else if (form === "starburst") {
      this.drawStarburst(point, palette, progress, profile.tier);
    } else if (form === "dark-eye") {
      this.drawDarkEye(point, palette, progress, profile.tier);
    } else if (form === "ghost-hand") {
      this.drawGhostHand(point, palette, progress, profile.tier);
    } else if (["soul-drain", "am-thuc"].includes(form)) {
      this.drawSoulDrain(origin, point, palette, progress, form);
    } else if (["ice-pool", "flame-field", "void-field", "storm-field", "field"].includes(form)) {
      this.drawField(point, palette, progress, profile, form);
    } else if (["curse-web", "ghost-hand", "dark-eye", "soul-drain", "void-field", "am-thuc"].includes(form)) {
      this.drawCurse(point, palette, progress, form, profile.tier);
    } else if (["heal", "growth", "star-heal", "purify", "clear-heart", "solar-mark", "light-speed", "leaf-speed", "meditate", "five-elements", "fivefold", "fire-lotus", "starburst", "thien-quang"].includes(form)) {
      this.drawSupport(point, profile, palette, progress);
    } else if (["orbit", "five-elements", "meditate", "clear-heart", "solar-mark", "light-speed", "leaf-speed", "purify", "star-heal", "heal"].includes(form)) {
      this.drawOrbit(point, palette, progress, form, profile.tier);
    } else {
      this.drawBurst(point, palette, progress, profile.tier, profile.aoeR);
    }
    if (outcome.miss) {
      this.colorStamp(target.x + 7, target.y - 8, 3, palette.accent, 0.86);
      this.colorStamp(target.x + 12, target.y - 12, 2, palette.light, 0.76);
    }
    this.drawElementalImpact(point, profile, progress, outcome, preview);
    if (preview) this.drawPixelRing(target.x, target.y, 10 + progress * 4, palette.light, 0.45, 1);
    if (outcome.critical && progress > 0.55) this.drawBurst(point, { ...palette, main: palette.light }, progress, profile.tier + 1, profile.aoeR);
  },

  drawElementalImpact(point, profile, progress, outcome = {}, preview = false) {
    if (outcome.miss || typeof Render === "undefined" || !ctx) return;
    const rows = { LOI: 0, HOA: 1, THUY: 2, THO: 3, MOC: 4 };
    const row = rows[String(profile.root || "").toUpperCase()];
    if (row === undefined) return;
    const tier = Math.max(1, Number(profile.tier || 1));
    const frame = Math.min(3, Math.max(0, Math.floor(progress * 4)));
    const size = Math.min(58, 42 + (tier - 1) * 5);
    const previousSmoothing = ctx.imageSmoothingEnabled;
    const previousAlpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = false;
    if (preview) ctx.globalAlpha *= 0.76;
    try {
      Render.drawSprite(this.elementalImpactAtlas, point.x, point.y - 2, size, size, {
        col: frame,
        row,
        cols: 4,
        rows: 5,
      });
    } finally {
      ctx.imageSmoothingEnabled = previousSmoothing;
      ctx.globalAlpha = previousAlpha;
    }
  },

  drawMonsterAttack(origin, target, profile, palette, progress, outcome) {
    if (profile.form === "claw") {
      this.drawMelee(origin, target, palette, progress, outcome, profile.tier);
      return;
    }
    if (profile.form === "root") this.drawRoot(target, palette, progress, profile.form, profile.tier);
    else if (profile.form === "stone-strike") this.drawQuake(target, palette, progress, profile.tier);
    else this.drawProjectile(origin, target, palette, progress, profile.form, profile.tier);
    if (outcome.miss && progress > 0.72) this.drawPixelRing(target.x + 8, target.y - 5, 4, palette.accent, 0.75, 2);
  },

  drawMelee(origin, point, palette, progress, outcome, tier) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const sideX = -uy;
    const sideY = ux;
    const reach = Math.min(length, 13 + Math.sin(Math.min(1, progress * 1.2) * Math.PI) * (tier >= 3 ? 22 : 17));
    const endX = origin.x + ux * reach;
    const endY = origin.y + uy * reach - 5;
    if (progress > 0.08 && progress < 0.92) {
      for (let i = -3; i <= 3; i += 1) {
        const x = endX + sideX * i * 2.2;
        const y = endY + sideY * i * 2.2;
        this.colorStamp(x, y, Math.abs(i) === 3 ? 2 : 3, i % 2 ? palette.main : palette.light, 1 - progress * 0.55);
      }
    }
    if (progress > 0.55) {
      if (outcome.miss) this.drawPixelRing(point.x + ux * 7, point.y - 5, 5, palette.accent, 0.7, 1);
      else this.drawBurst(point, palette, (progress - 0.55) / 0.45, tier, 0);
    }
  },

  drawShatter(point, palette, progress, tier) {
    const shards = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const scatter = 3 + progress * (9 + (tier >= 3 ? 6 : 0));
    for (let i = 0; i < shards.length; i += 1) {
      const [dx, dy] = shards[i];
      const distance = scatter + (i % 3) * 2;
      this.colorStamp(point.x + dx * distance, point.y - 4 + dy * distance, i % 2 ? 3 : 4, i % 3 ? palette.main : palette.light, 1 - progress * 0.58);
    }
    this.colorStamp(point.x, point.y - 5, 5, palette.accent, Math.max(0.3, 1 - progress));
  },

  drawGrowth(point, palette, progress, form, tier) {
    const height = 4 + progress * (14 + (tier >= 3 ? 7 : 0));
    for (let stem = -1; stem <= 1; stem += 1) {
      const x = point.x + stem * 6;
      this.colorStamp(x, point.y + 2 - height * 0.45, 2, palette.dark, 0.95);
      this.colorStamp(x, point.y + 1 - height, 2, palette.main, 0.95);
      this.colorStamp(x - 3, point.y - height * 0.62, 3, palette.light, 0.9);
      this.colorStamp(x + 3, point.y - height * 0.82, 3, palette.main, 0.9);
    }
  },

  drawForest(point, palette, progress, tier) {
    const height = 9 + progress * (10 + (tier >= 3 ? 6 : 0));
    for (let tree = -1; tree <= 1; tree += 1) {
      const x = point.x + tree * 12;
      const canopy = height * (tree === 0 ? 1 : 0.72);
      for (let row = 0; row < 3; row += 1) {
        const width = 3 - row;
        for (let column = -width; column <= width; column += 1) {
          this.colorStamp(x + column * 3, point.y - canopy + row * 4, row === 1 ? 4 : 3, column % 2 ? palette.main : palette.light, 0.92);
        }
      }
      this.colorStamp(x, point.y + 1, 3, palette.dark, 0.92);
    }
    this.drawPixelRing(point.x, point.y + 5, 14 + progress * 7, palette.main, 0.65, 2);
  },

  drawStoneCage(point, palette, progress, tier) {
    const height = 7 + progress * (12 + (tier >= 3 ? 6 : 0));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const x = point.x + side * (9 + (i % 2) * 5);
        const y = point.y + 4 - height + i * 3;
        this.colorStamp(x, y, 4, i === 1 ? palette.light : palette.main, 0.95);
        this.colorStamp(x, y + 5, 3, palette.dark, 0.9);
      }
    }
    this.drawPixelRing(point.x, point.y + 5, 12 + progress * 5, palette.dark, 0.58, 2);
  },

  drawCycloneCage(point, palette, progress, tier) {
    const height = 8 + progress * (14 + (tier >= 3 ? 5 : 0));
    for (let i = 0; i < 6; i += 1) {
      const phase = progress * Math.PI * 2 + i * Math.PI / 3;
      const x = point.x + Math.round(Math.cos(phase) * (9 + i % 2 * 3));
      const y = point.y - height + i * 3;
      this.colorStamp(x, y, 4, i % 2 ? palette.main : palette.light, 0.92);
      this.colorStamp(x - 3, y + 4, 2, palette.accent, 0.78);
    }
    this.colorStamp(point.x, point.y - 6, 3, palette.light, 0.86);
  },

  drawMountainSlam(point, palette, progress, tier) {
    const fall = Math.min(1, progress * 1.6);
    const boulderY = point.y - 28 + fall * 27;
    for (let row = 0; row < 3; row += 1) {
      for (let col = -row; col <= row; col += 1) {
        this.colorStamp(point.x + col * 4, boulderY + row * 3, 4, row === 0 ? palette.light : palette.main, 0.95);
      }
    }
    if (progress > 0.48) this.drawQuake(point, palette, (progress - 0.48) / 0.52, tier);
  },

  drawDarkEye(point, palette, progress, tier) {
    const open = Math.min(1, progress * 2.2);
    for (let i = -5; i <= 5; i += 1) {
      const height = Math.max(1, Math.round((5 - Math.abs(i)) * open * 0.5));
      this.colorStamp(point.x + i * 2, point.y - 7 - height, 2, palette.main, 0.92);
      this.colorStamp(point.x + i * 2, point.y - 7 + height, 2, palette.main, 0.92);
    }
    this.colorStamp(point.x, point.y - 7, tier >= 3 ? 5 : 4, palette.dark, 0.98);
    this.colorStamp(point.x, point.y - 7, 2, palette.light, 1);
    if (progress > 0.4) this.colorStamp(point.x + (progress > 0.7 ? 1 : 0), point.y - 7, 1, palette.accent, 1);
  },

  drawGhostHand(point, palette, progress, tier) {
    const rise = progress * (12 + (tier >= 3 ? 5 : 0));
    const palmY = point.y + 2 - rise;
    this.colorStamp(point.x, palmY, 6, palette.main, 0.86);
    for (let finger = -2; finger <= 2; finger += 1) {
      const height = 5 + (2 - Math.abs(finger)) * 2;
      this.colorStamp(point.x + finger * 3, palmY - height, 2, palette.light, 0.92);
    }
    this.colorStamp(point.x - 7, palmY - 3, 2, palette.accent, 0.82);
    this.colorStamp(point.x + 7, palmY - 3, 2, palette.accent, 0.82);
  },

  drawSoulDrain(origin, point, palette, progress, form) {
    const steps = 7;
    for (let i = 0; i < steps; i += 1) {
      const t = Math.max(0, 1 - progress) * (i / (steps - 1));
      const x = point.x + (origin.x - point.x) * t;
      const y = point.y - 7 + (origin.y - point.y) * t + Math.sin(progress * 9 + i * 1.4) * 3;
      this.colorStamp(x, y, i % 2 ? 2 : 3, i % 2 ? palette.main : palette.light, 0.9 - i * 0.06);
    }
    this.colorStamp(point.x, point.y - 6, 5, form === "am-thuc" ? palette.accent : palette.dark, 0.94);
    this.colorStamp(point.x, point.y - 6, 2, palette.light, 1);
  },

  drawLotus(point, palette, progress, tier) {
    const spread = 4 + progress * (8 + (tier >= 3 ? 5 : 0));
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      const x = point.x + Math.round(Math.cos(angle) * spread);
      const y = point.y - 5 + Math.round(Math.sin(angle) * spread * 0.58);
      this.colorStamp(x, y, i % 2 ? 3 : 4, i % 2 ? palette.main : palette.light, 0.95);
      this.colorStamp(x, y + 4, 2, palette.accent, 0.88);
    }
    this.colorStamp(point.x, point.y - 5, 4, palette.light, 1);
    this.drawBurst(point, palette, progress, tier, 0);
  },

  drawStarburst(point, palette, progress, tier) {
    const rays = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    const reach = 4 + progress * (11 + (tier >= 3 ? 6 : 0));
    for (let i = 0; i < rays.length; i += 1) {
      const [dx, dy] = rays[i];
      for (let step = 1; step <= 3; step += 1) {
        this.colorStamp(point.x + dx * reach * step / 3, point.y - 5 + dy * reach * step / 3, step === 2 ? 3 : 2, i % 2 ? palette.main : palette.light, 1 - progress * 0.52);
      }
    }
    this.colorStamp(point.x, point.y - 5, 5, palette.accent, 0.95);
  },

  drawPixelRing(x, y, radius, color, alpha, size) {
    const points = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    for (const [dx, dy] of points) this.colorStamp(x + dx * radius, y + dy * radius, size, color, alpha);
  },

  drawBurst(point, palette, progress, tier, aoeR = 0) {
    const radius = 4 + progress * (8 + Math.min(aoeR, 3) * 3) * (tier >= 3 ? 1.3 : 1);
    const alpha = Math.max(0.22, 1 - progress * 0.72);
    this.drawPixelRing(point.x, point.y, radius, palette.main, alpha, 3);
    this.drawPixelRing(point.x, point.y, radius * 0.62, palette.light, alpha, 2);
    const sparks = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -2], [2, 0], [0, 2], [-2, 0]];
    for (let i = 0; i < sparks.length; i += 1) {
      const [dx, dy] = sparks[i];
      const travel = 5 + progress * (8 + (i % 3) * 2);
      this.colorStamp(point.x + dx * travel, point.y + dy * travel, i % 2 ? 2 : 3, i % 3 ? palette.accent : palette.light, alpha);
    }
  },

  drawSlash(origin, point, palette, progress, tier, form = "slash") {
    if (progress < 0.18 || progress > 0.9) return;
    if (form === "crescent") {
      const spread = 5 + progress * (12 + (tier >= 3 ? 7 : 0));
      for (let i = -4; i <= 4; i += 1) {
        const x = point.x + i * 2.4;
        const y = point.y - 8 - Math.sqrt(Math.max(0, 16 - i * i)) * spread * 0.48;
        this.colorStamp(x, y, Math.abs(i) < 2 ? 3 : 2, i % 2 ? palette.main : palette.light, 0.95);
      }
      this.drawBurst(point, palette, Math.max(0, progress - 0.5), tier, 0);
      return;
    }
    if (form === "wind-blade") {
      for (let blade = -1; blade <= 1; blade += 1) {
        for (let step = 0; step < 6; step += 1) {
          this.colorStamp(point.x - 10 + step * 4, point.y - 10 + blade * 5 + step * 2, 3, step % 2 ? palette.main : palette.light, 0.9 - progress * 0.35);
        }
      }
      return;
    }
    if (form === "light-blade") {
      for (let step = -4; step <= 4; step += 1) {
        this.colorStamp(point.x + step * 2, point.y - 8 + step * 2, 3, palette.light, 0.95);
        this.colorStamp(point.x + step * 2, point.y + 8 - step * 2, 2, palette.main, 0.86);
      }
      this.colorStamp(point.x, point.y - 5, 4, palette.accent, 1);
      return;
    }
    if (form === "stone-strike") {
      this.drawStoneStrike(origin, point, palette, progress, tier);
      return;
    }
    const amount = Math.min(7, Math.floor((progress - 0.12) * 12));
    const horizontal = Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y);
    const alpha = Math.max(0.28, 1 - progress * 0.7);
    for (let i = -amount; i <= amount; i += 1) {
      const offset = i * 3;
      const x = horizontal ? point.x + offset : point.x + Math.sign(point.x - origin.x || 1) * 4;
      const y = horizontal ? point.y - offset - 5 : point.y + offset;
      this.colorStamp(x, y, i % 2 ? 3 : 4, palette.light, alpha);
      this.colorStamp(x + (horizontal ? 0 : 2), y + (horizontal ? 2 : 0), 2, palette.main, alpha * 0.85);
    }
    this.drawBurst(point, palette, Math.max(0, progress - 0.45), tier, 0);
  },

  drawStoneStrike(origin, point, palette, progress, tier) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const travel = Math.min(1, progress / 0.55);
    const fistX = origin.x + dx * travel;
    const fistY = origin.y + dy * travel - 3;
    for (let i = -2; i <= 2; i += 1) {
      this.colorStamp(fistX + i * 3, fistY + Math.abs(i), i % 2 ? 4 : 5, i === 0 ? palette.light : palette.main, 1 - progress * 0.45);
    }
    this.colorStamp(fistX - dy / length * 5, fistY + dx / length * 5, 3, palette.dark, 0.9);
    if (progress > 0.5) this.drawQuake(point, palette, (progress - 0.5) / 0.5, tier);
  },

  drawProjectile(origin, point, palette, progress, form, tier) {
    const travel = Math.min(1, progress / 0.68);
    const headX = origin.x + (point.x - origin.x) * travel;
    const headY = origin.y + (point.y - origin.y) * travel;
    const dx = point.x - origin.x, dy = point.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const trailX = -dx / length, trailY = -dy / length;
    const count = form === "shadow-needles" ? 5 : 4;
    for (let i = count; i >= 0; i -= 1) {
      const size = Math.max(2, 5 - i * 0.7);
      this.colorStamp(headX + trailX * i * 3, headY + trailY * i * 3, size, i < 2 ? palette.light : palette.main, (1 - progress * 0.55) * (1 - i * 0.1));
    }
    if (form === "fireball" || form === "candle-flame") {
      this.colorStamp(headX - 3, headY + 4, 3, palette.accent, 0.8);
      this.colorStamp(headX + 4, headY - 3, 2, palette.light, 0.9);
    } else if (form === "ice-arrow") {
      this.colorStamp(headX - 4, headY - 3, 2, palette.accent, 0.9);
      this.colorStamp(headX + 3, headY + 4, 2, palette.accent, 0.9);
    } else if (form === "wood-spirit") {
      this.colorStamp(headX - 3, headY - 4, 3, palette.accent, 0.92);
      this.colorStamp(headX + 4, headY + 2, 2, palette.light, 0.92);
    }
    if (progress > 0.62) this.drawBurst(point, palette, (progress - 0.62) / 0.38, tier, 0);
  },

  drawRoot(point, palette, progress, form, tier) {
    const height = 6 + progress * (14 + (tier >= 3 ? 6 : 0));
    const alpha = Math.max(0.35, 1 - progress * 0.5);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        const rise = Math.min(height, i * 4 + progress * 7);
        this.colorStamp(point.x + side * (7 + (i % 2) * 2), point.y - rise, 3, i % 2 ? palette.dark : palette.main, alpha);
        if (form === "curse-web" && i < 3) this.colorStamp(point.x + side * (4 + i * 4), point.y - 8, 2, palette.light, alpha * 0.65);
      }
    }
    if (progress > 0.35) {
      this.drawPixelRing(point.x, point.y - 5, 11 + progress * 2, palette.main, alpha, 2);
      this.colorStamp(point.x, point.y - 12, 3, palette.light, alpha);
    }
  },

  drawShield(point, palette, progress, tier, form = "shield") {
    const points = [[0, -14], [7, -11], [11, -5], [10, 4], [5, 11], [0, 15], [-5, 11], [-10, 4], [-11, -5], [-7, -11]];
    const alpha = 0.45 + Math.sin(progress * Math.PI * 4) * 0.25;
    const size = tier >= 3 ? 3 : 2;
    for (let i = 0; i < points.length; i += 1) {
      const [x, y] = points[i];
      this.colorStamp(point.x + x, point.y - 8 + y, size, i % 2 ? palette.main : palette.light, alpha);
    }
    this.drawPixelRing(point.x, point.y, 18 + (tier >= 3 ? 3 : 0), palette.accent, alpha * 0.55, 1);
    if (form === "water-shield") {
      for (const side of [-1, 1]) this.colorStamp(point.x + side * 7, point.y - 3, 3, palette.accent, alpha);
    } else if (form === "stone-armor") {
      for (const side of [-1, 1]) {
        this.colorStamp(point.x + side * 12, point.y - 2, 4, palette.dark, alpha);
        this.colorStamp(point.x + side * 7, point.y + 6, 3, palette.main, alpha);
      }
    } else if (form === "thunder-shield") {
      this.colorStamp(point.x - 5, point.y - 10, 3, palette.accent, 0.95);
      this.colorStamp(point.x + 4, point.y + 2, 3, palette.accent, 0.95);
    }
  },

  drawQuake(point, palette, progress, tier) {
    const radius = 5 + progress * (17 + (tier >= 3 ? 7 : 0));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        const x = point.x + side * (radius * (0.35 + i * 0.16));
        const y = point.y + 5 - i * (2 + progress * 4);
        this.colorStamp(x, y, i % 2 ? 3 : 4, i === 3 ? palette.light : palette.main, 1 - progress * 0.55);
      }
    }
    this.drawPixelRing(point.x, point.y + 5, radius, palette.dark, 0.72, 2);
  },

  drawLightning(origin, point, palette, progress, form, tier) {
    if (form === "lightning-chain") {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const length = Math.hypot(dx, dy) || 1;
      const sideX = -dy / length;
      const sideY = dx / length;
      for (let i = 0; i <= 8; i += 1) {
        const t = i / 8;
        const jitter = i === 0 || i === 8 ? 0 : (i % 2 ? 4 : -4);
        this.colorStamp(origin.x + dx * t + sideX * jitter, origin.y + dy * t + sideY * jitter, i % 2 ? 3 : 4, i % 2 ? palette.light : palette.main, 0.96);
      }
      if (progress > 0.58) this.drawBurst(point, palette, (progress - 0.58) / 0.42, tier, 0);
      return;
    }
    const bolts = form === "lightning-rain" ? 5 : (form === "lightning-chain" ? 3 : 1);
    const startY = point.y - (25 + (tier >= 3 ? 8 : 0)) * (1 - Math.min(1, progress * 1.4));
    for (let bolt = 0; bolt < bolts; bolt += 1) {
      const shift = (bolt - (bolts - 1) / 2) * 8;
      const zig = [0, 3, -2, 4, -3, 1, 0];
      for (let i = 0; i < zig.length; i += 1) {
        const x = point.x + shift + zig[i];
        const y = startY + i * 5;
        this.colorStamp(x, y, i % 2 ? 3 : 4, i % 3 ? palette.light : palette.main, 0.95);
      }
    }
    if (progress > 0.45) this.drawBurst(point, palette, (progress - 0.45) / 0.55, tier, 0);
  },

  drawWave(origin, point, palette, progress, form, tier) {
    const direction = Math.sign(point.x - origin.x || 1);
    const span = 8 + progress * (24 + (tier >= 3 ? 12 : 0));
    const yOffset = form === "tide" ? 5 : 2;
    const count = form === "nine-gales" ? 9 : (form === "vortex" ? 5 : 7);
    for (let i = 0; i < count; i += 1) {
      const x = point.x - direction * (span - i * 4);
      const wave = Math.sin(i * 1.8 + progress * 8) * (form === "tide" ? 7 : 4);
      const y = point.y + yOffset + wave;
      const size = form === "tide" ? (i % 2 ? 5 : 7) : (i % 2 ? 3 : 5);
      this.colorStamp(x, y, size, i % 2 ? palette.main : palette.light, 0.9 - i * 0.045);
      this.colorStamp(x, y + (form === "wind-wave" ? -4 : 5), 2, palette.accent, 0.7 - i * 0.04);
      if (form === "nine-gales" && i % 2 === 0) this.colorStamp(x + direction * 2, y - 7, 2, palette.accent, 0.75);
      if (form === "vortex" && i < 5) this.colorStamp(point.x + Math.cos(progress * 7 + i) * (4 + i * 2), point.y + Math.sin(progress * 7 + i) * (3 + i * 2), 3, palette.accent, 0.8);
    }
    if (progress > 0.55) this.drawPixelRing(point.x, point.y, 8 + progress * 6, palette.light, 0.7, 2);
  },

  drawRain(point, palette, progress, form, tier) {
    if (form === "sun-column") {
      const height = 12 + progress * (22 + (tier >= 3 ? 8 : 0));
      for (let y = 0; y < 7; y += 1) {
        const offset = y * 3;
        this.colorStamp(point.x, point.y - height + offset, y % 2 ? 4 : 6, y % 2 ? palette.main : palette.light, 0.9);
        if (y % 2 === 0) {
          this.colorStamp(point.x - 6, point.y - height + offset + 1, 2, palette.accent, 0.75);
          this.colorStamp(point.x + 6, point.y - height + offset + 1, 2, palette.accent, 0.75);
        }
      }
      return;
    }
    const count = form === "blade-rain" || form === "snowfall" ? 5 : 3;
    for (let i = 0; i < count; i += 1) {
      const side = (i - (count - 1) / 2) * 8;
      const fall = Math.min(1, progress * 1.5 + i * 0.08);
      const y = point.y - 22 + fall * 24;
      this.colorStamp(point.x + side, y, form === "blade-rain" ? 4 : 3, i % 2 ? palette.main : palette.light, 0.95);
      this.colorStamp(point.x + side + 2, y - 5, 2, palette.accent, 0.75);
      if (form === "snowfall") {
        this.colorStamp(point.x + side - 2, y, 2, palette.accent, 0.85);
        this.colorStamp(point.x + side, y - 2, 2, palette.light, 0.9);
      } else if (form === "volcanic-lotus") {
        this.colorStamp(point.x + side + 3, y + 3, 3, palette.dark, 0.86);
      } else if (form === "blade-rain") {
        this.colorStamp(point.x + side - 2, y + 3, 2, palette.dark, 0.85);
        this.colorStamp(point.x + side + 2, y - 3, 2, palette.light, 0.92);
      }
    }
    if (form === "volcanic-lotus" && progress > 0.55) this.drawLotus(point, palette, (progress - 0.55) / 0.45, tier);
    else if (progress > 0.55) this.drawBurst(point, palette, (progress - 0.55) / 0.45, tier, 0);
  },

  drawField(point, palette, progress, profile, form) {
    const maxRadius = 12 + Math.min(profile.aoeR || 0, 3) * 5 + (profile.tier >= 3 ? 8 : 0);
    const expand = Math.min(1, progress * 1.6);
    const radius = 5 + expand * maxRadius;
    const alpha = progress < 0.72 ? 0.78 : Math.max(0.2, (1 - progress) * 2.5);
    this.drawPixelRing(point.x, point.y + 5, radius, palette.main, alpha, 3);
    this.drawPixelRing(point.x, point.y + 5, radius * 0.72, palette.dark, alpha * 0.8, 2);
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 ? 1 : -1;
      const x = point.x + side * (4 + i * 4);
      const y = point.y - (progress * 10 + i * 2);
      this.colorStamp(x, y, 3, i % 2 ? palette.light : palette.accent, alpha);
    }
    if (form === "ice-pool") {
      for (let i = -2; i <= 2; i += 1) this.colorStamp(point.x + i * 5, point.y + 1 - Math.abs(i) * 2, 3, i % 2 ? palette.light : palette.accent, alpha);
    } else if (form === "flame-field") {
      for (let i = -1; i <= 1; i += 1) {
        this.colorStamp(point.x + i * 9, point.y - 8 - progress * 7, 4, palette.main, alpha);
        this.colorStamp(point.x + i * 9 + 2, point.y - 14 - progress * 5, 2, palette.light, alpha);
      }
    } else if (form === "storm-field") {
      for (let i = -1; i <= 1; i += 1) {
        this.colorStamp(point.x + i * 8, point.y - 9, 3, palette.light, alpha);
        this.colorStamp(point.x + i * 8 - 3, point.y - 4, 3, palette.main, alpha);
        this.colorStamp(point.x + i * 8 + 1, point.y + 1, 2, palette.accent, alpha);
      }
    } else if (form === "void-field") {
      this.drawDarkEye(point, palette, progress, profile.tier);
    }
    if (form === "flame-field" || form === "volcanic-lotus") this.drawBurst(point, palette, progress, profile.tier, profile.aoeR);
  },

  drawSupport(point, profile, palette, progress, layer = "all") {
    const form = profile.form;
    const progressValue = Math.max(0, Math.min(1, Number(progress) || 0));
    const pulse = 0.06 + Math.sin(progressValue * Math.PI) * 0.18;
    if (form === "thunder-shield") {
      this.drawLightningAura(point, palette, (Date.now() % 840) / 840, progressValue, layer);
      return;
    }
    if (["shield", "water-shield", "stone-armor"].includes(form)) {
      const radius = 5.5 + progressValue * 4;
      this.drawPixelRing(point.x, point.y + 1.2, radius, palette.main, pulse, 1);
      if (progressValue > 0.2 && progressValue < 0.8) {
        const angle = progressValue * Math.PI * 2;
        this.colorStamp(point.x + Math.cos(angle) * radius, point.y + 1.2, 2, palette.light, pulse);
      }
      return;
    }
    if (form === "growth") this.drawGrowth(point, palette, progress, form, profile.tier);
    if (form === "orbit") this.drawOrbit(point, palette, progress, form, profile.tier);
    if (form === "dark-eye") this.drawDarkEye(point, palette, progress, profile.tier);
    if (form === "starburst") this.drawStarburst(point, palette, progress, profile.tier);
    this.drawPixelRing(point.x, point.y + 1.2, 6 + progress * 8, palette.main, pulse, 1);
    this.drawPixelRing(point.x, point.y + 1.2, 9 + progress * 4, palette.accent, pulse * 0.55, 1);
    if (form === "five-elements") {
      const colors = ["#f0d35a", "#70c47b", "#58b9e6", "#ee704c", "#bd9460"];
      for (let i = 0; i < colors.length; i += 1) {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / colors.length + progress * 0.7;
        this.colorStamp(point.x + Math.cos(angle) * 12, point.y - 5 + Math.sin(angle) * 8, 4, colors[i], 0.95);
      }
      this.colorStamp(point.x, point.y - 5, 3, palette.light, 1);
    } else if (form === "meditate") {
      this.colorStamp(point.x - 4, point.y - 6, 4, palette.light, pulse);
      this.colorStamp(point.x + 4, point.y - 6, 4, palette.main, pulse);
      this.colorStamp(point.x - 3, point.y - 6, 1, palette.dark, 1);
      this.colorStamp(point.x + 3, point.y - 6, 1, palette.light, 1);
      this.colorStamp(point.x, point.y - 12, 2, palette.accent, pulse);
    } else if (form === "clear-heart") {
      for (const [x, y, size] of [[-4, -11, 3], [4, -11, 3], [-6, -7, 3], [0, -5, 4], [6, -7, 3], [0, -1, 3]]) {
        this.colorStamp(point.x + x, point.y + y, size, palette.light, pulse);
      }
      this.colorStamp(point.x, point.y - 6, 2, palette.accent, 1);
    } else if (form === "purify") {
      for (let i = -2; i <= 2; i += 1) {
        this.colorStamp(point.x + i * 4, point.y - 12 + Math.abs(i) * 2, 2, i === 0 ? palette.light : palette.accent, pulse);
        this.colorStamp(point.x + i * 4, point.y + 3, 2, palette.main, pulse * 0.85);
      }
    } else if (form === "solar-mark") {
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4;
        this.colorStamp(point.x + Math.cos(angle) * 12, point.y - 5 + Math.sin(angle) * 9, 3, palette.light, pulse);
      }
      this.colorStamp(point.x, point.y - 5, 5, palette.accent, 1);
    } else if (form === "earth-rune") {
      for (let i = -1; i <= 1; i += 1) {
        this.colorStamp(point.x + i * 6, point.y - 9, 3, palette.light, pulse);
        this.colorStamp(point.x + i * 6, point.y + 2, 3, palette.accent, pulse);
      }
      this.colorStamp(point.x - 7, point.y - 3, 2, palette.main, pulse);
      this.colorStamp(point.x + 7, point.y - 3, 2, palette.main, pulse);
    }
    if (form === "heal" || form === "star-heal" || form === "growth" || form === "clear-heart" || form === "meditate") {
      for (const side of [-1, 1]) {
        this.colorStamp(point.x + side * (5 + progress * 5), point.y - 15 - progress * 8, 3, palette.light, pulse);
        this.colorStamp(point.x + side * (9 + progress * 4), point.y - 8 - progress * 5, 2, palette.main, pulse * 0.8);
      }
      this.colorStamp(point.x, point.y - 19 - progress * 6, 3, palette.light, pulse);
      if (form === "heal" || form === "star-heal") {
        this.colorStamp(point.x, point.y - 10, 2, palette.light, pulse);
        this.colorStamp(point.x - 4, point.y - 6, 2, palette.light, pulse);
        this.colorStamp(point.x + 4, point.y - 6, 2, palette.light, pulse);
        if (form === "star-heal") this.drawStarburst({ x: point.x, y: point.y - 7 }, palette, progress, profile.tier);
      }
    } else if (form === "light-speed" || form === "leaf-speed") {
      for (let i = 0; i < 5; i += 1) {
        const side = i % 2 ? -1 : 1;
        const slide = progress * (8 + i * 2);
        const y = point.y - 10 + i * 4;
        this.colorStamp(point.x - side * slide, y, form === "leaf-speed" ? 3 : 2, i % 2 ? palette.main : palette.light, pulse);
        this.colorStamp(point.x + side * (slide + 5), y - 2, 2, palette.accent, pulse * 0.8);
      }
    }
    if (["fire-lotus", "solar-mark", "five-elements", "thien-quang"].includes(form)) {
      this.drawBurst(point, palette, progress, profile.tier, profile.aoeR);
    }
  },

  drawOrbit(point, palette, progress, form, tier) {
    const radius = 8 + (tier >= 3 ? 5 : 0);
    for (let i = 0; i < 4; i += 1) {
      const phase = progress * Math.PI * 2 + i * Math.PI / 2;
      const x = point.x + Math.round(Math.cos(phase) * radius);
      const y = point.y - 6 + Math.round(Math.sin(phase) * radius * 0.6);
      this.colorStamp(x, y, form === "dark-eye" ? 4 : 3, i % 2 ? palette.light : palette.main, 0.9);
    }
    if (form === "dark-eye") {
      this.colorStamp(point.x, point.y - 8, 5, palette.dark, 0.9);
      this.colorStamp(point.x, point.y - 8, 2, palette.light, 1);
    }
    this.drawPixelRing(point.x, point.y - 5, radius + 3, palette.accent, 0.48, 1);
  },

  drawCurse(point, palette, progress, form, tier) {
    const radius = 6 + progress * (12 + (tier >= 3 ? 6 : 0));
    this.drawPixelRing(point.x, point.y - 4, radius, palette.dark, 0.8, 3);
    this.drawPixelRing(point.x, point.y - 4, radius * 0.65, palette.main, 0.75, 2);
    this.colorStamp(point.x, point.y - 7, 4, palette.light, 0.8);
    this.colorStamp(point.x - 5, point.y - 7, 2, palette.accent, 0.8);
    this.colorStamp(point.x + 5, point.y - 7, 2, palette.accent, 0.8);
    if (form === "soul-drain") {
      for (let i = 0; i < 4; i += 1) this.colorStamp(point.x + (i - 1.5) * 5, point.y - 16 - progress * 8, 2, palette.main, 0.8);
    }
  },

  drawLightningAura(point, palette, phase, lifecycle = null, layer = "all") {
    const cycle = ((Number(phase) || 0) % 1 + 1) % 1;
    const pulseAt = (center) => {
      const distance = Math.min(Math.abs(cycle - center), 1 - Math.abs(cycle - center));
      return Math.max(0, 1 - distance / 0.22);
    };
    const envelope = Number.isFinite(lifecycle)
      ? Math.max(0, Math.min(1, Math.min(lifecycle * 5, (1 - lifecycle) * 5)))
      : 1;
    const pulse = Math.max(pulseAt(0.12), pulseAt(0.62));
    const radius = 13.5 + Math.sin(cycle * Math.PI * 2) * 1.2;
    if (layer !== "front") {
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const color = index % 3 === 0 ? palette.light : palette.accent;
        this.colorStamp(point.x + Math.cos(angle) * radius, point.y + 1.2 + Math.sin(angle) * radius * 0.38, 3, color, 0.42 + pulse * 0.34);
      }
    }

    if (layer !== "behind") {
      const halfWidth = Math.max(8, Number(CFG.ACTOR_W || 16) / 2 + 4);
      for (let bolt = 0; bolt < 2; bolt += 1) {
        const flash = pulseAt(bolt === 0 ? 0.12 : 0.62) * envelope;
        const side = bolt === 0 ? -1 : 1;
        const x = point.x + side * halfWidth;
        const y = point.y - 9 + Math.sin((cycle + bolt * 0.5) * Math.PI * 2) * 1.5;
        const zig = [[0, -8], [side * 2, -4], [-side, 0], [side * 2, 4], [0, 8]];
        const alpha = 0.08 + flash * 0.92;
        for (let i = 0; i < zig.length; i += 1) {
          const [dx, dy] = zig[i];
          this.colorStamp(x + dx, y + dy, i % 2 ? 2 : 3, i % 2 ? palette.light : palette.main, alpha * envelope);
        }
        this.colorStamp(x + side * 3, y + 3, 3, palette.accent, (0.06 + flash * 0.9) * envelope);
      }
    }
  },

  drawPassive(point, profile, palette, progress, layer = "all") {
    const phase = Math.max(0, Math.min(1, Number(progress) || 0)) * Math.PI * 2;
    const y = point.y + 1.2;
    if (["passive-lightning", "thunder-shield"].includes(profile.form)) {
      this.drawLightningAura(point, palette, (Number(progress) || 0) % 1, null, layer);
      return;
    }
    // Keep non-lightning passives below the sprite; the front pass is reserved
    // for effects designed to frame the character rather than cover it.
    if (layer === "front") return;
    const radius = 10.5 + (Math.sin(phase) + 1) * 0.8;
    const alpha = 0.16 + (Math.sin(phase) + 1) * 0.08;
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const color = index % 3 === 0 ? palette.light : palette.main;
      this.colorStamp(point.x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.42, index % 3 === 0 ? 3 : 2, color, alpha);
    }
    if (["passive-leaf", "passive-wind"].includes(profile.form)) {
      const drift = Math.cos(phase) * 2;
      this.colorStamp(point.x - 7 + drift, point.y - 6, 2, palette.light, 0.34);
      this.colorStamp(point.x + 7 - drift, point.y - 9, 2, palette.main, 0.28);
    } else if (["passive-flame", "passive-sun"].includes(profile.form)) {
      const lift = Math.sin(phase) * 1.5;
      this.colorStamp(point.x - 7, point.y - 8 - lift, 2, palette.main, 0.38);
      this.colorStamp(point.x + 7, point.y - 10 + lift, 2, palette.light, 0.34);
    } else if (profile.form === "passive-shadow") {
      this.colorStamp(point.x - 8, point.y - 4, 2, palette.dark, 0.4);
      this.colorStamp(point.x + 8, point.y - 8, 2, palette.accent, 0.34);
    } else {
      this.colorStamp(point.x + Math.cos(phase) * 7, y, 2, palette.light, 0.2);
    }
  },

  drawOwnedBuffs(cameraX, cameraY, now, layer = "all") {
    const player = S.player;
    if (!player) return;
    const x = player.px - cameraX;
    const y = player.py - cameraY;
    const phase = (now % 840) / 840;
    this.ownedBuffAuras = this.ownedBuffAuras.filter((entry) => entry.expiresAt > now);
    const drawn = new Set();
    const drawAura = (skill, key) => {
      const profile = this.profile(skill);
      const palette = profile.palette || this.palette[profile.root] || this.palette.COMMON;
      if (profile.form === "thunder-shield") this.drawLightningAura({ x, y }, palette, phase, null, layer);
      else this.drawPassive({ x, y }, profile, palette, phase, layer);
      drawn.add(String(skill.code || skill.id || key));
    };
    for (const entry of this.ownedBuffAuras) drawAura(entry.skill, entry.effect);
    for (const [buffKey, buff] of Object.entries(player.buffs || {})) {
      if (!buff || (Number(buff.expiresAt) > 0 && Number(buff.expiresAt) <= now)) continue;
      const skillCode = String(buff.skillCode || buff.code || "");
      const skill = (skillCode && this.findSkill(skillCode, player))
        || (player.skills || []).find((entry) => String(entry.effect || "") === buffKey);
      if (!skill) continue;
      const code = String(skill.code || skill.id || buffKey);
      if (!drawn.has(code)) drawAura(skill, buffKey);
    }
  },

  drawOwnedPassive(cameraX, cameraY, now, reduceMotion, layer = "all") {
    const player = S.player;
    if (!player) return;
    const root = String(player.linhCan || player.root?.id || "").toUpperCase();
    const learnedCodes = new Set((player.learnedSkills || []).map((entry) => String(entry?.code || entry?.id || entry?.skillCode || entry)));
    const candidates = [...learnedCodes]
      .map((code) => this.findSkill(code, player))
      .filter((skill) => skill && String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE");
    for (const skill of player.skills || []) {
      if (String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE"
        && !candidates.some((candidate) => candidate.code === skill.code)) candidates.push(this.normalize(skill));
    }
    const legacyCode = `${root}_TAM_PHAP`;
    const skill = candidates.find((candidate) => String(candidate.linhCan || "").toUpperCase() === root)
      || candidates[0]
      || (learnedCodes.has(legacyCode) ? this.findSkill(legacyCode, player) || { code: legacyCode, linhCan: root, category: "PASSIVE", tier: 1 } : null);
    if (!skill) return;
    const profile = this.profile(skill);
    const palette = profile.palette || this.palette[profile.root] || this.palette.COMMON;
    const phase = reduceMotion ? 0.12 : (now % 1500) / 1500;
    const x = player.px - cameraX;
    const y = player.py - cameraY;
    this.drawPassive({ x, y }, profile, palette, phase, layer);
  },
};

SkillVFX.loadCustomProfiles();
if (typeof window !== "undefined") {
  window.SkillVFX = SkillVFX;
  window.addEventListener("storage", (event) => {
    if (event.key === SkillVFX.storageKey) SkillVFX.loadCustomProfiles();
  });
}
if (typeof API !== "undefined") void SkillVFX.loadRemoteProfiles();
