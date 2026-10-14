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
  loadMap(def, toX, toY) {
    if (!def) return;
    S.mapCode = (def.code || "").toLowerCase();
    S.mapName = def.name ?? def.tenMap ?? S.mapCode;
    S.mapVersion = Number(def.version || 0);
    S.mapW = def.w;
    S.mapH = def.h;
    S.tiles =
      Array.isArray(def.jsonMap) && Array.isArray(def.jsonMap[0])
        ? def.jsonMap
        : Array.from({ length: def.h || 1 }, () =>
            Array(def.w || 1).fill(0),
          );
    S.groundTiles = Array.isArray(def.layers?.ground?.[0]) ? def.layers.ground : null;
    S.objectTiles = Array.isArray(def.layers?.objects?.[0]) ? def.layers.objects : null;
    S.elevationTiles = Array.isArray(def.layers?.elevation?.[0]) ? def.layers.elevation : null;
    if (typeof Render !== "undefined" && Render.buildTerrainCache) Render.buildTerrainCache();
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
      S.player.mapCode = S.mapCode;
      S.player.mapId = S.mapCode;
      S.player.isTeleporting = false;
    }
    S.portals = def.portals ?? [];
    S.npcs = (def.npcs ?? []).map((n) => ({
      ...n,
      x: Number(n.x || 0),
      y: Number(n.y || 0),
      px: Number(n.x || 0) * CFG.TS + CFG.TS / 2,
      py: Number(n.y || 0) * CFG.TS + CFG.TS / 2,
      used: false,
      type: n.loaiNpc ? n.loaiNpc.toLowerCase() : n.type,
    }));
    S.monsters = [];

    const isCity = String(def.type || "").toUpperCase() === "CITY" || Boolean(def.rules?.noMonsters);
    if (!isCity) {
      if (Array.isArray(def.monsterSpawns) && def.monsterSpawns.length > 0) {
        for (const pack of def.monsterSpawns) {
          const tmpl = (def.monsters || []).find((m) => m.id === pack.templateId || m.code === pack.templateId) || def.monsters?.[0] || pack;
          const count = Math.max(3, Math.min(5, Number(pack.count || 4)));
          const radius = Number(pack.radius || 24);
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const dist = radius * (0.35 + 0.55 * (i % 2));
            const tx = Math.round(Number(pack.centerX || def.w / 2) + Math.cos(angle) * dist);
            const ty = Math.round(Number(pack.centerY || def.h / 2) + Math.sin(angle) * dist);
            const fixedId = `${pack.packId || "pack"}_${i}`;
            const m = Monster.make(tmpl, tx, ty, fixedId);
            m.packId = pack.packId;
            m.packCenterX = Number(pack.centerX || tx);
            m.packCenterY = Number(pack.centerY || ty);
            S.monsters.push(m);
          }
        }
      } else if (Array.isArray(def.monsters) && def.monsters.length > 0) {
        let monIndex = 0;
        for (const mon of def.monsters) {
          const count = 4;
          const radius = 24;
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const dist = radius * (0.35 + 0.55 * (i % 2));
            const cx = mon.spawnX || Math.floor(def.w / 2);
            const cy = mon.spawnY || Math.floor(def.h / 2);
            const tx = Math.round(cx + Math.cos(angle) * dist);
            const ty = Math.round(cy + Math.sin(angle) * dist);
            const fixedId = `mon_${S.mapCode}_${monIndex}_${i}`;
            const m = Monster.make(mon, tx, ty, fixedId);
            m.packId = `PACK_${mon.code || mon.id || monIndex}`;
            m.packCenterX = cx;
            m.packCenterY = cy;
            S.monsters.push(m);
          }
          monIndex++;
        }
      }
    }
    const ov = document.getElementById("map-name-overlay");
    ov.textContent = def.name ?? def.tenMap;
    ov.classList.add("show");
    setTimeout(() => ov.classList.remove("show"), 2200);
    UI.log(`── Đến: ${def.name ?? def.tenMap} ──`, "system");
    
    S.players.clear();
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
    const R = CFG.PLAYER_COLLISION_RADIUS;
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
    const touching = S.portals.find((portal) => {
      const px = portal.x * CFG.TS + CFG.TS / 2;
      const py = portal.y * CFG.TS + CFG.TS / 2;
      return dist(p.px, p.py, px, py) < 18 && (portal.denMap || portal.toMap);
    });
    if (p.portalLocked) {
      if (!touching) p.portalLocked = false;
      return;
    }
    if (p.isTeleporting || !touching) return;
    p.isTeleporting = true;
    p.portalLocked = true;
    Net.emitMapChange(touching.denMap || touching.toMap, touching.toX, touching.toY);
    setTimeout(() => { p.isTeleporting = false; }, 2000);
  },

  checkNpcInteract() {
    const p = S.player;
    for (const npc of S.npcs) {
      if (npc.used && npc.type === "chest") continue;
      if (dist(p.px, p.py, npc.px, npc.py) < CFG.INTERACTION_RANGE) {
        if (npc.type === "shop") Shop.open(npc);
        else if (npc.type === "chest") Chest.open(npc);
        else DialogUI.open(npc);
        return;
      }
    }
  },
};
