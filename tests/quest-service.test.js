"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { items } = require("../data/mock-data");
const QuestService = require("../game/quest-service");

function player(overrides = {}) {
  return {
    xu: 10,
    tuViHienTai: 4,
    inventory: [],
    jsonIventory: "[]",
    ...overrides,
  };
}

test("snapshot initializes server-owned quests and selects the initial active quest", () => {
  const character = player();
  const snapshot = QuestService.snapshot(character);

  assert.equal(snapshot.quests.length, 3);
  assert.equal(snapshot.trackedId, "first-journey");
  assert.equal(snapshot.quests[0].status, "active");
  assert.equal(snapshot.quests[0].progress, 0);
  assert.equal("eventType" in snapshot.quests[0], false);
});

test("accept validates state and tracking can be explicitly cleared", () => {
  const character = player();
  assert.equal(QuestService.accept(character, "missing").code, "QUEST_NOT_FOUND");
  assert.equal(QuestService.accept(character, "first-journey").code, "QUEST_NOT_AVAILABLE");
  assert.equal(QuestService.accept(character, "plain-training").ok, true);

  const tracked = QuestService.track(character, "first-journey");
  assert.equal(tracked.trackedId, null);
  assert.equal(QuestService.snapshot(character).trackedId, null);
});

test("authoritative kill events cap progress and complete only active kill quests", () => {
  const character = player();

  assert.equal(QuestService.applyEvent(character, { type: "monster_kill", count: 2 }), true);
  assert.equal(QuestService.snapshot(character).quests[0].progress, 2);
  assert.equal(QuestService.applyEvent(character, { type: "monster_kill", count: 9 }), true);

  const snapshot = QuestService.snapshot(character);
  assert.equal(snapshot.quests[0].progress, 3);
  assert.equal(snapshot.quests[0].status, "ready");
  assert.equal(snapshot.quests[1].progress, 0);
  assert.equal(snapshot.trackedId, null);
});

test("item collection advances only the matching accepted quest", () => {
  const character = player();
  assert.equal(QuestService.applyEvent(character, { type: "collect_item", itemId: "STONE_LINH_NHO", count: 3 }), false);
  assert.equal(QuestService.accept(character, "spirit-stones").ok, true);
  assert.equal(QuestService.applyEvent(character, { type: "collect_item", itemId: "HUYET_NGOC_NHO", count: 3 }), false);
  assert.equal(QuestService.applyEvent(character, { type: "collect_item", itemId: "STONE_LINH_NHO", count: 2 }), true);
  assert.equal(QuestService.snapshot(character).quests[2].status, "active");
  assert.equal(QuestService.applyEvent(character, { type: "collect_item", itemId: "STONE_LINH_NHO", count: 1 }), true);
  assert.equal(QuestService.snapshot(character).quests[2].status, "ready");
});

test("claim grants currency, cultivation and items once, then rejects duplicate claims", () => {
  const character = player();
  QuestService.applyEvent(character, { type: "monster_kill", count: 3 });

  const result = QuestService.claim(character, "first-journey", items);
  assert.equal(result.ok, true);
  assert.equal(character.xu, 60);
  assert.equal(character.tuViHienTai, 124);
  assert.equal(character.inventory.length, 0);
  assert.equal(QuestService.snapshot(character).quests[0].status, "completed");
  assert.equal(QuestService.claim(character, "first-journey", items).code, "QUEST_NOT_READY");
  assert.equal(character.xu, 60);

  QuestService.accept(character, "plain-training");
  QuestService.applyEvent(character, { type: "monster_kill", count: 5 });
  const itemReward = QuestService.claim(character, "plain-training", items);
  assert.equal(itemReward.ok, true);
  assert.equal(character.inventory[0].id, "STONE_LINH_NHO");
  assert.equal(character.inventory[0].count, 1);
  assert.equal(character.jsonIventory, JSON.stringify(character.inventory));
});

test("full inventory rejects claim without changing currency, quest status, or inventory", () => {
  const fullInventory = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, count: 1 }));
  const character = player({ inventory: fullInventory, jsonIventory: JSON.stringify(fullInventory), xu: 12 });
  QuestService.accept(character, "plain-training");
  QuestService.applyEvent(character, { type: "monster_kill", count: 5 });

  const result = QuestService.claim(character, "plain-training", items);
  assert.equal(result.code, "INVENTORY_FULL");
  assert.equal(character.xu, 12);
  assert.equal(character.inventory.length, 40);
  assert.equal(QuestService.snapshot(character).quests[1].status, "ready");
});
