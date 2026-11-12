/* ESM owns startup/config/state; feature scripts are temporarily bridged globals. */
(() => {
  const scripts = [
    { id: "runtime-config", src: "/runtime-config.js", dependsOn: [] },
    { id: "api", src: "./js/api.js?v=7", dependsOn: ["runtime-config"] },
    { id: "socket-client", src: "/socket.io/socket.io.js", dependsOn: ["api"] },
    { id: "auto-loot", src: "./js/auto-loot.js", dependsOn: [] },
    { id: "visual-effects", src: "./js/visual-effects.js?v=2", dependsOn: [] },
    { id: "utils", src: "./js/utils.js?v=3", dependsOn: [] },
    { id: "sound", src: "./js/sound.js?v=1", dependsOn: [] },
    { id: "balance", src: "./js/balance.js", dependsOn: [] },
    { id: "item-fx", src: "./js/item-fx.js?v=1", dependsOn: ["visual-effects", "balance"] },
    { id: "game-data", src: "./js/gamedata.js?v=10", dependsOn: ["balance"] },
    { id: "network", src: "./js/net.js?v=15", dependsOn: ["socket-client", "api", "auto-loot"] },
    { id: "auth", src: "./js/auth.js?v=4", dependsOn: ["network"] },
    { id: "world", src: "./js/world.js?v=12", dependsOn: ["network"] },
    { id: "monster", src: "./js/monster.js?v=3", dependsOn: ["world"] },
    { id: "skills", src: "./js/skills.js?v=13", dependsOn: ["world", "network"] },
    { id: "combat", src: "./js/combat.js?v=6", dependsOn: ["world", "network"] },
    { id: "cultivation", src: "./js/cultivation.js?v=4", dependsOn: ["network"] },
    { id: "inventory", src: "./js/inventory.js?v=5", dependsOn: ["network"] },
    { id: "alchemy", src: "./js/alchemy.js?v=1", dependsOn: ["inventory", "cultivation"] },
    { id: "forge", src: "./js/forge.js?v=1", dependsOn: ["inventory", "balance", "item-fx"] },
    { id: "shop", src: "./js/shop.js?v=6", dependsOn: ["inventory", "alchemy", "item-fx"] },
    { id: "render", src: "./js/render.js?v=20", dependsOn: ["visual-effects", "item-fx"] },
    { id: "skill-vfx", src: "./js/skill-vfx.js?v=23", dependsOn: ["api", "visual-effects"] },
    { id: "ui", src: "./js/ui.js?v=19", dependsOn: ["render", "visual-effects", "item-fx"] },
    { id: "hub", src: "./js/hub.js?v=1", dependsOn: ["network", "ui"] },
    { id: "quest", src: "./js/quest.js?v=4", dependsOn: ["network", "ui"] },
    { id: "input", src: "./js/input.js?v=10", dependsOn: ["world", "network"] },
    { id: "game-entry", src: "./js/game.js?v=15", dependsOn: ["socket-client", "api", "auto-loot", "visual-effects", "utils", "balance", "item-fx", "game-data", "network", "auth", "world", "monster", "skills", "combat", "cultivation", "inventory", "alchemy", "forge", "shop", "render", "skill-vfx", "ui", "hub", "quest", "input"] },
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
      script.onload = () => {
        if (module.id === "api") API.assertPersistentStorage().then(() => finish(), finish);
        else finish();
      };
      script.onerror = () => finish(new Error(`Không tải được ${module.src}`));
      document.body.appendChild(script);
    });
  }

  function publishClientFacade() {
    window.TuTien = Object.freeze(Object.assign(window.TuTien || {}, {
      API,
      CFG,
      State: S,
      StateBus,
      EntitySnapshots,
      AutoLoot,
      ItemFX,
      Net,
      Auth,
      GameData,
      World,
      Monster,
      SkillSystem,
      Combat,
      Cultivation,
      Inventory,
      AlchemyUI,
      ForgeUI,
      Shop,
      Render,
      UI,
      GameHub,
      QuestUI,
      Input,
      Sound: window.Sound,
      enterGame,
      showScreen,
      toggleAuto,
      createCharacter,
    }));
  }

  (async () => {
    try {
      loadingId = "core-modules";
      const [config, state, movement, snapshots, fixedStep, loader] = await Promise.all([
        import("./core/config.mjs?v=1"),
        import("./core/state.mjs?v=1"),
        import("./core/movement-feedback.mjs?v=1"),
        import("./core/snapshot-buffer.mjs?v=1"),
        import("./core/fixed-step.mjs?v=1"),
        import("./core/sequential-loader.mjs?v=1"),
      ]);
      exposeCore({ config, state, movement, snapshots, fixedStep });
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
