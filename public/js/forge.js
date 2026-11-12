// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/forge.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Giao diện Lò Rèn Cường Hóa trang bị (+0 → +15 theo KPAH / HSO / MU Online).
//    - Xem trước hoạt ảnh 2D lấp lánh trên Canvas, chỉ số cộng thêm (+N → +(N+1)),
//      tỷ lệ thành công (+15% nếu có Dòng May Mắn), tiêu hao Ngọc + Xu + Linh Thạch,
//      tùy chọn Bùa Bảo Vệ (CHARM_BAO_VE), và lịch sử cường hóa từ Backend.
// ════════════════════════════════════════════════════════════════════════════════════════

const ForgeUI = {
  _config: null,
  _logs: [],
  _selectedInstanceId: null,
  _useProtection: false,
  _filter: "ALL", // ALL | EQUIPPED | BAG
  _pending: false,
  _loading: false,
  _error: "",
  _lastResult: null,
  _rafId: 0,
  _imgCache: new Map(),

  STAT_LABELS: Object.freeze({
    pAtk: "Công Vật Lý",
    mAtk: "Công Pháp Thuật",
    pDef: "Thủ Vật Lý",
    mDef: "Kháng Phép",
    maxHp: "Sinh Lực",
    maxMp: "Linh Lực",
    spd: "Tốc Độ",
    crit: "Chí Mạng (%)",
  }),

  OUTCOME_TEXT: Object.freeze({
    SUCCESS: "Thành công",
    FAIL_DOWN: "Thất bại (-1 cấp)",
    FAIL_RESET_ZERO: "Thất bại (về +0)",
    FAIL_PROTECTED: "Thất bại (được Bùa giữ cấp)",
  }),

  _escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  _isAuthed() {
    if (S?.session?.accessToken) return true;
    return typeof authToken !== "undefined" && Boolean(authToken);
  },

  isOpen() {
    return Boolean(document.getElementById("forge-modal")?.classList.contains("open"));
  },

  toggle() {
    if (this.isOpen()) this.close();
    else void this.open();
  },

  close() {
    const modal = document.getElementById("forge-modal");
    if (modal) modal.classList.remove("open");
    this._stopPreviewLoop();
  },

  reset() {
    this.close();
    this._config = null;
    this._logs = [];
    this._selectedInstanceId = null;
    this._useProtection = false;
    this._filter = "ALL";
    this._pending = false;
    this._loading = false;
    this._error = "";
    this._lastResult = null;
  },

  async open(preferredInstanceId = null) {
    if (!this._isAuthed()) {
      UI.notify("Hãy đăng nhập trước khi sử dụng Lò Rèn.", "warning");
      return;
    }
    if (preferredInstanceId) {
      this._selectedInstanceId = String(preferredInstanceId);
    }
    this._lastResult = null;
    this._error = "";
    const modal = document.getElementById("forge-modal");
    if (modal) modal.classList.add("open");
    this._ensureValidSelection();
    this.render();
    this._startPreviewLoop();
    await this.loadConfig();
  },

  setFilter(filter) {
    this._filter = ["ALL", "EQUIPPED", "BAG"].includes(filter) ? filter : "ALL";
    this._ensureValidSelection();
    this.render();
  },

  selectEquipment(instanceId) {
    this._selectedInstanceId = instanceId ? String(instanceId) : null;
    this._lastResult = null;
    this.render();
  },

  toggleProtection(checked) {
    this._useProtection = Boolean(checked);
    this.render();
  },

  async loadConfig() {
    if (!this._isAuthed()) return;
    this._loading = true;
    this._error = "";
    this.render();
    try {
      const data = await Net.get(API.PATHS.enhance.config);
      if (!data || data.ok === false || !Array.isArray(data.tiers)) {
        throw new Error(data?.message || data?.error || "Không tải được cấu hình cường hóa.");
      }
      this._config = {
        maxLevel: Number(data.maxLevel || 15),
        luckRateBonus: Number(data.luckRateBonus ?? data.luckSuccessBonus ?? 0.15),
        luckSuccessBonus: Number(data.luckRateBonus ?? data.luckSuccessBonus ?? 0.15),
        protectionItemCode: data.protectionItemCode || "CHARM_BAO_VE",
        tiers: data.tiers,
        statMultipliers: Array.isArray(data.statMultipliers) ? data.statMultipliers : [],
      };
      this._logs = Array.isArray(data.logs) ? data.logs : [];
      this._ensureValidSelection();
    } catch (error) {
      this._error = error.message || "Không tải được cấu hình cường hóa.";
    } finally {
      this._loading = false;
      this.render();
    }
  },

  collectEnhanceables() {
    const list = [];
    const equip = S?.player?.equipment || S?.equipment || {};
    for (const [slotKey, raw] of Object.entries(equip)) {
      if (!raw || typeof raw !== "object" || !raw.instanceId) continue;
      const item = GameData.itemWithCurrentDetails(raw);
      if (String(item.type || item.loai || "EQUIPMENT").toUpperCase() !== "EQUIPMENT") continue;
      list.push({
        ...item,
        _location: "EQUIPPED",
        _slotKey: slotKey,
        _locationLabel: "Đang mặc",
      });
    }
    const inv = Array.isArray(S?.inventory) ? S.inventory : [];
    for (const raw of inv) {
      if (!raw || typeof raw !== "object" || !raw.instanceId) continue;
      const item = GameData.itemWithCurrentDetails(raw);
      if (String(item.type || item.loai || "").toUpperCase() !== "EQUIPMENT") continue;
      list.push({
        ...item,
        _location: "BAG",
        _slotKey: item.slot || "weapon",
        _locationLabel: "Túi đồ",
      });
    }
    return list;
  },

  _filteredList() {
    const all = this.collectEnhanceables();
    if (this._filter === "EQUIPPED") return all.filter((item) => item._location === "EQUIPPED");
    if (this._filter === "BAG") return all.filter((item) => item._location === "BAG");
    return all;
  },

  _ensureValidSelection() {
    const visible = this._filteredList();
    if (!visible.length) {
      if (this._filter !== "ALL") {
        const all = this.collectEnhanceables();
        if (all.length) {
          this._filter = "ALL";
          if (!all.some((item) => item.instanceId === this._selectedInstanceId)) {
            this._selectedInstanceId = all[0].instanceId;
          }
          return;
        }
      }
      this._selectedInstanceId = null;
      return;
    }
    if (this._selectedInstanceId && visible.some((item) => item.instanceId === this._selectedInstanceId)) {
      return;
    }
    this._selectedInstanceId = visible[0].instanceId;
  },

  ownedCount(itemCode) {
    const inv = Array.isArray(S?.inventory) ? S.inventory : [];
    let total = 0;
    for (const entry of inv) {
      const code = entry?.itemCode || entry?.id;
      if (code === itemCode) total += Math.max(0, Number(entry.count ?? entry.quantity ?? 0));
    }
    return total;
  },

  _tierConfigFor(nextLevel) {
    const tiers = this._config?.tiers || GAME_BALANCE?.enhance?.tiers || [];
    return tiers.find((tier) => Number(tier.targetLevel) === Number(nextLevel)) || null;
  },

  _planPreview(item) {
    if (!item) return null;
    const maxLevel = Number(this._config?.maxLevel || GAME_BALANCE?.enhance?.maxLevel || 15);
    const fromLevel = Math.max(0, Math.floor(Number(item.enhanceLevel || 0)));
    if (fromLevel >= maxLevel) {
      return { maxLevel, fromLevel, atMax: true };
    }
    const targetLevel = fromLevel + 1;
    const tier = this._tierConfigFor(targetLevel);
    if (!tier) return { maxLevel, fromLevel, targetLevel, missingConfig: true };
    const luckSuccessBonus = Number(this._config?.luckRateBonus ?? this._config?.luckSuccessBonus ?? GAME_BALANCE?.enhance?.luckRateBonus ?? GAME_BALANCE?.enhance?.luckSuccessBonus ?? 0.15);
    const baseRate = Number(tier.rate || 0);
    const luckBonus = item.hasLuck ? luckSuccessBonus : 0;
    const finalRate = Math.round(Math.min(1, Math.max(0.01, baseRate + luckBonus)) * 10000) / 10000;
    const gems = (tier.gems || []).map((gem) => {
      const need = Math.max(1, Math.floor(Number(gem.quantity || 1)));
      const have = this.ownedCount(gem.itemCode);
      const def = CFG?.ITEMS?.[gem.itemCode];
      return {
        itemCode: gem.itemCode,
        name: def?.name || gem.itemCode,
        icon: def?.icon || "💎",
        need,
        have,
        enough: have >= need,
      };
    });
    const charmCode = this._config?.protectionItemCode || "CHARM_BAO_VE";
    const charmDef = CFG?.ITEMS?.[charmCode];
    const charmHave = this.ownedCount(charmCode);
    const riskAllowsCharm = finalRate < 1 && (tier.failOutcome === "FAIL_DOWN" || tier.failOutcome === "FAIL_RESET_ZERO");
    const useProtection = Boolean(this._useProtection && riskAllowsCharm);
    const charmEnough = !useProtection || charmHave >= 1;
    const costXu = Math.max(0, Math.floor(Number(tier.xu || 0)));
    const costLinhThach = Math.max(0, Math.floor(Number(tier.linhThach || 0)));
    const xuHave = Math.floor(Number(S?.player?.xu || 0));
    const ltHave = Math.floor(Number(S?.player?.linhThach || 0));
    const xuEnough = xuHave >= costXu;
    const ltEnough = ltHave >= costLinhThach;
    const gemsEnough = gems.every((g) => g.enough);
    const canEnhance = !this._pending && gemsEnough && xuEnough && ltEnough && charmEnough;
    return {
      maxLevel,
      fromLevel,
      targetLevel,
      tier,
      baseRate,
      luckBonus,
      finalRate,
      gems,
      costXu,
      costLinhThach,
      xuHave,
      ltHave,
      xuEnough,
      ltEnough,
      gemsEnough,
      charmCode,
      charmName: charmDef?.name || "Bùa Bảo Vệ",
      charmHave,
      riskAllowsCharm,
      useProtection,
      charmEnough,
      canEnhance,
    };
  },

  async enhanceSelected() {
    if (!this._isAuthed()) return UI.notify("Hãy đăng nhập BE.", "warning");
    if (this._pending) return;
    this._ensureValidSelection();
    const list = this._filteredList();
    const item = list.find((entry) => entry.instanceId === this._selectedInstanceId);
    if (!item) return;
    const plan = this._planPreview(item);
    if (!plan || plan.atMax) {
      UI.notify("Trang bị đã đạt cấp tối đa.", "info");
      return;
    }
    if (!plan.canEnhance) {
      const msg = !plan.gemsEnough ? "Thiếu Ngọc cường hóa." : !plan.xuEnough ? "Không đủ Xu." : !plan.ltEnough ? "Không đủ Linh Thạch." : "Không đủ Bùa Bảo Vệ.";
      UI.notify(msg, "warning");
      return;
    }
    this._pending = true;
    this.render();
    try {
      const response = await Net.mutate("POST", API.PATHS.enhance.attempt, {
        instanceId: item.instanceId,
        useProtection: plan.useProtection,
      });
      if (!response?.player || !response?.result) {
        throw new Error(response?.message || response?.error || "Cường hóa thất bại.");
      }
      Net.applyPlayerSnapshot(response.player, { render: false });
      this._lastResult = response.result;
      this._logs = [
        {
          id: response.result.logId || Date.now(),
          itemCode: response.result.itemCode,
          itemName: response.result.itemName,
          fromLevel: response.result.fromLevel,
          toLevel: response.result.toLevel,
          outcome: response.result.outcome,
          usedProtection: response.result.usedProtection,
          createdAt: new Date().toISOString(),
        },
        ...this._logs.slice(0, 9),
      ];
      UI.buildInv();
      UI.update();
      const res = response.result;
      if (res.outcome === "SUCCESS") {
        UI.notify(`✨ Cường hóa thành công: ${res.itemName} +${res.toLevel}!`, "success");
        UI.log(`⚒️ Cường hóa thành công ${res.itemName} (+${res.fromLevel} → +${res.toLevel})`, "level");
        if (typeof Sound !== "undefined") Sound.play(res.toLevel >= 11 ? "breakthrough" : "levelUp");
      } else if (res.outcome === "FAIL_PROTECTED") {
        UI.notify(`🛡️ Thất bại nhưng Bùa Bảo Vệ đã giữ nguyên ${res.itemName} ở +${res.toLevel}.`, "warning");
        UI.log(`🛡️ Cường hóa ${res.itemName} thất bại (được Bùa Bảo Vệ giữ +${res.toLevel})`, "system");
        if (typeof Sound !== "undefined") Sound.play("hit");
      } else if (res.outcome === "FAIL_RESET_ZERO") {
        UI.notify(`💥 Rất tiếc! ${res.itemName} tụt từ +${res.fromLevel} về +0.`, "error");
        UI.log(`💥 Cường hóa ${res.itemName} thất bại (+${res.fromLevel} → +0)`, "system");
        if (typeof Sound !== "undefined") Sound.play("hit");
      } else {
        UI.notify(`🔻 Cường hóa thất bại! ${res.itemName} giảm từ +${res.fromLevel} xuống +${res.toLevel}.`, "warning");
        UI.log(`🔻 Cường hóa ${res.itemName} thất bại (+${res.fromLevel} → +${res.toLevel})`, "system");
        if (typeof Sound !== "undefined") Sound.play("hit");
      }
    } catch (error) {
      UI.notify(error.message || "Không thể cường hóa trang bị.", "error");
    } finally {
      this._pending = false;
      this.render();
    }
  },

  _loadImage(src) {
    if (!src) return null;
    if (this._imgCache.has(src)) return this._imgCache.get(src);
    const img = new Image();
    img.src = src;
    this._imgCache.set(src, img);
    return img;
  },

  _startPreviewLoop() {
    this._stopPreviewLoop();
    const tick = (nowMs) => {
      if (!this.isOpen()) {
        this._rafId = 0;
        return;
      }
      this._drawPreviewCanvas(nowMs);
      this._rafId = window.requestAnimationFrame(tick);
    };
    this._rafId = window.requestAnimationFrame(tick);
  },

  _stopPreviewLoop() {
    if (this._rafId) {
      window.cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  },

  _drawPreviewCanvas(nowMs) {
    const canvas = document.getElementById("forge-preview-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const list = this.collectEnhanceables();
    const item = list.find((entry) => entry.instanceId === this._selectedInstanceId);
    if (!item) return;

    const rarity = typeof ItemFX !== "undefined" ? ItemFX.RARITY_META[item.rarity] || ItemFX.RARITY_META.NORMAL : { color: "#e6edf3" };
    const grad = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w * 0.5);
    grad.addColorStop(0, "rgba(255, 224, 130, 0.16)");
    grad.addColorStop(0.65, "rgba(65, 84, 118, 0.12)");
    grad.addColorStop(1, "rgba(10, 14, 22, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const size = w - pad * 2;
    ctx.strokeStyle = rarity.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad - 4, pad - 4, size + 8, size + 8);

    const img = item.img ? this._loadImage(item.img) : null;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, pad, pad, size, size);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = "38px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(item.icon || "⚔️", w / 2, h / 2 + 2);
      ctx.restore();
    }

    if (typeof ItemFX !== "undefined") {
      ItemFX.drawSparkleOverlayCanvas(ctx, pad, pad, size, item, nowMs || performance.now(), { forceAnimate: true });
    }
  },

  _renderStatRows(item, fromLevel, nextLevel) {
    if (typeof GAME_BALANCE?.scaledEquipmentStats !== "function") return "";
    const curStats = GAME_BALANCE.scaledEquipmentStats({ ...item, enhanceLevel: fromLevel });
    const nextStats = nextLevel != null ? GAME_BALANCE.scaledEquipmentStats({ ...item, enhanceLevel: nextLevel }) : curStats;
    const rows = [];
    for (const [key, label] of Object.entries(this.STAT_LABELS)) {
      const curVal = Number(curStats[key] || 0);
      const nextVal = Number(nextStats[key] || 0);
      if (curVal <= 0 && nextVal <= 0) continue;
      const diff = nextVal - curVal;
      rows.push(
        `<div class="forge-stat-row"><span>${label}</span><span><b>${curVal}</b>${nextLevel != null && diff > 0 ? ` <em class="forge-stat-up">→ ${nextVal} (+${diff})</em>` : ""}</span></div>`
      );
    }
    if (!rows.length) {
      return '<div class="forge-stat-empty">Trang bị chưa có chỉ số cơ bản</div>';
    }
    return rows.join("");
  },

  _renderExlRows(item) {
    const opts = Array.isArray(item?.exlOptions) ? item.exlOptions : [];
    if (!opts.length) return "";
    const catalog = GAME_BALANCE?.exlOptions && !Array.isArray(GAME_BALANCE.exlOptions)
      ? GAME_BALANCE.exlOptions
      : {};
    const lines = opts.map((entry) => {
      const code = typeof entry === "string" ? entry : entry?.code;
      const def = catalog[code] || (Array.isArray(GAME_BALANCE?.exlOptions) ? GAME_BALANCE.exlOptions.find((o) => o.code === code) : null);
      const val = (typeof entry === "object" ? (entry?.val ?? entry?.value) : null) ?? def?.val ?? def?.value;
      const rawLabel = def?.label || code || "Tùy chọn Hoàn Hảo";
      const text = rawLabel.includes("{val}")
        ? rawLabel.replace("{val}", String(val ?? ""))
        : (def?.unit === "%" && val != null ? `${rawLabel} (+${val}%)` : val != null && !rawLabel.includes(String(val)) ? `${rawLabel} (+${val})` : rawLabel);
      return `<div class="forge-exl-line">❖ ${this._escapeHtml(text)}</div>`;
    });
    return `<div class="forge-exl-box">${lines.join("")}</div>`;
  },

  render() {
    const modal = document.getElementById("forge-modal");
    if (!modal) return;
    const xuEl = document.getElementById("forge-xu");
    const ltEl = document.getElementById("forge-linhthach");
    if (xuEl) xuEl.textContent = Number(S?.player?.xu || 0).toLocaleString("vi-VN");
    if (ltEl) ltEl.textContent = Number(S?.player?.linhThach || 0).toLocaleString("vi-VN");

    modal.querySelectorAll(".forge-filter-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.forgeFilter === this._filter);
    });

    const listEl = document.getElementById("forge-equip-list");
    const detailEl = document.getElementById("forge-detail");
    if (!listEl || !detailEl) return;

    const visible = this._filteredList();
    if (!visible.length) {
      listEl.innerHTML = `<div class="forge-empty">Chưa có trang bị trong ${this._filter === "EQUIPPED" ? "ô đang mặc" : this._filter === "BAG" ? "túi đồ" : "hành trang"}.</div>`;
      detailEl.innerHTML = `<div class="forge-empty-detail"><p>Nhặt trang bị từ quái hoặc mua ở Tiệm để bắt đầu cường hóa từ <b>+0 → +15</b>.</p></div>`;
      return;
    }

    listEl.innerHTML = "";
    for (const item of visible) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `forge-equip-item${item.instanceId === this._selectedInstanceId ? " active" : ""}`;
      card.onclick = () => this.selectEquipment(item.instanceId);

      const iconWrap = document.createElement("div");
      iconWrap.className = "forge-equip-icon fx-slot";
      if (item.img) {
        const img = document.createElement("img");
        img.src = item.img;
        img.alt = item.name || item.id;
        iconWrap.appendChild(img);
      } else {
        iconWrap.textContent = item.icon || "⚔️";
      }
      if (typeof ItemFX !== "undefined") {
        ItemFX.decorateSlotElement(iconWrap, item);
      }

      const meta = document.createElement("div");
      meta.className = "forge-equip-meta";
      const rarityMeta = typeof ItemFX !== "undefined" ? (ItemFX.RARITY_META[item.rarity] || ItemFX.RARITY_META.NORMAL) : { label: item.rarity || "Thường", color: "#e6edf3" };
      const lvl = Math.max(0, Number(item.enhanceLevel || 0));
      meta.innerHTML = `
        <strong style="color:${rarityMeta.color}">${this._escapeHtml(item.name || item.id)}${lvl > 0 ? ` <span class="forge-lv-tag">+${lvl}</span>` : ""}</strong>
        <small>${this._escapeHtml(item._locationLabel)} · ${this._escapeHtml(rarityMeta.label)}${item.hasLuck ? " · <span class=\"forge-luck-txt\">✦ May Mắn</span>" : ""}</small>
      `;

      card.appendChild(iconWrap);
      card.appendChild(meta);
      listEl.appendChild(card);
    }

    const selected = visible.find((entry) => entry.instanceId === this._selectedInstanceId) || visible[0];
    const plan = this._planPreview(selected);
    const rarityMeta = typeof ItemFX !== "undefined" ? (ItemFX.RARITY_META[selected.rarity] || ItemFX.RARITY_META.NORMAL) : { label: selected.rarity || "Thường", color: "#e6edf3" };

    const resultBanner = this._lastResult
      ? `<div class="forge-result-banner outcome-${this._escapeHtml(String(this._lastResult.outcome || "").toLowerCase())}">
          <strong>${this._escapeHtml(this.OUTCOME_TEXT[this._lastResult.outcome] || this._lastResult.outcome)}</strong>
          <span>${this._escapeHtml(this._lastResult.itemName)} (+${Number(this._lastResult.fromLevel || 0)} → +${Number(this._lastResult.toLevel || 0)})</span>
        </div>`
      : "";

    const errorBanner = this._error ? `<div class="forge-error-banner">${this._escapeHtml(this._error)}</div>` : "";

    let upgradeSection = "";
    if (!plan || plan.missingConfig) {
      upgradeSection = `<div class="forge-max-banner">${this._loading ? "Đang tải cấu hình Lò Rèn..." : "Chưa có dữ liệu cấp cường hóa."}</div>`;
    } else if (plan.atMax) {
      upgradeSection = `
        <div class="forge-stats-card">${this._renderStatRows(selected, plan.fromLevel, null)}</div>
        ${this._renderExlRows(selected)}
        <div class="forge-max-banner">👑 Trang bị đã đạt đỉnh phong <b>+${plan.maxLevel}</b>!</div>
      `;
    } else {
      const ratePct = Math.round(plan.finalRate * 100);
      const basePct = Math.round(plan.baseRate * 100);
      const luckPct = Math.round(plan.luckBonus * 100);
      const riskLabel = plan.tier.failOutcome === "FAIL_RESET_ZERO"
        ? (plan.useProtection ? "🛡️ Bùa Bảo Vệ đang bật — thất bại giữ nguyên cấp" : `⚠️ Rủi ro cao: thất bại rớt về +0 (không mất đồ)`)
        : plan.tier.failOutcome === "FAIL_DOWN"
          ? (plan.useProtection ? "🛡️ Bùa Bảo Vệ đang bật — thất bại giữ nguyên cấp" : `⚠️ Lưu ý: thất bại giảm 1 cấp (+${Math.max(0, plan.fromLevel - 1)})`)
          : "✅ An toàn: thất bại không bị tụt cấp";

      const gemsHtml = plan.gems.map((g) => `
        <div class="forge-mat-pill ${g.enough ? "ok" : "miss"}">
          <span>${this._escapeHtml(g.icon)} ${this._escapeHtml(g.name)}</span>
          <b>${g.have}/${g.need}</b>
        </div>
      `).join("");

      const charmDisabled = !plan.riskAllowsCharm || plan.charmHave < 1;
      upgradeSection = `
        <div class="forge-stats-card">${this._renderStatRows(selected, plan.fromLevel, plan.targetLevel)}</div>
        ${this._renderExlRows(selected)}
        <div class="forge-rate-bar">
          <div>
            <span>Tỷ lệ thành công (+${plan.targetLevel})</span>
            <strong>${ratePct}%</strong>
          </div>
          <small>Cơ bản ${basePct}%${luckPct > 0 ? ` + May Mắn ${luckPct}%` : ""}</small>
        </div>
        <div class="forge-materials">
          ${gemsHtml}
          <div class="forge-mat-pill ${plan.xuEnough ? "ok" : "miss"}"><span>🪙 Xu</span><b>${plan.xuHave.toLocaleString("vi-VN")}/${plan.costXu.toLocaleString("vi-VN")}</b></div>
          ${plan.costLinhThach > 0 ? `<div class="forge-mat-pill ${plan.ltEnough ? "ok" : "miss"}"><span>💠 Linh Thạch</span><b>${plan.ltHave.toLocaleString("vi-VN")}/${plan.costLinhThach.toLocaleString("vi-VN")}</b></div>` : ""}
        </div>
        <label class="forge-protect-row ${plan.riskAllowsCharm ? "" : "muted"}">
          <input type="checkbox" ${plan.useProtection ? "checked" : ""} ${charmDisabled ? "disabled" : ""} onchange="ForgeUI.toggleProtection(this.checked)" />
          <span>🛡️ Dùng <b>${this._escapeHtml(plan.charmName)}</b> (có ${plan.charmHave})</span>
        </label>
        <div class="forge-risk-note">${riskLabel}</div>
        <button id="forge-enhance-btn" type="button" class="sbtn forge-enhance-btn" ${plan.canEnhance ? "" : "disabled"} onclick="ForgeUI.enhanceSelected()">
          ${this._pending ? "⏳ Đang rèn..." : `⚒️ Cường Hóa (+${plan.fromLevel} → +${plan.targetLevel})`}
        </button>
      `;
    }

    const logsHtml = this._logs.length
      ? this._logs.slice(0, 6).map((log) => {
          const outClass = String(log.outcome || "").toLowerCase();
          return `<div class="forge-log-row outcome-${this._escapeHtml(outClass)}"><span>${this._escapeHtml(log.itemName || log.itemCode)}</span><span>+${Number(log.fromLevel || 0)} → +${Number(log.toLevel || 0)} · ${this._escapeHtml(this.OUTCOME_TEXT[log.outcome] || log.outcome)}</span></div>`;
        }).join("")
      : '<div class="forge-log-empty">Chưa có lịch sử cường hóa gần đây.</div>';

    detailEl.innerHTML = `
      ${errorBanner}
      ${resultBanner}
      <div class="forge-detail-head">
        <canvas id="forge-preview-canvas" width="96" height="96"></canvas>
        <div class="forge-detail-title">
          <h3 style="color:${rarityMeta.color}">${this._escapeHtml(selected.name || selected.id)}${selected.enhanceLevel > 0 ? ` +${selected.enhanceLevel}` : ""}</h3>
          <div class="forge-tags">
            <span class="forge-tag" style="border-color:${rarityMeta.color};color:${rarityMeta.color}">${this._escapeHtml(rarityMeta.label)}</span>
            <span class="forge-tag">iLvl ${Number(selected.itemLevel || 1)}</span>
            ${selected.linhCan ? `<span class="forge-tag">Hệ ${this._escapeHtml(selected.linhCan)}</span>` : ""}
            ${selected.hasLuck ? `<span class="forge-tag luck">✦ May Mắn (+15%)</span>` : ""}
          </div>
          <p class="forge-desc">${this._escapeHtml(selected.desc || "Trang bị tu chân có thể cường hóa tới +15 tại Lò Rèn.")}</p>
        </div>
      </div>
      ${upgradeSection}
      <div class="forge-logs-box">
        <div class="phead">NHẬT KÝ LÒ RÈN</div>
        ${logsHtml}
      </div>
    `;

    this._drawPreviewCanvas(performance.now());
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ForgeUI };
}
