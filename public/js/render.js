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

    // KPAH Name Tags & HP Bar
    ctx.font = "bold 6px monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 1;

    // Vẽ tên người chơi
    ctx.strokeStyle = "#000"; ctx.strokeText(p.name, p.px - cx, p.py - cy - 14);
    ctx.fillStyle = tint; ctx.fillText(p.name, p.px - cx, p.py - cy - 14);

    // Vẽ thanh máu mini cho người chơi
    const pw = 12;
    ctx.fillStyle = "#111"; ctx.fillRect(p.px - cx - pw/2, p.py - cy - 12, pw, 2);
    ctx.fillStyle = "#cc2222"; ctx.fillRect(p.px - cx - pw/2, p.py - cy - 12, pw * (Math.max(0, p.hp)/Math.max(1, p.maxHp)), 2);

    for (const fx of S.atkFx) {
      ctx.strokeStyle = `rgba(255,200,60,${fx.life / 14})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx.px - cx, fx.py - cy, fx.r / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Vẽ KPAH Floating Damage Text
    ctx.font = "bold 8px monospace";
    for (const ft of S.floatingTexts) {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.strokeText(ft.text, ft.x - cx, ft.y - cy);
      ctx.fillStyle = ft.color.replace(')', `,${alpha})`).replace('rgb', 'rgba').replace(/#([0-9a-fA-F]{6})/, (m, c) => `rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${alpha})`);
      ctx.fillText(ft.text, ft.x - cx, ft.y - cy);
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
      ctx.globalAlpha = 1.0;
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
    const p = S.player;
    const defaultImg = p.gender === "FEMALE" ? "./assets/char_female.png" : "./assets/char_male.png";
    const imgToDraw = p.img || defaultImg;
    
    // Nếu đạo hữu muốn dùng ảnh và tải thành công:
    if (imgToDraw) {
      // Giảm size xuống 20 theo yêu cầu
      const drawn = this.drawSprite(imgToDraw, sx, sy, 20, 20);
      if (drawn) return;
    }

    const x = sx - 4, y = sy - 8;
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

    let useSprite = false;
    if (m.img) {
      // Giảm size quái
      useSprite = this.drawSprite(m.img, sx, sy, m.size || 16, m.size || 16);
    }
    
    if (!useSprite) {
      const x = sx - 5, y = sy - 5;
      const wave = Math.sin(S.animT * 0.005) * 1;
      
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
      ctx.roundRect(x, y + wave, 10, 8, 2);
      ctx.fill();
      
      // Mắt quái (Sáng lên)
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 2, y + 2 + wave, 2, 2);
      ctx.fillRect(x + 6, y + 2 + wave, 2, 2);
      ctx.fillStyle = "#f00";
      ctx.fillRect(x + 2.5, y + 2.5 + wave, 1, 1);
      ctx.fillRect(x + 6.5, y + 2.5 + wave, 1, 1);
    }
    
    if (m.hp < m.maxHp && m.hp > 0) {
      const maxHp = Math.max(1, m.maxHp || 100);
      const hp = Math.max(0, m.hp || 0);
      ctx.fillStyle = "#111"; ctx.fillRect(sx - 10, sy - 14, 20, 3);
      ctx.fillStyle = "#cc2222"; ctx.fillRect(sx - 10, sy - 14, (20 * hp) / maxHp, 3);
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
    ctx.fillStyle = `rgba(100,200,255,${0.3 + 0.1 * Math.sin(a)})`;
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
  },

  portalHint(nearest, centerX, centerY, cW, cH) {
    const { dx, dy, portal } = nearest;
    const margin = 20;
    const edgeX = Math.min(cW - margin, Math.max(margin, centerX + dx));
    const edgeY = Math.min(cH - margin, Math.max(margin, centerY + dy));
    ctx.fillStyle = "rgba(100,200,255,0.8)";
    ctx.beginPath(); ctx.arc(edgeX, edgeY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = "8px monospace"; ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(portal.tenMapDen || "Cổng", edgeX, edgeY - 10);
  },

  floatDmg(wx, wy, offY, text, color) {
    if (!S.floatingTexts) S.floatingTexts = [];
    S.floatingTexts.push({
      text: text,
      color: color,
      x: wx + Math.random() * 8 - 4,
      y: wy + offY,
      life: 800, // ms
      maxLife: 800
    });
  },

  // Helper để vẽ ảnh/sprite
  drawSprite(imgSource, x, y, w, h) {
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
        ctx.drawImage(img, x - w / 2, y - h / 2 + 2, w, h);
        return true;
      }
    }
    return true; // Đang tải
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
