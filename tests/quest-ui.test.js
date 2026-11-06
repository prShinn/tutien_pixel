"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "quest.js"), "utf8");

function createHarness({ get = async () => ({}), post = async () => ({}), document: documentImpl = null } = {}) {
  const context = vm.createContext({
    API: { PATHS: { quests: {
      list: "/api/quests",
      accept: (id) => `/api/quests/${encodeURIComponent(id)}/accept`,
      track: (id) => `/api/quests/${encodeURIComponent(id)}/track`,
      claim: (id) => `/api/quests/${encodeURIComponent(id)}/claim`,
    } } },
    Net: { get, post, mutate: async (_method, url, body) => post(url, body) },
    Input: { keys: {}, stopMovement() {} },
    S: { player: null },
    UI: { buildInv() {}, update() {} },
    document: documentImpl || {
      activeElement: null,
      querySelectorAll: () => [],
      getElementById: () => null,
      querySelector: () => null,
    },
  });
  vm.runInContext(`${source}\nglobalThis.__QuestUI = QuestUI;`, context, { filename: "quest.js" });
  return context.__QuestUI;
}

function createTrackerDocument() {
  const makeNode = () => ({ textContent: "", className: "", title: "", style: {}, setAttribute() {}, focus() {} });
  const nodes = Object.fromEntries([
    "quest-active-count", "quest-tracker-title", "quest-tracker-state", "quest-tracker-objective",
    "quest-tracker-location", "quest-tracker-guide", "quest-tracker-count", "quest-tracker-fill",
    "quest-tracker-open-label",
  ].map((id) => [id, makeNode()]));
  const progress = makeNode();
  const openButton = makeNode();
  const closeButton = makeNode();
  const tracker = {
    style: { display: "none" },
    querySelector(selector) {
      return {
        ".quest-tracker-progress": progress,
        ".quest-tracker-open": openButton,
        ".quest-tracker-close": closeButton,
      }[selector] || null;
    },
  };
  const closeFocus = makeNode();
  const modal = {
    style: { display: "none" },
    addEventListener() {},
    querySelector(selector) { return selector === ".kpah-close-btn" ? closeFocus : null; },
  };
  nodes["quest-tracker"] = tracker;
  nodes["quest-modal"] = modal;
  return {
    nodes,
    progress,
    openButton,
    closeButton,
    modal,
    document: {
      activeElement: null,
      querySelectorAll: () => [],
      getElementById: (id) => nodes[id] || null,
      querySelector: () => null,
    },
  };
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

test("HUD keeps the main quest through reward-ready and points to the newly unlocked quest", async () => {
  const dom = createTrackerDocument();
  let requestUrl = "";
  const nextQuest = {
    id: "novice-02-plain-wolves", category: "main", title: "Dấu chân Bình Nguyên",
    giver: "Vệ Sĩ Tiền Trạm", location: "Bình Nguyên Hoang Dã",
    summary: "Qua cổng phía đông, rèn luyện giữa đồng hoang.",
    objective: "Đánh bại Hoang Sói", progress: 0, target: 5, status: "available", rewards: [],
  };
  const claimSnapshot = {
    revision: 3,
    trackedId: null,
    quests: [
      { id: "first-journey", category: "main", title: "Lời dặn của Lão Tu Sĩ", giver: "Lão Tu Sĩ", location: "Bình Nguyên Hoang Dã", summary: "Rèn luyện bước đầu.", objective: "Đánh bại yêu thú", progress: 3, target: 3, status: "completed", rewards: [] },
      nextQuest,
    ],
  };
  const questUI = createHarness({
    document: dom.document,
    post: async (url) => {
      requestUrl = url;
      return claimSnapshot;
    },
  });

  questUI.applySnapshot({
    revision: 1,
    trackedId: "first-journey",
    quests: [
      { id: "first-journey", category: "main", title: "Lời dặn của Lão Tu Sĩ", giver: "Lão Tu Sĩ", location: "Bình Nguyên Hoang Dã", summary: "Rèn luyện bước đầu.", objective: "Đánh bại yêu thú", progress: 0, target: 3, status: "active", rewards: [] },
      { ...nextQuest, status: "locked" },
    ],
  });
  assert.equal(dom.nodes["quest-tracker"].style.display, "flex");
  assert.equal(dom.nodes["quest-tracker-title"].textContent, "Lời dặn của Lão Tu Sĩ");
  assert.equal(dom.nodes["quest-tracker-location"].textContent, "KHU VỰC · Bình Nguyên Hoang Dã");
  assert.match(dom.nodes["quest-tracker-guide"].textContent, /NPC giao: Lão Tu Sĩ/);

  questUI.applySnapshot({
    revision: 2,
    trackedId: null,
    quests: [
      { id: "first-journey", category: "main", title: "Lời dặn của Lão Tu Sĩ", giver: "Lão Tu Sĩ", location: "Bình Nguyên Hoang Dã", summary: "Rèn luyện bước đầu.", objective: "Đánh bại yêu thú", progress: 3, target: 3, status: "ready", rewards: [] },
      { ...nextQuest, status: "locked" },
    ],
  });
  assert.equal(dom.nodes["quest-tracker-state"].textContent, "HOÀN TẤT · MỞ SỔ ĐỂ NHẬN THƯỞNG");
  assert.equal(dom.nodes["quest-tracker-open-label"].textContent, "MỞ ĐỂ NHẬN THƯỞNG");
  assert.equal(dom.nodes["quest-tracker-fill"].style.width, "100%");

  await questUI.claimSelected();

  assert.equal(requestUrl, "/api/quests/first-journey/claim");
  assert.equal(questUI.quests.find((quest) => quest.id === nextQuest.id).status, "available");
  assert.equal(questUI.selectedId, nextQuest.id);
  assert.equal(dom.nodes["quest-tracker-title"].textContent, "Dấu chân Bình Nguyên");
  assert.equal(dom.nodes["quest-tracker-state"].textContent, "NHIỆM VỤ MỚI · MỞ SỔ ĐỂ NHẬN");
  assert.equal(dom.nodes["quest-tracker-location"].textContent, "KHU VỰC · Bình Nguyên Hoang Dã");
  assert.equal(dom.progress.style.display, "none");

  questUI.openTrackerDetails();
  assert.equal(dom.modal.style.display, "flex");
  assert.equal(questUI.selectedId, nextQuest.id);
  if (questUI._loadPromise) await questUI._loadPromise;
});
