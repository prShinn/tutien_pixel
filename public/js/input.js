const keys = {};
function initInput() {
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        e.code,
      )
    )
      e.preventDefault();
    if (e.code === "KeyF") WorldMod.checkNpc();
    if (e.code === "Escape")
      document
        .querySelectorAll(".mo.open")
        .forEach((m) => m.classList.remove("open"));
    // if (e.code === "Digit1") SkillMod.use(0);
    // if (e.code === "Digit2") SkillMod.use(1);
    // if (e.code === "Digit3") SkillMod.use(2);
    // if (e.code === "Digit4") SkillMod.use(3);
    // if (e.code === "KeyA") CultMod.absorb();
    // if (e.code === "KeyB") CultMod.breakthrough();
    // if (e.code === "KeyM") G.toggleAuto("med");
    // if (e.code === "KeyS") G.save();
  });
  window.addEventListener("keyup", (e) => (keys[e.code] = false));
  cv.addEventListener("click", (e) => {
    if (document.querySelector(".mo.open")) return;
    const r = cv.getBoundingClientRect();
    const wx = e.clientX - r.left + GameState.cam.x,
      wy = e.clientY - r.top + GameState.cam.y;
    // Use spatial grid for click detection
    const near = monGrid.query(wx, wy, GameState.TS);
    for (const m of near)
      if (!m.dead && dist(m.px, m.py, wx, wy) < 26) {
        CombatMod.attack(m);
        return;
      }
    for (const npc of GameState.npcs)
      if (dist(npc.px, npc.py, wx, wy) < 26) {
        // G.openNpc(npc);
        return;
      }
  });
}
