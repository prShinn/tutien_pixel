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
  // Gán kỹ năng ngẫu nhiên từng tier cho linhCan
  assignSkills(linhCan) {
    const tiers = CFG.SKILLS[linhCan];
    if (!tiers || tiers.length === 0) return [];
    return tiers.map((tierArr) => {
      if (!tierArr || tierArr.length === 0) return null;
      const base = tierArr[randInt(0, tierArr.length - 1)];
      return { ...base, level: 1, cdLeft: 0 };
    }).filter(Boolean);
  },

  // Tính sát thương kỹ năng:
  //   damageType === "PHYS" → baseAtk = Combat.pAtk()
  //   damageType === "MAGIC" → baseAtk = Combat.mAtk()
  //   finalDmg = baseAtk × satThuong − monsterDef×0.5
  // Tính sát thương kỹ năng dựa trên thuộc tính và vai trò
  calcDmg(skill, target) {
    const p = S.player;
    const stats = p.stats || { str: 5, agi: 5, vit: 5, ene: 5 };
    
    // 1. Xác định base sát thương (mặc định theo pAtk/mAtk nếu không có scalingStat cụ thể)
    let baseDmg = skill.damageType === "MAGIC" ? Combat.mAtk() : Combat.pAtk();
    
    // 2. Nếu kỹ năng có scaling theo thuộc tính cụ thể (từ backend hoặc định nghĩa thêm)
    // Ví dụ: Kỹ năng của Đấu Sĩ scale thêm theo VIT, Sát Thủ theo AGI
    const scalingStat = skill.scalingStat || (skill.damageType === "MAGIC" ? "ene" : "str");
    const statVal = stats[scalingStat.toLowerCase()] || 0;
    
    // Công thức: (BaseAtk * Hệ số) + (Chỉ số thuộc tính * 2)
    const satThuong = skill.satThuong ?? 1;
    let dmg = Math.floor(baseDmg * satThuong + statVal * 2);

    // 3. Hệ số cộng thêm từ tu vi linh căn
    const tvlcMult = 1 + (p.tuViLinhCan || 0) / 10000;
    dmg = Math.floor(dmg * tvlcMult);

    // 4. Giảm theo def quái (phép xuyên 50% giáp)
    if (target) {
      const def = (target.def || 0);
      const defReduction = skill.damageType === "MAGIC" ? def * 0.5 : def;
      dmg = Math.max(1, dmg - Math.floor(defReduction));
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
    m.hp -= dmg;
    S.atkFx.push({ px: m.px, py: m.py, r: 14, life: 16 });
    // Màu float damage: MAGIC → tím, PHYS → đỏ cam
    const dmgColor = skill?.damageType === "MAGIC" ? "#ee88ff" : "#ff9966";
    Render.floatDmg(m.px, m.py, -26, "-" + dmg, dmgColor);
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
        const dmgSample = this.calcDmg(skill);
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

      // ── Cập nhật nội dung slot ──
      const iconEl  = document.getElementById(`skbar-icon-${i}`);
      const nameEl  = document.getElementById(`skbar-name-${i}`);
      const mpEl    = document.getElementById(`skbar-mp-${i}`);
      const slotEl  = document.getElementById(`skbar-slot-${i}`);
      if (!iconEl || !nameEl || !mpEl || !slotEl) continue;

      if (sk) {
        iconEl.textContent = sk.icon || (sk.damageType === 'MAGIC' ? '✨' : '⚔️');
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
      const cdWrap = document.getElementById(`skbar-cd-wrap-${i}`);
      const cdRing = document.getElementById(`skbar-cd-ring-${i}`);
      const cdText = document.getElementById(`skbar-cd-text-${i}`);
      if (!cdWrap || !cdRing || !cdText) continue;

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
