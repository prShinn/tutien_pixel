"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { realms, roots, items, skills, monsterDefs, lootTables, worlds } = require("../data/mock-data");
const { BALANCE, breakthroughThreshold, minimumBreakthroughOvr, breakthroughGain } = require("../data/balance");
const { getWorldStructure } = require("../data/world-structure");
const { QUEST_DEFINITIONS } = require("../game/quest-service");

const outputRoot = path.join(__dirname, "..", "public", "mock-api");
const activeCodes = new Set(worlds.map((world) => String(world.code || "").toLowerCase()));
const itemById = new Map(items.map((item) => [String(item.id), item]));

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value)}\n`, "utf8");
}

function worldSummary(world) {
  return {
    id: world.id,
    code: world.code,
    tenMap: world.tenMap,
    type: world.type,
    biome: world.biome || "LEGACY",
    w: world.w,
    h: world.h,
    isDefault: Boolean(world.isDefault),
    status: world.status || "PUBLISHED",
    regionId: world.regionId || "UNASSIGNED",
    tier: Number(world.tier || 0),
    recommendedRealmMin: Number(world.recommendedRealmMin || 1),
    recommendedRealmMax: Number(world.recommendedRealmMax || 13),
    tags: Array.isArray(world.tags) ? world.tags : [],
    rules: world.rules || {},
    portalCount: (world.portals || []).length,
    monsterPackCount: (world.monsterSpawns || []).length,
    version: Number(world.version || 0),
  };
}

function withLocalLoot(world) {
  return {
    ...world,
    monsters: (world.monsters || []).map((worldMonster) => {
      const source = monsterDefs.find((entry) => entry.id === worldMonster.id || entry.code === worldMonster.code || entry.id === worldMonster.code) || worldMonster;
      const dropTable = (lootTables[source.lootTableId] || []).map((entry) => ({
        ...entry,
        item: itemById.get(String(entry.itemId)) || null,
      })).filter((entry) => entry.item);
      return {
        ...source,
        ...worldMonster,
        dropTable,
        tyLeRoiTien: Number(source.tyLeRoiTien ?? 65),
        moneyDropFrom: Number(source.moneyDropFrom ?? 2),
        moneyDropTo: Number(source.moneyDropTo ?? 8),
      };
    }),
  };
}

const worldStructure = getWorldStructure();
for (const region of worldStructure.regions || []) {
  for (const map of region.maps || []) {
    map.playable = activeCodes.has(String(map.code || "").toLowerCase());
    if (map.playable) {
      const world = worlds.find((entry) => String(entry.code).toLowerCase() === String(map.code).toLowerCase());
      map.runtime = { code: map.code, version: Number(world?.version || 1) };
    }
  }
}

const progressionRules = realms.flatMap((realm) => {
  const maxStage = Math.max(1, Number(realm.soTang || 9));
  return Array.from({ length: maxStage }, (_, index) => {
    const stage = index + 1;
    return {
      realmCode: realm.code,
      stage,
      threshold: breakthroughThreshold(realm, stage),
      minimumOvr: minimumBreakthroughOvr(realm, stage, stage >= maxStage),
      gain: breakthroughGain(realm, stage, stage >= maxStage),
    };
  });
});

writeJson(path.join(outputRoot, "catalog.json"), {
  schemaVersion: 1,
  realms,
  roots,
  items,
  skills,
  monsters: monsterDefs,
  balance: BALANCE,
  quests: QUEST_DEFINITIONS,
  worldStructure,
  worlds: worlds.map(worldSummary),
  progressionRules,
});

for (const world of worlds) {
  writeJson(path.join(outputRoot, "worlds", `${world.code}.json`), withLocalLoot(world));
}

process.stdout.write(`Mock API fixtures written for ${worlds.length} worlds.\n`);
