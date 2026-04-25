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
    S.cam.x = lerp(S.cam.x, p.px - cW / 2, 0.18);
    S.cam.y = lerp(S.cam.y, p.py - cH / 2, 0.18);
    S.cam.x = Math.max(0, Math.min(S.mapW * CFG.TS - cW, S.cam.x));
    S.cam.y = Math.max(0, Math.min(S.mapH * CFG.TS - cH, S.cam.y));
    const cx = S.cam.x, cy = S.cam.y;
    ctx.clearRect(0, 0, cW, cH);
    const ts = CFG.TS,
      tx0 = Math.max(0, Math.floor(cx / ts)),
      ty0 = Math.max(0, Math.floor(cy / ts));
    const tx1 = Math.min(S.mapW - 1, tx0 + Math.ceil(cW / ts) + 1),
      ty1 = Math.min(S.mapH - 1, ty0 + Math.ceil(cH / ts) + 1);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++)
        Render.tile(S.tiles[ty][tx], tx * ts - cx, ty * ts - cy);
    for (const portal of S.portals)
      if (portal.tenMapDen) Render.portal(portal, cx, cy);
    for (const npc of S.npcs) Render.npc(npc, cx, cy);
    // Vẽ tất cả người chơi khác (Bỏ bộ lọc map để debug triệt để)
    for (const [, op] of otherPlayers) {
      Render.otherPlayer(op, cx, cy);
      // Vẽ text debug tọa độ ngay trên đầu người chơi khác
      ctx.fillStyle = "yellow";
      ctx.font = "10px Arial";
      ctx.fillText(`ID: ${op.id.slice(0,4)} | Map: ${op.mapCode} | Pos: ${Math.floor(op.px)},${Math.floor(op.py)}`, op.px - cx, op.py - cy - 45);
    }
    for (const m of S.monsters) if (!m.dead) Render.monster(m, cx, cy);
    const tint = p.root ? p.root.color : "#4488cc";
    Render.player(p.px - cx, p.py - cy, tint);

    // Debug info (tạm thời)
    ctx.fillStyle = "rgba(0,255,0,0.5)";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Map: ${S.mapCode} | Others: ${otherPlayers.size}`, 10, 20);

    ctx.fillStyle = tint;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.name, p.px - cx, p.py - cy - 32);
    for (const fx of S.atkFx) {
      ctx.strokeStyle = `rgba(255,200,60,${fx.life / 14})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.px - cx, fx.py - cy, fx.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Portal hint arrow
    if (Array.isArray(S.portals) && S.portals.length) {
      let nearest = null;
      let bestDist = Infinity;
      const centerX = cW / 2;
      const centerY = cH / 2;
      for (const portal of S.portals) {
        if (!portal.tenMapDen) continue;
        const px = portal.x * ts + ts / 2 - cx;
        const py = portal.y * ts + ts / 2 - cy;
        if (px >= -20 && px <= cW + 20 && py >= -20 && py <= cH + 20) continue;
        const dx = px - centerX;
        const dy = py - centerY;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          nearest = { portal, px, py, dx, dy };
        }
      }
      if (nearest) Render.portalHint(nearest, centerX, centerY, cW, cH);
    }
  },

  tile(t, sx, sy) {
    const c = TC[t] || ["#333", "#444"];
    ctx.fillStyle = c[0];
    ctx.fillRect(sx, sy, CFG.TS, CFG.TS);
    ctx.fillStyle = c[1];
    const ts = CFG.TS;
    if (t === T.GRASS) {
      ctx.fillRect(sx + 4, sy + 5, 2, 6);
      ctx.fillRect(sx + 10, sy + 7, 2, 5);
      ctx.fillRect(sx + 18, sy + 4, 2, 6);
      ctx.fillRect(sx + 26, sy + 8, 2, 4);
      ctx.fillRect(sx + 22, sy + 19, 2, 5);
      ctx.fillRect(sx + 8, sy + 21, 2, 4);
    } else if (t === T.WATER) {
      ctx.fillRect(sx + 2, sy + 7, 28, 3);
      ctx.fillRect(sx + 5, sy + 17, 22, 3);
      ctx.fillStyle = "#3a7acc";
      ctx.fillRect(sx, sy + 12, ts, 3);
    } else if (t === T.WALL) {
      ctx.fillRect(sx, sy, ts, 4);
      ctx.fillRect(sx + 8, sy + 4, 3, 10);
      ctx.fillRect(sx + 22, sy + 4, 3, 10);
      ctx.fillRect(sx, sy + 17, 8, ts - 17);
      ctx.fillRect(sx + 16, sy + 17, ts - 16, ts - 17);
      ctx.fillStyle = "#3a2828";
      ctx.fillRect(sx, sy, ts, 2);
    } else if (t === T.FLOOR || t === T.PLAZA) {
      ctx.globalAlpha = 0.3;
      ctx.fillRect(sx, sy, ts, 1);
      ctx.fillRect(sx, sy, 1, ts);
      ctx.fillRect(sx + 16, sy + 16, ts - 16, 1);
      ctx.fillRect(sx + 16, sy + 16, 1, ts - 16);
      ctx.globalAlpha = 1;
    } else if (t === T.TREE) {
      ctx.fillStyle = "#1a1208";
      ctx.fillRect(sx + 13, sy + 20, 6, 12);
      ctx.fillStyle = "#1e4a18";
      ctx.fillRect(sx + 6, sy + 8, 20, 16);
      ctx.fillRect(sx + 10, sy + 2, 12, 10);
      ctx.fillStyle = "#2a6820";
      ctx.fillRect(sx + 8, sy + 10, 5, 4);
    } else if (t === T.MTN) {
      ctx.fillStyle = "#505060";
      ctx.fillRect(sx + 2, sy + 18, 28, 14);
      ctx.fillStyle = "#686878";
      for (let i = 0; i < 14; i++)
        ctx.fillRect(
          sx + 7 + i,
          sy + 18 - Math.min(i, 13 - i) * 1.5,
          2,
          Math.min(i, 13 - i) * 1.5 + 3,
        );
      ctx.fillStyle = "#dde8ff";
      ctx.fillRect(sx + 12, sy + 5, 8, 5);
    } else if (t === T.STONE) {
      ctx.fillRect(sx + 3, sy + 8, 10, 8);
      ctx.fillRect(sx + 18, sy + 14, 8, 7);
    }
  },

  otherPlayer(op, cx, cy) {
    const sx = Math.floor(op.px - cx), sy = Math.floor(op.py - cy);
    if (sx < -50 || sx > cW + 50 || sy < -50 || sy > cH + 50) return;
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(sx - 8, sy + 8, 16, 4);
    ctx.fillStyle = "#2a4880";
    ctx.fillRect(sx - 6, sy - 10, 12, 18);
    ctx.fillStyle = "#3a68b0";
    ctx.fillRect(sx - 5, sy - 9, 10, 16);
    ctx.fillStyle = "#e8c080";
    ctx.fillRect(sx - 4, sy - 20, 8, 9);
    ctx.fillStyle = "#1a1010";
    ctx.fillRect(sx - 3, sy - 15, 2, 2);
    ctx.fillRect(sx + 1, sy - 15, 2, 2);
    ctx.fillStyle = "#88bbff";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(op.username || "?", sx, sy - 25);
    ctx.fillStyle = "rgba(0,0,0,.5)";
    const realmList = CFG.REALMS.length
      ? CFG.REALMS.map((r) => r.tenCanhGioi || r.name)
      : [];
    const rn = realmList[Math.min(op.realm || 0, realmList.length - 1)] || "";
    const rw = ctx.measureText(rn).width + 6;
    ctx.fillRect(sx - rw / 2, sy - 35, rw, 11);
    ctx.fillStyle = "#88bbff";
    ctx.font = "8px monospace";
    ctx.fillText(rn, sx, sy - 26);
  },

  player(sx, sy, tint) {
    const x = Math.floor(sx - 9), y = Math.floor(sy - 28);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(x + 1, y + 26, 18, 4);
    ctx.fillStyle = "#1a2848";
    ctx.fillRect(x + 3, y + 12, 14, 16);
    ctx.fillStyle = "#22366a";
    ctx.fillRect(x + 4, y + 13, 12, 13);
    ctx.fillStyle = tint;
    ctx.fillRect(x + 3, y + 12, 14, 2);
    ctx.fillRect(x + 3, y + 12, 2, 16);
    ctx.fillRect(x + 15, y + 12, 2, 16);
    ctx.fillStyle = "#e8c080";
    ctx.fillRect(x + 5, y + 3, 10, 8);
    ctx.fillStyle = "#221408";
    ctx.fillRect(x + 5, y + 3, 10, 4);
    ctx.fillRect(x + 4, y + 1, 3, 3);
    ctx.fillRect(x + 13, y + 2, 3, 3);
    ctx.fillStyle = tint;
    ctx.fillRect(x + 6, y + 0, 8, 3);
    ctx.fillStyle = "#1a1010";
    ctx.fillRect(x + 6, y + 7, 2, 2);
    ctx.fillRect(x + 11, y + 7, 2, 2);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fillRect(x + 7, y + 7, 1, 1);
    ctx.fillRect(x + 12, y + 7, 1, 1);
    ctx.fillStyle = "#101828";
    if (S.animF) {
      ctx.fillRect(x + 4, y + 24, 5, 8);
      ctx.fillRect(x + 11, y + 28, 5, 4);
    } else {
      ctx.fillRect(x + 4, y + 24, 5, 8);
      ctx.fillRect(x + 11, y + 24, 5, 8);
    }
    ctx.fillStyle = "#c8c8d0";
    ctx.fillRect(x + 18, y + 8, 2, 16);
    ctx.fillStyle = "#7a5018";
    ctx.fillRect(x + 17, y + 16, 5, 4);
    ctx.fillStyle = tint;
    ctx.fillRect(x + 18, y + 8, 2, 5);
  },

  monster(m, cx, cy) {
    const sx = m.px - cx, sy = m.py - cy;
    if (sx < -50 || sx > cW + 50 || sy < -50 || sy > cH + 50) return;
    const c = m?.color;
    const x = Math.floor(sx - 14), y = Math.floor(sy - 22);
    const ti = m.ti;
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(x + 2, y + 22, 24, 4);
    if (ti === 0) {
      ctx.fillStyle = c; ctx.fillRect(x + 2, y + 8, 22, 12); ctx.fillRect(x + 4, y + 4, 9, 7);
      ctx.fillRect(x + 2, y + 20, 5, 8); ctx.fillRect(x + 10, y + 20, 5, 8); ctx.fillRect(x + 19, y + 20, 5, 6);
      ctx.fillStyle = "#aa1111"; ctx.fillRect(x + 5, y + 7, 3, 2);
      ctx.fillStyle = "#111"; ctx.fillRect(x + 6, y + 6, 2, 2); ctx.fillRect(x + 10, y + 6, 2, 2);
    } else if (ti === 1) {
      ctx.fillStyle = c; ctx.fillRect(x + 4, y + 8, 18, 12); ctx.fillRect(x + 6, y + 2, 10, 8);
      ctx.fillRect(x + 2, y + 0, 4, 5); ctx.fillRect(x + 20, y + 0, 4, 5);
      ctx.fillRect(x + 4, y + 20, 5, 8); ctx.fillRect(x + 17, y + 20, 5, 8);
      ctx.fillStyle = "#ffeedd"; ctx.fillRect(x + 9, y + 4, 6, 4);
      ctx.fillStyle = "#111"; ctx.fillRect(x + 10, y + 5, 2, 2); ctx.fillRect(x + 14, y + 5, 2, 2);
    } else if (ti === 2) {
      ctx.fillStyle = c; ctx.fillRect(x + 2, y + 8, 24, 14); ctx.fillRect(x + 4, y + 4, 10, 7);
      ctx.fillRect(x + 2, y + 22, 6, 6); ctx.fillRect(x + 18, y + 22, 6, 6);
      ctx.fillStyle = "#fff"; ctx.fillRect(x + 2, y + 14, 3, 3);
      ctx.fillStyle = "#111"; ctx.fillRect(x + 6, y + 7, 2, 2); ctx.fillRect(x + 11, y + 7, 2, 2);
    } else if (ti === 3) {
      ctx.fillStyle = c; ctx.fillRect(x + 6, y + 4, 16, 10); ctx.fillRect(x + 4, y + 10, 20, 14); ctx.fillRect(x + 10, y + 0, 8, 6);
      ctx.fillStyle = "#ffd700"; ctx.fillRect(x + 11, y + 1, 3, 2); ctx.fillRect(x + 16, y + 1, 3, 2);
      ctx.fillStyle = "#111"; ctx.fillRect(x + 12, y + 2, 2, 2); ctx.fillRect(x + 16, y + 2, 2, 2);
    } else if (ti === 4) {
      ctx.fillStyle = c; ctx.fillRect(x + 3, y + 6, 22, 18); ctx.fillRect(x + 6, y + 2, 16, 7);
      ctx.fillRect(x + 0, y + 12, 5, 10); ctx.fillRect(x + 23, y + 12, 5, 10);
      ctx.fillStyle = "#7a7a8a"; ctx.fillRect(x + 8, y + 8, 6, 5); ctx.fillRect(x + 16, y + 8, 6, 5);
      ctx.fillStyle = "#ff2200"; ctx.fillRect(x + 9, y + 9, 4, 3); ctx.fillRect(x + 17, y + 9, 4, 3);
    } else if (ti === 5) {
      ctx.fillStyle = c; ctx.fillRect(x + 4, y + 6, 20, 18); ctx.fillRect(x + 7, y + 0, 14, 8);
      ctx.fillRect(x + 3, y + 22, 6, 8); ctx.fillRect(x + 18, y + 22, 6, 8);
      ctx.fillStyle = "#ff3333"; ctx.fillRect(x + 8, y + 3, 4, 3); ctx.fillRect(x + 16, y + 3, 4, 3);
      ctx.fillStyle = "#cc2222"; ctx.fillRect(x + 4, y + 6, 20, 3);
    } else {
      ctx.fillStyle = c; ctx.fillRect(x + 2, y + 6, 24, 14); ctx.fillRect(x + 5, y + 2, 12, 7);
      ctx.fillRect(x + 2, y + 20, 7, 8); ctx.fillRect(x + 18, y + 20, 7, 8);
      ctx.fillStyle = "#3344aa"; ctx.fillRect(x + 6, y + 4, 3, 3); ctx.fillRect(x + 13, y + 4, 3, 3);
      ctx.fillStyle = `rgba(100,120,255,${0.3 + 0.1 * Math.sin(S.animT * 0.005)})`;
      ctx.fillRect(x, y + 4, 28, 18);
    }
    if (m.hp < m.maxHp) {
      ctx.fillStyle = "#111";
      ctx.fillRect(sx - 14, sy - 34, 28, 5);
      ctx.fillStyle = "#cc2222";
      ctx.fillRect(sx - 14, sy - 34, Math.floor((28 * m.hp) / m.maxHp), 5);
    }
    if (m.state === "chase") {
      ctx.fillStyle = "#ff4444";
      ctx.beginPath(); ctx.arc(sx, sy - 38, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#ffaa44";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(m.name, sx, sy - 38);
  },

  npc(npc, cx, cy) {
    const sx = Math.floor(npc.px - cx), sy = Math.floor(npc.py - cy);
    if (sx < -50 || sx > cW + 50 || sy < -50 || sy > cH + 50) return;
    const col = npc.color || "#88aacc";
    if (npc.type === "chest") {
      if (npc.used) {
        ctx.fillStyle = "#3a2810"; ctx.fillRect(sx - 10, sy - 8, 20, 14);
        ctx.fillStyle = "#5a4020"; ctx.fillRect(sx - 8, sy - 6, 16, 10);
        ctx.fillStyle = "#88aa88"; ctx.font = "8px monospace"; ctx.textAlign = "center";
        ctx.fillText("(trống)", sx, sy + 12); return;
      }
      ctx.fillStyle = "#5a3010"; ctx.fillRect(sx - 12, sy - 10, 24, 16);
      ctx.fillStyle = "#8a5020"; ctx.fillRect(sx - 10, sy - 8, 20, 12);
      ctx.fillStyle = "#c8a84b"; ctx.fillRect(sx - 12, sy - 10, 24, 4); ctx.fillRect(sx - 2, sy - 10, 4, 4);
      const aa = 0.3 + 0.2 * Math.sin(S.animT * 0.003);
      ctx.fillStyle = `rgba(200,168,75,${aa})`; ctx.fillRect(sx - 14, sy - 12, 28, 20);
      ctx.fillStyle = "#ffdd44"; ctx.font = "9px monospace"; ctx.textAlign = "center";
      ctx.fillText(npc.name, sx, sy - 16); return;
    }
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(sx - 7, sy + 8, 14, 4);
    ctx.fillStyle = col; ctx.fillRect(sx - 6, sy - 10, 12, 20);
    ctx.fillStyle = "#ffffff22"; ctx.fillRect(sx - 5, sy - 9, 10, 18);
    ctx.fillStyle = "#e8c080"; ctx.fillRect(sx - 5, sy - 20, 10, 9);
    ctx.fillStyle = "#221408"; ctx.fillRect(sx - 5, sy - 20, 10, 4);
    ctx.fillStyle = "#111"; ctx.fillRect(sx - 3, sy - 15, 2, 2); ctx.fillRect(sx + 1, sy - 15, 2, 2);
    ctx.fillStyle = "rgba(0,0,0,.6)";
    const nw = ctx.measureText(npc.name).width + 8;
    ctx.fillRect(sx - nw / 2, sy - 30, nw, 12);
    ctx.fillStyle = col; ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText(npc.name, sx, sy - 21);
    if (dist(S.player.px, S.player.py, npc.px, npc.py) < CFG.TS * 1.6) {
      ctx.fillStyle = "rgba(200,168,75,.9)"; ctx.font = "9px monospace";
      ctx.fillText("[F]", sx, sy - 38);
    }
  },

  portal(portal, cx, cy) {
    const sx = portal.x * CFG.TS + CFG.TS / 2 - cx,
      sy = portal.y * CFG.TS + CFG.TS / 2 - cy;
    const a = S.animT * 0.002;
    const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 20);
    grad.addColorStop(0, `rgba(100,180,255,${0.4 + 0.2 * Math.sin(a)})`);
    grad.addColorStop(1, "rgba(100,180,255,0)");
    ctx.fillStyle = grad; ctx.fillRect(sx - 22, sy - 22, 44, 44);
    ctx.strokeStyle = `rgba(120,200,255,${0.6 + 0.3 * Math.sin(a)})`;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.stroke();
    if (portal.tenMapDen) {
      ctx.fillStyle = "rgba(0,0,0,.7)";
      const lw = ctx.measureText(portal.tenMapDen).width + 10;
      ctx.fillRect(sx - lw / 2, sy - 36, lw, 13);
      ctx.fillStyle = "#88ddff"; ctx.font = "9px monospace"; ctx.textAlign = "center";
      ctx.fillText(portal.tenMapDen, sx, sy - 26);
    }
  },

  portalHint(nearest, centerX, centerY, cW, cH) {
    const { portal, dx, dy } = nearest;
    const margin = 24;
    let edgeX = centerX, edgeY = centerY;
    const candidates = [];
    if (dx !== 0) {
      const tx = dx > 0 ? (cW - margin - centerX) / dx : (margin - centerX) / dx;
      const yAtTx = centerY + dy * tx;
      if (tx > 0 && yAtTx >= margin && yAtTx <= cH - margin)
        candidates.push({ x: centerX + dx * tx, y: yAtTx, t: tx });
    }
    if (dy !== 0) {
      const ty = dy > 0 ? (cH - margin - centerY) / dy : (margin - centerY) / dy;
      const xAtTy = centerX + dx * ty;
      if (ty > 0 && xAtTy >= margin && xAtTy <= cW - margin)
        candidates.push({ x: xAtTy, y: centerY + dy * ty, t: ty });
    }
    if (candidates.length) {
      candidates.sort((a, b) => a.t - b.t);
      edgeX = candidates[0].x;
      edgeY = candidates[0].y;
    } else {
      edgeX = Math.min(cW - margin, Math.max(margin, centerX + Math.sign(dx) * (cW / 2 - margin)));
      edgeY = Math.min(cH - margin, Math.max(margin, centerY + Math.sign(dy) * (cH / 2 - margin)));
    }
    const isLeft = edgeX <= margin + 0.5, isRight = edgeX >= cW - margin - 0.5;
    const isTop = edgeY <= margin + 0.5, isBottom = edgeY >= cH - margin - 0.5;
    ctx.fillStyle = "rgba(120,200,255,0.95)";
    ctx.beginPath();
    if (isLeft) { ctx.moveTo(edgeX, edgeY); ctx.lineTo(edgeX + 14, edgeY - 10); ctx.lineTo(edgeX + 14, edgeY + 10); }
    else if (isRight) { ctx.moveTo(edgeX, edgeY); ctx.lineTo(edgeX - 14, edgeY - 10); ctx.lineTo(edgeX - 14, edgeY + 10); }
    else if (isTop) { ctx.moveTo(edgeX, edgeY); ctx.lineTo(edgeX - 10, edgeY + 14); ctx.lineTo(edgeX + 10, edgeY + 14); }
    else { ctx.moveTo(edgeX, edgeY); ctx.lineTo(edgeX - 10, edgeY - 14); ctx.lineTo(edgeX + 10, edgeY - 14); }
    ctx.closePath(); ctx.fill();
    const label = portal.tenMapDen || portal.denMap || "Cổng";
    let text = `→ ${label}`, textX = edgeX, textY = edgeY + 24;
    if (isLeft) { text = `→ ${label}`; textX = edgeX + 20; textY = edgeY + 4; }
    else if (isRight) { text = `${label} ←`; textX = edgeX - 20; textY = edgeY + 4; }
    else if (isTop) { text = `↓ ${label}`; textY = edgeY + 20; }
    else if (isBottom) { text = `↑ ${label}`; textY = edgeY - 14; }
    ctx.font = "10px monospace"; ctx.textAlign = "center";
    const tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(textX - tw / 2, textY - 10, tw, 18);
    ctx.fillStyle = "#a8e3ff"; ctx.fillText(text, textX, textY + 4);
  },

  floatDmg(wx, wy, offY, text, color) {
    const area = document.getElementById("canvas-area").getBoundingClientRect();
    const sx = wx - S.cam.x + area.left,
      sy = wy - S.cam.y + offY + area.top;
    const d = document.createElement("div");
    d.className = "dmg-float";
    d.textContent = text;
    d.style.cssText = `left:${sx}px;top:${sy}px;color:${color}`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 900);
  },
};
