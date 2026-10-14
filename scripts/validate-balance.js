const { BALANCE, affinityCritBonus, affinityMultiplier, affinityProfile, deriveStats, mitigateDamage, combatPower } = require("../data/balance");
const { skills } = require("../data/mock-data");

const errors = [];
if (BALANCE.creation.bonusPoints !== 10) errors.push("creation budget must remain 10");
if (affinityProfile("KIM", "THUY").relation !== "sinh" || affinityMultiplier("KIM", "THUY") >= 1) errors.push("KIM -> THUY sinh relation is missing");
if (affinityProfile("THUY", "KIM").relation !== "duoc_sinh" || affinityMultiplier("THUY", "KIM") <= 1) errors.push("THUY -> KIM duoc_sinh relation is missing");
if (affinityProfile("THO", "THUY").relation !== "khac" || affinityMultiplier("THO", "THUY") <= 1) errors.push("THO -> THUY khac affinity is missing");
if (affinityProfile("THUY", "THO").relation !== "bi_khac") errors.push("THUY -> THO countered relation is missing");
if (affinityMultiplier("THUY", "THO") >= 1) errors.push("THUY -> THO must start below neutral");
if (affinityMultiplier("THUY", "THO", 4, 1) < 1) errors.push("strong countered root should recover to neutral or better");
if (affinityMultiplier("THUY", "THUY") >= 1) errors.push("same-element resonance must reduce direct damage");
if (!(affinityCritBonus(affinityProfile("THO", "THUY")) > 0)) errors.push("countered target should grant counter-crit bonus");
if (affinityCritBonus(affinityProfile("THUY", "THO")) !== 0) errors.push("countered attacker must not receive counter-crit bonus");
if (BALANCE.affinity.critBonusMax > 0.04) errors.push("counter-crit budget must remain under 4%");
if (skills.some((skill) => skill.linhCan === "COMMON" && skill.effect === "heal")) errors.push("common skill bank must not contain HP heal");
const derived = deriveStats({ str: 6, agi: 6, vit: 6, ene: 6 });
for (const key of ["pAtk", "mAtk", "pDef", "mDef", "maxHp", "maxMp"]) if (!(derived[key] > 0)) errors.push(`${key} must be positive`);
if (mitigateDamage(100, 100) !== 50) errors.push("mitigation formula changed unexpectedly");
if (!(BALANCE.damage.basicMultiplier < BALANCE.damage.skillMultiplier)) errors.push("skill burst multiplier must exceed basic multiplier");
if (!(BALANCE.damage.skillStatScale > BALANCE.damage.basicStatScale)) errors.push("skill stat scaling must exceed basic scaling");
if (!(BALANCE.damage.areaSecondaryMultiplier > 0 && BALANCE.damage.areaSecondaryMultiplier < 1)) errors.push("area secondary damage must be discounted");
const rootBuffs = {
  KIM: ["buff_atk"], MOC: ["buff_hp_regen"], THUY: ["buff_vitals"], HOA: ["buff_crit"],
  THO: ["buff_def", "buff_vitals"], QUANG: ["buff_spd"], AM: ["buff_cast"], PHONG: ["buff_spd"],
};
for (const [root, effects] of Object.entries(rootBuffs)) {
  for (const effect of effects) {
    if (!skills.some((skill) => skill.linhCan === root && skill.effect === effect && Number(skill.effectVal) > 0)) errors.push(`${root} skill bank missing ${effect}`);
  }
}
const base = { stats: { str: 5, agi: 5, vit: 5, ene: 5 }, tuViLenCap: 1000, skills: [] };
const fresh = combatPower({ ...base, realm: 1, stage: 1, tuViHienTai: 0 });
const cultivated = combatPower({ ...base, realm: 1, stage: 1, tuViHienTai: 900 });
if (cultivated <= fresh) errors.push("cultivation progress must increase same-realm power");
const gearedBreakthrough = combatPower({ ...base, realm: 2, stage: 1, tuViHienTai: 0, equipment: { weapon: { stats: { pAtk: 200, mAtk: 200 } } } });
if (gearedBreakthrough <= fresh) errors.push("better gear should be able to create a meaningful breakthrough lead");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Combat balance valid: stat budget, derived stats, mitigation and affinity.");
