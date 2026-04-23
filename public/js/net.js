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
    
    // Tránh race condition: Nếu đang lưu, đợi xong rồi check xem có cần lưu tiếp không
    if (this._savePromise) {
      return this._savePromise.then(() => this.saveNow(event));
    }

    this._savePromise = (async () => {
      const p = S.player;
      
      // Lấy dữ liệu trang bị từ state mới nhất
      const trangBi = p.trangBi || {
        vuKhi: null, ao: null, giay: null, mu: null, 
        tay: null, nhan: null, vong: null,
      };

      // Chỉ build object với các trường BE thực sự cần theo schema
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
        
        // Cực kỳ quan trọng: Tọa độ và Bản đồ
        x: Math.floor(p.x || 0),
        y: Math.floor(p.y || 0),
        mapCode: S.mapCode || p.mapCode,
        mapId: p.mapId || S.mapCode || p.mapCode,

        // Stringify các trường JSON
        jsonIventory: JSON.stringify(S.inventory || []),
        skills: JSON.stringify((p.skills || []).map(sk => mapFESkillToBE(sk))),
        equip_slot: JSON.stringify(trangBi),
        
        // Các trường khác
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
        UI.log("⚠ Không thể lưu dữ liệu lên máy chủ", "system");
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
        if (p)
          socket.emit("join_world", {
            mapId: S.mapCode,
            x: p.x,
            y: p.y,
          });
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
      socket.on("world_state", ({ players }) => {
        for (const p of players) Net._upsertOther(p);
        Net._renderOnlineList();
      });

      socket.on("player_join", (p) => {
        Net._upsertOther(p);
        Net._renderOnlineList();
        UI.log(`👤 ${p.username} gia nhập bản đồ`, "system");
      });

      socket.on("player_leave", ({ id }) => {
        Net.saveNow();
        otherPlayers.delete(id);
        Net._renderOnlineList();
      });

      socket.on("player_move", ({ id, x, y }) => {
        if (otherPlayers.has(id)) {
          const op = otherPlayers.get(id);
          op.x = x;
          op.y = y;
          op.px = x * CFG.TS + CFG.TS / 2;
          op.py = y * CFG.TS + CFG.TS / 2;
        }
      });

      socket.on("player_map", ({ id, mapCode, mapId, x, y }) => {
        const newMapCode = mapCode || mapId;
        if (otherPlayers.has(id)) {
          const op = otherPlayers.get(id);
          if (op.mapCode !== S.mapCode) otherPlayers.delete(id);
          else {
            op.x = x;
            op.y = y;
            op.mapCode = newMapCode;
          }
        }
      });

      socket.on("chat_message", ({ username, message, id }) => {
        const isMe = id === socket.id;
        UI.log(`[${isMe ? "Tôi" : username}]: ${message}`, "chat");
      });

      socket.on("attack_fx", ({ attackerName, targetId, damage }) => {
        // visual only — future use
      });

      socket.on("server_msg", ({ text }) => {
        UI.log(text, "system");
      });
    } catch (e) {
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
    const badge = document.getElementById("conn-badge");
    const ob = document.getElementById("online-badge");
    badge.className = online ? "online" : "offline";
    badge.textContent = online ? "● Online" : "● Offline";
    ob.textContent = online ? "● Online" : "● Offline";
    ob.style.color = online ? "var(--green)" : "#aa4444";
  },

  _upsertOther(p) {
    const existing = otherPlayers.get(p.id) || {};
    const mapCode = p.mapCode || p.mapId || S.mapCode;
    otherPlayers.set(p.id, {
      ...existing,
      ...p,
      mapCode,
      realm: p.realm ?? 0,
      stage: p.stage ?? 1,
      px: (p.x || 0) * CFG.TS + CFG.TS / 2,
      py: (p.y || 0) * CFG.TS + CFG.TS / 2,
    });
  },

  _clearOthers() {
    otherPlayers.clear();
    Net._renderOnlineList();
  },

  _renderOnlineList() {
    const el = document.getElementById("online-list");
    if (otherPlayers.size === 0) {
      el.innerHTML =
        '<div style="color:var(--text2);font-size:10px">Chỉ có bạn trực tuyến</div>';
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
