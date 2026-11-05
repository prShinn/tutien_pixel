/* ESM owns startup/config/state; feature scripts are temporarily bridged globals. */
(() => {
  const scripts = [
    { id: "socket-client", src: "/socket.io/socket.io.js", dependsOn: [] },
    { id: "api", src: "./js/api.js?v=5", dependsOn: [] },
    { id: "auto-loot", src: "./js/auto-loot.js", dependsOn: [] },
    { id: "visual-effects", src: "./js/visual-effects.js?v=2", dependsOn: [] },
    { id: "utils", src: "./js/utils.js", dependsOn: [] },
    { id: "balance", src: "./js/balance.js", dependsOn: [] },
    { id: "game-data", src: "./js/gamedata.js?v=4", dependsOn: ["balance"] },
    { id: "network", src: "./js/net.js?v=7", dependsOn: ["socket-client", "api", "auto-loot"] },
    { id: "auth", src: "./js/auth.js?v=2", dependsOn: ["network"] },
    { id: "world", src: "./js/world.js?v=3", dependsOn: ["network"] },
    { id: "monster", src: "./js/monster.js?v=3", dependsOn: ["world"] },
    { id: "skills", src: "./js/skills.js?v=8", dependsOn: ["world", "network"] },
    { id: "combat", src: "./js/combat.js?v=3", dependsOn: ["world", "network"] },
    { id: "cultivation", src: "./js/cultivation.js?v=3", dependsOn: ["network"] },
    { id: "inventory", src: "./js/inventory.js?v=2", dependsOn: ["network"] },
    { id: "shop", src: "./js/shop.js?v=3", dependsOn: ["inventory"] },
    { id: "render", src: "./js/render.js?v=12", dependsOn: ["visual-effects"] },
    { id: "skill-vfx", src: "./js/skill-vfx.js?v=16", dependsOn: ["visual-effects"] },
    { id: "ui", src: "./js/ui.js?v=8", dependsOn: ["render", "visual-effects"] },
    { id: "quest", src: "./js/quest.js?v=3", dependsOn: ["network", "ui"] },
    { id: "input", src: "./js/input.js?v=3", dependsOn: ["world", "network"] },
    { id: "game-entry", src: "./js/game.js?v=11", dependsOn: ["socket-client", "api", "auto-loot", "visual-effects", "utils", "balance", "game-data", "network", "auth", "world", "monster", "skills", "combat", "cultivation", "inventory", "shop", "render", "skill-vfx", "ui", "quest", "input"] },
  ];
  const timeoutMs = 20000;
  const errorPanel = document.getElementById("client-boot-error");
  const errorDetail = document.getElementById("client-boot-error-detail");
  let bootFailed = false;
  let booting = true;
  let loadingId = "bootstrap";
  let activeScriptError = null;

  function showFailure(error) {
    if (bootFailed) return;
    bootFailed = true;
    if (errorDetail) errorDetail.textContent = error?.message || "Tải tài nguyên game thất bại.";
    if (errorPanel) errorPanel.hidden = false;
  }

  window.addEventListener("error", (event) => {
    if (!booting || bootFailed) return;
    if (event.error) {
      activeScriptError = new Error(`Lỗi khi khởi tạo ${loadingId}: ${event.message || event.error.message}`);
    } else if (event.target instanceof HTMLScriptElement) {
      activeScriptError = new Error(`Không tải được tài nguyên: ${loadingId}`);
    }
  }, true);

  function exposeCore(core) {
    const { config, state, movement, snapshots, fixedStep } = core;
    const context = state.getCanvasContext();
    const aliases = {
      CFG: { get: () => config.CFG },
      S: { get: () => state.S },
      StateBus: { get: () => state.StateBus },
      EntitySnapshots: { get: () => snapshots.EntitySnapshots },
      FixedStepClock: { get: () => fixedStep },
      MovementFeedback: { get: () => movement.MovementFeedback },
      Linh_CAN: { get: () => config.getLinhCan(), set: config.setLinhCan },
      canvas: { get: () => context.canvas, set: (value) => { context.canvas = value; } },
      ctx: { get: () => context.ctx, set: (value) => { context.ctx = value; } },
      cW: { get: () => context.cW, set: (value) => { context.cW = value; } },
      cH: { get: () => context.cH, set: (value) => { context.cH = value; } },
    };
    for (const [name, descriptor] of Object.entries(aliases)) {
      const current = Object.getOwnPropertyDescriptor(window, name);
      if (current && !current.configurable) {
        if (current.get === descriptor.get && current.set === descriptor.set) continue;
        throw new Error(`Không thể tạo alias tương thích cho ${name}`);
      }
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get: descriptor.get,
        set: descriptor.set,
      });
    }
    window.TuTien = Object.assign(window.TuTien || {}, {
      CFG: config.CFG,
      State: state.S,
      StateBus: state.StateBus,
      EntitySnapshots: snapshots.EntitySnapshots,
      FixedStepClock: fixedStep,
      MovementFeedback: movement.MovementFeedback,
      CoreModules: Object.freeze({ config, state, movement, snapshots, fixedStep }),
    });
  }

  function loadScript(module) {
    loadingId = module.id;
    activeScriptError = null;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let settled = false;
      const timeout = window.setTimeout(() => finish(new Error(`Quá thời gian tải ${module.id}`)), timeoutMs);

      function finish(error) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        script.onload = null;
        script.onerror = null;
        if (error || activeScriptError) reject(error || activeScriptError);
        else resolve();
      }

      script.src = module.src;
      script.async = false;
      script.dataset.gameModule = module.id;
      script.onload = () => finish();
      script.onerror = () => finish(new Error(`Không tải được ${module.src}`));
      document.body.appendChild(script);
    });
  }

  function publishClientFacade() {
    window.TuTien = Object.freeze(Object.assign(window.TuTien || {}, {
      API,
      MockBackend: window.MockBackend,
      CFG,
      State: S,
      StateBus,
      EntitySnapshots,
      AutoLoot,
      Net,
      Auth,
      GameData,
      World,
      Monster,
      SkillSystem,
      Combat,
      Cultivation,
      Inventory,
      Shop,
      Render,
      UI,
      QuestUI,
      Input,
      enterGame,
      showScreen,
      toggleAuto,
      createCharacter,
    }));
  }

  (async () => {
    try {
      loadingId = "core-modules";
      const [config, state, movement, snapshots, fixedStep, loader, mockBackendModule] = await Promise.all([
        import("./core/config.mjs?v=1"),
        import("./core/state.mjs?v=1"),
        import("./core/movement-feedback.mjs?v=1"),
        import("./core/snapshot-buffer.mjs?v=1"),
        import("./core/fixed-step.mjs?v=1"),
        import("./core/sequential-loader.mjs?v=1"),
        import("./core/mock-backend.mjs?v=3"),
      ]);
      exposeCore({ config, state, movement, snapshots, fixedStep });
      let storage = null;
      let session = null;
      try { storage = window.localStorage; } catch { }
      try { session = window.sessionStorage; } catch { }
      window.MockBackend = mockBackendModule.installMockBackend({
        scope: window,
        fetchImpl: window.fetch.bind(window),
        storage,
        session,
      });
      await window.MockBackend.ready;
      await loader.loadSequentially(scripts, loadScript);
      publishClientFacade();
      booting = false;
    } catch (error) {
      booting = false;
      showFailure(error);
      console.error("Game bootstrap failed:", error.message);
    }
  })();
})();
