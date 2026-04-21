"use strict";
// ════════════════════════════════════════════════════════════
// state.js — §4 Global Game State
// ════════════════════════════════════════════════════════════

let canvas, ctx, cW, cH;

const S = {
  player: null,
  mapCode: "wilderness",
  tiles: null,
  mapW: 0,
  mapH: 0,
  monsters: [],
  npcs: [],
  portals: [],
  groundItems: [],
  inventory: [],
  autoFight: false,
  atkCd: 0,
  animT: 0,
  animF: 0,
  atkFx: [],
  cam: { x: 0, y: 0 },
  moveTimer: 0,
  lastTs: 0,
};

// socketId → { username, x, y, px, py, realm, ... }
const otherPlayers = new Map();
