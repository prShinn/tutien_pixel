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
    linhCan: sk.linhCan || "",
    tier: sk.tier || 1,
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
const SkillSystem = {
  _book: null,
  _selected: new Set(),

  isOffensive(skill) {
    if (!skill) return false;
    return Number(skill.satThuong || 0) > 0
      && !["heal", "shield", "cleanse", "speed"].includes(String(skill.effect || ""));
  },

  tryAutoSkill(target) {
    const player = S.player;
    if (!player || player.dead || !target || target.dead || S.combatPending || S.combatGcd > 0) return false;
    const now = Date.now();
    for (let slot = 0; slot < (player.skills || []).length; slot += 1) {
      const skill = player.skills[slot];
      if (!skill || String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE") continue;
      if (Number(skill.cdLeft || 0) > 0 || Number(player.mp || 0) < Number(skill.mpCost || 0)) continue;

      const effect = String(skill.effect || "");
      let shouldCast = false;
      if (this.isOffensive(skill)) {
        const range = Math.max(1, Number(skill.range || 5)) * CFG.SKILL_RANGE_SCALE;
        shouldCast = dist(target.px, target.py, player.px, player.py) <= range;
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
      const visible = catalog.filter((skill) => skill.linhCan === "COMMON" || skill.linhCan === S.player.linhCan);
      const learned = new Set((this._book.learnedSkills || []).map(String));
      const visibleByCode = new Map(visible.map((skill) => [String(skill.code || skill.id || ""), skill]));
      const requested = Array.isArray(this._book.equippedSkills)
        ? this._book.equippedSkills
        : (S.player.skills || []).map((skill) => skill.code || skill.id);
      const selected = requested.map(String).filter((code) => {
        const skill = visibleByCode.get(code);
        return skill
          && String(skill.category || "ACTIVE").toUpperCase() !== "PASSIVE"
          && (!learned.size || learned.has(code));
      });
      this._selected = new Set(selected);
      if (selected.length < requested.length) {
        UI.notify("Có kỹ năng trang bị cũ không còn phù hợp linh căn; hãy chọn lại rồi lưu loadout.", "warning");
      }
      this.renderSkillBook();
    } catch (error) {
      console.warn("[Skill] Không tải được sổ thần thông", error);
    }
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
        S.player.learnedSkills = result.learnedSkills;
        if (Number.isFinite(Number(result.combatPower))) S.player.combatPower = Number(result.combatPower);
      }
      this.renderSkillBook();
      UI.log("Đã lĩnh hội thần thông: " + (result.skill?.name || code), "level");
    } catch {
      UI.notify("Mất kết nối khi lĩnh hội kỹ năng. Hãy thử lại.", "error");
    }
  },

  toggleEquip(code) {
    if (this._selected.has(code)) this._selected.delete(code);
    else if (this._selected.size < 4) this._selected.add(code);
    else return UI.notify("Chỉ được trang bị tối đa 4 kỹ năng chủ động.", "warning");
    this.renderSkillBook();
    UI.notify(this._selected.has(code)
      ? "Đã chọn kỹ năng. Bấm Lưu loadout để áp dụng."
      : "Đã bỏ chọn kỹ năng. Bấm Lưu loadout để áp dụng.", "info");
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
        S.player.skills = result.skills.map(mapBESkillToFE);
        S.player.equippedSkills = result.equippedSkills;
        UI.update();
        UI.notify("Đã lưu kỹ năng trang bị.", "success");
      } else {
        UI.notify(result?.error || "Chưa lưu được kỹ năng, hãy thử lại.", "error");
      }
    } catch {
      UI.notify("Mất kết nối khi lưu kỹ năng. Hãy thử lại.", "error");
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = "Lưu loadout";
      }
    }
  },

  renderSkillBook() {
    const host = document.getElementById("skill-book-list");
    if (!host || !this._book) return;
    const learned = new Set(this._book.learnedSkills || []);
    const visible = (this._book.skills || []).filter((skill) => skill.linhCan === "COMMON" || skill.linhCan === S.player?.linhCan);
    const rows = visible.map((skill) => {
      const known = learned.has(skill.code);
      const passive = String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE";
      const action = known ? (passive ? "TỰ ĐỘNG" : (this._selected.has(skill.code) ? "ĐANG DÙNG" : "TRANG BỊ")) : "HỌC";
      const damage = Number(skill.satThuong || 0);
      const details = `${damage > 0 ? `Dame ×${damage}` : "Hỗ trợ"} · MP ${skill.mpTieuHao ?? skill.mpCost ?? 0} · CD ${skill.hoiChieu ?? Math.round((skill.cd || 0) / 60)}s`;
      const row = document.createElement("div");
      row.className = "skill-book-row";
      const info = document.createElement("div");
      info.className = "skill-book-info";
      const title = document.createElement("strong");
      const icon = UI.createPixelIcon(skill, "skill", "skill-book-icon");
      title.append(icon, document.createTextNode(` ${skill.name || skill.code || "Kỹ năng"} `));
      const category = document.createElement("span");
      category.className = `skill-category ${passive ? "passive" : "active"}`;
      category.textContent = passive ? "BỊ ĐỘNG" : "CHỦ ĐỘNG";
      title.appendChild(category);
      const summary = document.createElement("small");
      summary.textContent = `T${skill.tier || 1} · ${details}`;
      const description = document.createElement("em");
      description.textContent = skill.description || skill.moTa || skill.desc || "";
      info.append(title, summary, description);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action;
      button.disabled = known && passive;
      if (!known) button.onclick = () => SkillSystem.learnSkill(skill.code);
      else if (!passive) button.onclick = () => SkillSystem.toggleEquip(skill.code);
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "skill-preview-btn";
      preview.textContent = "Xem";
      preview.title = `Xem hiệu ứng ${skill.name || skill.code}`;
      preview.setAttribute("aria-label", `Xem hiệu ứng kỹ năng ${skill.name || skill.code}`);
      preview.onclick = () => {
        if (typeof SkillVFX !== "undefined") SkillVFX.preview(skill);
      };
      const actions = document.createElement("div");
      actions.className = "skill-book-actions";
      actions.append(preview, button);
      row.append(info, actions);
      return row;
    });
    const save = document.createElement("button");
    save.className = "sbtn skill-save-btn";
    save.textContent = "Lưu loadout";
    save.onclick = () => SkillSystem.saveLoadout();
    host.replaceChildren(...rows, save);
  },

  // Gán kỹ năng ngẫu nhiên: 2 thấp (tier 1-2) và 2 cao (tier 3-4) theo kịch bản
  assignSkills(linhCan) {
    const tiers = CFG.SKILLS[linhCan];
    if (!tiers || tiers.length === 0) return [];
    
    let result = [];
    // 2 kỹ năng thấp (Tier 1 & 2)
    const lowTiers = [0, 1]; 
    lowTiers.forEach(tIdx => {
      const arr = tiers[tIdx];
      if (arr && arr.length) {
        const sk = arr[randInt(0, arr.length - 1)];
        result.push({ ...sk, level: 1, cdLeft: 0 });
      }
    });
    
    // 2 kỹ năng cao (Tier 3 & 4)
    const highTiers = [2, 3];
    highTiers.forEach(tIdx => {
      const arr = tiers[tIdx];
      if (arr && arr.length) {
        const sk = arr[randInt(0, arr.length - 1)];
        result.push({ ...sk, level: 1, cdLeft: 0 });
      }
    });

    const allSkills = tiers.flat().filter(Boolean);
    const attack = allSkills.find((sk) => Number(sk?.satThuong || 0) > 0
      && sk.effect !== "heal"
      && !String(sk.effect || "").startsWith("buff_"));
    const aoe = allSkills.find((sk) => Number(sk?.satThuong || 0) > 0 && Number(sk.aoeR || 0) > 0);
    for (const guaranteed of [attack, aoe]) {
      if (guaranteed && !result.some((sk) => sk.id === guaranteed.id)) result.unshift({ ...guaranteed, level: 1, cdLeft: 0 });
    }
    return result.filter(Boolean).slice(0, 4);
  },

  // Logic Tương Khắc Ngũ Hành
  getElementalMult(atkLC, defLC) {
    return affinityMultiplier(atkLC, defLC);
    /*
    const counters = {
      "KIM": "MOC",
      "MOC": "THO",
      "THO": "THUY",
      "THUY": "HOA",
      "HOA": "KIM"
    };
    if (counters[atkLC] === defLC) return 1.3; // Khắc hệ: +30% dmg
    
    const resisted = {
      "MOC": "KIM",
      "THO": "MOC",
      "THUY": "THO",
      "HOA": "THUY",
      "KIM": "HOA"
    };
    if (resisted[atkLC] === defLC) return 0.7; // Bị khắc: -30% dmg
    return 1.0; */
  },

  // Tính sát thương kỹ năng dựa trên thuộc tính, vai trò và ngũ hành
  calcDmg(skill, target, areaSecondary = false) {
    const p = S.player;
    const stats = p.stats || { str: 5, agi: 5, vit: 5, ene: 5 };
    
    // 1. Xác định base sát thương
    let baseDmg = skill.damageType === "MAGIC" ? Combat.mAtk() : Combat.pAtk();
    const scalingStat = skill.scalingStat || (skill.damageType === "MAGIC" ? "ene" : "str");
    const statVal = stats[scalingStat.toLowerCase()] || 0;
    
    // 2. Hệ số ngũ hành (Tương khắc)
    const eleMult = affinityProfile(p.linhCan, target?.linhCan || target?.element, elementalStrength(p), elementalStrength(target)).multiplier;
    
    // 3. Công thức: ((BaseAtk * Hệ số) + (Chỉ số thuộc tính * 2)) * Ngũ Hành
    const satThuong = skill.satThuong ?? 1;
    const skillScale = satThuong * GAME_BALANCE.damage.skillMultiplier;
    let dmg = Math.floor((baseDmg * skillScale + statVal * GAME_BALANCE.damage.skillStatScale) * eleMult * (areaSecondary ? GAME_BALANCE.damage.areaSecondaryMultiplier : 1));

    // 4. Hệ số cộng thêm từ tu vi linh căn
    const tvlcMult = 1 + (p.tuViLinhCan || 0) / 10000;
    dmg = Math.floor(dmg * tvlcMult);

    // 4. Giảm theo def quái (phép xuyên 50% giáp)
    if (target) {
      const def = skill.damageType === "MAGIC" ? (target.mDef ?? target.def ?? 0) : (target.pDef ?? target.def ?? 0);
      const reduction = def / (100 + def);
      dmg = Math.max(1, Math.floor(dmg * (1 - reduction)));
    }

    // 5. Chí mạng (Crit)
    if (Math.random() < Combat.critChance(target)) {
      dmg = Math.floor(dmg * (1.5 + Combat.critMultiplier()));
    }

    // 6. Random biến thiên (+- 8%)
    const variance = Math.floor(dmg * 0.08);
    return Math.max(1, dmg + randInt(-variance, variance));
  },

  effectName(e) {
    return (
      {
        burn: "Thiêu Đốt",
        freeze: "Đóng Băng",
        slow: "Làm Chậm",
        poison: "Trúng Độc",
        stun: "Choáng",
        root: "Trói",
        bleed: "Chảy Máu",
        weaken: "Suy Yếu",
        drain: "Hút Sinh Lực",
      }[e] || e
    );
  },

  applyStatusToMonster(m, skill) {
    const e = skill.effect;
    if (!e || e.startsWith("buff_") || e === "heal") return;
    if (!m.statusEffects) m.statusEffects = [];
    m.statusEffects = m.statusEffects.filter((x) => x.type !== e);
    m.statusEffects.push({
      type: e,
      duration: skill.effectDur || 120,
      value: skill.effectVal || 0,
      tickTimer: 0,
    });
  },

  hitMonster(m, dmg, skill) {
    m.hitUntil = Date.now() + 180;
    const dmgColor = skill?.damageType === "MAGIC" ? "#ee88ff" : "#ff9966";
    Render.floatDmg(m.px, m.py, -26, "-" + dmg, dmgColor);

    m.hp -= dmg;
    if (m.hp <= 0) {
      m.dead = true;
      m.respawnT = m.spawnCD || 10;
      Combat.dropLoot(m);
    }
    
    this.applyStatusToMonster(m, skill);
    // Weapon proc effect
    const weapEff = S.player.equipment?.weapon?.effect;
    if (weapEff) {
      if (!m.statusEffects) m.statusEffects = [];
      if (!m.statusEffects.find((x) => x.type === weapEff))
        m.statusEffects.push({ type: weapEff, duration: 120, value: 3, tickTimer: 0 });
    }
    if (m.hp <= 0 && !m.dead) {
      m.dead = true;
      m.respawnT = m.spawnCD;
      Combat.dropLoot(m);
    }
  },

  applyBuff(p, skill) {
    if (!p.buffs) p.buffs = {};
    const buffType = skill.effect.replace("buff_", "");
    const buffKey = skill.effect.startsWith("buff_") ? skill.effect : buffType;
    const duration = skill.effectDur || 240;
    p.buffs[buffKey] = {
      value: skill.effectVal,
      duration,
      expiresAt: Date.now() + duration * 16,
    };
    if (typeof SkillVFX !== "undefined") SkillVFX.activateBuff(skill, duration * 16);
    UI.renderSkillEffects?.();
    const names = { atk: "damage tay", def: "phòng thủ", spd: "tốc độ", cast: "tốc độ ra chiêu", crit: "chí mạng", hp_regen: "HP/giây", mp_regen: "MP/giây", vitals: "HP/MP tối đa" };
    UI.log(
      `${skill.icon} ${skill.name} → +${skill.effectVal} ${names[buffType] || buffType} (${Math.floor(skill.effectDur / 60)}s)`,
      "level",
    );
  },

  useSkill(slotIdx) {
    const p = S.player;
    if (!p?.skills?.[slotIdx] || p.dead) return;
    if (S.combatGcd > 0 || S.combatPending) return;
    if (document.getElementById("shop-modal").classList.contains("open")) return;
    if (document.getElementById("dialog-modal").classList.contains("open")) return;

    const skill = p.skills[slotIdx];
    if (String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE") {
      UI.log(`${skill.icon || "✦"} ${skill.name} là kỹ năng bị động và luôn có hiệu lực.`, "system");
      return;
    }
    const offensive = this.isOffensive(skill);
    if (skill.cdLeft > 0) {
      UI.log(`${skill.icon} ${skill.name} đang hồi chiêu! (${Math.ceil(skill.cdLeft / 60)}s)`, "system");
      return;
    }
    if ((p.mp || 0) < skill.mpCost) {
      UI.log("Không đủ linh lực!", "system");
      return;
    }

    if (socket?.connected && !offensive) {
      S.combatPending = true;
      Net.command("combat.skill", { skillCode: skill.code || skill.id || skill._beId });
      return;
    }

    if (socket?.connected && offensive) {
      const maxRange = (skill.range || 5) * CFG.SKILL_RANGE_SCALE;
      const target = (S.target && !S.target.dead && dist(S.target.px, S.target.py, p.px, p.py) <= maxRange)
        ? S.target
        : S.monsters
            .filter((monster) => !monster.dead)
            .sort((a, b) => dist(a.px, a.py, p.px, p.py) - dist(b.px, b.py, p.px, p.py))
            .find((monster) => dist(monster.px, monster.py, p.px, p.py) <= maxRange);
      if (!target) return UI.log("Không có mục tiêu trong tầm.", "system");
      S.target = target;
      S.combatPending = true;
      Net.command("combat.attack", { targetId: target.id, skillCode: skill.code || skill.id || skill._beId, mapCode: S.mapCode });
      return;
    }

    const animate = () => {
      this.animateCast(p, skill);
      Render.floatSkill(p.px, p.py, skill.name, skill.damageType === "MAGIC" ? "#d99bff" : "#ffd166");
    };
    if (!offensive) animate();
    p.mp -= skill.mpCost;
    skill.cdLeft = skill.cd;

    if (!offensive && !["heal", "restore_mp"].includes(skill.effect) && !skill.effect?.startsWith("buff_")) {
      if (["shield", "speed"].includes(String(skill.effect || ""))) this.applyBuff(p, skill);
      if (skill.effect === "cleanse") p.debuffs = {};
      if (typeof SkillVFX !== "undefined") SkillVFX.support(skill, p);
      return;
    }

    // ── Heal (hồi máu) ──
    if (skill.effect === "heal") {
      const baseAtk = skill.damageType === "MAGIC" ? Combat.mAtk() : Combat.pAtk();
      const healAmt = Math.floor(baseAtk * (skill.satThuong || 0.5) + (p.tuViLinhCan || 0) * 0.3);
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      Render.floatDmg(p.px, p.py, -40, "+" + healAmt, "#44ff88");
      UI.log(`${skill.icon} ${skill.name} → Hồi ${healAmt} HP`, "level");
      if (typeof SkillVFX !== "undefined") SkillVFX.support(skill, p);
      return;
    }

    if (skill.effect === "restore_mp") {
      const restore = Number(skill.effectVal || 0);
      p.mp = Math.min(p.maxMp, p.mp + restore);
      Render.floatDmg(p.px, p.py, -40, "+" + restore, "#66ccff");
      UI.log(`${skill.icon} ${skill.name} → Hồi ${restore} MP`, "level");
      if (typeof SkillVFX !== "undefined") SkillVFX.support(skill, p);
      return;
    }

    // ── Buff bản thân ──
    if (skill.effect?.startsWith("buff_")) {
      this.applyBuff(p, skill);
      if (typeof SkillVFX !== "undefined") SkillVFX.support(skill, p);
      return;
    }

    const maxRange = (skill.range || 5) * CFG.SKILL_RANGE_SCALE;

    // ── AoE ──
    if (skill.aoe) {
      // Tìm tâm AoE = quái gần nhất trong tầm
      let center = p;
      let closestD = maxRange;
      for (const m of S.monsters) {
        if (m.dead) continue;
        const d = dist(m.px, m.py, p.px, p.py);
        if (d < closestD) { closestD = d; center = m; }
      }
      const aoeRange = (skill.aoeR || 3) * CFG.SKILL_RANGE_SCALE;
      let hits = 0;
      const hitTargets = [];
      for (const m of S.monsters) {
        if (m.dead) continue;
        if (dist(m.px, m.py, center.px, center.py) < aoeRange) {
          const dmg = this.calcDmg(skill, m, hits > 0);
          this.hitMonster(m, dmg, skill);
          hitTargets.push(m);
          hits++;
        }
      }
      if (hits === 0)
        UI.log(`${skill.icon} ${skill.name} → Không có mục tiêu!`, "system");
      else {
        animate();
        if (typeof SkillVFX !== "undefined") SkillVFX.impact(skill, p, hitTargets);
        UI.log(
          `${skill.icon} ${skill.name} [${skill.damageType}] → ${hits} mục tiêu${skill.effect ? " [" + this.effectName(skill.effect) + "]" : ""}`,
          "combat",
        );
      }
    } else {
      // ── Single target ──
      let best = null;
      let bd = maxRange;
      for (const m of S.monsters) {
        if (m.dead) continue;
        const d = dist(m.px, m.py, p.px, p.py);
        if (d < bd) { bd = d; best = m; }
      }
      if (!best) {
        UI.log(`${skill.icon} ${skill.name} → Không có mục tiêu trong tầm!`, "system");
        skill.cdLeft = Math.floor(skill.cd * 0.25); // Hoàn lại 75% CD
        p.mp += skill.mpCost;                       // Hoàn lại MP
        return;
      }
      const dmg = this.calcDmg(skill, best);
      this.hitMonster(best, dmg, skill);
      animate();
      if (typeof SkillVFX !== "undefined") SkillVFX.impact(skill, p, [best]);
      UI.log(
        `${skill.icon} ${skill.name} [${skill.damageType}×${skill.satThuong}] → ${best.name} -${dmg}${skill.effect ? " [" + this.effectName(skill.effect) + "]" : ""}`,
        "combat",
      );
    }
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
    const learned = new Set((p.learnedSkills || []).map(String));
    const equipped = new Set((p.equippedSkills || []).map(String));
    for (let index = 0; index < 4; index += 1) {
      const candidate = p.skills[index];
      const code = candidate ? String(candidate.code || candidate.id || "") : "";
      const skill = candidate
        && String(candidate.category || "ACTIVE").toUpperCase() !== "PASSIVE"
        && (!learned.size || learned.has(code))
        && (!equipped.size || equipped.has(code))
        ? candidate
        : null;
      const slot = document.getElementById(`skbar-slot-${index}`);
      const wrap = document.getElementById(`skbar-cd-wrap-${index}`);
      const text = document.getElementById(`skbar-cd-text-${index}`);
      const ring = wrap?.querySelector(".cd-ring");
      if (!slot || !wrap || !text || !ring) continue;
      const active = Boolean(skill && skill.cdLeft > 0);
      const ratio = active ? Math.min(1, skill.cdLeft / Math.max(1, skill.cd || 1)) : 0;
      const offset = active ? (113 * (1 - ratio)).toFixed(2) : "0";
      const label = active ? `${Math.ceil(skill.cdLeft / 60)}s` : "";
      const signature = `${active}:${offset}:${label}`;
      if (this._cooldownVisuals.get(index) === signature) continue;
      this._cooldownVisuals.set(index, signature);
      wrap.style.display = active ? "flex" : "none";
      slot.classList.toggle("on-cd", active);
      if (active) {
        ring.setAttribute("stroke-dashoffset", offset);
        text.textContent = label;
      }
    }
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

  renderSkillBar() {
    const p = S.player;
    const CIRC = 113; // 2 * π * r = 2 * π * 18 ≈ 113

    for (let i = 0; i < 4; i++) {
      const candidate = p?.skills?.[i];
      const learned = new Set((p?.learnedSkills || []).map(String));
      const equipped = new Set((p?.equippedSkills || []).map(String));
      const candidateCode = candidate ? String(candidate.code || candidate.id || "") : "";
      const sk = candidate
        && String(candidate.category || "ACTIVE").toUpperCase() !== "PASSIVE"
        && (!learned.size || learned.has(candidateCode))
        && (!equipped.size || equipped.has(candidateCode))
        ? candidate
        : null;
      const slotEl = document.getElementById(`skbar-slot-${i}`);
      if (!slotEl) continue;
      slotEl.disabled = !sk;
      slotEl.setAttribute("aria-label", sk ? `Kỹ năng ${i + 1}: ${sk.name}` : `Ô kỹ năng ${i + 1}, chưa gắn`);
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
      const cdText = ensure(`#skbar-cd-text-${i}`, 'span', 'skbar-cd-text');
      cdText.id = `skbar-cd-text-${i}`;
      let cdRing = cdWrap.querySelector('.cd-ring');
      if (!cdRing) { cdRing = document.createElement('span'); cdRing.className = 'cd-ring'; cdWrap.appendChild(cdRing); }

      // ── Cập nhật nội dung slot ──
      if (!iconEl || !nameEl || !mpEl || !slotEl) continue;

      if (sk) {
        const passive = String(sk.category || 'ACTIVE').toUpperCase() === 'PASSIVE';
        let categoryEl = slotEl.querySelector('.sk-category');
        if (!categoryEl) { categoryEl = document.createElement('span'); categoryEl.className = 'sk-category'; slotEl.appendChild(categoryEl); }
        categoryEl.textContent = passive ? 'BỊ ĐỘNG' : 'CHỦ ĐỘNG';
        categoryEl.className = `sk-category ${passive ? 'passive' : 'active'}`;
        slotEl.classList.toggle('passive-skill', passive);
        slotEl.title = passive ? `${sk.name} · Bị động (tự động)` : `${sk.name} · Chủ động · phím ${i + 1}`;
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
        slotEl.title = '';
      }

      // ── Circular Cooldown SVG ──
      if (sk?.cdLeft > 0) {
        const ratio = Math.min(1, sk.cdLeft / (sk.cd || 1));
        // dashoffset = CIRC khi đầy (không thấy ring) → 0 khi hết
        // Ta muốn ring "thu nhỏ" theo thời gian đếm ngược
        const offset = CIRC * (1 - ratio);
        cdRing.setAttribute('stroke-dashoffset', offset.toFixed(2));
        cdText.textContent = Math.ceil(sk.cdLeft / 60) + 's';
        cdWrap.style.display = 'flex';
        slotEl.classList.add('on-cd');
      } else {
        cdWrap.style.display = 'none';
        slotEl.classList.remove('on-cd');
      }
    }
  },

  // ── Tooltip khi hover vào slot ──
  showTooltip(slotIdx, event) {
    const sk = S.player?.skills?.[slotIdx];
    const el = document.getElementById('skill-tip');
    if (!el || !sk) return;

    document.getElementById('stip-name').replaceChildren(
      UI.createPixelIcon(sk, 'skill', 'tip-pixel-icon'),
      document.createTextNode(` ${sk.name}`),
    );

    const passive = String(sk.category || 'ACTIVE').toUpperCase() === 'PASSIVE';
    const typeLabel = passive ? 'BỊ ĐỘNG · Tự động' : `CHỦ ĐỘNG · ${sk.damageType === 'MAGIC' ? 'Pháp thuật' : 'Vật lý'}`;
    const typeEl = document.getElementById('stip-type');
    typeEl.textContent = typeLabel;
    typeEl.className   = passive ? 'sv stip-type-passive' : (sk.damageType === 'MAGIC' ? 'sv stip-type-magic' : 'sv stip-type-phys');

    const baseAtk = sk.damageType === 'MAGIC' ? Combat.mAtk() : Combat.pAtk();
    const scalingStat = sk.scalingStat || (sk.damageType === 'MAGIC' ? 'ene' : 'str');
    const statVal = Number(S.player?.stats?.[scalingStat.toLowerCase()] || 0);
    const estDmg = Math.floor(baseAtk * (sk.satThuong ?? 1) * GAME_BALANCE.damage.skillMultiplier + statVal * GAME_BALANCE.damage.skillStatScale);
    document.getElementById('stip-dmg').textContent = `Burst ×${sk.satThuong ?? 1} (~${estDmg})`;
    document.getElementById('stip-mp').textContent    = sk.mpCost + ' MP';
    document.getElementById('stip-cd').textContent    = Math.round((sk.cd || 0) / 60) + 's';
    document.getElementById('stip-range').textContent = (sk.aoe ? `AoE r${sk.aoeR}` : `${sk.range} tile`);
    document.getElementById('stip-desc').textContent  = sk.desc || '';

    // Vị trí tooltip: bên trái cursor, trên skill bar
    const x = Math.min(event.clientX - 10, window.innerWidth - 270);
    el.style.left    = x + 'px';
    el.style.display = 'block';
  },

  hideTooltip() {
    const el = document.getElementById('skill-tip');
    if (el) el.style.display = 'none';
  },


};
