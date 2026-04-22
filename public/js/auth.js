"use strict";
// ════════════════════════════════════════════════════════════
// auth.js — §2 Auth Module
// ════════════════════════════════════════════════════════════

const Auth = {
  _mode: "login",

  showTab(mode) {
    Auth._mode = mode;
    document.getElementById("tab-login").className =
      "auth-tab" + (mode === "login" ? " active" : "");
    document.getElementById("tab-reg").className =
      "auth-tab" + (mode === "register" ? " active" : "");
    document.getElementById("reg-confirm-wrap").style.display =
      mode === "register" ? "" : "none";
    document.getElementById("auth-btn").textContent =
      mode === "login" ? "ĐĂNG NHẬP" : "ĐĂNG KÝ";
    document.getElementById("auth-alt").innerHTML =
      mode === "login"
        ? "Chưa có tài khoản? <a onclick=\"Auth.showTab('register')\">Đăng ký ngay</a>"
        : "Đã có tài khoản? <a onclick=\"Auth.showTab('login')\">Đăng nhập</a>";
    Auth._clearErr();
  },

  async submit() {
    const username = document.getElementById("inp-user").value.trim();
    const password = document.getElementById("inp-pass").value;
    Auth._clearErr();
    if (!username || !password)
      return Auth._err("Vui lòng điền đầy đủ thông tin");

    if (Auth._mode === "register") {
      const confirm = document.getElementById("inp-confirm").value;
      if (password !== confirm)
        return Auth._err("Mật khẩu xác nhận không khớp");
    }

    const btn = document.getElementById("auth-btn");
    btn.disabled = true;
    btn.textContent = "Đang xử lý...";

    try {
      const path =
        Auth._mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(API.BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        Auth._err(data.error || "Lỗi không xác định");
        return;
      }

      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem("tu_tien_token", authToken);

      Auth._afterLogin();
    } catch {
      Auth._err("Không thể kết nối máy chủ. Thử lại sau?");
    } finally {
      btn.disabled = false;
      btn.textContent = Auth._mode === "login" ? "ĐĂNG NHẬP" : "ĐĂNG KÝ";
    }
  },

  async _afterLogin() {
    // Try to load existing character
    try {
      const data = await Net.get("/api/player/by-user/" + currentUser.id);
      if (data?.id && !data.error) {
        Auth._startGameWithData(data);
        return;
      }
    } catch {}
    // No character → create screen
    showScreen("create");
  },

  async _startGameWithData(playerData) {
    const parsedTrangBi =
      typeof playerData.trangBi === "string"
        ? (() => {
            try {
              return JSON.parse(playerData.trangBi);
            } catch {
              return null;
            }
          })()
        : playerData.trangBi || null;
    const equipSource =
      parsedTrangBi ||
      (typeof playerData.equip_slot === "string"
        ? (() => {
            try {
              return JSON.parse(playerData.equip_slot);
            } catch {
              return null;
            }
          })()
        : playerData.equip_slot || null);
    const equipment = {
      weapon: parseEquipSlot(equipSource?.vuKhi || null),
      armor: parseEquipSlot(equipSource?.ao || null),
      boots: parseEquipSlot(equipSource?.giay || null),
      hat: parseEquipSlot(equipSource?.mu || null),
      gloves: parseEquipSlot(equipSource?.tay || null),
      ring: parseEquipSlot(equipSource?.nhan || null),
      amulet: parseEquipSlot(equipSource?.vong || null),
    };
    const rootObject = CFG.ROOTS.find((r) => r.id === playerData.linhCan);
    const rawSkills = (() => {
      try {
        return typeof playerData.skills === "string"
          ? JSON.parse(playerData.skills)
          : playerData.skills;
      } catch {
        return null;
      }
    })();
    // Luôn dùng mapBESkillToFE để đảm bảo damageType + satThuong luôn có
    const savedSkills =
      Array.isArray(rawSkills) && rawSkills.length
        ? rawSkills.map((sk) => {
            // Nếu skill đã có damageType (FE format cũ) → map lại để cập nhật format
            // Nếu có mpTieuHao/hoiChieu (BE format) → map từ BE
            // Trường hợp còn lại: giữ nguyên nhưng đảm bảo có cdLeft
            if (sk.mpTieuHao != null || sk.hoiChieu != null) return mapBESkillToFE(sk);
            if (!sk.damageType) return mapBESkillToFE(sk); // Force re-map nếu thiếu field
            return { ...sk, cdLeft: sk.cdLeft ?? 0 };
          })
        : null;
    S.player = {
      ...playerData,
      name: playerData.name,
      root: rootObject || cRoot || null,
      linhCan: playerData.linhCan,
      realm: playerData.canhGioi?.stt || 0,
      stage: playerData.tangTuVi || 1,
      stats: playerData.stats || { str: 0, agi: 0, vit: 0, ene: 0 },
      hp: playerData.hp,
      maxHp: playerData.maxHp,
      mp: playerData.mp,
      maxMp: playerData.maxMp,
      xu: playerData.xu,
      tuViHienTai: playerData.tuViHienTai || 0,
      tuViLenCap:
        playerData.tuViLenCap ||
        Cultivation.calcTuNeeded(
          playerData.canhGioi,
          playerData.tangTuVi || 1,
        ),
      tuViLinhCan: playerData.tuViLinhCan || 0,
      x: playerData.x || 26,
      y: playerData.y || 30,
      px: (playerData.x || 26) * CFG.TS + CFG.TS / 2,
      py: (playerData.y || 30) * CFG.TS + CFG.TS / 2,
      trangBi: parsedTrangBi,
      equipment,
      skills: savedSkills || SkillSystem.assignSkills(playerData.linhCan),
      buffs: {},
    };
    try {
      S.inventory = JSON.parse(playerData.jsonIventory) || [];
    } catch (e) {}
    let map = {};
    const mapCode = playerData.mapCode || playerData.mapId;
    if (mapCode) {
      const dto = await Net.get(`/api/worlds/by-code?code=${mapCode}`);
      map = normalizeWorldDto(dto);
    } else {
      const defaultDto = await Net.get("/api/worlds/default");
      map = normalizeWorldDto(defaultDto);
    }
    if (!map) return;
    enterGame(map, playerData.x || map.w / 2, playerData.y || map.h / 2);
  },

  playOffline() {
    authToken = null;
    currentUser = null;
    showScreen("create");
  },

  logout() {
    Net.saveNow().finally(() => {
      localStorage.removeItem("tu_tien_token");
      authToken = null;
      currentUser = null;
      S.player = null;
      S.inventory = [];
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      clearInterval(Net._saveTimer);
      location.reload();
    });
  },

  _err(msg) {
    const el = document.getElementById("auth-err");
    el.textContent = msg;
    el.classList.add("show");
  },
  _clearErr() {
    document.getElementById("auth-err").classList.remove("show");
  },

  // Auto-login if token exists
  async tryAutoLogin() {
    if (!authToken) return false;
    try {
      const res = await fetch(API.BASE + "/api/auth/me", {
        headers: { Authorization: "Bearer " + authToken },
      });
      if (!res.ok) {
        localStorage.removeItem("tu_tien_token");
        authToken = null;
        return false;
      }
      const data = await res.json();
      currentUser = { id: data.user.id, username: data.user.username };
      document.getElementById("auth-status").textContent =
        `Chào lại, ${data.user.username}!`;
      await Auth._afterLogin();
      return true;
    } catch {
      return false;
    }
  },
};
