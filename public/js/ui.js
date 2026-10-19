// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/ui.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Quản lý giao diện người dùng (HUD/UI Controller): Cập nhật thông số nhân vật (HP, MP,
//      tu vi, cảnh giới, linh căn, OVR), hiển thị Target HUD mục tiêu, quản lý các modal menu
//      hành trang (KPAH Modal), tooltip vật phẩm, thanh chat và màn hình loading.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.INV_MAX, CFG.REALMS, Linh_CAN, TC.
//    - Phụ thuộc: State (S), Combat, SkillSystem, Net.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Đồng bộ mượt mà trạng thái từ S.player và S.target lên DOM.
//    - Tối ưu DOM repaint: Cache hash trang bị, chỉ vẽ lại trang bị khi mở modal hoặc có thay đổi.
// ════════════════════════════════════════════════════════════════════════════════════════

const UI = {
  _lastEqHash: "",
  selectedInventoryIndex: -1,
  _lastLog: { msg: "", at: 0, node: null, count: 0 },
  toggleKpahMenu() {
    const el = document.getElementById("kpah-menu-modal");
    if (el) el.style.display = (el.style.display === "none") ? "flex" : "none";
    if (el?.style.display === "flex") {
      SkillSystem.loadBook();
      UI.renderEquipment(true);
    }
  },
  toggleChat() {
    const el = document.getElementById("chat-bar");
    if (el) {
      el.style.display = (el.style.display === "none") ? "flex" : "none";
      if (el.style.display === "flex") {
        document.getElementById("chat-inp").focus();
      }
    }
  },
  async toggleContinent() {
    const el = document.getElementById("continent-modal");
    if (!el) return;
    const opening = el.style.display === "none";
    el.style.display = opening ? "flex" : "none";
    if (!opening || this._continentLoaded) return;
    try {
      const data = await Net.get(API.PATHS.worlds.structure);
      const regions = document.getElementById("continent-regions");
      document.getElementById("continent-name").textContent = data.name || "Đại lục";
      document.getElementById("continent-summary").textContent = data.description || "Địa đồ đang được cập nhật.";
      regions.innerHTML = (data.regions || []).map((region) => `<section class="continent-region"><div class="region-title"><b>${region.name}</b><span>${region.description || ""}</span></div><div class="continent-maps">${(region.maps || []).map((map) => `<div class="continent-map ${map.playable ? "playable" : "planned"}"><span class="map-status">${map.playable ? "Đang mở" : "Quy hoạch"}</span><b>${map.name}</b><small>${map.type} · Lv ${map.level}</small></div>`).join("")}</div></section>`).join("");
      this._continentLoaded = true;
    } catch (error) {
      document.getElementById("continent-summary").textContent = "Không tải được địa đồ máy chủ.";
    }
  },
  showLoading() {
    const el = document.getElementById("loading-screen");
    if (el) el.style.display = "flex";
    clearTimeout(this._loadingTimer);
    this._loadingTimer = setTimeout(() => {
      this.hideLoading();
    }, 2500);
  },
  hideLoading() {
    clearTimeout(this._loadingTimer);
    const el = document.getElementById("loading-screen");
    if (el) el.style.display = "none";
  },
  update() {
    if (!S.player) return;
    const p = S.player;
    document.getElementById("ui-name").textContent = p.name;
    const profileName = document.getElementById("ui-profile-name");
    if (profileName) profileName.textContent = p.name || "Tu sĩ";
    const profileAvatar = document.getElementById("ui-profile-avatar");
    if (profileAvatar) {
      const avatarFallback = p.gender === "FEMALE" ? "./assets/char_female.png" : "./assets/char_male.png";
      profileAvatar.src = /_anim-source\.png$/i.test(p.img || "") ? avatarFallback : (p.img || avatarFallback);
    }
    const rootEl = document.getElementById("ui-root");
    if (rootEl) {
      rootEl.textContent = p.linhCan || p.root?.name || "Chưa định linh căn";
      rootEl.style.color = Linh_CAN[p.linhCan]?.color || p.root?.color || "#a8a4b8";
    }
    const profileRoot = document.getElementById("ui-profile-root");
    if (profileRoot) profileRoot.textContent = p.linhCan || p.root?.name || "Chưa định linh căn";
    const ovrEl = document.getElementById("ui-ovr");
    if (ovrEl) ovrEl.textContent = calcCombatPower(p).toLocaleString();
    const profileOvr = document.getElementById("ui-profile-ovr");
    if (profileOvr) profileOvr.textContent = calcCombatPower(p).toLocaleString();

    const st = document.getElementById("ui-spirit-tag");
    if (st) {
      st.textContent = `${p.linhCan} thuộc tính`;
      st.style.color = Linh_CAN[p.linhCan]?.color || "#aaa";
    }

    const role = Combat.getRole();
    const roleEl = document.getElementById("ui-role");
    if (roleEl) {
      roleEl.textContent = role.name;
      roleEl.style.color = role.color;
      roleEl.style.textShadow = `0 0 8px ${role.color}88`;
    }

    // Realm name: ưu tiên từ canhGioi object, fallback sang CFG.REALMS
    const realmName =
      p.tenCanhGioi ||
      p.canhGioi?.tenCanhGioi ||
      (CFG.REALMS[p.realm || 0]?.tenCanhGioi) ||
      "Luyện Thể";
    
    const uiStage = document.getElementById("ui-stage");
    if (uiStage) {
      document.getElementById("ui-realm").textContent = realmName;
      uiStage.textContent = `Tầng ${p.tangTuVi}`;
    } else {
      // Nếu không có ui-stage (KPAH HUD), gộp chung vào ui-realm
      const uiRealm = document.getElementById("ui-realm");
      if (uiRealm) uiRealm.textContent = `${realmName} - Tầng ${p.tangTuVi}`;
    }
    const profileRealm = document.getElementById("ui-profile-realm");
    if (profileRealm) profileRealm.textContent = `${realmName} · Tầng ${p.tangTuVi || 1}`;
    document.getElementById("ui-cp").textContent = calcCombatPower(p).toLocaleString();

    const hp = Math.floor(p.hp || 0);
    const maxHp = Math.max(1, p.maxHp || 100);
    document.getElementById("ui-hp").textContent = `${hp}/${maxHp}`;
    document.getElementById("b-hp").style.width =
      Math.min(100, Math.max(0, Math.floor((hp / maxHp) * 100))) + "%";

    const mp = Math.floor(p.mp || 0);
    const maxMp = Math.max(1, p.maxMp || 100);
    document.getElementById("ui-mp").textContent = `${mp}/${maxMp}`;
    document.getElementById("b-mp").style.width =
      Math.min(100, Math.max(0, Math.floor((mp / maxMp) * 100))) + "%";

    const tuViHienTai = Number(p.tuViHienTai) || 0;
    const tuViLenCap = Math.max(1, Number(p.tuViLenCap) || 100);
    const uiTu = document.getElementById("ui-tu");
    if (uiTu) uiTu.textContent = `${Math.floor(tuViHienTai)}/${Math.floor(tuViLenCap)}`;
    const bTu = document.getElementById("b-tu");
    if (bTu) bTu.style.width = Math.min(100, Math.max(0, Math.floor((tuViHienTai / tuViLenCap) * 100))) + "%";

    const uiXu = document.getElementById("ui-xu");
    if (uiXu) uiXu.textContent = p.xu.toLocaleString();

    const mapName = document.getElementById("mini-map-name");
    if (mapName) mapName.textContent = S.mapName || S.mapCode || "Bản đồ";
    const coords = document.getElementById("map-coords");
    if (coords) coords.textContent = `${Math.floor(p.x)},${Math.floor(p.y)}`;

    const s = p.stats;
    const _i = (v) => Math.floor(Number(v) || 0);
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setTxt("r-str", _i(s.str));
    setTxt("r-agi", _i(s.agi));
    setTxt("r-vit", _i(s.vit));
    setTxt("r-ene", _i(s.ene));
    setTxt("r-patk", _i(Combat.pAtk()));
    setTxt("r-matk", _i(Combat.mAtk()));
    setTxt("r-def", _i(Combat.pDef()));
    setTxt("r-spd", _i(3 + _i(s.agi) * 0.5));
    setTxt("r-eva", Combat.evasion().toFixed(1) + "%");
    setTxt("r-tvlc", p.tuViLinhCan || 0);
    setTxt("inv-head", `✦ TÚI ĐỒ (${S.inventory.length}/${CFG.INV_MAX})`);

    // ── Target HUD ──
    const targetEl = document.getElementById("target-hud");
    if (targetEl) {
      const t = S.target;
      if (t && !t.dead && (t.hp === undefined || t.hp > 0)) {
        targetEl.style.display = "block";
        const nameEl = document.getElementById("target-name");
        if (nameEl) nameEl.textContent = t.name || "Mục tiêu";
        const lvlEl = document.getElementById("target-level");
        if (lvlEl) lvlEl.textContent = `Lv.${t.level || 1}`;
        const elemEl = document.getElementById("target-elem");
        if (elemEl) {
          const elem = Array.isArray(t.nguHanh) ? (t.nguHanh[0] || "VÔ") : (t.nguHanh || "VÔ");
          elemEl.textContent = elem;
          elemEl.className = `target-badge elem elem-${String(elem).toLowerCase()}`;
        }
        const avEl = document.getElementById("target-avatar");
        if (avEl) avEl.textContent = t.icon || "👾";

        const curHp = Math.max(0, Math.floor(t.hp ?? t.maxHp ?? 100));
        const maxHp = Math.max(1, Math.floor(t.maxHp ?? 100));
        const pct = Math.min(100, Math.max(0, Math.round((curHp / maxHp) * 100)));
        const barEl = document.getElementById("target-hp-bar");
        if (barEl) barEl.style.width = `${pct}%`;
        const txtEl = document.getElementById("target-hp-text");
        if (txtEl) txtEl.textContent = `${curHp} / ${maxHp}`;
      } else {
        targetEl.style.display = "none";
        if (t && (t.dead || t.hp <= 0)) S.target = null;
      }
    }

    this.renderEquipment();
    SkillSystem.renderSkillBar();
  },

  renderEquipment(force = false) {
    const modal = document.getElementById("kpah-menu-modal");
    if (!force && (!modal || modal.style.display === "none")) return;
    const eq = S.player?.equipment || {};
    const eqHash = JSON.stringify(eq);
    if (!force && this._lastEqHash === eqHash) return;
    this._lastEqHash = eqHash;
    const slots = [
      { id: "slot-weapon", label: "Vũ Khí", item: eq.weapon },
      { id: "slot-helmet", label: "Mũ", item: eq.hat },
      { id: "slot-armor", label: "Giáp", item: eq.armor },
      { id: "slot-pants", label: "Quần", item: eq.pants || null },
      { id: "slot-boots", label: "Giày", item: eq.boots },
      { id: "slot-ring", label: "Nhẫn", item: eq.ring },
      { id: "slot-amulet", label: "Vòng", item: eq.amulet },
      { id: "slot-belt", label: "Đai", item: eq.belt || null },
      { id: "slot-gem", label: "Linh Thạch", item: eq.gem || null },
    ];
    for (const slot of slots) {
      const el = document.getElementById(slot.id);
      if (!el) continue;
      const icon = slot.item?.icon || slot.label.slice(0, 1);
      el.innerHTML = `<div class="eicon">${icon}</div>${slot.item?.name || slot.label}`;
      el.classList.toggle("equipped", Boolean(slot.item));
      el.title = slot.item ? `${slot.item.name || slot.label}\nClick để tháo` : `${slot.label}\nÔ trống`;
      el.onclick = slot.item ? () => Inventory.unequip(slot.item, slot.id.replace("slot-", "")) : null;
    }
  },

  showTip(item, e) {
    const tip = document.getElementById("tip");
    document.getElementById("tip-name").textContent =
      (item.icon || "") + " " + item.name;
    document.getElementById("tip-type").textContent =
      item.type === "STONE"
        ? "Linh Thạch"
        : item.type === "ELEMSTONE"
          ? "Đá Nguyên Tố"
          : item.type === "MAT"
            ? "Nguyên Liệu"
            : item.type === "CONSUME"
              ? "Đan Dược"
              : "Vật Phẩm";
    document.getElementById("tip-body").innerHTML =
      `${item.description + `${item?.giaTriTuVi ? "+ " + item?.giaTriTuVi : ""} ` || ""}<br><span style="color:var(--text2)">Bán: ${item.giaBan || 0} xu</span>`;
    tip.style.display = "block";
    tip.style.left = e.clientX + 14 + "px";
    tip.style.top = e.clientY - 10 + "px";
  },

  moveTip(e) {
    const tip = document.getElementById("tip");
    if (!tip || tip.style.display === "none") return;
    tip.style.left = `${e.pageX + 12}px`;
    tip.style.top = `${e.pageY + 12}px`;
  },

  hideTip() {
    const tip = document.getElementById("tip");
    if (!tip) return;
    tip.style.display = "none";
  },

  buildInv() {
    const grid = document.getElementById("inv-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < CFG.INV_MAX; i++) {
      const it = S.inventory[i];
      const el = document.createElement("div");
      el.className = it ? "isl" : "isl empty";
      if (it) {
        el.title = (it.name || it.id) + (it.desc ? "\n" + it.desc : "");
        el.innerHTML = `${it.icon || "📦"}<span class="icnt">x${it.count || 1}</span>`;
        el.classList.toggle("selected", this.selectedInventoryIndex === i);
        el.onclick = () => this.selectInventoryItem(i);
        el.ondblclick = () => Inventory.use(i);
        el.onmouseenter = (e) => this.showTip(it, e);
        el.onmousemove = (e) => this.moveTip(e);
        el.onmouseleave = () => this.hideTip();
      } else {
        el.textContent = "";
      }
      grid.appendChild(el);
    }
    const selected = S.inventory[this.selectedInventoryIndex];
    const selection = document.getElementById("inv-selection");
    const useBtn = document.getElementById("inv-use-btn");
    if (selection) selection.textContent = selected ? `${selected.icon || "📦"} ${selected.name || selected.id} · x${selected.count || 1} · nhấp đúp để dùng` : "Chưa chọn vật phẩm";
    if (useBtn) {
      useBtn.disabled = !selected;
      useBtn.textContent = selected && (selected.type || selected.loai) === "EQUIPMENT" ? "Trang bị" : "Dùng";
    }
  },

  selectInventoryItem(index) {
    this.selectedInventoryIndex = Number(index);
    Inventory.selectedIndex = this.selectedInventoryIndex;
    this.buildInv();
    const item = S.inventory[this.selectedInventoryIndex];
    if (item) this.showTip(item, { clientX: window.innerWidth - 330, clientY: window.innerHeight - 190 });
  },

  useSelectedItem() {
    if (this.selectedInventoryIndex >= 0) Inventory.use(this.selectedInventoryIndex);
  },

  pushLoot(loot) {
    const feed = document.getElementById("loot-feed");
    if (!feed || !loot) return;
    const entries = [];
    if (Number(loot.xu || 0) > 0) entries.push(`💰 +${loot.xu} xu`);
    for (const item of loot.items || []) entries.push(`${item.icon || "📦"} ${item.name || item.id} x${item.count || 1}`);
    entries.forEach((text) => {
      const el = document.createElement("div");
      el.className = "loot-drop-toast";
      el.textContent = text;
      feed.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    });
  },

  log(msg, cls = "") {
    const area = document.getElementById("log-area");
    if (!area) return;
    const now = Date.now();
    if (this._lastLog.msg === msg && now - this._lastLog.at < 1400 && this._lastLog.node?.isConnected) {
      this._lastLog.at = now;
      this._lastLog.count += 1;
      this._lastLog.node.textContent = `${this._lastLog.node.dataset.base} ×${this._lastLog.count}`;
      return;
    }
    const p = document.createElement("p");
    p.className = "lc lc-" + cls;
    const t = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const base = `[${t}] ${msg}`;
    p.dataset.base = base;
    p.textContent = base;
    area.appendChild(p);
    this._lastLog = { msg, at: now, node: p, count: 1 };
    area.scrollTop = area.scrollHeight;
    while (area.children.length > 150) area.removeChild(area.firstChild);
  },
};
