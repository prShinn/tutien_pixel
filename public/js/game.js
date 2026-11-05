// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/game.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Trục điều phối chính (Game Engine Core): Vòng lặp game loop (requestAnimationFrame),
//      cập nhật logic thời gian thực (update/dt), điều khiển nhân vật, màn hình tạo nhân vật,
//      chuyển đổi màn hình (Auth -> Create -> Game) và khởi tạo Bootloader.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.PLAYER_MOVE_SPEED, CFG.REMOTE_MOVE_SPEED, CFG.BASIC_ATTACK_RANGE, CFG.REGEN_HP/MP.
//    - Phụ thuộc: State (S), World, Render, Input, Combat, SkillSystem, UI, Net.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Đảm bảo vòng lặp 60 FPS ổn định, nội suy di chuyển người chơi khác (Interpolation),
//      kiểm tra mở modal tránh di chuyển ngoài ý muốn, tích hợp auto-fight và auto-target quái.
// ════════════════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// §15 · GAME LOOP
// ════════════════════════════════════════════════════════════
const gameClock = FixedStepClock.createFixedStepClock({ maxFrameDeltaMs: 100, maxCatchUpSteps: 5 });

function update(dt) {
  try {
    const p = S.player;
    if (!p) return;
    p.previousPx = Number.isFinite(Number(p.px)) ? Number(p.px) : Number(p.x) * CFG.TS + CFG.TS / 2;
    p.previousPy = Number.isFinite(Number(p.py)) ? Number(p.py) : Number(p.y) * CFG.TS + CFG.TS / 2;
    S.animT += dt;
    if (S.animT > 240) {
      S.animF ^= 1;
      S.animT = 0;
    }
    if (S.atkCd > 0) S.atkCd -= dt / 16;
    if (S.combatGcd > 0) S.combatGcd -= dt / 16;
    SkillSystem.tickCooldowns(dt);
    const active = document.activeElement;
    const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.id === "chat-inp" && active.offsetParent !== null;
    const modalOpen =
      Boolean(document.getElementById("shop-modal")?.classList.contains("open")) ||
      Boolean(document.getElementById("dialog-modal")?.classList.contains("open")) ||
      (document.getElementById("kpah-menu-modal")?.style.display === "flex") ||
      (document.getElementById("quest-modal")?.style.display === "flex");
    if (!modalOpen && !isTyping) {
      const movementInput = World.movementVector(Input.keys);
      let dx = movementInput.dx;
      let dy = movementInput.dy;

      const manualInput = movementInput.active;
      if (manualInput) {
        World.clearPendingNpcInteraction?.();
        World.cancelPlayerMove(p);
        p.combatMove = false;
      } else {
        // Client chỉ điều hướng; server vẫn quyết định phạm vi, hit và sát thương.
        if (p.combatMove && (!S.target || S.target.dead)) p.combatMove = false;
        if (S.autoFight && (!S.target || S.target.dead)) {
          let nearest = null;
          let nearestDistance = Infinity;
          for (const m of S.monsters) {
            if (!m || m.dead) continue;
            const d = dist(m.px, m.py, p.px, p.py);
            if (d < nearestDistance && d <= 160) {
              nearest = m;
              nearestDistance = d;
            }
          }
          S.target = nearest;
        }

        const combatTarget = S.target && !S.target.dead && (S.autoFight || p.combatMove) ? S.target : null;
        const stopRange = CFG.BASIC_ATTACK_RANGE * CFG.TS * 0.86;
        if (combatTarget) {
          const targetDx = combatTarget.px - p.px;
          const targetDy = combatTarget.py - p.py;
          const targetDistance = Math.hypot(targetDx, targetDy);
          if (targetDistance > stopRange) {
            if (World.shouldReplanCombatApproach(p, combatTarget, Date.now())) {
              World.planCombatApproach(p, combatTarget, Date.now());
            }
            while (p.movePath?.length && Math.hypot(p.movePath[0].x - p.x, p.movePath[0].y - p.y) < 0.6) {
              p.movePath.shift();
            }
            const waypoint = p.movePath?.[0] || p.targetMovePos;
            if (waypoint) {
              const waypointDx = Number(waypoint.x) - p.x;
              const waypointDy = Number(waypoint.y) - p.y;
              const waypointDistance = Math.hypot(waypointDx, waypointDy);
              if (waypointDistance > 1e-6) {
                dx = waypointDx / waypointDistance;
                dy = waypointDy / waypointDistance;
              }
            }
          } else {
            World.cancelPlayerMove(p);
          }
        } else if (p.movePath?.length || p.targetMovePos) {
          while (p.movePath?.length && Math.hypot(p.movePath[0].x - p.x, p.movePath[0].y - p.y) < 0.6) {
            p.movePath.shift();
          }
          const waypoint = p.movePath?.[0] || p.targetMovePos;
          if (waypoint) {
            const toX = Number(waypoint.x);
            const toY = Number(waypoint.y);
            const distToTarget = Math.hypot(toX - p.x, toY - p.y);
            if (distToTarget < 0.6 && !p.movePath?.length) {
              World.cancelPlayerMove(p);
            } else if (distToTarget > 1e-6) {
              dx = (toX - p.x) / distToTarget;
              dy = (toY - p.y) / distToTarget;
            }
          }
        }
      }

      if (dx || dy) {
        if (Math.abs(dx) >= Math.abs(dy)) p.direction = dx < 0 ? "left" : "right";
        else p.direction = dy < 0 ? "up" : "down";
        const mag = Math.hypot(dx, dy);
        const dirX = dx / mag;
        const dirY = dy / mag;
        const speedBuff = p.buffs?.buff_spd || p.buffs?.speed;
        const speedActive = speedBuff && (!speedBuff.expiresAt || speedBuff.expiresAt > Date.now()) ? Number(speedBuff.value || 0) : 0;
        const speedBonus = Number(p.stats?.agi || 0) * 0.08;
        const moveSpeed = (CFG.PLAYER_MOVE_SPEED + speedBonus) * (1 + Math.max(0, speedActive) / 100);
        const moveStep = moveSpeed * dt / 1000;
        const oldX = p.x;
        const oldY = p.y;
        const waypoint = !manualInput && (p.movePath?.[0] || p.targetMovePos);
        if (waypoint) World.moveTowards(p, waypoint.x, waypoint.y, moveStep);
        else World.moveWithCollision(p, dirX * moveStep, dirY * moveStep);
      
        // Cập nhật tọa độ di chuyển
        const movedDistance = Math.hypot(p.x - oldX, p.y - oldY);
        const moved = movedDistance > 0.0001;
        if (moved) {
          if (!p.isMoving) {
            p.isMoving = true;
            p.walkDistance = 0;
            Net.emitMove(); // Gửi ngay khi bắt đầu
          }
          p.walkDistance = Number(p.walkDistance || 0) + movedDistance;
          
          if (p.lastEmitX === undefined) p.lastEmitX = p.x;
          if (p.lastEmitY === undefined) p.lastEmitY = p.y;
          
          if (Math.hypot(p.x - p.lastEmitX, p.y - p.lastEmitY) > 0.1) {
            p.lastEmitX = p.x;
            p.lastEmitY = p.y;
            Net.emitMove();
          }
        } else {
          if (p.targetMovePos) World.cancelPlayerMove(p);
          if (p.isMoving) {
            p.isMoving = false;
            Net.emitMove(); // Gửi tọa độ cuối cùng khi dừng lại
          }
        }
      } else if (p.isMoving) {
        p.isMoving = false;
        Net.emitMove();
      }

      MovementFeedback.apply(p, CFG.TS);
      World.processPendingNpcInteraction?.();
      Net.tickAutoLoot(dt);

      if ((Input.keys["Space"] || p.combatMove) && S.atkCd <= 0) {
        const attackRange = CFG.BASIC_ATTACK_RANGE * CFG.TS + (CFG.ATTACK_RANGE_PADDING || 0);
        let best = (S.target && !S.target.dead && dist(S.target.px, S.target.py, p.px, p.py) <= attackRange) ? S.target : null;
        if (!best) {
          let bd = attackRange;
          for (const m of S.monsters) {
            if (!m.dead) {
              const d = dist(m.px, m.py, p.px, p.py);
              if (d < bd) { bd = d; best = m; }
            }
          }
        }
        if (best) {
          S.target = best;
          Combat.attack(best);
        }
      }
      if (S.autoFight && S.atkCd <= 0) {
        const attackRange = CFG.BASIC_ATTACK_RANGE * CFG.TS + (CFG.ATTACK_RANGE_PADDING || 0);
        let best = (S.target && !S.target.dead && dist(S.target.px, S.target.py, p.px, p.py) <= attackRange) ? S.target : null;
        if (!best) {
          let bd = attackRange;
          for (const m of S.monsters) {
            if (!m.dead) {
              const d = dist(m.px, m.py, p.px, p.py);
              if (d < bd) { bd = d; best = m; }
            }
          }
        }
        if (best) {
          S.target = best;
          Combat.attack(best);
        }
      }
      // p.px/p.py luôn được đồng bộ từ p.x/p.y ở ngay phía trên; gọi trực tiếp
      // để portalLocked vẫn được mở khóa khi người chơi đi ra xa cổng.
      World.checkPortals();
    } else if (p.isMoving || p.movePath?.length || p.targetMovePos || p.combatMove || Input.hasActiveKeys()) {
      Input.stopMovement();
    }
    
    for (const m of S.monsters) {
      if (m) Monster.update(m, dt);
    }

    // Cập nhật hiệu ứng FX và Floating Texts
    S.floatingTexts = S.floatingTexts.filter((f) => { 
      f.life -= dt; 
      f.y -= dt * 0.02; // bay lên từ từ
      return f.life > 0; 
    });
    S.combatFx = (S.combatFx || []).filter((fx) => {
      fx.life -= dt;
      fx.x += (fx.vx || 0) * dt * 0.06;
      fx.y += (fx.vy || 0) * dt * 0.06;
      return fx.life > 0;
    });

    if (!Net._isOnline) {
      p.hp = Math.min(p.maxHp, p.hp + CFG.REGEN_HP * dt);
      p.mp = Math.min(p.maxMp, p.mp + CFG.REGEN_MP * dt);
    }
    if (typeof StateBus !== "undefined") {
      StateBus.publishPlayerVitals(p);
      StateBus.publishPlayerPosition(p, S.mapCode);
      StateBus.publishTarget(S.target);
    }
  } catch (e) {
    console.error("Game loop error:", e);
  }
}

function loop(ts) {
  const timing = gameClock.advance(ts);
  S.lastTs = ts;
  for (let step = 0; step < timing.steps; step += 1) update(gameClock.stepMs);
  Render.frame(timing.frameDelta, timing.alpha, ts);
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
  const preview = document.getElementById("creation-gender-preview");
  const previewName = document.getElementById("creation-gender-name");
  const previewDescription = document.getElementById("creation-gender-description");
  male?.classList.toggle("active", gender === "MALE");
  female?.classList.toggle("active", gender === "FEMALE");
  male?.setAttribute("aria-pressed", String(gender === "MALE"));
  female?.setAttribute("aria-pressed", String(gender === "FEMALE"));
  if (preview) {
    preview.src = `./assets/characters/cultivator-${gender.toLowerCase()}.png`;
    preview.alt = gender === "FEMALE" ? "Nhân vật nữ, áo trắng hồng" : "Nhân vật nam, áo xanh lam";
  }
  if (previewName) previewName.textContent = gender === "FEMALE" ? "Nữ hiệp thanh nhã" : "Kiếm khách trẻ";
  if (previewDescription) previewDescription.textContent = gender === "FEMALE"
    ? "Áo trắng hồng điểm vàng, mang theo linh lực dịu dàng mà mạnh mẽ."
    : "Áo xanh thanh nhã, sẵn sàng bước vào hành trình tu luyện.";
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

  const defaultRealm = CFG.REALMS.find((realm) => Number(realm.stt) === 1)
    || await Net.get(`${API.PATHS.data.realms}/stt/1`);
  if (!defaultRealm?.code) {
    alert("Không tải được cảnh giới khởi đầu từ máy chủ. Vui lòng thử lại sau.");
    return;
  }

  // Khi có phiên BE, chỉ gửi dữ liệu tạo nhân vật được server cho phép.
  // Map, spawn, chỉ số dẫn xuất, tiền và inventory do BE quyết định.
  if (authToken) {
    try {
      const response = await Net.post(API.PATHS.player.create, {
        name,
        gender: S.creation.gender,
        linhCan: S.creation.root.id,
        stats: { str, agi, vit, ene },
      });
      const player = response?.player || response;
      if (!player?.id || response?.error) {
        const status = Number(response?.httpStatus || 0);
        const outcomeMayHaveCommitted = response?.code === "NETWORK_ERROR" || status === 409 || status >= 500;
        if (outcomeMayHaveCommitted && S.session.user?.id) {
          const existing = await Net.get(API.PATHS.player.byUser(S.session.user.id));
          if (existing?.id && !existing.error) {
            await Auth._startGameWithData(existing);
            return;
          }
        }
        alert(response?.error || "Máy chủ chưa tạo được nhân vật. Vui lòng thử lại.");
        return;
      }
      await Auth._startGameWithData(player);
      return;
    } catch (error) {
      alert(error?.message || "Không thể kết nối máy chủ để tạo nhân vật.");
      return;
    }
  }

  let defaultWorldDto;
  try {
    defaultWorldDto = await Net.get(API.PATHS.worlds.default);
  } catch (error) {
    alert(error?.message || "Không thể tải bản đồ khởi đầu.");
    return;
  }
  if (!defaultWorldDto?.code) {
    alert(defaultWorldDto?.error || "Không tải được bản đồ khởi đầu. Vui lòng thử lại sau.");
    return;
  }
  const defaultMap = normalizeWorldDto(defaultWorldDto);
  const spawnX = Number.isFinite(Number(defaultWorldDto.spawnX)) ? Number(defaultWorldDto.spawnX) : Math.floor(defaultMap.w / 2);
  const spawnY = Number.isFinite(Number(defaultWorldDto.spawnY)) ? Number(defaultWorldDto.spawnY) : Math.floor(defaultMap.h / 2);

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
  enterGame(defaultMap, playerData.x, playerData.y);
}

// ════════════════════════════════════════════════════════════
// §16b · Enter Game
// ════════════════════════════════════════════════════════════
function enterGame(map, x, y) {
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
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
  if (map) {
    World.loadMap(map, x, y);
    UI.hideLoading();
  } else {
    UI.log("Đang chờ dữ liệu thế giới từ máy chủ...", "chat");
  }
  
  UI.buildInv();
  UI.update();
  Net.initializeAutoLoot();
  UI.initializeBuffEffectsToggle();
  UI.initializeHudLayout();
  UI.log("Bắt đầu hành trình...", "chat");
  UI.log("💡 Đánh quái → rơi xu/đồ. Hấp thu linh thạch → tu vi tăng.", "chat");
  UI.log("💡 Đủ tu vi → Phá cảnh giới. F → Tương tác NPC.", "chat");
  Net.connectSocket();
  Net.startAutoSave();

  // Chỉ snapshot cho demo mock; BE lưu qua mutation/API gameplay authority.
  if (!Net._beforeUnloadBound) {
    Net._beforeUnloadBound = true;
    window.addEventListener("beforeunload", () => Net.saveNow({ type: "browser_close" }));
  }

  requestAnimationFrame((ts) => {
    S.lastTs = ts;
    gameClock.reset(ts);
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
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  document.getElementById("screen-auth").classList.add("hidden");
  document.getElementById("screen-create").classList.add("hidden");
  document.getElementById("screen-game").style.display = "none";
  if (name === "auth")
    document.getElementById("screen-auth").classList.remove("hidden");
  else if (name === "create")
    document.getElementById("screen-create").classList.remove("hidden");
  else if (name === "game")
    // Gameplay HUD is an absolute overlay, not the legacy three-column grid.
    document.getElementById("screen-game").style.display = "block";
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

  const health = await Net._fetch(API.HEALTH, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  // The label must describe the active data source accurately.
  const authStatus = document.getElementById("auth-status");
  if (authStatus) {
    authStatus.textContent = (typeof MockBackend !== "undefined" && MockBackend?.enabled)
      ? "🧪 Đang dùng API mô phỏng trên trình duyệt"
      : health?.ok
        ? "✓ Đã kết nối máy chủ game"
        : "⚠ Chưa kết nối được máy chủ game";
    authStatus.title = API.BASE;
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
