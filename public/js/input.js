"use strict";
// ════════════════════════════════════════════════════════════
// input.js — §14 Input Module
// ════════════════════════════════════════════════════════════

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
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      )
        e.preventDefault();
      if (e.code === "KeyF") World.checkNpcInteract();
      if (e.code === "Escape") {
        Shop.close();
        DialogUI.close();
      }
      if (e.code === "Enter") {
        const ci = document.getElementById("chat-inp");
        ci.focus();
      }
      if (e.code === "Digit1") SkillSystem.useSkill(0);
      if (e.code === "Digit2") SkillSystem.useSkill(1);
      if (e.code === "Digit3") SkillSystem.useSkill(2);
      if (e.code === "Digit4") SkillSystem.useSkill(3);
    });

    window.addEventListener("keyup", (e) => (Input.keys[e.code] = false));
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
    if (document.getElementById("shop-modal").classList.contains("open"))
      return;
    if (document.getElementById("dialog-modal").classList.contains("open"))
      return;
    const r = canvas.getBoundingClientRect();
    const wx = e.clientX - r.left + S.cam.x,
      wy = e.clientY - r.top + S.cam.y;
    for (const m of S.monsters)
      if (!m.dead && dist(m.px, m.py, wx, wy) < 26) {
        Combat.attack(m);
        return;
      }
    for (const npc of S.npcs)
      if (dist(npc.px, npc.py, wx, wy) < 26) {
        if (npc.type === "shop") Shop.open(npc);
        else if (npc.type === "chest") Chest.open(npc);
        else DialogUI.open(npc);
        return;
      }
  },
};
