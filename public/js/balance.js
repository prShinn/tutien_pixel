// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/balance.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Cân bằng chiến đấu phía Client (Client Combat Formulas): Bản sao đồng bộ của data/balance.js
//      phục vụ tính toán sát thương tức thời trên màn hình (Client Prediction), tính toán OVR lực chiến,
//      vòng tròn Tương Sinh (Kim -> Thủy -> Mộc -> Hỏa -> Thổ) và Tương Khắc (Kim -> Mộc -> Thổ -> Thủy -> Hỏa).
// 2. CẤU HÌNH LIÊN QUAN:
//    - GAME_BALANCE (stats, damage, affinity, polarity, special, progression).
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Đảm bảo hiển thị đúng số liệu sát thương dự tính và OVR lực chiến trên HUD người chơi
//      mà không cần liên tục gửi request hỏi server.
// ════════════════════════════════════════════════════════════════════════════════════════

"use strict";
const GAME_BALANCE = {
  stats: { str: { pAtk: 4 }, agi: { pAtk: 0.5, crit: 0.003, evasion: 0.004, speed: 0.25 }, vit: { pDef: 2, maxHp: 12 }, ene: { mAtk: 4, mDef: 1.5, maxMp: 8 } },
  base: { pAtk: 8, mAtk: 8, pDef: 3, mDef: 3, hp: 100, mp: 50 },
  damage: {
    defenseBase: 100,
    critMultiplier: 1.5,
    variance: 0.08,
    basicMultiplier: 0.5,
    basicStatScale: 0.5,
    skillMultiplier: 1.25,
    skillStatScale: 1.5,
    areaSecondaryMultiplier: 0.72,
  },
  affinity: { neutral: 1, advantage: 1.12, disadvantage: 0.94, generation: 0.98, generatedBy: 1.02, same: 0.92, strengthImpact: 0.08, min: 0.82, max: 1.18, critBonusWhenCounter: 0.02, critBonusStrengthImpact: 0.02, critBonusMax: 0.04 },
  generationCycle: ["KIM", "THUY", "MOC", "HOA", "THO"],
  controlCycle: ["KIM", "MOC", "THO", "THUY", "HOA"],
  polarity: { KIM: "YANG", MOC: "YIN", THUY: "YIN", HOA: "YANG", THO: "BALANCED", QUANG: "YANG", AM: "YIN", PHONG: "YANG", LOI: "YANG" },
  special: { QUANG: { AM: 1.1 }, AM: { QUANG: 0.9 }, LOI: { PHONG: 1.08 }, PHONG: { LOI: 0.92 } },
  progression: { realmWeight: 1000, stageWeight: 90, masteryWeight: 70, skillWeight: 18, linhCan: { itemCap: 1000, itemScale: 0.00008, maxItemBonus: 0.08, realmBonus: 0.012, stageBonus: 0.002, ovrItemWeight: 0.04 }, cultivation: { overcapOvrWeight: 180, maxOvercapOvr: 360, elementalPerCap: 0.04, maxElementalBonus: 0.08 } },
};

function affinityMultiplier(attacker, defender, attackerStrength = 1, defenderStrength = 1) {
  return affinityProfile(attacker, defender, attackerStrength, defenderStrength).multiplier;
}

function affinityCritBonus(profile = {}) {
  if (profile.relation !== "khac") return 0;
  return Math.max(0, Math.min(GAME_BALANCE.affinity.critBonusMax, GAME_BALANCE.affinity.critBonusWhenCounter + Number(profile.strengthGap || 0) * GAME_BALANCE.affinity.critBonusStrengthImpact));
}

function elementalStrength(entity = {}) {
  const linhCan = GAME_BALANCE.progression.linhCan;
  const cultivation = Math.min(linhCan.maxItemBonus, Math.min(linhCan.itemCap, Math.max(0, Number(entity.tuViLinhCan || 0))) * linhCan.itemScale);
  const cap = Math.max(1, Number(entity.tuViLenCap || 1));
  const bodyLinhLuc = Math.min(GAME_BALANCE.progression.cultivation.maxElementalBonus, Math.max(0, Number(entity.tuViHienTai || 0)) / cap * GAME_BALANCE.progression.cultivation.elementalPerCap);
  const realm = Math.max(0, Number(entity.canhGioi?.stt || entity.realm || 1) - 1) * linhCan.realmBonus;
  const stage = Math.max(0, Number(entity.tangTuVi || entity.stage || 1) - 1) * linhCan.stageBonus;
  const level = Math.max(0, Number(entity.level || 1) - 1) * 0.06;
  return Math.max(1, 1 + cultivation + bodyLinhLuc + realm + stage + level);
}

function affinityProfile(attacker, defender, attackerStrength = 1, defenderStrength = 1) {
  const base = { attacker, defender, attackerPolarity: GAME_BALANCE.polarity[attacker] || "BALANCED", defenderPolarity: GAME_BALANCE.polarity[defender] || "BALANCED", relation: "neutral", pressure: null, multiplier: GAME_BALANCE.affinity.neutral, strengthGap: 0 };
  if (!attacker || !defender) return base;
  if (attacker === defender) return { ...base, relation: "dong_hanh", multiplier: GAME_BALANCE.affinity.same };
  const strengthGap = Math.max(-1, Math.min(1, (Number(attackerStrength || 1) - Number(defenderStrength || 1)) / Math.max(Number(attackerStrength || 1), Number(defenderStrength || 1), 1)));
  const adjust = (value) => Math.max(GAME_BALANCE.affinity.min, Math.min(GAME_BALANCE.affinity.max, value + strengthGap * GAME_BALANCE.affinity.strengthImpact));
  if (GAME_BALANCE.special[attacker]?.[defender]) return { ...base, relation: "dac_biet", multiplier: adjust(GAME_BALANCE.special[attacker][defender]), strengthGap };
  const generation = GAME_BALANCE.generationCycle;
  const control = GAME_BALANCE.controlCycle;
  const gi = generation.indexOf(attacker), gd = generation.indexOf(defender);
  const ci = control.indexOf(attacker), cd = control.indexOf(defender);
  if (ci >= 0 && cd >= 0) {
    if ((ci + 1) % control.length === cd) return { ...base, relation: "khac", multiplier: adjust(GAME_BALANCE.affinity.advantage), strengthGap };
    if ((ci + control.length - 1) % control.length === cd) return { ...base, relation: "bi_khac", multiplier: adjust(GAME_BALANCE.affinity.disadvantage), strengthGap };
  }
  if (gi >= 0 && gd >= 0) {
    if ((gi + 1) % generation.length === gd) return { ...base, relation: "sinh", multiplier: adjust(GAME_BALANCE.affinity.generation), strengthGap };
    if ((gi + generation.length - 1) % generation.length === gd) return { ...base, relation: "duoc_sinh", multiplier: adjust(GAME_BALANCE.affinity.generatedBy), strengthGap };
  }
  return base;
}

function deriveCombatStats(stats = {}, equipment = {}) {
  const s = { str: Number(stats.str) || 0, agi: Number(stats.agi) || 0, vit: Number(stats.vit) || 0, ene: Number(stats.ene) || 0 };
  const e = Object.values(equipment || {}).reduce((out, item) => {
    for (const key of ["pAtk", "mAtk", "pDef", "mDef", "maxHP", "maxMP"]) out[key] += Number(item?.[key] || item?.stats?.[key] || 0);
    return out;
  }, { pAtk: 0, mAtk: 0, pDef: 0, mDef: 0, maxHP: 0, maxMP: 0 });
  return { pAtk: 8 + s.str * 4 + s.agi * 0.5 + e.pAtk, mAtk: 8 + s.ene * 4 + s.agi * 0.5 + e.mAtk, pDef: 3 + s.vit * 2 + s.agi * 0.25 + e.pDef, mDef: 3 + s.ene * 1.5 + s.vit * 0.25 + e.mDef, maxHp: 100 + s.vit * 12 + e.maxHP, maxMp: 50 + s.ene * 8 + e.maxMP };
}

function calcCombatPower(player = {}) {
  const d = deriveCombatStats(player.stats, player.equipment);
  const realm = Number(player.canhGioi?.stt || player.realm || 1), stage = Number(player.tangTuVi || player.stage || 1);
  const progression = GAME_BALANCE.progression;
  const mastery = Math.max(0, Math.min(1, Number(player.tuViHienTai || 0) / Math.max(1, Number(player.tuViLenCap || 1))));
  const cap = Math.max(1, Number(player.tuViLenCap || 1));
  const overflowRatio = Math.max(0, Number(player.tuViHienTai || 0) / cap - 1);
  const overflowPower = Math.min(GAME_BALANCE.progression.cultivation.maxOvercapOvr, overflowRatio * GAME_BALANCE.progression.cultivation.overcapOvrWeight);
  const statPower = d.pAtk + d.mAtk + (d.pDef + d.mDef) * 1.5 + d.maxHp * 0.1 + d.maxMp * 0.1;
  const equipmentPower = Object.values(player.equipment || {}).reduce((sum, item) => sum + Object.values(item?.stats || {}).reduce((n, value) => n + Number(value || 0), 0), 0);
  const skillPower = (player.learnedSkills || player.skills || []).length * GAME_BALANCE.progression.skillWeight;
  const linhCanPower = Math.min(GAME_BALANCE.progression.linhCan.itemCap * GAME_BALANCE.progression.linhCan.ovrItemWeight, Math.max(0, Number(player.tuViLinhCan || 0)) * GAME_BALANCE.progression.linhCan.ovrItemWeight);
  return Math.floor(realm * progression.realmWeight + stage * progression.stageWeight + mastery * progression.masteryWeight + overflowPower + statPower + equipmentPower + skillPower + linhCanPower);
}
