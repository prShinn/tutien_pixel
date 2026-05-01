"use strict";
// ════════════════════════════════════════════════════════════
// ui.js — §13 UI Module
// ════════════════════════════════════════════════════════════

const UI = {
  toggleKpahMenu() {
    const el = document.getElementById("kpah-menu-modal");
    if (el) el.style.display = (el.style.display === "none") ? "flex" : "none";
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
  showLoading() {
    const el = document.getElementById("loading-screen");
    if (el) el.style.display = "flex";
  },
  hideLoading() {
    const el = document.getElementById("loading-screen");
    if (el) el.style.display = "none";
  },
  update() {
    if (!S.player) return;
    const p = S.player;
    document.getElementById("ui-name").textContent = p.name;

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
    document.getElementById("ui-cp").textContent = (
      ((Number(p.stats.str) || 0) + (Number(p.stats.agi) || 0) + (Number(p.stats.vit) || 0) + (Number(p.stats.ene) || 0)) * 5 +
        (p.canhGioi?.stt || 0) * 150 + (p.tangTuVi || 1) * 20 + 100
    ).toLocaleString();

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

    document.getElementById("ui-xu").textContent = p.xu.toLocaleString();

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

    this.renderEquipment();
    SkillSystem.renderSkillBar();
  },

  renderEquipment() {
    const eq = S.player?.equipment || {};
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
      el.title = slot.item?.description || "";
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
        el.onclick = () => Inventory.use(i);
        el.onmouseenter = (e) => this.showTip(it, e);
        el.onmousemove = (e) => this.moveTip(e);
        el.onmouseleave = () => this.hideTip();
      } else {
        el.textContent = "";
      }
      grid.appendChild(el);
    }
  },

  log(msg, cls = "") {
    const area = document.getElementById("log-area");
    const p = document.createElement("p");
    p.className = "lc lc-" + cls;
    const t = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    p.textContent = `[${t}] ${msg}`;
    area.appendChild(p);
    area.scrollTop = area.scrollHeight;
    while (area.children.length > 150) area.removeChild(area.firstChild);
  },
};
