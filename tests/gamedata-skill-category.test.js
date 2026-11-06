"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "gamedata.js"), "utf8");

test("game data keeps passive category and modifiers for skill VFX lookup", async () => {
  const CFG = { SKILLS: {} };
  const skills = [
    {
      code: "LOI_TAM_PHAP",
      name: "Lôi Thể Chi Pháp",
      linhCan: "LOI",
      tier: 1,
      category: "PASSIVE",
      effect: "passive",
      passiveModifiers: { skillDamagePct: 0.003 },
    },
    { code: "MOC_TAM_PHAP", name: "Mộc Tâm Pháp", linhCan: "MOC", tier: 1, effect: "passive" },
    { code: "LOI_HO", name: "Lôi Hộ", linhCan: "LOI", tier: 1, category: "ACTIVE", effect: "shield" },
  ];
  const context = vm.createContext({
    API: { BASE: "http://localhost", PATHS: { data: { skills: "/api/skills" } } },
    AbortSignal: { timeout: () => ({}) },
    CFG,
    fetch: async () => ({ ok: true, json: async () => skills }),
    console: { info() {}, warn() {} },
  });
  vm.runInContext(`${source}\nglobalThis.__GameData = GameData;`, context, { filename: "gamedata.js" });

  await context.__GameData.loadSkills();

  const loaded = Object.values(CFG.SKILLS).flat(2);
  const passive = loaded.find((skill) => skill.id === "LOI_TAM_PHAP");
  const inferredPassive = loaded.find((skill) => skill.id === "MOC_TAM_PHAP");
  const active = loaded.find((skill) => skill.id === "LOI_HO");
  assert.equal(passive.category, "PASSIVE");
  assert.equal(passive.passiveModifiers.skillDamagePct, 0.003);
  assert.equal(inferredPassive.category, "PASSIVE");
  assert.equal(active.category, "ACTIVE");
});

test("game data loads the shared monster catalog and keeps the last good values on an empty response", async () => {
  const CFG = { MONSTERS: [], MON_RESPAWN: 420 };
  const monsters = [{ id: "WOLF_A", code: "WOLF_A", name: "Lang Xám", hp: 80, maxHp: 100, atk: 12, img: "./assets/monsters/wolf.png" }];
  let response = monsters;
  const context = vm.createContext({
    API: { BASE: "http://localhost", PATHS: { data: { monsters: "/api/monsters" } } },
    AbortSignal: { timeout: () => ({}) },
    CFG,
    fetch: async () => ({ ok: true, json: async () => response }),
    console: { info() {}, warn() {} },
  });
  vm.runInContext(`${source}\nglobalThis.__GameData = GameData;`, context, { filename: "gamedata.js" });

  await context.__GameData.loadMonsters();
  assert.equal(CFG.MONSTERS.length, 1);
  assert.equal(CFG.MONSTERS[0].id, "WOLF_A");
  assert.equal(CFG.MONSTERS[0].maxHp, 100);
  assert.equal(CFG.MONSTERS[0].respawnMs, 420000);

  response = [];
  await context.__GameData.loadMonsters();
  assert.equal(CFG.MONSTERS.length, 1, "a temporary empty response must not clear the last valid catalog");
});
