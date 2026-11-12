// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/alchemy.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Giao diện Lò Luyện Đan: Xem công thức theo 4 phẩm chất (Hạ/Trung/Thượng/Cực), kiểm tra
//      nguyên liệu + Linh Thạch Nhỏ + Xu + Linh Thạch ví, luyện đan qua BE (/api/player/alchemy/brew)
//      với cơ chế thành công <= 70% và 5% đột biến nâng phẩm, cùng lịch sử luyện đan.
// ════════════════════════════════════════════════════════════════════════════════════════

const AlchemyUI = {
  _recipes: [],
  _history: [],
  _tab: "PHI_THANG",
  _quality: "ALL",
  _search: "",
  _selectedCode: null,
  _lastResult: null,
  _brewPending: false,
  _loading: false,
  _error: "",
  _lastSyncSig: null,
  _lastRenderedCode: null,

  QUALITY_ORDER: { HA_PHAM: 1, TRUNG_PHAM: 2, THUONG_PHAM: 3, CUC_PHAM: 4 },
  QUALITY_BADGE_CLASS: {
    HA_PHAM: "q-ha",
    TRUNG_PHAM: "q-trung",
    THUONG_PHAM: "q-thuong",
    CUC_PHAM: "q-cuc",
  },

  isOpen() {
    return Boolean(document.getElementById("alchemy-modal")?.classList.contains("open"));
  },

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  },

  close() {
    document.getElementById("alchemy-modal")?.classList.remove("open");
  },

  async open(tab = null) {
    if (!authToken) {
      UI.notify("Hãy đăng nhập trước khi sử dụng Lò Luyện Đan.", "warning");
      return;
    }
    if (tab) this._tab = tab;
    this._lastResult = null;
    const modal = document.getElementById("alchemy-modal");
    if (modal) modal.classList.add("open");
    this.render();
    await this.loadRecipes();
    if (this._tab === "HISTORY") await this.loadHistory();
  },

  async setTab(tab) {
    this._tab = tab;
    if (tab === "HISTORY") {
      this.render();
      await this.loadHistory();
      return;
    }
    this._ensureValidSelection();
    this.render();
  },

  setQuality(quality) {
    this._quality = quality || "ALL";
    this._ensureValidSelection();
    this.render();
  },

  setSearch(query) {
    this._search = String(query || "").trim().toLowerCase();
    this._ensureValidSelection();
    this.render();
  },

  async loadRecipes() {
    if (!authToken) return;
    this._loading = true;
    this._error = "";
    this.render();
    try {
      const data = await Net.get(API.PATHS.alchemy.recipes);
      if (!data || data.ok === false || !Array.isArray(data.recipes)) {
        throw new Error(data?.message || data?.error || "Không tải được danh sách đan phương.");
      }
      this._recipes = data.recipes;
      this.syncRecipeStatesFromPlayer();
      this._ensureValidSelection();
    } catch (error) {
      this._error = error.message || "Không tải được danh sách đan phương.";
    } finally {
      this._loading = false;
      this.render();
    }
  },

  async loadHistory() {
    if (!authToken) return;
    this._loading = true;
    this._error = "";
    this.render();
    try {
      const data = await Net.get(API.PATHS.alchemy.history);
      if (!data || data.ok === false || !Array.isArray(data.items)) {
        throw new Error(data?.message || data?.error || "Không tải được lịch sử luyện đan.");
      }
      this._history = data.items;
    } catch (error) {
      this._error = error.message || "Không tải được lịch sử luyện đan.";
    } finally {
      this._loading = false;
      this.render();
    }
  },

  syncRecipeStatesFromPlayer() {
    if (!S.player || !Array.isArray(this._recipes)) return;
    const ownedMap = new Map();
    for (const entry of S.inventory || []) {
      const code = String(entry.itemCode || entry.id || "").trim();
      if (!code) continue;
      ownedMap.set(code, (ownedMap.get(code) || 0) + Math.max(0, Number(entry.quantity ?? entry.count ?? 0)));
    }
    const xu = Math.max(0, Number(S.player.xu || 0));
    const linhThach = Math.max(0, Number(S.player.linhThach ?? S.player.wallet?.linhThach ?? 0));
    const realmStt = Number(S.player.canhGioi?.stt || S.player.realm || 1);

    this._recipes = this._recipes.map((recipe) => {
      const ingredients = (recipe.ingredients || []).map((ing) => {
        const owned = ownedMap.get(ing.itemCode) || 0;
        const need = Math.max(1, Number(ing.quantity || 1));
        return { ...ing, owned, quantity: need, enough: owned >= need };
      });
      const missingReasons = [];
      if (realmStt < Number(recipe.requiredRealmStt || 1)) missingReasons.push("REALM_TOO_LOW");
      if (xu < Number(recipe.costXu || 0)) missingReasons.push("INSUFFICIENT_XU");
      if (linhThach < Number(recipe.costLinhThach || 0)) missingReasons.push("INSUFFICIENT_LINH_THACH");
      if (ingredients.some((ing) => !ing.enough)) missingReasons.push("INSUFFICIENT_INGREDIENTS");
      return {
        ...recipe,
        ingredients,
        missingReasons,
        canCraft: missingReasons.length === 0,
      };
    });
  },

  filteredRecipes() {
    const sorted = [...this._recipes].sort((a, b) => {
      const aPhi = a.pillGroup === "DAN_PHI_THANG" ? 0 : 1;
      const bPhi = b.pillGroup === "DAN_PHI_THANG" ? 0 : 1;
      if (aPhi !== bPhi) return aPhi - bPhi;
      const aReq = Number(a.requiredRealmStt || 1);
      const bReq = Number(b.requiredRealmStt || 1);
      if (aReq !== bReq) return aReq - bReq;
      return (this.QUALITY_ORDER[a.quality] || 9) - (this.QUALITY_ORDER[b.quality] || 9);
    });
    return sorted.filter((recipe) => {
      if (this._tab === "PHI_THANG" && recipe.pillGroup !== "DAN_PHI_THANG") return false;
      if (this._tab === "BREAKTHROUGH" && recipe.category !== "BREAKTHROUGH") return false;
      if (this._tab === "SUPPORT" && recipe.category === "BREAKTHROUGH") return false;
      if (this._quality !== "ALL" && recipe.quality !== this._quality) return false;
      if (this._search) {
        const hay = `${recipe.name || ""} ${recipe.outputItem?.name || ""} ${recipe.code || ""}`.toLowerCase();
        if (!hay.includes(this._search)) return false;
      }
      return true;
    });
  },

  _ensureValidSelection() {
    const visible = this.filteredRecipes();
    if (!visible.length) {
      this._selectedCode = null;
      return;
    }
    if (this._selectedCode && visible.some((r) => r.code === this._selectedCode)) return;
    this._selectedCode = visible[0].code;
  },

  missingReasonLabel(recipe) {
    const reasons = recipe.missingReasons || [];
    if (!reasons.length) return "";
    const labels = [];
    if (reasons.includes("REALM_TOO_LOW")) labels.push(`Cần cảnh giới bậc ${recipe.requiredRealmStt}`);
    if (reasons.includes("INSUFFICIENT_INGREDIENTS")) labels.push("Thiếu nguyên liệu / Linh Thạch Nhỏ");
    if (reasons.includes("INSUFFICIENT_XU")) labels.push(`Thiếu Xu (${recipe.costXu})`);
    if (reasons.includes("INSUFFICIENT_LINH_THACH")) labels.push(`Thiếu Linh Thạch (${recipe.costLinhThach})`);
    return labels.join(" · ");
  },

  async brewSelected() {
    if (!authToken) return UI.notify("Hãy đăng nhập BE.", "warning");
    if (this._brewPending || !this._selectedCode) return;
    const recipe = this._recipes.find((r) => r.code === this._selectedCode);
    if (!recipe) return;
    if (!recipe.canCraft) {
      UI.notify(this.missingReasonLabel(recipe) || "Chưa đủ điều kiện luyện đan.", "warning");
      return;
    }
    this._brewPending = true;
    this.render();
    try {
      const response = await Net.mutate("POST", API.PATHS.alchemy.brew, { recipeCode: recipe.code });
      if (!response?.player || !response?.result) {
        throw new Error(response?.message || response?.error || "Luyện đan thất bại.");
      }
      Net.applyPlayerSnapshot(response.player, { render: false });
      this._lastResult = response.result;
      this.syncRecipeStatesFromPlayer();
      UI.buildInv();
      UI.update();
      const res = response.result;
      if (res.outcome === "MUTATED") {
        UI.notify(`✨ Đột biến nâng phẩm! Nhận ${res.outputItemName || res.outputItemCode}!`, "success");
        UI.log(`✨ Lò Đan đột biến: ${recipe.name} → ${res.outputItemName || res.outputItemCode}`, "level");
        if (typeof Sound !== "undefined") Sound.play("breakthrough");
      } else if (res.outcome === "SUCCESS") {
        UI.notify(`🔥 Luyện đan thành công: ${res.outputItemName || res.outputItemCode}!`, "success");
        UI.log(`🔥 Luyện thành công ${res.outputItemName || res.outputItemCode}`, "loot");
        if (typeof Sound !== "undefined") Sound.play("levelUp");
      } else {
        UI.notify(`💨 Nổ lò thất bại! Đã mất nguyên liệu, ${res.costXu} Xu${res.costLinhThach ? ` và ${res.costLinhThach} Linh Thạch` : ""}.`, "error");
        UI.log(`💨 Luyện ${recipe.name} thất bại (${Math.round((res.craftSuccessRate || 0) * 100)}%), mất nguyên liệu.`, "system");
        if (typeof Sound !== "undefined") Sound.play("hit");
      }
    } catch (error) {
      UI.notify(error.message || "Không thể luyện đan.", "error");
    } finally {
      this._brewPending = false;
      this.render();
    }
  },

  _syncSignature() {
    const invSig = (S.inventory || [])
      .map((it) => `${it.itemCode || it.id}:${it.count ?? it.quantity ?? 0}`)
      .sort()
      .join(",");
    const xu = Math.floor(Number(S.player?.xu || 0));
    const lt = Math.floor(Number(S.player?.linhThach ?? S.player?.wallet?.linhThach ?? 0));
    const realmStt = Number(S.player?.canhGioi?.stt || S.player?.realm || 1);
    const resTag = this._lastResult ? `${this._lastResult.recipeCode}:${this._lastResult.outcome}` : "";
    return `${xu}|${lt}|${realmStt}|${this._tab}|${this._quality}|${this._search}|${this._selectedCode || ""}|${this._recipes.length}|${resTag}|${invSig}`;
  },

  onPlayerSync() {
    if (!this.isOpen()) return;
    const sig = this._syncSignature();
    if (sig === this._lastSyncSig) {
      const xuEl = document.getElementById("alchemy-xu");
      const ltEl = document.getElementById("alchemy-linhthach");
      if (xuEl) xuEl.textContent = Math.floor(Number(S.player?.xu || 0)).toLocaleString("vi-VN");
      if (ltEl) ltEl.textContent = Math.floor(Number(S.player?.linhThach ?? S.player?.wallet?.linhThach ?? 0)).toLocaleString("vi-VN");
      return;
    }
    this.syncRecipeStatesFromPlayer();
    this.render();
  },

  _createQualityBadge(quality, qualityLabel) {
    const span = document.createElement("span");
    const cls = this.QUALITY_BADGE_CLASS[quality] || "q-ha";
    span.className = `alchemy-quality-badge ${cls}`;
    span.textContent = qualityLabel || quality || "Hạ phẩm";
    return span;
  },

  render() {
    const modal = document.getElementById("alchemy-modal");
    if (!modal || !modal.classList.contains("open")) return;
    const xuEl = document.getElementById("alchemy-xu");
    const ltEl = document.getElementById("alchemy-linhthach");
    if (xuEl) xuEl.textContent = Math.floor(Number(S.player?.xu || 0)).toLocaleString("vi-VN");
    if (ltEl) ltEl.textContent = Math.floor(Number(S.player?.linhThach ?? S.player?.wallet?.linhThach ?? 0)).toLocaleString("vi-VN");

    modal.querySelectorAll("[data-alchemy-tab]").forEach((btn) => {
      const active = btn.dataset.alchemyTab === this._tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    modal.querySelectorAll("[data-alchemy-quality]").forEach((btn) => {
      const active = btn.dataset.alchemyQuality === this._quality;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    const bodyRecipes = document.getElementById("alchemy-recipes-view");
    const bodyHistory = document.getElementById("alchemy-history-view");
    if (this._tab === "HISTORY") {
      if (bodyRecipes) bodyRecipes.hidden = true;
      if (bodyHistory) bodyHistory.hidden = false;
      this.renderHistory(bodyHistory);
      return;
    }
    if (bodyRecipes) bodyRecipes.hidden = false;
    if (bodyHistory) bodyHistory.hidden = true;

    this.syncRecipeStatesFromPlayer();
    this._ensureValidSelection();
    const listEl = document.getElementById("alchemy-recipe-list");
    const detailEl = document.getElementById("alchemy-recipe-detail");
    if (!listEl || !detailEl) return;
    const prevListScroll = listEl.scrollTop || 0;
    const prevDetailScroll = detailEl.scrollTop || 0;

    listEl.replaceChildren();
    if (this._loading && !this._recipes.length) {
      const msg = document.createElement("div");
      msg.className = "alchemy-empty";
      msg.textContent = "Đang tải đan phương...";
      listEl.appendChild(msg);
      detailEl.replaceChildren();
      this._lastSyncSig = this._syncSignature();
      return;
    }
    if (this._error && !this._recipes.length) {
      const msg = document.createElement("div");
      msg.className = "alchemy-empty";
      msg.textContent = this._error;
      listEl.appendChild(msg);
      detailEl.replaceChildren();
      this._lastSyncSig = this._syncSignature();
      return;
    }

    const visible = this.filteredRecipes();
    if (!visible.length) {
      const msg = document.createElement("div");
      msg.className = "alchemy-empty";
      msg.textContent = "Không có đan phương nào khớp bộ lọc.";
      listEl.appendChild(msg);
      detailEl.replaceChildren();
      this._lastSyncSig = this._syncSignature();
      return;
    }

    for (const recipe of visible) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `alchemy-recipe-row${recipe.code === this._selectedCode ? " selected" : ""}${recipe.canCraft ? " ready" : ""}`;
      row.onclick = () => {
        this._selectedCode = recipe.code;
        this._lastResult = null;
        this.render();
      };

      const top = document.createElement("div");
      top.className = "alchemy-row-top";
      const title = document.createElement("span");
      title.className = "alchemy-row-name";
      title.textContent = recipe.name;
      top.append(title, this._createQualityBadge(recipe.quality, recipe.qualityLabel));

      const meta = document.createElement("div");
      meta.className = "alchemy-row-meta";
      const rateTxt = `Thành công ${Math.round(Number(recipe.craftSuccessRate || 0) * 100)}%`;
      const ltTxt = recipe.costLinhThach > 0 ? ` + ${recipe.costLinhThach} LT` : "";
      const statusTxt = recipe.canCraft ? "✅ Đủ ĐK" : "⛔ Thiếu";
      meta.textContent = `${rateTxt} · ${recipe.costXu} Xu${ltTxt} · ${statusTxt}`;

      row.append(top, meta);
      listEl.appendChild(row);
    }

    const selected = visible.find((r) => r.code === this._selectedCode) || visible[0];
    this.renderDetail(detailEl, selected);
    listEl.scrollTop = prevListScroll;
    detailEl.scrollTop = selected.code === this._lastRenderedCode ? prevDetailScroll : 0;
    this._lastRenderedCode = selected.code;
    this._lastSyncSig = this._syncSignature();
  },

  renderDetail(container, recipe) {
    container.replaceChildren();
    if (!recipe) return;

    const head = document.createElement("div");
    head.className = "alchemy-detail-head";
    const title = document.createElement("h3");
    title.className = "alchemy-detail-title";
    title.textContent = recipe.name;
    head.append(title, this._createQualityBadge(recipe.quality, recipe.qualityLabel));

    const desc = document.createElement("p");
    desc.className = "alchemy-detail-desc";
    desc.textContent = recipe.description || "";

    const statsBox = document.createElement("div");
    statsBox.className = "alchemy-rates";
    const craftPct = Math.round(Number(recipe.craftSuccessRate || 0) * 100);
    const mutPct = recipe.upgradedItem ? Math.round(Number(recipe.mutationChance || 0) * 100) : 0;
    const rateLine = document.createElement("div");
    rateLine.textContent = `🎯 Tỷ lệ luyện thành công: ${craftPct}% (tối đa 70%)`;
    const mutLine = document.createElement("div");
    mutLine.textContent = recipe.upgradedItem
      ? `✨ Xác suất đột biến (+1 bậc phẩm chất): ${mutPct}% → ${recipe.upgradedItem.name}`
      : "✨ Đan phương đạt đỉnh phẩm chất tối đa.";
    const outputInfo = document.createElement("div");
    if (recipe.outputItem?.breakthroughRate != null) {
      outputInfo.textContent = `💊 Thành phẩm: ${recipe.outputItem.name} (tỷ lệ đột phá ${Math.round(recipe.outputItem.breakthroughRate * 100)}%)`;
    } else {
      outputInfo.textContent = `💊 Thành phẩm: ${recipe.outputItem?.name || recipe.outputItemCode}`;
    }
    statsBox.append(outputInfo, rateLine, mutLine);

    const ingHead = document.createElement("div");
    ingHead.className = "phead";
    ingHead.textContent = "NGUYÊN LIỆU & CHI PHÍ";

    const ingList = document.createElement("div");
    ingList.className = "alchemy-ing-list";
    for (const ing of recipe.ingredients || []) {
      const item = document.createElement("div");
      item.className = `alchemy-ing-row ${ing.enough ? "ok" : "short"}`;
      const left = document.createElement("span");
      left.textContent = `${ing.icon || "🌿"} ${ing.name || ing.itemCode}`;
      const right = document.createElement("span");
      right.className = "alchemy-ing-qty";
      right.textContent = `${ing.owned} / ${ing.quantity}`;
      item.append(left, right);
      ingList.appendChild(item);
    }

    const walletXu = Math.floor(Number(S.player?.xu || 0));
    const walletLt = Math.floor(Number(S.player?.linhThach ?? S.player?.wallet?.linhThach ?? 0));
    const xuRow = document.createElement("div");
    xuRow.className = `alchemy-ing-row ${walletXu >= recipe.costXu ? "ok" : "short"}`;
    const xuLabel = document.createElement("span");
    xuLabel.textContent = "🪙 Chi phí Xu";
    const xuQty = document.createElement("span");
    xuQty.className = "alchemy-ing-qty";
    xuQty.textContent = `${walletXu.toLocaleString("vi-VN")} / ${recipe.costXu.toLocaleString("vi-VN")}`;
    xuRow.append(xuLabel, xuQty);
    ingList.appendChild(xuRow);

    if (recipe.costLinhThach > 0) {
      const ltRow = document.createElement("div");
      ltRow.className = `alchemy-ing-row ${walletLt >= recipe.costLinhThach ? "ok" : "short"}`;
      const ltLabel = document.createElement("span");
      ltLabel.textContent = "💠 Chi phí Linh Thạch (Ví)";
      const ltQty = document.createElement("span");
      ltQty.className = "alchemy-ing-qty";
      ltQty.textContent = `${walletLt.toLocaleString("vi-VN")} / ${recipe.costLinhThach.toLocaleString("vi-VN")}`;
      ltRow.append(ltLabel, ltQty);
      ingList.appendChild(ltRow);
    }

    const realmName = CFG.REALMS?.find((r) => Number(r.stt) === Number(recipe.requiredRealmStt || 1))?.tenCanhGioi
      || `Cảnh giới bậc ${recipe.requiredRealmStt || 1}`;
    const currentRealmStt = Number(S.player?.canhGioi?.stt || S.player?.realm || 1);
    const reqNote = document.createElement("div");
    reqNote.className = `alchemy-req-note ${currentRealmStt >= Number(recipe.requiredRealmStt || 1) ? "ok" : "short"}`;
    reqNote.textContent = `📜 Yêu cầu cảnh giới: ${realmName} · Thất bại mất toàn bộ nguyên liệu, Linh Thạch Nhỏ, Xu & Linh Thạch đã bỏ vào lò.`;

    const actions = document.createElement("div");
    actions.className = "alchemy-actions";
    const brewBtn = document.createElement("button");
    brewBtn.type = "button";
    brewBtn.id = "btn-alchemy-brew";
    brewBtn.className = "sbtn";
    brewBtn.disabled = this._brewPending || !recipe.canCraft;
    brewBtn.textContent = this._brewPending
      ? "🔥 Đang khai lò..."
      : recipe.canCraft
        ? "🔥 Khai Lò Luyện Đan"
        : `⛔ ${this.missingReasonLabel(recipe)}`;
    brewBtn.onclick = () => this.brewSelected();
    actions.appendChild(brewBtn);

    container.append(head, desc, statsBox, ingHead, ingList, reqNote, actions);

    if (this._lastResult && this._lastResult.recipeCode === recipe.code) {
      const banner = document.createElement("div");
      const res = this._lastResult;
      const tone = res.outcome === "MUTATED" ? "mutated" : res.outcome === "SUCCESS" ? "success" : "failed";
      banner.className = `alchemy-result-banner ${tone}`;
      banner.textContent = res.outcome === "MUTATED"
        ? `✨ ĐẠI THÀNH ĐỘT BIẾN! Luyện ra ${res.outputItemName || res.outputItemCode}!`
        : res.outcome === "SUCCESS"
          ? `🔥 Luyện thành công ${res.outputItemName || res.outputItemCode}!`
          : `💨 Nổ lò thất bại! Hao tổn nguyên liệu, ${res.costXu} Xu${res.costLinhThach ? ` & ${res.costLinhThach} Linh Thạch` : ""}.`;
      container.appendChild(banner);
    }
  },

  renderHistory(container) {
    if (!container) return;
    container.replaceChildren();
    if (this._loading && !this._history.length) {
      const empty = document.createElement("div");
      empty.className = "alchemy-empty";
      empty.textContent = "Đang tải lịch sử luyện đan...";
      container.appendChild(empty);
      return;
    }
    if (!this._history.length) {
      const empty = document.createElement("div");
      empty.className = "alchemy-empty";
      empty.textContent = "Chưa có lần khai lò nào.";
      container.appendChild(empty);
      return;
    }
    for (const row of this._history) {
      const card = document.createElement("div");
      card.className = `alchemy-history-row outcome-${String(row.outcome || "").toLowerCase()}`;
      const title = document.createElement("div");
      title.className = "alchemy-history-title";
      const badgeText = row.outcome === "MUTATED" ? "✨ ĐỘT BIẾN" : row.outcome === "SUCCESS" ? "✅ THÀNH CÔNG" : "💨 THẤT BẠI";
      title.textContent = `${badgeText} · ${row.recipeName || row.recipeCode}`;
      const meta = document.createElement("div");
      meta.className = "alchemy-history-meta";
      const outPart = row.outputItemName ? `Thu được: ${row.outputItemName}` : "Hao tổn nguyên liệu";
      const timePart = row.createdAt ? new Date(row.createdAt).toLocaleString("vi-VN") : "";
      meta.textContent = `${outPart} · Chi phí ${row.costXu} Xu${row.costLinhThach ? ` + ${row.costLinhThach} LT` : ""} · ${timePart}`;
      card.append(title, meta);
      container.appendChild(card);
    }
  },
};
