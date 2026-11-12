// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/hub.js
// Trung tâm Hộp Thư, Phúc Lợi (Điểm Danh 7 Ngày), Kỳ Trân Các & Biến Động Ví.
// ════════════════════════════════════════════════════════════════════════════════════════

const GameHub = {
  _mailItems: [],
  _mailCursor: null,
  _unclaimedMailCount: 0,
  _retention: null,
  _premiumItems: [],
  _ledgerItems: [],
  _ledgerCursor: null,
  _ledgerCurrency: "ALL",
  _activeTab: "checkin",
  _mailReqSeq: 0,
  _ledgerReqSeq: 0,
  _retentionReqSeq: 0,

  _reasonLabels: {
    REWARD: "Quà khởi tạo",
    BUY_ITEM: "Mua vật phẩm",
    SELL_ITEM: "Bán vật phẩm",
    QUEST_REWARD: "Thưởng nhiệm vụ",
    DEATH_PENALTY: "Lộ phí trọng thương",
    MAIL_CLAIM: "Nhận quà hộp thư",
    CHECKIN_REWARD: "Điểm danh 7 ngày",
    OFFLINE_CULTIVATION: "Bế quan tu luyện",
    ITEM_EXCHANGE: "Đổi ngân phiếu",
  },

  isMailOpen() {
    return document.getElementById("mail-modal")?.style.display === "flex";
  },

  isHubOpen() {
    return document.getElementById("hub-modal")?.style.display === "flex";
  },

  closeAll() {
    this.closeMail();
    this.closeHub();
  },

  async refreshSummary() {
    if (!authToken) return;
    const [mailRes, retentionRes] = await Promise.all([
      Net.get(`${API.PATHS.mail.list}?limit=1`).catch(() => null),
      Net.get(API.PATHS.retention.status).catch(() => null),
    ]);
    if (mailRes?.ok) {
      this._unclaimedMailCount = Math.max(0, Number(mailRes.unclaimedCount || 0));
      this._updateMailBadge();
    }
    if (retentionRes?.ok) {
      this._retention = retentionRes;
      this._updateHubBadge();
    }
  },

  _updateMailBadge() {
    const badge = document.getElementById("mail-badge");
    if (!badge) return;
    const count = Math.max(0, Number(this._unclaimedMailCount || 0));
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count < 1;
  },

  _updateHubBadge() {
    const badge = document.getElementById("hub-badge");
    if (!badge || !this._retention) return;
    badge.hidden = !Boolean(this._retention.checkin?.canClaimToday);
  },

  // ════ HỘP THƯ ════
  async openMail() {
    if (!authToken) return UI.notify("Hãy đăng nhập BE để mở hộp thư.", "warning");
    if (typeof Sound !== "undefined") Sound.play("click");
    const modal = document.getElementById("mail-modal");
    if (!modal) return;
    modal.style.display = "flex";
    await this.loadMail(true);
  },

  closeMail() {
    const modal = document.getElementById("mail-modal");
    if (modal) modal.style.display = "none";
  },

  async loadMail(reset = true) {
    const seq = ++this._mailReqSeq;
    const listEl = document.getElementById("mail-list");
    const moreBtn = document.getElementById("mail-load-more");
    if (reset) {
      this._mailItems = [];
      this._mailCursor = null;
      if (listEl) listEl.textContent = "Đang tải hộp thư...";
    }
    const query = new URLSearchParams({ limit: "20" });
    if (!reset && this._mailCursor) query.set("cursor", this._mailCursor);
    const res = await Net.get(`${API.PATHS.mail.list}?${query.toString()}`);
    if (seq !== this._mailReqSeq) return;
    if (!res?.ok) {
      if (listEl && reset) listEl.textContent = res?.error || "Không tải được hộp thư.";
      return;
    }
    this._unclaimedMailCount = Math.max(0, Number(res.unclaimedCount || 0));
    this._mailCursor = res.nextCursor || null;
    this._mailItems = reset ? (res.items || []) : [...this._mailItems, ...(res.items || [])];
    this._updateMailBadge();
    if (moreBtn) moreBtn.hidden = !this._mailCursor;
    this.renderMail();
  },

  renderMail() {
    const listEl = document.getElementById("mail-list");
    const countEl = document.getElementById("mail-unclaimed-label");
    if (countEl) countEl.textContent = `${this._unclaimedMailCount} thư chưa nhận quà`;
    if (!listEl) return;
    listEl.replaceChildren();
    if (!this._mailItems.length) {
      const empty = document.createElement("div");
      empty.className = "hub-empty";
      empty.textContent = "Hộp thư hiện đang trống.";
      listEl.appendChild(empty);
      return;
    }

    for (const mail of this._mailItems) {
      const card = document.createElement("article");
      card.className = `mail-card${mail.claimedAt ? " claimed" : ""}`;

      const top = document.createElement("div");
      top.className = "mail-card-top";
      const tag = document.createElement("span");
      tag.className = "hub-tag";
      tag.textContent = mail.sourceType || "SYSTEM";
      const title = document.createElement("strong");
      title.textContent = mail.title || "Thư hệ thống";
      const time = document.createElement("small");
      time.textContent = mail.createdAt ? new Date(mail.createdAt).toLocaleString("vi-VN") : "";
      top.append(tag, title, time);

      const body = document.createElement("p");
      body.className = "mail-card-body";
      body.textContent = mail.body || "";

      const attWrap = document.createElement("div");
      attWrap.className = "mail-attachments";
      const att = mail.attachments || {};
      if (Number(att.xu) > 0) attWrap.appendChild(this._pill(`🪙 +${Number(att.xu).toLocaleString()} Xu`));
      if (Number(att.linhThach) > 0) attWrap.appendChild(this._pill(`💠 +${Number(att.linhThach).toLocaleString()} Linh Thạch`, "premium"));
      if (Number(att.tuVi) > 0) attWrap.appendChild(this._pill(`✨ +${Number(att.tuVi).toLocaleString()} Tu Vi`));
      for (const entry of Array.isArray(att.items) ? att.items : []) {
        const def = CFG.ITEMS?.[entry.itemCode];
        attWrap.appendChild(this._pill(`${def?.icon || "📦"} ${def?.name || entry.itemCode} x${entry.quantity}`));
      }

      const actions = document.createElement("div");
      actions.className = "mail-card-actions";
      const claimBtn = document.createElement("button");
      claimBtn.type = "button";
      claimBtn.className = mail.claimedAt ? "sbtn hub-btn-muted" : "sbtn";
      claimBtn.disabled = Boolean(mail.claimedAt);
      claimBtn.textContent = mail.claimedAt ? "✓ Đã nhận" : "Nhận quà";
      claimBtn.onclick = async () => {
        claimBtn.disabled = true;
        try { await this.claimMail(mail.id); } finally {
          if (!mail.claimedAt) claimBtn.disabled = false;
        }
      };
      actions.appendChild(claimBtn);

      card.append(top, body);
      if (attWrap.childElementCount) card.appendChild(attWrap);
      card.appendChild(actions);
      listEl.appendChild(card);
    }
  },

  async claimMail(mailId) {
    if (!authToken) return;
    const res = await Net.mutate("POST", API.PATHS.mail.claim(mailId), {});
    if (!res?.player) {
      UI.notify(res?.error || "Không thể nhận quà thư.", "error");
      return;
    }
    Net.applyPlayerSnapshot(res.player, { render: false });
    UI.buildInv();
    UI.update();
    const r = res.result || {};
    const parts = [];
    if (r.xu > 0) parts.push(`+${r.xu} Xu`);
    if (r.linhThach > 0) parts.push(`+${r.linhThach} Linh Thạch`);
    if (r.tuVi > 0) parts.push(`+${r.tuVi} Tu Vi`);
    for (const item of r.grantedItems || []) parts.push(`${item.name || item.itemCode} x${item.quantity || item.count || 1}`);
    const summary = parts.length ? parts.join(", ") : "Đã nhận thư";
    UI.log(`✉️ Hộp thư: ${summary}`, "loot");
    UI.notify(`Nhận thư thành công: ${summary}`, "success");
    await this.loadMail(true);
  },

  // ════ PHÚC LỢI + KỲ TRÂN CÁC + VÍ ════
  async openHub(tab = "checkin") {
    if (!authToken) return UI.notify("Hãy đăng nhập BE để mở Tiên Duyên Các.", "warning");
    if (typeof Sound !== "undefined") Sound.play("click");
    const modal = document.getElementById("hub-modal");
    if (!modal) return;
    modal.style.display = "flex";
    await this.switchTab(tab);
  },

  closeHub() {
    const modal = document.getElementById("hub-modal");
    if (modal) modal.style.display = "none";
    if (this._cooldownTimer) {
      clearInterval(this._cooldownTimer);
      this._cooldownTimer = null;
    }
  },

  async switchTab(tab) {
    this._activeTab = ["checkin", "premium", "ledger"].includes(tab) ? tab : "checkin";
    for (const btn of document.querySelectorAll("[data-hub-tab]")) {
      const active = btn.getAttribute("data-hub-tab") === this._activeTab;
      btn.setAttribute("aria-selected", String(active));
      btn.classList.toggle("active", active);
    }
    for (const pane of document.querySelectorAll("[data-hub-pane]")) {
      const visible = pane.getAttribute("data-hub-pane") === this._activeTab;
      pane.hidden = !visible;
    }
    if (this._activeTab === "checkin") await this.loadRetention();
    if (this._activeTab === "premium") await this.loadPremiumShop();
    if (this._activeTab === "ledger") await this.loadLedger(true);
  },

  async loadRetention() {
    const seq = ++this._retentionReqSeq;
    const res = await Net.get(API.PATHS.retention.status);
    if (seq !== this._retentionReqSeq) return;
    if (!res?.ok) {
      UI.notify(res?.error || "Không tải được trạng thái phúc lợi.", "error");
      return;
    }
    this._retention = res;
    this._updateHubBadge();
    this.renderRetention();
  },

  renderRetention() {
    this.renderCheckinGrid();
  },

  renderCheckinGrid() {
    const data = this._retention?.checkin;
    const grid = document.getElementById("checkin-grid");
    const cycleLabel = document.getElementById("checkin-cycle-label");
    const btn = document.getElementById("checkin-claim-btn");
    if (!data || !grid) return;

    if (cycleLabel) cycleLabel.textContent = `Chu kỳ #${data.cycleNo || 1} · Reset 00:00 (UTC+7)`;
    grid.replaceChildren();
    for (const day of data.days || []) {
      const cell = document.createElement("div");
      const isNext = data.canClaimToday && data.nextDay === day.day;
      cell.className = `checkin-day${day.claimed ? " claimed" : ""}${isNext ? " today" : ""}`;
      const num = document.createElement("div");
      num.className = "checkin-day-no";
      num.textContent = `Ngày ${day.day}`;
      const reward = document.createElement("div");
      reward.className = "checkin-day-reward";
      reward.textContent = day.label || "";
      const state = document.createElement("div");
      state.className = "checkin-day-state";
      state.textContent = day.claimed ? "✓ Đã nhận" : (isNext ? "Có thể nhận" : "Chờ ngày");
      cell.append(num, reward, state);
      grid.appendChild(cell);
    }
    if (btn) {
      btn.disabled = !data.canClaimToday;
      btn.textContent = data.canClaimToday ? `✓ Điểm danh Ngày ${data.nextDay}` : "Hôm nay đã điểm danh";
    }
  },

  async claimCheckin() {
    if (!authToken) return;
    const btn = document.getElementById("checkin-claim-btn");
    if (btn) btn.disabled = true;
    try {
      const res = await Net.mutate("POST", API.PATHS.retention.checkinClaim, {});
      if (!res?.player) {
        UI.notify(res?.error || "Không thể điểm danh.", "error");
        return;
      }
      Net.applyPlayerSnapshot(res.player, { render: false });
      UI.buildInv();
      UI.update();
      const day = res.result?.day;
      UI.log(`📅 Điểm danh Ngày ${day} thành công!`, "loot");
      UI.notify(`Điểm danh Ngày ${day} thành công!`, "success");
      await this.loadRetention();
    } finally {
      if (btn) this.renderCheckinGrid();
    }
  },

  async loadPremiumShop() {
    const listEl = document.getElementById("premium-shop-list");
    const walletEl = document.getElementById("premium-wallet-lt");
    if (walletEl && S.player) walletEl.textContent = Math.floor(Number(S.player.linhThach || 0)).toLocaleString();
    if (listEl && !this._premiumItems.length) listEl.textContent = "Đang tải Kỳ Trân Các...";
    const res = await Net.get(API.PATHS.shop.premium);
    if (!res?.ok) {
      if (listEl) listEl.textContent = res?.error || "Không tải được Kỳ Trân Các.";
      return;
    }
    this._premiumItems = Array.isArray(res.items) ? res.items : [];
    this.renderPremiumShop();
  },

  renderPremiumShop() {
    const listEl = document.getElementById("premium-shop-list");
    const walletEl = document.getElementById("premium-wallet-lt");
    if (walletEl && S.player) walletEl.textContent = Math.floor(Number(S.player.linhThach || 0)).toLocaleString();
    if (!listEl) return;
    listEl.replaceChildren();
    if (!this._premiumItems.length) {
      const empty = document.createElement("div");
      empty.className = "hub-empty";
      empty.textContent = "Kỳ Trân Các hiện chưa bày bán vật phẩm.";
      listEl.appendChild(empty);
      return;
    }

    for (const item of this._premiumItems) {
      const row = document.createElement("div");
      row.className = "premium-item-card";

      const head = document.createElement("div");
      head.className = "premium-item-head";
      const icon = document.createElement("span");
      icon.className = "premium-item-icon";
      icon.textContent = item.icon || "💠";
      const titleWrap = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.name || item.tenDo || item.id;
      const desc = document.createElement("p");
      desc.textContent = item.moTa || item.description || "";
      titleWrap.append(name, desc);
      head.append(icon, titleWrap);

      const foot = document.createElement("div");
      foot.className = "premium-item-foot";
      const price = document.createElement("span");
      price.className = "premium-price";
      price.textContent = `💠 ${Number(item.giaMua || 0).toLocaleString()} Linh Thạch`;

      const qty = document.createElement("input");
      qty.type = "number";
      qty.min = "1";
      qty.max = "99";
      qty.step = "1";
      qty.value = "1";
      qty.className = "shop-quantity";
      qty.setAttribute("aria-label", `Số lượng ${item.name || item.id}`);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sbtn";
      btn.textContent = "Thỉnh về";
      btn.onclick = async () => {
        const count = Number(qty.value);
        if (!Number.isSafeInteger(count) || count < 1 || count > 99) {
          return UI.notify("Số lượng mua phải từ 1 đến 99.", "warning");
        }
        btn.disabled = true;
        try { await this.buyPremiumItem(item, count); } finally { btn.disabled = false; }
      };
      foot.append(price, qty, btn);
      row.append(head, foot);
      listEl.appendChild(row);
    }
  },

  async buyPremiumItem(item, quantity = 1) {
    if (!authToken || !item) return;
    const res = await Net.mutate("POST", API.PATHS.player.buy, { itemCode: item.id, quantity });
    if (!res?.player) {
      UI.notify(res?.error || "Không thể mua vật phẩm Kỳ Trân Các.", "error");
      return;
    }
    Net.applyPlayerSnapshot(res.player, { render: false });
    UI.buildInv();
    UI.update();
    const cost = res.result?.price ?? Number(item.giaMua || 0) * quantity;
    UI.log(`💠 Kỳ Trân Các: Thỉnh ${item.name || item.id} x${quantity} (-${cost} Linh Thạch)`, "loot");
    UI.notify(`Đã mua ${item.name || item.id} x${quantity}!`, "success");
    this.renderPremiumShop();
  },

  async loadLedger(reset = true, currency = this._ledgerCurrency) {
    const seq = ++this._ledgerReqSeq;
    this._ledgerCurrency = ["ALL", "XU", "LINH_THACH"].includes(currency) ? currency : "ALL";
    for (const btn of document.querySelectorAll("[data-ledger-currency]")) {
      const active = btn.getAttribute("data-ledger-currency") === this._ledgerCurrency;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    const listEl = document.getElementById("ledger-list");
    const moreBtn = document.getElementById("ledger-load-more");
    if (reset) {
      this._ledgerItems = [];
      this._ledgerCursor = null;
      if (listEl) listEl.textContent = "Đang tải sổ cái ví...";
    }
    const query = new URLSearchParams({ currency: this._ledgerCurrency, limit: "20" });
    if (!reset && this._ledgerCursor) query.set("cursor", this._ledgerCursor);
    const res = await Net.get(`${API.PATHS.player.walletLedger}?${query.toString()}`);
    if (seq !== this._ledgerReqSeq) return;
    if (!res?.ok) {
      if (listEl && reset) listEl.textContent = res?.error || "Không tải được lịch sử ví.";
      return;
    }
    this._ledgerCursor = res.nextCursor || null;
    this._ledgerItems = reset ? (res.items || []) : [...this._ledgerItems, ...(res.items || [])];
    if (moreBtn) moreBtn.hidden = !this._ledgerCursor;
    this.renderLedger(res.wallet);
  },

  renderLedger(wallet) {
    const listEl = document.getElementById("ledger-list");
    const walletSummary = document.getElementById("ledger-wallet-summary");
    if (walletSummary && wallet) {
      walletSummary.textContent = `Số dư hiện tại: ${Number(wallet.xu || 0).toLocaleString()} Xu · ${Number(wallet.linhThach || 0).toLocaleString()} Linh Thạch`;
    }
    if (!listEl) return;
    listEl.replaceChildren();
    if (!this._ledgerItems.length) {
      const empty = document.createElement("div");
      empty.className = "hub-empty";
      empty.textContent = "Chưa có giao dịch biến động ví.";
      listEl.appendChild(empty);
      return;
    }
    for (const entry of this._ledgerItems) {
      const row = document.createElement("div");
      row.className = "ledger-row";
      const reason = document.createElement("strong");
      reason.textContent = this._reasonLabels[entry.reason] || entry.reason;
      const amount = document.createElement("span");
      const sign = entry.amount >= 0 ? "+" : "";
      const unit = entry.currencyType === "LINH_THACH" ? "Linh Thạch" : "Xu";
      amount.className = `ledger-amt ${entry.amount >= 0 ? "pos" : "neg"}`;
      amount.textContent = `${sign}${Number(entry.amount || 0).toLocaleString()} ${unit}`;
      const bal = document.createElement("small");
      bal.textContent = `Sau GD: ${Number(entry.balanceAfter || 0).toLocaleString()} · ${entry.createdAt ? new Date(entry.createdAt).toLocaleString("vi-VN") : ""}`;
      row.append(reason, amount, bal);
      listEl.appendChild(row);
    }
  },

  _pill(text, variant = "") {
    const span = document.createElement("span");
    span.className = `hub-pill${variant ? ` hub-pill-${variant}` : ""}`;
    span.textContent = text;
    return span;
  },
};
