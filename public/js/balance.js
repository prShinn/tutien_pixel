"use strict";
const GAME_BALANCE = {
  stats: { str: { pAtk: 4 }, agi: { pAtk: 0.5, crit: 0.003, evasion: 0.004, speed: 0.25 }, vit: { pDef: 2, maxHp: 12 }, ene: { mAtk: 4, mDef: 1.5, maxMp: 8 } },
  base: { pAtk: 8, mAtk: 8, pDef: 3, mDef: 3, hp: 100, mp: 50 },
  damage: { defenseBase: 100, critMultiplier: 1.5, variance: 0.08 },
  affinity: { advantage: 1.12, disadvantage: 0.9, same: 1 },
  cycle: ["KIM", "THUY", "MOC", "HOA", "THO"],
  special: { QUANG: { AM: 1.1 }, AM: { QUANG: 0.9 }, LOI: { PHONG: 1.08 }, PHONG: { LOI: 0.92 } },
  progression: { realmWeight: 1000, stageWeight: 90, masteryWeight: 70, skillWeight: 18 },
};

function affinityMultiplier(attacker, defender) {
  if (!attacker || !defender || attacker === defender) return 1;
  if (GAME_BALANCE.special[attacker]?.[defender]) return GAME_BALANCE.special[attacker][defender];
  const ai = GAME_BALANCE.cycle.indexOf(attacker), di = GAME_BALANCE.cycle.indexOf(defender);
  if (ai < 0 || di < 0) return 1;
  if ((ai + 1) % GAME_BALANCE.cycle.length === di) return GAME_BALANCE.affinity.advantage;
  if ((ai + 4) % GAME_BALANCE.cycle.length === di) return GAME_BALANCE.affinity.disadvantage;
  return 1;
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
  const mastery = Math.max(0, Math.min(1, Number(player.tuViHienTai || 0) / Math.max(1, Number(player.tuViLenCap || 1))));
  const statPower = d.pAtk + d.mAtk + (d.pDef + d.mDef) * 1.5 + d.maxHp * 0.1 + d.maxMp * 0.1;
  const equipmentPower = Object.values(player.equipment || {}).reduce((sum, item) => sum + Object.values(item?.stats || {}).reduce((n, value) => n + Number(value || 0), 0), 0);
  const skillPower = (player.learnedSkills || player.skills || []).length * GAME_BALANCE.progression.skillWeight;
  return Math.floor(realm * 1000 + stage * 90 + mastery * 70 + statPower + equipmentPower + skillPower);
}
