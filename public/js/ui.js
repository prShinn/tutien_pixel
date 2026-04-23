"use strict";
// ════════════════════════════════════════════════════════════
// ui.js — §13 UI Module
// ════════════════════════════════════════════════════════════

const UI = {
  update() {
    if (!S.player) return;
    const p = S.player;
    document.getElementById("ui-name").textContent = p.name;

    const st = document.getElementById("ui-spirit-tag");
    st.textContent = `${p.linhCan} thuộc tính`;
    st.style.color = Linh_CAN[p.linhCan]?.color || "#aaa";

    const role = Combat.getRole();
    const roleEl = document.getElementById("ui-role");
    roleEl.textContent = role.name;
    roleEl.style.color = role.color;
    roleEl.style.textShadow = `0 0 8px ${role.color}88`;

    // Realm name: ưu tiên từ canhGioi object, fallback sang CFG.REALMS
    const realmName =
      p.tenCanhGioi ||
      p.canhGioi?.tenCanhGioi ||
      (CFG.REALMS[p.realm || 0]?.tenCanhGioi) ||
      "Luyện Thể";
    document.getElementById("ui-realm").textContent = realmName;
    document.getElementById("ui-stage").textContent = `Tầng ${p.tangTuVi}`;
    document.getElementById("ui-cp").textContent = (
      (p.stats.str + p.stats.agi + p.stats.vit + p.stats.ene) * 5 +
        p.canhGioi?.stt || 0 * 150 + p.tangTuVi * 20 + 100
    ).toLocaleString();

    const hp = Math.floor(p.hp);
    document.getElementById("ui-hp").textContent = `${hp}/${p.maxHp}`;
    document.getElementById("b-hp").style.width =
      Math.floor((hp / p.maxHp) * 100) + "%";

    const mp = Math.floor(p.mp);
    document.getElementById("ui-mp").textContent = `${mp}/${p.maxMp}`;
    document.getElementById("b-mp").style.width =
      Math.floor((mp / p.maxMp) * 100) + "%";

    document.getElementById("ui-tu").textContent =
      `${Math.floor(p.tuViHienTai)}/${Math.floor(p.tuViLenCap)}`;
    document.getElementById("b-tu").style.width =
      Math.min(100, Math.floor((p.tuViHienTai / p.tuViLenCap) * 100)) + "%";

    document.getElementById("ui-xu").textContent = p.xu.toLocaleString();

    const s = p.stats;
    const _i = (v) => Math.floor(Number(v) || 0);
    document.getElementById("r-str").textContent = _i(s.str);
    document.getElementById("r-agi").textContent = _i(s.agi);
    document.getElementById("r-vit").textContent = _i(s.vit);
    document.getElementById("r-ene").textContent = _i(s.ene);
    document.getElementById("r-patk").textContent = _i(Combat.pAtk());
    document.getElementById("r-matk").textContent = _i(Combat.mAtk());
    document.getElementById("r-def").textContent = _i(Combat.pDef());
    document.getElementById("r-spd").textContent = _i(3 + _i(s.agi) * 0.5);
    document.getElementById("r-eva").textContent =
      Combat.evasion().toFixed(1) + "%";
    document.getElementById("r-tvlc").textContent = p.tuViLinhCan || 0;
    document.getElementById("inv-head").textContent =
      `✦ TÚI ĐỒ (${S.inventory.length}/${CFG.INV_MAX})`;

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
