"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { findMonsterPath, getMonsterChaseWaypoint } = require("../socket/monster-path");

test("return route leads monsters around water without cutting blocked corners", () => {
  const tiles = Array.from({ length: 9 }, () => Array(10).fill(0));
  for (let y = 1; y < 7; y += 1) tiles[y][5] = 2;
  const world = { w: 10, h: 9, jsonMap: tiles };
  const path = findMonsterPath(world, 2, 4, 8, 4);

  assert.ok(path);
  assert.deepEqual(path.at(-1), { x: 8, y: 4 });
  let previous = { x: 2, y: 4 };
  for (const point of path) {
    assert.notEqual(tiles[point.y][point.x], 2);
    assert.ok(Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y)) === 1);
    if (point.x !== previous.x && point.y !== previous.y) {
      assert.notEqual(tiles[previous.y][point.x], 2);
      assert.notEqual(tiles[point.y][previous.x], 2);
    }
    previous = point;
  }
});

test("return route reports unreachable destinations and accepts a monster already home", () => {
  const tiles = Array.from({ length: 7 }, () => Array(8).fill(0));
  for (let y = 1; y < 6; y += 1) tiles[y][4] = 2;
  const world = { w: 8, h: 7, jsonMap: tiles };
  assert.equal(findMonsterPath(world, 2, 3, 2, 3).length, 0);
  assert.equal(findMonsterPath(world, 2, 3, 6, 3), null);
});

test("chasing monsters route around a river and replan when the player changes tiles", () => {
  const tiles = Array.from({ length: 9 }, () => Array(10).fill(0));
  for (let y = 1; y < 7; y += 1) tiles[y][5] = 2;
  const world = { w: 10, h: 9, jsonMap: tiles };
  const monster = { id: "wolf-1", x: 2, y: 4 };
  const target = { id: "player-1", x: 8, y: 4 };
  const first = getMonsterChaseWaypoint(world, monster, target, 1000);

  assert.equal(first.failed, false);
  assert.equal(first.replanned, true);
  assert.ok(first.waypoint);
  let previous = { x: 2, y: 4 };
  for (const point of monster.chasePath) {
    assert.notEqual(tiles[point.y][point.x], 2);
    assert.ok(Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y)) === 1);
    if (point.x !== previous.x && point.y !== previous.y) {
      assert.notEqual(tiles[previous.y][point.x], 2);
      assert.notEqual(tiles[point.y][previous.x], 2);
    }
    previous = point;
  }

  target.x = 8.8;
  assert.equal(getMonsterChaseWaypoint(world, monster, target, 1200).replanned, false);
  target.y = 6;
  const updated = getMonsterChaseWaypoint(world, monster, target, 1600);
  assert.equal(updated.replanned, true);
  assert.deepEqual(monster.chasePath.at(-1), { x: 8, y: 6 });
});

test("unreachable chase paths retry on a bounded interval instead of recalculating every tick", () => {
  const tiles = Array.from({ length: 7 }, () => Array(8).fill(0));
  for (let y = 1; y < 6; y += 1) tiles[y][4] = 2;
  const world = { w: 8, h: 7, jsonMap: tiles };
  const monster = { x: 2, y: 3 };
  const target = { id: "player-1", x: 6, y: 3 };

  assert.deepEqual(getMonsterChaseWaypoint(world, monster, target, 1000), {
    waypoint: null, failed: true, replanned: true,
  });
  assert.equal(getMonsterChaseWaypoint(world, monster, target, 1200).replanned, false);
  assert.equal(getMonsterChaseWaypoint(world, monster, target, 1600).replanned, true);
});
