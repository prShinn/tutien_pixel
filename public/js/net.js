"use strict";
// ════════════════════════════════════════════════════════════
// net.js — §2 Network Module (HTTP + Socket.io)
// ════════════════════════════════════════════════════════════

let socket = null;
let authToken = sessionStorage.getItem("tu_tien_token");

const Net = {
  _saveTimer: null,
  _isOnline: false,
  _pendingRequests: new Map(),
  _savePromise: null,

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
    if (!authToken || !S.player) return;

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
        const res = await this.put("/api/player/" + playerData.id, playerData);
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
          socket.emit("join_world", {
            mapCode: mCode,
            mapId: mCode,
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
              xu: authoritative.xu, x: authoritative.x, y: authoritative.y, mapCode: authoritative.mapCode,
              tuViHienTai: authoritative.tuViHienTai, tuViLenCap: authoritative.tuViLenCap,
              tuViLinhCan: authoritative.tuViLinhCan, tangTuVi: authoritative.tangTuVi,
              stats: authoritative.stats, combatPower: authoritative.combatPower,
              learnedSkills: authoritative.learnedSkills, equippedSkills: authoritative.equippedSkills,
              equipment: authoritative.equipment || S.player.equipment,
            });
            try { S.inventory = typeof authoritative.jsonIventory === "string" ? JSON.parse(authoritative.jsonIventory || "[]") : (authoritative.inventory || S.inventory); } catch { }
          }
          if (data.map) {
            // Chuẩn hóa DTO trước khi nạp
            const map = normalizeWorldDto(data.map);
            if (map) {
              if (!S.player) {
                console.warn("[Net] world_init: S.player chưa sẵn sàng, đang đợi...");
                setTimeout(() => socket.emit("join_world", { mapCode: map.code, x: 0, y: 0 }), 500);
                return;
              }
              World.loadMap(map, S.player.x, S.player.y);
              console.log("[Net] Bản đồ đã được nạp và chuẩn hóa.");
              UI.hideLoading();
            } else {
              UI.log("⚠ Lỗi: Dữ liệu bản đồ không hợp lệ!", "system");
            }
          } else if (S.tiles?.length && S.mapCode === String(data.mapCode || "").toLowerCase()) {
            UI.hideLoading();
          } else if (data.mapCode) {
            const mapDto = await Net.get(`/api/worlds/by-code?code=${encodeURIComponent(data.mapCode)}`);
            const map = normalizeWorldDto(mapDto);
            if (map && S.player) World.loadMap(map, S.player.x, S.player.y);
            UI.hideLoading();
          } else {
            UI.log("⚠ Lỗi: Server không gửi dữ liệu bản đồ!", "system");
          }

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

          Net._updateHost();
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
          Net._updateHost();
        } catch (e) { console.error("world_state error:", e); }
      });

      socket.on("player_join", (p) => {
        try {
          if (p && p.id !== socket.id) {
            Net._upsertOther(p);
            UI.update();
            UI.log(`👤 ${p.username || "Người chơi ẩn danh"} gia nhập bản đồ`, "system");
            Net._updateHost();
          }
        } catch (e) { console.error("player_join error:", e); }
      });

      socket.on("player_leave", (data) => {
        const pid = data.id || data.socketId || data.userId;
          S.players.delete(pid);
        Net._updateHost();
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
        Net._updateHost();
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
          m.tpx = Number(data.x) * CFG.TS + CFG.TS / 2;
          m.tpy = Number(data.y) * CFG.TS + CFG.TS / 2;
          m.hp = Number(data.hp ?? m.hp);
          m.maxHp = Number(data.maxHp || m.maxHp);
          m.state = data.state || m.state;
          m.targetId = data.targetId || null;
          m.statusEffects = Array.isArray(data.statusEffects) ? data.statusEffects : [];
          m.dead = !!data.dead;
          if (!m.dead) m.respawnT = m.spawnCD || 10;
        }
      });

      socket.on("player_combat_result", ({ targetId, damage, miss, hp, maxHp }) => {
        if (targetId !== socket.id || !S.player) return;
        S.player.hp = Number(hp ?? S.player.hp);
        if (maxHp) S.player.maxHp = Number(maxHp);
        Render.floatDmg(S.player.px, S.player.py, -36, miss ? "MISS" : `-${damage}`, miss ? "#88ff88" : "#ffaa44");
        if (S.player.hp <= 0) S.player.hp = Math.floor(S.player.maxHp * 0.25);
      });

      socket.on("monster_death", ({ id }) => {
        const m = S.monsters.find((mon) => mon.id === id);
        if (m) {
          m.dead = true;
          m.hp = 0;
        }
      });

      socket.on("monster_spawn", ({ monster }) => {
        if (!monster?.id) return;
        const existing = S.monsters.find(m => m.id === monster.id);
        const fresh = Monster.make(monster, Number(monster.x ?? monster.spawnX ?? 0), Number(monster.y ?? monster.spawnY ?? 0), monster.id);
        if (existing) Object.assign(existing, fresh, { dead: !!monster.dead });
        else S.monsters.push(fresh);
      });

      socket.on("combat_result", (payload) => {
        S.combatPending = false;
        const { attackerId, skillCode, skillName, mp, cooldownMs, gcdMs, loot } = payload;
        const hits = Array.isArray(payload.hits) && payload.hits.length
          ? payload.hits
          : [payload];
        for (const hit of hits) {
          const m = S.monsters.find(mon => mon.id === hit.targetId);
          if (!m) continue;
          m.hp = hit.hp;
          m.maxHp = hit.maxHp || m.maxHp;
          m.dead = !!hit.dead;
          m.hitUntil = Date.now() + 180;
          Render.floatDmg(m.px, m.py, -30, (hit.critical ? "CRIT! " : "") + "-" + hit.damage, hit.critical ? "#fff06a" : "#ffaa44");
          S.atkFx.push({ px: m.px, py: m.py, r: 10, life: 10 });
        }
        if (skillCode && skillName) {
          const actor = attackerId === socket.id ? S.player : S.players.get(attackerId);
          if (actor) {
            actor.animState = "cast";
            actor.animUntil = Date.now() + 520;
            Render.floatSkill(actor.px, actor.py, skillName);
          }
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

      socket.on("skill_result", ({ skillCode, skillName, hp, maxHp, mp, maxMp, heal, mpRestore, buffs, cooldownMs, gcdMs }) => {
        S.combatPending = false;
        S.combatGcd = Math.floor((gcdMs || 350) / 16);
        if (!S.player) return;
        S.player.animState = "cast";
        S.player.animUntil = Date.now() + 520;
        S.player.hp = hp;
        if (typeof maxHp === "number") S.player.maxHp = maxHp;
        S.player.mp = mp;
        if (typeof maxMp === "number") S.player.maxMp = maxMp;
        S.player.buffs = buffs || {};
        const skill = S.player.skills?.find(item => item.id === skillCode || item.code === skillCode);
        if (skill) skill.cdLeft = Math.floor((cooldownMs || 1000) / 16);
        if (skillName) Render.floatSkill(S.player.px, S.player.py, skillName);
        if (heal) UI.log(`${skill?.icon || "✦"} Hồi ${heal} HP`, "level");
        if (mpRestore) UI.log(`${skill?.icon || "✦"} Hồi ${mpRestore} MP`, "level");
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

      socket.on("attack_fx", ({ attackerName, targetId, damage }) => {
        if (targetId && targetId.startsWith("mon_")) {
          const m = S.monsters.find(mon => mon.id === targetId);
          if (m && !m.dead) {
            Render.floatDmg(m.px, m.py, -30, "-" + damage, "#ffaa44");
            S.atkFx.push({ px: m.px, py: m.py, r: 10, life: 10 });
          }
        }
      });

      socket.on("action_error", ({ action, error }) => {
        if (action === "combat" || action === "skill") S.combatPending = false;
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
      socket.emit("move", {
        x: S.player.x,
        y: S.player.y,
        mapId: S.mapCode,
      });
    }
  },

  emitMonsterSync() {
    // Deprecated: vị trí, HP và AI monster do server authoritative quản lý.
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
    if (S.player) {
      S.player.x = px;
      S.player.y = py;
      S.player.px = px * CFG.TS + CFG.TS / 2;
      S.player.py = py * CFG.TS + CFG.TS / 2;
    }
    if (socket?.connected) {
      UI.showLoading(); // Hiển thị màn hình chờ khi chuyển map
      Net._clearOthers();
      socket.emit("map_change", { mapId: mapCode, mapCode: mapCode, x: px, y: py });
    }
  },

  emitAttackMonster(monsterId, damage, skillCode = null) {
    if (socket?.connected) {
      socket.emit("attack_monster", { monsterId, damage, skillCode });
    }
  },

  sendChat() {
    const inp = document.getElementById("chat-inp");
    const msg = inp.value.trim();
    if (!msg) return;
    if (socket?.connected) {
      socket.emit("chat", { message: msg });
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
