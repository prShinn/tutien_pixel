// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/skills.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Hệ thống kỹ năng & thần thông (Skill Engine): Mapper dữ liệu BE <-> FE, quản lý sổ thần thông
//      (Skill Book), học kỹ năng mới, trang bị loadout (tối đa 4 kỹ năng), tính toán cooldown,
//      thi triển kỹ năng định hướng/AOE, tương sinh tương khắc Ngũ Hành, vẽ thanh kỹ năng.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.SKILLS (bảng kỹ năng theo linh căn), Linh_CAN.
//    - Phụ thuộc: State (S), Net, UI, Render, Combat.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Thống nhất schema kỹ năng giữa REST API server và client engine.
//    - Tự động tìm mục tiêu thông minh (Smart Targeting) trong phạm vi chiêu khi bấm phím 1-4.
//    - Quản lý hiệu ứng buff, debuff (choáng, thiêu đốt, giảm thủ, tăng tốc) trên quái và người chơi.
// ════════════════════════════════════════════════════════════════════════════════════════

// ── Helpers chuyển đổi kỹ năng Backend → Frontend ──
// BE format: { id, code, name, icon, linhCan, tier, type(PHYS|MAGIC),
//              satThuong, mpTieuHao, hoiChieu, dienRong, thoiGianBuff,
//              sfx_code, description, stats }
// FE format: { id, name, icon, linhCan, tier, damageType, satThuong,
//              mpCost, cd(ticks), range, aoe, aoeR,
//              effect, effectDur(ticks), effectVal, desc, cdLeft }
function mapBESkillToFE(sk) {
  // damageType: PHYS hoặc MAGIC (sk.type từ BE)
  const damageType = (sk.type === "PHYS" || sk.type === "MAGIC")
    ? sk.type
    : (sk.damageType || "PHYS");

  // effect riêng: sfx_code hoặc sk.effect (nếu không phải loại damage)
  const effectCode = sk.sfx_code && sk.sfx_code !== "string"
    ? sk.sfx_code
    : (sk.effect && sk.effect !== "PHYS" && sk.effect !== "MAGIC" ? sk.effect : null);
  const categoryCode = String(sk.category || sk.loai || sk.loaiNangLuc || "").trim().toUpperCase();
  const isPassive = categoryCode === "PASSIVE" || categoryCode === "BI_DONG"
    || /_TAM_PHAP$/i.test(String(sk.code || sk.maNangLuc || ""));

  // cd: BE gửi giây → FE dùng ticks (×60)
  const cdTicks = ((sk.hoiChieu ?? sk.cd ?? 10)) * 60;
  const effectDurTicks = ((sk.thoiGianBuff ?? sk.effectDur ?? 0)) * 60;

  return {
    id: sk.code || String(sk.id),
    code: sk.code || String(sk.id),
    name: sk.name || sk.tenNangLuc || "Kỹ năng",
    icon: sk.icon || (damageType === "MAGIC" ? "✨" : "⚔️"),
    img: sk.img || "",
    vfxForm: sk.vfxForm || "",
    requiresLineOfSight: Boolean(sk.requiresLineOfSight),
    weaponKinds: Array.isArray(sk.weaponKinds) ? sk.weaponKinds : [],
    linhCan: sk.linhCan || "",
    tier: sk.tier || 1,
    autoAssigned: Boolean(sk.autoAssigned),   // ô 1: kỹ năng common BE tự gán theo vũ khí
    category: isPassive ? "PASSIVE" : "ACTIVE",
    targetType: sk.targetType || (Number(sk.satThuong || 0) > 0 ? "ENEMY" : "SELF"),
    scalingStat: sk.scalingStat || (damageType === "MAGIC" ? "ene" : "str"),
    damageType,                         // "PHYS" | "MAGIC"
    satThuong: sk.satThuong ?? 1,       // hệ số catalog; server nhân thêm skillMultiplier để tạo burst
    mpCost: sk.mpTieuHao ?? sk.mpCost ?? 0,
    cd: cdTicks,                        // ticks
    range: sk.range ?? sk.tamDanh ?? 5,
    aoe: (sk.dienRong ?? sk.aoeR ?? 0) > 0 || sk.aoe || false,
    aoeR: sk.dienRong ?? sk.aoeR ?? 0,
    effect: effectCode,                 // debuff/buff code
    effectDur: effectDurTicks,          // ticks
    effectVal: sk.effectVal ?? 0,
    passiveModifiers: sk.passiveModifiers || {},
    desc: sk.description ?? sk.moTa ?? sk.desc ?? "",
    level: sk.level || 1,
    cdLeft: sk.cdLeft ?? 0,
    _beId: sk.id || null,
  };
}

// ── Chuyển kỹ năng FE → BE để lưu ──
function mapFESkillToBE(sk) {
  return {
    id: sk._beId || undefined,
    code: sk.id,
    name: sk.name,
    icon: sk.icon,
    img: sk.img || "",
    vfxForm: sk.vfxForm || "",
    linhCan: sk.linhCan,
    tier: sk.tier,
    type: sk.damageType || "PHYS",      // BE field
    satThuong: sk.satThuong || 1,
    mpTieuHao: sk.mpCost,
    hoiChieu: Math.round((sk.cd || 600) / 60),  // ticks → giây
    dienRong: sk.aoeR || 0,
    thoiGianBuff: Math.round((sk.effectDur || 0) / 60),
    sfx_code: sk.effect || "",
    effectVal: sk.effectVal || 0,
    description: sk.desc || "",
    category: sk.category || "ACTIVE",
  };
}

// ════════════════════════════════════════════════════════════
// SkillSystem
// ════════════════════════════════════════════════════════════
// Nhãn hiển thị cho thẻ mô tả kỹ năng (chỉ là nhãn đọc; số liệu lấy từ catalog kỹ năng).
const SKILL_EFFECT_LABELS = Object.freeze({
  heal: "Hồi phục sinh lực", buff_hp_regen: "Hồi sinh lực theo thời gian", buff_vitals: "Cường hóa thể trạng",
  shield: "Lá chắn", cleanse: "Giải trừ trạng thái xấu", restore_mp: "Hồi linh lực",
  stun: "Choáng", root: "Trói chân", slow: "Làm chậm", armor_break: "Phá giáp", burn: "Thiêu đốt", curse: "Nguyền rủa",
  buff_atk: "Tăng công", buff_def: "Tăng thủ", buff_spd: "Tăng tốc", buff_crit: "Tăng bạo kích", buff_cast: "Cường hóa thi pháp",
});
const SKILL_ELEMENT_LABELS = Object.freeze({
  KIM: "Kim", MOC: "Mộc", THUY: "Thủy", HOA: "Hỏa", THO: "Thổ", PHONG: "Phong", LOI: "Lôi", QUANG: "Quang", AM: "Âm", COMMON: "Phổ thông",
});
const SKILL_WEAPON_LABELS = Object.freeze({ hammer: "Búa", mace: "Chùy", blade: "Đao", spear: "Thương", bow: "Cung", crossbow: "Nỏ" });

const SkillSystem = {
  _book: null,
  _selected: new Set(),
  _savedSelected: [],
  _needsCleanup: false,

  // Ô kỹ năng có thể giữ nguyên DTO của BE (mpTieuHao) hoặc dạng FE đã map (mpCost).
  // HUD: ô 1 = kỹ năng common tự gán theo vũ khí, ô 2..5 = tối đa 4 kỹ năng linh căn người chơi chọn.
  SLOT_COUNT: 5,
  ROOT_SLOT_LIMIT: 4,

  normalizeSkill(raw, previousByCode = null) {
    if (!raw || typeof raw !== "object") return null;
    const mapped = (raw.mpTieuHao != null || raw.hoiChieu != null || !raw.damageType || raw.cd == null)
      ? mapBESkillToFE(raw)
      : { ...raw, cdLeft: raw.cdLeft ?? 0 };
    const code = String(mapped.code || mapped.id || "");
    const previous = previousByCode instanceof Map ? previousByCode.get(code) : null;
    if (previous && Number(previous.cdLeft || 0) > 0 && !Number(raw.cdLeft || 0)) {
      mapped.cdLeft = Number(previous.cdLeft);
    }
    return mapped;
  },

  syncPlayerSkills(target, incoming) {
    if (!target || !incoming || typeof incoming !== "object") return target;
    if (incoming.learnedSkills !== undefined) {
      target.learnedSkills = Array.isArray(incoming.learnedSkills) ? [...incoming.learnedSkills] : [];
    }
    if (incoming.equippedSkills !== undefined) {
      target.equippedSkills = Array.isArray(incoming.equippedSkills) ? [...incoming.equippedSkills] : [];
    }
    if (incoming.autoSkill !== undefined) {
      target.autoSkill = incoming.autoSkill ?? null;
    }
    const rawSource = incoming.skills !== undefined ? incoming.skills : target.skills;
    const parsedRaw = (() => {
      if (Array.isArray(rawSource)) return rawSource;
      if (typeof rawSource === "string") {
        try { return JSON.parse(rawSource); } catch { return null; }
      }
      return null;
    })();
    if (!Array.isArray(parsedRaw)) return target;

    const previousByCode = new Map(
      (Array.isArray(target.skills) ? target.skills : [])
        .filter(Boolean)
        .map((skill) => [String(skill.code || skill.id || ""), skill]),
    );
    const learned = Array.isArray(target.learnedSkills) ? new Set(target.learnedSkills.map(String)) : null;
    const equipped = Array.isArray(target.equippedSkills) ? new Set(target.equippedSkills.map(String)) : null;
    const autoCode = target.autoSkill != null && target.autoSkill !== "" ? String(target.autoSkill) : null;

    target.skills = parsedRaw
      .map((entry) => this.normalizeSkill(entry, previousByCode))
      .filter((skill) => {
        if (!skill) return false;
        const passive = String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE";
        if (passive) return false;
        const code = String(skill.code || skill.id || "");
        if (skill.autoAssigned || (autoCode && code === autoCode)) return true;
        return (!learned || learned.has(code)) && (!equipped || equipped.has(code));
      });
    return target;
  },

  // Kỹ năng hợp lệ ở ô i (null nếu ô trống hoặc dữ liệu cũ không còn đúng luật).
  slotSkill(p, index) {
    if (!p || !Number.isInteger(index) || index < 0 || index >= this.SLOT_COUNT) return null;
    const skills = Array.isArray(p.skills) ? p.skills : [];
    const isActiveSkill = (skill) => Boolean(skill) && String(skill.category || "ACTIVE").toUpperCase() !== "PASSIVE";
    const learned = Array.isArray(p.learnedSkills) ? new Set(p.learnedSkills.map(String)) : null;
    const equippedList = Array.isArray(p.equippedSkills) ? p.equippedSkills.map(String) : null;
    const autoCode = p.autoSkill != null && p.autoSkill !== "" ? String(p.autoSkill) : null;

    if (index === 0) {
      const autoCandidate = skills.find((skill) => isActiveSkill(skill)
        && (skill.autoAssigned || (autoCode && String(skill.code || skill.id || "") === autoCode)));
      if (autoCandidate) return autoCandidate;
      if (p.autoSkill === undefined && !equippedList && isActiveSkill(skills[0])) return skills[0];
      return null;
    }

    if (equippedList) {
      const slotCode = equippedList[index - 1];
      if (!slotCode || (learned && !learned.has(slotCode))) return null;
      return skills.find((skill) => isActiveSkill(skill) && String(skill.code || skill.id || "") === slotCode) || null;
    }

    const candidate = skills[index];
    if (!isActiveSkill(candidate)) return null;
    const code = String(candidate.code || candidate.id || "");
    return !learned || learned.has(code) ? candidate : null;
  },

  mpCost(skill) {
    return Math.max(0, Number(skill?.mpCost ?? skill?.mpTieuHao ?? 0) || 0);
  },

  isOffensive(skill) {
    if (!skill) return false;
    return Number(skill.satThuong || 0) > 0
      && !["heal", "shield", "cleanse", "speed"].includes(String(skill.effect || ""));
  },

  tryAutoSkill(target) {
    const player = S.player;
      if (!player || player.dead || !target || target.dead || S.combatPending || S.combatGcd > 0) return false;
    const now = Date.now();
    for (let slot = 0; slot < this.SLOT_COUNT; slot += 1) {
      const skill = this.slotSkill(player, slot);
      if (!skill) continue;
      if (skill.weaponKinds?.length) {
        const weaponKind = player.equipment?.weapon?.weaponKind || player.equipment?.weapon?.basicAttack?.style;
        if (!weaponKind || !skill.weaponKinds.includes(weaponKind)) continue;
      }
      if (Number(skill.cdLeft || 0) > 0 || Number(player.mp || 0) < this.mpCost(skill)) continue;

      const effect = String(skill.effect || "");
      let shouldCast = false;
      if (this.isOffensive(skill)) {
        const range = Math.max(1, Number(skill.range || 5)) * CFG.SKILL_RANGE_SCALE;
        shouldCast = dist(target.px, target.py, player.px, player.py) <= range
          && (!skill.requiresLineOfSight || Combat.hasClearShot(player, target));
      } else if (effect === "heal") {
        shouldCast = Number(player.hp || 0) < Number(player.maxHp || 1) * 0.55;
      } else if (effect === "restore_mp") {
        shouldCast = Number(player.mp || 0) < Number(player.maxMp || 1) * 0.4;
      } else if (["shield", "speed"].includes(effect)) {
        const buff = player.buffs?.[effect] || player.buffs?.[`buff_${effect}`];
        shouldCast = !buff || (buff.expiresAt && Number(buff.expiresAt) <= now);
      } else if (effect === "cleanse") {
        shouldCast = Object.keys(player.debuffs || {}).length > 0;
      } else if (effect.startsWith("buff_")) {
        const buff = player.buffs?.[effect];
        shouldCast = !buff || (buff.expiresAt && Number(buff.expiresAt) <= now);
      }
      if (!shouldCast) continue;

      const previousCooldown = Number(skill.cdLeft || 0);
      const previousCastAt = Number(player.animStartedAt || 0);
      if (this.isOffensive(skill)) S.target = target;
      this.useSkill(slot);
      if (S.combatPending || Number(skill.cdLeft || 0) > previousCooldown || Number(player.animStartedAt || 0) !== previousCastAt) return true;
    }
    return false;
  },

  animationDuration(skill) {
    if (skill && typeof SkillVFX !== "undefined") {
      const timing = SkillVFX.castTiming(SkillVFX.profile(skill));
      return timing.charge + timing.effect;
    }
    const physicalStrike = this.isOffensive(skill)
      && String(skill.damageType || "PHYSICAL").toUpperCase() !== "MAGIC";
    return physicalStrike ? 620 : 760;
  },

  animateCast(actor, skill) {
    const physicalStrike = this.isOffensive(skill) && String(skill.damageType || "PHYSICAL").toUpperCase() !== "MAGIC";
    actor.animState = physicalStrike ? "attack" : "cast";
    actor.animStartedAt = Date.now();
    actor.animUntil = actor.animStartedAt + this.animationDuration(skill);
  },

  async loadBook() {
    if (!S.player?.id) return;
    try {
      this._book = await Net.get(API.PATHS.data.skillCatalog);
      const catalog = Array.isArray(this._book.skills) ? this._book.skills : [];
      // Sổ thần thông chỉ hiện kỹ năng của linh căn nhân vật; kỹ năng common do BE tự gán ở ô 1 theo vũ khí.
      const visible = catalog.filter((skill) => skill.linhCan === S.player.linhCan);
      if (this._book.autoSkill !== undefined) S.player.autoSkill = this._book.autoSkill ?? null;
      const hasLearned = Array.isArray(this._book.learnedSkills);
      const learned = hasLearned ? new Set(this._book.learnedSkills.map(String)) : null;
      const visibleByCode = new Map(visible.map((skill) => [String(skill.code || skill.id || ""), skill]));
      const requested = Array.isArray(this._book.equippedSkills)
        ? this._book.equippedSkills
        : (S.player.skills || []).map((skill) => skill.code || skill.id);
      const selected = [];
      const seen = new Set();
      for (const rawCode of requested) {
        const code = String(rawCode || "");
        if (!code || seen.has(code)) continue;
        const skill = visibleByCode.get(code);
        if (!skill || String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE") continue;
        if (learned && !learned.has(code)) continue;
        seen.add(code);
        selected.push(code);
        if (selected.length >= this.ROOT_SLOT_LIMIT) break;
      }
      this._selected = new Set(selected);
      this._savedSelected = [...selected];
      this._needsCleanup = selected.length < requested.length;
      if (this._needsCleanup) {
        UI.notify("Có kỹ năng trang bị cũ không còn phù hợp linh căn; hãy chọn lại rồi lưu loadout.", "warning");
      }
      this.renderSkillBook();
    } catch (error) {
      console.warn("[Skill] Không tải được sổ thần thông", error);
    }
  },

  isLoadoutDirty() {
    if (this._needsCleanup) return true;
    const current = Array.from(this._selected);
    const saved = Array.isArray(this._savedSelected) ? this._savedSelected : [];
    return current.length !== saved.length || current.some((code, index) => code !== saved[index]);
  },

  moveSlot(code, delta) {
    const order = Array.from(this._selected);
    const index = order.indexOf(code);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    this._selected = new Set(order);
    this.renderSkillBook();
  },

  async learnSkill(code) {
    try {
      const result = await Net.mutate("POST", API.PATHS.player.learnSkill, { skillCode: code, source: "book" });
      if (!result?.learnedSkills) {
        UI.notify(result?.error || "Chưa thể lĩnh hội kỹ năng này.", "error");
        return;
      }
      if (!this._book) await this.loadBook();
      if (this._book) this._book.learnedSkills = result.learnedSkills;
      if (S.player) {
        this.syncPlayerSkills(S.player, result);
        if (Number.isFinite(Number(result.combatPower))) S.player.combatPower = Number(result.combatPower);
        if (Number.isFinite(Number(result.maxHp))) S.player.maxHp = Number(result.maxHp);
        if (Number.isFinite(Number(result.maxMp))) S.player.maxMp = Number(result.maxMp);
        if (result.derivedStats && typeof result.derivedStats === "object") S.player.derivedStats = result.derivedStats;
      }
      if (typeof UI !== "undefined" && typeof UI.update === "function") UI.update();
      this.renderSkillBook();
      UI.log("Đã lĩnh hội thần thông: " + (result.skill?.name || code), "level");
    } catch {
      UI.notify("Mất kết nối khi lĩnh hội kỹ năng. Hãy thử lại.", "error");
    }
  },

  toggleEquip(code) {
    if (this._selected.has(code)) this._selected.delete(code);
    else if (this._selected.size < this.ROOT_SLOT_LIMIT) this._selected.add(code);
    else return UI.notify(`Chỉ được trang bị tối đa ${this.ROOT_SLOT_LIMIT} kỹ năng linh căn (ô 2–5); ô 1 tự gán theo vũ khí.`, "warning");
    this.renderSkillBook();
  },

  async saveLoadout() {
    const button = document.querySelector(".skill-save-btn");
    if (button) {
      button.disabled = true;
      button.textContent = "Đang lưu…";
    }
    try {
      const result = await Net.mutate("PUT", API.PATHS.player.equipSkills, { skillCodes: [...this._selected] });
      if (result?.skills) {
        this.syncPlayerSkills(S.player, result);
        if (this._book) this._book.equippedSkills = result.equippedSkills || [...this._selected];
        this._savedSelected = [...this._selected];
        this._needsCleanup = false;
        UI.update();
        this.renderSkillBook();
        UI.notify("Đã lưu kỹ năng trang bị.", "success");
      } else {
        UI.notify(result?.error || "Chưa lưu được kỹ năng, hãy thử lại.", "error");
      }
    } catch {
      UI.notify("Mất kết nối khi lưu kỹ năng. Hãy thử lại.", "error");
    } finally {
      if (button?.isConnected) {
        button.disabled = !this.isLoadoutDirty();
        button.textContent = "Lưu loadout";
      }
    }
  },

  renderSkillBook() {
    const host = document.getElementById("skill-book-list");
    if (!host || !this._book) return;
    this.hideTooltip(true); // danh sách sắp được vẽ lại, nút đang ghim thẻ mô tả sẽ bị thay
    const learned = new Set((this._book.learnedSkills || []).map(String));
    const catalog = Array.isArray(this._book.skills) ? this._book.skills : [];
    const visible = catalog.filter((skill) => skill.linhCan === S.player?.linhCan);
    const visibleByCode = new Map(visible.map((skill) => [String(skill.code || skill.id || ""), skill]));
    const selectedOrder = Array.from(this._selected);
    const slotByCode = new Map(selectedOrder.map((code, idx) => [code, idx]));
    const realmStt = Math.max(1, Number(S.player?.canhGioi?.stt || S.player?.realm || 1));
    const weaponNames = { hammer: "Búa", mace: "Chùy", blade: "Đao", spear: "Thương", bow: "Cung", crossbow: "Nỏ" };

    // Thanh 5 ô loadout trực quan: ô 1 tự gán common, ô 2..5 sắp thứ tự phím bấm.
    const strip = document.createElement("div");
    strip.className = "skill-loadout-strip";
    const autoCode = this._book.autoSkill ?? S.player?.autoSkill ?? null;
    const autoSkill = autoCode ? catalog.find((entry) => String(entry.code || entry.id || "") === String(autoCode)) : null;

    const autoCard = document.createElement("div");
    autoCard.className = "skill-loadout-slot auto";
    const autoHead = document.createElement("div");
    autoHead.className = "skill-loadout-head";
    autoHead.innerHTML = `<span class="skill-slot-key">Phím 1</span><span class="skill-slot-tag">Tự gán</span>`;
    const autoBody = document.createElement("div");
    autoBody.className = "skill-loadout-body";
    if (autoSkill) {
      const autoTitle = document.createElement("span");
      autoTitle.className = "skill-loadout-name";
      autoTitle.append(UI.createPixelIcon(autoSkill, "skill", "skill-slot-icon"), document.createTextNode(autoSkill.name || autoSkill.code));
      autoBody.appendChild(autoTitle);
    } else {
      const emptyAuto = document.createElement("span");
      emptyAuto.className = "skill-loadout-empty";
      emptyAuto.textContent = "Chưa có chiêu vũ khí";
      autoBody.appendChild(emptyAuto);
    }
    autoCard.append(autoHead, autoBody);
    strip.appendChild(autoCard);

    for (let slotIndex = 0; slotIndex < this.ROOT_SLOT_LIMIT; slotIndex += 1) {
      const code = selectedOrder[slotIndex] || null;
      const skill = code ? visibleByCode.get(code) : null;
      const card = document.createElement("div");
      card.className = `skill-loadout-slot${skill ? " occupied" : " empty"}`;
      const head = document.createElement("div");
      head.className = "skill-loadout-head";
      const keyBadge = document.createElement("span");
      keyBadge.className = "skill-slot-key";
      keyBadge.textContent = `Phím ${slotIndex + 2}`;
      head.appendChild(keyBadge);

      const body = document.createElement("div");
      body.className = "skill-loadout-body";
      if (skill) {
        const title = document.createElement("span");
        title.className = "skill-loadout-name";
        title.append(UI.createPixelIcon(skill, "skill", "skill-slot-icon"), document.createTextNode(skill.name || code));
        const tools = document.createElement("div");
        tools.className = "skill-loadout-tools";

        const leftBtn = document.createElement("button");
        leftBtn.type = "button";
        leftBtn.className = "skill-order-btn";
        leftBtn.textContent = "←";
        leftBtn.disabled = slotIndex === 0;
        leftBtn.title = "Đẩy sang phím trước";
        leftBtn.setAttribute("aria-label", `Đẩy ${skill.name || code} sang phím ${slotIndex + 1}`);
        leftBtn.onclick = () => SkillSystem.moveSlot(code, -1);

        const rightBtn = document.createElement("button");
        rightBtn.type = "button";
        rightBtn.className = "skill-order-btn";
        rightBtn.textContent = "→";
        rightBtn.disabled = slotIndex >= selectedOrder.length - 1;
        rightBtn.title = "Đẩy sang phím sau";
        rightBtn.setAttribute("aria-label", `Đẩy ${skill.name || code} sang phím ${slotIndex + 3}`);
        rightBtn.onclick = () => SkillSystem.moveSlot(code, 1);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "skill-order-btn remove";
        removeBtn.textContent = "✕";
        removeBtn.title = "Gỡ khỏi ô";
        removeBtn.setAttribute("aria-label", `Gỡ ${skill.name || code} khỏi phím ${slotIndex + 2}`);
        removeBtn.onclick = () => SkillSystem.toggleEquip(code);

        tools.append(leftBtn, rightBtn, removeBtn);
        body.append(title, tools);
      } else {
        const empty = document.createElement("span");
        empty.className = "skill-loadout-empty";
        empty.textContent = "Ô trống";
        body.appendChild(empty);
      }
      card.append(head, body);
      strip.appendChild(card);
    }

    const rows = visible.map((skill) => {
      const code = String(skill.code || skill.id || "");
      const known = learned.has(code);
      const passive = String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE";
      const assignedIndex = slotByCode.has(code) ? slotByCode.get(code) : -1;
      const requiredTier = Math.max(1, Number(skill.tier || 1));
      const realmBlocked = !known && realmStt < requiredTier;
      const atLimit = !this._selected.has(code) && this._selected.size >= this.ROOT_SLOT_LIMIT;

      let action = "HỌC";
      if (known) {
        if (passive) action = "TỰ ĐỘNG";
        else if (assignedIndex >= 0) action = `GỠ (Ô ${assignedIndex + 2})`;
        else action = atLimit ? "ĐỦ 4 Ô" : "TRANG BỊ";
      } else if (realmBlocked) {
        action = `CẢNH GIỚI ${requiredTier}`;
      }

      const damage = Number(skill.satThuong || 0);
      const weaponRequirement = skill.weaponKinds?.length
        ? ` · Vũ khí: ${skill.weaponKinds.map((kind) => weaponNames[kind] || kind).join("/")}`
        : "";
      const details = passive
        ? "Bị động cộng dồn trực tiếp"
        : `${damage > 0 ? `Dame ×${damage}` : "Hỗ trợ"} · MP ${skill.mpTieuHao ?? skill.mpCost ?? 0}${weaponRequirement} · CD ${skill.hoiChieu ?? Math.round((skill.cd || 0) / 60)}s`;
      const row = document.createElement("div");
      row.className = `skill-book-row${assignedIndex >= 0 ? " is-equipped" : ""}${realmBlocked ? " is-locked" : ""}`;
      const info = document.createElement("div");
      info.className = "skill-book-info";
      const title = document.createElement("strong");
      const icon = UI.createPixelIcon(skill, "skill", "skill-book-icon");
      title.append(icon, document.createTextNode(` ${skill.name || code || "Kỹ năng"} `));
      const category = document.createElement("span");
      category.className = `skill-category ${passive ? "passive" : "active"}`;
      category.textContent = passive ? "BỊ ĐỘNG" : "CHỦ ĐỘNG";
      title.appendChild(category);
      if (assignedIndex >= 0) {
        const slotTag = document.createElement("span");
        slotTag.className = "skill-slot-badge";
        slotTag.textContent = `Phím ${assignedIndex + 2}`;
        title.appendChild(slotTag);
      }
      const summary = document.createElement("small");
      summary.textContent = `T${requiredTier} · ${details}`;
      const description = document.createElement("em");
      description.textContent = skill.description || skill.moTa || skill.desc || "";
      info.append(title, summary, description);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action;
      if (known && passive) {
        button.disabled = true;
      } else if (realmBlocked) {
        button.disabled = true;
        button.title = `Cần đạt đại cảnh giới bậc ${requiredTier} để lĩnh hội`;
      } else if (!known) {
        button.onclick = () => SkillSystem.learnSkill(code);
      } else {
        if (assignedIndex >= 0) button.classList.add("equipped");
        button.onclick = () => SkillSystem.toggleEquip(code);
      }
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "skill-preview-btn";
      preview.textContent = "Hiệu ứng";
      preview.title = `Xem hiệu ứng ${skill.name || code}`;
      preview.setAttribute("aria-label", `Xem hiệu ứng kỹ năng ${skill.name || code}`);
      preview.onclick = () => {
        if (typeof SkillVFX !== "undefined") SkillVFX.preview(skill);
      };
      // Mô tả và thông số đầy đủ để người chơi cân nhắc trước khi học/trang bị.
      const detail = document.createElement("button");
      detail.type = "button";
      detail.className = "skill-detail-btn";
      detail.textContent = "Chi tiết";
      detail.title = `Xem mô tả và thông số ${skill.name || code}`;
      detail.setAttribute("aria-label", `Xem mô tả và thông số kỹ năng ${skill.name || code}`);
      detail.setAttribute("aria-haspopup", "true");
      detail.onclick = () => SkillSystem.toggleSkillCard(skill, detail);
      title.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse") SkillSystem.showSkillCard(skill, title);
      });
      title.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "mouse") SkillSystem.hideTooltip();
      });
      const actions = document.createElement("div");
      actions.className = "skill-book-actions";
      actions.append(detail, preview, button);
      row.append(info, actions);
      return row;
    });

    const saveBar = document.createElement("div");
    saveBar.className = "skill-save-bar";
    const dirty = this.isLoadoutDirty();
    const stateNote = document.createElement("span");
    stateNote.className = `skill-dirty-note${dirty ? " dirty" : ""}`;
    stateNote.textContent = dirty
      ? `Chưa lưu (${selectedOrder.length}/${this.ROOT_SLOT_LIMIT} ô linh căn)`
      : `Đã đồng bộ (${selectedOrder.length}/${this.ROOT_SLOT_LIMIT} ô linh căn)`;
    const save = document.createElement("button");
    save.type = "button";
    save.className = "sbtn skill-save-btn";
    save.textContent = "Lưu loadout";
    save.disabled = !dirty;
    save.onclick = () => SkillSystem.saveLoadout();
    saveBar.append(stateNote, save);
    host.replaceChildren(strip, ...rows, saveBar);
  },

  useSkill(slotIdx) {
    if (!socket?.connected || !Net._isOnline) return;
    const p = S.player;
    const skill = this.slotSkill(p, slotIdx);
    if (!skill || p?.dead) return;
    if (S.combatGcd > 0 || S.combatPending) return;
    if (document.getElementById("shop-modal")?.classList.contains("open")) return;
    if (document.getElementById("dialog-modal")?.classList.contains("open")) return;

    if (String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE") {
      UI.log(`${skill.icon || "✦"} ${skill.name} là kỹ năng bị động và luôn có hiệu lực.`, "system");
      return;
    }
    if (skill.weaponKinds?.length) {
      const weaponKind = p.equipment?.weapon?.weaponKind || p.equipment?.weapon?.basicAttack?.style;
      if (!weaponKind || !skill.weaponKinds.includes(weaponKind)) {
        this.playDeniedFeedback(slotIdx);
        return UI.log(`${skill.name} yêu cầu vũ khí: ${skill.weaponKinds.join(", ")}.`, "system");
      }
    }
    const offensive = this.isOffensive(skill);
    if (skill.cdLeft > 0) {
      this.playDeniedFeedback(slotIdx);
      UI.log(`${skill.icon} ${skill.name} đang hồi chiêu! (${Math.ceil(skill.cdLeft / 60)}s)`, "system");
      return;
    }
    if ((p.mp || 0) < this.mpCost(skill)) {
      this.playDeniedFeedback(slotIdx);
      UI.log("Không đủ linh lực!", "system");
      return;
    }

    if (!offensive) {
      S.combatPending = true;
      Net.command("combat.skill", { skillCode: skill.code || skill.id || skill._beId });
      return;
    }

    const maxRange = (skill.range || 5) * CFG.SKILL_RANGE_SCALE;
    const canTarget = (monster) => monster && !monster.dead
      && dist(monster.px, monster.py, p.px, p.py) <= maxRange
      && (!skill.requiresLineOfSight || Combat.hasClearShot(p, monster));
    const target = canTarget(S.target)
      ? S.target
      : S.monsters.filter(canTarget)
          .sort((a, b) => dist(a.px, a.py, p.px, p.py) - dist(b.px, b.py, p.px, p.py))[0];
    if (!target) {
      this.playDeniedFeedback(slotIdx);
      return UI.log(skill.requiresLineOfSight
        ? "Không có mục tiêu trong tầm với đường bắn thông thoáng."
        : "Không có mục tiêu trong tầm.", "system");
    }
    S.target = target;
    S.combatPending = true;
    Net.command("combat.attack", { targetId: target.id, skillCode: skill.code || skill.id || skill._beId, mapCode: S.mapCode });
  },

  tickCooldowns(dt) {
    const p = S.player;
    if (!p?.skills) return;
    const ticks = dt / 16;
    for (const sk of p.skills) {
      if (sk.cdLeft > 0) sk.cdLeft = Math.max(0, sk.cdLeft - ticks);
    }
    if (p.buffs) {
      for (const k of Object.keys(p.buffs)) {
        if (p.buffs[k].expiresAt) {
          if (p.buffs[k].expiresAt <= Date.now()) delete p.buffs[k];
          continue;
        }
        p.buffs[k].duration -= ticks;
        if (p.buffs[k].duration <= 0) delete p.buffs[k];
      }
    }
    this.updateCooldownVisuals();
  },

  updateCooldownVisuals() {
    const p = S.player;
    if (!p?.skills || typeof document === "undefined") return;
    this._cooldownVisuals ||= new Map();
    this._cooldownPhase ||= new Map();
    for (let index = 0; index < this.SLOT_COUNT; index += 1) {
      const skill = this.slotSkill(p, index);
      const slot = document.getElementById(`skbar-slot-${index}`);
      const wrap = document.getElementById(`skbar-cd-wrap-${index}`);
      const text = document.getElementById(`skbar-cd-text-${index}`);
      if (!slot || !wrap || !text) continue;
      const passive = String(skill?.category || "ACTIVE").toUpperCase() === "PASSIVE";
      const active = Boolean(skill && skill.cdLeft > 0);
      const ratio = active ? Math.min(1, skill.cdLeft / Math.max(1, skill.cd || 1)) : 0;
      const seconds = active ? skill.cdLeft / 60 : 0;
      const label = !active ? "" : (seconds >= 10 ? String(Math.ceil(seconds)) : seconds.toFixed(1));
      const affordable = !skill || passive || (Number(p.mp) || 0) >= this.mpCost(skill);
      const signature = `${active}:${ratio.toFixed(3)}:${label}:${affordable}`;
      if (this._cooldownVisuals.get(index) === signature) continue;
      this._cooldownVisuals.set(index, signature);

      const code = skill ? String(skill.code || skill.id || "") : "";
      const phase = this._cooldownPhase.get(index);
      this._cooldownPhase.set(index, { code, active });

      wrap.style.display = active ? "flex" : "none";
      slot.classList.toggle("on-cd", active);
      slot.classList.toggle("is-ready", Boolean(skill) && !passive && !active && affordable);
      slot.classList.toggle("is-no-mp", Boolean(skill) && !passive && !affordable);
      if (active) {
        slot.style.setProperty("--cd", ratio.toFixed(3));
        text.textContent = label;
      }
      // Chỉ phản hồi khi chính chiêu đó đổi trạng thái: bỏ qua lần đọc đầu tiên và lúc đổi chiêu trong ô.
      if (phase && phase.code === code && skill && !passive) {
        if (!phase.active && active) this.playCastFeedback(index);
        else if (phase.active && !active) this.playReadyFeedback(index);
      }
    }
  },

  // ── Phản hồi khi dùng kỹ năng trên thanh kỹ năng ──
  // Tung chiêu: tranh nảy lên, vòng sóng + loé sáng + tia lửa theo màu hệ. Hồi chiêu xong: ô nhún lên, vệt sáng quét qua.
  // Bấm khi chưa dùng được: ô rung nhẹ. Khi người dùng chọn giảm chuyển động, CSS tự bỏ phần di chuyển và chỉ giữ loé sáng.
  _restartSlotClass(slot, className, durationMs) {
    slot.classList.remove(className);
    void slot.offsetWidth; // buộc trình duyệt tính lại để animation chạy lại từ đầu
    slot.classList.add(className);
    const timerKey = `_timer_${className}`;
    window.clearTimeout(slot[timerKey]);
    slot[timerKey] = window.setTimeout(() => slot.classList.remove(className), durationMs);
  },

  playCastFeedback(index) {
    const slot = document.getElementById(`skbar-slot-${index}`);
    if (!slot) return;
    this._restartSlotClass(slot, "is-cast", 420);
    this.spawnCastBurst(slot);
  },

  playReadyFeedback(index) {
    const slot = document.getElementById(`skbar-slot-${index}`);
    if (!slot) return;
    this._restartSlotClass(slot, "is-ready-pop", 650);
  },

  playDeniedFeedback(index) {
    const slot = document.getElementById(`skbar-slot-${index}`);
    if (!slot) return;
    this._restartSlotClass(slot, "is-denied", 320);
  },

  spawnCastBurst(slot) {
    slot.querySelector(".skbar-fx")?.remove(); // mỗi ô chỉ giữ lớp hiệu ứng mới nhất
    const fx = document.createElement("span");
    fx.className = "skbar-fx";
    fx.setAttribute("aria-hidden", "true");
    const flash = document.createElement("i");
    flash.className = "fx-flash";
    const ring = document.createElement("i");
    ring.className = "fx-ring";
    fx.append(flash, ring);
    const sparkCount = 12;
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const distance = 28 + Math.random() * 24;
      const spark = document.createElement("i");
      spark.className = "fx-spark";
      spark.style.setProperty("--dx", `${Math.round(Math.cos(angle) * distance)}px`);
      spark.style.setProperty("--dy", `${Math.round(Math.sin(angle) * distance)}px`);
      spark.style.setProperty("--delay", `${Math.round(Math.random() * 60)}ms`);
      fx.appendChild(spark);
    }
    slot.appendChild(fx);
    window.setTimeout(() => fx.remove(), 800);
  },

  updateMonsterStatus(m, dt) {
    if (!m.statusEffects?.length) return;
    const ticks = dt / 16;
    for (let i = m.statusEffects.length - 1; i >= 0; i--) {
      const eff = m.statusEffects[i];
      eff.duration -= ticks;
      if (eff.duration <= 0) {
        m.statusEffects.splice(i, 1);
        continue;
      }
      if (["burn", "poison", "bleed", "drain"].includes(eff.type)) {
        eff.tickTimer = (eff.tickTimer || 0) - ticks;
        if (eff.tickTimer <= 0) {
          eff.tickTimer = 30;
          m.hp -= eff.value;
          const col =
            {
              burn: "#ff6600",
              poison: "#88ff44",
              bleed: "#ff4444",
              drain: "#aa44ff",
            }[eff.type] || "#ff8888";
          Render.floatDmg(m.px, m.py, -20, "-" + eff.value, col);
          if (eff.type === "drain")
            S.player.hp = Math.min(
              S.player.maxHp,
              S.player.hp + Math.floor(eff.value * 0.5),
            );
          if (m.hp <= 0 && !m.dead) {
            m.dead = true;
            m.respawnT = m.spawnCD;
            Combat.dropLoot(m);
          }
        }
      }
    }
  },

  getSpeedMult(m) {
    if (!m.statusEffects?.length) return 1;
    for (const e of m.statusEffects) {
      if (e.type === "freeze" || e.type === "stun") return 0;
      if (e.type === "slow") return e.value;
      if (e.type === "root") return 0;
    }
    return 1;
  },

  isFrozenOrStunned(m) {
    return (
      m.statusEffects?.some((e) => ["freeze", "stun"].includes(e.type)) || false
    );
  },

  // Màu nhấn theo hệ, bậc chiêu (số viên ngọc) và huy hiệu loại chiêu của một ô; chỉ dựng lại khi chiêu trong ô đổi.
  decorateSkillSlot(slotEl, sk) {
    const tier = sk ? Math.max(1, Math.min(4, Number(sk.tier || 1))) : 0;
    const hasArt = sk ? Boolean(UI.skillImageSource(sk)) : false;
    const signature = sk ? `${sk.code || sk.id}|${tier}|${hasArt ? 1 : 0}` : "";
    if (slotEl.dataset.decoration === signature) return;
    slotEl.dataset.decoration = signature;
    const tone = sk ? UI.skillTone(sk) : null;
    for (const [prop, key] of [["--skill-accent", "mid"], ["--skill-accent-light", "light"], ["--skill-accent-dark", "bg"]]) {
      if (tone) slotEl.style.setProperty(prop, tone[key]);
      else slotEl.style.removeProperty(prop);
    }
    const ensure = (className) => {
      let el = slotEl.querySelector(`.${className}`);
      if (!el) { el = document.createElement("span"); el.className = className; el.setAttribute("aria-hidden", "true"); slotEl.appendChild(el); }
      return el;
    };
    const tierEl = ensure("skbar-tier");
    tierEl.hidden = !sk;
    tierEl.replaceChildren(...Array.from({ length: tier }, () => document.createElement("i")));
    // Tranh riêng đã đủ nhận diện; chiêu dùng ô icon theo hệ thì bản thân tranh đã là huy hiệu loại chiêu.
    const badge = ensure("skbar-badge");
    badge.hidden = !sk || !hasArt;
    badge.style.backgroundImage = sk && hasArt ? `url("${UI.skillGlyphUri(sk)}")` : "";
  },

  renderSkillBar() {
    const p = S.player;
    this.bindSkillTips();

    for (let i = 0; i < this.SLOT_COUNT; i++) {
      const sk = this.slotSkill(p, i);
      const slotEl = document.getElementById(`skbar-slot-${i}`);
      if (!slotEl) continue;
      slotEl.disabled = !sk;
      slotEl.classList.toggle("auto-slot", i === 0);
      // Thông tin chi tiết nằm ở thẻ mô tả (hover/focus/giữ chạm), nên không đặt thêm title gốc để tránh hai tooltip chồng nhau.
      slotEl.removeAttribute("title");
      const skillPassive = sk && String(sk.category || "ACTIVE").toUpperCase() === "PASSIVE";
      slotEl.setAttribute("aria-label", sk
        ? `Kỹ năng ${i + 1}${i === 0 ? " (tự gán theo vũ khí)" : ""}: ${sk.name}, ${skillPassive ? "bị động" : `${sk.mpCost || 0} MP, hồi chiêu ${this.skillCooldownSeconds(sk)} giây`}`
        : `Ô kỹ năng ${i + 1}, chưa gắn`);
      const ensure = (selector, tag, className) => {
        let el = slotEl.querySelector(selector);
        if (!el) { el = document.createElement(tag); el.className = className; slotEl.appendChild(el); }
        return el;
      };
      const keyEl = ensure('.skbar-key', 'span', 'skbar-key');
      keyEl.textContent = String(i + 1);
      const iconEl = ensure(`#skbar-icon-${i}`, 'span', 'skbar-icon');
      iconEl.id = `skbar-icon-${i}`;
      const nameEl = ensure(`#skbar-name-${i}`, 'span', 'skbar-name');
      nameEl.id = `skbar-name-${i}`;
      nameEl.classList.add('skbar-name');
      const mpEl = ensure(`#skbar-mp-${i}`, 'span', 'skbar-mp');
      mpEl.id = `skbar-mp-${i}`;
      const cdWrap = ensure(`#skbar-cd-wrap-${i}`, 'span', 'skbar-cd-wrap');
      cdWrap.id = `skbar-cd-wrap-${i}`;
      // Số giây hồi chiêu nằm trong lớp quét hồi chiêu (là phần tử con của ô sẽ bị luật `.sk-sub > :not(...)` ẩn đi).
      let cdText = slotEl.querySelector(`#skbar-cd-text-${i}`);
      if (!cdText) { cdText = document.createElement('span'); cdText.className = 'skbar-cd-text'; cdText.id = `skbar-cd-text-${i}`; }
      if (cdText.parentElement !== cdWrap) cdWrap.appendChild(cdText);

      // ── Cập nhật nội dung slot ──
      if (!iconEl || !nameEl || !mpEl || !slotEl) continue;
      this.decorateSkillSlot(slotEl, sk);

      if (sk) {
        const passive = String(sk.category || 'ACTIVE').toUpperCase() === 'PASSIVE';
        let categoryEl = slotEl.querySelector('.sk-category');
        if (!categoryEl) { categoryEl = document.createElement('span'); categoryEl.className = 'sk-category'; slotEl.appendChild(categoryEl); }
        categoryEl.textContent = passive ? 'BỊ ĐỘNG' : 'CHỦ ĐỘNG';
        categoryEl.className = `sk-category ${passive ? 'passive' : 'active'}`;
        slotEl.classList.toggle('passive-skill', passive);
        iconEl.className = `skbar-icon pixel-icon ${UI.pixelIconClass(sk, "skill")}`;
        iconEl.replaceChildren();
        UI.applySkillIcon(iconEl, sk);
        nameEl.textContent = sk.name;

        // MP cost
        mpEl.textContent = sk.mpCost + ' mp';

        // Type badge: tạo hoặc cập nhật
        let typeEl = slotEl.querySelector('.sk-type');
        if (!typeEl) {
          typeEl = document.createElement('span');
          typeEl.className = 'sk-type';
          slotEl.appendChild(typeEl);
        }
        if (sk.damageType === 'MAGIC') {
          typeEl.textContent = 'PHÁP';
          typeEl.className = 'sk-type magic';
        } else {
          typeEl.textContent = 'VẬT';
          typeEl.className = 'sk-type phys';
        }

        // Border màu theo type
        slotEl.style.borderColor = '';
        slotEl.classList.toggle('skill-magic', sk.damageType === 'MAGIC');
        slotEl.classList.toggle('skill-physical', sk.damageType !== 'MAGIC');
      } else {
        iconEl.className = 'skbar-icon';
        UI.applySkillIcon(iconEl, null);
        iconEl.textContent = '—';
        nameEl.textContent = 'Chưa có';
        mpEl.textContent   = '';
        slotEl.style.borderColor = '';
        const typeEl = slotEl.querySelector('.sk-type');
        if (typeEl) typeEl.remove();
        const categoryEl = slotEl.querySelector('.sk-category');
        if (categoryEl) categoryEl.remove();
        slotEl.classList.remove('passive-skill');
        slotEl.classList.remove('skill-magic', 'skill-physical');
      }
    }
    // Quét hồi chiêu, trạng thái sẵn sàng / thiếu MP và phản hồi khi tung chiêu dùng chung một nơi cập nhật.
    this.updateCooldownVisuals();
  },

  // ── Thẻ mô tả kỹ năng ──
  // Hiện khi rê chuột / focus bàn phím lên ô kỹ năng, giữ chạm (cảm ứng), hoặc bấm "Chi tiết" trong Sổ Thần Thông,
  // để người chơi đọc mô tả và thông số trước khi chọn kỹ năng.
  skillCooldownSeconds(skill) {
    if (skill?.hoiChieu !== undefined && skill?.hoiChieu !== null) return Number(skill.hoiChieu) || 0;
    return Math.round((Number(skill?.cd) || 0) / 60);
  },

  estimateSkillDamage(skill, magic) {
    try {
      const baseAtk = magic ? Combat.mAtk() : Combat.pAtk();
      const stat = String(skill.scalingStat || (magic ? 'ene' : 'str')).toLowerCase();
      const statVal = Number(S.player?.stats?.[stat] || 0);
      const estimate = Math.floor(baseAtk * (skill.satThuong ?? 1) * GAME_BALANCE.damage.skillMultiplier + statVal * GAME_BALANCE.damage.skillStatScale);
      return Number.isFinite(estimate) ? estimate : null;
    } catch {
      return null;
    }
  },

  describeSkill(skill, extraNote = '') {
    const passive = String(skill.category || 'ACTIVE').toUpperCase() === 'PASSIVE';
    const magic = String(skill.damageType || skill.type || '').toUpperCase() === 'MAGIC';
    const damage = Number(skill.satThuong || 0);
    const element = String(skill.linhCan || '').toUpperCase();
    const tags = [{ text: passive ? 'Bị động' : 'Chủ động', kind: passive ? 'passive' : 'active' }];
    if (!passive) tags.push(damage > 0 ? { text: magic ? 'Pháp thuật' : 'Vật lý', kind: magic ? 'magic' : 'phys' } : { text: 'Hỗ trợ', kind: 'support' });
    tags.push({ text: `Hệ ${SKILL_ELEMENT_LABELS[element] || SKILL_ELEMENT_LABELS.COMMON}`, kind: 'element' });

    const rows = [];
    if (!passive) {
      if (damage > 0) {
        const estimate = this.estimateSkillDamage(skill, magic);
        rows.push(['Sát thương', estimate === null ? `×${damage}` : `×${damage} · ước tính ~${estimate}`]);
      }
      rows.push(['Linh lực', `${skill.mpCost ?? skill.mpTieuHao ?? 0} MP`]);
      rows.push(['Hồi chiêu', `${this.skillCooldownSeconds(skill)}s`]);
      const aoeRadius = Number(skill.aoeR ?? skill.dienRong ?? 0);
      const rangeScale = Number(CFG?.SKILL_RANGE_SCALE) || 1;
      rows.push(['Tầm đánh', aoeRadius > 0 || skill.aoe === true ? `Diện rộng r${aoeRadius}` : `${Number(skill.range || 0) * rangeScale} ô`]);
      if (skill.targetType === 'SELF') rows.push(['Mục tiêu', 'Bản thân']);
      else if (skill.targetType === 'ENEMY') rows.push(['Mục tiêu', 'Kẻ địch']);
      const effect = String(skill.effect || skill.sfx_code || '').toLowerCase();
      const effectLabel = SKILL_EFFECT_LABELS[effect] || (effect.startsWith('buff_') ? 'Cường hóa' : '');
      if (effectLabel) {
        const seconds = skill.thoiGianBuff !== undefined ? Number(skill.thoiGianBuff) : Math.round((Number(skill.effectDur) || 0) / 60);
        rows.push(['Hiệu ứng', seconds > 0 ? `${effectLabel} · ${seconds}s` : effectLabel]);
      }
    }

    const notes = [];
    const tier = Math.max(1, Number(skill.tier || 1));
    if (tier > 1) notes.push(`Cần cảnh giới bậc ${tier}`);
    const weapons = (Array.isArray(skill.weaponKinds) ? skill.weaponKinds : []).map((kind) => SKILL_WEAPON_LABELS[kind] || kind);
    if (weapons.length) notes.push(`Vũ khí: ${weapons.join('/')}`);
    if (extraNote) notes.push(extraNote);

    return { tags, rows, notes, desc: String(skill.desc ?? skill.description ?? skill.moTa ?? '').trim() };
  },

  renderSkillCard(skill, extraNote = '') {
    const el = document.getElementById('skill-tip');
    if (!el || !skill) return null;
    const info = this.describeSkill(skill, extraNote);

    const icon = document.getElementById('stip-icon');
    icon.className = `stip-icon pixel-icon ${UI.pixelIconClass(skill, 'skill')}`;
    UI.applySkillIcon(icon, skill);
    document.getElementById('stip-name').textContent = skill.name || skill.code || 'Kỹ năng';
    document.getElementById('stip-tags').replaceChildren(...info.tags.map((tag) => {
      const chip = document.createElement('span');
      chip.className = `stip-tag stip-tag--${tag.kind}`;
      chip.textContent = tag.text;
      return chip;
    }));

    const desc = document.getElementById('stip-desc');
    desc.textContent = info.desc || 'Chưa có mô tả cho kỹ năng này.';
    desc.classList.toggle('is-empty', !info.desc);

    const grid = document.getElementById('stip-grid');
    grid.replaceChildren(...info.rows.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      return [term, detail];
    }));
    grid.hidden = info.rows.length === 0;

    const note = document.getElementById('stip-note');
    note.textContent = info.notes.join(' · ');
    note.hidden = info.notes.length === 0;
    return el;
  },

  positionSkillCard(anchor) {
    const el = document.getElementById('skill-tip');
    if (!el || !anchor?.getBoundingClientRect) return;
    el.style.display = 'block';
    el.setAttribute('aria-hidden', 'false');
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin));
    let top = rect.top - height - margin;
    if (top < margin) top = Math.min(rect.bottom + margin, window.innerHeight - height - margin);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(Math.max(margin, top))}px`;
  },

  showSkillCard(skill, anchor, pinned = false, extraNote = '') {
    if (!this.renderSkillCard(skill, extraNote)) return;
    this._tipPinned = pinned;
    this._tipAnchor = anchor;
    this.positionSkillCard(anchor);
  },

  showTooltip(slotIdx, anchor, pinned = false) {
    const sk = this.slotSkill(S.player, slotIdx);
    if (!sk) return;
    this.showSkillCard(sk, anchor, pinned, slotIdx === 0 ? 'Ô 1 tự gán theo vũ khí đang cầm' : '');
  },

  toggleSkillCard(skill, anchor) {
    const visible = document.getElementById('skill-tip')?.style.display === 'block';
    if (visible && this._tipPinned && this._tipAnchor === anchor) return this.hideTooltip(true);
    this.showSkillCard(skill, anchor, true);
  },

  hideTooltip(force = false) {
    if (this._tipPinned && !force) return;
    const el = document.getElementById('skill-tip');
    if (el) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
    this._tipPinned = false;
    this._tipAnchor = null;
  },

  // Gắn một lần cho 5 ô kỹ năng: chuột rê vào, bàn phím focus, cảm ứng giữ ~0,45s (giữ xong không kích hoạt chiêu).
  bindSkillTips() {
    if (this._tipsBound || typeof document === 'undefined') return;
    this._tipsBound = true;
    for (let i = 0; i < this.SLOT_COUNT; i += 1) {
      const slot = document.getElementById(`skbar-slot-${i}`);
      if (!slot) continue;
      let pressTimer = 0;
      const cancelPress = () => window.clearTimeout(pressTimer);
      slot.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') this.showTooltip(i, slot); });
      slot.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') this.hideTooltip(); });
      slot.addEventListener('focus', () => { if (slot.matches(':focus-visible')) this.showTooltip(i, slot); });
      slot.addEventListener('blur', () => this.hideTooltip());
      slot.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        cancelPress();
        pressTimer = window.setTimeout(() => {
          this._longPressSlot = i;
          this.showTooltip(i, slot, true);
        }, 450);
      });
      slot.addEventListener('pointerup', cancelPress);
      slot.addEventListener('pointercancel', cancelPress);
      slot.addEventListener('contextmenu', (event) => { if (this._longPressSlot === i) event.preventDefault(); });
      // Giữ xong rồi nhả tay chỉ để đọc mô tả, không tung chiêu.
      slot.addEventListener('click', (event) => {
        if (this._longPressSlot !== i) return;
        this._longPressSlot = -1;
        event.stopImmediatePropagation();
        event.preventDefault();
      }, true);
    }
    document.addEventListener('pointerdown', (event) => {
      // Bấm lên chính nút đang ghim thì để toggleSkillCard tự đóng; bấm chỗ khác thì đóng thẻ.
      if (this._tipPinned && !event.target?.closest?.('#skill-tip') && !this._tipAnchor?.contains(event.target)) this.hideTooltip(true);
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this._tipPinned) this.hideTooltip(true);
    });
  },


};
