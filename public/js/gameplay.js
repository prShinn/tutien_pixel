const GameState = {
  ATK_CD: 40,
  TS: 32,
  animT: 0,
  animF: 0,
  atkFx: [],
  cam: { x: 0, y: 0 },
};
let cv, ctx, mmCv, mmCx, cW, cH;
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

const TC = {
  [T.GRASS]: ["#2a5a28", "#3a7a38"],
  [T.STONE]: ["#5a5a68", "#7a7a88"],
  [T.WATER]: ["#1a3a6a", "#2a5a9a"],
  [T.WALL]: ["#181010", "#2a1818"],
  [T.FLOOR]: ["#3a3020", "#4a4028"],
  [T.TREE]: ["#141a10", "#2a3818"],
  [T.MTN]: ["#404050", "#606070"],
  [T.PLAZA]: ["#4a4030", "#5a5040"],
};
const SOLID = new Set([T.WALL, T.WATER, T.TREE, T.MTN]);
const otherPlayers = new Map();
function isSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= S.mapW || ty >= S.mapH) return true;
  return SOLID.has(S.tiles[ty][tx]);
}
function findOpen(z) {
  for (let i = 0; i < 25; i++) {
    const tx = z.x + ri(0, z.w - 1),
      ty = z.y + ri(0, z.h - 1);
    if (!isSolid(tx, ty)) return { tx, ty };
  }
  return null;
}
function ri(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function showToast(msg, dur = 1800) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), dur);
}
function logSystem(msg, cls = "lc") {
  const area = document.getElementById("la");
  if (!area) return;
  const p = document.createElement("p");
  p.className = "lc " + cls;
  const t = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  p.textContent = `[${t}] ${msg}`;
  area.appendChild(p);
  area.scrollTop = area.scrollHeight;
  while (area.children.length > 150) area.removeChild(area.firstChild);
}
function update(dt) {
  const p = GameState.player;
  if (!p) return;
  GameState.animT += dt;
  if (GameState.animT > 240) {
    GameState.animF ^= 1;
    GameState.animT = 0;
  }
  if (GameState.atkCd > 0) GameState.atkCd -= dt / 16;

  // Attack FX cleanup
  for (let i = GameState.atkFx.length - 1; i >= 0; i--) {
    GameState.atkFx[i].life -= dt / 16;
    GameState.atkFx[i].r += 0.8;
    if (GameState.atkFx[i].life <= 0) GameState.atkFx.splice(i, 1);
  }

  // Module ticks
  //   SkillMod.tick(dt);
  //   PetMod.tick(dt);
  //   StatusFX.tickPlayer(dt);

  //   // Auto-save
  //   GameState._autoSaveTimer += dt;
  //   if (GameState._autoSaveTimer > CFG.AUTO_SAVE_MS) {
  //     GameState._autoSaveTimer = 0;
  //     // SaveLoad.save(selSlot, S);
  //     // showToast("💾 Auto-save", 800);
  //   }

  // Meditation
  //   if (GameState.meditating) p.tuExp += CFG.MEDITATE_TU * (dt / 16);

  // Combo decay
  //   if (GameState.comboCd > 0) {
  //     GameState.comboCd -= dt / 16;
  //     if (GameState.comboCd <= 0) {
  //       GameState.combo = 0;
  //       const el = document.getElementById("combo-cnt");
  //       if (el) {
  //         el.textContent = "0";
  //         el.style.color = "var(--gold)";
  //       }
  //       document.getElementById("combo-fill").style.width = "0%";
  //     }
  //   }

  const modal = document.querySelector(".mo.open");
  if (!modal) {
    // const slow = StatusFX.getSlowMult();
    const slow = 3;
    let dx = 0,
      dy = 0;
    if (keys["KeyA"] || keys["ArrowLeft"]) dx = -1;
    if (keys["KeyD"] || keys["ArrowRight"]) dx = 1;
    if (keys["KeyW"] || keys["ArrowUp"]) dy = -1;
    if (keys["KeyS"] || keys["ArrowDown"]) dy = 1;
    if (dx || dy) {
      //   if (GameState.meditating) G.toggleAuto("med");
      mvTimer += dt;
      if (mvTimer > 110 / slow) {
        mvTimer = 0;
        const nx = p.x + dx,
          ny = p.y + dy;
        if (!isSolid(nx, ny)) {
          p.x = nx;
          p.y = ny;
          GameState._mmDirty = true;
        }
      }
    } else mvTimer = 0;
    p.px = lerp(p.px, p.x * GameState.TS + GameState.TS / 2, 0.3);
    p.py = lerp(p.py, p.y * GameState.TS + GameState.TS / 2, 0.3);

    // if (keys["Space"] && GameState.atkCd <= 0) {
    //   const near = monGrid.query(p.px, p.py, 5 * CFG.TS).filter((m) => !m.dead);
    //   if (near.length) {
    //     let best = null,
    //       bd = Infinity;
    //     for (const m of near) {
    //       const d = dist(m.px, m.py, p.px, p.py);
    //       if (d < bd) {
    //         bd = d;
    //         best = m;
    //       }
    //     }
    //     if (best) CombatMod.attack(best);
    //   }
    // }
    // if (GameState.autoFight && GameState.atkCd <= 0) {
    //   const near = monGrid
    //     .query(p.px, p.py, 4.5 * CFG.TS)
    //     .filter((m) => !m.dead);
    //   if (near.length) {
    //     let best = null,
    //       bd = Infinity;
    //     for (const m of near) {
    //       const d = dist(m.px, m.py, p.px, p.py);
    //       if (d < bd) {
    //         bd = d;
    //         best = m;
    //       }
    //     }
    //     if (best) CombatMod.attack(best);
    //   }
    // }
    if (
      dist(
        p.px,
        p.py,
        p.x * GameState.TS + GameState.TS / 2,
        p.y * GameState.TS + GameState.TS / 2,
      ) < 4
    )
      WorldMap.checkPortals();
  }

  // Update monster positions in grid every 3 frames
  if (GameState._mmFrame % 3 === 0) {
    monGrid.clear();
    for (const m of GameState.monsters) {
      updateMon(m, dt);
      if (!m.dead) monGrid.insert(m);
    }
  } else {
    for (const m of GameState.monsters) if (!m.dead) updateMon(m, dt);
  }

  // Regen
  p.hp = Math.min(p.maxHp, p.hp + GameState.player.heal_hp * dt);
  p.mp = Math.min(p.maxMp, p.mp + GameState.player.heal_mp * dt);

  // Minimap — only when dirty
  //   if (GameState._mmDirty) Render.minimap();

  // Throttled heavy UI updates (every 4 frames)
  GameState._uiFrame = (GameState._uiFrame + 1) % 4;
  if (GameState._uiFrame === 0) {
    GameState._uiDirty = true;
    UIMod.update();
    UIMod.updateBars();
  } else UIMod.updateBars(); // lightweight every frame

  GameState._mmFrame = (GameState._mmFrame + 1) % 60;
}
function setupCanvas() {
  cv = document.getElementById("gc");
  mmCv = document.getElementById("mmc");
  const area = document.getElementById("ca");
  cW = area.clientWidth;
  cH = area.clientHeight;
  cv.width = cW;
  cv.height = cH;
  ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  mmCx = mmCv.getContext("2d");
  window.addEventListener("resize", () => {
    cW = area.clientWidth;
    cH = area.clientHeight;
    cv.width = cW;
    cv.height = cH;
    ctx.imageSmoothingEnabled = false;
  });
}
