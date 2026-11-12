// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/net.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Cầu nối mạng: gọi REST API, refresh phiên đăng nhập và đồng bộ Socket.IO thời gian thực.
// 2. CẤU HÌNH LIÊN QUAN:
//    - sessionStorage("tu_tien_token"), socket.io client.
//    - Phụ thuộc: State (S), World, Render, UI, Combat.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Chống lag/spam: Throttle movement; chỉ demo mock mới snapshot state vào local API.
//    - Server-authoritative: Nhận movement_corrected khi phát hiện sai lệch vị trí hoặc va chạm.
//    - Client-side prediction & reconciliation: Hòa giải trạng thái mượt mà khi đổi map/mất mạng.
// ════════════════════════════════════════════════════════════════════════════════════════

let socket = null;
let authToken = sessionStorage.getItem("tu_tien_token");
let authRefreshToken = sessionStorage.getItem("tu_tien_refresh_token");

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
  _pendingMutationIds: new Map(),
  _pendingMutationIdsLoaded: false,
  _refreshPromise: null,
  _socketRefreshing: false,
  _mapRefreshSeq: 0,
  _beforeUnloadBound: false,
  _savePromise: null,
  _mapChangeTimer: null,
  _moveTimer: null,
  _queuedMove: null,
  _movesInFlight: new Set(),
  _movementReady: false,
  _nextMoveAt: 0,
  MOVEMENT_INTERVAL_MS: 50,
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
          if (!payload.skillCode) Net.cancelLocalCast();
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
            if (!payload.skillCode) Net.cancelLocalCast();
            if (payload.skillCode) Net._throttleRejectedSkill(payload.skillCode, response.error);
            // Đòn thường bị BE báo hồi chiêu: chờ đúng phần còn lại thay vì gửi lại mỗi frame.
            else if (response.error.code === "COOLDOWN_ACTIVE" && Number(response.error.details?.remainingMs) > 0) {
              S.atkCd = Math.max(Number(S.atkCd) || 0, Math.ceil(Number(response.error.details.remainingMs) / 16));
            }
          }
          if (type === "map.change" && S.player) {
            S.player.isTeleporting = false;
            S.player.portalLocked = false;
            UI.hideLoading();
          }
          if (type === "map.change" && response.error.code === "PORTAL_LOCKED") {
            UI.notify(response.error.message, "warning");
          } else {
            UI.log(`⚠ ${response.error.message}`, "system");
          }
        }
        onAck?.(response);
        resolve(response);
      });
    });
  },

  _playerSkill(skillCode) {
    const code = String(skillCode);
    return S.player?.skills?.find((item) => String(item.code) === code || String(item.id) === code || String(item._beId) === code) || null;
  },

  // BE từ chối kỹ năng: đồng bộ hồi chiêu thật, hoặc tạm khóa ô để Tự Động không gửi lại mỗi frame.
  _throttleRejectedSkill(skillCode, error = {}) {
    const skill = Net._playerSkill(skillCode);
    if (!skill) return;
    const remainingMs = Number(error.details?.remainingMs);
    if (error.code === "COOLDOWN_ACTIVE" && remainingMs > 0) skill.cdLeft = Math.ceil(remainingMs / 16);
    else if (["SKILL_NOT_LEARNED", "SKILL_NOT_EQUIPPED", "SKILL_ROOT_MISMATCH"].includes(error.code)) skill.cdLeft = Math.ceil(10000 / 16);
    else if (error.code === "INSUFFICIENT_MP") skill.cdLeft = Math.max(Number(skill.cdLeft) || 0, Math.ceil(1000 / 16));
  },

  _requestKey(method, path, body) {
    const payload = typeof body === "string" ? body : JSON.stringify(body || "");
    return `${method}:${path}:${payload}`;
  },

  requestId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 12)}`;
  },

  setSession(session, { preservePendingMutations = false } = {}) {
    if (!preservePendingMutations) this.clearPendingMutations();
    authToken = session?.accessToken || session?.token || null;
    authRefreshToken = session?.refreshToken || null;
    if (authToken) sessionStorage.setItem("tu_tien_token", authToken);
    else sessionStorage.removeItem("tu_tien_token");
    if (authRefreshToken) sessionStorage.setItem("tu_tien_refresh_token", authRefreshToken);
    else sessionStorage.removeItem("tu_tien_refresh_token");
  },

  clearSession() {
    authToken = null;
    authRefreshToken = null;
    sessionStorage.removeItem("tu_tien_token");
    sessionStorage.removeItem("tu_tien_refresh_token");
    this.clearPendingMutations();
  },

  _restorePendingMutationIds() {
    if (this._pendingMutationIdsLoaded) return;
    this._pendingMutationIdsLoaded = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem("tu_tien_pending_mutations") || "{}");
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const [fingerprint, value] of Object.entries(saved)) {
        if (typeof value?.requestId === "string" && Number(value.createdAt) >= cutoff) {
          this._pendingMutationIds.set(fingerprint, value);
        }
      }
      this._persistPendingMutationIds();
    } catch {
      sessionStorage.removeItem("tu_tien_pending_mutations");
    }
  },

  _persistPendingMutationIds() {
    const entries = [...this._pendingMutationIds.entries()].slice(-100);
    this._pendingMutationIds = new Map(entries);
    try {
      sessionStorage.setItem("tu_tien_pending_mutations", JSON.stringify(Object.fromEntries(entries)));
    } catch { /* session storage is optional and must not block gameplay */ }
  },

  clearPendingMutations() {
    this._pendingMutationIds.clear();
    this._pendingMutationIdsLoaded = true;
    sessionStorage.removeItem("tu_tien_pending_mutations");
  },

  async refreshSession() {
    if (!authRefreshToken) return false;
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = (async () => {
      let response;
      try {
        response = await fetch(API.BASE + API.PATHS.auth.refresh, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: authRefreshToken }),
        });
      } catch {
        return false;
      }
      const data = await this._readResponse(response);
      if (!response.ok || !(data?.accessToken || data?.token) || !data?.refreshToken) {
        if (response.status === 401 || response.status === 403) this.clearSession();
        return false;
      }
      this.setSession(data, { preservePendingMutations: true });
      return true;
    })();
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  },

  async _readResponse(response) {
    try {
      const data = await response.json();
      if (response.ok) return data;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return { ...data, error: typeof data.error === "string" ? data.error : `Yêu cầu thất bại (${response.status})`, httpStatus: response.status };
      }
      return { ok: false, error: `Yêu cầu thất bại (${response.status})`, code: "HTTP_ERROR", httpStatus: response.status };
    } catch {
      return response.ok
        ? null
        : { ok: false, error: `Yêu cầu thất bại (${response.status})`, code: "HTTP_ERROR", httpStatus: response.status };
    }
  },

  async _fetch(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body || "";
    const key = this._requestKey(method, path, body);
    if (this._pendingRequests.has(key)) {
      return this._pendingRequests.get(key);
    }
    const promise = (async () => {
      let res;
      try {
        res = await fetch(API.BASE + path, opts);
      } catch {
        return { ok: false, error: "Không thể kết nối máy chủ. Kiểm tra địa chỉ API hoặc kết nối mạng rồi thử lại.", code: "NETWORK_ERROR", retryable: true };
      }
      const data = await this._readResponse(res);
      const authEndpoint = path.startsWith(API.PATHS.auth.refresh) || path.startsWith(API.PATHS.auth.logout)
        || path.startsWith(API.PATHS.auth.login) || path.startsWith(API.PATHS.auth.register)
        || path.startsWith(API.PATHS.auth.demo);
      if (res.status !== 401 || authEndpoint || !authRefreshToken || !(await this.refreshSession())) return data;
      const headers = new Headers(opts.headers || {});
      headers.set("Authorization", `Bearer ${authToken}`);
      let retry;
      try {
        retry = await fetch(API.BASE + path, { ...opts, headers });
      } catch {
        return { ok: false, error: "Không thể kết nối máy chủ sau khi làm mới phiên.", code: "NETWORK_ERROR", retryable: true };
      }
      return this._readResponse(retry);
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

  async mutate(method, path, body = {}) {
    this._restorePendingMutationIds();
    const normalizedMethod = String(method || "POST").toUpperCase();
    const fingerprint = `${normalizedMethod}:${path}:${JSON.stringify(body)}`;
    let pending = this._pendingMutationIds.get(fingerprint);
    if (pending && pending.createdAt < Date.now() - 24 * 60 * 60 * 1000) {
      this._pendingMutationIds.delete(fingerprint);
      pending = null;
    }
    if (!pending) {
      pending = { requestId: this.requestId(), createdAt: Date.now() };
      this._pendingMutationIds.set(fingerprint, pending);
      this._persistPendingMutationIds();
    }
    const options = {
      method: normalizedMethod,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + authToken,
      },
      body: JSON.stringify({ ...body, requestId: pending.requestId }),
    };
    try {
      const result = await this._fetch(path, options);
      const shouldPreserveForRetry = Boolean(
        result?.error && (
          result?.retryable
          || result?.code === "NETWORK_ERROR"
          || Number(result?.httpStatus) >= 500
          || Number(result?.httpStatus) === 429
        ),
      );
      if (!shouldPreserveForRetry) {
        this._pendingMutationIds.delete(fingerprint);
        this._persistPendingMutationIds();
      }
      return result;
    } catch (error) {
      // Keep the same id if the user retries after a network failure.
      throw error;
    }
  },

  refreshItemViews() {
    if (!S.player) return;
    UI.hideTip();
    UI.buildInv();
    UI.renderEquipment(true);
    if (document.getElementById("shop-modal")?.classList.contains("open")) Shop.render();
  },

  applyPlayerSnapshot(player, { render = true } = {}) {
    if (!player || typeof player !== "object" || !S.player) return false;
    Object.assign(S.player, player);
    if (Array.isArray(player.inventory)) S.inventory = player.inventory;
    else if (typeof player.jsonIventory === "string") {
      try {
        const inventory = JSON.parse(player.jsonIventory || "[]");
        if (Array.isArray(inventory)) S.inventory = inventory;
      } catch { /* keep the last valid local inventory */ }
    }
    if (render) {
      UI.buildInv();
      UI.update();
    }
    return true;
  },

  // ── Save ──
  async saveNow(event) {
    if (!authToken || !S.player) return { ok: true, skipped: true };
    if (!(!API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled)) {
      // BE không chấp nhận ghi đè snapshot từ client. Mutation REST và realtime là nguồn lưu state.
      return { ok: true, skipped: true, reason: "SERVER_AUTHORITATIVE_STATE" };
    }
    const player = S.player;
    const equipment = player.trangBi || { vuKhi: null, ao: null, giay: null, mu: null, tay: null, nhan: null, vong: null };
    return this.put(API.PATHS.player.update(player.id), {
      ...player,
      userId: player.userId || S.session.user?.id,
      mapCode: S.mapCode || player.mapCode,
      mapId: player.mapId || S.mapCode || player.mapCode,
      jsonIventory: JSON.stringify(S.inventory || []),
      skills: JSON.stringify((player.skills || []).map((skill) => mapFESkillToBE(skill))),
      equip_slot: JSON.stringify(equipment),
      _event: event?.type || "auto",
    });
  },

  startAutoSave() {
    clearInterval(Net._saveTimer);
    Net._saveTimer = !API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled
      ? setInterval(() => Net.saveNow(), API.AUTO_SAVE_MS)
      : null;
  },

  // ── Socket.io ──
  connectSocket() {
    if (!authToken) return;
    if ((!API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled)) {
      Net._isOnline = false;
      Net._setBadge(false);
      return;
    }
    if (socket?.connected || socket?.active) return;
    try {
      socket = io(API.SOCKET_URL, {
        auth: { token: authToken },
        timeout: 5000,
        reconnection: true,
        reconnectionAttempts: 10,
      });

      let hasConnected = false;
      let pendingItemChanges = null;
      socket.on("connect", () => {
        Net._resetMovement();
        if (hasConnected) {
          const changes = pendingItemChanges = new Map();
          void GameData.loadItems(() => pendingItemChanges === changes).then((loaded) => {
            if (pendingItemChanges !== changes) return;
            pendingItemChanges = null;
            if (!loaded) return;
            for (const change of changes.values()) GameData.updateItemCatalog(change);
            Net.refreshItemViews();
          });
        }
        hasConnected = true;
        Net._isOnline = true;
        Net._setBadge(true);
        const p = S.player;
        if (p) {
          const mCode = p.mapCode || p.mapId || S.mapCode || "";
          const hasCurrentMap = Boolean(S.tiles?.length && S.mapCode === String(mCode).toLowerCase());
          Net.command("world.join", {
          mapCode: mCode,
            x: p.x,
            y: p.y,
            mapVersion: S.mapVersion || 0,
            hasMap: hasCurrentMap,
          });
          if (!hasCurrentMap) UI.showLoading();
        }
        UI.log("🌐 Đã kết nối máy chủ!", "system");
      });

      socket.on("disconnect", () => {
        Net._resetMovement();
        pendingItemChanges = null;
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
        if (err?.message === "UNAUTHORIZED" && authRefreshToken) {
          if (!Net._socketRefreshing) {
            Net._socketRefreshing = true;
            void Net.refreshSession().then((refreshed) => {
              if (refreshed && socket) {
                socket.auth = { token: authToken };
                if (!socket.active) socket.connect();
              } else if (!authRefreshToken) {
                UI.log("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.", "system");
              }
            }).finally(() => { Net._socketRefreshing = false; });
          }
        } else if (err?.message === "Token không hợp lệ" || err?.message === "Không có token" || err?.message === "UNAUTHORIZED") {
          Net.clearSession();
        }
        Net._setBadge(false);
      });

      // ── World Init (Server Authoritative) ──
      socket.on("world_init", async (data) => {
        Net._resetMovement();
        let worldReady = false;
        try {
          console.log("[Net] Nhận world_init", { mapCode: data.mapCode || data.map?.code, players: data.players?.length || 0, monsters: data.monsters?.length || 0, mapIncluded: Boolean(data.map) });
          if (data.player && S.player) {
            const authoritative = data.player;
            Object.assign(S.player, {
              hp: authoritative.hp, maxHp: authoritative.maxHp, mp: authoritative.mp, maxMp: authoritative.maxMp,
              xu: authoritative.xu,
              linhThach: Number(authoritative.linhThach ?? S.player.linhThach ?? 0),
              inventoryCapacity: Number(authoritative.inventoryCapacity ?? S.player.inventoryCapacity ?? (CFG.INV_BASE || 40)),
              unspentStatPoints: Number(authoritative.unspentStatPoints ?? S.player.unspentStatPoints ?? 0),
              x: Number.isFinite(Number(authoritative.x)) ? Number(authoritative.x) : S.player.x,
              y: Number.isFinite(Number(authoritative.y)) ? Number(authoritative.y) : S.player.y,
              mapCode: authoritative.mapCode || S.player.mapCode,
              tuVi: authoritative.tuVi ?? authoritative.tuViHienTai,
              tuViHienTai: authoritative.tuViHienTai ?? authoritative.tuVi,
              tuViLenCap: authoritative.tuViLenCap,
              tuViLinhCan: authoritative.tuViLinhCan, tangTuVi: authoritative.tangTuVi,
              realmCode: authoritative.realmCode ?? S.player.realmCode,
              realmStage: Number(authoritative.realmStage ?? authoritative.tangTuVi ?? S.player.realmStage ?? 1),
              realm: Number(authoritative.realm ?? authoritative.canhGioi?.stt ?? S.player.realm ?? 1),
              canhGioi: authoritative.canhGioi || S.player.canhGioi,
              tenCanhGioi: authoritative.tenCanhGioi || authoritative.canhGioi?.tenCanhGioi || S.player.tenCanhGioi,
              stats: authoritative.stats,
              ...(authoritative.derivedStats && typeof authoritative.derivedStats === "object" ? { derivedStats: authoritative.derivedStats } : {}),
              combatPower: authoritative.combatPower,
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
          const targetMapVersion = Number(data.mapVersion || 0);
          let map = data.map ? normalizeWorldDto(data.map) : null;
          let hasCurrentMap = Boolean(S.tiles?.length && (!targetMapCode || S.mapCode === targetMapCode)
            && (!targetMapVersion || Number(S.mapVersion || 0) >= targetMapVersion));
          if (!map && !hasCurrentMap && targetMapCode) {
            UI.showLoading();
            const mapDto = await Net.get(API.PATHS.worlds.byCode(targetMapCode));
            map = normalizeWorldDto(mapDto);
          }
          if (map && ((targetMapCode && String(map.code).toLowerCase() !== targetMapCode)
            || (targetMapVersion && Number(map.version || 0) < targetMapVersion))) map = null;
          if (map && S.player) {
            const sameOrNewerMapVersion = S.mapCode === String(map.code).toLowerCase()
              && Number(S.mapVersion || 0) >= Number(map.version || 0)
              && Boolean(S.terrainCanvas);
            if (!sameOrNewerMapVersion) World.loadMap(map, S.player.x, S.player.y);
            hasCurrentMap = Boolean(S.tiles?.length && (!targetMapCode || S.mapCode === targetMapCode)
              && (!targetMapVersion || Number(S.mapVersion || 0) >= targetMapVersion));
          }
          if (!hasCurrentMap) throw new Error("BE không trả về dữ liệu map hợp lệ cho bản đồ hiện tại.");
          // Spawn/hồi sinh nằm trong bán kính cổng: khóa cổng tới khi người chơi bước ra (checkPortals mở lại ở >22).
          if (S.player) World.lockPortalsIfSpawnedInside?.(S.player);
          worldReady = true;
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
            const monster = Monster.make(mData, x, y, mData.id);
            if (typeof EntitySnapshots !== "undefined") EntitySnapshots.reset(monster, monster.px, monster.py);
            return monster;
          });
          S.groundItems = Array.isArray(data.groundItems) ? data.groundItems : [];

          UI.update();
          Net._nextMoveAt = performance.now() + Net.MOVEMENT_INTERVAL_MS;
          Net._movementReady = true;
        } catch (e) {
          UI.hideLoading();
          console.error("world_init error:", e);
          if (!worldReady) UI.notify("Không tải được bản đồ từ máy chủ. Hãy thử tải lại game.", "error");
        }
      });

      socket.on("map_updated", async (data) => {
        const mapCode = String(data?.mapCode || "").toLowerCase();
        const version = Number(data?.version || 0);
        if (!mapCode || mapCode !== String(S.mapCode || "").toLowerCase() || version <= Number(S.mapVersion || 0)) return;
        const refreshSeq = ++Net._mapRefreshSeq;
        try {
          const mapDto = await Net.get(API.PATHS.worlds.byCode(mapCode));
          if (refreshSeq !== Net._mapRefreshSeq || mapCode !== String(S.mapCode || "").toLowerCase()) return;
          const map = normalizeWorldDto(mapDto);
          if (!map || map.code !== mapCode || map.version !== version || version <= Number(S.mapVersion || 0) || !S.player) return;
          const playerX = S.player.x;
          const playerY = S.player.y;
          const otherPlayers = [...S.players.values()];
          World.loadMap(map, playerX, playerY, { silent: true });
          for (const player of otherPlayers) Net._upsertOther(player);
          const synchronized = await Net.command("world.resync");
          if (!synchronized?.ok) {
            S.monsters = (Array.isArray(data.monsters) ? data.monsters : []).map((monsterData) => {
              const x = Number(monsterData.x ?? monsterData.spawnX ?? 0);
              const y = Number(monsterData.y ?? monsterData.spawnY ?? 0);
              const monster = Monster.make(monsterData, x, y, monsterData.id);
              if (typeof EntitySnapshots !== "undefined") EntitySnapshots.reset(monster, monster.px, monster.py);
              return monster;
            });
            S.groundItems = Array.isArray(data.groundItems) ? data.groundItems : [];
          }
          UI.update();
          UI.log("Bản đồ vừa được cập nhật; quái và địa hình đã đồng bộ.", "system");
        } catch (error) {
          console.error("map_updated error:", error);
          UI.log("Không tải được bản đồ vừa cập nhật. Hãy tải lại trang để đồng bộ.", "system");
        }
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
          if (typeof data.glowTier === "number") op.glowTier = data.glowTier;
          if (typeof data.enhanceMaxLevel === "number") op.enhanceMaxLevel = data.enhanceMaxLevel;
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
          const tileX = Number(data.x), tileY = Number(data.y);
          if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;
          op.tx = tileX;
          op.ty = tileY;
          op.tpx = tileX * CFG.TS + CFG.TS / 2;
          op.tpy = tileY * CFG.TS + CFG.TS / 2;
          if (typeof EntitySnapshots !== "undefined") EntitySnapshots.push(op, op.tpx, op.tpy);
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
          if (typeof data.glowTier === "number") op.glowTier = data.glowTier;
          if (typeof data.enhanceMaxLevel === "number") op.enhanceMaxLevel = data.enhanceMaxLevel;
          if ((newMapCode || "").toLowerCase() !== (S.mapCode || "").toLowerCase()) {
            S.players.delete(pid);
          } else {
            const tileX = Number(data.x), tileY = Number(data.y);
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;
            op.x = tileX;
            op.y = tileY;
            op.mapCode = newMapCode;
            op.px = tileX * CFG.TS + CFG.TS / 2;
            op.py = tileY * CFG.TS + CFG.TS / 2;
            if (typeof EntitySnapshots !== "undefined") EntitySnapshots.reset(op, op.px, op.py);
          }
        }
      });

      socket.on("player_appearance_update", (data) => {
        if (!data || !data.id) return;
        const pid = data.id;
        if (socket?.id && pid === socket.id && S.player) {
          if (typeof data.glowTier === "number") S.player.glowTier = data.glowTier;
          if (typeof data.enhanceMaxLevel === "number") S.player.enhanceMaxLevel = data.enhanceMaxLevel;
          return;
        }
        const op = S.players.get(pid);
        if (!op) return;
        if (typeof data.glowTier === "number") op.glowTier = data.glowTier;
        if (typeof data.enhanceMaxLevel === "number") op.enhanceMaxLevel = data.enhanceMaxLevel;
      });

      // ── Monster Synchronization ──
      socket.on("monster_state_update", ({ monsters }) => {
        if (!monsters || !Array.isArray(monsters)) return;
        for (const mData of monsters) {
          const m = S.monsters.find(mon => mon.id === mData.id);
          if (m) {
            const tileX = Number(mData.x), tileY = Number(mData.y);
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
            m.tx = mData.x;
            m.ty = mData.y;
            m.tpx = tileX * CFG.TS + CFG.TS / 2;
            m.tpy = tileY * CFG.TS + CFG.TS / 2;
            if (typeof EntitySnapshots !== "undefined") EntitySnapshots.push(m, m.tpx, m.tpy);
            m.hp = Number(mData.hp) ?? m.hp;
            m.state = mData.state || m.state;
            m.dead = !!mData.dead;
          }
        }
      });

      socket.on("item_catalog_changed", (change) => {
        if (!change || typeof change !== "object") return;
        pendingItemChanges?.set(change.id, change);
        GameData.updateItemCatalog(change);
        Net.refreshItemViews();
      });

      socket.on("monster_update", ({ monsters }) => {
        if (!Array.isArray(monsters)) return;
        for (const data of monsters) {
          const m = S.monsters.find((mon) => mon.id === data.id);
          if (!m) continue;
          const tileX = Number(data.x), tileY = Number(data.y);
          if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
          const previousState = m.state;
          m.tpx = tileX * CFG.TS + CFG.TS / 2;
          m.tpy = tileY * CFG.TS + CFG.TS / 2;
          if (Number.isFinite(m.tpx) && Number.isFinite(m.tpy) && typeof EntitySnapshots !== "undefined") {
            EntitySnapshots.push(m, m.tpx, m.tpy);
          }
          m.hp = Number(data.hp ?? m.hp);
          m.maxHp = Number(data.maxHp || m.maxHp);
          for (const key of ["name", "img", "color", "type", "linhCan", "nguHanh", "level", "atk", "def", "speed", "respawnMs", "lootTableId", "animation", "size"]) {
            if (data[key] !== undefined) m[key] = data[key];
          }
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

      socket.on("player_combat_result", ({ targetId, attackerId, damage, absorbed, miss, hp, maxHp }) => {
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
        UI.updateVitals?.(S.player);
        if (typeof SkillVFX === "undefined") {
          Render.combatFx(S.player.px, S.player.py, miss ? "miss" : "hurt", miss ? "#a8ff8a" : "#ff5268", miss ? 0.7 : 1);
        }
        if (!miss && Number(damage) > 0) {
          S.cameraShake = { until: Date.now() + 90, power: 1.8 };
          if (typeof Sound !== "undefined") Sound.play("hurt");
        }
        Render.floatDmg(S.player.px, S.player.py, -36, miss ? "MISS" : `-${damage}`, miss ? "#88ff88" : "#ff4444");
        if (!miss && Number(absorbed) > 0) Render.floatDmg(S.player.px, S.player.py, -46, `Khiên đỡ ${absorbed}`, "#72d7ff");
        if (S.player.hp <= 0) {
          const newlyDead = !S.player.dead;
          S.player.hp = 0;
          S.player.dead = true;
          S.player.combatMove = false;
          S.player._spaceApproachTargetId = null;
          if (newlyDead) {
            Input.stopMovement?.();
            UI.showDeathModal?.();
          }
          UI.updateVitals?.(S.player);
        }
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
        if (existing) {
          Object.assign(existing, fresh, { dead: !!monster.dead });
          if (typeof EntitySnapshots !== "undefined") EntitySnapshots.reset(existing, existing.px, existing.py);
        } else {
          if (typeof EntitySnapshots !== "undefined") EntitySnapshots.reset(fresh, fresh.px, fresh.py);
          S.monsters.push(fresh);
        }
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
        if (typeof Sound !== "undefined") {
          if (loot?.xu || item?.kind === "xu") Sound.play("coin");
          else Sound.play("item");
        }
        UI.pushLoot(loot, "Nhặt");
        UI.buildInv(); UI.update();
      });

      socket.on("combat_result", (payload) => {
        S.combatPending = false;
        const { attackerId, skillCode, skillName, attackStyle, mp, cooldownMs, gcdMs, loot } = payload;
        const actor = attackerId === socket.id ? S.player : S.players.get(attackerId);
        const vfx = typeof SkillVFX !== "undefined" ? SkillVFX : null;
        const skill = skillCode && vfx ? vfx.findSkill(skillCode, actor) : null;
        if (attackerId === socket.id && typeof Sound !== "undefined") {
          if (skillCode) Sound.play("skill", { element: S.player?.linhCan });
          else if (payload.critical) Sound.play("crit");
          else if (payload.miss) Sound.play("miss");
          else Sound.play("hit");
        }
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
          if (!skill && !skillCode && vfx) vfx.basicAttack(actor || { px: m.px - 20, py: m.py }, m, { miss: missed, critical: Boolean(hit.critical), attackStyle });
          Render.floatDmg(m.px, m.py, -30, missed ? "MISS" : ((hit.critical ? "CRIT! " : "") + "-" + hit.damage), missed ? "#88ff88" : (hit.critical ? "#fff06a" : "#ff5555"), Boolean(hit.critical));
        }
        if (skill && vfx && visualHits.length) {
          const source = actor || { px: visualHits[0].px, py: visualHits[0].py };
          vfx.impact(skill, source, visualHits);
        }
        if (skillCode) {
          if (actor) {
            SkillSystem.animateCast(actor, skill);
            if (skillName) Render.floatSkill(actor.px, actor.py, skillName);
          }
        } else if (actor) {
          const target = visualHits[0];
          if (target) {
            const dx = target.px - actor.px;
            const dy = target.py - actor.py;
            actor.direction = Math.abs(dx) >= Math.abs(dy)
              ? (dx < 0 ? "left" : "right")
              : (dy < 0 ? "up" : "down");
          }
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
              const invBase = CFG.INV_BASE || 40;
              const invMax = CFG.INV_MAX || 80;
              const maxSlots = Math.min(invMax, Math.max(invBase, Number(S.player?.inventoryCapacity || invBase)));
              if (existing) existing.count = Math.min(99, Number(existing.count || 0) + Number(item.count || 1));
              else if (S.inventory.length < maxSlots) S.inventory.push({ ...item });
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
        const skill = typeof SkillVFX !== "undefined" ? SkillVFX.findSkill(skillCode, actor) : null;
        SkillSystem.animateCast(actor, skill);
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
        S.player.hp = hp;
        if (typeof maxHp === "number") S.player.maxHp = maxHp;
        S.player.mp = mp;
        if (typeof maxMp === "number") S.player.maxMp = maxMp;
        if (buffs && typeof buffs === "object" && !Array.isArray(buffs)) S.player.buffs = buffs;
        const skill = (typeof SkillVFX !== "undefined" && SkillVFX.findSkill(skillCode, S.player))
          || S.player.skills?.find(item => String(item.id) === String(skillCode) || String(item.code) === String(skillCode));
        SkillSystem.animateCast(S.player, skill);
        if (typeof SkillVFX !== "undefined" && skill) {
          SkillVFX.support(skill, S.player);
          SkillVFX.activateBuff(skill, effectDurationMs);
        }
        else Render.combatFx(S.player.px, S.player.py, "skill", effectColor(effect));
        // Hồi chiêu phải gắn vào kỹ năng trong ô của người chơi, không phải object VFX từ SkillVFX.findSkill.
        const ownedSkill = Net._playerSkill(skillCode);
        if (ownedSkill) ownedSkill.cdLeft = Math.floor((cooldownMs || 1000) / 16);
        if (skillName) Render.floatSkill(S.player.px, S.player.py, skillName, effectColor(effect));
        if (heal) UI.log(`${skill?.icon || "✦"} Hồi ${heal} HP`, "level");
        if (mpRestore) UI.log(`${skill?.icon || "✦"} Hồi ${mpRestore} MP`, "level");
        if (effect && !["heal", "restore_mp", "cleanse"].includes(effect)) {
          const labels = { shield: "khiên hộ thể", buff_atk: "sát thương", buff_def: "giáp", buff_crit: "chí mạng", buff_spd: "tốc độ", buff_cast: "tốc độ ra chiêu", buff_hp_regen: "hồi HP", buff_mp_regen: "hồi MP", buff_vitals: "sinh lực tối đa" };
          const label = labels[effect] || effect.replace(/^buff_/, "");
          const seconds = Math.max(1, Math.round(Number(effectDurationMs || 0) / 1000));
          // Khiên là lớp hấp thụ: hiện số điểm đỡ BE trả về; buff còn lại là phần trăm.
          const amount = effect === "shield" && Number(buffs?.shield?.absorb) > 0
            ? `${buffs.shield.absorb}`
            : `${effectVal || 0}%`;
          UI.log(`${skill?.icon || "✦"} ${skillName || "Kỹ năng"} đã kích hoạt · +${amount} ${label} (${seconds}s)`, "level");
          Render.floatSkill(S.player.px, S.player.py - 8, `+${amount} ${label}`, effectColor(effect));
        }
        UI.update();
      });

      socket.on("player_state_update", ({ hp, maxHp, mp, maxMp, buffs, stats, derivedStats, glowTier, enhanceMaxLevel, unspentStatPoints, xu, linhThach, inventoryCapacity, tuVi, tuViHienTai, tuViLenCap, tuViLinhCan, combatPower, realmCode, realmStage, tangTuVi, realm, canhGioi, tenCanhGioi }) => {
        if (!S.player) return;
        const prevCapacity = S.player.inventoryCapacity;
        if (typeof hp === "number") S.player.hp = hp;
        if (typeof maxHp === "number") S.player.maxHp = maxHp;
        if (typeof mp === "number") S.player.mp = mp;
        if (typeof maxMp === "number") S.player.maxMp = maxMp;
        if (buffs) S.player.buffs = buffs;
        if (stats && typeof stats === "object") S.player.stats = stats;
        if (derivedStats && typeof derivedStats === "object") S.player.derivedStats = derivedStats;
        if (typeof glowTier === "number") S.player.glowTier = glowTier;
        if (typeof enhanceMaxLevel === "number") S.player.enhanceMaxLevel = enhanceMaxLevel;
        if (typeof unspentStatPoints === "number") S.player.unspentStatPoints = unspentStatPoints;
        if (typeof xu === "number") S.player.xu = xu;
        if (typeof linhThach === "number") S.player.linhThach = linhThach;
        if (typeof inventoryCapacity === "number") S.player.inventoryCapacity = inventoryCapacity;
        if (typeof tuVi === "number") S.player.tuVi = tuVi;
        if (typeof tuViHienTai === "number") S.player.tuViHienTai = tuViHienTai;
        else if (typeof tuVi === "number") S.player.tuViHienTai = tuVi;
        if (typeof tuViLenCap === "number") S.player.tuViLenCap = tuViLenCap;
        if (typeof tuViLinhCan === "number") S.player.tuViLinhCan = tuViLinhCan;
        if (typeof combatPower === "number") S.player.combatPower = combatPower;
        if (typeof realmCode === "string") S.player.realmCode = realmCode;
        if (typeof realmStage === "number") S.player.realmStage = realmStage;
        if (typeof tangTuVi === "number") S.player.tangTuVi = tangTuVi;
        else if (typeof realmStage === "number") S.player.tangTuVi = realmStage;
        if (canhGioi && typeof canhGioi === "object") S.player.canhGioi = canhGioi;
        if (typeof realm === "number") S.player.realm = realm;
        else if (canhGioi && typeof canhGioi.stt === "number") S.player.realm = canhGioi.stt;
        if (typeof tenCanhGioi === "string") S.player.tenCanhGioi = tenCanhGioi;
        else if (canhGioi && typeof canhGioi.tenCanhGioi === "string") S.player.tenCanhGioi = canhGioi.tenCanhGioi;
        if (typeof inventoryCapacity === "number" && inventoryCapacity !== prevCapacity) UI.buildInv?.();
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

      socket.on("server_announcement", (payload) => {
        const msg = payload?.message || payload?.text || "";
        if (!msg) return;
        UI.notify(`📢 ${msg}`, "success");
        UI.log(`📢 ${msg}`, "level");
      });

    } catch (e) {
      console.error("Socket error:", e);
      Net._setBadge(false);
    }
  },

  emitMove() {
    if (!socket?.connected || !S.player || !this._movementReady) {
      return Promise.resolve({ ok: false, error: { code: "WORLD_NOT_JOINED" } });
    }
    if (!this._queuedMove) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      this._queuedMove = { promise, resolve };
    }
    const queued = this._queuedMove;
    this._flushMovement();
    return queued.promise;
  },

  _flushMovement() {
    if (this._moveTimer || !this._queuedMove) return;
    if (!socket?.connected || !S.player || !this._movementReady) {
      this._resetMovement();
      return;
    }
    const wait = this._nextMoveAt - performance.now();
    if (wait > 0) {
      this._moveTimer = setTimeout(() => {
        this._moveTimer = null;
        this._flushMovement();
      }, Math.ceil(wait));
      return;
    }
    const queued = this._queuedMove;
    this._queuedMove = null;
    this._movesInFlight.add(queued);
    this._nextMoveAt = performance.now() + this.MOVEMENT_INTERVAL_MS;
    // Read the latest position at dispatch. Stop and portal requests share this queue.
    void this.command("movement.intent", {
      x: S.player.x,
      y: S.player.y,
      mapCode: S.mapCode,
    }).then(queued.resolve, () => queued.resolve({
      ok: false, error: { code: "NETWORK_ERROR" },
    })).finally(() => {
      this._movesInFlight.delete(queued);
    });
  },

  _resetMovement() {
    clearTimeout(this._moveTimer);
    this._moveTimer = null;
    const response = { ok: false, error: { code: "WORLD_NOT_JOINED" } };
    this._queuedMove?.resolve(response);
    for (const pending of this._movesInFlight) pending.resolve(response);
    this._queuedMove = null;
    this._movesInFlight.clear();
    this._movementReady = false;
    this._nextMoveAt = 0;
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
  },

  toggleAutoLoot() {
    this._autoLootEnabled = AutoLoot.setEnabled(!AutoLoot.isEnabled());
    this._autoLootElapsed = 0;
    UI.updateAutoLootToggle(this._autoLootEnabled);
    UI.notify(this._autoLootEnabled ? "Tự nhặt vật phẩm gần đã bật." : "Tự nhặt vật phẩm gần đã tắt.", this._autoLootEnabled ? "success" : "info");
  },

  pickupLoot(itemId, { automatic = false, claimed = false } = {}) {
    if ((!API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled)) return this._pickupMockLoot(itemId);
    if (!socket?.connected) {
      if (!automatic) UI.notify("Cần kết nối máy chủ để nhặt vật phẩm.", "warning");
      return Promise.resolve({ ok: false, error: { code: "OFFLINE" } });
    }
    if (automatic && !claimed && !AutoLoot.claim(itemId)) return Promise.resolve({ ok: false, error: { code: "PICKUP_PENDING" } });
    return this.command("loot.pickup", { itemId }).then((response) => {
      const code = response?.error?.code;
      const retryAfter = response?.ok ? 2400
        : (code === "INVENTORY_FULL" ? 12000 : (code === "LOOT_NOT_FOUND" ? 10000 : 5000));
      if (automatic || claimed) AutoLoot.settle(itemId, retryAfter);
      return response;
    }, (error) => {
      if (automatic || claimed) AutoLoot.settle(itemId, 5000);
      throw error;
    });
  },

  async _pickupMockLoot(itemId) {
    const index = (S.groundItems || []).findIndex((drop) => String(drop.id) === String(itemId));
    const drop = S.groundItems?.[index];
    if (index < 0 || !drop || !S.player) {
      AutoLoot.settle(itemId, 5000);
      return { ok: false, error: { code: "LOOT_NOT_FOUND" } };
    }
    const x = Number(drop.x || 0) * CFG.TS + CFG.TS / 2;
    const y = Number(drop.y || 0) * CFG.TS + CFG.TS / 2;
    const distance = Math.hypot(Number(S.player.px ?? S.player.x) - x, Number(S.player.py ?? S.player.y) - y);
    if (!Number.isFinite(distance) || distance > 22) {
      AutoLoot.settle(itemId, 1800);
      return { ok: false, error: { code: "LOOT_OUT_OF_RANGE" } };
    }
    if (drop.kind === "xu") {
      S.player.xu = Number(S.player.xu || 0) + Math.max(0, Math.floor(Number(drop.xu) || 0));
    } else {
      const item = drop.item || drop;
      const count = Math.max(1, Math.min(99, Math.floor(Number(drop.count || 1))));
      let picked = 0;
      while (picked < count && Inventory.add(item)) picked += 1;
      if (!picked) {
        AutoLoot.settle(itemId, 12000);
        return { ok: false, error: { code: "INVENTORY_FULL" } };
      }
      if (picked < count) {
        drop.count = count - picked;
        AutoLoot.settle(itemId, 12000);
      } else {
        S.groundItems.splice(index, 1);
        AutoLoot.complete(itemId);
      }
      await MockBackend.recordQuestEvent("collect_item", { itemId: item.id, count: picked });
      UI.pushLoot({ items: [{ ...item, count: picked }] }, "Nhặt");
    }
    if (drop.kind === "xu") {
      S.groundItems.splice(index, 1);
      AutoLoot.complete(itemId);
      UI.pushLoot({ items: [{ id: itemId, name: `${drop.xu} xu`, icon: "💰", count: 1 }] }, "Nhặt");
    }
    UI.update();
    void this.saveNow({ type: "mock_loot" });
    return { ok: true, item: drop.item || null };
  },

  tickAutoLoot(dt) {
    const mockMode = Boolean((!API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled));
    if (!this._autoLootEnabled || (!mockMode && (!this._isOnline || !socket?.connected)) || !S.player) return null;
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
    S.isHost = false;
  },

  emitMapChange(mapCode, x, y) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if ((!API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled)) {
      UI.showLoading();
      void this.get(API.PATHS.worlds.byCode(mapCode)).then((world) => {
        if (!world?.code) throw new Error(world?.error || "Không tìm thấy bản đồ mô phỏng.");
        World.loadMap(world, px, py);
        if (S.player) {
          S.player.mapCode = world.code;
          S.player.mapId = world.code;
          S.player.isTeleporting = false;
          S.player.portalLocked = false;
        }
        UI.hideLoading();
        void this.saveNow({ type: "mock_map_change" });
      }).catch((error) => {
        if (S.player) {
          S.player.isTeleporting = false;
          S.player.portalLocked = false;
        }
        UI.hideLoading();
        UI.notify(error?.message || "Không thể chuyển bản đồ mô phỏng.", "error");
      });
      return;
    }
    if (socket?.connected) {
      UI.showLoading(); // Hiển thị màn hình chờ khi chuyển map
      clearTimeout(Net._mapChangeTimer);
      Net._mapChangeTimer = null;
      Net._clearOthers();
      Net._mapChangeTimer = setTimeout(async () => {
        Net._mapChangeTimer = null;
        if (!socket?.connected) return;
        // Portal validation must see the acknowledged authoritative position, not a fixed delay guess.
        const movement = await Net.emitMove();
        if (!movement?.ok) {
          if (S.player) {
            S.player.isTeleporting = false;
            S.player.portalLocked = false;
          }
          UI.hideLoading();
          return;
        }
        if (socket?.connected) Net.command("map.change", { mapCode, x: px, y: py });
      }, 0);
    }
  },

  sendChat() {
    const inp = document.getElementById("chat-inp");
    if (!inp) return;
    const msg = inp.value.trim();
    if (!msg) {
      inp.blur();
      return;
    }
    if (socket?.connected) {
      Net.command("chat.send", { message: msg });
    } else {
      UI.notify("Chưa kết nối BE, tin nhắn chưa gửi.", "warning");
      return;
    }
    inp.value = "";
    inp.blur();
  },

  async respawnPlayer() {
    if (!S.player?.dead) return;
    const button = document.getElementById("death-respawn-btn");
    if (button) button.disabled = true;
    UI.setDeathMessage?.("Đang gọi hồi sinh…");
    try {
      const response = await Net.mutate("POST", API.PATHS.player.respawn, {});
      if (!response?.player) throw new Error(response?.error || "Máy chủ chưa hỗ trợ hồi sinh.");
      Net.applyPlayerSnapshot(response.player, { render: false });
      const isMock = !API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled;
      if (!isMock && socket?.connected) {
        const joined = await Net.command("world.join", {});
        if (!joined?.ok) {
          UI.notify("Đã lưu hồi sinh. Đang đồng bộ lại kết nối thế giới…", "warning");
          socket.disconnect();
          socket.connect();
        }
      }
      const player = S.player;
      player.dead = false;
      player.px = Number(player.x || 0) * CFG.TS + CFG.TS / 2;
      player.py = Number(player.y || 0) * CFG.TS + CFG.TS / 2;
      player.isMoving = false;
      player.combatMove = false;
      player.movePath = [];
      player.targetMovePos = null;
      player._spaceApproachTargetId = null;
      S.target = null;
      S.combatPending = false;
      World.clearPendingNpcInteraction?.();
      World.cancelPlayerMove(player);
      const xuLost = Math.max(0, Math.floor(Number(response?.result?.xuLost ?? response?.xuLost ?? 0)));
      const xuAfter = Number(response?.result?.xu);
      if (Number.isFinite(xuAfter) && S.player) S.player.xu = Math.max(0, Math.floor(xuAfter));
      const notice = xuLost > 0
        ? `Đã hồi sinh tại điểm xuất phát (-${xuLost} xu lộ phí, giữ nguyên tu vi).`
        : "Đã hồi sinh tại điểm xuất phát (0 xu lộ phí, giữ nguyên tu vi).";
      UI.hideDeathModal?.();
      UI.update();
      UI.log?.(`🏥 ${notice}`, "system");
      UI.notify(notice, "success");
    } catch (error) {
      UI.setDeathMessage?.(error.message || "Không thể hồi sinh. Vui lòng thử lại.");
    } finally {
      if (button) button.disabled = !S.player || !S.player.dead;
    }
  },

  _setBadge(online) {
    const ob = document.getElementById("online-badge");
    if (ob) {
      if ((!API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled)) {
        ob.textContent = "● Local Mock";
        ob.style.color = "#e2c46f";
        ob.title = "API đang dùng dữ liệu mô phỏng trên trình duyệt; không kết nối BE/Socket.";
      } else {
        ob.textContent = online ? "● Online" : "● Offline";
        ob.style.color = online ? "var(--green)" : "#aa4444";
        ob.title = "";
      }
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

    if (typeof EntitySnapshots !== "undefined" && !Array.isArray(updatedData._snapshots)) {
      EntitySnapshots.reset(updatedData, updatedData.px, updatedData.py);
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
