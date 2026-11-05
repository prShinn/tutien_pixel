"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const monsterSource = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "monster.js"),
  "utf8",
);

function monsterHarness(player = {}) {
  const events = [];
  const state = {
    player: {
      hp: 1,
      maxHp: 100,
      px: 4,
      py: 5,
      stats: {},
      equipment: {},
      movePath: [{ x: 2, y: 3 }],
      targetMovePos: { x: 2, y: 3 },
      combatMove: true,
      ...player,
    },
    autoFight: true,
    combatPending: true,
  };
  const context = vm.createContext({
    S: state,
    Net: { _isOnline: false },
    SkillSystem: {
      updateMonsterStatus() { events.push("status-update"); },
      isFrozenOrStunned() { return false; },
    },
    deriveCombatStats() { return { pDef: 0 }; },
    monsterPressure() { return 0; },
    Combat: { evasion() { return 0; } },
    elementalStrength() { return 1; },
    affinityProfile() { return { multiplier: 1 }; },
    randInt(min) { return min; },
    dist() { return 0; },
    World: { hasClearPath() { return true; } },
    Render: {
      combatFx() { events.push("combat-fx"); },
      floatDmg() { events.push("floating-damage"); },
    },
    Input: { stopMovement() { events.push("stop-movement"); } },
    UI: {
      showDeathModal() { events.push("death-modal"); },
      updateVitals() { events.push("update-vitals"); },
    },
  });
  vm.runInContext(`${monsterSource}\nglobalThis.__Monster = Monster;`, context, {
    filename: "monster.js",
  });
  context.__Monster.playAttack = () => events.push("monster-attack");
  return { monster: context.__Monster, player: state.player, state, events };
}

test("lethal local monster attack locks the player and shows the respawn modal", () => {
  const { monster, player, state, events } = monsterHarness();
  const enemy = { atk: 10, px: 6, py: 5, statusEffects: [] };

  monster._performAttack(enemy, player);

  assert.equal(player.hp, 0);
  assert.equal(player.dead, true);
  assert.equal(player.combatMove, false);
  assert.equal(player.isMoving, false);
  assert.deepEqual(Array.from(player.movePath), []);
  assert.equal(player.targetMovePos, null);
  assert.equal(state.autoFight, false);
  assert.equal(state.combatPending, false);
  assert.ok(events.includes("death-modal"));
  assert.ok(events.includes("stop-movement"));
  assert.ok(events.includes("update-vitals"));

  const eventCount = events.length;
  monster._performAttack(enemy, player);
  assert.equal(player.hp, 0, "a dead player must not receive fake emergency HP");
  assert.equal(events.length, eventCount, "a dead player cannot be attacked again");
});

test("monster update skips combat while the player is dead or at zero HP", () => {
  for (const playerState of [{ hp: 0 }, { hp: 12, dead: true }]) {
    const { monster, events } = monsterHarness(playerState);
    monster.update({ dead: false, state: "chase" }, 16);
    assert.ok(!events.includes("status-update"));
    assert.ok(!events.includes("monster-attack"));
  }
});
