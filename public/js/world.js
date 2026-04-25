"use strict";
// ════════════════════════════════════════════════════════════
// world.js — §3 Tile Constants + §6 World Module
// ════════════════════════════════════════════════════════════

// ── Tile type constants ──
const T = {
  GRASS: 0,
  STONE: 1,
  WATER: 2,
  WALL: 3,
  FLOOR: 4,
  TREE: 5,
  MTN: 6,
  PLAZA: 7,
};
const SOLID = new Set([T.WALL, T.WATER, T.TREE, T.MTN]);

function isSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= S.mapW || ty >= S.mapH) return true;
  return SOLID.has(S.tiles[ty]?.[tx]);
}
// ════════════════════════════════════════════════════════════
// World Module
// ════════════════════════════════════════════════════════════
const World = {
  loadMap(map, toX, toY) {
    const def = map;
    S.mapCode = map.code;
    S.mapW = def.w;
    S.mapH = def.h;
    S.tiles =
      Array.isArray(def.jsonMap) && Array.isArray(def.jsonMap[0])
        ? def.jsonMap
        : Array.from({ length: def.h || 1 }, () =>
            Array(def.w || 1).fill(0),
          );
    S.atkFx = [];
    S.groundItems = [];
    if (S.player) {
      const clampX = Math.max(0, Math.min(def.w - 1, Math.round(toX)));
      const clampY = Math.max(0, Math.min(def.h - 1, Math.round(toY)));
      const safe = World.nearestWalkable(clampX, clampY);
      S.player.x = safe.tx;
      S.player.y = safe.ty;
      S.player.px = safe.tx * CFG.TS + CFG.TS / 2;
      S.player.py = safe.ty * CFG.TS + CFG.TS / 2;
      S.player.mapCode = map.code;
      S.player.mapId = map.id || map.code;
    }
    S.portals = def.portals ?? [];
    S.npcs = (def.npcs ?? []).map((n) => ({
      ...n,
      used: false,
      type: n.loaiNpc ? n.loaiNpc.toLowerCase() : n.type,
    }));
    S.monsters = [];

    let monIndex = 0;
    for (const mon of def.monsters ?? []) {
      // Sử dụng tọa độ spawn cố định thay vì ngẫu nhiên để đồng bộ giữa các player
      const tx = mon.spawnX || Math.floor(map.w / 2);
      const ty = mon.spawnY || Math.floor(map.h / 2);
      
      const fixedId = `mon_${map.code}_${monIndex++}`;
      S.monsters.push(Monster.make(mon, tx, ty, fixedId));
    }
    const ov = document.getElementById("map-name-overlay");
    ov.textContent = def.name ?? def.tenMap;
    ov.classList.add("show");
    setTimeout(() => ov.classList.remove("show"), 2200);
    UI.log(`── Đến: ${def.name ?? def.tenMap} ──`, "system");
    Net.emitMapChange(map.code, toX, toY);
    otherPlayers.clear();
  },

  nearestWalkable(tx, ty) {
    if (!isSolid(tx, ty)) return { tx, ty };
    const visited = new Set();
    const queue = [[tx, ty]];
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = cx + dx,
          ny = cy + dy;
        const key = nx + "," + ny;
        if (visited.has(key)) continue;
        visited.add(key);
        if (nx < 0 || ny < 0 || nx >= S.mapW || ny >= S.mapH) continue;
        if (!isSolid(nx, ny)) return { tx: nx, ty: ny };
        queue.push([nx, ny]);
      }
    }
    return { tx, ty };
  },

  _open(zone) {
    for (let i = 0; i < 25; i++) {
      const tx = zone.x + randInt(0, zone.w - 1),
        ty = zone.y + randInt(0, zone.h - 1);
      if (!isSolid(tx, ty)) return { tx, ty };
    }
    return null;
  },

  collides(x, y) {
    const R = 0.4;
    const cx = x + 0.5;
    const cy = y + 0.5;
    const minX = Math.floor(cx - R);
    const maxX = Math.floor(cx + R - 1e-9);
    const minY = Math.floor(cy - R);
    const maxY = Math.floor(cy + R - 1e-9);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (isSolid(tx, ty)) return true;
      }
    }
    return false;
  },

  async checkPortals() {
    const p = S.player;
    for (const portal of S.portals) {
      const px = portal.x * CFG.TS + CFG.TS / 2;
      const py = portal.y * CFG.TS + CFG.TS / 2;
      if (
        dist(p.px, p.py, px, py) < CFG.TS * 0.5 &&
        portal.denMap &&
        portal.tenMapDen !== ""
      ) {
        const _map = await Net.get("/api/worlds/by-code?code=" + portal.denMap);
        World.loadMap(_map, portal.toX, portal.toY);
        break;
      }
    }
  },

  checkNpcInteract() {
    const p = S.player;
    for (const npc of S.npcs) {
      if (npc.used && npc.type === "chest") continue;
      if (dist(p.px, p.py, npc.px, npc.py) < CFG.TS * 1.4) {
        if (npc.type === "shop") Shop.open(npc);
        else if (npc.type === "chest") Chest.open(npc);
        else DialogUI.open(npc);
        return;
      }
    }
  },
};
