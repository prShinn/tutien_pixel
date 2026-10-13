"use strict";
// ════════════════════════════════════════════════════════════
// skills.js — §8b Skill System + BE↔FE Mappers
// ════════════════════════════════════════════════════════════

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

  // cd: BE gửi giây → FE dùng ticks (×60)
  const cdTicks = ((sk.hoiChieu ?? sk.cd ?? 10)) * 60;
  const effectDurTicks = ((sk.thoiGianBuff ?? sk.effectDur ?? 0)) * 60;

  return {
    id: sk.code || String(sk.id),
    name: sk.name || sk.tenNangLuc || "Kỹ năng",
    icon: sk.icon || (damageType === "MAGIC" ? "✨" : "⚔️"),
    linhCan: sk.linhCan || "",
    tier: sk.tier || 1,
    category: sk.category || "ACTIVE",
    targetType: sk.targetType || (Number(sk.satThuong || 0) > 0 ? "ENEMY" : "SELF"),
    scalingStat: sk.scalingStat || (damageType === "MAGIC" ? "ene" : "str"),
    damageType,                         // "PHYS" | "MAGIC"
    satThuong: sk.satThuong ?? 1,       // hệ số nhân (1.5 = 150% atk)
    mpCost: sk.mpTieuHao ?? sk.mpCost ?? 0,
    cd: cdTicks,                        // ticks
    range: sk.range ?? sk.tamDanh ?? 5,
    aoe: (sk.dienRong ?? sk.aoeR ?? 0) > 0 || sk.aoe || false,
    aoeR: sk.dienRong ?? sk.aoeR ?? 0,
    effect: effectCode,                 // debuff/buff code
    effectDur: effectDurTicks,          // ticks
    effectVal: sk.effectVal ?? 0,
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
  };
}

// ════════════════════════════════════════════════════════════
// SkillSystem
// ════════════════════════════════════════════════════════════
const SkillSystem = {
  _book: null,
  _selected: new Set(),

  async loadBook() {
    if (!S.player?.id) return;
    try {
      this._book = await Net.get("/api/skills/catalog");
      this._selected = new Set(this._book.equippedSkills || (S.player.skills || []).map((skill) => skill.id));
      this.renderSkillBook();
    } catch (error) {
      console.warn("[Skill] Không tải được sổ thần thông", error);
    }
  },

  async learnSkill(code) {
    const result = await Net.post("/api/player/skills/learn", { skillCode: code, source: "book" });
    if (result?.learnedSkills) {
      if (!this._book) await this.loadBook();
      this._book.learnedSkills = result.learnedSkills;
      this.renderSkillBook();
      UI.log("Đã lĩnh hội thần thông: " + (result.skill?.name || code), "level");
    }
  },

  toggleEquip(code) {
    if (this._selected.has(code)) this._selected.delete(code);
    else if (this._selected.size < 4) this._selected.add(code);
    else return UI.log("Chỉ được trang bị tối đa 4 kỹ năng chủ động.", "system");
    this.renderSkillBook();
  },

  async saveLoadout() {
    const result = await Net.put("/api/player/skills/equip", { skillCodes: [...this._selected] });
    if (result?.skills) {
      S.player.skills = result.skills.map(mapBESkillToFE);
      S.player.equippedSkills = result.equippedSkills;
      UI.update();
      UI.log("Đã thay đổi kỹ năng trang bị.", "level");
    }
  },

  renderSkillBook() {
    const host = document.getElementById("skill-book-list");
    if (!host || !this._book) return;
    const learned = new Set(this._book.learnedSkills || []);
    const visible = (this._book.skills || []).filter((skill) => skill.linhCan === "COMMON" || skill.linhCan === S.player?.linhCan);
    host.innerHTML = visible.map((skill) => {
      const known = learned.has(skill.code);
      const passive = skill.category === "PASSIVE";
      const marked = this._selected.has(skill.code);
      const action = known ? (passive ? "BỊ ĐỘNG" : (marked ? "ĐANG DÙNG" : "TRANG BỊ")) : "HỌC";
      const fn = known ? (passive ? "" : `SkillSystem.toggleEquip('${skill.code}')`) : `SkillSystem.learnSkill('${skill.code}')`;
      const damage = Number(skill.satThuong || 0);
      const details = `${damage > 0 ? `Dame ×${damage}` : "Hỗ trợ"} · MP ${skill.mpTieuHao ?? skill.mpCost ?? 0} · CD ${skill.hoiChieu ?? Math.round((skill.cd || 0) / 60)}s`;
      return `<div class="skill-book-row"><div class="skill-book-info"><strong>${skill.icon || "✦"} ${skill.name}</strong><small>T${skill.tier || 1} · ${details}</small><em>${skill.description || skill.moTa || skill.desc || ""}</em></div><button ${fn ? `onclick="${fn}"` : "disabled"}>${action}</button></div>`;
    }).join("") + `<button class="sbtn" onclick="SkillSystem.saveLoadout()">Lưu loadout</button>`;
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
  calcDmg(skill, target) {
    const p = S.player;
    const stats = p.stats || { str: 5, agi: 5, vit: 5, ene: 5 };
    
    // 1. Xác định base sát thương
    let baseDmg = skill.damageType === "MAGIC" ? Combat.mAtk() : Combat.pAtk();
    const scalingStat = skill.scalingStat || (skill.damageType === "MAGIC" ? "ene" : "str");
    const statVal = stats[scalingStat.toLowerCase()] || 0;
    
    // 2. Hệ số ngũ hành (Tương khắc)
    const eleMult = this.getElementalMult(p.linhCan, target?.linhCan || target?.element);
    
    // 3. Công thức: ((BaseAtk * Hệ số) + (Chỉ số thuộc tính * 2)) * Ngũ Hành
    const satThuong = skill.satThuong ?? 1;
    let dmg = Math.floor((baseDmg * satThuong + statVal * 1.5) * eleMult);

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
    if (Math.random() < Combat.critChance()) {
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
    S.atkFx.push({ px: m.px, py: m.py, r: 14, life: 16 });
    const dmgColor = skill?.damageType === "MAGIC" ? "#ee88ff" : "#ff9966";
    Render.floatDmg(m.px, m.py, -26, "-" + dmg, dmgColor);

    m.hp -= dmg;
    if (m.hp <= 0) {
      m.dead = true;
      m.respawnT = m.spawnCD || 10;
      Combat.dropLoot(m);
    }
    
    if (socket?.connected) {
      socket.emit("attack_effect", {
        targetId: m.id,
        damage: dmg,
        isMonster: true,
        mapCode: S.mapCode,
      });
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
    p.buffs[buffType] = {
      value: skill.effectVal,
      duration: skill.effectDur,
    };
    const names = { atk: "tấn công", def: "phòng thủ", spd: "tốc độ" };
    UI.log(
      `${skill.icon} ${skill.name} → +${skill.effectVal} ${names[buffType] || buffType} (${Math.floor(skill.effectDur / 60)}s)`,
      "level",
    );
  },

  useSkill(slotIdx) {
    const p = S.player;
    if (!p?.skills?.[slotIdx]) return;
    p.animState = "cast";
    p.animUntil = Date.now() + 520;
    if (document.getElementById("shop-modal").classList.contains("open")) return;
    if (document.getElementById("dialog-modal").classList.contains("open")) return;

    const skill = p.skills[slotIdx];
    if (skill.cdLeft > 0) {
      UI.log(`${skill.icon} ${skill.name} đang hồi chiêu! (${Math.ceil(skill.cdLeft / 60)}s)`, "system");
      return;
    }
    if ((p.mp || 0) < skill.mpCost) {
      UI.log("Không đủ linh lực!", "system");
      return;
    }

    if (socket?.connected && (skill.effect === "heal" || skill.effect?.startsWith("buff_"))) {
      socket.emit("skill_request", { skillCode: skill.id });
      return;
    }

    if (!socket?.connected) Render.floatSkill(p.px, p.py, skill.name, skill.damageType === "MAGIC" ? "#d99bff" : "#ffd166");

    if (socket?.connected && skill.effect !== "heal" && !skill.effect?.startsWith("buff_")) {
      const maxRange = (skill.range || 5) * CFG.TS;
      const target = S.monsters
        .filter((monster) => !monster.dead)
        .sort((a, b) => dist(a.px, a.py, p.px, p.py) - dist(b.px, b.py, p.px, p.py))
        .find((monster) => dist(monster.px, monster.py, p.px, p.py) <= maxRange);
      if (!target) return UI.log("Không có mục tiêu.", "system");
      socket.emit("attack_request", { targetId: target.id, skillCode: skill.id, mapId: S.mapCode });
      return;
    }

    p.mp -= skill.mpCost;
    skill.cdLeft = skill.cd;

    // ── Heal (hồi máu) ──
    if (skill.effect === "heal") {
      const baseAtk = skill.damageType === "MAGIC" ? Combat.mAtk() : Combat.pAtk();
      const healAmt = Math.floor(baseAtk * (skill.satThuong || 0.5) + (p.tuViLinhCan || 0) * 0.3);
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      Render.floatDmg(p.px, p.py, -40, "+" + healAmt, "#44ff88");
      UI.log(`${skill.icon} ${skill.name} → Hồi ${healAmt} HP`, "level");
      return;
    }

    // ── Buff bản thân ──
    if (skill.effect?.startsWith("buff_")) {
      this.applyBuff(p, skill);
      return;
    }

    const maxRange = (skill.range || 5) * CFG.TS;

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
      const aoeRange = (skill.aoeR || 3) * CFG.TS;
      let hits = 0;
      for (const m of S.monsters) {
        if (m.dead) continue;
        if (dist(m.px, m.py, center.px, center.py) < aoeRange) {
          const dmg = this.calcDmg(skill, m);
          this.hitMonster(m, dmg, skill);
          hits++;
        }
      }
      S.atkFx.push({ px: center.px, py: center.py, r: aoeRange * 0.4, life: 22 });
      if (hits === 0)
        UI.log(`${skill.icon} ${skill.name} → Không có mục tiêu!`, "system");
      else {
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
        p.buffs[k].duration -= ticks;
        if (p.buffs[k].duration <= 0) delete p.buffs[k];
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
      const sk = p?.skills?.[i];
      const slotEl = document.getElementById(`skbar-slot-${i}`);
      if (!slotEl) continue;
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
        iconEl.textContent = sk.icon || (sk.damageType === 'MAGIC' ? '✨' : '⚔️');
        const rawIcon = sk.icon || (sk.damageType === "MAGIC" ? "✨" : "⚔️");
        if (/^(https?:|\.|\/)/.test(String(rawIcon))) iconEl.innerHTML = `<img src="${rawIcon}" alt="" loading="lazy">`;
        else iconEl.textContent = rawIcon;
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
          typeEl.textContent = '✨M';
          typeEl.className = 'sk-type magic';
        } else {
          typeEl.textContent = '⚔P';
          typeEl.className = 'sk-type phys';
        }

        // Border màu theo type
        slotEl.style.borderColor = sk.damageType === 'MAGIC' ? '#602090' : '#6a4010';
      } else {
        iconEl.textContent = '—';
        nameEl.textContent = 'Chưa có';
        mpEl.textContent   = '';
        slotEl.style.borderColor = '';
        const typeEl = slotEl.querySelector('.sk-type');
        if (typeEl) typeEl.remove();
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

    document.getElementById('stip-name').textContent  = `${sk.icon || ''} ${sk.name}`;

    const typeLabel = sk.damageType === 'MAGIC' ? 'Pháp thuật ✨' : 'Vật lý ⚔';
    const typeEl = document.getElementById('stip-type');
    typeEl.textContent = typeLabel;
    typeEl.className   = sk.damageType === 'MAGIC' ? 'sv stip-type-magic' : 'sv stip-type-phys';

    const baseAtk = sk.damageType === 'MAGIC' ? Combat.mAtk() : Combat.pAtk();
    const estDmg  = Math.floor(baseAtk * (sk.satThuong ?? 1));
    document.getElementById('stip-dmg').textContent   = `×${sk.satThuong ?? 1} (~${estDmg})`;
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
