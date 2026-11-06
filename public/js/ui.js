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
  pixelIconClass(item = {}, slotHint = "") {
    const values = [slotHint, item.slot, item.type, item.loai, item.id, item.name, item.effect, item.damageType, item.category]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (/coin|money|currency|(^|\W)xu(\W|$)/.test(values)) return "icon-coins";
    if (/mpd|restore.?mp|heal.?mp|mana|(^|\W)mp(\W|$)|linh khi/.test(values)) return "icon-potion-mp";
    if (/hpd|restore.?hp|heal.?hp|(^|\W)heal(\W|$)|(^|\W)hp(\W|$)|sinh luc|hoi mau|dan duoc/.test(values)) return "icon-potion-hp";
    if (/herb|thao duoc|duoc thao/.test(values)) return "icon-herb";
    if (/pill|linh dan|vien dan/.test(values)) return "icon-pill";
    if (/consume|potion|thuoc|elixir|(^|\W)dan(\W|$)/.test(values)) return "icon-potion-hp";
    if (/weapon|sword|kiem|vu khi/.test(values)) return "icon-sword";
    if (/helmet|hat|mu|non/.test(values)) return "icon-helmet";
    if (/armor|robe|pants|giap|quan|ao/.test(values)) return "icon-armor";
    if (/boot|giay/.test(values)) return "icon-boots";
    if (/ring|nhan/.test(values)) return "icon-ring";
    if (/lightning.?gem|gem.?lightning|loi thach|loi tinh/.test(values)) return "icon-lightning-gem";
    if (/spear|thong/.test(values)) return "icon-spear";
    if (/stone|linh thach|spirit stone/.test(values)) return "icon-spirit-stone";
    if (/amulet|belt|gem|stone|tal|vong|dai|linh thach|nguyen to/.test(values)) return "icon-talisman";
    if (/shield|def|phong thu|the luc/.test(values)) return "icon-shield";
    if (/physical|melee|vat ly/.test(values)) return "icon-sword";
    if (/passive|bi dong|buff|support|ho tro/.test(values)) return "icon-lotus";
    if (/magic|phap|spell|skill/.test(values)) return "icon-talisman";
    return "icon-bag";
  },
  createPixelIcon(item, slotHint = "", extraClass = "") {
    const icon = document.createElement("span");
    if (slotHint === "skill") {
      icon.className = `pixel-icon ${this.pixelIconClass(item, slotHint)}${extraClass ? ` ${extraClass}` : ""}`;
      icon.setAttribute("aria-hidden", "true");
      this.applySkillIcon(icon, item);
      return icon;
    }
    const customImg = item && (item.img || (typeof item.icon === "string" && (item.icon.includes("/") || item.icon.endsWith(".png") || item.icon.endsWith(".svg")) ? item.icon : ""));
    const itemArtClass = customImg ? "" : " item-art-icon";
    icon.className = `pixel-icon ${this.pixelIconClass(item, slotHint)}${itemArtClass}${extraClass ? ` ${extraClass}` : ""}`;
    icon.setAttribute("aria-hidden", "true");
    if (customImg && typeof customImg === "string") {
      icon.style.backgroundImage = `url("${customImg}")`;
      icon.style.backgroundPosition = "center center";
      icon.style.backgroundSize = "contain";
      icon.style.backgroundRepeat = "no-repeat";
    }
    return icon;
  },
  applySkillIcon(element, skill) {
    const source = skill?.img;
    const isAsset = typeof source === "string" && /^(?:\.\/|\/)?assets\/[a-zA-Z0-9_/-]+\.png$/.test(source);
    const isGenerated = typeof source === "string" && source.length <= 24000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source);
    const img = isAsset || isGenerated ? source : "";
    element.classList.toggle("skill-art-icon", Boolean(img));
    element.style.backgroundImage = img ? `url("${img}")` : "";
    element.style.backgroundPosition = img ? "center" : "";
    element.style.backgroundSize = img ? "contain" : "";
    element.style.backgroundRepeat = img ? "no-repeat" : "";
  },
  toggleKpahMenu() {
    if (typeof Sound !== "undefined") Sound.play("click");
    const el = document.getElementById("kpah-menu-modal");
    if (el) el.style.display = (el.style.display === "none") ? "flex" : "none";
    if (el?.style.display === "flex") {
      SkillSystem.loadBook();
      UI.renderEquipment(true);
    }
  },
  showDeathModal() {
    const modal = document.getElementById("death-modal");
    if (!modal) return;
    modal.style.display = "flex";
    const button = document.getElementById("death-respawn-btn");
    if (button) {
      button.disabled = false;
      button.focus();
    }
    this.setDeathMessage("Ngươi đã trọng thương. Hồi sinh tại điểm xuất phát với 50% HP và MP.");
  },
  hideDeathModal() {
    const modal = document.getElementById("death-modal");
    if (modal) modal.style.display = "none";
  },
  setDeathMessage(message) {
    const text = document.getElementById("death-message");
    if (text) text.textContent = String(message || "");
  },
  toggleChat() {
    if (typeof Sound !== "undefined") Sound.play("click");
    const el = document.getElementById("chat-bar");
    if (el) {
      el.style.display = (el.style.display === "none") ? "flex" : "none";
      if (el.style.display === "flex") {
        document.getElementById("chat-inp").focus();
      }
    }
  },
  async toggleContinent() {
    if (typeof Sound !== "undefined") Sound.play("click");
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
  updateVitals(values = null) {
    const p = values || S.player;
    if (!p) return;
    const hp = Math.floor(Number(p.hp) || 0);
    const maxHp = Math.max(1, Math.floor(Number(p.maxHp) || 100));
    const hpText = document.getElementById("ui-hp");
    const hpBar = document.getElementById("b-hp");
    if (hpText) hpText.textContent = `${hp}/${maxHp}`;
    if (hpBar) hpBar.style.width = `${Math.min(100, Math.max(0, Math.floor((hp / maxHp) * 100)))}%`;

    const mp = Math.floor(Number(p.mp) || 0);
    const maxMp = Math.max(1, Math.floor(Number(p.maxMp) || 100));
    const mpText = document.getElementById("ui-mp");
    const mpBar = document.getElementById("b-mp");
    if (mpText) mpText.textContent = `${mp}/${maxMp}`;
    if (mpBar) mpBar.style.width = `${Math.min(100, Math.max(0, Math.floor((mp / maxMp) * 100)))}%`;

    const cultivation = Number(p.tuViHienTai ?? p.cultivation) || 0;
    const cultivationMax = Math.max(1, Number(p.tuViLenCap ?? p.cultivationMax) || 100);
    const cultivationText = document.getElementById("ui-tu");
    const cultivationBar = document.getElementById("b-tu");
    if (cultivationText) cultivationText.textContent = `${Math.floor(cultivation)}/${Math.floor(cultivationMax)}`;
    if (cultivationBar) cultivationBar.style.width = `${Math.min(100, Math.max(0, Math.floor((cultivation / cultivationMax) * 100)))}%`;
    const xu = document.getElementById("ui-xu");
    if (xu) xu.textContent = Math.floor(Number(p.xu) || 0).toLocaleString();
  },
  updatePosition(values = null) {
    const p = values || S.player;
    if (!p) return;
    const mapName = document.getElementById("mini-map-name");
    if (mapName) mapName.textContent = S.mapName || S.mapCode || "Bản đồ";
    const coords = document.getElementById("map-coords");
    if (coords) coords.textContent = `${Math.floor(Number(p.x) || 0)},${Math.floor(Number(p.y) || 0)}`;
  },
  updateTargetHud(target = S.target) {
    const targetEl = document.getElementById("target-hud");
    if (!targetEl) return;
    if (!target || target.dead || Number(target.hp) <= 0) {
      targetEl.style.display = "none";
      if (target && S.target === target) S.target = null;
      return;
    }
    targetEl.style.display = "block";
    const nameEl = document.getElementById("target-name");
    if (nameEl) nameEl.textContent = target.name || "Mục tiêu";
    const levelEl = document.getElementById("target-level");
    if (levelEl) levelEl.textContent = `Lv.${target.level || 1}`;
    const elemEl = document.getElementById("target-elem");
    if (elemEl) {
      const elem = target.element || (Array.isArray(target.nguHanh) ? (target.nguHanh[0] || "VÔ") : (target.nguHanh || "VÔ"));
      elemEl.textContent = elem;
      elemEl.className = `target-badge elem elem-${String(elem).toLowerCase()}`;
    }
    const avatar = document.getElementById("target-avatar");
    if (avatar) avatar.textContent = target.icon || "👾";
    const hp = Math.max(0, Math.floor(Number(target.hp ?? target.maxHp ?? 100)));
    const maxHp = Math.max(1, Math.floor(Number(target.maxHp) || 100));
    const hpBar = document.getElementById("target-hp-bar");
    if (hpBar) hpBar.style.width = `${Math.min(100, Math.max(0, Math.round((hp / maxHp) * 100)))}%`;
    const hpText = document.getElementById("target-hp-text");
    if (hpText) hpText.textContent = `${hp} / ${maxHp}`;
  },
  update() {
    if (!S.player) return;
    const p = S.player;
    document.getElementById("ui-name").textContent = p.name;
    const profileName = document.getElementById("ui-profile-name");
    if (profileName) profileName.textContent = p.name || "Tu sĩ";
    const profileAvatar = document.getElementById("ui-profile-avatar");
    const hudAvatar = document.getElementById("ui-avatar");
    const characterSprite = `./assets/characters/cultivator-${p.gender === "FEMALE" ? "female" : "male"}.png`;
    if (hudAvatar) {
      hudAvatar.src = characterSprite;
      hudAvatar.alt = p.gender === "FEMALE" ? "Nhân vật nữ" : "Nhân vật nam";
    }
    if (profileAvatar) {
      profileAvatar.src = characterSprite;
      profileAvatar.alt = p.gender === "FEMALE" ? "Nhân vật nữ" : "Nhân vật nam";
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

    this.updateVitals(p);
    this.updatePosition(p);
    this.renderSkillEffects();

    const s = p.stats;
    const _i = (v) => Math.floor(Number(v) || 0);
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setTxt("r-str", _i(s.str));
    setTxt("r-agi", _i(s.agi));
    setTxt("r-vit", _i(s.vit));
    setTxt("r-ene", _i(s.ene));
    const unspentPoints = Math.max(0, _i(p.unspentStatPoints));
    setTxt("ui-unspent-points", unspentPoints);
    const allocationPending = Boolean(Cultivation?._pendingStatAllocations?.size);
    for (const button of document.querySelectorAll("[data-allocate-stat]")) {
      button.disabled = unspentPoints < 1 || allocationPending;
      button.title = allocationPending ? "Đang cộng điểm…" : (unspentPoints < 1 ? "Không còn điểm tiềm năng" : "Cộng 1 điểm");
    }
    setTxt("r-patk", _i(Combat.pAtk()));
    setTxt("r-matk", _i(Combat.mAtk()));
    setTxt("r-def", _i(Combat.pDef()));
    setTxt("r-spd", _i(3 + _i(s.agi) * 0.5));
    setTxt("r-eva", Combat.evasion().toFixed(1) + "%");
    setTxt("r-tvlc", p.tuViLinhCan || 0);
    setTxt("inv-head", `✦ TÚI ĐỒ (${S.inventory.length}/${CFG.INV_MAX})`);

    this.updateTargetHud();

    this.renderEquipment();
    SkillSystem.renderSkillBar();
  },

  renderEquipment(force = false) {
    const modal = document.getElementById("kpah-menu-modal");
    if (!force && (!modal || modal.style.display === "none")) return;
    const eq = Object.fromEntries(Object.entries(S.player?.equipment || {}).map(([slot, item]) => [slot, GameData.itemWithCurrentDetails(item)]));
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
      const iconWrap = document.createElement("div");
      iconWrap.className = "eicon";
      iconWrap.appendChild(this.createPixelIcon(slot.item || {}, slot.id));
      const label = document.createElement("span");
      label.textContent = slot.item?.name || slot.label;
      el.replaceChildren(iconWrap, label);
      el.classList.toggle("equipped", Boolean(slot.item));
      el.title = slot.item ? `${slot.item.name || slot.label}\nClick để tháo` : `${slot.label}\nÔ trống`;
      el.onclick = slot.item ? () => Inventory.unequip(slot.item, slot.id.replace("slot-", "")) : null;
    }
  },

  showTip(item, e) {
    const tip = document.getElementById("tip");
    const tipName = document.getElementById("tip-name");
    tipName.replaceChildren(
      this.createPixelIcon(item, "", "tip-pixel-icon"),
      document.createTextNode(` ${item.name || item.id || "Vật phẩm"}`),
    );
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
    const price = document.createElement("span");
    price.style.color = "var(--text2)";
    price.textContent = `Bán: ${item.giaBan || 0} xu`;
    const cultivation = item.giaTriTuVi ? ` + ${item.giaTriTuVi}` : "";
    document.getElementById("tip-body").replaceChildren(
      document.createTextNode(`${item.description || item.desc || item.moTa || ""}${cultivation}`),
      document.createElement("br"),
      price,
    );
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
      const it = GameData.itemWithCurrentDetails(S.inventory[i]);
      const el = document.createElement("div");
      el.className = it ? "isl" : "isl empty";
      if (it) {
        el.title = (it.name || it.id) + (it.desc ? "\n" + it.desc : "");
        const icon = this.createPixelIcon(it, "", "inventory-pixel-icon");
        const count = document.createElement("span");
        count.className = "icnt";
        count.textContent = `x${it.count || 1}`;
        el.replaceChildren(icon, count);
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
    const selected = GameData.itemWithCurrentDetails(S.inventory[this.selectedInventoryIndex]);
    const selection = document.getElementById("inv-selection");
    const useBtn = document.getElementById("inv-use-btn");
    if (selection) selection.textContent = selected ? `${selected.name || selected.id} · x${selected.count || 1} · nhấp đúp để dùng` : "Chưa chọn vật phẩm";
    if (useBtn) {
      useBtn.disabled = !selected;
      useBtn.textContent = selected && (selected.type || selected.loai) === "EQUIPMENT" ? "Trang bị" : "Dùng";
    }
  },

  selectInventoryItem(index) {
    if (typeof Sound !== "undefined") Sound.play("click");
    this.selectedInventoryIndex = Number(index);
    Inventory.selectedIndex = this.selectedInventoryIndex;
    this.buildInv();
    const item = GameData.itemWithCurrentDetails(S.inventory[this.selectedInventoryIndex]);
    if (item) this.showTip(item, { clientX: window.innerWidth - 330, clientY: window.innerHeight - 190 });
  },

  useSelectedItem() {
    if (this.selectedInventoryIndex >= 0) Inventory.use(this.selectedInventoryIndex);
  },

  pushLoot(loot, action = "") {
    if (!loot) return [];
    const entries = [];
    const prefix = action ? `${action}: ` : "";
    if (Number(loot.xu || 0) > 0) entries.push(`${prefix}💰 +${loot.xu} xu`);
    for (const item of loot.items || []) entries.push(`${prefix}${item.icon || "📦"} ${item.name || item.id} x${item.count || 1}`);
    return entries.map((text) => this.log(text, "loot"));
  },

  updateAutoLootToggle(enabled) {
    const button = document.getElementById("btn-auto-loot");
    const state = document.getElementById("auto-loot-state");
    if (!button) return;
    const isEnabled = Boolean(enabled);
    button.setAttribute("aria-pressed", String(isEnabled));
    button.setAttribute("aria-label", `Tự nhặt vật phẩm gần: đang ${isEnabled ? "bật" : "tắt"}`);
    button.title = isEnabled ? "Tắt tự nhặt vật phẩm gần" : "Bật tự nhặt vật phẩm gần";
    button.classList.toggle("active", isEnabled);
    if (state) state.textContent = isEnabled ? "Nhặt: BẬT" : "Nhặt: TẮT";
  },

  initializeBuffEffectsToggle() {
    this.updateBuffEffectsToggle(VisualEffects.arePersistentEffectsEnabled());
  },

  toggleBuffEffects() {
    const enabled = VisualEffects.setPersistentEffectsEnabled(!VisualEffects.arePersistentEffectsEnabled());
    this.updateBuffEffectsToggle(enabled);
    return enabled;
  },

  toggleSound() {
    if (typeof Sound === "undefined") return;
    const sfxOn = Sound.toggleSfx();
    const bgmOn = Sound.toggleBgm();
    const isMuted = !sfxOn && !bgmOn;
    this.updateSoundToggle(!isMuted);
    UI.notify(isMuted ? "Đã tắt âm thanh" : "Đã bật âm thanh", "info");
  },

  updateSoundToggle(enabled) {
    const isEnabled = Boolean(enabled);
    const icon = document.getElementById("sound-icon");
    const label = document.getElementById("sound-label");
    const button = document.getElementById("btn-sound-toggle");
    if (icon) icon.textContent = isEnabled ? "🔊" : "🔇";
    if (label) label.textContent = isEnabled ? "Âm thanh" : "Tắt âm";
    if (button) button.classList.toggle("muted", !isEnabled);

    const barBtn = document.getElementById("btn-sound-bar");
    const barIcon = document.getElementById("sound-bar-icon");
    const barState = document.getElementById("sound-bar-state");
    if (barBtn) {
      barBtn.classList.toggle("active", isEnabled);
      barBtn.setAttribute("aria-pressed", String(isEnabled));
      barBtn.setAttribute("aria-label", `Âm thanh game: đang ${isEnabled ? "bật" : "tắt"}`);
      barBtn.title = isEnabled ? "Tắt âm thanh game" : "Bật âm thanh game";
    }
    if (barIcon) barIcon.textContent = isEnabled ? "🔊" : "🔇";
    if (barState) barState.textContent = isEnabled ? "Âm: BẬT" : "Âm: TẮT";
  },

  updateBuffEffectsToggle(enabled) {
    const button = document.getElementById("btn-buff-effects");
    const state = document.getElementById("buff-effects-state");
    if (!button) return;
    const isEnabled = Boolean(enabled);
    button.setAttribute("aria-pressed", String(isEnabled));
    button.setAttribute("aria-label", `Hiệu ứng khi tung chiêu quanh nhân vật: đang ${isEnabled ? "hiện" : "ẩn"}`);
    button.title = isEnabled ? "Ẩn hiệu ứng khi tung chiêu quanh nhân vật" : "Bật hiệu ứng khi tung chiêu quanh nhân vật";
    button.classList.toggle("active", isEnabled);
    if (state) state.textContent = isEnabled ? "FX: HIỆN" : "FX: ẨN";
  },

  renderSkillEffects() {
    const host = document.getElementById("hud-skill-effects");
    if (!host) return;
    const player = S.player;
    const skillVfx = typeof SkillVFX !== "undefined" ? SkillVFX : null;
    if (!player) {
      host.replaceChildren();
      host.hidden = true;
      return;
    }

    const now = Date.now();
    const effects = new Map();
    const addEffect = (skillData, kind, expiresAt = 0) => {
      const skill = skillVfx?.normalize?.(skillData) || skillData;
      if (!skill) return;
      const code = String(skill.code || skill.id || skillData.skillCode || "");
      const name = String(skill.name || skill.tenNangLuc || code || "Hiệu ứng");
      const endAt = Number(expiresAt) || 0;
      if (endAt > 0 && endAt <= now) return;
      const key = code || name;
      const current = effects.get(key);
      if (!current || kind === "buff") effects.set(key, { skill, kind, name, endAt });
    };

    for (const [buffKey, buff] of Object.entries(player.buffs || {})) {
      if (!buff || (Number(buff.expiresAt) > 0 && Number(buff.expiresAt) <= now)) continue;
      const skillCode = String(buff.skillCode || buff.code || "");
      const skill = (skillCode && skillVfx?.findSkill?.(skillCode, player))
        || (player.skills || []).find((entry) => String(entry.effect || "") === buffKey);
      if (skill) addEffect(skill, "buff", buff.expiresAt);
    }
    for (const entry of skillVfx?.ownedBuffAuras || []) addEffect(entry.skill, "buff", entry.expiresAt);

    const learnedCodes = (player.learnedSkills || []).map((entry) => String(entry?.code || entry?.id || entry?.skillCode || entry));
    const passiveCodes = new Set(learnedCodes);
    for (const code of passiveCodes) {
      const skill = skillVfx?.findSkill?.(code, player);
      if (skill && String(skill.category || "").toUpperCase() === "PASSIVE") addEffect(skill, "passive");
    }
    for (const skill of player.skills || []) {
      if (String(skill.category || "").toUpperCase() === "PASSIVE") addEffect(skill, "passive");
    }

    const entries = [...effects.values()].slice(0, 3);
    const badges = entries.map(({ skill, kind, name, endAt }) => {
      const badge = document.createElement("span");
      badge.className = `hud-skill-effect hud-skill-effect-${kind}`;
      const icon = document.createElement("span");
      icon.className = "hud-skill-effect-icon";
      icon.setAttribute("aria-hidden", "true");
      this.applySkillIcon(icon, skill);
      const label = document.createElement("span");
      label.className = "hud-skill-effect-name";
      label.textContent = name;
      badge.append(icon, label);
      const typeLabel = kind === "passive" ? "Kỹ năng bị động" : "Hiệu ứng đang duy trì";
      if (endAt > now) badge.title = `${name} · còn ${Math.ceil((endAt - now) / 1000)} giây`;
      else badge.title = `${typeLabel}: ${name}`;
      badge.setAttribute("aria-label", badge.title);
      return badge;
    });
    host.replaceChildren(...badges);
    host.hidden = entries.length === 0;
  },

  initializeHudLayout() {
    let saved = null;
    try { saved = localStorage.getItem("tutien.hud-layout.v1"); } catch { }
    const compact = saved === null
      ? window.matchMedia?.("(orientation: landscape) and (max-height: 520px)")?.matches === true
      : saved === "compact";
    this.setHudLayout(compact, false);
    return compact;
  },

  toggleHudLayout() {
    const screen = document.getElementById("screen-game");
    const compact = !screen?.classList.contains("hud-compact");
    this.setHudLayout(compact);
    return compact;
  },

  setHudLayout(compact, persist = true) {
    const screen = document.getElementById("screen-game");
    if (!screen) return false;
    const isCompact = Boolean(compact);
    screen.classList.toggle("hud-compact", isCompact);
    const button = document.getElementById("btn-hud-layout");
    if (button) {
      button.setAttribute("aria-expanded", String(!isCompact));
      button.setAttribute("aria-label", isCompact ? "Mở rộng giao diện" : "Thu gọn giao diện");
      button.title = isCompact ? "Mở rộng giao diện" : "Thu gọn giao diện";
      button.textContent = isCompact ? "HUD +" : "HUD −";
    }
    if (persist) {
      try { localStorage.setItem("tutien.hud-layout.v1", isCompact ? "compact" : "expanded"); } catch { }
    }
    return isCompact;
  },

  notify(message, type = "info") {
    if (message === undefined || message === null || String(message).trim() === "") return null;
    const text = String(message).trim();
    const kind = ["success", "warning", "error", "info"].includes(type) ? type : "info";
    const styles = { success: "level", warning: "system", error: "combat", info: "system" };
    const markers = { success: "✓", warning: "⚠", error: "✕", info: "ℹ" };
    return this.log(`${markers[kind]} ${text}`, styles[kind]);
  },

  log(msg, cls = "") {
    const area = document.getElementById("log-area");
    if (!area) return;
    const now = Date.now();
    const messageClass = ["chat", "combat", "loot", "system", "level"].includes(cls) ? cls : "chat";
    if (this._lastLog.msg === msg && this._lastLog.cls === messageClass && now - this._lastLog.at < 1400 && this._lastLog.node?.isConnected) {
      this._lastLog.at = now;
      this._lastLog.count += 1;
      this._lastLog.node.textContent = `${this._lastLog.node.dataset.base} ×${this._lastLog.count}`;
      return this._lastLog.node;
    }
    const p = document.createElement("p");
    p.className = `lc lc-${messageClass}`;
    const t = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const base = `[${t}] ${msg}`;
    p.dataset.base = base;
    p.textContent = base;
    area.appendChild(p);
    this._lastLog = { msg, cls: messageClass, at: now, node: p, count: 1 };
    area.scrollTop = area.scrollHeight;
    while (area.children.length > 150) area.removeChild(area.firstChild);
    return p;
  },
};

if (typeof StateBus !== "undefined") {
  StateBus.on("player:vitals_changed", (vitals) => UI.updateVitals(vitals));
  StateBus.on("player:position_changed", (position) => UI.updatePosition(position));
  StateBus.on("target:changed", (target) => UI.updateTargetHud(target));
}
