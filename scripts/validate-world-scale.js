const { worlds, monsterDefs } = require("../data/mock-data");

const SOLID = new Set([2, 3, 5, 6]);
const errors = [];

for (const world of worlds) {
  if (world.w < 320 || world.h < 240) errors.push(`${world.code}: map nhỏ hơn micro-grid tối thiểu`);
  for (const layer of ["ground", "objects", "elevation"]) {
    const grid = world.layers?.[layer];
    if (!Array.isArray(grid) || grid.length !== world.h || grid.some((row) => !Array.isArray(row) || row.length !== world.w)) {
      errors.push(`${world.code}: layer ${layer} sai kích thước`);
    }
  }
  for (let y = world.spawnY - 4; y <= world.spawnY + 4; y += 1) {
    for (let x = world.spawnX - 4; x <= world.spawnX + 4; x += 1) {
      if (SOLID.has(world.jsonMap?.[y]?.[x])) errors.push(`${world.code}: vùng spawn không đủ rộng cho footprint nhân vật`);
    }
  }
}

for (const monster of monsterDefs) {
  const width = Number(monster.animation?.width || 0);
  const height = Number(monster.animation?.height || 0);
  if (width < 20 || height < 20 || width > 32 || height > 32) errors.push(`${monster.code}: tỷ lệ sprite ${width}x${height} ngoài chuẩn`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`World scale valid: ${worlds.length} maps micro-grid, actors 20-28px, spawn footprint clear.`);
}
