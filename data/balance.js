const BALANCE = {
  creation: { minStat: 5, bonusPoints: 10 },
  stats: {
    str: { pAtk: 4 },
    agi: { pAtk: 0.5, crit: 0.003, evasion: 0.004, speed: 0.25 },
    vit: { pDef: 2, maxHp: 12 },
    ene: { mAtk: 4, mDef: 1.5, maxMp: 8 },
  },
  base: { pAtk: 8, mAtk: 8, pDef: 3, mDef: 3, hp: 100, mp: 50 },
  damage: { defenseBase: 100, critMultiplier: 1.5, variance: 0.08, min: 1 },
  affinity: { advantage: 1.12, disadvantage: 0.9, same: 1 },
  cycle: ["KIM", "THUY", "MOC", "HOA", "THO"],
  special: { QUANG: { AM: 1.1 }, AM: { QUANG: 0.9 }, LOI: { PHONG: 1.08 }, PHONG: { LOI: 0.92 } },
  progression: { realmWeight: 1000, stageWeight: 90, masteryWeight: 70, statWeight: 1, equipmentWeight: 1, skillWeight: 18 },
};

function affinityMultiplier(attacker, defender) {
  if (!attacker || !defender || attacker === defender) return BALANCE.affinity.same;
  if (BALANCE.special[attacker]?.[defender]) return BALANCE.special[attacker][defender];
  const cycle = BALANCE.cycle;
  const ai = cycle.indexOf(attacker);
  const di = cycle.indexOf(defender);
  if (ai < 0 || di < 0) return BALANCE.affinity.same;
  if ((ai + 1) % cycle.length === di) return BALANCE.affinity.advantage;
  if ((ai + 4) % cycle.length === di) return BALANCE.affinity.disadvantage;
  return BALANCE.affinity.same;
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

module.exports = { BALANCE, affinityMultiplier, deriveStats, mitigateDamage, combatPower, calcTuViNeeded, breakthroughGain };
