const Render = {
  frame() {
    const p = GameState.player;
    if (!p) return;
    GameState.cam.x = lerp(GameState.cam.x, p.px - cW / 2, 0.18);
    GameState.cam.y = lerp(GameState.cam.y, p.py - cH / 2, 0.18);
    GameState.cam.x = Math.max(
      0,
      Math.min(GameState.mapW * GameState.TS - cW, GameState.cam.x),
    );
    GameState.cam.y = Math.max(
      0,
      Math.min(GameState.mapH * GameState.TS - cH, GameState.cam.y),
    );
    const cx = GameState.cam.x,
      cy = GameState.cam.y;
    ctx.clearRect(0, 0, cW, cH);
    const ts = GameState.TS,
      tx0 = Math.max(0, Math.floor(cx / ts)),
      ty0 = Math.max(0, Math.floor(cy / ts));
    const tx1 = Math.min(GameState.mapW - 1, tx0 + Math.ceil(cW / ts) + 1),
      ty1 = Math.min(GameState.mapH - 1, ty0 + Math.ceil(cH / ts) + 1);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++)
        Render.tile(GameState.tiles[ty][tx], tx * ts - cx, ty * ts - cy);
    for (const portal of GameState.portals)
      if (portal.label) Render.portal(portal, cx, cy);
    for (const npc of GameState.npcs) Render.npc(npc, cx, cy);
    // Other players (co-op)
    for (const [, op] of otherPlayers)
      if (op.mapId === GameState.mapId) Render.otherPlayer(op, cx, cy);
    for (const m of GameState.monsters)
      if (!m.dead) Render.monster(m, GameState.player.px, GameState.player.py);
    const tint = p.root ? p.root.color : "#4488cc";
    Render.player(p.px - cx, p.py - cy, tint);
    ctx.fillStyle = tint;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.name, p.px - cx, p.py - cy - 32);
    for (const fx of GameState.atkFx) {
      ctx.strokeStyle = `rgba(255,200,60,${fx.life / 14})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.px - cx, fx.py - cy, fx.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  tile(t, sx, sy) {
    const c = TC[t] || ["#333", "#444"];
    ctx.fillStyle = c[0];
    ctx.fillRect(sx, sy, GameState.TS, GameState.TS);
    ctx.fillStyle = c[1];
    const ts = GameState.TS;
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
    const sx = Math.floor(op.px - cx),
      sy = Math.floor(op.py - cy);
    if (sx < -50 || sx > cW + 50 || sy < -50 || sy > cH + 50) return;
    // Simple other player sprite
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
    // Name above
    ctx.fillStyle = "#88bbff";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(op.username || "?", sx, sy - 25);
    // Realm badge
    ctx.fillStyle = "rgba(0,0,0,.5)";
    const rn = GameState.REALMS[Math.min(op.realm || 0, 11)];
    const rw = ctx.measureText(rn).width + 6;
    ctx.fillRect(sx - rw / 2, sy - 35, rw, 11);
    ctx.fillStyle = "#88bbff";
    ctx.font = "8px monospace";
    ctx.fillText(rn, sx, sy - 26);
  },
  player(sx, sy, tint) {
    const x = Math.floor(sx - 9),
      y = Math.floor(sy - 28);
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
    if (GameState.animF) {
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
    // const sx = m.px - cx,
    //   sy = m.py - cy;
    // if (sx < -50 || sx > cW + 50 || sy < -50 || sy > cH + 50) return;

    const c = "#7a3a1a";

    const ti = m.code;
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(cx + 2, cy + 22, 24, 4);
    if (ti === "yeu_ho") {
      ctx.fillStyle = c;
      ctx.fillRect(cx + 2, cy + 8, 22, 12);
      ctx.fillRect(cx + 4, cy + 4, 9, 7);
      ctx.fillRect(cx + 2, cy + 20, 5, 8);
      ctx.fillRect(cx + 10, cy + 20, 5, 8);
      ctx.fillRect(cx + 19, cy + 20, 5, 6);
      ctx.fillStyle = "#aa1111";
      ctx.fillRect(cx + 5, cy + 7, 3, 2);
      ctx.fillStyle = "#111";
      ctx.fillRect(cx + 6, cy + 6, 2, 2);
      ctx.fillRect(cx + 10, cy + 6, 2, 2);
    } else if (ti === 1) {
      ctx.fillStyle = c;
      ctx.fillRect(cx + 4, cy + 8, 18, 12);
      ctx.fillRect(cx + 6, cy + 2, 10, 8);
      ctx.fillRect(cx + 2, cy + 0, 4, 5);
      ctx.fillRect(cx + 20, cy + 0, 4, 5);
      ctx.fillRect(cx + 4, cy + 20, 5, 8);
      ctx.fillRect(cx + 17, cy + 20, 5, 8);
      ctx.fillStyle = "#ffeedd";
      ctx.fillRect(cx + 9, cy + 4, 6, 4);
      ctx.fillStyle = "#111";
      ctx.fillRect(cx + 10, cy + 5, 2, 2);
      ctx.fillRect(cx + 14, cy + 5, 2, 2);
    } else if (ti === 2) {
      ctx.fillStyle = c;
      ctx.fillRect(cx + 2, cy + 8, 24, 14);
      ctx.fillRect(cx + 4, cy + 4, 10, 7);
      ctx.fillRect(cx + 2, cy + 22, 6, 6);
      ctx.fillRect(cx + 18, cy + 22, 6, 6);
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx + 2, cy + 14, 3, 3);
      ctx.fillStyle = "#111";
      ctx.fillRect(cx + 6, cy + 7, 2, 2);
      ctx.fillRect(cx + 11, cy + 7, 2, 2);
    } else if (ti === 3) {
      ctx.fillStyle = c;
      ctx.fillRect(cx + 6, cy + 4, 16, 10);
      ctx.fillRect(cx + 4, cy + 10, 20, 14);
      ctx.fillRect(cx + 10, cy + 0, 8, 6);
      ctx.fillStyle = "#ffd700";
      ctx.fillRect(cx + 11, cy + 1, 3, 2);
      ctx.fillRect(cx + 16, cy + 1, 3, 2);
      ctx.fillStyle = "#111";
      ctx.fillRect(cx + 12, cy + 2, 2, 2);
      ctx.fillRect(cx + 16, cy + 2, 2, 2);
    } else if (ti === 4) {
      ctx.fillStyle = c;
      ctx.fillRect(cx + 3, cy + 6, 22, 18);
      ctx.fillRect(cx + 6, cy + 2, 16, 7);
      ctx.fillRect(cx + 0, cy + 12, 5, 10);
      ctx.fillRect(cx + 23, cy + 12, 5, 10);
      ctx.fillStyle = "#7a7a8a";
      ctx.fillRect(cx + 8, cy + 8, 6, 5);
      ctx.fillRect(cx + 16, cy + 8, 6, 5);
      ctx.fillStyle = "#ff2200";
      ctx.fillRect(cx + 9, cy + 9, 4, 3);
      ctx.fillRect(cx + 17, cy + 9, 4, 3);
    } else if (ti === 5) {
      ctx.fillStyle = c;
      ctx.fillRect(cx + 4, cy + 6, 20, 18);
      ctx.fillRect(cx + 7, cy + 0, 14, 8);
      ctx.fillRect(cx + 3, cy + 22, 6, 8);
      ctx.fillRect(cx + 18, cy + 22, 6, 8);
      ctx.fillStyle = "#ff3333";
      ctx.fillRect(cx + 8, cy + 3, 4, 3);
      ctx.fillRect(cx + 16, cy + 3, 4, 3);
      ctx.fillStyle = "#cc2222";
      ctx.fillRect(cx + 4, cy + 6, 20, 3);
    } else {
      ctx.fillStyle = c;
      ctx.fillRect(cx + 2, cy + 6, 24, 14);
      ctx.fillRect(cx + 5, cy + 2, 12, 7);
      ctx.fillRect(cx + 2, cy + 20, 7, 8);
      ctx.fillRect(cx + 18, cy + 20, 7, 8);
      ctx.fillStyle = "#3344aa";
      ctx.fillRect(cx + 6, cy + 4, 3, 3);
      ctx.fillRect(cx + 13, cy + 4, 3, 3);
      ctx.fillStyle = `rgba(100,120,255,${0.3 + 0.1 * Math.sin(GameState.animT * 0.005)})`;
      ctx.fillRect(cx, cy + 4, 28, 18);
    }
    if (m.hp < m.maxHp) {
      ctx.fillStyle = "#111";
      ctx.fillRect(cx - 14, cy - 34, 28, 5);
      ctx.fillStyle = "#cc2222";
      ctx.fillRect(cx - 14, cy - 34, Math.floor((28 * m.hp) / m.maxHp), 5);
    }
    if (m.state === "chase") {
      ctx.fillStyle = "#ff4444";
      ctx.beginPath();
      ctx.arc(cx, cy - 38, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffaa44";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(m.name, cx, cy - 38);
  },
  npc(npc, cx, cy) {
    const sx = Math.floor(npc.px - cx),
      sy = Math.floor(npc.py - cy);
    if (sx < -50 || sx > cW + 50 || sy < -50 || sy > cH + 50) return;
    const col = npc.color || "#88aacc";
    if (npc.type === "chest") {
      if (npc.used) {
        ctx.fillStyle = "#3a2810";
        ctx.fillRect(sx - 10, sy - 8, 20, 14);
        ctx.fillStyle = "#5a4020";
        ctx.fillRect(sx - 8, sy - 6, 16, 10);
        ctx.fillStyle = "#88aa88";
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText("(trống)", sx, sy + 12);
        return;
      }
      ctx.fillStyle = "#5a3010";
      ctx.fillRect(sx - 12, sy - 10, 24, 16);
      ctx.fillStyle = "#8a5020";
      ctx.fillRect(sx - 10, sy - 8, 20, 12);
      ctx.fillStyle = "#c8a84b";
      ctx.fillRect(sx - 12, sy - 10, 24, 4);
      ctx.fillRect(sx - 2, sy - 10, 4, 4);
      const aa = 0.3 + 0.2 * Math.sin(GameState.animT * 0.003);
      ctx.fillStyle = `rgba(200,168,75,${aa})`;
      ctx.fillRect(sx - 14, sy - 12, 28, 20);
      ctx.fillStyle = "#ffdd44";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(npc.name, sx, sy - 16);
      return;
    }
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(sx - 7, sy + 8, 14, 4);
    ctx.fillStyle = col;
    ctx.fillRect(sx - 6, sy - 10, 12, 20);
    ctx.fillStyle = "#ffffff22";
    ctx.fillRect(sx - 5, sy - 9, 10, 18);
    ctx.fillStyle = "#e8c080";
    ctx.fillRect(sx - 5, sy - 20, 10, 9);
    ctx.fillStyle = "#221408";
    ctx.fillRect(sx - 5, sy - 20, 10, 4);
    ctx.fillStyle = "#111";
    ctx.fillRect(sx - 3, sy - 15, 2, 2);
    ctx.fillRect(sx + 1, sy - 15, 2, 2);
    ctx.fillStyle = "rgba(0,0,0,.6)";
    const nw = ctx.measureText(npc.name).width + 8;
    ctx.fillRect(sx - nw / 2, sy - 30, nw, 12);
    ctx.fillStyle = col;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(npc.name, sx, sy - 21);
    if (
      dist(GameState.player.px, GameState.player.py, npc.px, npc.py) <
      GameState.TS * 1.6
    ) {
      ctx.fillStyle = "rgba(200,168,75,.9)";
      ctx.font = "9px monospace";
      ctx.fillText("[F]", sx, sy - 38);
    }
  },
  portal(portal, cx, cy) {
    const sx = portal.tx * GameState.TS + GameState.TS / 2 - cx,
      sy = portal.ty * GameState.TS + GameState.TS / 2 - cy;
    if (sx < -60 || sx > cW + 60 || sy < -60 || sy > cH + 60) return;
    const a = GameState.animT * 0.002;
    const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 20);
    grad.addColorStop(0, `rgba(100,180,255,${0.4 + 0.2 * Math.sin(a)})`);
    grad.addColorStop(1, "rgba(100,180,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(sx - 22, sy - 22, 44, 44);
    ctx.strokeStyle = `rgba(120,200,255,${0.6 + 0.3 * Math.sin(a)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.stroke();
    if (portal.label) {
      ctx.fillStyle = "rgba(0,0,0,.7)";
      const lw = ctx.measureText(portal.label).width + 10;
      ctx.fillRect(sx - lw / 2, sy - 36, lw, 13);
      ctx.fillStyle = "#88ddff";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(portal.label, sx, sy - 26);
    }
  },
  floatDmg(wx, wy, offY, text, color) {
    const area = document.getElementById("canvas-area").getBoundingClientRect();
    const sx = wx - GameState.cam.x + area.left,
      sy = wy - GameState.cam.y + offY + area.top;
    const d = document.createElement("div");
    d.className = "dmg-float";
    d.textContent = text;
    d.style.cssText = `left:${sx}px;top:${sy}px;color:${color}`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 900);
  },
};

function calcStats() {
  const out = { patk: 0, def: 0, hp: 0, matk: 0, spd: 0, crit: 0 };
  for (const item of Object.values(GameState.equipped)) {
    if (!item) continue;
    const base = GameState.EQ_BASE[item.grade];
    for (const k of Object.keys(base)) {
      if (item[k] != null) {
        out[k] += item[k];
        if (item.enhance) out[k] += Math.floor(item[k] * item.enhance * 0.05);
      }
    }
    for (const b of item.bonuses || [])
      if (out[b.k] !== undefined) out[b.k] += b.v;
  }
  return out;
}
const CombatMod = {
  pAtk() {
    return Math.floor(
      10 + GameState.player.stats.str * 2 + GameState.player.stats.agi * 0.5,
    );
  },
  pDef() {
    return Math.floor(
      2 + GameState.player.stats.vit * 0.2 + +GameState.player.stats.agi * 0.75,
      // SkillMod.activeDef(),
    );
  },
  // pCrit() {
  //   const eq = EqMod.calcStats();
  //   const sb = SectMod.getBuffs();
  //   return CFG.CRIT_BASE + eq.crit / 100 + (sb.critFlat || 0);
  // },

  attack(m) {
    if (GameState.player.attackCD > 0 || m.dead) return;
    // if (StatusFX.isStunned()) {
    //   G.log("Đang bị Choáng!", "lcs");
    //   return;
    // }
    // if (GameState.meditating) G.toggleAuto("med");

    // const isCrit = Math.random() < this.pCrit();
    const isCrit = false;
    // const comboMult =
    //   1 +
    //   (GameState.combo >= 20 ? 0.2 : GameState.combo >= 10 ? 0.12 : GameState.combo >= 5 ? 0.06 : 0);
    let dmg = Math.max(1, Math.floor(this.pAtk() - m.def + ri(0, 6)));
    m.hp -= dmg;
    GameState.player.attackCD = GameState.ATK_CD;
    // GameState.atkFx.push({ px: m.px, py: m.py, r: 14, life: 14 }); hiệu ứng
    Render.floatDmg(
      m.px,
      m.py,
      -26,
      (isCrit ? "💥" : "") + dmg,
      isCrit ? "#ffdd44" : "#ff6666",
    );

    // Random status effect from monster
    // const tmpl = CFG.MONSTERS[m.code];
    // if (tmpl.sfx?.length && Math.random() < 0.2)
    //   StatusFX.applyToMon(m, tmpl.sfx[ri(0, tmpl.sfx.length - 1)]);

    // this.addCombo(1);
    // if (isCrit) G.log(`💥 Bạo kích ${dmg}!`, "lcr");
    // if (m.hp <= 0) {
    //   m.dead = true;
    //   m.respawnT = CFG.RESPAWN;
    //   this.drop(m);
    // }
  },

  addCombo(n) {
    GameState.combo += n;
    GameState.comboCd = CFG.COMBO_DECAY;
    // Milestone notifications
    if (GameState.combo === 5) G.notif("5 HIT COMBO! +6% DMG", "good");
    else if (GameState.combo === 10) G.notif("10 HIT COMBO! +12% DMG", "good");
    else if (GameState.combo === 20) G.notif("20 HIT COMBO! +20% DMG!", "info");
    const el = document.getElementById("combo-cnt");
    if (el) {
      el.textContent = GameState.combo;
      el.style.color =
        GameState.combo >= 10
          ? "#ff8800"
          : GameState.combo >= 5
            ? "#cc6600"
            : "var(--gold)";
    }
    const fill = document.getElementById("combo-fill");
    if (fill) fill.style.width = Math.min(100, GameState.combo * 5) + "%";
  },

  drop(m) {
    const tmpl = CFG.MONSTERS[m.code];
    const xu = ri(tmpl.xu[0], tmpl.xu[1]);
    GameState.player.xu += xu;
    G.log(`Nhặt ${xu} xu`, "lcu");
    QuestMod.onKill(m.code);
    if (Math.random() < tmpl.ic) {
      const id = tmpl.dr[ri(0, tmpl.dr.length - 1)];
      const it = CFG.ITEMS[id];
      if (it) {
        InvMod.add(it);
        G.log(`Rơi: ${it.e} ${it.n}`, "lcu");
      }
    }
    if (tmpl.eq && Math.random() < tmpl.eq) {
      const eq = EqMod.generate(tmpl.eqG);
      InvMod.add(eq);
      G.log(`⚔ [${eq.gradeName}] ${eq.slotLb} rơi!`, "lcu");
    }
    if (tmpl.petD && Math.random() < (tmpl.petC || 0)) {
      const pd = CFG.ITEMS[tmpl.petD];
      if (pd) {
        InvMod.add(pd);
        G.log(`🥚 Yêu Đan rơi: ${pd.e} ${pd.n}!`, "lcu");
        PetMod.updateDisplay();
      }
    }
    if (tmpl.boss) G.log("★ BOSS bị tiêu diệt! Phần thưởng đặc biệt!", "lcl");
    GameState._mmDirty = true;
    // Auto absorb check
    if (GameState.autoAbsorb) {
      const hasStone = GameState.inv.some(
        (i) => i.t === "stone" || i.t === "elemstone",
      );
      if (hasStone) CultMod.absorb();
    }
    // Dungeon wave check
    DungeonMod.checkWave();
  },
};

const UIMod = {
  // Throttled stat update — only when dirty
  update() {
    if (!GameState.player || !GameState._uiDirty) return;
    GameState._uiDirty = false;
    const p = GameState.player;
    // const eq = EqMod.calcStats();
    // const sb = SectMod.getBuffs();
    // const pb = PetMod.getBuffs();
    document.getElementById("ui-name").textContent = p.name;
    const st = document.getElementById("ui-sptag");
    st.textContent = `${p.linhCan}`;
    // st.style.color = p.root.c;
    st.style.color = "#3db84a";

    document.getElementById("ui-realm").textContent = p.tenCanhGioi;
    document.getElementById("ui-stage").textContent = `Tầng ${p.tangTuVi}`;
    const cp =
      (p.stats.str + p.stats.agi + p.stats.vit + p.stats.ene) * 5 +
      // p.realm * 200 +
      // p.stage * 20 +
      100;
    document.getElementById("ui-cp").textContent = cp.toLocaleString();
    const hp = Math.floor(p.hp);
    document.getElementById("ui-hp").textContent = `${hp}/${p.maxHp}`;
    document.getElementById("b-hp").style.width =
      Math.floor((hp / p.maxHp) * 100) + "%";
    const mp = Math.floor(p.mp);
    document.getElementById("ui-mp").textContent = `${mp}/${p.maxMp}`;
    document.getElementById("b-mp").style.width =
      Math.floor((mp / p.maxMp) * 100) + "%";
    document.getElementById("ui-tu").textContent =
      `${Math.floor(p.tuViHienTai)}/${Math.floor(p.tuViLenCap)}`;
    document.getElementById("b-tu").style.width =
      Math.min(100, Math.floor((p.tuViHienTai / p.tuViLenCap) * 100)) + "%";
    document.getElementById("ui-xu").textContent = p.xu.toLocaleString();
    document.getElementById("r-str").textContent = p.stats.str;
    document.getElementById("r-agi").textContent = p.stats.agi;
    document.getElementById("r-vit").textContent = p.stats.vit;
    document.getElementById("r-int").textContent = p.stats.int;
    document.getElementById("r-patk").textContent = CombatMod.pAtk();
    document.getElementById("r-matk").textContent = "";
    // Math.floor(
    //   (5 + p.stats.int * 3 + eq.matk) * (1 + (sb.matkPct || 0)),
    // );
    document.getElementById("r-def").textContent = CombatMod.pDef();
    let speed = GameState.player.speed * 20;
    if (speed < 100) {
      speed += (100 - speed) * 2;
    }
    document.getElementById("r-spd").textContent = speed + "%";
    //  Math.floor(
    //   (3 + p.stats.agi * 0.5 + (eq.spd || 0)) * (1 + (sb.spdPct || 0)),
    // );
    // document.getElementById("r-crit").textContent =
    //   Math.floor(CombatMod.pCrit() * 100) + "%";
    // document.getElementById("r-pet").textContent = GameState.pet
    //   ? CFG.PETS[GameState.pet.petId]?.bd || "—"
    //   : "—";
    document.getElementById("inv-head").textContent =
      `✦ TÚI ĐỒ (${GameState.player.jsonIventory}/${GameState.player.iventoryIndex})`;
  },

  // Separate bars update (every frame, lightweight)
  updateBars() {
    if (!GameState.player) return;
    const p = GameState.player,
      hp = Math.floor(p.hp);
    document.getElementById("ui-hp").textContent = `${hp}/${p.maxHp}`;
    document.getElementById("b-hp").style.width =
      Math.floor((hp / p.maxHp) * 100) + "%";
    const mp = Math.floor(p.mp);
    document.getElementById("ui-mp").textContent = `${mp}/${p.maxMp}`;
    document.getElementById("b-mp").style.width =
      Math.floor((mp / p.maxMp) * 100) + "%";
    document.getElementById("ui-xu").textContent = p.xu.toLocaleString();
  },

  buildInv() {
    const grid = document.getElementById("ig");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < CFG.INV; i++) {
      const sl = document.createElement("div");
      const item = GameState.inv[i];
      sl.className = "is" + (item?.type === "equip" ? ` g${item.grade}` : "");
      if (item) {
        sl.textContent = item.emoji || item.e || "?";
        if (item.count > 1) {
          const cnt = document.createElement("span");
          cnt.className = "ic";
          cnt.textContent = item.count;
          sl.appendChild(cnt);
        }
        if (item.enhance > 0) {
          const lv = document.createElement("span");
          lv.className = "il";
          lv.textContent = "+" + item.enhance;
          sl.appendChild(lv);
        }
        sl.onclick = () => G.ui.useOrDetail(i);
        sl.ondblclick = () => item.type === "equip" && EqMod.equip(i);
        sl.onmouseenter = (e) => G.ui.showTip(e, item);
        sl.onmouseleave = G.ui.hideTip;
      }
      grid.appendChild(sl);
    }
  },

  buildEquip() {
    const grid = document.getElementById("equip-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const slot of CFG.EQ_SLOTS) {
      const item = GameState.equipped[slot.id];
      const d = document.createElement("div");
      d.className = "es" + (item ? ` g${item.grade}` : "");
      if (item) {
        d.innerHTML = `<div class="ei" style="color:${item.gradeC}">${item.emoji}</div><div style="font-size:8px;color:${item.gradeC}">${item.gradeName?.slice(0, 2) || ""}</div>${item.enhance > 0 ? `<span class="elv" style="color:#ff8800">+${item.enhance}</span>` : ""}`;
        d.onclick = () => EqMod.openEnhance(slot.id);
      } else {
        d.innerHTML = `<div class="ei">${slot.ic}</div><div style="font-size:8px;color:var(--txt2)">${slot.lb}</div>`;
      }
      grid.appendChild(d);
    }
  },

  showTip(e, item) {
    const tip = document.getElementById("tip");
    const gc = item.type === "equip" ? item.gradeC : "var(--gold)";
    document.getElementById("tip-name").textContent =
      (item.emoji || item.e || "") +
      (item.type === "equip"
        ? ` ${item.gradeName} ${item.slotLb}${item.enhance > 0 ? " +" + item.enhance : ""}`
        : " " + (item.n || item.name || item.id));
    document.getElementById("tip-name").style.color = gc;
    document.getElementById("tip-type").textContent =
      item.type === "equip"
        ? item.slotLb
        : item.t === "stone"
          ? "Linh Thạch"
          : item.t === "youdan"
            ? "Yêu Đan"
            : item.t === "mat"
              ? "Nguyên Liệu"
              : "Vật Phẩm";
    let body = item.dc || item.desc || "";
    if (item.type === "equip") {
      const sk2 =
        CFG.EQ_SLOTS.find((s) => GameState.id === item.slot)?.sk || "patk";
      const sn = {
        patk: "ATK",
        def: "DEF",
        hp: "HP",
        matk: "MATK",
        spd: "SPD",
        crit: "CRIT",
      };
      body = `<span class="ts">${sn[sk2] || sk2}: +${item[sk2] || 0}</span>`;
      for (const b of item.bonuses || [])
        body += `<br><span class="tb2">${sn[b.k] || b.k}: +${b.v}</span>`;
    }
    document.getElementById("tip-body").innerHTML =
      body +
      '<br><span style="color:var(--txt2)">Bán: ' +
      (item.sell || 0) +
      " xu</span>";
    tip.style.display = "block";
    tip.style.left = e.clientX + 14 + "px";
    tip.style.top = e.clientY - 10 + "px";
  },
  hideTip() {
    document.getElementById("tip").style.display = "none";
  },

  useOrDetail(idx) {
    const it = GameState.inv[idx];
    if (!it) return;
    if (it.type === "equip") G.showItemDetail(idx);
    else InvMod.use(idx);
  },

  lTab(tab) {
    ["char", "pet", "sect"].forEach((t) => {
      document.getElementById(`lt-${t}`).className =
        "ptb" + (t === tab ? " on" : "");
      document.getElementById(`lt-${t}-b`).style.display =
        t === tab ? "" : "none";
    });
  },
  rTab(tab) {
    ["stat", "equip"].forEach((t) => {
      document.getElementById(`rt-${t}`).className =
        "ptb" + (t === tab ? " on" : "");
      document.getElementById(`rt-${t}-b`).style.display =
        t === tab ? "" : "none";
    });
  },
  qTab(tab) {
    ["quest", "craft"].forEach((t) => {
      document.getElementById(`qt-${t}`).className =
        "qt-tab" + (t === tab ? " on" : "");
    });
    if (tab === "quest") QuestMod.render();
    else CraftMod.render();
  },
  sfxBar() {
    const el = document.getElementById("sfx-bar");
    if (!el) return;
    el.innerHTML = GameState.statusEffects
      .map((s) => {
        const def = CFG.STATUS[GameState.id];
        return `<div class="sfx-pip sfx-${GameState.id}">${def?.e || GameState.id} ${Math.ceil(GameState.dur / 60)}s</div>`;
      })
      .join("");
  },
  toggleAutoPanel() {
    document.getElementById("auto-panel").classList.toggle("open");
  },
};
