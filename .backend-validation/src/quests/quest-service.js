const { DomainError } = require('../domain');
const { validateRequestId } = require('../inventory/inventory-service');
const { QUEST_DEFINITIONS } = require('./quest-catalog');

const QUEST_ID = /^[a-z0-9_-]{1,64}$/;
const EVENT_TYPES = new Set(['monster_kill', 'collect_item']);
const QUEST_CATEGORIES = new Set(['main', 'side', 'daily']);

function validateQuestDefinition(input, items) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_QUEST', 'Dữ liệu nhiệm vụ không hợp lệ', 400);
  const quest = structuredClone(input);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  if (typeof quest.id !== 'string' || !QUEST_ID.test(quest.id) || !QUEST_CATEGORIES.has(quest.category)
      || !String(quest.title || '').trim() || quest.title.length > 100
      || !String(quest.giver || '').trim() || quest.giver.length > 80
      || !String(quest.location || '').trim() || quest.location.length > 100
      || !String(quest.summary || '').trim() || quest.summary.length > 300
      || !String(quest.objective || '').trim() || quest.objective.length > 160
      || !integer(quest.target, 0, 1000000)
      || !integer(quest.initialProgress, 0, quest.target)
      || !['active', 'available'].includes(quest.initialStatus)
      || !EVENT_TYPES.has(quest.eventType)
      || !Array.isArray(quest.rewards) || quest.rewards.length > 8) {
    throw new DomainError('INVALID_QUEST', 'Thông tin nhiệm vụ không hợp lệ', 400);
  }
  if (quest.eventType === 'collect_item') {
    if (typeof quest.targetItemId !== 'string' || !items.some((item) => item.id === quest.targetItemId || item.maDo === quest.targetItemId)) {
      throw new DomainError('INVALID_QUEST_TARGET_ITEM', 'Vật phẩm mục tiêu không có trong danh mục', 400);
    }
  } else {
    delete quest.targetItemId;
  }
  for (const reward of quest.rewards) {
    if (!reward || !['xu', 'tuVi', 'item'].includes(reward.type)
        || !integer(reward.amount, 1, reward.type === 'item' ? 99 : 1000000000)
        || !String(reward.label || '').trim() || reward.label.length > 80) {
      throw new DomainError('INVALID_QUEST_REWARD', 'Phần thưởng nhiệm vụ không hợp lệ', 400);
    }
    if (reward.type === 'item' && (typeof reward.itemId !== 'string'
        || !items.some((item) => item.id === reward.itemId || item.maDo === reward.itemId))) {
      throw new DomainError('INVALID_QUEST_REWARD_ITEM', 'Vật phẩm phần thưởng không có trong danh mục', 400);
    }
  }
  return quest;
}

function createQuestService({ store, catalog, initialOverrides = [] }) {
  let definitions = QUEST_DEFINITIONS.map((quest) => structuredClone(quest));

  function applyOverrides(records) {
    const next = new Map(QUEST_DEFINITIONS.map((quest) => [quest.id, structuredClone(quest)]));
    for (const override of records || []) {
      if (!override || override.deleted) continue;
      try {
        const quest = validateQuestDefinition(override.data, catalog.listItems());
        if (quest.id === override.id) next.set(quest.id, quest);
      } catch {}
    }
    definitions = [...next.values()];
    return list();
  }

  function list() {
    return definitions.map((quest) => structuredClone(quest));
  }

  applyOverrides(initialOverrides);

  async function snapshot(userId) {
    return store.questSnapshot(userId, definitions);
  }

  async function mutate(userId, requestId, questId, action) {
    validateRequestId(requestId);
    if (!['accept', 'track', 'claim'].includes(action)) throw new DomainError('INVALID_QUEST_ACTION', 'Thao tác nhiệm vụ không hợp lệ');
    const result = await store.questAction(userId, requestId, String(questId || ''), action, definitions, catalog.listItems());
    return result.result;
  }

  async function applyEvent(userId, eventId, event) {
    validateRequestId(eventId);
    return (await store.applyQuestEvent(userId, eventId, event, definitions)).result;
  }

  return { snapshot, mutate, applyEvent, list, applyOverrides };
}

module.exports = { createQuestService, validateQuestDefinition };
