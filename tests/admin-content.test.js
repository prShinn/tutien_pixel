"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { items, skills } = require("../data/mock-data");
const ContentUtils = require("../public/admin/content-utils");
const ContentAdmin = require("../public/admin/content-manager");
const AdminContentService = require("../game/admin-content-service");
const adminHtml = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "index.html"), "utf8");
const adminScript = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "admin.js"), "utf8");

function apiConfig() {
  return {
    BASE: "http://game.test",
    PATHS: { admin: {
      content: (collection) => `/api/admin/content/${encodeURIComponent(collection)}`,
      contentItem: (collection, id) => `/api/admin/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    } },
  };
}

test("blank content records use collection templates and distinct identifier prefixes", () => {
  const item = ContentUtils.createBlankRecord("items", 123);
  const skill = ContentUtils.createBlankRecord("skills", 456, [{ id: 20 }, { id: "not-numeric" }]);
  const quest = ContentUtils.createBlankRecord("quests", 789);

  assert.equal(item.id, "ITEM_NEW_123");
  assert.equal(item.maDo, item.id);
  assert.equal(item.type, "MATERIAL");
  assert.equal(skill.id, 21);
  assert.equal(skill.code, "SKILL_21");
  assert.equal(skill.category, "ACTIVE");
  assert.match(quest.id, /^quest_new_789$/);
  assert.throws(() => ContentUtils.createBlankRecord("accounts"), /chưa hỗ trợ/);
});

test("content editor validates JSON and required display fields", () => {
  assert.throws(() => ContentUtils.parseRecord("{broken", "QUEST_1"), /JSON hợp lệ/);
  assert.throws(() => ContentUtils.parseRecord("[]", "QUEST_1"), /đối tượng JSON/);
  assert.throws(() => ContentUtils.parseRecord('{"name":""}', "QUEST_1"), /tên hiển thị/);
  assert.throws(() => ContentUtils.parseRecord('{"name":"Quest"}', "bad id"), /Mã bản ghi/);
  assert.throws(() => ContentUtils.parseRecord('{"name":"Quest","nested":{"constructor":{}}}', "QUEST_1"), /không được hỗ trợ/);
  assert.throws(() => ContentUtils.parseRecord('{"name":"Item","maDo":"","type":"MATERIAL"}', "ITEM_1", null, "items"), /Mã vật phẩm/);
  assert.equal(ContentUtils.parseRecord('{"name":"Item","maDo":"OTHER","type":"MATERIAL"}', "ITEM_1", null, "items").maDo, "OTHER");
  assert.throws(() => ContentUtils.parseRecord('{"name":"Item","maDo":"ITEM_1","type":"UNKNOWN"}', "ITEM_1", null, "items"), /Loại vật phẩm/);
  assert.throws(() => ContentUtils.parseRecord('{"name":"Skill","linhCan":"KIM"}', "1", null, "skills"), /mã code/);
  assert.throws(() => ContentUtils.parseRecord('{"name":"Skill","code":"S_1","linhCan":"KIM","tier":1.5}', "1", null, "skills"), /số nguyên/);
});

test("content editor strips server metadata and keeps the record id immutable on update", () => {
  const created = ContentUtils.parseRecord('{"id":"spoofed","name":"Vật phẩm","updatedAt":"old","giaMua":10}', "ITEM_NHO");
  const updated = ContentUtils.parseRecord('{"id":"changed","name":"Quest mới","updatedAt":"old","target":3}', "ignored", "Quest_One");

  assert.equal(created.id, "ITEM_NHO");
  assert.equal("updatedAt" in created, false);
  assert.equal(updated.id, "Quest_One");
  assert.equal("updatedAt" in updated, false);
});

test("server content validation protects item and skill fields and detects duplicate gameplay codes", () => {
  const items = [{ id: "STONE_A", maDo: "STONE_A", name: "Đá", type: "STONE" }];
  const skills = [{ id: 1, code: "FIRE_1", name: "Hỏa", linhCan: "HOA" }];
  const validItem = { id: "STONE_B", maDo: "STONE_B", name: "Ngọc", type: "STONE", giaMua: 10 };

  assert.equal(AdminContentService.validateRecord("items", validItem), null);
  assert.equal(AdminContentService.validateRecord("items", { ...validItem, maDo: "OTHER" }), null);
  assert.match(AdminContentService.validateRecord("items", { ...validItem, maDo: "bad code" }), /mã hợp lệ/);
  assert.match(AdminContentService.validateRecord("items", { ...validItem, giaMua: -1 }), /số không âm/);
  assert.match(AdminContentService.validateRecord("items", { ...validItem, type: "UNKNOWN" }), /không được hỗ trợ/);
  const validEquipment = { id: "SWORD_B", maDo: "SWORD_B", name: "Kiếm", type: "EQUIPMENT", requiredRealmStt: 1 };
  assert.equal(AdminContentService.validateRecord("items", validEquipment), null);
  assert.match(AdminContentService.validateRecord("items", { ...validEquipment, requiredRealmStt: 1.5 }), /số nguyên/);
  assert.match(AdminContentService.validateRecord("items", { ...validEquipment, requiredRealmStt: 0 }), /số nguyên/);
  assert.match(AdminContentService.validateRecord("items", { ...validEquipment, requiredRealmStt: undefined }), /cần requiredRealmStt/);
  assert.match(AdminContentService.validateRecord("skills", { id: 2, name: "Skill", linhCan: "HOA" }), /mã code/);
  assert.match(AdminContentService.validateRecord("skills", { id: 2, name: "Skill", code: "SKILL_2", linhCan: "HOA", tier: 1.5 }), /số nguyên/);
  assert.equal(AdminContentService.hasDuplicate(items, "items", { ...validItem, id: "STONE_A", maDo: "STONE_A" }), true);
  assert.equal(AdminContentService.hasDuplicate(skills, "skills", { id: 2, code: "fire_1" }), true);
  assert.equal(AdminContentService.validateRecord("accounts", { id: "1", name: "Account" }), "Collection này chỉ cho phép xem");
});

test("server content rules accept every shipped item and skill catalog record", () => {
  assert.equal(items.filter((item) => AdminContentService.validateRecord("items", item)).length, 0);
  assert.equal(skills.filter((skill) => AdminContentService.validateRecord("skills", skill)).length, 0);
});

test("monster catalog records remain editable with gameplay-safe identifiers and combat fields", () => {
  const monster = { id: "WOLF_A", code: "WOLF_A", name: "Lang Xám", type: "NORMAL", linhCan: "KIM", level: 2, hp: 40, maxHp: 50, atk: 8, def: 2, speed: 1, respawnMs: 10000, img: "./assets/monsters/wolf.png" };
  assert.equal(ContentAdmin.EDITABLE_COLLECTIONS.has("monsters"), true);
  assert.equal(ContentUtils.parseRecord(JSON.stringify(monster), monster.id, null, "monsters").img, monster.img);
  assert.equal(AdminContentService.validateRecord("monsters", monster), null);
  assert.match(AdminContentService.validateRecord("monsters", { ...monster, code: "OTHER" }), /trùng code/);
});

test("content search and summaries safely format structured values", () => {
  const records = [{ id: "ITEM_A", name: "Thảo dược", stats: { hp: 10 } }, { id: "SKILL_B", name: "Hỏa Cầu" }];

  assert.deepEqual(ContentUtils.filterRecords(records, "hỏa"), [records[1]]);
  assert.equal(ContentUtils.summarizeRecord(records[0])[1].value, '{"hp":10}');
  assert.equal(ContentUtils.escapeHtml('<img src="x" onerror="1">'), "&lt;img src=&quot;x&quot; onerror=&quot;1&quot;&gt;");
});

test("content manager sends create, update and delete requests with safe IDs", async () => {
  const requests = [];
  const controller = ContentAdmin.createController({
    api: apiConfig(),
    adminHeaders: () => ({ Authorization: "Bearer test-token" }),
    getJson: async (url, options = {}) => {
      requests.push({ url, options });
      return { demo: false, persisted: true, data: JSON.parse(options.body || "null") };
    },
  });

  await controller.save("items", { id: "ITEM_NHO", json: '{"name":"Linh thạch","maDo":"ITEM_NHO","type":"STONE"}' });
  await controller.save("quests", { id: "ignored", existingId: "quest_one", json: '{"title":"Nhiệm vụ mới","category":"side","giver":"Lão Tu Sĩ","location":"Bình Nguyên Hoang Dã","summary":"Mô tả","objective":"Đánh bại yêu thú","target":1,"eventType":"monster_kill","initialStatus":"available","initialProgress":0,"rewards":[],"id":"tampered"}' });
  await controller.remove("skills", "SKILL/1");
  await assert.rejects(controller.remove("monsters", "WOLF_A"), /Xóa quest hoặc quái/);

  assert.equal(requests[0].url, "http://game.test/api/admin/content/items");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(JSON.parse(requests[0].options.body).id, "ITEM_NHO");
  assert.equal(JSON.parse(requests[0].options.body).updatedAt, undefined);
  assert.equal(requests[1].url, "http://game.test/api/admin/content/quests/quest_one");
  assert.equal(requests[1].options.method, "PUT");
  assert.equal(JSON.parse(requests[1].options.body).id, "quest_one");
  assert.equal(requests[2].url, "http://game.test/api/admin/content/skills/SKILL%2F1");
  assert.equal(requests[2].options.method, "DELETE");
  await assert.rejects(controller.remove("accounts", "1"), /chỉ cho phép xem/);
});

test("Admin shell loads the tested editor controller and exposes accessible CRUD controls", () => {
  assert.ok(adminHtml.indexOf("content-utils.js") < adminHtml.indexOf("content-manager.js"));
  assert.ok(adminHtml.indexOf("content-manager.js") < adminHtml.indexOf('src="/admin/admin.js'));
  assert.match(adminHtml, /Bãi quái theo map/);
  assert.match(adminHtml, /NPC theo bản đồ/);
  assert.match(adminHtml, /id="content-editor-dialog"[^>]*aria-labelledby/);
  assert.match(adminHtml, /id="content-record-json"[^>]*spellcheck="false"/);
  assert.match(adminScript, /data-content-action="edit"/);
  assert.match(adminScript, /data-content-action="delete"/);
  assert.match(adminScript, /content-editor-form"\)\.addEventListener\("submit"/);
});
