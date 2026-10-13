"use strict";
// ════════════════════════════════════════════════════════════
// state.js — §4 Global Game State
// ════════════════════════════════════════════════════════════

let canvas, ctx, cW, cH;

const S = {
  session: { user: null },
  player: null,
  mapCode: "",
  mapName: "",
  tiles: null,
  mapW: 0,
  mapH: 0,
  monsters: [],
  // socketId -> remote player snapshot; state thuộc về runtime, không phải global module.
  players: new Map(),
  npcs: [],
  portals: [],
  groundItems: [],
  inventory: [],
  autoFight: false,
  atkCd: 0,
  animT: 0,
  animF: 0,
  atkFx: [],
  floatingTexts: [],
  cam: { x: 0, y: 0 },
  moveTimer: 0,
  lastTs: 0,
  isHost: true,
  monsterSyncTimer: 0,
  lastMoveEmit: 0,
  creation: {
    root: null,
    gender: "MALE",
    points: { str: 5, agi: 5, vit: 5, ene: 5, remaining: 10 },
  },
};
