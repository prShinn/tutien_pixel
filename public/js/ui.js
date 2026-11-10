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

const SKILL_ART_CODES = new Set([
  "am_chu", "am_tam_phap", "am_thich", "am_thuc", "bac_hai_trieu_sinh", "bach_hoa_lao",
  "bach_kiem_tran", "bang_lien_tran", "bang_tien", "bao_phong_tuyet_vuc", "cam_lo_hoi_sinh", "chan_hoa_chien_tam",
  "co_moc_long_nha", "cuu_diem_phan_khong", "cuu_tang_phong", "cuu_thien_bang", "cuu_tieu_loi_kiep", "cuu_u_am_gioi",
  "da_anh_tram", "dia_chan_lien_hoan", "dia_mach", "dien_lien", "han_tinh_thich", "han_tri",
  "hoa_cau", "hoa_tam_phap", "hoa_vu_luu_tinh", "hoa_vuc", "hoa_yem", "huyen_am_ngung_than",
  "huyen_nham_ho_the", "huyen_thuy_ho_mach", "kim_cuong_chien_y", "kim_kich", "kim_luan", "kim_sat_thanh",
  "kim_tam_phap", "kim_tien_lien_xa", "lien_hoa", "loan_phong", "loi_dinh_ket_tran", "loi_ho",
  "loi_kich", "loi_tam_phap", "loi_vuc", "luu_van_khinh_bo", "moc_duong", "moc_hon_don",
  "moc_lao", "moc_tam_phap", "ngu_hanh_kich", "nham_thach_quyen", "nhat_diem", "nhat_quang_hoi_menh",
  "pha_giap", "phan_thien", "phong_bo", "phong_liet_tram", "phong_lieu", "phong_nhan",
  "phong_tam_phap", "quang_dao", "quang_tam_phap", "quang_toc", "re_moc", "sinh_truong",
  "son_chan", "son_ha_dai_than", "thach_luyen", "thanh_dang_thich", "thanh_phong", "thanh_quang_tran",
  "thanh_tam", "thanh_tay", "thien_canh", "thien_hoa_lien", "thien_loi", "thien_loi_kim_giap",
  "thien_nhan_pha_khong", "thien_phong_truyen", "thien_quang", "thien_son_tran_nguc", "thien_tinh_giang_the", "thiet_ho",
  "tho_giap", "tho_kich", "tho_tam_phap", "thuc_hon", "thuy_khien", "thuy_luu",
  "thuy_tam_phap", "thuyet_hai", "tinh_loc", "tinh_quang_thich", "tu_dien_xuyen_tam", "u_hon_ket_gioi",
  "u_minh", "van_hon_phe_tam", "van_kim_tram", "van_loi_thien_phat", "van_moc_thanh", "xich_diem_chi",
]);

// Preserve the BE skill ID; this alias only selects its existing artwork filename.
const SKILL_ART_CODE_ALIASES = Object.freeze({ "cửu_u_am_gioi": "cuu_u_am_gioi" });

const UI = {
  _lastEqHash: "",
  selectedInventoryIndex: -1,
  _lastLog: { msg: "", at: 0, node: null, count: 0 },
  pixelIconClass(item = {}, slotHint = "") {
    if (slotHint === "skill") return "skill-art-icon";
    // Classify only canonical fields. Names such as "thao" must never match "ao".
    const slot = String(item.slot || slotHint).replace(/^slot-/, "").toLowerCase();
    const slots = {
      weapon: "icon-sword", hat: "icon-helmet", helmet: "icon-helmet",
      armor: "icon-armor", pants: "icon-unknown", boots: "icon-boots",
      ring: "icon-ring", amulet: "icon-talisman", belt: "icon-unknown", gem: "icon-spirit-stone",
    };
    if (slots[slot]) return slots[slot];
    const type = String(item.type || item.loai || "").toUpperCase();
    if (type === "STONE" || type === "ELEMSTONE") return "icon-spirit-stone";
    if (type === "MATERIAL" || type === "HERB") return "icon-herb";
    if (type === "LINDAN" || type === "BREAKTHROUGH_PILL") return "icon-pill";
    if (type === "POTION" || type === "CONSUME") {
      if (Number(item.healHp) > 0) return "icon-potion-hp";
      if (Number(item.healMp) > 0) return "icon-potion-mp";
      return "icon-pill";
    }
    return "icon-unknown";
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
    const artClass = customImg ? "item-image-icon" : `${this.pixelIconClass(item, slotHint)} item-art-icon`;
    icon.className = `pixel-icon ${artClass}${extraClass ? ` ${extraClass}` : ""}`;
    icon.setAttribute("aria-hidden", "true");
    if (customImg && typeof customImg === "string") {
      icon.style.backgroundImage = `url("${customImg}")`;
      icon.style.backgroundPosition = "center center";
      icon.style.backgroundSize = "contain";
      icon.style.backgroundRepeat = "no-repeat";
    }
    return icon;
  },
  skillImageSource(skill) {
    const source = skill?.img;
    const isAsset = typeof source === "string" && /^(?:\.\/|\/)?assets\/skills\/[a-zA-Z0-9_/-]+\.(?:png|svg)$/.test(source);
    const isGenerated = typeof source === "string" && source.length <= 24000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source);
    if (isAsset || isGenerated) return source;
    const sourceCode = String(skill?.code || skill?.id || skill?.maNangLuc || "").toLowerCase();
    const code = SKILL_ART_CODE_ALIASES[sourceCode] || sourceCode;
    if (SKILL_ART_CODES.has(code)) return `./assets/skills/bank-v1/${code}.png`;
    const effectArt = {
      heal: "moc_duong", restore_mp: "thien_canh", cleanse: "thanh_tam",
      shield: "thiet_ho", root: "re_moc", slow: "phong_bo", freeze: "han_tri",
      stun: "dien_lien", armor_break: "pha_giap", buff_def: "tho_giap",
      buff_atk: "kim_luan", buff_spd: "thanh_phong", passive: "thien_canh",
    };
    const effect = String(skill?.effect || skill?.sfx_code || "").toLowerCase();
    const art = String(skill?.category).toUpperCase() === "PASSIVE"
      ? "thien_canh" : (effectArt[effect] || "ngu_hanh_kich");
    return `./assets/skills/bank-v1/${art}.png`;
  },
  applySkillIcon(element, skill) {
    const img = skill ? this.skillImageSource(skill) : "";
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
    this.setDeathMessage("Bấm Hồi Sinh khi sẵn sàng.");
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
    const statusEl = document.getElementById("target-status");
    if (statusEl) {
      const styles = typeof MONSTER_STATUS_STYLE !== "undefined" ? MONSTER_STATUS_STYLE : {};
      const labels = (Array.isArray(target.statusEffects) ? target.statusEffects : [])
        .map((effect) => styles[effect?.type]?.label)
        .filter(Boolean);
      const text = labels.join(" · ");
      if (statusEl.textContent !== text) statusEl.textContent = text;
      statusEl.hidden = !text;
    }
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
      const isEquipped = Boolean(slot.item);
      el.classList.toggle("equipped", isEquipped);
      el.classList.toggle("empty", !isEquipped);

      const iconWrap = document.createElement("div");
      iconWrap.className = isEquipped ? "eicon eicon-equipped" : "eicon eicon-empty";
      iconWrap.appendChild(this.createPixelIcon(slot.item || {}, slot.id));

      const labelWrap = document.createElement("div");
      labelWrap.className = "esl-info";
      if (isEquipped) {
        const nameSpan = document.createElement("strong");
        nameSpan.className = "esl-name";
        nameSpan.textContent = slot.item.name || slot.label;
        const tag = document.createElement("span");
        tag.className = "esl-badge";
        tag.textContent = "ĐANG MẶC";
        labelWrap.replaceChildren(nameSpan, tag);
      } else {
        const slotName = document.createElement("span");
        slotName.className = "esl-slot-type";
        slotName.textContent = slot.label;
        const emptyHint = document.createElement("small");
        emptyHint.className = "esl-empty-hint";
        emptyHint.textContent = "[Trống]";
        labelWrap.replaceChildren(slotName, emptyHint);
      }

      el.replaceChildren(iconWrap, labelWrap);
      el.title = isEquipped
        ? `${slot.item.name} (${slot.label})\nĐang trang bị · Nhấp để tháo vào túi đồ`
        : `${slot.label}\nChưa trang bị (Ô trống)`;
      el.onclick = isEquipped ? () => Inventory.unequip(slot.item, slot.id.replace("slot-", "")) : null;
      el.onmouseenter = isEquipped ? (event) => this.showTip(slot.item, event) : null;
      el.onmousemove = isEquipped ? (event) => this.moveTip(event) : null;
      el.onmouseleave = () => this.hideTip();
    }
  },

  itemTypeLabel(item) {
    const slots = { weapon: "Vũ khí", armor: "Giáp", pants: "Quần", boots: "Giày", hat: "Mũ / Khăn", gloves: "Găng tay", ring: "Nhẫn", amulet: "Vòng", belt: "Đai", gem: "Linh thạch" };
    const type = item.type || item.loai;
    if (type === "EQUIPMENT") return `Trang bị · ${slots[item.slot] || item.slot || "Chưa xác định vị trí"}`;
    return { STONE: "Linh thạch", ELEMSTONE: "Đá nguyên tố", MAT: "Nguyên liệu", CONSUME: "Đan dược", POTION: "Đan dược", LINDAN: "Linh đan", BREAKTHROUGH_PILL: "Đan đột phá" }[type] || "Vật phẩm";
  },

  itemFacts(item) {
    const labels = { pAtk: "Công vật lý", mAtk: "Công phép", pDef: "Thủ vật lý", mDef: "Thủ phép", maxHp: "HP tối đa", maxHP: "HP tối đa", maxMp: "MP tối đa", maxMP: "MP tối đa", str: "Sức mạnh", agi: "Nhanh nhẹn", vit: "Thể lực", ene: "Năng lượng", spd: "Tốc độ", crit: "Chí mạng", evasion: "Tránh né" };
    const signed = (value) => `${Number(value) >= 0 ? "+" : ""}${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`;
    const rows = [];
    const notes = [];
    const add = (label, value, kind = "stat") => rows.push({ label, value, kind });
    if ((item.type || item.loai) === "EQUIPMENT") {
      const attack = item.basicAttack;
      if (attack) {
        const style = { sword: "Kiếm cận chiến", staff: "Trượng tầm xa", bow: "Cung tầm xa", melee: "Cận chiến" }[attack.style];
        if (style) add("Đòn thường", `${style} · ${attack.range} ô · ${attack.damageType === "MAGIC" ? "Phép" : "Vật lý"}`, "requirement");
      }
      const info = item.equipmentInfo;
      if (info) {
        for (const [key, value] of Object.entries(info.bonuses || {})) add(labels[key] || key, signed(value));
        for (const [key, value] of Object.entries(info.ratingOnly || {})) add(`${labels[key] || key} · OVR`, signed(value));
        add("Điểm trang bị", `${signed(info.ovr)} OVR`, "rating");
        const current = GameData.itemWithCurrentDetails(S.player?.equipment?.[item.slot]);
        if (!current || current.equipmentInfo) {
          const difference = Number(info.ovr) - Number(current?.equipmentInfo?.ovr || 0);
          add(current ? `So với ${current.name || "món đang mặc"}` : "So với ô trống", `${signed(difference)} OVR`, difference < 0 ? "lower" : "comparison");
        }
        notes.push(`OVR trang bị = ${signed(info.combatOvr)} từ chỉ số chiến đấu và ${signed(info.itemOvr)} từ thuộc tính. OVR tổng được làm tròn xuống.`);
        if (Object.keys(info.ratingOnly || {}).length) notes.push("Dòng đánh dấu OVR hiện chỉ cộng lực chiến, chưa tăng chỉ số chiến đấu.");
      } else {
        for (const [key, value] of Object.entries(item.stats || {})) add(labels[key] || key, signed(value));
        notes.push("Chưa tải được phân tích lực chiến. Các dòng trên là thuộc tính ghi trên vật phẩm.");
      }
      const realm = CFG.REALMS.find((entry) => Number(entry.stt) === Number(item.requiredRealmStt));
      add("Yêu cầu", realm?.tenCanhGioi || realm?.name || `Cảnh giới bậc ${item.requiredRealmStt || 1}`, "requirement");
    } else {
      const type = item.type || item.loai;
      if (["STONE", "ELEMSTONE"].includes(type) && item.giaTriTuVi > 0) add("Tu vi khi hấp thụ", signed(Math.floor(item.giaTriTuVi)));
      if (type === "LINDAN" && item.tuViLinhCanVal > 0) add("Tu vi linh căn", signed(Math.floor(item.tuViLinhCanVal)));
      if (["POTION", "CONSUME"].includes(type)) {
        if (item.healHp > 0) add("Hồi HP", signed(Math.floor(item.healHp)));
        if (item.healMp > 0) add("Hồi MP", signed(Math.floor(item.healMp)));
        if (item.statBoost > 0) add(`${labels[item.statKey || "str"] || item.statKey} vĩnh viễn`, signed(Math.floor(item.statBoost)));
      }
      if (type === "BREAKTHROUGH_PILL") notes.push("Đan được tự động tiêu hao khi phá đại cảnh giới thành công.");
    }
    const quality = item.rarity || item.quality;
    if (typeof quality === "string" && quality) add("Phẩm chất", quality, "quality");
    return { rows, notes };
  },

  itemEffectSummary(item) {
    return this.itemFacts(item).rows.filter((row) => row.kind === "stat" || row.kind === "rating")
      .map((row) => `${row.label} ${row.value}`).join(" · ");
  },

  itemDetailsContent(item) {
    const content = document.createDocumentFragment();
    const description = document.createElement("p");
    description.className = "item-description";
    description.textContent = item.description || item.desc || item.moTa || "";
    if (description.textContent) content.appendChild(description);
    const { rows, notes } = this.itemFacts(item);
    const facts = document.createElement("dl");
    facts.className = "item-facts";
    for (const row of rows) {
      const line = document.createElement("div");
      line.className = `item-fact item-fact-${row.kind}`;
      const label = document.createElement("dt");
      label.textContent = row.label;
      const value = document.createElement("dd");
      value.textContent = row.value;
      line.append(label, value);
      facts.appendChild(line);
    }
    content.appendChild(facts);
    for (const text of notes) {
      const note = document.createElement("p");
      note.className = "item-detail-note";
      note.textContent = text;
      content.appendChild(note);
    }
    const price = document.createElement("p");
    price.className = "item-detail-price";
    price.textContent = `Giá bán ${Number(item.giaBan || 0).toLocaleString("vi-VN")} xu`;
    content.appendChild(price);
    return content;
  },

  showTip(item, e) {
    const tip = document.getElementById("tip");
    const tipName = document.getElementById("tip-name");
    tipName.replaceChildren(
      this.createPixelIcon(item, "", "tip-pixel-icon"),
      document.createTextNode(` ${item.name || item.id || "Vật phẩm"}`),
    );
    document.getElementById("tip-type").textContent = this.itemTypeLabel(item);
    document.getElementById("tip-body").replaceChildren(this.itemDetailsContent(item));
    tip.style.display = "block";
    this.moveTip(e);
  },

  moveTip(e) {
    const tip = document.getElementById("tip");
    if (!tip || tip.style.display === "none") return;
    const bounds = tip.getBoundingClientRect();
    const x = Number(e.clientX ?? e.pageX ?? 0);
    const y = Number(e.clientY ?? e.pageY ?? 0);
    tip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - bounds.width - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(y + 12, window.innerHeight - bounds.height - 8))}px`;
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
        const isEqItem = (it.type || it.loai) === "EQUIPMENT";
        if (isEqItem) el.classList.add("isl-equipment");
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
    const detail = document.getElementById("inv-detail");
    if (detail) {
      detail.hidden = !selected;
      detail.replaceChildren(...(selected ? [this.itemDetailsContent(selected)] : []));
    }
    const selection = document.getElementById("inv-selection");
    const useBtn = document.getElementById("inv-use-btn");
    if (selection) {
      if (selected) {
        const isEq = (selected.type || selected.loai) === "EQUIPMENT";
        const tag = isEq ? `[Trang bị: ${selected.slot || "Vũ khí"}]` : "[Vật phẩm]";
        selection.textContent = `${selected.name || selected.id} · ${tag} · Nhấp đúp để ${isEq ? "trang bị" : "dùng"}`;
      } else {
        selection.textContent = "Chọn vật phẩm để xem thao tác";
      }
    }
    if (useBtn) {
      useBtn.disabled = !selected;
      useBtn.textContent = selected && (selected.type || selected.loai) === "EQUIPMENT" ? "⚔️ Trang bị" : "✦ Dùng";
    }
  },

  selectInventoryItem(index) {
    if (typeof Sound !== "undefined") Sound.play("click");
    this.selectedInventoryIndex = Number(index);
    Inventory.selectedIndex = this.selectedInventoryIndex;
    this.buildInv();
    const item = GameData.itemWithCurrentDetails(S.inventory[this.selectedInventoryIndex]);
    if (item && window.matchMedia?.("(hover: hover)").matches) {
      this.showTip(item, { clientX: window.innerWidth - 330, clientY: window.innerHeight - 190 });
    } else {
      this.hideTip();
    }
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

  initializeChatAutoFade() {
    const chatLogBox = document.getElementById("kpah-chat-log");
    if (!chatLogBox || typeof chatLogBox.addEventListener !== "function") return;
    const scheduleFade = () => {
      clearTimeout(this._logFadeTimer);
      this._logFadeTimer = setTimeout(() => {
        chatLogBox.classList.add("idle-faded");
      }, 6000);
    };
    chatLogBox.addEventListener("mouseenter", () => {
      chatLogBox.classList.remove("idle-faded");
      clearTimeout(this._logFadeTimer);
    });
    chatLogBox.addEventListener("mouseleave", () => {
      scheduleFade();
    });
    scheduleFade();
  },

  initializeHudLayout() {
    let saved = null;
    try { saved = localStorage.getItem("tutien.hud-layout.v1"); } catch { }
    const compact = saved === null
      ? window.matchMedia?.("(orientation: landscape) and (max-height: 520px)")?.matches === true
      : saved === "compact";
    this.setHudLayout(compact, false);
    this.initializeChatAutoFade();
    return compact;
  },

  toggleHudSettings(force) {
    const panel = document.getElementById("hud-settings");
    const button = document.getElementById("btn-hud-settings");
    if (!panel || !button) return false;
    const open = typeof force === "boolean" ? force : panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.classList.toggle("active", open);
    if (open && !this._hudSettingsOutside) {
      this._hudSettingsOutside = (event) => {
        if (!panel.contains(event.target) && !button.contains(event.target)) this.toggleHudSettings(false);
      };
      document.addEventListener("pointerdown", this._hudSettingsOutside);
    } else if (!open && this._hudSettingsOutside) {
      document.removeEventListener("pointerdown", this._hudSettingsOutside);
      this._hudSettingsOutside = null;
    }
    return open;
  },

  pressAttack(down, event) {
    if (typeof Input === "undefined") return;
    clearTimeout(this._attackReleaseTimer);
    if (down) {
      this._attackHeldAt = Date.now();
      this._attackPointerDown = true;
      Input.keys["Space"] = true;
      if (event?.currentTarget?.setPointerCapture && event.pointerId != null) {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
      }
      return;
    }
    if (!this._attackPointerDown) return; // pointerleave khi chỉ rê chuột: không đụng phím Space thật
    this._attackPointerDown = false;
    // Giữ tối thiểu 100ms để vòng lặp game kịp đọc một cú chạm ngắn.
    const remain = 100 - (Date.now() - (this._attackHeldAt || 0));
    if (remain > 0) this._attackReleaseTimer = setTimeout(() => { Input.keys["Space"] = false; }, remain);
    else Input.keys["Space"] = false;
  },

  tapAttack(event) {
    // Click từ chuột/chạm đã xử lý qua pointer; chỉ bàn phím (detail = 0) mới nhấn ngắn 100ms.
    if (typeof Input === "undefined" || event?.detail > 0) return;
    Input.keys["Space"] = true;
    setTimeout(() => { Input.keys["Space"] = false; }, 100);
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
    const chatLogBox = document.getElementById("kpah-chat-log");
    if (chatLogBox) {
      chatLogBox.classList.remove("idle-faded");
      clearTimeout(this._logFadeTimer);
      this._logFadeTimer = setTimeout(() => {
        chatLogBox.classList.add("idle-faded");
      }, 6000);
    }
    return p;
  },
};

if (typeof StateBus !== "undefined") {
  StateBus.on("player:vitals_changed", (vitals) => UI.updateVitals(vitals));
  StateBus.on("player:position_changed", (position) => UI.updatePosition(position));
  StateBus.on("target:changed", (target) => UI.updateTargetHud(target));
}
