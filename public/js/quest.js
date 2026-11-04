// Quest journal UI. Progress and rewards are owned by the authenticated server.
const QuestUI = {
  filter: "all",
  selectedId: "first-journey",
  trackedId: null,
  returnFocus: null,
  quests: [],
  revision: -1,
  status: "idle",
  message: "Nhiệm vụ được máy chủ xác nhận.",
  busy: false,
  _loadPromise: null,

  init() {
    document.querySelectorAll("[data-quest-filter]").forEach((button) => {
      button.addEventListener("click", () => this.setFilter(button.dataset.questFilter));
    });
    const modal = document.getElementById("quest-modal");
    modal?.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...modal.querySelectorAll("button:not(:disabled)")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) this.close();
    });
  },

  toggle() {
    const modal = document.getElementById("quest-modal");
    if (!modal) return;
    const opening = modal.style.display !== "flex";
    if (!opening) {
      this.close();
      return;
    }
    this.returnFocus = document.activeElement;
    modal.style.display = "flex";
    Input.stopMovement();
    this.render();
    modal.querySelector(".kpah-close-btn")?.focus();
    void this.refresh();
  },

  close() {
    const modal = document.getElementById("quest-modal");
    if (modal) modal.style.display = "none";
    if (this.returnFocus?.isConnected && !modal?.contains(this.returnFocus)) this.returnFocus.focus();
    this.returnFocus = null;
  },

  async refresh() {
    if (this._loadPromise) return this._loadPromise;
    this.status = "loading";
    this.message = "Đang tải nhiệm vụ…";
    this.render();
    this._loadPromise = (async () => {
      try {
        const snapshot = await Net.get(API.PATHS.quests.list);
        if (snapshot?.error) throw new Error(snapshot.error);
        this.applySnapshot(snapshot);
        this.message = "Tiến độ nhiệm vụ được cập nhật từ máy chủ.";
      } catch (error) {
        this.status = "error";
        this.message = error?.message || "Không tải được nhiệm vụ. Vui lòng thử lại.";
        this.render();
      } finally {
        this._loadPromise = null;
      }
    })();
    return this._loadPromise;
  },

  applySnapshot(snapshot) {
    if (!Array.isArray(snapshot?.quests)) return;
    const revision = Number(snapshot.revision);
    if (Number.isFinite(revision) && revision < this.revision) return;
    if (Number.isFinite(revision)) this.revision = revision;
    this.quests = snapshot.quests.filter((quest) => quest && typeof quest.id === "string");
    this.trackedId = typeof snapshot.trackedId === "string" ? snapshot.trackedId : null;
    if (!this.quests.some((quest) => quest.id === this.selectedId)) {
      this.selectedId = this.quests[0]?.id || null;
    }
    this.status = "ready";
    this.render();
  },

  syncPlayer(player) {
    if (!S.player || !player) return;
    if (typeof player.xu === "number") S.player.xu = player.xu;
    if (typeof player.tuViHienTai === "number") S.player.tuViHienTai = player.tuViHienTai;
    if (Array.isArray(player.inventory)) S.inventory = player.inventory;
    if (typeof UI !== "undefined") {
      UI.buildInv();
      UI.update();
    }
  },

  async mutate(action, questId) {
    if (this.busy || !questId) return;
    this.busy = true;
    this.message = "Đang cập nhật nhiệm vụ…";
    this.render();
    try {
      const path = action === "accept"
        ? API.PATHS.quests.accept(questId)
        : action === "claim"
          ? API.PATHS.quests.claim(questId)
          : API.PATHS.quests.track(questId);
      const result = await Net.post(path, {});
      if (result?.error) throw new Error(result.error);
      this.applySnapshot(result);
      this.syncPlayer(result.player);
      this.message = action === "claim"
        ? "Đã nhận phần thưởng nhiệm vụ."
        : action === "accept"
          ? "Đã nhận nhiệm vụ."
          : "Đã cập nhật nhiệm vụ theo dõi.";
    } catch (error) {
      this.message = error?.message || "Không thể cập nhật nhiệm vụ. Vui lòng thử lại.";
    } finally {
      this.busy = false;
      this.render();
    }
  },

  setFilter(filter) {
    if (!["all", "main", "side", "daily"].includes(filter)) return;
    this.filter = filter;
    this.render();
  },

  select(id) {
    if (!this.quests.some((quest) => quest.id === id)) return;
    this.selectedId = id;
    this.render();
    document.querySelector(".quest-card.is-selected")?.focus();
  },

  selectedQuest() {
    return this.quests.find((quest) => quest.id === this.selectedId) || null;
  },

  filteredQuests() {
    return this.filter === "all"
      ? this.quests
      : this.quests.filter((quest) => quest.category === this.filter);
  },

  render() {
    this.renderSummary();
    this.renderList();
    this.renderDetail();
    this.renderTracker();
    const note = document.getElementById("quest-demo-note");
    if (note) note.textContent = this.message;
    document.querySelectorAll("[data-quest-filter]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.questFilter === this.filter));
    });
  },

  renderSummary() {
    const count = this.quests.filter((quest) => quest.status === "active" || quest.status === "ready").length;
    const countEl = document.getElementById("quest-active-count");
    if (countEl) countEl.textContent = String(count);
  },

  renderTracker() {
    const tracker = document.getElementById("quest-tracker");
    const quest = this.quests.find((entry) => entry.id === this.trackedId && entry.status === "active");
    if (!tracker) return;
    if (!quest) {
      tracker.style.display = "none";
      return;
    }
    tracker.style.display = "flex";
    const title = document.getElementById("quest-tracker-title");
    const objective = document.getElementById("quest-tracker-objective");
    const count = document.getElementById("quest-tracker-count");
    const fill = document.getElementById("quest-tracker-fill");
    if (title) title.textContent = quest.title;
    if (objective) objective.textContent = quest.objective;
    if (count) count.textContent = `${quest.progress} / ${quest.target}`;
    if (fill) fill.style.width = `${Math.min(100, Math.round((quest.progress / Math.max(1, quest.target)) * 100))}%`;
  },

  renderList() {
    const host = document.getElementById("quest-list");
    if (!host) return;
    if (this.status === "loading" && !this.quests.length) {
      const loading = document.createElement("p");
      loading.className = "quest-empty";
      loading.textContent = "Đang tải nhật ký nhiệm vụ…";
      host.replaceChildren(loading);
      return;
    }
    if (this.status === "error" && !this.quests.length) {
      const empty = document.createElement("div");
      empty.className = "quest-empty";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "quest-action";
      retry.textContent = "Tải lại";
      retry.addEventListener("click", () => this.refresh());
      empty.append(document.createTextNode("Chưa thể tải nhiệm vụ. "), retry);
      host.replaceChildren(empty);
      return;
    }
    const categoryLabels = { main: "CHÍNH TUYẾN", side: "PHỤ TUYẾN", daily: "HẰNG NGÀY" };
    const statusLabels = { ready: "CÓ THỂ NHẬN", active: "ĐANG LÀM", available: "MỚI", completed: "HOÀN TẤT" };
    const quests = this.filteredQuests();
    if (!quests.length) {
      const empty = document.createElement("p");
      empty.className = "quest-empty";
      empty.textContent = this.quests.length ? "Chưa có nhiệm vụ trong mục này." : "Nhân vật chưa có nhiệm vụ.";
      host.replaceChildren(empty);
      return;
    }
    const cards = quests.map((quest) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `quest-card quest-card--${quest.status}${quest.id === this.selectedId ? " is-selected" : ""}`;
      card.dataset.questId = quest.id;
      card.setAttribute("aria-pressed", String(quest.id === this.selectedId));
      card.addEventListener("click", () => this.select(quest.id));
      const eyebrow = document.createElement("span");
      eyebrow.className = "quest-card-type";
      eyebrow.textContent = categoryLabels[quest.category] || "NHIỆM VỤ";
      const title = document.createElement("strong");
      title.textContent = quest.title;
      const status = document.createElement("span");
      status.className = `quest-card-status quest-status--${quest.status}`;
      status.textContent = statusLabels[quest.status] || "NHIỆM VỤ";
      const progress = document.createElement("span");
      progress.className = "quest-card-progress";
      progress.textContent = `${quest.objective} · ${quest.progress}/${quest.target}`;
      card.append(eyebrow, title, status, progress);
      if (quest.id === this.trackedId) card.classList.add("is-tracked");
      return card;
    });
    host.replaceChildren(...cards);
  },

  renderDetail() {
    const host = document.getElementById("quest-detail");
    if (!host) return;
    const quest = this.selectedQuest();
    if (!quest) {
      const empty = document.createElement("div");
      empty.className = "quest-detail-empty";
      empty.textContent = this.status === "error" ? this.message : "Chọn một nhiệm vụ để xem chi tiết.";
      host.replaceChildren(empty);
      return;
    }
    const categoryLabels = { main: "CHÍNH TUYẾN", side: "PHỤ TUYẾN", daily: "HẰNG NGÀY" };
    const header = document.createElement("div");
    header.className = "quest-detail-heading";
    const category = document.createElement("span");
    category.className = "quest-card-type";
    category.textContent = categoryLabels[quest.category] || "NHIỆM VỤ";
    const title = document.createElement("h3");
    title.textContent = quest.title;
    const summary = document.createElement("p");
    summary.className = "quest-summary";
    summary.textContent = quest.summary;
    header.append(category, title, summary);

    const metadata = document.createElement("div");
    metadata.className = "quest-metadata";
    metadata.append(this.makeMeta("NGƯỜI GIAO", quest.giver), this.makeMeta("KHU VỰC", quest.location));

    const objective = document.createElement("section");
    objective.className = "quest-objective";
    const objectiveHeading = document.createElement("div");
    objectiveHeading.className = "quest-section-heading";
    const objectiveTitle = document.createElement("strong");
    objectiveTitle.textContent = "MỤC TIÊU";
    const counter = document.createElement("span");
    counter.textContent = `${quest.progress} / ${quest.target}`;
    objectiveHeading.append(objectiveTitle, counter);
    const objectiveText = document.createElement("p");
    objectiveText.textContent = quest.objective;
    const progress = document.createElement("div");
    progress.className = "quest-progress-track";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", quest.objective);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", String(quest.target));
    progress.setAttribute("aria-valuenow", String(quest.progress));
    const fill = document.createElement("span");
    fill.className = "quest-progress-fill";
    fill.style.width = `${Math.min(100, Math.round((quest.progress / Math.max(1, quest.target)) * 100))}%`;
    progress.appendChild(fill);
    objective.append(objectiveHeading, objectiveText, progress);

    const rewardSection = document.createElement("section");
    rewardSection.className = "quest-reward-section";
    const rewardHeading = document.createElement("div");
    rewardHeading.className = "quest-section-heading";
    rewardHeading.textContent = "PHẦN THƯỞNG";
    const rewards = document.createElement("div");
    rewards.className = "quest-rewards";
    (quest.rewards || []).forEach((reward) => {
      const item = document.createElement("div");
      item.className = "quest-reward";
      const icon = document.createElement("span");
      icon.className = `pixel-icon ${reward.icon || "icon-bag"}`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = reward.label || "Phần thưởng";
      item.append(icon, label);
      rewards.appendChild(item);
    });
    rewardSection.append(rewardHeading, rewards);

    const action = document.createElement("button");
    action.type = "button";
    action.className = "quest-action";
    action.disabled = this.busy;
    if (this.busy) action.textContent = "Đang xử lý…";
    else if (quest.status === "available") {
      action.textContent = "Nhận nhiệm vụ";
      action.addEventListener("click", () => this.acceptSelected());
    } else if (quest.status === "ready") {
      action.textContent = "Nhận thưởng";
      action.addEventListener("click", () => this.claimSelected());
    } else if (quest.status === "active") {
      action.textContent = quest.id === this.trackedId ? "Bỏ theo dõi" : "Theo dõi nhiệm vụ";
      action.setAttribute("aria-pressed", String(quest.id === this.trackedId));
      action.addEventListener("click", () => this.toggleTrack());
    } else {
      action.textContent = "Đã hoàn tất";
      action.disabled = true;
    }

    const footer = document.createElement("div");
    footer.className = "quest-detail-footer";
    footer.appendChild(action);
    host.replaceChildren(header, metadata, objective, rewardSection, footer);
  },

  makeMeta(label, value) {
    const block = document.createElement("div");
    block.className = "quest-meta-block";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value || "—";
    block.append(labelEl, valueEl);
    return block;
  },

  acceptSelected() {
    const quest = this.selectedQuest();
    if (!quest || quest.status !== "available") return;
    return this.mutate("accept", quest.id);
  },

  claimSelected() {
    const quest = this.selectedQuest();
    if (!quest || quest.status !== "ready") return;
    return this.mutate("claim", quest.id);
  },

  toggleTrack() {
    const quest = this.selectedQuest();
    if (!quest || quest.status !== "active") return;
    return this.mutate("track", quest.id);
  },

  untrack() {
    if (!this.trackedId) return;
    return this.mutate("track", this.trackedId);
  },
};

QuestUI.init();
