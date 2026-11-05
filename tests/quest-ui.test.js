"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "quest.js"), "utf8");

function createHarness({ get = async () => ({}), post = async () => ({}) } = {}) {
  const context = vm.createContext({
    API: { PATHS: { quests: {
      list: "/api/quests",
      accept: (id) => `/api/quests/${encodeURIComponent(id)}/accept`,
      track: (id) => `/api/quests/${encodeURIComponent(id)}/track`,
      claim: (id) => `/api/quests/${encodeURIComponent(id)}/claim`,
    } } },
    Net: { get, post, mutate: async (_method, url, body) => post(url, body) },
    Input: { keys: {} },
    S: { player: null },
    UI: { buildInv() {}, update() {} },
    document: {
      activeElement: null,
      querySelectorAll: () => [],
      getElementById: () => null,
      querySelector: () => null,
    },
  });
  vm.runInContext(`${source}\nglobalThis.__QuestUI = QuestUI;`, context, { filename: "quest.js" });
  return context.__QuestUI;
}

const initialSnapshot = {
  quests: [{ id: "first-journey", category: "main", title: "Hành trình", progress: 1, target: 3, status: "active", rewards: [] }],
  trackedId: "first-journey",
};

test("quest journal hydrates state from the authenticated API and keeps tracker selection", async () => {
  const questUI = createHarness({ get: async (url) => {
    assert.equal(url, "/api/quests");
    return initialSnapshot;
  } });

  await questUI.refresh();

  assert.equal(questUI.status, "ready");
  assert.equal(questUI.quests[0].progress, 1);
  assert.equal(questUI.trackedId, "first-journey");
});

test("accept sends an intent and adopts only the server response", async () => {
  const accepted = { ...initialSnapshot, quests: [{ ...initialSnapshot.quests[0], status: "active" }, { id: "spirit-stones", category: "daily", title: "Linh thạch", progress: 0, target: 3, status: "active", rewards: [] }], trackedId: "first-journey" };
  let request = null;
  const questUI = createHarness({ post: async (url, body) => {
    request = { url, body };
    return accepted;
  } });
  questUI.applySnapshot({ quests: [{ id: "spirit-stones", category: "daily", title: "Linh thạch", progress: 0, target: 3, status: "available", rewards: [] }], trackedId: null });
  questUI.selectedId = "spirit-stones";

  await questUI.acceptSelected();

  assert.equal(request.url, "/api/quests/spirit-stones/accept");
  assert.deepEqual(JSON.parse(JSON.stringify(request.body)), {});
  assert.equal(questUI.quests[1].status, "active");
  assert.equal(questUI.busy, false);
});

test("API failure preserves quest state and reports the error to the UI", async () => {
  const questUI = createHarness({ post: async () => ({ error: "Túi đồ không đủ chỗ nhận phần thưởng" }) });
  questUI.applySnapshot({ quests: [{ ...initialSnapshot.quests[0], status: "ready" }], trackedId: null });

  await questUI.claimSelected();

  assert.equal(questUI.quests[0].status, "ready");
  assert.match(questUI.message, /Túi đồ/);
  assert.equal(questUI.busy, false);
});
