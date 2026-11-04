// ESM-owned client state. Feature scripts temporarily access the same state
// through window aliases until each feature is migrated to an imported module.
export const S = {
  session: { user: null },
  player: null,
  mapCode: "",
  mapName: "",
  mapVersion: 0,
  tiles: null,
  groundTiles: null,
  objectTiles: null,
  elevationTiles: null,
  terrainCanvas: null,
  miniTerrainCanvas: null,
  mapW: 0,
  mapH: 0,
  monsters: [],
  groundItems: [],
  players: new Map(),
  npcs: [],
  portals: [],
  inventory: [],
  autoFight: false,
  atkCd: 0,
  combatGcd: 0,
  combatPending: false,
  animT: 0,
  animF: 0,
  floatingTexts: [],
  combatFx: [],
  cameraShake: { until: 0, power: 0 },
  cam: { x: 0, y: 0 },
  lastTs: 0,
  isHost: true,
  creation: {
    root: null,
    gender: "MALE",
    points: { str: 5, agi: 5, vit: 5, ene: 5, remaining: 10 },
  },
};

const canvasContext = { canvas: null, ctx: null, cW: 0, cH: 0 };

export function getCanvasContext() {
  return canvasContext;
}
