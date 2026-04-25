"use strict";
// ════════════════════════════════════════════════════════════
// net.js — §2 Network Module (HTTP + Socket.io)
// ════════════════════════════════════════════════════════════

let socket = null;
let authToken = localStorage.getItem("tu_tien_token");
var currentUser = null;

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
    
    if (this._savePromise) {
      return this._savePromise.then(() => this.saveNow(event));
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
    try {
      socket = io(API.SOCKET_URL, {
        auth: { token: authToken },
        timeout: 5000,
      });

      socket.on("connect", () => {
        Net._isOnline = true;
        Net._setBadge(true);
        const p = S.player;
        if (p) {
          socket.emit("join_world", {
            mapCode: S.mapCode,
            mapId: S.mapCode, // Gửi cả 2 cho chắc chắn
            x: p.x,
            y: p.y,
          });
        }
        UI.log("🌐 Đã kết nối máy chủ!", "system");
      });

      socket.on("disconnect", () => {
        Net.saveNow();
        localStorage.removeItem("tu_tien_token");
        Net._isOnline = false;
        Net._setBadge(false);
        Net._clearOthers();
        UI.log("⚠ Mất kết nối server...", "system");
      });

      socket.on("connect_error", () => {
        Net._setBadge(false);
      });

      // ── World state (players on same map) ──
      socket.on("world_state", (data) => {
        try {
          const players = data?.players || (Array.isArray(data) ? data : []);
          for (const p of players) {
            if (p && p.id !== socket.id) Net._upsertOther(p);
          }
          Net._renderOnlineList();
        } catch (e) { console.error("world_state error:", e); }
      });

      socket.on("player_join", (p) => {
        try {
          if (p && p.id !== socket.id) {
            Net._upsertOther(p);
            Net._renderOnlineList();
            UI.log(`👤 ${p.username || "Người chơi ẩn danh"} gia nhập bản đồ`, "system");
          }
        } catch (e) { console.error("player_join error:", e); }
      });

      socket.on("player_leave", (data) => {
        const pid = data.id || data.socketId || data.userId;
        Net.saveNow();
        otherPlayers.delete(pid);
        Net._renderOnlineList();
      });

      socket.on("player_move", (data) => {
        try {
          const pid = data.id || data.socketId || data.userId;
          if (!pid) return;
          
          if (!otherPlayers.has(pid)) {
            // Nếu người chơi này chưa có trong danh sách, thêm vào luôn
            Net._upsertOther(data);
          }
          
          const op = otherPlayers.get(pid);
          // Lưu vị trí đích để nội suy (interpolation)
          op.tx = data.x;
          op.ty = data.y;
          op.tpx = data.x * CFG.TS + CFG.TS / 2;
          op.tpy = data.y * CFG.TS + CFG.TS / 2;
          
          // Nếu đứng quá xa (> 4 ô), nhảy tới luôn để tránh đơ
          const dx = op.tpx - op.px;
          const dy = op.tpy - op.py;
          if (Math.hypot(dx, dy) > CFG.TS * 4) {
            op.px = op.tpx;
            op.py = op.tpy;
          }
        } catch (e) { console.error("player_move error:", e); }
      });

      socket.on("player_map", (data) => {
        const pid = data.id || data.socketId || data.userId;
        const newMapCode = data.mapCode || data.mapId;
        if (otherPlayers.has(pid)) {
          const op = otherPlayers.get(pid);
          if ((newMapCode || "").toLowerCase() !== (S.mapCode || "").toLowerCase()) {
            otherPlayers.delete(pid);
          } else {
            op.x = data.x;
            op.y = data.y;
            op.mapCode = newMapCode;
          }
        }
      });

      // ── Monster Synchronization ──
      socket.on("monster_state", ({ monsters }) => {
        if (!monsters) return;
        S.monsters = monsters.map((m) =>
          Monster.make(m, m.x, m.y, m.id)
        );
      });

      socket.on("monster_update", (data) => {
        const m = S.monsters.find((mon) => mon.id === data.id);
        if (m) {
          m.tpx = data.x * CFG.TS + CFG.TS / 2;
          m.tpy = data.y * CFG.TS + CFG.TS / 2;
          m.hp = data.hp;
          m.state = data.state || m.state;
          m.targetId = data.targetId;
          if (data.hp <= 0) m.dead = true;
          else m.dead = false;
        }
      });

      socket.on("monster_death", ({ id }) => {
        const m = S.monsters.find((mon) => mon.id === id);
        if (m) {
          m.dead = true;
          m.hp = 0;
        }
      });

      socket.on("monster_spawn", ({ monster }) => {
        if (S.monsters.find(m => m.id === monster.id)) return;
        S.monsters.push(Monster.make(monster, monster.x, monster.y, monster.id));
      });

      socket.on("attack_fx", ({ attackerName, targetId, damage }) => {
        if (targetId && targetId.startsWith("mon_")) {
          const m = S.monsters.find(mon => mon.id === targetId);
          if (m && !m.dead) {
            Render.floatDmg(m.px, m.py, -30, "-" + damage, "#ffaa44");
            S.atkFx.push({ px: m.px, py: m.py, r: 10, life: 10 });
            // Trừ máu đồng bộ từ người chơi khác
            m.hp -= damage;
            if (m.hp <= 0) {
              m.dead = true;
              m.respawnT = m.spawnCD || 10;
            }
          }
        }
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

  emitMove() {
    if (socket?.connected && S.player) {
      socket.emit("move", {
        x: S.player.x,
        y: S.player.y,
        mapId: S.mapCode,
      });
    }
  },

  emitMapChange(mapCode, x, y) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (socket?.connected) {
      socket.emit("map_change", { mapId: mapCode, x: px, y: py });
    }
    Net.saveNow({ type: "map_change", data: { mapCode, x: px, y: py } });
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

    const existing = otherPlayers.get(pid);
    // Chuẩn hóa mapCode để so sánh chính xác
    const mapCode = (p.mapCode || p.mapId || S.mapCode || "").toLowerCase();
    
    const updatedData = {
      ...existing,
      ...p,
      id: pid,
      mapCode: mapCode,
    };

    // Chỉ khởi tạo tọa độ pixel nếu là người chơi mới
    if (!existing || existing.px === undefined) {
      updatedData.px = (p.x || 0) * CFG.TS + CFG.TS / 2;
      updatedData.py = (p.y || 0) * CFG.TS + CFG.TS / 2;
    }

    otherPlayers.set(pid, updatedData);
  },

  _clearOthers() {
    otherPlayers.clear();
    Net._renderOnlineList();
  },

  _renderOnlineList() {
    const el = document.getElementById("online-list");
    if (!el) return;
    if (otherPlayers.size === 0) {
      el.innerHTML = '<div style="color:var(--text2);font-size:10px">Chỉ có bạn trực tuyến</div>';
      return;
    }
    el.innerHTML = "";
    for (const [, p] of otherPlayers) {
      const d = document.createElement("div");
      d.className = "online-player";
      d.innerHTML = `<span class="on-name">${p.name || p.username || "?"}</span>`;
      el.appendChild(d);
    }
  },
};
