"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSupportSkillVisual, publishSupportSkill } = require("../socket/skill-visual-event");

test("support visual event contains bounded presentation fields and omits private player state", () => {
  const result = buildSupportSkillVisual("socket-7", {
    skillCode: "MOC_DUONG",
    skillName: "Mộc Dưỡng",
    effect: "heal",
    effectVal: 22,
    effectDurationMs: 5000,
    hp: 100,
    mp: 43,
    buffs: { private: true },
  });

  assert.deepEqual(result, {
    playerId: "socket-7",
    skillCode: "MOC_DUONG",
    skillName: "Mộc Dưỡng",
    effect: "heal",
    effectVal: 22,
    effectDurationMs: 5000,
  });
  assert.equal("hp" in result, false);
  assert.equal("mp" in result, false);
  assert.equal("buffs" in result, false);
  assert.equal(buildSupportSkillVisual("socket-7", { skillCode: "" }), null);
  assert.equal(buildSupportSkillVisual("socket-7", { skillCode: "X".repeat(120) }).skillCode.length, 80);
});

test("support visual is sent to nearby peers excluding the caster while full result stays private", () => {
  const calls = [];
  const socket = { id: "caster-1", emit: (...args) => calls.push(["private", ...args]) };
  const session = { mapId: "binh_nguyen", x: 80, y: 200 };
  const result = { skillCode: "MOC_DUONG", skillName: "Mộc Dưỡng", hp: 120, buffs: { shield: true } };
  const emitNear = (...args) => calls.push(["near", ...args]);

  assert.equal(publishSupportSkill({ socket, session, result, emitNear }), true);
  assert.equal(calls[0][0], "near");
  assert.equal(calls[0][1], "binh_nguyen");
  assert.equal(calls[0][4], "player_skill_cast");
  assert.equal(calls[0][6], "caster-1");
  assert.equal(calls[1][0], "private");
  assert.equal(calls[1][1], "skill_result");
  assert.equal(calls[1][2], result);
  assert.equal(publishSupportSkill({ socket, session, result: {}, emitNear }), false);
});
