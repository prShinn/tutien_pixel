"use strict";
// ════════════════════════════════════════════════════════════
// skills.js — §8b Skill System + BE↔FE Mappers
// ════════════════════════════════════════════════════════════

// ── Helpers chuyển đổi định dạng kỹ năng giữa Backend và Frontend ──
function mapBESkillToFE(sk) {
  let feRef = null;
  outer: for (const tiers of Object.values(CFG.SKILLS)) {
    for (const tierArr of tiers) {
      const f = tierArr.find((s) => s.id === (sk.code || sk.id));
      if (f) {
        feRef = f;
        break outer;
      }
    }
  }
  return {
    id: sk.code || String(sk.id),
    name: sk.name || sk.tenNangLuc,
    icon: sk.icon || "⚔️",
    tier: feRef?.tier || sk.tier || 1,
    mpCost: sk.mpTieuHao ?? sk.mpCost ?? 0,
    cd: sk.hoiChieu ?? sk.cd ?? 60,
    range: feRef?.range ?? sk.range ?? 5,
    aoe: (sk.dienRong ?? sk.aoeR ?? 0) > 0,
    aoeR: sk.dienRong ?? sk.aoeR ?? 0,
    effect: sk.type ?? sk.effect ?? null,
    effectDur: sk.thoiGianBuff ?? sk.effectDur ?? 0,
    effectVal: sk.satThuong ?? sk.effectVal ?? 0,
    desc: sk.description ?? sk.moTa ?? sk.desc ?? "",
    level: sk.level || 1,
    cdLeft: 0,
    _beId: sk.id || null,
  };
}

function mapFESkillToBE(sk) {
  return {
    id: sk._beId || undefined,
    code: sk.id,
    name: sk.name,
    icon: sk.icon,
    mpTieuHao: sk.mpCost,
    hoiChieu: sk.cd,
    satThuong: sk.effectVal || 0,
    dienRong: sk.aoeR || 0,
    thoiGianBuff: sk.effectDur || 0,
    type: sk.effect || null,
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

  calcDmg(skill) {
    const p = S.player;
    const tuViBonus = (p.tuViLinhCan || 0) * 0.4;
    const realmBonus = (p.canhGioi?.stt || 0) * 8;
    const eneBonus = (p.stats?.ene || 0) * 2;
    const levelBonus = (skill.level || 1) * 5;
    const weaponBonus = Combat.weaponAttack() * 0.3;
    const tierMult = [1, 1.6, 2.4, 4.0][skill.tier - 1] || 1;
    return Math.max(
      1,
      Math.floor(
        (tuViBonus + realmBonus + eneBonus + levelBonus + weaponBonus) *
          tierMult,
      ),
    );
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
    Render.floatDmg(m.px, m.py, -26, "-" + dmg, "#ee88ff");
    this.applyStatusToMonster(m, skill);
    // Weapon bonus effect
    const weapEff = S.player.equipment?.weapon?.effect;
    if (weapEff) {
      if (!m.statusEffects) m.statusEffects = [];
      if (!m.statusEffects.find((x) => x.type === weapEff))
        m.statusEffects.push({
          type: weapEff,
          duration: 120,
          value: 3,
          tickTimer: 0,
        });
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
    if (document.getElementById("shop-modal").classList.contains("open"))
      return;
    if (document.getElementById("dialog-modal").classList.contains("open"))
      return;
    const skill = p.skills[slotIdx];
    if (skill.cdLeft > 0) {
      UI.log(
        `${skill.icon} ${skill.name} đang hồi chiêu! (${Math.ceil(skill.cdLeft / 60)}s)`,
        "system",
      );
      return;
    }
    if ((p.mp || 0) < skill.mpCost) {
      UI.log("Không đủ linh lực!", "system");
      return;
    }

    p.mp -= skill.mpCost;
    skill.cdLeft = skill.cd;

    // Heal & buff on self
    if (skill.effect === "heal") {
      const dmg = this.calcDmg(skill);
      const healAmt = Math.floor(dmg * 0.5 + 20 + (p.tuViLinhCan || 0) * 0.3);
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      Render.floatDmg(p.px, p.py, -40, "+" + healAmt, "#44ff88");
      UI.log(`${skill.icon} ${skill.name} → Hồi ${healAmt} HP`, "level");
      return;
    }
    if (skill.effect?.startsWith("buff_")) {
      this.applyBuff(p, skill);
      return;
    }

    const maxRange = (skill.range || 5) * CFG.TS;
    const dmg = this.calcDmg(skill);

    if (skill.aoe) {
      let center = p;
      let closestD = maxRange;
      for (const m of S.monsters) {
        if (m.dead) continue;
        const d = dist(m.px, m.py, p.px, p.py);
        if (d < closestD) {
          closestD = d;
          center = m;
        }
      }
      const aoeRange = (skill.aoeR || 3) * CFG.TS;
      let hits = 0;
      for (const m of S.monsters) {
        if (m.dead) continue;
        if (dist(m.px, m.py, center.px, center.py) < aoeRange) {
          const finalDmg = Math.max(1, dmg - randInt(0, Math.floor(dmg * 0.15)));
          this.hitMonster(m, finalDmg, skill);
          hits++;
        }
      }
      S.atkFx.push({ px: center.px, py: center.py, r: aoeRange * 0.4, life: 22 });
      if (hits === 0)
        UI.log(`${skill.icon} ${skill.name} → Không có mục tiêu!`, "system");
      else
        UI.log(
          `${skill.icon} ${skill.name} → ${hits} mục tiêu, ${dmg} ST/mục tiêu${skill.effect ? " [" + this.effectName(skill.effect) + "]" : ""}`,
          "combat",
        );
    } else {
      let best = null;
      let bd = maxRange;
      for (const m of S.monsters) {
        if (m.dead) continue;
        const d = dist(m.px, m.py, p.px, p.py);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (!best) {
        UI.log(`${skill.icon} ${skill.name} → Không có mục tiêu trong tầm!`, "system");
        skill.cdLeft = Math.floor(skill.cd * 0.25);
        p.mp += skill.mpCost;
        return;
      }
      this.hitMonster(best, dmg, skill);
      UI.log(
        `${skill.icon} ${skill.name} → ${best.name} -${dmg} ST${skill.effect ? " [" + this.effectName(skill.effect) + "]" : ""}`,
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
    for (let i = 0; i < 4; i++) {
      const slot = document.getElementById(`skill-slot-${i}`);
      if (!slot) continue;
      const sk = p?.skills?.[i];
      slot.querySelector(".sk-icon").textContent = sk?.icon || "—";
      slot.querySelector(".sk-name").textContent = sk?.name || "Chưa có";
      const mpEl = slot.querySelector(".sk-mp");
      if (mpEl) mpEl.textContent = sk ? sk.mpCost + "mp" : "";
      const cdEl = document.getElementById(`sk-cd-${i}`);
      if (!cdEl) continue;
      if (sk?.cdLeft > 0) {
        cdEl.style.display = "flex";
        cdEl.textContent = Math.ceil(sk.cdLeft / 60) + "s";
      } else cdEl.style.display = "none";
    }
  },
};
