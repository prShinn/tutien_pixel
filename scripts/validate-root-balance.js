const { roots, skills } = require("../data/mock-data");

const errors = [];
for (const root of roots) {
  const list = skills.filter((skill) => skill.linhCan === root.id && skill.category !== "PASSIVE");
  const passives = skills.filter((skill) => skill.linhCan === root.id && skill.category === "PASSIVE");
  const tiers = new Set(list.map((skill) => skill.tier));
  if (list.length !== 5) errors.push(`${root.id}: expected 5 skills, got ${list.length}`);
  if (passives.length !== 1) errors.push(`${root.id}: expected 1 passive, got ${passives.length}`);
  if (![1, 2, 3].every((tier) => tiers.has(tier))) errors.push(`${root.id}: missing tier`);
  const attacks = list.filter((skill) => Number(skill.satThuong || 0) > 0 && skill.effect !== "heal" && !String(skill.effect || "").startsWith("buff_"));
  if (!attacks.some((skill) => Number(skill.dienRong || 0) <= 0)) errors.push(`${root.id}: missing single-target attack`);
  if (!attacks.some((skill) => Number(skill.dienRong || 0) > 0)) errors.push(`${root.id}: missing area attack`);
  if (!root.role || !root.identity || !root.passive) errors.push(`${root.id}: missing design metadata`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Root balance data valid: ${roots.length} roots, ${skills.length} skills.`);
