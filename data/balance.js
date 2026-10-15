// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: data/balance.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Hệ thống công thức & cân bằng game (Game Balance Formulas): Quy định điểm số khởi tạo,
//      hệ số chuyển đổi thuộc tính gốc (str/agi/vit/ene) sang chỉ số chiến đấu (pAtk, mAtk, pDef,
//      mDef, maxHp, maxMp, crit, evasion), công thức giảm trừ sát thương theo phòng thủ,
//      tương khắc ngũ hành (advantage 1.12 / disadvantage 0.94), tính điểm lực chiến (Combat Power),
//      và lượng tu vi cần thiết để đột phá từng cảnh giới.
// 2. CẤU HÌNH LIÊN QUAN:
//    - BALANCE, AFFINITY_PAIRS.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Giữ cân bằng toán học giữa các hệ linh căn và cảnh giới, ngăn chặn tình trạng số liệu
//      lạm phát hoặc quái vật quá mạnh/quá yếu, tạo quy chuẩn chung cho cả client và server.
// ════════════════════════════════════════════════════════════════════════════════════════

const BALANCE = {
  creation: { minStat: 5, bonusPoints: 10 },
  stats: {
    str: { pAtk: 4 },
    agi: { pAtk: 0.5, crit: 0.003, evasion: 0.004, speed: 0.25 },
    vit: { pDef: 2, maxHp: 12 },
    ene: { mAtk: 4, mDef: 1.5, maxMp: 8 },
  },
  base: { pAtk: 8, mAtk: 8, pDef: 3, mDef: 3, hp: 100, mp: 50 },
  damage: {
    defenseBase: 100,
    critMultiplier: 1.5,
    variance: 0.08,
    min: 1,
    // Basic = sustained damage miễn phí; skill = burst damage có MP/cooldown.
    basicMultiplier: 0.5,
    basicStatScale: 0.5,
    skillMultiplier: 1.25,
    skillStatScale: 1.5,
    areaSecondaryMultiplier: 0.72,
  },
  affinity: {
    neutral: 1,
    advantage: 1.12,
    disadvantage: 0.94,
    generation: 0.98,
    generatedBy: 1.02,
    same: 0.92,
    strengthImpact: 0.08,
    min: 0.82,
    max: 1.18,
    critBonusWhenCounter: 0.02,
    critBonusStrengthImpact: 0.02,
    critBonusMax: 0.04,
  },
  generationCycle: ["KIM", "THUY", "MOC", "HOA", "THO"],
  controlCycle: ["KIM", "MOC", "THO", "THUY", "HOA"],
  polarity: { KIM: "YANG", MOC: "YIN", THUY: "YIN", HOA: "YANG", THO: "BALANCED", QUANG: "YANG", AM: "YIN", PHONG: "YANG", LOI: "YANG" },
  special: { QUANG: { AM: 1.1 }, AM: { QUANG: 0.9 }, LOI: { PHONG: 1.08 }, PHONG: { LOI: 0.92 } },
  progression: { realmWeight: 1000, stageWeight: 90, masteryWeight: 70, statWeight: 1, equipmentWeight: 1, skillWeight: 18 },
};

function affinityMultiplier(attacker, defender, attackerStrength = 1, defenderStrength = 1) {
  return affinityProfile(attacker, defender, attackerStrength, defenderStrength).multiplier;
}

function affinityCritBonus(profile = {}) {
  if (profile.relation !== "khac") return 0;
  return Math.max(0, Math.min(BALANCE.affinity.critBonusMax, BALANCE.affinity.critBonusWhenCounter + Number(profile.strengthGap || 0) * BALANCE.affinity.critBonusStrengthImpact));
}

function elementalStrength(entity = {}) {
  const cultivation = Math.max(0, Number(entity.tuViLinhCan || 0)) / 1000;
  const realm = Math.max(0, Number(entity.canhGioi?.stt || entity.realm || 1) - 1) * 0.08;
  const stage = Math.max(0, Number(entity.tangTuVi || entity.stage || 1) - 1) * 0.01;
  const level = Math.max(0, Number(entity.level || 1) - 1) * 0.06;
  return Math.max(1, 1 + cultivation + realm + stage + level);
}

function affinityProfile(attacker, defender, attackerStrength = 1, defenderStrength = 1) {
  const base = {
    attacker,
    defender,
    attackerPolarity: BALANCE.polarity[attacker] || "BALANCED",
    defenderPolarity: BALANCE.polarity[defender] || "BALANCED",
    relation: "neutral",
    pressure: null,
    multiplier: BALANCE.affinity.neutral,
    strengthGap: 0,
  };
  if (!attacker || !defender) return base;
  if (attacker === defender) return { ...base, relation: "dong_hanh", multiplier: BALANCE.affinity.same };
  const strengthGap = Math.max(-1, Math.min(1, (Number(attackerStrength || 1) - Number(defenderStrength || 1)) / Math.max(Number(attackerStrength || 1), Number(defenderStrength || 1), 1)));
  const adjust = (value) => Math.max(BALANCE.affinity.min, Math.min(BALANCE.affinity.max, value + strengthGap * BALANCE.affinity.strengthImpact));
  if (BALANCE.special[attacker]?.[defender]) return { ...base, relation: "dac_biet", multiplier: adjust(BALANCE.special[attacker][defender]), strengthGap };
  const generation = BALANCE.generationCycle;
  const control = BALANCE.controlCycle;
  const gi = generation.indexOf(attacker), gd = generation.indexOf(defender);
  const ci = control.indexOf(attacker), cd = control.indexOf(defender);
  if (ci >= 0 && cd >= 0) {
    if ((ci + 1) % control.length === cd) return { ...base, relation: "khac", multiplier: adjust(BALANCE.affinity.advantage), strengthGap };
    if ((ci + control.length - 1) % control.length === cd) return { ...base, relation: "bi_khac", multiplier: adjust(BALANCE.affinity.disadvantage), strengthGap };
  }
  if (gi >= 0 && gd >= 0) {
    if ((gi + 1) % generation.length === gd) return { ...base, relation: "sinh", multiplier: adjust(BALANCE.affinity.generation), strengthGap };
    if ((gi + generation.length - 1) % generation.length === gd) return { ...base, relation: "duoc_sinh", multiplier: adjust(BALANCE.affinity.generatedBy), strengthGap };
  }
  return base;
}

function deriveStats(stats = {}, equipment = {}) {
  const s = { str: Number(stats.str) || 0, agi: Number(stats.agi) || 0, vit: Number(stats.vit) || 0, ene: Number(stats.ene) || 0 };
  const e = Object.values(equipment || {}).reduce((out, item) => {
    for (const key of ["pAtk", "mAtk", "pDef", "mDef", "maxHP", "maxMP"]) out[key] += Number(item?.[key] || item?.stats?.[key] || 0);
    return out;
  }, { pAtk: 0, mAtk: 0, pDef: 0, mDef: 0, maxHP: 0, maxMP: 0 });
  return {
    pAtk: BALANCE.base.pAtk + s.str * 4 + s.agi * 0.5 + e.pAtk,
    mAtk: BALANCE.base.mAtk + s.ene * 4 + s.agi * 0.5 + e.mAtk,
    pDef: BALANCE.base.pDef + s.vit * 2 + s.agi * 0.25 + e.pDef,
    mDef: BALANCE.base.mDef + s.ene * 1.5 + s.vit * 0.25 + e.mDef,
    maxHp: BALANCE.base.hp + s.vit * 12 + e.maxHP,
    maxMp: BALANCE.base.mp + s.ene * 8 + e.maxMP,
    crit: Math.min(0.5, 0.05 + s.agi * 0.003),
    evasion: Math.min(0.35, 0.03 + s.agi * 0.004),
  };
}

function mitigateDamage(raw, defense) {
  return Math.max(BALANCE.damage.min, raw * BALANCE.damage.defenseBase / (BALANCE.damage.defenseBase + Math.max(0, defense || 0)));
}

function combatPower(player = {}) {
  const derived = deriveStats(player.stats, player.equipment);
  const realm = Number(player.canhGioi?.stt || player.realm || 1);
  const stage = Number(player.tangTuVi || player.stage || 1);
  const cap = Math.max(1, Number(player.tuViLenCap || 1));
  const mastery = Math.max(0, Math.min(1, Number(player.tuViHienTai || 0) / cap));
  const statPower = derived.pAtk + derived.mAtk + (derived.pDef + derived.mDef) * 1.5 + derived.maxHp * 0.1 + derived.maxMp * 0.1;
  const equipmentPower = Object.values(player.equipment || {}).reduce((sum, item) => sum + Object.values(item?.stats || {}).reduce((n, value) => n + Number(value || 0), 0), 0);
  const skillPower = Array.isArray(player.learnedSkills || player.skills) ? (player.learnedSkills || player.skills).length * BALANCE.progression.skillWeight : 0;
  return Math.floor(realm * BALANCE.progression.realmWeight + stage * BALANCE.progression.stageWeight + mastery * BALANCE.progression.masteryWeight + statPower * BALANCE.progression.statWeight + equipmentPower * BALANCE.progression.equipmentWeight + skillPower);
}

function calcTuViNeeded(realm = {}, stage = 1) {
  const safeRealm = Math.max(0, Number(realm.stt) || 0);
  const safeStage = Math.max(1, Math.min(9, Number(stage) || 1));
  return Math.floor(20 * safeStage * Math.pow(1.2, safeStage - 1) * (1 + safeRealm * 0.5 * safeStage) + Number(realm.tuViTienCap || 1));
}

function breakthroughGain(realm = {}, stage = 1, major = false) {
  const budget = (major ? 10 : 4) + Math.floor((Number(realm.stt) || 0) * 0.75) + Math.floor((Number(stage) || 1) * 0.25);
  const base = Math.floor(budget / 4), remainder = budget % 4;
  return { str: base + (remainder > 0 ? 1 : 0), agi: base + (remainder > 1 ? 1 : 0), vit: base + (remainder > 2 ? 1 : 0), ene: base };
}

module.exports = { BALANCE, affinityMultiplier, affinityCritBonus, affinityProfile, elementalStrength, deriveStats, mitigateDamage, combatPower, calcTuViNeeded, breakthroughGain };
