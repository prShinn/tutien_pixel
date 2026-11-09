// Quest journal UI. Progress and rewards follow the API contract in live and mock modes.
const QuestUI = {
  filter: "all",
  selectedId: "first-journey",
  trackedId: null,
  dismissedTrackerQuestId: null,
  returnFocus: null,
  quests: [],
  revision: -1,
  status: "idle",
  message: (typeof MockBackend !== "undefined" && MockBackend?.enabled) ? "Dữ liệu nhiệm vụ mô phỏng được lưu trên trình duyệt." : "Nhiệm vụ được máy chủ xác nhận.",
  busy: false,
  _loadPromise: null,

  init() {
    if ((typeof MockBackend !== "undefined" && MockBackend?.enabled)) {
      window.addEventListener("mock-api:quest-state-changed", () => { void this.refresh(); });
    }
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

  openTrackerDetails() {
    const modal = document.getElementById("quest-modal");
    if (!modal) return;
    const quest = this.trackerQuest();
    if (quest) {
      this.selectedId = quest.id;
      this.filter = "all";
    }
    if (modal.style.display === "flex") {
      this.render();
      return;
    }
    this.toggle();
  },

  toggleCollapse() {
    const tracker = document.getElementById("quest-tracker");
    if (!tracker) return;
    const isCollapsed = tracker.classList.toggle("collapsed");
    const btn = document.getElementById("btn-quest-collapse");
    if (btn) btn.textContent = isCollapsed ? "+" : "−";
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
        this.message = (typeof MockBackend !== "undefined" && MockBackend?.enabled)
          ? "Tiến độ đã cập nhật trong dữ liệu mô phỏng trên trình duyệt."
          : "Tiến độ nhiệm vụ được cập nhật từ máy chủ.";
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
    const dismissedId = this.dismissedTrackerQuestId;
    const previousDismissedQuest = this.quests.find((quest) => quest.id === dismissedId);
    this.quests = snapshot.quests.filter((quest) => quest && typeof quest.id === "string");
    this.trackedId = typeof snapshot.trackedId === "string" ? snapshot.trackedId : null;
    if (dismissedId) {
      const updatedDismissedQuest = this.quests.find((quest) => quest.id === dismissedId);
      if (!previousDismissedQuest || !updatedDismissedQuest
          || previousDismissedQuest.status !== updatedDismissedQuest.status
          || this.trackedId) {
        this.dismissedTrackerQuestId = null;
      }
    }
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
      const result = await Net.mutate("POST", path, {});
      if (result?.error) throw new Error(result.error);
      const claimedQuest = action === "claim" ? this.quests.find((quest) => quest.id === questId) : null;
      this.applySnapshot(result);
      if (action === "claim" && claimedQuest?.category === "main") {
        const nextMainQuest = this.quests.find((quest) => quest.category === "main" && quest.status === "available");
        if (nextMainQuest) {
          this.selectedId = nextMainQuest.id;
          this.filter = "all";
        }
      }
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

  trackerQuest() {
    const visible = (quest) => quest && quest.id !== this.dismissedTrackerQuestId;
    const find = (predicate) => this.quests.find((quest) => visible(quest) && predicate(quest)) || null;
    const isTrackable = (quest) => quest.status === "active" || quest.status === "ready";

    return find((quest) => quest.category === "main" && quest.status === "ready")
      || find((quest) => quest.id === this.trackedId && quest.category === "main" && quest.status === "active")
      || find((quest) => quest.id === this.trackedId && isTrackable(quest))
      || find((quest) => quest.category === "main" && quest.status === "active")
      || find((quest) => quest.category === "main" && quest.status === "available")
      || find((quest) => quest.status === "ready")
      || find((quest) => quest.status === "active")
      || find((quest) => quest.status === "available");
  },

  renderTracker() {
    const tracker = document.getElementById("quest-tracker");
    const quest = this.trackerQuest();
    if (!tracker) return;
    if (!quest) {
      tracker.style.display = "none";
      return;
    }
    tracker.style.display = "flex";
    const title = document.getElementById("quest-tracker-title");
    const state = document.getElementById("quest-tracker-state");
    const objective = document.getElementById("quest-tracker-objective");
    const location = document.getElementById("quest-tracker-location");
    const guide = document.getElementById("quest-tracker-guide");
    const count = document.getElementById("quest-tracker-count");
    const fill = document.getElementById("quest-tracker-fill");
    const progressBar = tracker.querySelector(".quest-tracker-progress");
    const openButton = tracker.querySelector(".quest-tracker-open");
    const openLabel = document.getElementById("quest-tracker-open-label");
    const closeButton = tracker.querySelector(".quest-tracker-close");
    const progress = Math.max(0, Number(quest.progress) || 0);
    const target = Math.max(0, Number(quest.target) || 0);
    const isTrackedActive = quest.id === this.trackedId && quest.status === "active";
    const statusMessages = {
      active: "ĐANG THỰC HIỆN",
      ready: "HOÀN TẤT · MỞ SỔ ĐỂ NHẬN THƯỞNG",
      available: "NHIỆM VỤ MỚI · MỞ SỔ ĐỂ NHẬN",
    };
    const openLabels = {
      active: "CHI TIẾT",
      ready: "MỞ ĐỂ NHẬN THƯỞNG",
      available: "MỞ ĐỂ NHẬN NV",
    };
    if (title) title.textContent = quest.title;
    if (state) {
      state.className = `quest-tracker-state quest-tracker-state--${quest.status}`;
      state.textContent = statusMessages[quest.status] || "NHIỆM VỤ";
    }
    if (objective) objective.textContent = quest.objective;
    if (location) location.textContent = quest.location ? `KHU VỰC · ${quest.location}` : "KHU VỰC · Chưa xác định";
    if (guide) {
      const giver = quest.giver ? `NPC giao: ${quest.giver}. ` : "";
      guide.textContent = `${giver}${quest.summary || "Thực hiện mục tiêu để tiếp tục hành trình."}`;
    }
    if (count) {
      count.textContent = quest.status === "available"
        ? "Chưa nhận nhiệm vụ"
        : quest.status === "ready"
          ? `${progress} / ${target} · Đã đủ mục tiêu`
          : `${progress} / ${target}`;
    }
    if (progressBar) progressBar.style.display = quest.status === "available" ? "none" : "block";
    if (fill) {
      const ratio = quest.status === "ready" ? 100 : Math.min(100, Math.round((progress / Math.max(1, target)) * 100));
      fill.style.width = `${ratio}%`;
    }
    if (openLabel) openLabel.textContent = openLabels[quest.status] || "MỞ SỔ";
    if (openButton) openButton.title = quest.status === "ready"
      ? "Mở chi tiết quest để nhận thưởng"
      : quest.status === "available"
        ? "Mở chi tiết quest để nhận nhiệm vụ mới"
        : "Mở chi tiết nhiệm vụ đang làm";
    if (closeButton) closeButton.style.display = isTrackedActive ? "inline-flex" : "none";
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
    const statusLabels = { ready: "CÓ THỂ NHẬN", active: "ĐANG LÀM", available: "MỚI", locked: "CHƯA MỞ", completed: "HOÀN TẤT" };
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

    if (quest.status === "locked") {
      const lockedNote = document.createElement("p");
      lockedNote.className = "quest-locked-note";
      lockedNote.textContent = quest.requiresQuestTitle
        ? `Hoàn thành “${quest.requiresQuestTitle}” để mở nhiệm vụ này.`
        : "Hoàn thành nhiệm vụ trước để mở nhiệm vụ này.";
      objective.appendChild(lockedNote);
    }

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
    } else if (quest.status === "locked") {
      action.textContent = "Chưa mở khóa";
      action.disabled = true;
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

  async untrack() {
    const questId = this.trackedId;
    if (!questId || !this.quests.some((quest) => quest.id === questId && quest.status === "active")) return;
    this.dismissedTrackerQuestId = questId;
    await this.mutate("track", questId);
    if (this.trackedId === questId) this.dismissedTrackerQuestId = null;
    this.renderTracker();
  },
};

QuestUI.init();
