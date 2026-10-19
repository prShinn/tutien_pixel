const { continent } = require("../data/world-structure");
const { worlds } = require("../data/mock-data");

const maps = continent.regions.flatMap((region) => region.maps);
const byCode = new Map(maps.map((map) => [map.code, map]));
const errors = [];
if (!continent.id || !continent.name) errors.push("continent metadata missing");
if (new Set(maps.map((map) => map.code)).size !== maps.length) errors.push("duplicate map code");
for (const map of maps) {
  for (const target of map.connections || []) {
    if (!byCode.has(target)) errors.push(`${map.code} points to unknown map ${target}`);
  }
}
for (const world of worlds) {
  if (!byCode.has(world.code)) errors.push(`runtime world missing from graph: ${world.code}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const active = worlds.filter((world) => byCode.get(world.code)?.status === "ACTIVE").length;
  console.log(`World structure valid: ${maps.length} graph maps, ${active} active runtime maps.`);
}
