"use strict";
// ════════════════════════════════════════════════════════════
// render.js — §12 Render Module + Tile Color Table
// ════════════════════════════════════════════════════════════

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

const Render = {
  frame() {
    const p = S.player;
    if (!p) return;
    
    const ts = CFG.TS, ds = CFG.DS;
    const lcW = cW / ds, lcH = cH / ds; // Logical Canvas Size
    
    // Giảm lerp xuống 0.12 để camera mượt hơn, tránh giật khi nhân vật di chuyển nhanh
    S.cam.x = lerp(S.cam.x, p.px - lcW / 2, 0.12);
    S.cam.y = lerp(S.cam.y, p.py - lcH / 2, 0.12);
    S.cam.x = Math.max(0, Math.min(S.mapW * ts - lcW, S.cam.x));
    S.cam.y = Math.max(0, Math.min(S.mapH * ts - lcH, S.cam.y));
    
    const cx = S.cam.x, cy = S.cam.y;
    ctx.clearRect(0, 0, cW, cH);
    
    ctx.save();
    ctx.scale(ds, ds);
    
    const tx0 = Math.max(0, Math.floor(cx / ts)),
          ty0 = Math.max(0, Math.floor(cy / ts));
    const tx1 = Math.min(S.mapW - 1, tx0 + Math.ceil(lcW / ts) + 1),
          ty1 = Math.min(S.mapH - 1, ty0 + Math.ceil(lcH / ts) + 1);
          
    // Draw tiles
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (S.tiles[ty] && S.tiles[ty][tx] !== undefined) {
          Render.tile(S.tiles[ty][tx], tx * ts - cx, ty * ts - cy);
        }
      }
    }
    
    // Draw entities
    for (const portal of S.portals) if (portal.tenMapDen) Render.portal(portal, cx, cy);
    for (const npc of S.npcs) Render.npc(npc, cx, cy);
    for (const [, op] of otherPlayers) Render.otherPlayer(op, cx, cy);
    for (const m of S.monsters) if (!m.dead) Render.monster(m, cx, cy);
    
    const tint = p.root ? p.root.color : "#4488cc";
    Render.player(p.px - cx, p.py - cy, tint);

    // Names & FX
    ctx.fillStyle = tint;
    ctx.font = "7px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.name, p.px - cx, p.py - cy - 10);
    
    for (const fx of S.atkFx) {
      ctx.strokeStyle = `rgba(255,200,60,${fx.life / 14})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx.px - cx, fx.py - cy, fx.r / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Portal hint
    if (Array.isArray(S.portals) && S.portals.length) {
      let nearest = null, bestDist = Infinity;
      const centerX = lcW / 2, centerY = lcH / 2;
      for (const portal of S.portals) {
        if (!portal.tenMapDen) continue;
        const px = portal.x * ts + ts / 2 - cx, py = portal.y * ts + ts / 2 - cy;
        if (px >= -20 && px <= lcW + 20 && py >= -20 && py <= lcH + 20) continue;
        const d = Math.pow(px - centerX, 2) + Math.pow(py - centerY, 2);
        if (d < bestDist) { bestDist = d; nearest = { portal, px, py, dx: px - centerX, dy: py - centerY }; }
      }
      if (nearest) Render.portalHint(nearest, centerX, centerY, lcW, lcH);
    }
    ctx.restore();
  },

  tile(t, sx, sy) {
    const c = TC[t] || ["#333", "#444"];
    const ts = CFG.TS;
    const fsx = Math.floor(sx), fsy = Math.floor(sy);
    
    ctx.fillStyle = c[0];
    ctx.fillRect(fsx, fsy, ts, ts);
    
    // Vẽ chi tiết pixel cho từng loại tile (8x8 style)
    ctx.fillStyle = c[1];
    if (t === 0) { // GRASS
      ctx.fillRect(fsx + 2, fsy + 2, 1, 1);
      ctx.fillRect(fsx + 5, fsy + 4, 1, 1);
    } else if (t === 2) { // WATER
      ctx.globalAlpha = 0.5;
      ctx.fillRect(fsx, fsy + 3, ts, 1);
      ctx.fillRect(fsx, fsy + 6, ts, 1);
      ctx.globalAlpha = 1;
    } else if (t === 3) { // WALL
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(fsx, fsy, ts, 1);
      ctx.fillRect(fsx, fsy, 1, ts);
    } else if (t === 5) { // TREE
      ctx.fillStyle = "#1a1208"; // Thân
      ctx.fillRect(fsx + 3, fsy + 5, 2, 3);
      ctx.fillStyle = "#1e4a18"; // Lá
      ctx.fillRect(fsx + 2, fsy + 1, 4, 4);
    } else if (t === 6) { // MTN
      ctx.beginPath();
      ctx.moveTo(fsx, fsy + ts);
      ctx.lineTo(fsx + 4, fsy + 1);
      ctx.lineTo(fsx + ts, fsy + ts);
      ctx.fill();
    } else if (t === 1) { // STONE
      ctx.fillRect(fsx + 2, fsy + 3, 4, 3);
    }
  },

  player(sx, sy, tint) {
    const x = sx - 4, y = sy - 7;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(x + 1, y + 7, 6, 2);
    ctx.fillStyle = "#1a2848";
    ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, 8, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 2, y + 3, 1, 1);
    ctx.fillRect(x + 5, y + 3, 1, 1);
  },

  otherPlayer(op, cx, cy) {
    const sx = op.px - cx, sy = op.py - cy;
    if (sx < -20 || sx > (cW/CFG.DS) + 20 || sy < -20 || sy > (cH/CFG.DS) + 20) return;
    this.player(sx, sy, op.color || "#888");
    ctx.fillStyle = "#fff";
    ctx.font = "7px monospace";
    ctx.textAlign = "center";
    ctx.fillText(op.name || "Tu sĩ", sx, sy - 10);
  },

  monster(m, cx, cy) {
    const sx = m.px - cx, sy = m.py - cy;
    if (sx < -20 || sx > (cW/CFG.DS) + 20 || sy < -20 || sy > (cH/CFG.DS) + 20) return;
    const x = sx - 4, y = sy - 4;
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(x, y + 6, 8, 2);
    ctx.fillStyle = m.color || "#aa1111";
    ctx.fillRect(x, y, 8, 6);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 1, y + 1, 2, 2);
    ctx.fillRect(x + 5, y + 1, 2, 2);
    
    if (m.hp < m.maxHp) {
      ctx.fillStyle = "#111"; ctx.fillRect(sx - 10, sy - 14, 20, 3);
      ctx.fillStyle = "#cc2222"; ctx.fillRect(sx - 10, sy - 14, (20 * m.hp) / m.maxHp, 3);
    }
  },

  npc(npc, cx, cy) {
    const sx = npc.px - cx, sy = npc.py - cy;
    if (sx < -50 || sx > (cW/CFG.DS) + 50 || sy < -50 || sy > (cH/CFG.DS) + 50) return;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(sx - 4, sy + 4, 8, 2);
    ctx.fillStyle = npc.color || "#88aacc"; ctx.fillRect(sx - 4, sy - 4, 8, 8);
    ctx.fillStyle = "#fff"; ctx.font = "7px monospace"; ctx.textAlign = "center";
    ctx.fillText(npc.name, sx, sy - 12);
  },

  portal(portal, cx, cy) {
    const sx = portal.x * CFG.TS + CFG.TS / 2 - cx, sy = portal.y * CFG.TS + CFG.TS / 2 - cy;
    const a = S.animT * 0.002;
    ctx.fillStyle = `rgba(100,180,255,${0.3 + 0.1 * Math.sin(a)})`;
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#88ddff"; ctx.lineWidth = 1; ctx.stroke();
  },

  portalHint(nearest, centerX, centerY, cW, cH) {
    const { dx, dy, portal } = nearest;
    const margin = 20;
    const edgeX = Math.min(cW - margin, Math.max(margin, centerX + dx));
    const edgeY = Math.min(cH - margin, Math.max(margin, centerY + dy));
    ctx.fillStyle = "rgba(120,200,255,0.8)";
    ctx.beginPath(); ctx.arc(edgeX, edgeY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText(portal.tenMapDen || "Cổng", edgeX, edgeY - 10);
  },

  floatDmg(wx, wy, offY, text, color) {
    const area = document.getElementById("canvas-area").getBoundingClientRect();
    const sx = wx - S.cam.x + area.left, sy = wy - S.cam.y + offY + area.top;
    const d = document.createElement("div");
    d.className = "dmg-float"; d.textContent = text;
    d.style.cssText = `left:${sx}px;top:${sy}px;color:${color};position:absolute;pointer-events:none;z-index:100;font-weight:bold;`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 900);
  },
};
