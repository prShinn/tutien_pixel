const { BALANCE, affinityMultiplier, deriveStats, mitigateDamage, combatPower } = require("../data/balance");

const errors = [];
if (BALANCE.creation.bonusPoints !== 20) errors.push("creation budget must remain 20");
if (affinityMultiplier("KIM", "THUY") <= 1) errors.push("KIM -> THUY affinity is missing");
if (affinityMultiplier("THUY", "KIM") >= 1) errors.push("THUY -> KIM resistance is missing");
const derived = deriveStats({ str: 6, agi: 6, vit: 6, ene: 6 });
for (const key of ["pAtk", "mAtk", "pDef", "mDef", "maxHp", "maxMp"]) if (!(derived[key] > 0)) errors.push(`${key} must be positive`);
if (mitigateDamage(100, 100) !== 50) errors.push("mitigation formula changed unexpectedly");
const base = { stats: { str: 5, agi: 5, vit: 5, ene: 5 }, tuViLenCap: 1000, skills: [] };
const fresh = combatPower({ ...base, realm: 1, stage: 1, tuViHienTai: 0 });
const cultivated = combatPower({ ...base, realm: 1, stage: 1, tuViHienTai: 900 });
if (cultivated <= fresh) errors.push("cultivation progress must increase same-realm power");
const gearedBreakthrough = combatPower({ ...base, realm: 2, stage: 1, tuViHienTai: 0, equipment: { weapon: { stats: { pAtk: 200, mAtk: 200 } } } });
if (gearedBreakthrough <= fresh) errors.push("better gear should be able to create a meaningful breakthrough lead");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Combat balance valid: stat budget, derived stats, mitigation and affinity.");
