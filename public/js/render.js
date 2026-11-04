// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/render.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Hệ thống đồ họa Canvas 2D (Graphics & Rendering Engine): Vẽ địa hình đa tầng (ground,
//      objects, elevation), người chơi, quái vật, NPC, cổng portal, hoạt ảnh di chuyển/tấn công,
//      hiệu ứng kỹ năng, sát thương số bay (Floating Damage/Crit), Minimap và la bàn dẫn đường.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.TS (Tile Size), CFG.DS (Display Scale), CFG.ACTOR_W/H, TC (Bảng màu Tile).
//    - Phụ thuộc: State (S), Canvas context (ctx).
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Viewport camera culling (chỉ vẽ đối tượng trong màn hình để tối đa FPS).
//    - Xóa nền ảnh tự động (_removeBg), cache địa hình (buildTerrainCache).
//    - Hit flash chớp trắng, Target lock indicator và vòng sáng mục tiêu.
// ════════════════════════════════════════════════════════════════════════════════════════

const TC = {
  [0]: ["#2a5a28", "#3a7a38"],   // GRASS
  [1]: ["#5a5a68", "#7a7a88"],   // STONE
  [2]: ["#1a3a6a", "#2a5a9a"],   // WATER
  [3]: ["#181010", "#2a1818"],   // WALL
  [4]: ["#3a3020", "#4a4028"],   // FLOOR
  [5]: ["#141a10", "#2a3818"],   // TREE
  [6]: ["#404050", "#606070"],   // MTN
  [7]: ["#4a4030", "#5a5040"],   // PLAZA
};

const AUTOTILE_SIZE = 8;
const AUTOTILE_VARIANTS = 4;
const AUTOTILE_DIRECTIONS = [
  { bit: 1, dx: 0, dy: -1 }, { bit: 2, dx: 1, dy: 0 },
  { bit: 4, dx: 0, dy: 1 }, { bit: 8, dx: -1, dy: 0 },
  { bit: 16, dx: 1, dy: -1 }, { bit: 32, dx: 1, dy: 1 },
  { bit: 64, dx: -1, dy: 1 }, { bit: 128, dx: -1, dy: -1 },
];
const AUTOTILE_PALETTES = {
  0: { base: "#2a5a28", shade: "#21491f", light: "#3c7434", edge: "#84754a", detail: "#91a95a" },
  1: { base: "#5a5a68", shade: "#454550", light: "#777786", edge: "#34343f", detail: "#a5a5ad" },
  2: { base: "#1a3a6a", shade: "#102b53", light: "#2a5a9a", edge: "#73bfd0", detail: "#73bfd0" },
  4: { base: "#3a3020", shade: "#2d2519", light: "#56452b", edge: "#806842", detail: "#a38a58" },
  7: { base: "#4a4030", shade: "#3b3428", light: "#69583a", edge: "#897149", detail: "#b09a65" },
};
const AUTOTILE_GROUND_TYPES = Object.keys(AUTOTILE_PALETTES).map(Number);

function normalizeAutotileMask(mask) {
  const north = Boolean(mask & 1), east = Boolean(mask & 2), south = Boolean(mask & 4), west = Boolean(mask & 8);
  if (!(north && east)) mask &= ~16;
  if (!(east && south)) mask &= ~32;
  if (!(south && west)) mask &= ~64;
  if (!(west && north)) mask &= ~128;
  return mask;
}

const AUTOTILE_MASKS = Array.from({ length: 256 }, (_, mask) => mask)
  .filter((mask) => normalizeAutotileMask(mask) === mask);
const AUTOTILE_MASK_INDEX = new Map(AUTOTILE_MASKS.map((mask, index) => [mask, index]));

function autotileHash(x, y, seed = 0) {
  return (Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663) ^ Math.imul(seed + 7, 83492791)) >>> 0;
}

const Render = {
  _remoteWalkState: new WeakMap(),
  _autotileAtlas: null,

  buildAutotileAtlas() {
    if (this._autotileAtlas) return this._autotileAtlas;
    const atlas = document.createElement("canvas");
    atlas.width = AUTOTILE_MASKS.length * AUTOTILE_VARIANTS * AUTOTILE_SIZE;
    atlas.height = AUTOTILE_GROUND_TYPES.length * AUTOTILE_SIZE;
    const atlasCtx = atlas.getContext("2d");
    if (!atlasCtx) return null;
    atlasCtx.imageSmoothingEnabled = false;

    for (let row = 0; row < AUTOTILE_GROUND_TYPES.length; row += 1) {
      const type = AUTOTILE_GROUND_TYPES[row];
      const colors = AUTOTILE_PALETTES[type];
      for (let maskIndex = 0; maskIndex < AUTOTILE_MASKS.length; maskIndex += 1) {
        const mask = AUTOTILE_MASKS[maskIndex];
        for (let variant = 0; variant < AUTOTILE_VARIANTS; variant += 1) {
          const originX = (maskIndex * AUTOTILE_VARIANTS + variant) * AUTOTILE_SIZE;
          const originY = row * AUTOTILE_SIZE;
          atlasCtx.fillStyle = colors.base;
          atlasCtx.fillRect(originX, originY, AUTOTILE_SIZE, AUTOTILE_SIZE);

          for (let y = 0; y < AUTOTILE_SIZE; y += 1) {
            for (let x = 0; x < AUTOTILE_SIZE; x += 1) {
              const hash = autotileHash(x + variant * 11, y + maskIndex * 3, type);
              const detail = hash % 29;
              if (detail === 0 || detail === 1) {
                atlasCtx.fillStyle = colors.shade;
                atlasCtx.fillRect(originX + x, originY + y, 1, 1);
              } else if (detail === 2) {
                atlasCtx.fillStyle = colors.light;
                atlasCtx.fillRect(originX + x, originY + y, 1, 1);
              }
              if (type === 2 && y === 2 + ((x + variant) % 4) && detail < 5) {
                atlasCtx.fillStyle = colors.detail;
                atlasCtx.fillRect(originX + x, originY + y, 1, 1);
              }
            }
          }

          const edge = (side, i) => {
            const sideBit = { north: 1, east: 2, south: 4, west: 8 }[side];
            if (mask & sideBit) return;
            const jitter = autotileHash(i, maskIndex, variant + type) % 3;
            const x = side === "east" ? AUTOTILE_SIZE - 1 : side === "west" ? 0 : i;
            const y = side === "south" ? AUTOTILE_SIZE - 1 : side === "north" ? 0 : i;
            atlasCtx.fillStyle = colors.edge;
            if (type === 2) {
              if (jitter !== 0) atlasCtx.fillRect(originX + x, originY + y, 1, 1);
            } else {
              atlasCtx.fillRect(originX + x, originY + y, 1, 1);
              if (jitter === 1 && i > 0 && i < AUTOTILE_SIZE - 1) {
                const insetX = side === "east" ? -1 : side === "west" ? 1 : 0;
                const insetY = side === "south" ? -1 : side === "north" ? 1 : 0;
                atlasCtx.fillRect(originX + x + insetX, originY + y + insetY, 1, 1);
              }
            }
          };
          for (let i = 0; i < AUTOTILE_SIZE; i += 1) {
            edge("north", i); edge("east", i); edge("south", i); edge("west", i);
          }

          // The 47-mask table includes rounded outer corners where a diagonal is absent.
          const corners = [
            { sides: 1 | 8, diagonal: 128, x: 0, y: 0 },
            { sides: 1 | 2, diagonal: 16, x: AUTOTILE_SIZE - 1, y: 0 },
            { sides: 2 | 4, diagonal: 32, x: AUTOTILE_SIZE - 1, y: AUTOTILE_SIZE - 1 },
            { sides: 4 | 8, diagonal: 64, x: 0, y: AUTOTILE_SIZE - 1 },
          ];
          atlasCtx.fillStyle = colors.edge;
          for (const corner of corners) {
            if ((mask & corner.sides) === corner.sides && !(mask & corner.diagonal)) {
              atlasCtx.fillRect(originX + corner.x, originY + corner.y, 1, 1);
            }
          }
        }
      }
    }
    this._autotileAtlas = atlas;
    return atlas;
  },

  buildTerrainCache() {
    if (!S.tiles?.length || !S.mapW || !S.mapH) return;
    const terrain = document.createElement("canvas");
    terrain.width = S.mapW;
    terrain.height = S.mapH;
    const terrainCtx = terrain.getContext("2d");
    if (!terrainCtx) return;
    terrainCtx.imageSmoothingEnabled = false;
    terrainCtx.clearRect(0, 0, S.mapW, S.mapH);

    const atlas = this.buildAutotileAtlas();
    const cellSize = AUTOTILE_SIZE;
    const columns = Math.ceil(S.mapW / cellSize);
    const rows = Math.ceil(S.mapH / cellSize);
    const kinds = Array.from({ length: rows }, () => Array(columns).fill(0));
    const groundAt = (x, y) => {
      const composite = Number(S.tiles?.[y]?.[x] ?? 0);
      const value = Number(S.groundTiles?.[y]?.[x] ?? ([3, 5, 6].includes(composite) ? 0 : composite));
      return AUTOTILE_GROUND_TYPES.includes(value) ? value : 0;
    };

    // Keep the 1px map/collision grid intact; classify 8x8 regions for rendering only.
    for (let tileY = 0; tileY < rows; tileY += 1) {
      for (let tileX = 0; tileX < columns; tileX += 1) {
        const counts = Array(8).fill(0);
        const endY = Math.min(S.mapH, (tileY + 1) * cellSize);
        const endX = Math.min(S.mapW, (tileX + 1) * cellSize);
        for (let y = tileY * cellSize; y < endY; y += 1) {
          for (let x = tileX * cellSize; x < endX; x += 1) {
            const type = groundAt(x, y);
            counts[type] += 1;
          }
        }
        let dominant = 0, dominantCount = -1;
        for (const type of AUTOTILE_GROUND_TYPES) {
          const count = counts[type];
          if (count > dominantCount) { dominant = type; dominantCount = count; }
        }
        kinds[tileY][tileX] = dominant;
      }
    }

    if (atlas) {
      const typeRows = new Map(AUTOTILE_GROUND_TYPES.map((type, index) => [type, index]));
      for (let tileY = 0; tileY < rows; tileY += 1) {
        for (let tileX = 0; tileX < columns; tileX += 1) {
          const type = kinds[tileY][tileX];
          let mask = 0;
          for (const direction of AUTOTILE_DIRECTIONS) {
            if (kinds[tileY + direction.dy]?.[tileX + direction.dx] === type) mask |= direction.bit;
          }
          mask = normalizeAutotileMask(mask);
          const maskIndex = AUTOTILE_MASK_INDEX.get(mask) ?? 0;
          const variant = autotileHash(tileX, tileY, type) % AUTOTILE_VARIANTS;
          const sourceX = (maskIndex * AUTOTILE_VARIANTS + variant) * cellSize;
          const sourceY = typeRows.get(type) * cellSize;
          terrainCtx.drawImage(atlas, sourceX, sourceY, cellSize, cellSize, tileX * cellSize, tileY * cellSize, cellSize, cellSize);
        }
      }
    } else {
      const fallbackColors = {
        0: [42, 90, 40], 1: [90, 90, 104], 2: [26, 58, 106], 4: [74, 64, 40], 7: [102, 84, 52],
      };
      const fallback = terrainCtx.createImageData(S.mapW, S.mapH);
      for (let y = 0; y < S.mapH; y += 1) {
        for (let x = 0; x < S.mapW; x += 1) {
          const color = fallbackColors[groundAt(x, y)] || fallbackColors[0];
          const index = (y * S.mapW + x) * 4;
          fallback.data[index] = color[0];
          fallback.data[index + 1] = color[1];
          fallback.data[index + 2] = color[2];
          fallback.data[index + 3] = 255;
        }
      }
      terrainCtx.putImageData(fallback, 0, 0);
    }

    // Reapply pixel-grid decorations over the autotiled ground so trees, walls and height data keep their map footprint.
    const overlay = terrainCtx.createImageData(S.mapW, S.mapH);
    const objectColors = {
      3: [[36, 25, 23], [52, 35, 31], [83, 57, 48]],
      5: [[24, 49, 27], [34, 77, 38], [54, 104, 46]],
      6: [[64, 65, 76], [88, 89, 101], [124, 125, 134]],
    };
    for (let y = 0; y < S.mapH; y += 1) {
      for (let x = 0; x < S.mapW; x += 1) {
        const composite = Number(S.tiles?.[y]?.[x] ?? 0);
        const rawObject = Number(S.objectTiles?.[y]?.[x] ?? ([3, 5, 6].includes(composite) ? composite : -1));
        const elevation = Math.max(0, Number(S.elevationTiles?.[y]?.[x] || 0) || 0);
        const index = (y * S.mapW + x) * 4;
        if (objectColors[rawObject]) {
          const palette = objectColors[rawObject];
          const hash = autotileHash(x, y, rawObject) % 23;
          const color = palette[hash < 3 ? 0 : hash < 17 ? 1 : 2];
          const hasSameNeighbor = S.objectTiles?.[y - 1]?.[x] === rawObject
            || S.objectTiles?.[y + 1]?.[x] === rawObject
            || S.objectTiles?.[y]?.[x - 1] === rawObject
            || S.objectTiles?.[y]?.[x + 1] === rawObject;
          const shade = !hasSameNeighbor && rawObject !== 5 ? 0.76 : 1;
          const lift = Math.min(20, elevation * 5);
          overlay.data[index] = Math.min(255, Math.round(color[0] * shade + lift));
          overlay.data[index + 1] = Math.min(255, Math.round(color[1] * shade + lift));
          overlay.data[index + 2] = Math.min(255, Math.round(color[2] * shade + lift));
          overlay.data[index + 3] = 255;
        } else if (elevation) {
          overlay.data[index] = 235;
          overlay.data[index + 1] = 225;
          overlay.data[index + 2] = 190;
          overlay.data[index + 3] = Math.min(72, Math.round(elevation * 18));
        }
      }
    }
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = S.mapW;
    overlayCanvas.height = S.mapH;
    const overlayCtx = overlayCanvas.getContext("2d");
    if (overlayCtx) {
      overlayCtx.putImageData(overlay, 0, 0);
      terrainCtx.drawImage(overlayCanvas, 0, 0);
    }
    S.terrainCanvas = terrain;
    const mini = document.createElement("canvas");
    mini.width = 144; mini.height = 96;
    const miniCtx = mini.getContext("2d");
    miniCtx.imageSmoothingEnabled = true;
    miniCtx.drawImage(terrain, 0, 0, mini.width, mini.height);
    S.miniTerrainCanvas = mini;
  },

  frame(dt = 1000 / 60, alpha = 1, timestamp = performance.now()) {
    const p = S.player;
    if (!p) return;
    
    const ts = CFG.TS, ds = CFG.DS;
    const lcW = cW / ds, lcH = cH / ds; // Logical Canvas Size
    
    // Giữ cùng nhịp bám camera giữa màn hình 30, 60 và 120 FPS.
    const cameraFollow = 1 - Math.exp(-Math.max(0, Number(dt) || 0) / 80);
    S.cam.x = lerp(S.cam.x, p.px - lcW / 2, cameraFollow);
    S.cam.y = lerp(S.cam.y, p.py - lcH / 2, cameraFollow);
    S.cam.x = Math.max(0, Math.min(S.mapW * ts - lcW, S.cam.x));
    S.cam.y = Math.max(0, Math.min(S.mapH * ts - lcH, S.cam.y));
    
    const shakePower = S.cameraShake?.until > Date.now() ? Number(S.cameraShake.power || 0) : 0;
    const cx = S.cam.x + (shakePower ? (Math.random() - 0.5) * shakePower : 0);
    const cy = S.cam.y + (shakePower ? (Math.random() - 0.5) * shakePower : 0);
    ctx.clearRect(0, 0, cW, cH);

    if (!S.tiles || S.tiles.length === 0) {
      ctx.fillStyle = "#fff"; ctx.font = "12px monospace"; ctx.textAlign = "center";
      ctx.fillText("ĐANG NẠP THẾ GIỚI...", cW / 2, cH / 2);
      return;
    }
    
    ctx.save();
    ctx.scale(ds, ds);
    
    const tx0 = Math.max(0, Math.floor(cx / ts)),
          ty0 = Math.max(0, Math.floor(cy / ts));
    const tx1 = Math.min(S.mapW - 1, tx0 + Math.ceil(lcW / ts) + 1),
          ty1 = Math.min(S.mapH - 1, ty0 + Math.ceil(lcH / ts) + 1);
          
    if (!S.terrainCanvas) Render.buildTerrainCache();
    if (S.terrainCanvas) {
      const sourceX = Math.max(0, Math.floor(cx));
      const sourceY = Math.max(0, Math.floor(cy));
      const sourceW = Math.max(1, Math.min(Math.ceil(lcW) + 2, S.mapW - sourceX));
      const sourceH = Math.max(1, Math.min(Math.ceil(lcH) + 2, S.mapH - sourceY));
      ctx.drawImage(S.terrainCanvas, sourceX, sourceY, sourceW, sourceH, sourceX - cx, sourceY - cy, sourceW, sourceH);
    } else {
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (S.tiles[ty] && S.tiles[ty][tx] !== undefined) Render.tile(S.tiles[ty][tx], tx * ts - cx, ty * ts - cy, tx, ty);
      }
    }
    
    // Draw entities
    if (p.targetMovePos) {
      const destX = p.targetMovePos.x * ts + ts / 2 - cx;
      const destY = p.targetMovePos.y * ts + ts / 2 - cy;
      const pulse = 0.5 + 0.5 * Math.sin(S.animT * 0.008);
      ctx.save();
      ctx.strokeStyle = `rgba(0, 210, 211, ${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(destX, destY, 4 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(0, 210, 211, ${0.2 + pulse * 0.2})`;
      ctx.fill();
      ctx.restore();
    }
    for (const portal of S.portals) if (portal.tenMapDen) Render.portal(portal, cx, cy);

    const renderTime = timestamp - (typeof EntitySnapshots !== "undefined" ? EntitySnapshots.delayMs : 100);
    const interpolated = (entity) => typeof EntitySnapshots !== "undefined"
      ? EntitySnapshots.sample(entity, renderTime)
      : { x: entity.px, y: entity.py };
    const previousX = Number.isFinite(p.previousPx) ? p.previousPx : p.px;
    const previousY = Number.isFinite(p.previousPy) ? p.previousPy : p.py;
    const renderAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    const localPosition = {
      x: previousX + (p.px - previousX) * renderAlpha,
      y: previousY + (p.py - previousY) * renderAlpha,
    };
    const drawables = [];
    let drawOrder = 0;
    for (const drop of S.groundItems || []) {
      const x = Number(drop.x || 0) * ts + ts / 2;
      const y = Number(drop.y || 0) * ts + ts / 2;
      drawables.push({ y, order: 0, sequence: drawOrder++, draw: () => Render.groundLoot(drop, cx, cy) });
    }
    for (const npc of S.npcs) {
      drawables.push({ y: Number(npc.py) + 10, order: 1, sequence: drawOrder++, draw: () => Render.npc(npc, cx, cy) });
    }
    for (const monster of S.monsters) {
      if (monster.dead) continue;
      const position = interpolated(monster);
      const height = Number(monster.animation?.height || monster.size || 18);
      const view = { ...monster, px: position?.x ?? monster.px, py: position?.y ?? monster.py };
      drawables.push({ y: view.py + height * 0.32, order: 2, sequence: drawOrder++, draw: () => Render.monster(view, cx, cy) });
    }
    for (const [, other] of S.players) {
      const position = interpolated(other);
      const px = position?.x ?? other.px, py = position?.y ?? other.py;
      const previous = this._remoteWalkState.get(other);
      let walkDistance = 0;
      if (other.isMoving) {
        walkDistance = Number(previous?.walkDistance ?? other.walkDistance) || 0;
        if (previous) walkDistance += Math.hypot(px - previous.x, py - previous.y);
      }
      this._remoteWalkState.set(other, { x: px, y: py, walkDistance });
      const view = { ...other, px, py, walkDistance };
      drawables.push({ y: view.py, order: 3, sequence: drawOrder++, draw: () => Render.otherPlayer(view, cx, cy) });
    }
    const tint = p.root ? p.root.color : "#4488cc";
    drawables.push({ y: localPosition.y, order: 4, sequence: drawOrder++, draw: () => Render.player(localPosition.x - cx, localPosition.y - cy, tint, p) });
    Render.sortDrawables(drawables);
    for (const drawable of drawables) drawable.draw();
    Render.drawCombatFx(cx, cy);
    if (typeof SkillVFX !== "undefined") SkillVFX.draw(cx, cy);

    // KPAH Name Tags & HP Bar
    ctx.font = "bold 6px monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 1;

    // Vẽ tên người chơi
    const playerLabelY = localPosition.y - cy - CFG.ACTOR_H - 7;
    ctx.strokeStyle = "#000"; ctx.strokeText(p.name, localPosition.x - cx, playerLabelY);
    ctx.fillStyle = tint; ctx.fillText(p.name, localPosition.x - cx, playerLabelY);

    // Vẽ thanh máu mini cho người chơi
    const pw = CFG.ACTOR_W;
    const playerBarY = localPosition.y - cy - CFG.ACTOR_H - 4;
    ctx.fillStyle = "#111"; ctx.fillRect(localPosition.x - cx - pw/2, playerBarY, pw, 2);
    ctx.fillStyle = "#cc2222"; ctx.fillRect(localPosition.x - cx - pw/2, playerBarY, pw * (Math.max(0, p.hp)/Math.max(1, p.maxHp)), 2);

    // Vẽ KPAH Floating Damage Text
    for (const ft of S.floatingTexts) {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.save();
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      if (ft.isCrit) {
        ctx.font = "bold 9px monospace";
      } else if (ft.kind === "skill") {
        ctx.font = "bold 7px monospace";
      } else {
        ctx.font = "bold 8px monospace";
      }
      ctx.strokeText(ft.text, ft.x - cx, ft.y - cy);
      ctx.fillStyle = ft.color.replace(')', `,${alpha})`).replace('rgb', 'rgba').replace(/#([0-9a-fA-F]{6})/, (m, c) => `rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${alpha})`);
      ctx.fillText(ft.text, ft.x - cx, ft.y - cy);
      ctx.restore();
    }
    
    ctx.restore();

    // Portal hint (vẽ trên màn hình canvas thực tế sau restore để không bị scale 3x)
    if (Array.isArray(S.portals) && S.portals.length) {
      let nearest = null, bestDist = Infinity;
      const screenCenterX = cW / 2, screenCenterY = cH / 2;
      for (const portal of S.portals) {
        if (!portal.tenMapDen && !portal.denMap && !portal.toMap) continue;
        const screenPx = (portal.x * ts + ts / 2 - cx) * ds;
        const screenPy = (portal.y * ts + ts / 2 - cy) * ds;
        // Nếu cổng đã hiển thị trong màn hình, không cần vẽ la bàn chỉ hướng
        if (screenPx >= 35 && screenPx <= cW - 35 && screenPy >= 35 && screenPy <= cH - 35) continue;
        const dx = screenPx - screenCenterX;
        const dy = screenPy - screenCenterY;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          nearest = { portal, dx, dy, screenPx, screenPy };
        }
      }
      if (nearest) Render.portalHint(nearest, screenCenterX, screenCenterY, cW, cH);
    }

    Render.miniMap();
  },

  miniMap() {
    const map = document.getElementById("mini-map");
    if (!map || !S.tiles?.length) return;
    const mini = map.getContext("2d");
    const w = map.width, h = map.height;
    const sx = w / Math.max(1, S.mapW), sy = h / Math.max(1, S.mapH);
    mini.clearRect(0, 0, w, h);
    if (S.miniTerrainCanvas) mini.drawImage(S.miniTerrainCanvas, 0, 0, w, h);

    // 1. Cổng không gian (hình thoi phát sáng dạ quang)
    const portalPulse = Math.sin(S.animT * 0.005) * 1;
    for (const portal of S.portals || []) {
      const px = (portal.x + 0.5) * sx;
      const py = (portal.y + 0.5) * sy;
      const sz = Math.max(3, 4 + portalPulse);
      mini.save();
      mini.fillStyle = "#48dbfb";
      mini.shadowColor = "#00d2d3";
      mini.shadowBlur = 6;
      mini.beginPath();
      mini.moveTo(px, py - sz);
      mini.lineTo(px + sz, py);
      mini.lineTo(px, py + sz);
      mini.lineTo(px - sz, py);
      mini.closePath();
      mini.fill();
      mini.strokeStyle = "#ffffff";
      mini.lineWidth = 1;
      mini.stroke();
      mini.restore();
    }

    // 2. Quái vật (chuẩn hóa tọa độ theo tile, vẽ vòng đỏ khi là mục tiêu được nhắm)
    for (const monster of S.monsters || []) {
      if (monster.dead) continue;
      const mx = (monster.px !== undefined ? monster.px / CFG.TS : monster.x) * sx;
      const my = (monster.py !== undefined ? monster.py / CFG.TS : monster.y) * sy;
      const isTarget = Boolean(S.target && (S.target === monster || S.target.id === monster.id));

      if (isTarget) {
        mini.save();
        mini.strokeStyle = "#ff3838";
        mini.lineWidth = 1.5;
        mini.beginPath();
        mini.arc(mx, my, 4 + Math.sin(S.animT * 0.01) * 1.5, 0, Math.PI * 2);
        mini.stroke();
        mini.restore();
      }

      mini.fillStyle = isTarget ? "#ff3838" : (monster.type === "BOSS" ? "#d43f72" : (monster.type === "ELITE" ? "#ff9f43" : "#ee5253"));
      const dotSz = monster.type === "BOSS" ? 4 : (monster.type === "ELITE" || isTarget ? 3 : 2);
      mini.fillRect(mx - dotSz / 2, my - dotSz / 2, dotSz, dotSz);
    }

    // 3. Người chơi khác (chấm xanh lam phát sáng)
    if (S.players && S.players.size > 0) {
      for (const [, op] of S.players) {
        const opx = (op.px !== undefined ? op.px / CFG.TS : op.x) * sx;
        const opy = (op.py !== undefined ? op.py / CFG.TS : op.y) * sy;
        mini.save();
        mini.fillStyle = "#54a0ff";
        mini.shadowColor = "#2e86de";
        mini.shadowBlur = 4;
        mini.beginPath();
        mini.arc(opx, opy, 2.5, 0, Math.PI * 2);
        mini.fill();
        mini.strokeStyle = "#ffffff";
        mini.lineWidth = 0.8;
        mini.stroke();
        mini.restore();
      }
    }

    // 4. Bản thân người chơi (chấm vàng kim có hào quang)
    if (S.player) {
      const plx = (S.player.x + 0.5) * sx;
      const ply = (S.player.y + 0.5) * sy;
      mini.save();
      mini.fillStyle = "#fff3c4";
      mini.shadowColor = "#f0a85a";
      mini.shadowBlur = 6;
      mini.beginPath();
      mini.arc(plx, ply, 3.5, 0, Math.PI * 2);
      mini.fill();
      mini.strokeStyle = "#f39c12";
      mini.lineWidth = 1.2;
      mini.stroke();
      mini.restore();
    }
  },

  sortDrawables(drawables) {
    return drawables.sort((a, b) => (a.y - b.y) || (a.order - b.order) || (a.sequence - b.sequence));
  },

  tile(t, sx, sy, tx = 0, ty = 0) {
    const ts = CFG.TS;
    const fsx = Math.floor(sx), fsy = Math.floor(sy);
    const layered = Array.isArray(S.groundTiles?.[ty]);
    const ground = layered ? S.groundTiles[ty][tx] : ([3, 5, 6].includes(t) ? 0 : t);
    const object = layered ? Number(S.objectTiles?.[ty]?.[tx] ?? -1) : ([3, 5, 6].includes(t) ? t : -1);
    const c = TC[ground] || ["#333", "#444"];
    const hash = Math.abs(Math.imul(tx + 37, 73856093) ^ Math.imul(ty + 11, 19349663)) % 17;
    
    ctx.fillStyle = c[0];
    ctx.fillRect(fsx, fsy, ts, ts);

    const elevation = Number(S.elevationTiles?.[ty]?.[tx] || 0);
    if (elevation) {
      ctx.fillStyle = `rgba(235,225,190,${elevation * .045})`;
      ctx.fillRect(fsx, fsy, ts, ts);
    }

    ctx.fillStyle = c[1];
    if (ground === 0 && hash > 9) {
      ctx.fillRect(fsx + 2 + hash % 3, fsy + 3, 1, 2);
    } else if (ground === 2) {
      ctx.globalAlpha = 0.5;
      ctx.fillRect(fsx + hash % 3, fsy + 2 + Math.floor(Math.sin(S.animT * .002 + tx) * 1), 5, 1);
      if (hash > 8) ctx.fillRect(fsx + 3, fsy + 6, 3, 1);
      ctx.globalAlpha = 1.0;
    }

    const groundAt = (x, y) => S.groundTiles?.[y]?.[x] ?? S.tiles?.[y]?.[x];
    if (ground !== 2 && layered) {
      ctx.fillStyle = "rgba(190,168,99,.72)";
      if (groundAt(tx, ty - 1) === 2) ctx.fillRect(fsx, fsy, ts, 1);
      if (groundAt(tx, ty + 1) === 2) ctx.fillRect(fsx, fsy + ts - 1, ts, 1);
      if (groundAt(tx - 1, ty) === 2) ctx.fillRect(fsx, fsy, 1, ts);
      if (groundAt(tx + 1, ty) === 2) ctx.fillRect(fsx + ts - 1, fsy, 1, ts);
    }

    if (object === 3) {
      ctx.fillStyle = TC[3][0];
      ctx.fillRect(fsx, fsy, ts, ts);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(fsx, fsy, ts, 1);
      ctx.fillRect(fsx, fsy, 1, ts);
    } else if (object === 5) {
      ctx.fillStyle = "#1a1208";
      ctx.fillRect(fsx + 3, fsy + 5, 2, 3);
      ctx.fillStyle = hash % 2 ? "#245222" : "#2d6029";
      ctx.fillRect(fsx + 1, fsy + 2, 6, 3);
      ctx.fillRect(fsx + 2, fsy + 1, 4, 5);
    } else if (object === 6) {
      ctx.fillStyle = TC[6][0];
      ctx.beginPath();
      ctx.moveTo(fsx, fsy + ts);
      ctx.lineTo(fsx + 4, fsy + 1);
      ctx.lineTo(fsx + ts, fsy + ts);
      ctx.fill();
      ctx.fillStyle = TC[6][1];
      ctx.beginPath();
      ctx.moveTo(fsx + 3, fsy + 3);
      ctx.lineTo(fsx + 4, fsy + 1);
      ctx.lineTo(fsx + 5, fsy + 4);
      ctx.fill();
    } else if (ground === 1 && hash > 6) {
      ctx.globalAlpha = .35;
      ctx.fillRect(fsx + 2, fsy + 3 + hash % 2, 4, 1);
      ctx.globalAlpha = 1;
    }
  },

  walkFrame(actor) {
    return Math.floor(Math.max(0, Number(actor?.walkDistance || 0)) / 5.5) % 4;
  },

  player(sx, sy, tint, actor = S.player) {
    const gender = actor?.gender === "FEMALE" ? "female" : "male";
    const defaultImg = `./assets/characters/cultivator-${gender}.png`;
    const isBuiltInCharacter = /(?:char_(?:male|female)(?:_anim-source)?\.png|characters\/cultivator-(?:male|female)\.png)$/i.test(actor?.img || "");
    const imgToDraw = !actor?.img || isBuiltInCharacter ? defaultImg : actor.img;
    const moving = !!actor?.isMoving;
    const now = Date.now();
    const activeAction = actor?.animUntil > now
      ? actor.animState
      : (moving ? "walk" : "idle");
    const hurtRow = Number(actor?.animation?.rows || 4) > 4 ? 4 : 2;
    const animation = { idle: { row: 0, speed: 240 }, walk: { row: 1, speed: 115 }, attack: { row: 2, speed: 82 }, cast: { row: 3, speed: 125 }, hurt: { row: hurtRow, speed: 90 } }[activeAction] || { row: 0, speed: 240 };
    if (this._prefersReducedMotion === undefined) {
      this._prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
    }
    const reduceMotion = this._prefersReducedMotion;
    const actionElapsed = Math.max(0, now - Number(actor?.animStartedAt || now));
    const rawFrame = reduceMotion ? 0 : activeAction === "walk"
      ? this.walkFrame(actor)
      : Math.floor(now / animation.speed) % 4;
    // Idle chạy ping-pong (0-1-2-1) để cả nam và nữ chuyển động mềm, không giật khi lặp từ frame cuối về đầu.
    const frameIndex = reduceMotion
      ? ((activeAction === "attack" || activeAction === "cast" || activeAction === "hurt") ? 2 : 0)
      : (activeAction === "idle"
        ? [0, 1, 2, 1][rawFrame]
        : (activeAction === "walk" ? rawFrame : Math.min(3, Math.floor(actionElapsed / animation.speed))));
    const hurtProgress = activeAction === "hurt"
      ? Math.max(0, Math.min(1, (260 - (Number(actor.animUntil || now) - now)) / 260))
      : 0;
    const hurtShift = reduceMotion ? 0 : Math.sin(hurtProgress * Math.PI) * 3 * Number(actor?.hurtDirection || -1);
    const phase = now * (moving ? 0.0065 : 0.0012);
    const stride = Math.sin(phase);
    const idle = activeAction === "idle";
    // Nhịp thở chỉ dịch thân rất ít; điểm neo vẫn là chân nên nhân vật không bị cảm giác bay.
    const idlePhase = now * 0.0032;
    const bob = reduceMotion ? 0 : (idle ? Math.sin(idlePhase) * 0.08 : Math.abs(stride) * 0.12);
    const sway = reduceMotion ? 0 : idle
      ? Math.sin(idlePhase * 0.7) * 0.008
      : (activeAction === "walk" ? Math.sin(phase * 0.5) * 0.018 : 0);
    const attackPulse = !reduceMotion && actor === S.player && activeAction === "attack" ? Math.min(1, Math.max(0, S.atkCd / CFG.ATK_CD)) : 0;
    const actorW = Number(actor?.animation?.width || CFG.ACTOR_W);
    const actorH = Number(actor?.animation?.height || CFG.ACTOR_H);
    
    // Nếu đạo hữu muốn dùng ảnh và tải thành công:
    if (imgToDraw) {
      // Bóng chân giữ nhân vật bám mặt đất; không vẽ aura quanh thân.
      ctx.fillStyle = "rgba(0,0,0,.34)";
      ctx.beginPath();
      ctx.ellipse(sx, sy + 0.8, moving ? 5.8 + Math.abs(stride) * 0.4 : 5.8, 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      // `sy` là điểm chạm đất/chân. Sprite được neo lên trên để mép nước
      // chạm đúng chân, trong khi collision vẫn dùng cùng tọa độ world.
      ctx.translate(sx, sy - bob + (CFG.ACTOR_FOOT_OFFSET || 0));
      ctx.rotate(sway - attackPulse * 0.035);
      ctx.scale(1 + attackPulse * 0.035, 1 - attackPulse * 0.025);
      ctx.scale(1 + (moving && !reduceMotion ? Math.abs(stride) * 0.035 : 0), 1 - (moving && !reduceMotion ? Math.abs(stride) * 0.025 : 0));
      const facingScale = actor?.direction === "left" ? -1 : 1;
      ctx.scale(facingScale, 1);
      const defaultCharacterSheet = !actor?.img || isBuiltInCharacter;
      const spriteFrame = actor?.animation?.kind === "grid"
        ? { col: frameIndex % Number(actor.animation.cols || 4), row: animation.row, cols: actor.animation.cols || 4, rows: actor.animation.rows || 4 }
        : (defaultCharacterSheet ? { col: frameIndex, row: animation.row, cols: 4, rows: 4 } : null);
      const drawn = this.drawSprite(imgToDraw, hurtShift * facingScale, -actorH / 2 - 2, actorW, actorH, spriteFrame);
      ctx.restore();
      if (drawn) {
        this.drawBuffEffects(sx, sy, actor, actorW, actorH);
        if (actor?.hitUntil > Date.now()) {
          ctx.save();
          const pulse = 0.58 + Math.sin(Date.now() * 0.045) * 0.18;
          ctx.globalAlpha = pulse;
          ctx.fillStyle = "#ff5268";
          const halfW = Math.ceil(actorW * 0.55);
          const topY = sy - actorH * 0.9;
          for (const [x, y] of [[sx - halfW, topY], [sx + halfW - 2, topY], [sx - halfW, sy - 3], [sx + halfW - 2, sy - 3]]) {
            ctx.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 3, 3);
          }
          ctx.restore();
        }
        return;
      }
    }

    const fallbackActionShift = activeAction === "hurt"
      ? hurtShift
      : (activeAction === "attack" ? Math.sin((frameIndex / 3) * Math.PI) * 2 : 0);
    const x = sx - 4 + fallbackActionShift, y = sy - 9;
    // Bóng đổ
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.beginPath(); ctx.ellipse(sx, sy + 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();

    // Thân/Áo
    ctx.fillStyle = "#1a2848";
    ctx.fillRect(x, y + 3, 8, 6);
    
    // Tóc/Mũ (Dựa trên tint/linh căn)
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, 8, 3);
    
    // Mặt
    ctx.fillStyle = "#ffdbac";
    ctx.fillRect(x + 1, y + 2, 6, 4);
    
    // Mắt
    ctx.fillStyle = "#111";
    const eyeY = y + 3 + Math.sin(S.animT * 0.01) * 0.3; // Chớp mắt nhẹ
    ctx.fillRect(x + 2, eyeY, 1, 1);
    ctx.fillRect(x + 5, eyeY, 1, 1);
    
    // Chi tiết áo
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(x + 3, y + 4, 2, 4);
    if (activeAction === "attack") {
      const direction = actor?.direction === "left" ? -1 : 1;
      const handX = direction > 0 ? x + 7 : x - 3;
      ctx.fillStyle = "#d8cba8";
      ctx.fillRect(handX, y + 5, 4, 2);
      ctx.fillStyle = "#fff0b2";
      ctx.fillRect(handX + direction * 3, y + 3, 2, 2);
      ctx.fillRect(handX + direction * 5, y + 1, 2, 2);
    }

    if (actor?.hitUntil > Date.now()) {
      ctx.save();
      ctx.fillStyle = "#ff5268";
      for (const [x, y] of [[sx - 6, sy - 10], [sx + 4, sy - 10], [sx - 6, sy + 2], [sx + 4, sy + 2]]) {
        ctx.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 3, 3);
      }
      ctx.restore();
    }
  },

  otherPlayer(op, cx, cy) {
    const sx = op.px - cx, sy = op.py - cy;
    if (sx < -40 || sx > (cW/CFG.DS) + 40 || sy < -40 || sy > (cH/CFG.DS) + 40) return;
    this.player(sx, sy, op.color || "#888", op);
    ctx.fillStyle = "#fff";
    ctx.font = "7px monospace";
    ctx.textAlign = "center";
    ctx.fillText(op.name || "Tu sĩ", sx, sy - CFG.ACTOR_H - 5);
  },

  monster(m, cx, cy) {
    const sx = m.px - cx, sy = m.py - cy;
    if (sx < -45 || sx > (cW/CFG.DS) + 45 || sy < -45 || sy > (cH/CFG.DS) + 45) return;

    const now = Date.now();
    const moving = ["chase", "return", "patrol"].includes(m.state);
    const action = m.hitUntil > now ? "hit" : (m.attackUntil > now || m.state === "attack" ? "attack" : (moving ? "walk" : "idle"));
    const animation = m.animation || { kind: "procedural", width: m.size || 18, height: m.size || 18 };
    const spriteW = Number(animation.width || m.size || 18);
    const spriteH = Number(animation.height || m.size || 18);

    const isTarget = Boolean(S.target && (S.target === m || S.target.id === m.id));
    if (isTarget) {
      const t = S.animT * 0.006;
      ctx.save();
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(sx, sy + spriteH * 0.32, spriteW * 0.65 + Math.sin(t) * 1.2, spriteH * 0.28 + Math.sin(t) * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#ff3b30";
      ctx.beginPath();
      const arrowY = sy - spriteH * 0.62 + Math.sin(t * 1.6) * 2;
      ctx.moveTo(sx, arrowY + 3.5);
      ctx.lineTo(sx - 3, arrowY);
      ctx.lineTo(sx + 3, arrowY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    let useSprite = false;
    if (m.img && animation.kind === "grid") {
      const speed = { idle: 220, walk: 120, attack: 86, hit: 120 }[action] || 160;
      const frame = Math.floor(now / speed) % Number(animation.cols || 4);
      const row = { idle: 0, walk: 1, attack: 2, hit: 3 }[action] || 0;
      useSprite = this.drawSprite(m.img, sx, sy, spriteW, spriteH, { col: frame, row, cols: animation.cols || 4, rows: animation.rows || 4 });
    } else if (m.img) {
      useSprite = this.drawAnimatedImage(m.img, sx, sy, spriteW, spriteH, action, m);
    }
    
    if (!useSprite) {
      const attackProgress = action === "attack"
        ? (m.attackUntil > now
          ? Math.max(0, Math.min(1, (now - Number(m.attackStartedAt || now)) / 360))
          : (m.state === "attack" ? (now % 360) / 360 : 0))
        : 0;
      const attackDir = Number(m.attackDirection || 1);
      const lunge = action === "attack" ? Math.sin(attackProgress * Math.PI) * 3 : 0;
      const x = sx - spriteW / 2 + attackDir * lunge, y = sy - spriteH / 2;
      const wave = action === "attack" ? -Math.round(attackProgress * 2) : Math.sin(S.animT * 0.005) * 1;
      
      // Bóng
      ctx.fillStyle = "rgba(0,0,0,.15)";
      ctx.beginPath(); ctx.arc(sx, sy + 2, 5, 0, Math.PI * 2); ctx.fill();
      
      // Thân quái (dùng màu đơn sắc thay vì gradient để tránh lỗi mã màu lạ)
      try {
        ctx.fillStyle = m.color || "#aa1111";
      } catch (e) {
        ctx.fillStyle = "#aa1111";
      }
      
      // Vẽ hình khối hơi tròn cho quái
      ctx.beginPath();
      ctx.roundRect(x, y + wave, spriteW, spriteH * 0.72, 2);
      ctx.fill();
      
      // Mắt quái (Sáng lên)
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + spriteW * 0.2, y + spriteH * 0.2 + wave, 2, 2);
      ctx.fillRect(x + spriteW * 0.65, y + spriteH * 0.2 + wave, 2, 2);
      ctx.fillStyle = "#f00";
      ctx.fillRect(x + spriteW * 0.22, y + spriteH * 0.24 + wave, 1, 1);
      ctx.fillRect(x + spriteW * 0.67, y + spriteH * 0.24 + wave, 1, 1);
      if (action === "attack") {
        const slashX = attackDir > 0 ? x + spriteW + 1 : x - 5;
        const slashY = y + spriteH * 0.42 + wave;
        ctx.fillStyle = m.color || "#aa1111";
        ctx.fillRect(slashX, slashY + 3, 4, 2);
        ctx.fillRect(slashX + attackDir, slashY, 3, 2);
        ctx.fillStyle = "#ffe7a0";
        ctx.fillRect(slashX + attackDir, slashY + 1, 3, 1);
      }
    }

    if (m.hitUntil > now) {
      ctx.save();
      const pulse = 0.58 + Math.sin(now * 0.045) * 0.18;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ff5268";
      const halfW = Math.ceil(spriteW * 0.56);
      const topY = sy - spriteH * 0.62;
      for (const [x, y] of [[sx - halfW, topY], [sx + halfW - 2, topY], [sx - halfW, sy + 1], [sx + halfW - 2, sy + 1]]) {
        ctx.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 3, 3);
      }
      ctx.restore();
    }
    
    if (m.hp < m.maxHp && m.hp > 0) {
      const maxHp = Math.max(1, m.maxHp || 100);
      const hp = Math.max(0, m.hp || 0);
      const barW = Math.max(20, spriteW + 4);
      const barY = sy - spriteH / 2 - 6;
      ctx.fillStyle = "#111"; ctx.fillRect(sx - barW / 2, barY, barW, 3);
      ctx.fillStyle = "#cc2222"; ctx.fillRect(sx - barW / 2, barY, (barW * hp) / maxHp, 3);
    }
  },

  groundLoot(drop, cx, cy) {
    const sx = Number(drop.x || 0) * CFG.TS + CFG.TS / 2 - cx;
    const sy = Number(drop.y || 0) * CFG.TS + CFG.TS / 2 - cy;
    if (sx < -24 || sy < -24 || sx > cW / CFG.DS + 24 || sy > cH / CFG.DS + 24) return;
    const pulse = 0.7 + Math.sin(S.animT * 0.006 + sx) * 0.2;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = drop.kind === "xu" ? "#f4d982" : "#8fe7d7";
    ctx.strokeStyle = "rgba(5,12,18,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#071018";
    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(drop.kind === "xu" ? "$" : "✦", sx, sy + 2.5);
    ctx.restore();
  },

  npc(npc, cx, cy) {
    const sx = npc.px - cx, sy = npc.py - cy;
    if (sx < -50 || sx > (cW/CFG.DS) + 50 || sy < -50 || sy > (cH/CFG.DS) + 50) return;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(sx - 8, sy + 9, 16, 3);
    ctx.fillStyle = npc.color || "#88aacc"; ctx.fillRect(sx - 8, sy - 10, 16, 20);
    ctx.fillStyle = "#fff"; ctx.font = "7px monospace"; ctx.textAlign = "center";
    ctx.fillText(npc.name, sx, sy - 16);
  },

  portal(portal, cx, cy) {
    const sx = portal.x * CFG.TS + CFG.TS / 2 - cx, sy = portal.y * CFG.TS + CFG.TS / 2 - cy;
    const a = S.animT * 0.002;
    const pulse = 7 + Math.sin(a) * 1.5;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = `rgba(124,232,235,${0.65 + Math.sin(a) * 0.15})`;
    ctx.shadowColor = "#00d2d3";
    ctx.shadowBlur = 5;
    ctx.lineWidth = 1;
    ctx.strokeRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.restore();
  },

  portalRiftImage() {
    if (this._portalRift) return this._portalRift;
    const image = new Image();
    image.onload = () => { image.isReady = true; };
    image.onerror = () => { image.failed = true; };
    image.src = "./assets/portals/spatial-rift-source.png";
    this._portalRift = image;
    return image;
  },

  portalHint(nearest, centerX, centerY, cW, cH) {
    const { dx, dy, portal } = nearest;
    const ts = CFG.TS || 1;
    const ds = CFG.DS || 3;
    const distPx = Math.hypot(dx / ds, dy / ds);
    const distMeters = Math.max(1, Math.round(distPx / ts));
    if (distMeters < 12) return; // Nếu đã gần cổng, không hiện chỉ dẫn để thoáng màn hình

    const angle = Math.atan2(dy, dx);
    const padX = 24;
    const padY = 22;
    const edgeX = Math.min(cW - padX, Math.max(padX, centerX + Math.cos(angle) * (cW / 2 - padX)));
    const edgeY = Math.min(cH - padY, Math.max(padY, centerY + Math.sin(angle) * (cH / 2 - padY)));

    const rift = this.portalRiftImage();
    if (rift.isReady && !rift.failed) {
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const side = horizontal ? (dx < 0 ? "left" : "right") : (dy < 0 ? "top" : "bottom");
      const riftW = horizontal ? 54 : 148;
      const riftH = horizontal ? 148 : 54;
      ctx.save();
      ctx.translate(edgeX, edgeY);
      if (side === "right" || side === "bottom") ctx.scale(-1, 1);
      if (!horizontal) ctx.rotate(side === "top" ? -Math.PI / 2 : Math.PI / 2);
      ctx.globalAlpha = 0.92;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(rift, -riftW / 2, -riftH / 2, riftW, riftH);
      ctx.restore();
      return;
    }

    ctx.save();
    // 1. Mũi tên nhỏ xoay hướng tới cổng
    ctx.translate(edgeX, edgeY);
    ctx.rotate(angle);
    ctx.fillStyle = "#7ce8eb";
    ctx.shadowColor = "#00d2d3";
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // 2. Nhãn hiển thị nhỏ gọn thanh lịch (font 10px, cao 16px)
    ctx.save();
    const label = `${portal.tenMapDen || "Cổng"} (${distMeters}m)`;
    ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const compactLabel = `${distMeters}m`;
    ctx.font = "600 9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const textW = ctx.measureText(compactLabel).width;
    const boxW = Math.round(textW + 10);
    const boxH = 14;
    const labelOffsetY = edgeY > cH - 30 ? -12 : 12;
    const boxX = Math.min(cW - boxW / 2 - 6, Math.max(boxW / 2 + 6, edgeX));
    const boxY = Math.min(cH - boxH / 2 - 4, Math.max(boxH / 2 + 4, edgeY + labelOffsetY));

    ctx.fillStyle = "rgba(7, 15, 24, 0.74)";
    ctx.strokeStyle = "rgba(124, 232, 235, 0.32)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.roundRect(boxX - boxW / 2, boxY - boxH / 2, boxW, boxH, 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e0f7fa";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(compactLabel, boxX, boxY);
    ctx.restore();
  },

  floatDmg(wx, wy, offY, text, color, isCrit = false) {
    if (!S.floatingTexts) S.floatingTexts = [];
    S.floatingTexts.push({
      text: text,
      color: color,
      x: wx + Math.random() * 8 - 4,
      y: wy + offY,
      life: isCrit ? 1000 : 800,
      maxLife: isCrit ? 1000 : 800,
      isCrit: Boolean(isCrit),
    });
  },

  combatFx(wx, wy, type = "hit", color = "#ff9f68", power = 1) {
    if (!S.combatFx) S.combatFx = [];
    const cfg = {
      hit: { count: 5, life: 230, radius: 5, spread: 1.7 },
      crit: { count: 9, life: 340, radius: 8, spread: 2.4 },
      hurt: { count: 6, life: 260, radius: 6, spread: 1.8 },
      miss: { count: 3, life: 220, radius: 4, spread: 1.2 },
      skill: { count: 8, life: 300, radius: 7, spread: 2.1 },
    }[type] || { count: 5, life: 230, radius: 5, spread: 1.7 };
    for (let i = 0; i < cfg.count; i += 1) {
      const angle = (Math.PI * 2 * i) / cfg.count + Math.random() * 0.35;
      const speed = (0.35 + Math.random() * cfg.spread) * Math.max(0.6, power);
      S.combatFx.push({
        x: wx, y: wy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: cfg.life + Math.random() * 80, maxLife: cfg.life + 80,
        radius: cfg.radius * (0.6 + Math.random() * 0.7), color, type,
      });
    }
    S.combatFx.push({ x: wx, y: wy, life: cfg.life, maxLife: cfg.life, radius: cfg.radius, color, type, ring: true });
  },

  drawCombatFx(cx, cy) {
    if (!S.combatFx?.length) return;
    for (const fx of S.combatFx) {
      const alpha = Math.max(0, fx.life / fx.maxLife);
      const x = fx.x - cx, y = fx.y - cy;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color;
      ctx.fillStyle = fx.color;
      ctx.lineWidth = fx.type === "crit" ? 1.5 : 1;
      if (fx.ring) {
        const progress = 1 - alpha;
        ctx.beginPath();
        ctx.arc(x, y, fx.radius * (0.5 + progress * 1.4), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const length = fx.type === "crit" ? 3.8 : 2.8;
        const angle = Math.atan2(fx.vy || 0, fx.vx || 1);
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  drawBuffEffects(sx, sy, actor, actorW, actorH) {
    const buffs = actor?.buffs || {};
    const now = Date.now();
    const active = (key) => buffs[key] && (!buffs[key].expiresAt || Number(buffs[key].expiresAt) > now);
    const shield = active("shield") || active("buff_def") || active("buff_vitals");
    const attack = active("buff_atk") || active("buff_crit");
    const speed = active("buff_spd") || active("buff_cast");
    if (!shield && !attack && !speed) return;
    const pulse = 0.58 + Math.sin(now * 0.006) * 0.18;
    ctx.save();
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = pulse;
    if (shield) {
      ctx.strokeStyle = active("shield") ? "#72d7ff" : "#8fa8ff";
      ctx.beginPath();
      ctx.ellipse(sx, sy - actorH * 0.48, actorW * 0.68, actorH * 0.58, 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy - actorH * 0.46, actorW * 0.72, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    if (attack) {
      ctx.strokeStyle = active("buff_crit") ? "#ffd166" : "#ff8b55";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx + side * actorW * 0.58, sy - actorH * 0.62);
        ctx.lineTo(sx + side * actorW * 0.9, sy - actorH * 0.78);
        ctx.stroke();
      }
    }
    if (speed) {
      ctx.strokeStyle = active("buff_cast") ? "#c79bff" : "#8ff0ff";
      ctx.beginPath();
      ctx.moveTo(sx - actorW * 0.75, sy - actorH * 0.22);
      ctx.lineTo(sx - actorW * 1.12, sy - actorH * 0.22);
      ctx.moveTo(sx + actorW * 0.75, sy - actorH * 0.1);
      ctx.lineTo(sx + actorW * 1.08, sy - actorH * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  },

  floatSkill(wx, wy, name, color = "#ffd166") {
    if (!name) return;
    if (!S.floatingTexts) S.floatingTexts = [];
    S.floatingTexts.push({
      text: `✦ ${name}`,
      color,
      x: wx,
      y: wy - 16,
      life: 1100,
      maxLife: 1100,
      kind: "skill",
    });
  },

  // Helper để vẽ ảnh/sprite
  drawSprite(imgSource, x, y, w, h, frame = null) {
    if (!imgSource) return false;
    let img = S.imageCache?.[imgSource];
    if (!img) {
      if (!S.imageCache) S.imageCache = {};
      img = new Image();
      img.crossOrigin = "Anonymous"; // Cần thiết để xử lý Canvas pixel
      img.onload = () => {
        // Tự động xóa nền (checkerboard/trắng) khi ảnh tải xong
        S.imageCache[imgSource] = Render._removeBg(img);
      };
      img.hasError = false;
      img.onerror = () => { img.hasError = true; };
      img.src = imgSource;
      S.imageCache[imgSource] = img;
    }
    if (img.hasError) return false;
    if (img.isReady && img !== S.imageCache[imgSource]) {
       img = S.imageCache[imgSource];
    }
    // Canvas không có thuộc tính complete, dùng isReady
    if (img.isReady || (img.complete && img.naturalWidth > 0)) {
      const wDraw = img.naturalWidth || img.width;
      if (wDraw > 0) {
        const hDraw = img.naturalHeight || img.height;
        if (frame) {
          const cols = frame.cols || 1, rows = frame.rows || 1;
          const cellW = Math.floor(wDraw / cols), cellH = Math.floor(hDraw / rows);
          const sourceX = cellW * frame.col, sourceY = cellH * frame.row;
          const sourceW = frame.col === cols - 1 ? wDraw - sourceX : cellW;
          const sourceH = frame.row === rows - 1 ? hDraw - sourceY : cellH;
          ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, x - w / 2, y - h / 2 + 2, w, h);
        } else {
          ctx.drawImage(img, x - w / 2, y - h / 2 + 2, w, h);
        }
        return true;
      }
    }
    return true; // Đang tải
  },

  drawAnimatedImage(imgSource, x, y, w, h, action = "idle", actor = {}) {
    const now = Date.now();
    const moving = action === "walk";
    const speed = { idle: 260, walk: 120, attack: 90, hit: 110 }[action] || 180;
    const phase = now / speed;
    const swing = Math.sin(phase * Math.PI * 2);
    const bob = moving ? Math.abs(swing) * 0.7 : Math.sin(phase * 0.7) * 0.08;
    const tilt = action === "attack" ? swing * 0.08 : (moving ? swing * 0.025 : 0);
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(tilt);
    ctx.scale(1 + (action === "attack" ? 0.04 : 0), 1 - (action === "attack" ? 0.025 : 0));
    ctx.scale(actor.direction === "left" ? -1 : 1, 1);
    const drawn = this.drawSprite(imgSource, 0, 0, w, h);
    ctx.restore();
    return drawn;
  },

  // Thuật toán Flood Fill để xóa nền giả (checkerboard) của ảnh AI
  _removeBg(img) {
    const cvs = document.createElement("canvas");
    cvs.width = img.naturalWidth;
    cvs.height = img.naturalHeight;
    const ctxC = cvs.getContext("2d");
    ctxC.drawImage(img, 0, 0);
    const imgData = ctxC.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;
    
    // Lấy màu mẫu từ góc trên bên trái
    const bgR1 = data[0], bgG1 = data[1], bgB1 = data[2];
    // Lấy màu mẫu thứ 2 (dành cho checkerboard) cách vài pixel
    const bgR2 = data[16] || bgR1, bgG2 = data[17] || bgG1, bgB2 = data[18] || bgB1;
    
    const stack = [[0, 0], [cvs.width - 1, 0], [0, cvs.height - 1], [cvs.width - 1, cvs.height - 1]];
    const visited = new Uint8Array(cvs.width * cvs.height);
    const getIdx = (x, y) => (y * cvs.width + x) * 4;
    
    while(stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= cvs.width || y < 0 || y >= cvs.height) continue;
      
      const vIdx = y * cvs.width + x;
      if (visited[vIdx]) continue;
      visited[vIdx] = 1;
      
      const idx = getIdx(x, y);
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
      if (a === 0) continue;
      
      const match1 = Math.abs(r-bgR1) < 40 && Math.abs(g-bgG1) < 40 && Math.abs(b-bgB1) < 40;
      const match2 = Math.abs(r-bgR2) < 40 && Math.abs(g-bgG2) < 40 && Math.abs(b-bgB2) < 40;
      const isWhiteGrey = r > 150 && Math.abs(r-g) < 25 && Math.abs(g-b) < 25;
      
      if (match1 || match2 || isWhiteGrey) {
        data[idx+3] = 0; // Transparent
        stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
      }
    }
    
    ctxC.putImageData(imgData, 0, 0);
    // Trả về trực tiếp thẻ canvas để vẽ luôn, không cần khởi tạo lại Image
    cvs.isReady = true;
    return cvs;
  },
};
