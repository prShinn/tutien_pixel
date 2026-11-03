"use strict";

const QUEST_DEFINITIONS = Object.freeze([
  {
    id: "first-journey",
    category: "main",
    title: "Lời dặn của Lão Tu Sĩ",
    giver: "Lão Tu Sĩ",
    location: "Bình Nguyên Hoang Dã",
    summary: "Rèn luyện bước đầu để chuẩn bị rời Thanh Vân Trấn.",
    objective: "Đánh bại yêu thú",
    target: 3,
    initialStatus: "active",
    initialProgress: 0,
    eventType: "monster_kill",
    rewards: [
      { type: "xu", amount: 50, icon: "icon-coins", label: "50 Xu" },
      { type: "tuVi", amount: 120, icon: "icon-lotus", label: "120 Tu Vi" },
    ],
  },
  {
    id: "plain-training",
    category: "side",
    title: "Thử sức ở Bình Nguyên",
    giver: "Lão Tu Sĩ",
    location: "Bình Nguyên Hoang Dã",
    summary: "Rèn luyện kỹ năng chiến đấu trước khi tiến sâu vào vùng hoang dã.",
    objective: "Đánh bại yêu thú",
    target: 5,
    initialStatus: "available",
    initialProgress: 0,
    eventType: "monster_kill",
    rewards: [
      { type: "xu", amount: 80, icon: "icon-coins", label: "80 Xu" },
      { type: "item", itemId: "STONE_LINH_NHO", amount: 1, icon: "icon-talisman", label: "1 Linh Thạch Nhỏ" },
    ],
  },
  {
    id: "spirit-stones",
    category: "daily",
    title: "Cơ duyên linh thạch",
    giver: "Chủ Tiệm",
    location: "Bình Nguyên Hoang Dã",
    summary: "Thu thập chiến lợi phẩm rơi trên đường để đổi lấy tài nguyên tu luyện.",
    objective: "Nhặt linh thạch nhỏ",
    target: 3,
    initialStatus: "available",
    initialProgress: 0,
    eventType: "collect_item",
    targetItemId: "STONE_LINH_NHO",
    rewards: [
      { type: "xu", amount: 60, icon: "icon-coins", label: "60 Xu" },
      { type: "item", itemId: "HUYET_NGOC_NHO", amount: 2, icon: "icon-potion-hp", label: "2 Huyết Ngọc Nhỏ" },
    ],
  },
]);

const QUEST_BY_ID = new Map(QUEST_DEFINITIONS.map((quest) => [quest.id, quest]));
const VALID_STATUSES = new Set(["available", "active", "ready", "completed"]);

function initialState() {
  return {
    version: 1,
    revision: 0,
    trackedId: "first-journey",
    quests: Object.fromEntries(QUEST_DEFINITIONS.map((quest) => [quest.id, {
      status: quest.initialStatus,
      progress: quest.initialProgress,
    }])),
  };
}

function ensureQuestState(player) {
  if (!player.questState || player.questState.version !== 1 || typeof player.questState.quests !== "object") {
    player.questState = initialState();
  }
  for (const definition of QUEST_DEFINITIONS) {
    const state = player.questState.quests[definition.id];
    if (!state || !VALID_STATUSES.has(state.status)) {
      player.questState.quests[definition.id] = { status: definition.initialStatus, progress: definition.initialProgress };
      continue;
    }
    state.progress = Math.max(0, Math.min(definition.target, Math.floor(Number(state.progress) || 0)));
    if (state.status === "active" && state.progress >= definition.target) state.status = "ready";
  }
  const revision = Number(player.questState.revision);
  player.questState.revision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
  if (player.questState.trackedId === undefined
    || (player.questState.trackedId !== null && (!QUEST_BY_ID.has(player.questState.trackedId)
      || player.questState.quests[player.questState.trackedId]?.status !== "active"))) {
    player.questState.trackedId = QUEST_DEFINITIONS.find((quest) => player.questState.quests[quest.id].status === "active")?.id || null;
  }
  return player.questState;
}

function snapshot(player) {
  const state = ensureQuestState(player);
  return {
    revision: state.revision,
    quests: QUEST_DEFINITIONS.map((definition) => ({
      id: definition.id,
      category: definition.category,
      title: definition.title,
      giver: definition.giver,
      location: definition.location,
      summary: definition.summary,
      objective: definition.objective,
      progress: state.quests[definition.id].progress,
      target: definition.target,
      status: state.quests[definition.id].status,
      rewards: definition.rewards.map(({ icon, label }) => ({ icon, label })),
    })),
    trackedId: state.trackedId,
  };
}

function accept(player, questId) {
  const definition = QUEST_BY_ID.get(String(questId || ""));
  if (!definition) return { ok: false, code: "QUEST_NOT_FOUND", message: "Nhiệm vụ không tồn tại" };
  const state = ensureQuestState(player);
  const quest = state.quests[definition.id];
  if (quest.status !== "available") return { ok: false, code: "QUEST_NOT_AVAILABLE", message: "Nhiệm vụ này không thể nhận" };
  quest.status = definition.target === 0 ? "ready" : "active";
  if (!state.trackedId && quest.status === "active") state.trackedId = definition.id;
  state.revision += 1;
  return { ok: true, ...snapshot(player) };
}

function track(player, questId) {
  const definition = QUEST_BY_ID.get(String(questId || ""));
  if (!definition) return { ok: false, code: "QUEST_NOT_FOUND", message: "Nhiệm vụ không tồn tại" };
  const state = ensureQuestState(player);
  if (state.quests[definition.id].status !== "active") {
    return { ok: false, code: "QUEST_NOT_ACTIVE", message: "Chỉ có thể theo dõi nhiệm vụ đang làm" };
  }
  state.trackedId = state.trackedId === definition.id ? null : definition.id;
  state.revision += 1;
  return { ok: true, ...snapshot(player) };
}

function applyEvent(player, event) {
  if (!event || typeof event !== "object") return false;
  const state = ensureQuestState(player);
  const amount = Math.max(1, Math.min(99, Math.floor(Number(event.count) || 1)));
  let changed = false;
  for (const definition of QUEST_DEFINITIONS) {
    const quest = state.quests[definition.id];
    if (quest.status !== "active" || definition.eventType !== event.type) continue;
    if (definition.targetItemId && String(event.itemId || "") !== definition.targetItemId) continue;
    quest.progress = Math.min(definition.target, quest.progress + amount);
    if (quest.progress >= definition.target) {
      quest.status = "ready";
      if (state.trackedId === definition.id) {
        state.trackedId = QUEST_DEFINITIONS.find((next) => state.quests[next.id].status === "active")?.id || null;
      }
    }
    changed = true;
  }
  if (changed) state.revision += 1;
  return changed;
}

function readInventory(player) {
  try {
    const inventory = typeof player.jsonIventory === "string"
      ? JSON.parse(player.jsonIventory || "[]")
      : player.inventory;
    return Array.isArray(inventory) ? inventory : [];
  } catch {
    return [];
  }
}

function claim(player, questId, itemCatalog) {
  const definition = QUEST_BY_ID.get(String(questId || ""));
  if (!definition) return { ok: false, code: "QUEST_NOT_FOUND", message: "Nhiệm vụ không tồn tại" };
  const state = ensureQuestState(player);
  const quest = state.quests[definition.id];
  if (quest.status !== "ready") return { ok: false, code: "QUEST_NOT_READY", message: "Chưa đủ điều kiện nhận thưởng" };

  const inventory = readInventory(player).map((item) => ({ ...item }));
  const grants = [];
  for (const reward of definition.rewards) {
    if (reward.type !== "item") continue;
    const item = itemCatalog.find((entry) => entry.id === reward.itemId);
    if (!item) return { ok: false, code: "QUEST_REWARD_INVALID", message: "Phần thưởng nhiệm vụ chưa được cấu hình" };
    const existing = inventory.find((entry) => entry.id === item.id);
    if (existing) {
      const nextCount = Number(existing.count || 0) + reward.amount;
      if (nextCount > 99) return { ok: false, code: "INVENTORY_FULL", message: "Túi đồ không đủ chỗ nhận phần thưởng" };
      existing.count = nextCount;
    } else {
      if (inventory.length >= 40 || reward.amount > 99) {
        return { ok: false, code: "INVENTORY_FULL", message: "Túi đồ không đủ chỗ nhận phần thưởng" };
      }
      inventory.push({ ...item, count: reward.amount, equipped: false });
    }
    grants.push({ itemId: item.id, name: item.name || item.id, count: reward.amount });
  }

  for (const reward of definition.rewards) {
    if (reward.type === "xu") player.xu = Math.max(0, Number(player.xu) || 0) + reward.amount;
    if (reward.type === "tuVi") player.tuViHienTai = Math.max(0, Number(player.tuViHienTai) || 0) + reward.amount;
  }
  player.inventory = inventory;
  player.jsonIventory = JSON.stringify(inventory);
  quest.status = "completed";
  if (state.trackedId === definition.id) {
    state.trackedId = QUEST_DEFINITIONS.find((next) => state.quests[next.id].status === "active")?.id || null;
  }
  state.revision += 1;
  return {
    ok: true,
    rewards: definition.rewards.map(({ type, itemId, amount, label }) => ({ type, itemId, amount, label })),
    grantedItems: grants,
    ...snapshot(player),
  };
}

module.exports = { QUEST_DEFINITIONS, snapshot, accept, track, applyEvent, claim, ensureQuestState };
