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

const stateListeners = new Map();
let lastPublishedVitals = null;
let lastPublishedPosition = null;
let lastPublishedTarget = null;

export const StateBus = Object.freeze({
  on(eventName, listener) {
    if (typeof listener !== "function") throw new TypeError("StateBus listener must be a function");
    const listeners = stateListeners.get(eventName) || new Set();
    listeners.add(listener);
    stateListeners.set(eventName, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) stateListeners.delete(eventName);
    };
  },

  emit(eventName, payload) {
    for (const listener of [...(stateListeners.get(eventName) || [])]) listener(payload);
  },

  publishPlayerVitals(player) {
    if (!player) {
      lastPublishedVitals = null;
      return;
    }
    const next = {
      hp: Math.floor(Number(player.hp) || 0), maxHp: Math.max(1, Math.floor(Number(player.maxHp) || 100)),
      mp: Math.floor(Number(player.mp) || 0), maxMp: Math.max(1, Math.floor(Number(player.maxMp) || 100)),
      cultivation: Math.floor(Number(player.tuViHienTai) || 0), cultivationMax: Math.max(1, Math.floor(Number(player.tuViLenCap) || 100)),
      xu: Math.floor(Number(player.xu) || 0),
    };
    if (!lastPublishedVitals || Object.keys(next).some((key) => next[key] !== lastPublishedVitals[key])) {
      lastPublishedVitals = next;
      this.emit("player:vitals_changed", Object.freeze({ ...next }));
    }
  },

  publishPlayerPosition(player, mapCode = "") {
    if (!player) {
      lastPublishedPosition = null;
      return;
    }
    const next = { x: Math.floor(Number(player.x) || 0), y: Math.floor(Number(player.y) || 0), mapCode: String(mapCode || "") };
    if (!lastPublishedPosition || next.x !== lastPublishedPosition.x || next.y !== lastPublishedPosition.y || next.mapCode !== lastPublishedPosition.mapCode) {
      lastPublishedPosition = next;
      this.emit("player:position_changed", Object.freeze({ ...next }));
    }
  },

  publishTarget(target) {
    const next = target && !target.dead && Number(target.hp ?? 1) > 0
      ? { id: String(target.id || target.name || "target"), name: String(target.name || "Mục tiêu"), level: Number(target.level) || 1, hp: Math.floor(Number(target.hp ?? target.maxHp ?? 100)), maxHp: Math.max(1, Math.floor(Number(target.maxHp) || 100)), element: Array.isArray(target.nguHanh) ? String(target.nguHanh[0] || "VÔ") : String(target.nguHanh || "VÔ"), icon: target.icon || "👾" }
      : null;
    if (JSON.stringify(next) !== JSON.stringify(lastPublishedTarget)) {
      lastPublishedTarget = next;
      this.emit("target:changed", next && Object.freeze({ ...next }));
    }
  },
});

const canvasContext = { canvas: null, ctx: null, cW: 0, cH: 0 };

export function getCanvasContext() {
  return canvasContext;
}
