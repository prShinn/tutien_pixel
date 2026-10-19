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
      if (!isInput && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
      if (isInput) return;
      if (e.code === "KeyF" || e.key === "f" || e.key === "F") World.checkNpcInteract();
      if (e.code === "Escape") {
        S.target = null;
        if (S.player) {
          S.player.targetMovePos = null;
          S.player.combatMove = false;
        }
        Shop.close();
        DialogUI.close();
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
    window.addEventListener("resize", Input._resizeHandler);

    document
      .getElementById("game-canvas")
      .addEventListener("click", Input.onClick);

    document.getElementById("chat-inp").addEventListener("keydown", (e) => {
      if (e.code === "Enter") {
        Net.sendChat();
        e.preventDefault();
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
        if (socket?.connected) socket.emit("pickup_ground_item", { itemId: drop.id });
        else UI.log("Cần kết nối máy chủ để nhặt vật phẩm.", "system");
        return;
      }
    }
    for (const m of S.monsters) {
      if (!m.dead && dist(m.px, m.py, wx, wy) < 26) {
        S.target = m;
        if (S.player) {
          S.player.targetMovePos = null;
          const attackRange = CFG.BASIC_ATTACK_RANGE * CFG.TS + (CFG.ATTACK_RANGE_PADDING || 0);
          const inRange = dist(m.px, m.py, S.player.px, S.player.py) <= attackRange;
          S.player.combatMove = !inRange;
          if (inRange) Combat.attack(m);
        }
        return;
      }
    }
    for (const npc of S.npcs) {
      if (dist(npc.px, npc.py, wx, wy) < 26) {
        if (S.player) S.player.targetMovePos = null;
        if (npc.type === "shop") Shop.open(npc);
        else if (npc.type === "chest") Chest.open(npc);
        else DialogUI.open(npc);
        return;
      }
    }
    // Click vào nền đất: Di chuyển tới điểm chỉ định
    if (S.player) {
      const clickTx = Math.floor(wx);
      const clickTy = Math.floor(wy);
      if (clickTx >= 0 && clickTy >= 0 && clickTx < S.mapW && clickTy < S.mapH) {
        S.player.targetMovePos = { x: wx, y: wy };
        S.player.combatMove = false;
        S.target = null;
      }
    }
  },
};
