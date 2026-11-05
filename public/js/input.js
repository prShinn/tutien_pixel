// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/input.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Xử lý tương tác đầu vào (Input Handler): Bắt sự kiện bàn phím (WASD / mũi tên di chuyển,
//      Space đánh thường, phím 1-4 dùng kỹ năng), click chuột vào quái để nhắm mục tiêu (Target Lock),
//      click vào NPC để trò chuyện, và xử lý co giãn màn hình (resize window).
// 2. CẤU HÌNH LIÊN QUAN:
//    - Input.keys dictionary.
//    - Phụ thuộc: State (S), SkillSystem, Shop, Net.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Chuyển đổi tọa độ click chuột trên màn hình thành tọa độ thế giới (world coordinates)
//      theo vị trí Camera và Display Scale để chọn đúng quái vật hoặc NPC.
// ════════════════════════════════════════════════════════════════════════════════════════

const Input = {
  keys: {},
  _lastMoveEmit: 0,
  _initialized: false,
  _resizeHandler: null,

  hasActiveKeys() {
    for (const key in Input.keys) if (Input.keys[key]) return true;
    return false;
  },

  stopMovement() {
    for (const key of Object.keys(Input.keys)) delete Input.keys[key];
    if (!S.player) return;
    World.clearPendingNpcInteraction?.();
    World.cancelPlayerMove(S.player);
    S.player.combatMove = false;
    S.player._spaceApproachTargetId = null;
    if (S.player.isMoving) {
      S.player.isMoving = false;
      Net.emitMove(true);
    }
  },

  init() {
    if (Input._initialized) return;
    Input._initialized = true;

    Input._resizeHandler = () => {
      const area = document.getElementById("canvas-area");
      if (!canvas || !ctx || !area) return;
      cW = area.clientWidth;
      cH = area.clientHeight;
      canvas.width = cW;
      canvas.height = cH;
      ctx.imageSmoothingEnabled = false;
    };

    window.addEventListener("keydown", (e) => {
      Input.keys[e.code] = true;
      if (e.key) Input.keys[e.key.toLowerCase()] = true;
      const active = document.activeElement;
      const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.id === "chat-inp" && active.offsetParent !== null;
      const isFormControl = active?.matches?.("input, textarea, select, [contenteditable='true']");
      if (e.code === "Escape" && isInput) {
        e.preventDefault();
        active.blur();
        Input.stopMovement();
        return;
      }
      if (!isInput && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
      if (isInput) return;
      if (e.code === "KeyQ" && !e.repeat && !isFormControl) {
        e.preventDefault();
        QuestUI.toggle();
      }
      if (e.code === "KeyF" || e.key === "f" || e.key === "F") World.checkNpcInteract();
      if (!e.repeat && !isFormControl && ["KeyB", "KeyC"].includes(e.code)) {
        e.preventDefault();
        UI.toggleKpahMenu();
      }
      if (!e.repeat && e.code === "Tab" && !isFormControl) {
        e.preventDefault();
        const player = S.player;
        if (!player) return;
        const targets = (S.monsters || [])
          .filter((monster) => monster && !monster.dead && Number(monster.hp) > 0)
          .sort((a, b) => dist(a.px, a.py, player.px, player.py) - dist(b.px, b.py, player.px, player.py));
        if (targets.length) {
          const currentIndex = targets.indexOf(S.target);
          S.target = targets[(currentIndex + 1) % targets.length];
          if (player) {
            player._spaceApproachTargetId = null;
            player.combatMove = false;
          }
          UI.updateTargetHud(S.target);
        }
      }
      if (e.code === "Escape") {
        S.target = null;
        if (S.player) {
          World.clearPendingNpcInteraction?.();
          World.cancelPlayerMove(S.player);
          S.player.combatMove = false;
        }
        Shop.close();
        DialogUI.close();
        const menu = document.getElementById("kpah-menu-modal");
        if (menu) menu.style.display = "none";
        const continent = document.getElementById("continent-modal");
        if (continent) continent.style.display = "none";
        QuestUI.close();
      }
      if (e.code === "Enter") {
        const ci = document.getElementById("chat-inp");
        if (ci) ci.focus();
      }
      if (e.code === "Digit1" || e.key === "1") SkillSystem.useSkill(0);
      if (e.code === "Digit2" || e.key === "2") SkillSystem.useSkill(1);
      if (e.code === "Digit3" || e.key === "3") SkillSystem.useSkill(2);
      if (e.code === "Digit4" || e.key === "4") SkillSystem.useSkill(3);
    });

    window.addEventListener("keyup", (e) => {
      Input.keys[e.code] = false;
      if (e.key) Input.keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener("blur", () => {
      // Tránh nhân vật tiếp tục chạy sau khi người chơi Alt-Tab hoặc mất focus cửa sổ.
      Input.stopMovement();
    });
    window.addEventListener("resize", Input._resizeHandler);

    document
      .getElementById("game-canvas")
      .addEventListener("click", Input.onClick);

    document.getElementById("chat-inp").addEventListener("keydown", (e) => {
      if (e.code === "Enter") {
        Net.sendChat();
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.blur();
      }
    });
  },

  onClick(e) {
    if (document.activeElement && typeof document.activeElement.blur === "function" && document.activeElement !== canvas) {
      document.activeElement.blur();
    }
    if (document.getElementById("shop-modal")?.classList.contains("open"))
      return;
    if (document.getElementById("dialog-modal")?.classList.contains("open"))
      return;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left) / CFG.DS + S.cam.x;
    const wy = (e.clientY - r.top) / CFG.DS + S.cam.y;
    for (const drop of S.groundItems || []) {
      const dx = Number(drop.x || 0) * CFG.TS + CFG.TS / 2;
      const dy = Number(drop.y || 0) * CFG.TS + CFG.TS / 2;
      if (dist(dx, dy, wx, wy) < 22) {
        World.clearPendingNpcInteraction?.();
        if (S.player) {
          World.cancelPlayerMove(S.player);
          S.player.combatMove = false;
        }
        if (socket?.connected || (typeof MockBackend !== "undefined" && MockBackend?.enabled)) Net.pickupLoot(drop.id);
        else UI.log("Cần kết nối máy chủ để nhặt vật phẩm.", "system");
        return;
      }
    }
    for (const m of S.monsters) {
      if (!m.dead && dist(m.px, m.py, wx, wy) < 26) {
        S.target = m;
        World.clearPendingNpcInteraction?.();
        if (S.player) {
          S.player._spaceApproachTargetId = null;
          World.cancelPlayerMove(S.player);
          const attackRange = CFG.BASIC_ATTACK_RANGE * CFG.TS + (CFG.ATTACK_RANGE_PADDING || 0);
          const inRange = dist(m.px, m.py, S.player.px, S.player.py) <= attackRange;
          S.player.combatMove = !inRange;
          if (inRange) World.cancelPlayerMove(S.player);
          else World.planCombatApproach(S.player, m, Date.now());
          if (inRange) Combat.attack(m);
        }
        return;
      }
    }
    for (const npc of S.npcs) {
      if (dist(npc.px, npc.py, wx, wy) < 26) {
        World.clearPendingNpcInteraction?.();
        if (!World.approachNpc(npc)) UI.notify("Không tìm được đường đến nhân vật này.", "warning");
        return;
      }
    }
    // Click vào nền đất: Di chuyển tới điểm chỉ định
    if (S.player) {
      const clickTx = Math.floor(wx);
      const clickTy = Math.floor(wy);
      if (clickTx >= 0 && clickTy >= 0 && clickTx < S.mapW && clickTy < S.mapH) {
        World.clearPendingNpcInteraction?.();
        S.target = null;
        S.player.combatMove = false;
        S.player._spaceApproachTargetId = null;
        if (!World.planPlayerMove(S.player, wx, wy)) {
          UI.notify("Không tìm được đường đến vị trí này.", "warning");
          return;
        }
      }
    }
  },
};
