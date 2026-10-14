"use strict";
// ════════════════════════════════════════════════════════════
// game.js — §15 Game Loop + §16 Char Create + §17 Screens + §18 Boot
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// §15 · GAME LOOP
// ════════════════════════════════════════════════════════════
function update(dt) {
  try {
    const p = S.player;
    if (!p) return;
    S.animT += dt;
    if (S.animT > 240) {
      S.animF ^= 1;
      S.animT = 0;
    }
    if (S.atkCd > 0) S.atkCd -= dt / 16;
    if (S.combatGcd > 0) S.combatGcd -= dt / 16;
    SkillSystem.tickCooldowns(dt);
    for (let i = S.atkFx.length - 1; i >= 0; i--) {
      S.atkFx[i].life -= dt / 16;
      S.atkFx[i].r += 0.8;
      if (S.atkFx[i].life <= 0) S.atkFx.splice(i, 1);
    }
    const modalOpen =
      document.getElementById("shop-modal").classList.contains("open") ||
      document.getElementById("dialog-modal").classList.contains("open");
    if (!modalOpen) {
      let dx = 0, dy = 0;
      if (Input.keys["KeyA"] || Input.keys["ArrowLeft"]) dx = -1;
      if (Input.keys["KeyD"] || Input.keys["ArrowRight"]) dx = 1;
      if (Input.keys["KeyW"] || Input.keys["ArrowUp"]) dy = -1;
      if (Input.keys["KeyS"] || Input.keys["ArrowDown"]) dy = 1;

      if (dx || dy) {
        if (Math.abs(dx) >= Math.abs(dy)) p.direction = dx < 0 ? "left" : "right";
        else p.direction = dy < 0 ? "up" : "down";
        const mag = Math.hypot(dx, dy);
        const dirX = dx / mag;
        const dirY = dy / mag;
        const speedBuff = p.buffs?.buff_spd || p.buffs?.speed;
        const speedActive = speedBuff && (!speedBuff.expiresAt || speedBuff.expiresAt > Date.now()) ? Number(speedBuff.value || 0) : 0;
        const speedBase = 1.5 * (1 + Math.max(0, speedActive) / 100); // Buff tốc độ do server cấp
        const speedBonus = (p.stats?.agi || 0) * 0.005;
        const moveStep =
          ((speedBase + speedBonus) * (dt / 16)) /
          (15 - Math.max(0, Math.min(14, S.player.speed ?? 1)));
        const oldX = p.x;
        const oldY = p.y;
        const nextX = p.x + dirX * moveStep;
        if (!World.collides(nextX, p.y)) p.x = nextX;
        const nextY = p.y + dirY * moveStep;
        if (!World.collides(p.x, nextY)) p.y = nextY;
      
        // Cập nhật tọa độ di chuyển
        const moved = Math.abs(p.x - oldX) > 0.0001 || Math.abs(p.y - oldY) > 0.0001;
        if (moved) {
          if (!p.isMoving) {
            p.isMoving = true;
            Net.emitMove(); // Gửi ngay khi bắt đầu
          }
          
          if (p.lastEmitX === undefined) p.lastEmitX = p.x;
          if (p.lastEmitY === undefined) p.lastEmitY = p.y;
          
          if (Math.hypot(p.x - p.lastEmitX, p.y - p.lastEmitY) > 0.1) {
            p.lastEmitX = p.x;
            p.lastEmitY = p.y;
            Net.emitMove();
          }
        } else if (p.isMoving) {
          p.isMoving = false;
          Net.emitMove(); // Gửi tọa độ cuối cùng khi dừng lại
        }
      } else if (p.isMoving) {
        p.isMoving = false;
        Net.emitMove();
      }

      p.px = p.x * CFG.TS + CFG.TS / 2;
      p.py = p.y * CFG.TS + CFG.TS / 2;

      if (Input.keys["Space"] && S.atkCd <= 0) {
        let best = null, bd = CFG.BASIC_ATTACK_RANGE * CFG.TS;
        for (const m of S.monsters)
          if (!m.dead) {
            const d = dist(m.px, m.py, p.px, p.py);
            if (d < bd) { bd = d; best = m; }
          }
        if (best) Combat.attack(best);
      }
      if (S.autoFight && S.atkCd <= 0) {
        let best = null, bd = CFG.BASIC_ATTACK_RANGE * CFG.TS;
        for (const m of S.monsters)
          if (!m.dead) {
            const d = dist(m.px, m.py, p.px, p.py);
            if (d < bd) { bd = d; best = m; }
          }
        if (best) Combat.attack(best);
      }
      if (
        dist(p.px, p.py, p.x * CFG.TS + CFG.TS / 2, p.y * CFG.TS + CFG.TS / 2) < 4
      )
        World.checkPortals();
    }
    
    // Cập nhật vị trí cho Other Players (Interpolation)
    for (const [, op] of S.players) {
      if (op && op.tpx !== undefined && op.tpy !== undefined) {
        const dx = op.tpx - op.px;
        const dy = op.tpy - op.py;
        const d = Math.hypot(dx, dy);
        if (d > 0.1) {
          const step = 1.4 * (dt / 16); // Tốc độ nội suy giảm tương ứng
          op.px += (dx / d) * Math.min(d, step);
          op.py += (dy / d) * Math.min(d, step);
        }
      }
    }

    for (const m of S.monsters) {
      if (m) Monster.update(m, dt);
    }

    // Cập nhật hiệu ứng FX và Floating Texts
    S.atkFx = S.atkFx.filter((f) => { f.life -= dt * 0.05; return f.life > 0; });
    S.floatingTexts = S.floatingTexts.filter((f) => { 
      f.life -= dt; 
      f.y -= dt * 0.02; // bay lên từ từ
      return f.life > 0; 
    });

    if (!Net._isOnline) {
      p.hp = Math.min(p.maxHp, p.hp + CFG.REGEN_HP * dt);
      p.mp = Math.min(p.maxMp, p.mp + CFG.REGEN_MP * dt);
    }
    UI.update();
  } catch (e) {
    console.error("Game loop error:", e);
  }
}

function loop(ts) {
  const dt = Math.min(ts - S.lastTs, 50);
  S.lastTs = ts;
  update(dt);
  Render.frame();
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════════════════════
// §16 · CHARACTER CREATE
// ════════════════════════════════════════════════════════════
function selectGender(g) {
  const gender = g === "FEMALE" ? "FEMALE" : "MALE";
  S.creation.gender = gender;
  const male = document.getElementById("btn-gender-male");
  const female = document.getElementById("btn-gender-female");
  male?.classList.toggle("active", gender === "MALE");
  female?.classList.toggle("active", gender === "FEMALE");
  male?.setAttribute("aria-pressed", String(gender === "MALE"));
  female?.setAttribute("aria-pressed", String(gender === "FEMALE"));
}

window.selectGender = selectGender;

function randomizeDemoCreation() {
  selectGender(Math.random() < 0.5 ? "MALE" : "FEMALE");
  const roots = Array.isArray(CFG.ROOTS) ? CFG.ROOTS : [];
  if (roots.length) selectRoot(roots[Math.floor(Math.random() * roots.length)].id);
  const points = S.creation.points;
  points.str = 5; points.agi = 5; points.vit = 5; points.ene = 5; points.remaining = 10;
  const stats = ["str", "agi", "vit", "ene"];
  while (points.remaining > 0) {
    points[stats[Math.floor(Math.random() * stats.length)]] += 1;
    points.remaining -= 1;
  }
  for (const stat of stats) document.getElementById("cs-" + stat).textContent = points[stat];
  document.getElementById("pts-left").textContent = points.remaining;
}

function syncCreationPointsUI() {
  const titles = document.querySelectorAll("#screen-create .sec-title");
  if (titles.length) titles[titles.length - 1].textContent = "✦ PHÂN BỔ THUỘC TÍNH (10 điểm)";
  const left = document.getElementById("pts-left");
  if (left) left.textContent = S.creation.points.remaining;
}

function selectRoot(rootId) {
  const r = CFG.ROOTS.find((item) => item.id === rootId);
  if (!r) return;
  S.creation.root = { ...r };
  const orb = document.getElementById("spirit-orb");
  orb.textContent = r.emoji;
  orb.style.background = r.bg;
  orb.style.color = r.color;
  orb.style.borderColor = r.color;
  orb.style.boxShadow = `0 0 14px ${r.color}66`;
  document.getElementById("spirit-name").textContent = r.name;
  document.getElementById("spirit-name").style.color = r.color;
  document.getElementById("spirit-grade").textContent = "Linh căn đã chọn";
}

function adj(s, d) {
  const points = S.creation.points;
  const nv = points[s] + d;
  if (nv < 1) return;
  const nr = points.remaining - d;
  if (nr < 0) return;
  points[s] = nv;
  points.remaining = nr;
  document.getElementById("cs-" + s).textContent = nv;
  document.getElementById("pts-left").textContent = nr;
}

async function createCharacter() {
  const name = document.getElementById("inp-charname").value.trim();
  if (!name) {
    alert("Hãy nhập pháp danh!");
    return;
  }
  if (!S.creation.root) {
    alert("Vui lòng chọn một linh căn trước khi tạo nhân vật.");
    return;
  }
  if (S.creation.points.remaining !== 0) {
    alert("Phân bổ đủ 10 điểm thuộc tính trước khi tiếp tục.");
    return;
  }
  const { str, agi, vit, ene } = S.creation.points;

  const [defaultRealm, defaultWorldDto] = await Promise.all([
    Net.get("/api/canh-gioi/stt/1"),
    Net.get("/api/worlds/default"),
  ]);
  if (!defaultRealm?.code || !defaultWorldDto?.code) {
    alert("Không thể tải dữ liệu khởi tạo nhân vật. Vui lòng thử lại sau.");
    return;
  }

  const defaultMap = normalizeWorldDto(defaultWorldDto);
  const spawnX =
    typeof defaultWorldDto.spawnX === "number"
      ? defaultWorldDto.spawnX
      : Math.floor(defaultMap.w / 2);
  const spawnY =
    typeof defaultWorldDto.spawnY === "number"
      ? defaultWorldDto.spawnY
      : Math.floor(defaultMap.h / 2);

  const trangBi = {
    vuKhi: null, ao: null, giay: null, mu: null, tay: null, nhan: null, vong: null,
  };
  const assignedSkills = SkillSystem.assignSkills(S.creation.root.id);
  const playerData = {
    userId: S.session.user?.id || 0,
    name,
    linhCan: S.creation.root.id,
    tenCanhGioi: defaultRealm.tenCanhGioi || defaultRealm.name || "",
    tangTuVi: 1,
    maCanhGioi: defaultRealm.code,
    canhGioi: defaultRealm,
    stats: { str, agi, vit, ene },
    hp: GAME_BALANCE.base.hp + vit * GAME_BALANCE.stats.vit.maxHp,
    maxHp: GAME_BALANCE.base.hp + vit * GAME_BALANCE.stats.vit.maxHp,
    mp: 50 + ene * 8,
    maxMp: 50 + ene * 8,
    xu: 50,
    tuViHienTai: 0,
    tuViLenCap: Cultivation.calcTuNeeded(defaultRealm, 1),
    tuViLinhCan: 0,
    x: spawnX,
    y: spawnY,
    px: spawnX * CFG.TS + CFG.TS / 2,
    py: spawnY * CFG.TS + CFG.TS / 2,
    mapCode: defaultMap.code,
    mapId: defaultMap.id || defaultMap.code,
    trangBi,
    iventoryIndex: 0,
    attackCD: 0,
    heal_hp: 0,
    heal_mp: 0,
    jsonIventory: JSON.stringify([]),
    skills: assignedSkills.map(mapFESkillToBE),
    crit: "0",
    speed: 1,
    gender: S.creation.gender,
    img: S.creation.gender === "MALE" ? "./assets/char_male_anim-source.png" : "./assets/char_female_anim-source.png",
    equip_slot: JSON.stringify(trangBi),
  };
  const saved = await Net.post("/api/player", playerData);
  if (saved?.id) {
    playerData.id = saved.id;
  }
  S.player = {
    ...playerData,
    root: S.creation.root,
    realm: defaultRealm.stt || 0,
    stage: 1,
    skills: assignedSkills,
    buffs: {},
    equipment: {
      weapon: null, armor: null, boots: null,
      hat: null, gloves: null, ring: null, amulet: null,
    },
  };
  S.inventory = [];
  enterGame(defaultMap, spawnX, spawnY);
}

// ════════════════════════════════════════════════════════════
// §16b · Enter Game
// ════════════════════════════════════════════════════════════
function enterGame(map, x, y) {
  showScreen("game");
  canvas = document.getElementById("game-canvas");
  const area = document.getElementById("canvas-area");
  cW = area.clientWidth;
  cH = area.clientHeight;
  canvas.width = cW;
  canvas.height = cH;
  ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  Input.init();
  if (map) World.loadMap(map, x, y);
  else UI.log("Đang chờ dữ liệu thế giới từ máy chủ...", "system");
  
  UI.buildInv();
  UI.update();
  UI.log("Bắt đầu hành trình...", "system");
  UI.log("💡 Đánh quái → rơi xu/đồ. Hấp thu linh thạch → tu vi tăng.", "system");
  UI.log("💡 Đủ tu vi → Phá cảnh giới. F → Tương tác NPC.", "system");
  Net.connectSocket();
  Net.startAutoSave();

  // Lưu dữ liệu khi đóng tab/reload
  window.addEventListener("beforeunload", () => {
    Net.saveNow({ type: "browser_close" });
  });

  requestAnimationFrame((ts) => {
    S.lastTs = ts;
    requestAnimationFrame(loop);
  });
}

function toggleAuto() {
  S.autoFight = !S.autoFight;
  document
    .getElementById("btn-auto")
    .classList.toggle("active", S.autoFight);
  UI.log(
    S.autoFight ? "⚔ Tự động đánh: BẬT" : "⚔ Tự động đánh: TẮT",
    "system",
  );
}

// ════════════════════════════════════════════════════════════
// §17 · SCREEN MANAGEMENT
// ════════════════════════════════════════════════════════════
function showScreen(name) {
  document.getElementById("screen-auth").classList.add("hidden");
  document.getElementById("screen-create").classList.add("hidden");
  document.getElementById("screen-game").style.display = "none";
  if (name === "auth")
    document.getElementById("screen-auth").classList.remove("hidden");
  else if (name === "create")
    document.getElementById("screen-create").classList.remove("hidden");
  else if (name === "game")
    document.getElementById("screen-game").style.display = "grid";
}

// ════════════════════════════════════════════════════════════
// §18 · BOOT — Load game data → auto-login → show screen
// ════════════════════════════════════════════════════════════
(async () => {
  // 1. Load tất cả game data từ API trước
  await GameData.load();

  // 2. Cập nhật UI chọn linh căn theo ROOTS từ API
  _buildRootButtons();
  bindGenderButtons();
  syncCreationPointsUI();

  // 3. Auto-login hoặc hiện màn hình đăng nhập
  const ok = await Auth.tryAutoLogin().catch(() => false);
  if (!ok) showScreen("auth");

  // 4. Kiểm tra trạng thái server (optional)
  try {
    document.getElementById("auth-status").textContent =
      "✓ Máy chủ đang hoạt động";
  } catch {
    document.getElementById("auth-status").textContent =
      "⚠ Máy chủ offline";
  }
})();

function bindGenderButtons() {
  const male = document.getElementById("btn-gender-male");
  const female = document.getElementById("btn-gender-female");
  male?.setAttribute("type", "button");
  female?.setAttribute("type", "button");
  male?.addEventListener("click", (event) => { event.preventDefault(); selectGender("MALE"); });
  female?.addEventListener("click", (event) => { event.preventDefault(); selectGender("FEMALE"); });
  selectGender(S.creation.gender);
}

// ── Helper: Render dynamic root buttons từ API data ──
function _buildRootButtons() {
  if (!CFG.ROOTS || CFG.ROOTS.length === 0) return;
  // Tìm container grid các nút linh căn
  const btns = document.querySelectorAll(".sbtn[onclick^='selectRoot']");
  if (btns.length > 0) {
    // Buttons đã hardcode trong HTML, chỉ cần enable/disable theo data
    // Nút nào không có trong CFG.ROOTS thì disable
    const validIds = new Set(CFG.ROOTS.map((r) => r.id));
    btns.forEach((btn) => {
      const match = btn.getAttribute("onclick").match(/selectRoot\('(.+)'\)/);
      if (match && !validIds.has(match[1])) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
        btn.title = "Linh căn chưa khả dụng";
      }
    });
  }
}
