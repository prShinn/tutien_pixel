const { worlds: seedWorlds } = require('../data/mock-data');
const { getWorldStructure: getWorldStructureSeed } = require('../data/world-structure');

const published = (world) => !['DRAFT', 'DELETED'].includes(String(world?.status || 'PUBLISHED').toUpperCase());
const clone = (value) => structuredClone(value);

function summarizeWorld(world) {
  return {
    id: world.id,
    code: world.code,
    tenMap: world.tenMap,
    type: world.type,
    biome: world.biome || 'LEGACY',
    w: world.w,
    h: world.h,
    spawnX: world.spawnX,
    spawnY: world.spawnY,
    isDefault: Boolean(world.isDefault),
    status: String(world.status || 'PUBLISHED').toUpperCase(),
    regionId: world.regionId || 'UNASSIGNED',
    tier: Number(world.tier || 0),
    recommendedRealmMin: Number(world.recommendedRealmMin || 1),
    recommendedRealmMax: Number(world.recommendedRealmMax || 13),
    tags: Array.isArray(world.tags) ? [...world.tags] : [],
    rules: clone(world.rules || {}),
    portalCount: (world.portals || []).length,
    monsterPackCount: (world.monsterSpawns || []).length,
    version: Number(world.version || 0),
  };
}

function createWorldService({ overrides = [] } = {}) {
  const worldByCode = new Map(seedWorlds.map((world) => [world.code, clone(world)]));
  for (const override of overrides) {
    if (String(override.status).toUpperCase() === 'DELETED') worldByCode.delete(override.code);
    else worldByCode.set(override.code, clone(override));
  }
  const allWorlds = () => [...worldByCode.values()];
  const worlds = () => allWorlds().filter(published);
  const getByCode = (code) => {
    const normalized = typeof code === 'string' ? code.trim().toLowerCase() : '';
    return worlds().find((world) => world.code === normalized) || null;
  };
  const getDefault = () => worlds().find((world) => world.isDefault) || worlds()[0] || null;

  function getStructure() {
    const structure = getWorldStructureSeed();
    const activeCodes = new Set(worlds().map((world) => world.code));
    for (const region of structure.regions || []) {
      for (const map of region.maps || []) {
        map.playable = activeCodes.has(map.code);
        if (map.playable) {
          const world = worlds().find((entry) => entry.code === map.code);
          map.runtime = { code: map.code, version: Number(world?.version || 1) };
        }
      }
    }
    return structure;
  }

  return {
    listSummaries: () => worlds().map(summarizeWorld),
    listAdminWorlds: () => allWorlds().map(clone),
    listAdminSummaries: () => allWorlds().map(summarizeWorld),
    setWorld: (world) => { worldByCode.set(world.code, clone(world)); return clone(world); },
    removeWorld: (code) => worldByCode.delete(code),
    getByCode,
    getDefault,
    getStructure,
  };
}

function isMonsterSpawnTile(map, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const blocked = [2, 3, 5, 6];
  const ground = map.layers?.ground?.[y]?.[x] ?? map.jsonMap?.[y]?.[x];
  const object = map.layers?.objects?.[y]?.[x];
  return ground != null && !blocked.includes(Number(ground)) && !blocked.includes(Number(object));
}

module.exports = { createWorldService, isMonsterSpawnTile };
