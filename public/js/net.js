// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/net.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Cầu nối mạng (Networking & Synchronization Client): Giao tiếp HTTP REST API (get, post,
//      put) và Socket.io thời gian thực. Đồng bộ hóa di chuyển, trạng thái phòng chơi (world_state),
//      quái vật (monster_update), sát thương (combat_hit/combat_error), chuyển map, chat.
// 2. CẤU HÌNH LIÊN QUAN:
//    - sessionStorage("tu_tien_token"), socket.io client.
//    - Phụ thuộc: State (S), World, Render, UI, Combat.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Chống lag/spam: Throttle gửi gói tin di chuyển, debounced auto-save định kỳ.
//    - Server-authoritative: Nhận movement_corrected khi phát hiện sai lệch vị trí hoặc va chạm.
//    - Client-side prediction & reconciliation: Hòa giải trạng thái mượt mà khi đổi map/mất mạng.
// ════════════════════════════════════════════════════════════════════════════════════════

let socket = null;
let authToken = sessionStorage.getItem("tu_tien_token");

function effectColor(effect) {
  return ({
    shield: "#72d7ff", buff_def: "#72d7ff", buff_vitals: "#72d7ff",
    buff_atk: "#ff8b55", buff_crit: "#ffd166", buff_spd: "#8ff0ff", buff_cast: "#c79bff",
    buff_hp_regen: "#7ee787", buff_mp_regen: "#75a7ff",
  })[effect] || "#ffd166";
}

const Net = {
  _saveTimer: null,
  _isOnline: false,
  _pendingRequests: new Map(),
  _savePromise: null,
  _mapChangeTimer: null,
  _autoLootElapsed: 0,
  _autoLootEnabled: AutoLoot.isEnabled(),
  COMMAND_TIMEOUT_MS: 8000,

  command(type, payload = {}, onAck) {
    if (!socket?.connected) return Promise.resolve({ ok: false, error: { code: "OFFLINE", message: "Chưa kết nối máy chủ" } });
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        const response = { ok: false, requestId, command: type, error: { code: "COMMAND_TIMEOUT", message: "Máy chủ không phản hồi, vui lòng thử lại." } };
        if (["combat.attack", "combat.skill"].includes(type)) {
          S.combatPending = false;
          Net.cancelLocalCast();
        }
        if (type === "map.change" && S.player) {
          S.player.isTeleporting = false;
          S.player.portalLocked = false;
          UI.hideLoading();
        }
        UI.log(`⚠ ${response.error.message}`, "system");
        onAck?.(response);
        resolve(response);
      }, Net.COMMAND_TIMEOUT_MS);
      socket.emit("game_command", { requestId, type, payload }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (!response?.ok && response?.error?.message) {
          if (["combat.attack", "combat.skill"].includes(type)) {
            S.combatPending = false;
            Net.cancelLocalCast();
          }
          if (type === "map.change" && S.player) {
            S.player.isTeleporting = false;
            S.player.portalLocked = false;
            UI.hideLoading();
          }
          UI.log(`⚠ ${response.error.message}`, "system");
        }
        onAck?.(response);
        resolve(response);
      });
    });
  },

  _requestKey(method, path, body) {
    const payload = typeof body === "string" ? body : JSON.stringify(body || "");
    return `${method}:${path}:${payload}`;
  },

  async _fetch(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body || "";
    const key = this._requestKey(method, path, body);
    if (this._pendingRequests.has(key)) {
      return this._pendingRequests.get(key);
    }
    const promise = (async () => {
      const res = await fetch(API.BASE + path, opts);
      return res.json();
    })();
    this._pendingRequests.set(key, promise);
    try {
      return await promise;
    } finally {
      this._pendingRequests.delete(key);
    }
  },

  async get(path) {
    return this._fetch(path, {
      headers: { Authorization: "Bearer " + authToken },
    });
  },

  async post(path, body) {
    return this._fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + authToken,
      },
      body: JSON.stringify(body),
    });
  },

  async put(path, body) {
    return this._fetch(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + authToken,
      },
      body: JSON.stringify(body),
    });
  },

  // ── Save ──
  async saveNow(event) {
    if (!authToken || !S.player) return Promise.resolve();

    // Tránh việc gọi save liên tục tạo ra hàng đợi vô hạn
    if (this._savePromise) {
      // Nếu đang có một yêu cầu lưu, ta ghi nhận là cần lưu thêm một lần nữa sau khi xong
      this._needsSaveAgain = true;
      return this._savePromise;
    }

    this._savePromise = (async () => {
      const p = S.player;
      const trangBi = p.trangBi || {
        vuKhi: null, ao: null, giay: null, mu: null,
        tay: null, nhan: null, vong: null,
      };

      const playerData = {
        id: p.id,
        userId: p.userId,
        name: p.name,
        linhCan: p.linhCan,
        maCanhGioi: p.maCanhGioi || p.canhGioi?.code,
        tangTuVi: p.tangTuVi || p.stage || 1,
        tuViHienTai: Math.floor(p.tuViHienTai || 0),
        tuViLenCap: Math.floor(p.tuViLenCap || 0),
        tuViLinhCan: Math.floor(p.tuViLinhCan || 0),
        stats: p.stats || { str: 5, agi: 5, vit: 5, ene: 5 },
        hp: Math.floor(p.hp || 0),
        maxHp: p.maxHp || 100,
        mp: Math.floor(p.mp || 0),
        maxMp: p.maxMp || 100,
        xu: Math.floor(p.xu || 0),
        x: Math.floor(p.x || 0),
        y: Math.floor(p.y || 0),
        mapCode: S.mapCode || p.mapCode,
        mapId: p.mapId || S.mapCode || p.mapCode,
        jsonIventory: JSON.stringify(S.inventory || []),
        skills: JSON.stringify((p.skills || []).map(sk => mapFESkillToBE(sk))),
        equipment: p.equipment || {},
        equip_slot: JSON.stringify(trangBi),
        faction: p.faction || "CHINH",
        guildId: p.guildId || null,
        crit: String(p.crit || "0"),
        speed: p.speed || 1,
        _event: event ? (event.type || "manual") : "auto"
      };

      try {
        const res = await this.put(API.PATHS.player.update(playerData.id), playerData);
        if (res?.id || res?.ok) {
          if (event) console.log("💾 Đã lưu dữ liệu (Map/Event):", event);
        }
      } catch (err) {
        console.error("⚠ Lỗi lưu dữ liệu:", err);
      } finally {
        this._savePromise = null;
        // Nếu trong lúc lưu có yêu cầu mới, thực hiện lưu tiếp một lần cuối
        if (this._needsSaveAgain) {
          this._needsSaveAgain = false;
          this.saveNow({ type: "follow_up" });
        }
      }
    })();
    return this._savePromise;
  },

  startAutoSave() {
    clearInterval(Net._saveTimer);
    Net._saveTimer = setInterval(() => Net.saveNow(), API.AUTO_SAVE_MS);
  },

  // ── Socket.io ──
  connectSocket() {
    if (!authToken) return;
    if (socket?.connected || socket?.active) return;
    try {
      socket = io(API.SOCKET_URL, {
        auth: { token: authToken },
        timeout: 5000,
        reconnection: true,
        reconnectionAttempts: 10,
      });

      socket.on("connect", () => {
        Net._isOnline = true;
        Net._setBadge(true);
        const p = S.player;
        if (p) {
          const mCode = p.mapCode || p.mapId || S.mapCode || "";
          Net.command("world.join", {
          mapCode: mCode,
            x: p.x,
            y: p.y,
            mapVersion: S.mapVersion || 0,
            hasMap: Boolean(S.tiles?.length && S.mapCode === String(mCode).toLowerCase()),
          });
          UI.showLoading();
        }
        UI.log("🌐 Đã kết nối máy chủ!", "system");
      });

      socket.on("disconnect", () => {
        S.combatPending = false;
        Net.cancelLocalCast();
        clearTimeout(Net._mapChangeTimer);
        Net._mapChangeTimer = null;
        if (S.player) {
          S.player.isTeleporting = false;
          S.player.portalLocked = false;
        }
        UI.hideLoading();
        Net.saveNow();
        Net._isOnline = false;
        Net._setBadge(false);
        Net._clearOthers();
        UI.log("⚠ Mất kết nối server, đang thử kết nối lại...", "system");
      });

      socket.on("connect_error", (err) => {
        if (err?.message === "Token không hợp lệ" || err?.message === "Không có token") {
          sessionStorage.removeItem("tu_tien_token");
          authToken = null;
        }
        Net._setBadge(false);
      });

      // ── World Init (Server Authoritative) ──
      socket.on("world_init", async (data) => {
        try {
          console.log("[Net] Nhận world_init", { mapCode: data.mapCode || data.map?.code, players: data.players?.length || 0, monsters: data.monsters?.length || 0, mapIncluded: Boolean(data.map) });
          if (data.player && S.player) {
            const authoritative = data.player;
            Object.assign(S.player, {
              hp: authoritative.hp, maxHp: authoritative.maxHp, mp: authoritative.mp, maxMp: authoritative.maxMp,
              xu: authoritative.xu,
              x: Number.isFinite(Number(authoritative.x)) ? Number(authoritative.x) : S.player.x,
              y: Number.isFinite(Number(authoritative.y)) ? Number(authoritative.y) : S.player.y,
              mapCode: authoritative.mapCode || S.player.mapCode,
              tuViHienTai: authoritative.tuViHienTai, tuViLenCap: authoritative.tuViLenCap,
              tuViLinhCan: authoritative.tuViLinhCan, tangTuVi: authoritative.tangTuVi,
              stats: authoritative.stats, combatPower: authoritative.combatPower,
              learnedSkills: authoritative.learnedSkills, equippedSkills: authoritative.equippedSkills,
              equipment: authoritative.equipment || S.player.equipment,
            });
            S.player.px = S.player.x * CFG.TS + CFG.TS / 2;
            S.player.py = S.player.y * CFG.TS + CFG.TS / 2;
            S.player.lastEmitX = S.player.x;
            S.player.lastEmitY = S.player.y;
            try { S.inventory = typeof authoritative.jsonIventory === "string" ? JSON.parse(authoritative.jsonIventory || "[]") : (authoritative.inventory || S.inventory); } catch { }
          }
          const targetMapCode = String(data.mapCode || S.player?.mapCode || "").toLowerCase();
          if (data.map) {
            const map = normalizeWorldDto(data.map);
            if (map && S.player) {
              World.loadMap(map, S.player.x, S.player.y);
              console.log("[Net] Bản đồ đã được nạp và chuẩn hóa.");
            }
          } else if (S.tiles?.length && S.mapCode === targetMapCode) {
            // Bản đồ hiện tại đã khớp
          } else if (targetMapCode) {
            const mapDto = await Net.get(API.PATHS.worlds.byCode(targetMapCode));
            const map = normalizeWorldDto(mapDto);
            if (map && S.player) World.loadMap(map, S.player.x, S.player.y);
          }
          UI.hideLoading();

          // Nạp người chơi khác
          const players = data.players || [];
          console.log(`[Net] Đồng bộ ${players.length} người chơi khác.`);
          for (const p of players) {
            if (p && p.id !== socket.id) Net._upsertOther(p);
          }

          // Nạp trạng thái quái vật (nếu có)
          const mList = Array.isArray(data.monsters) ? data.monsters : [];
          console.log(`[Net] Đồng bộ ${mList.length} quái vật.`);
          S.monsters = mList.map((mData) => {
            const x = Number(mData.x ?? mData.spawnX ?? 0);
            const y = Number(mData.y ?? mData.spawnY ?? 0);
            return Monster.make(mData, x, y, mData.id);
          });
          S.groundItems = Array.isArray(data.groundItems) ? data.groundItems : [];

          UI.update();
        } catch (e) { console.error("world_init error:", e); }
      });

      // ── World state (players on same map) ──
      socket.on("world_state", (data) => {
        try {
          const players = data?.players || (Array.isArray(data) ? data : []);
          for (const p of players) {
            if (p && p.id !== socket.id) Net._upsertOther(p);
          }
        } catch (e) { console.error("world_state error:", e); }
      });

      socket.on("player_join", (p) => {
        try {
          if (p && p.id !== socket.id) {
            Net._upsertOther(p);
            UI.update();
            UI.log(`👤 ${p.username || "Người chơi ẩn danh"} gia nhập bản đồ`, "system");
          }
        } catch (e) { console.error("player_join error:", e); }
      });

      socket.on("player_leave", (data) => {
        const pid = data.id || data.socketId || data.userId;
          S.players.delete(pid);
      });

      socket.on("player_move", (data) => {
        try {
          const pid = data.id || data.socketId || data.userId;
          if (!pid) return;

          if (!S.players.has(pid)) {
            // Nếu người chơi này chưa có trong danh sách, thêm vào luôn
            Net._upsertOther(data);
          }

          const op = S.players.get(pid);
          const prevX = op.tx ?? op.x ?? data.x;
          const prevY = op.ty ?? op.y ?? data.y;
          const moveDx = Number(data.x) - Number(prevX);
          const moveDy = Number(data.y) - Number(prevY);
          if (moveDx || moveDy) {
            op.direction = Math.abs(moveDx) >= Math.abs(moveDy)
              ? (moveDx < 0 ? "left" : "right")
              : (moveDy < 0 ? "up" : "down");
          }
          if (!op.isMoving) op.walkDistance = 0;
          op.isMoving = true;
          clearTimeout(op._moveTimer);
          op._moveTimer = setTimeout(() => { op.isMoving = false; }, 180);
          // Lưu vị trí đích để nội suy (interpolation)
          op.tx = data.x;
          op.ty = data.y;
          op.tpx = data.x * CFG.TS + CFG.TS / 2;
          op.tpy = data.y * CFG.TS + CFG.TS / 2;

          // Nếu đứng quá xa (> 4 ô), nhảy tới luôn để tránh đơ
          const dx = op.tpx - op.px;
          const dy = op.tpy - op.py;
          if (Math.hypot(dx, dy) > CFG.NET_SNAP_DISTANCE) {
            op.px = op.tpx;
            op.py = op.tpy;
          }
        } catch (e) { console.error("player_move error:", e); }
      });

      socket.on("movement_corrected", ({ x, y, reason }) => {
        if (!S.player || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return;
        MovementFeedback.reconcile(S.player, Number(x), Number(y));
        if (reason) UI.log(`⚠ ${reason}`, "system");
      });

      socket.on("player_map", (data) => {
        const pid = data.id || data.socketId || data.userId;
        const newMapCode = data.mapCode || data.mapId;
        if (S.players.has(pid)) {
          const op = S.players.get(pid);
          if ((newMapCode || "").toLowerCase() !== (S.mapCode || "").toLowerCase()) {
            S.players.delete(pid);
          } else {
            op.x = data.x;
            op.y = data.y;
            op.mapCode = newMapCode;
          }
        }
      });

      // ── Monster Synchronization ──
      socket.on("monster_state_update", ({ monsters }) => {
        if (!monsters || !Array.isArray(monsters)) return;
        for (const mData of monsters) {
          const m = S.monsters.find(mon => mon.id === mData.id);
          if (m) {
            m.tx = mData.x;
            m.ty = mData.y;
            m.tpx = mData.x * CFG.TS + CFG.TS / 2;
            m.tpy = mData.y * CFG.TS + CFG.TS / 2;
            m.hp = Number(mData.hp) ?? m.hp;
            m.state = mData.state || m.state;
            m.dead = !!mData.dead;
          }
        }
      });

      socket.on("monster_update", ({ monsters }) => {
        if (!Array.isArray(monsters)) return;
        for (const data of monsters) {
          const m = S.monsters.find((mon) => mon.id === data.id);
          if (!m) continue;
          const previousState = m.state;
          m.tpx = Number(data.x) * CFG.TS + CFG.TS / 2;
          m.tpy = Number(data.y) * CFG.TS + CFG.TS / 2;
          m.hp = Number(data.hp ?? m.hp);
          m.maxHp = Number(data.maxHp || m.maxHp);
          m.state = data.state || m.state;
          m.targetId = data.targetId || null;
          m.statusEffects = Array.isArray(data.statusEffects) ? data.statusEffects : [];
          m.dead = !!data.dead;
          if (!m.dead && m.state === "attack" && previousState !== "attack") {
            const target = data.targetId === socket.id ? S.player : S.players.get(data.targetId);
            if (target && typeof Monster !== "undefined") Monster.playAttack(m, target, { targetId: data.targetId });
            else {
              m.attackStartedAt = Date.now();
              m.attackUntil = m.attackStartedAt + 360;
            }
          }
          if (!m.dead) m.respawnT = m.spawnCD || 10;
        }
      });

      socket.on("player_combat_result", ({ targetId, attackerId, damage, miss, hp, maxHp }) => {
        const monster = S.monsters.find((entry) => entry.id === attackerId);
        const targetActor = targetId === socket.id ? S.player : S.players.get(targetId);
        if (monster && targetActor && typeof Monster !== "undefined") {
          Monster.playAttack(monster, targetActor, { targetId, damage, miss });
        }
        if (targetActor && !miss && Number(damage) > 0) {
          targetActor.hitUntil = Date.now() + 220;
          targetActor.animState = "hurt";
          targetActor.animStartedAt = Date.now();
          targetActor.animUntil = targetActor.animStartedAt + 260;
          if (monster) targetActor.hurtDirection = monster.px < targetActor.px ? 1 : -1;
        }
        if (targetId !== socket.id || !S.player) return;
        S.player.hp = Number(hp ?? S.player.hp);
        if (maxHp) S.player.maxHp = Number(maxHp);
        if (typeof SkillVFX === "undefined") {
          Render.combatFx(S.player.px, S.player.py, miss ? "miss" : "hurt", miss ? "#a8ff8a" : "#ff5268", miss ? 0.7 : 1);
        }
        if (!miss && Number(damage) > 0) {
          S.cameraShake = { until: Date.now() + 90, power: 1.8 };
        }
        Render.floatDmg(S.player.px, S.player.py, -36, miss ? "MISS" : `-${damage}`, miss ? "#88ff88" : "#ff4444");
        if (S.player.hp <= 0) S.player.hp = Math.floor(S.player.maxHp * 0.25);
      });

      socket.on("monster_death", ({ id }) => {
        const m = S.monsters.find((mon) => mon.id === id);
        if (m) {
          m.dead = true;
          m.hp = 0;
          if (S.target?.id === id) {
            S.target = null;
            if (S.player) S.player.combatMove = false;
          }
        }
      });

      socket.on("monster_spawn", ({ monster }) => {
        if (!monster?.id) return;
        const existing = S.monsters.find(m => m.id === monster.id);
        const fresh = Monster.make(monster, Number(monster.x ?? monster.spawnX ?? 0), Number(monster.y ?? monster.spawnY ?? 0), monster.id);
        if (existing) Object.assign(existing, fresh, { dead: !!monster.dead });
        else S.monsters.push(fresh);
      });

      socket.on("ground_loot_spawn", ({ drops }) => {
        if (!Array.isArray(drops)) return;
        for (const drop of drops) {
          if (!drop?.id) continue;
          const existing = S.groundItems.find((item) => item.id === drop.id);
          if (existing) Object.assign(existing, drop);
          else S.groundItems.push(drop);
        }
        UI.pushLoot({ items: drops.map((drop) => ({ ...(drop.item || {}), id: drop.id, name: drop.kind === "xu" ? `${drop.xu} xu` : (drop.item?.name || drop.item?.id), icon: drop.kind === "xu" ? "💰" : drop.item?.icon, count: drop.kind === "xu" ? 1 : drop.count })) }, "Rơi");
      });
      socket.on("ground_loot_state", ({ items }) => {
        S.groundItems = Array.isArray(items) ? items : [];
        AutoLoot.retain(S.groundItems.map((item) => item.id));
      });
      socket.on("ground_loot_removed", ({ itemId }) => {
        S.groundItems = S.groundItems.filter((item) => item.id !== itemId);
        AutoLoot.complete(itemId);
      });
      socket.on("ground_loot_picked", ({ item, player, loot }) => {
        S.groundItems = S.groundItems.filter((entry) => entry.id !== item?.id);
        if (item?.id !== undefined) AutoLoot.complete(item.id);
        if (player && S.player) {
          Object.assign(S.player, player);
          try { S.inventory = typeof player.jsonIventory === "string" ? JSON.parse(player.jsonIventory || "[]") : (player.inventory || S.inventory); } catch { }
        }
        UI.pushLoot(loot, "Nhặt");
        UI.buildInv(); UI.update();
      });

      socket.on("combat_result", (payload) => {
        S.combatPending = false;
        const { attackerId, skillCode, skillName, mp, cooldownMs, gcdMs, loot } = payload;
        const actor = attackerId === socket.id ? S.player : S.players.get(attackerId);
        const vfx = typeof SkillVFX !== "undefined" ? SkillVFX : null;
        const skill = skillCode && vfx ? vfx.findSkill(skillCode, actor) : null;
        if (attackerId === socket.id && loot) UI.pushLoot(loot);
        const hits = Array.isArray(payload.hits) && payload.hits.length
          ? payload.hits
          : [payload];
        const visualHits = [];
        for (const hit of hits) {
          const m = S.monsters.find(mon => mon.id === hit.targetId);
          if (!m) continue;
          m.hp = hit.hp;
          m.maxHp = hit.maxHp || m.maxHp;
          m.dead = !!hit.dead;
          if (m.dead && S.target?.id === m.id) {
            S.target = null;
            if (S.player) {
              S.player.combatMove = false;
              World.cancelPlayerMove(S.player);
            }
          }
          m.hitUntil = Date.now() + 180;
          const missed = Boolean(hit.miss);
          visualHits.push({ ...m, miss: missed, critical: Boolean(hit.critical) });
          if (!skill && (!vfx || skillCode)) {
            Render.combatFx(m.px, m.py, missed ? "miss" : (hit.critical ? "crit" : "hit"), missed ? "#a8ff8a" : (hit.critical ? "#fff06a" : "#ff765c"), hit.critical ? 1.25 : 1);
          }
          if (!skill && !skillCode && vfx) vfx.basicAttack(actor || { px: m.px - 20, py: m.py }, m, { miss: missed, critical: Boolean(hit.critical) });
          Render.floatDmg(m.px, m.py, -30, missed ? "MISS" : ((hit.critical ? "CRIT! " : "") + "-" + hit.damage), missed ? "#88ff88" : (hit.critical ? "#fff06a" : "#ff5555"), Boolean(hit.critical));
        }
        if (skill && vfx && visualHits.length) {
          const source = actor || { px: visualHits[0].px, py: visualHits[0].py };
          vfx.impact(skill, source, visualHits);
        }
        if (skillCode && skillName) {
          if (actor) {
            const physicalStrike = skill && SkillSystem.isOffensive(skill)
              && String(skill.damageType || "PHYSICAL").toUpperCase() !== "MAGIC";
            actor.animStartedAt = Date.now();
            actor.animState = physicalStrike ? "attack" : "cast";
            actor.animUntil = actor.animStartedAt + SkillSystem.animationDuration(skill || { damageType: "MAGIC" });
            Render.floatSkill(actor.px, actor.py, skillName);
          }
        } else if (actor) {
          actor.animState = "attack";
          actor.animStartedAt = Date.now();
          actor.animUntil = actor.animStartedAt + 360;
        }
        if (attackerId === socket.id && S.player) {
          if (typeof mp === "number") S.player.mp = mp;
          S.combatGcd = Math.floor((gcdMs || 350) / 16);
          if (!skillCode) S.atkCd = Math.floor((cooldownMs || 1000) / 16);
          if (skillCode) {
            const skill = S.player.skills?.find(item => item.id === skillCode || item.code === skillCode);
            if (skill) skill.cdLeft = Math.floor((cooldownMs || 700) / 16);
          }
          if (Array.isArray(loot?.items)) {
            for (const item of loot.items) {
              const existing = S.inventory.find((entry) => entry.id === item.id);
              if (existing) existing.count = Math.min(99, Number(existing.count || 0) + Number(item.count || 1));
              else if (S.inventory.length < CFG.INV_MAX) S.inventory.push({ ...item });
              UI.log(`Nhặt được ${item.icon || "✦"} ${item.name} x${item.count || 1}`, "loot");
            }
            UI.buildInv();
          }
          if (loot?.xu) {
            S.player.xu = Number(S.player.xu || 0) + loot.xu;
            UI.log(`Nhặt được ${loot.xu} xu`, "loot");
          }
          const relation = hits[0]?.affinityRelation;
          if (relation === "khac") UI.log("Ngũ hành tương khắc: lợi thế theo cường độ linh căn", "combat");
          if (relation === "bi_khac") UI.log("Linh căn bị khắc: sát thương giảm theo chênh lệch sức mạnh", "combat");
        }
      });

      socket.on("player_skill_cast", ({ playerId, skillCode, skillName, effect }) => {
        const actor = S.players.get(playerId);
        if (!actor) return;
        actor.animStartedAt = Date.now();
        actor.animState = "cast";
        const skill = typeof SkillVFX !== "undefined" ? SkillVFX.findSkill(skillCode, actor) : null;
        actor.animUntil = actor.animStartedAt + SkillSystem.animationDuration(skill || { damageType: "MAGIC" });
        if (skill && typeof SkillVFX !== "undefined") SkillVFX.support(skill, actor);
        else Render.combatFx(actor.px, actor.py, "skill", effectColor(effect));
        if (skillName) Render.floatSkill(actor.px, actor.py, skillName, effectColor(effect));
      });

      socket.on("quest_state_update", (snapshot) => {
        if (typeof QuestUI !== "undefined") QuestUI.applySnapshot(snapshot);
      });

      socket.on("skill_result", ({ skillCode, skillName, effect, effectVal, effectDurationMs, hp, maxHp, mp, maxMp, heal, mpRestore, buffs, cooldownMs, gcdMs }) => {
        S.combatPending = false;
        S.combatGcd = Math.floor((gcdMs || 350) / 16);
        if (!S.player) return;
        S.player.animStartedAt = Date.now();
        S.player.animState = "cast";
        S.player.animUntil = S.player.animStartedAt + 760;
        S.player.hp = hp;
        if (typeof maxHp === "number") S.player.maxHp = maxHp;
        S.player.mp = mp;
        if (typeof maxMp === "number") S.player.maxMp = maxMp;
        S.player.buffs = buffs || {};
        const skill = (typeof SkillVFX !== "undefined" && SkillVFX.findSkill(skillCode, S.player))
          || S.player.skills?.find(item => String(item.id) === String(skillCode) || String(item.code) === String(skillCode));
        if (typeof SkillVFX !== "undefined" && skill) SkillVFX.support(skill, S.player);
        else Render.combatFx(S.player.px, S.player.py, "skill", effectColor(effect));
        if (skill) skill.cdLeft = Math.floor((cooldownMs || 1000) / 16);
        if (skillName) Render.floatSkill(S.player.px, S.player.py, skillName, effectColor(effect));
        if (heal) UI.log(`${skill?.icon || "✦"} Hồi ${heal} HP`, "level");
        if (mpRestore) UI.log(`${skill?.icon || "✦"} Hồi ${mpRestore} MP`, "level");
        if (effect && !["heal", "restore_mp", "cleanse"].includes(effect)) {
          const labels = { shield: "khiên hộ thể", buff_atk: "sát thương", buff_def: "giáp", buff_crit: "chí mạng", buff_spd: "tốc độ", buff_cast: "tốc độ ra chiêu", buff_hp_regen: "hồi HP", buff_mp_regen: "hồi MP", buff_vitals: "sinh lực tối đa" };
          const label = labels[effect] || effect.replace(/^buff_/, "");
          const seconds = Math.max(1, Math.round(Number(effectDurationMs || 0) / 1000));
          UI.log(`${skill?.icon || "✦"} ${skillName || "Kỹ năng"} đã kích hoạt · +${effectVal || 0} ${label} (${seconds}s)`, "level");
          Render.floatSkill(S.player.px, S.player.py - 8, `+${effectVal || 0} ${label}`, effectColor(effect));
        }
        UI.update();
      });

      socket.on("player_state_update", ({ hp, maxHp, mp, maxMp, buffs }) => {
        if (!S.player) return;
        if (typeof hp === "number") S.player.hp = hp;
        if (typeof maxHp === "number") S.player.maxHp = maxHp;
        if (typeof mp === "number") S.player.mp = mp;
        if (typeof maxMp === "number") S.player.maxMp = maxMp;
        if (buffs) S.player.buffs = buffs;
        UI.update();
      });

      socket.on("action_error", ({ action, error }) => {
        if (action === "combat" || action === "skill") S.combatPending = false;
        if (action === "combat" || action === "skill") Net.cancelLocalCast();
        if (action === "map_change" && S.player) {
          S.player.isTeleporting = false;
          S.player.portalLocked = false;
          UI.hideLoading();
        }
        if (error) UI.log(`⚠ ${error}`, "system");
      });

      socket.on("chat_message", ({ username, message, id }) => {
        const isMe = id === socket.id;
        UI.log(`[${isMe ? "Tôi" : username}]: ${message}`, "chat");
      });

      socket.on("server_msg", ({ text }) => {
        UI.log(text, "system");
      });

    } catch (e) {
      console.error("Socket error:", e);
      Net._setBadge(false);
    }
  },

  emitMove(force = false) {
    if (socket?.connected && S.player) {
      const now = Date.now();
      const wait = 50 - (now - Number(Net._lastMoveSentAt || 0));
      if (!force && wait > 0) {
        if (!Net._moveTimer) {
          Net._moveTimer = setTimeout(() => {
            Net._moveTimer = null;
            Net.emitMove(true);
          }, wait);
        }
        return;
      }
      Net._lastMoveSentAt = now;
      Net.command("movement.intent", {
        x: S.player.x,
        y: S.player.y,
        mapCode: S.mapCode,
      });
    }
  },

  initializeAutoLoot() {
    this._autoLootEnabled = AutoLoot.isEnabled();
    UI.updateAutoLootToggle(this._autoLootEnabled);
  },

  cancelLocalCast() {
    if (S.player && ["attack", "cast"].includes(S.player.animState)) {
      S.player.animUntil = 0;
      S.player.animStartedAt = 0;
    }
    if (typeof SkillVFX !== "undefined") SkillVFX.cancelCharge();
  },

  toggleAutoLoot() {
    this._autoLootEnabled = AutoLoot.setEnabled(!AutoLoot.isEnabled());
    this._autoLootElapsed = 0;
    UI.updateAutoLootToggle(this._autoLootEnabled);
    UI.notify(this._autoLootEnabled ? "Tự nhặt vật phẩm gần đã bật." : "Tự nhặt vật phẩm gần đã tắt.", this._autoLootEnabled ? "success" : "info");
  },

  pickupLoot(itemId, { automatic = false, claimed = false } = {}) {
    if (!socket?.connected) {
      if (!automatic) UI.notify("Cần kết nối máy chủ để nhặt vật phẩm.", "warning");
      return Promise.resolve({ ok: false, error: { code: "OFFLINE" } });
    }
    if (!claimed && !AutoLoot.claim(itemId)) return Promise.resolve({ ok: false, error: { code: "PICKUP_PENDING" } });
    return this.command("loot.pickup", { itemId }).then((response) => {
      const code = response?.error?.code;
      const retryAfter = response?.ok ? 2400
        : (code === "INVENTORY_FULL" ? 12000 : (code === "LOOT_NOT_FOUND" ? 10000 : 5000));
      AutoLoot.settle(itemId, retryAfter);
      return response;
    }, (error) => {
      AutoLoot.settle(itemId, 5000);
      throw error;
    });
  },

  tickAutoLoot(dt) {
    if (!this._autoLootEnabled || !this._isOnline || !socket?.connected || !S.player) return null;
    this._autoLootElapsed += Math.max(0, Number(dt) || 0);
    if (this._autoLootElapsed < 320) return null;
    this._autoLootElapsed = 0;
    const nearby = AutoLoot.nearby(S.groundItems, S.player, { radius: 22, tileSize: CFG.TS });
    for (const drop of nearby) {
      if (!AutoLoot.claim(drop.id)) continue;
      return this.pickupLoot(drop.id, { automatic: true, claimed: true });
    }
    return null;
  },

  _updateHost() {
    if (!socket?.connected) {
      S.isHost = true;
      return;
    }
    const myId = socket.id;
    const playerIds = [myId];
    for (const [pid, p] of S.players) {
      const opMap = (p.mapCode || "").toLowerCase();
      const myMap = (S.mapCode || "").toLowerCase();
      if (opMap === myMap) playerIds.push(pid);
    }
    playerIds.sort();
    const newHost = (playerIds[0] === myId);
    if (newHost !== S.isHost) {
      S.isHost = newHost;
      if (newHost) UI.log("👑 Bạn hiện là Host của bản đồ này", "system");
    }
  },

  emitMapChange(mapCode, x, y) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (socket?.connected) {
      UI.showLoading(); // Hiển thị màn hình chờ khi chuyển map
      clearTimeout(Net._mapChangeTimer);
      Net._clearOthers();
      // Flush vị trí hiện tại trước: server phải xác nhận nhân vật đang chạm portal.
      // Không nhảy client tới điểm đến khi server chưa trả world_init.
      Net.command("movement.intent", { x: S.player?.x, y: S.player?.y, mapCode: S.mapCode });
      Net._mapChangeTimer = setTimeout(() => {
        Net._mapChangeTimer = null;
        if (socket?.connected) Net.command("map.change", { mapCode, x: px, y: py });
      }, 65);
    }
  },

  sendChat() {
    const inp = document.getElementById("chat-inp");
    const msg = inp.value.trim();
    if (!msg) return;
    if (socket?.connected) {
      Net.command("chat.send", { message: msg });
    } else {
      UI.log(`[Tôi]: ${msg}`, "chat");
    }
    inp.value = "";
  },

  _setBadge(online) {
    const ob = document.getElementById("online-badge");
    if (ob) {
      ob.textContent = online ? "● Online" : "● Offline";
      ob.style.color = online ? "var(--green)" : "#aa4444";
    }
  },

  _upsertOther(p) {
    const pid = p.id || p.socketId || p.userId;
    if (!pid) return;

    const existing = S.players.get(pid);
    const mapCode = (p.mapCode || p.mapId || S.mapCode || "").toLowerCase();

    // Gộp dữ liệu: giữ lại px, py cũ nếu dữ liệu mới (p) không có
    const updatedData = {
      ...existing,
      ...p,
      id: pid,
      mapCode: mapCode
    };

    // QUAN TRỌNG: Nếu p không có px/py, tuyệt đối phải giữ lại giá trị từ existing hoặc tính mới
    if (p.px === undefined) {
      if (existing && existing.px !== undefined) {
        updatedData.px = existing.px;
        updatedData.py = existing.py;
      } else {
        // Nếu là người mới hoàn toàn, tính toán từ tọa độ ô (x, y)
        updatedData.px = (p.x || 0) * CFG.TS + CFG.TS / 2;
        updatedData.py = (p.y || 0) * CFG.TS + CFG.TS / 2;
      }
    }

    S.players.set(pid, updatedData);
    console.debug(`[Net] Upsert player ${pid} in map ${mapCode}. Pos: (${updatedData.px}, ${updatedData.py})`);
  },

  _clearOthers() {
    S.players.clear();
    Net._renderOnlineList();
  },

  _renderOnlineList() {
    const el = document.getElementById("online-list");
    if (!el) return;
    if (S.players.size === 0) {
      el.innerHTML = '<div style="color:var(--text2);font-size:10px">Chỉ có bạn trực tuyến</div>';
      return;
    }
    el.innerHTML = "";
    for (const [, p] of S.players) {
      const d = document.createElement("div");
      d.className = "online-player";
      d.innerHTML = `<span class="on-name">${p.name || p.username || "?"}</span>`;
      el.appendChild(d);
    }
  },
};
