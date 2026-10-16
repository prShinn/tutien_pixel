// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/state.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Quản lý trạng thái toàn cục Client (Single Source of Truth - S): Lưu trữ đối tượng nhân vật
//      (player), bản đồ (tiles, layers, canvas cache), quái vật (monsters), người chơi khác (players Map),
//      mục tiêu đang nhắm (target), túi đồ (inventory), camera (cam), và các hiệu ứng chiến đấu tức thời.
// 2. CẤU HÌNH LIÊN QUAN:
//    - S (Global State Object), canvas, ctx, cW, cH.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Ngăn chặn biến toàn cục rải rác, giúp tất cả các module (Render, Input, Net, Combat, UI)
//      chia sẻ và đồng bộ dữ liệu dễ dàng, nhất quán.
// ════════════════════════════════════════════════════════════════════════════════════════

let canvas, ctx, cW, cH;

const S = {
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
  // socketId -> remote player snapshot; state thuộc về runtime, không phải global module.
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
  cam: { x: 0, y: 0 },
  lastTs: 0,
  // Giữ tương thích với nhánh offline cũ; online hiện do server điều khiển.
  isHost: true,
  creation: {
    root: null,
    gender: "MALE",
    points: { str: 5, agi: 5, vit: 5, ene: 5, remaining: 10 },
  },
};
