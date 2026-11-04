"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { isSolidTile, positionCollides, movementPathCollides } = require("../socket/movement-collision");

const world = {
  w: 5,
  h: 3,
  tiles: [
    [0, 0, 0, 0, 0],
    [0, 0, 2, 0, 0],
    [0, 0, 0, 0, 0],
  ],
};

test("server collision checks keep water and out-of-bounds tiles blocked", () => {
  assert.equal(isSolidTile(world, 2, 1), true);
  assert.equal(isSolidTile(world, -1, 1), true);
  assert.equal(isSolidTile(world, 1, 1), false);
  assert.equal(positionCollides(world, 1, 1), false);
  assert.equal(positionCollides(world, 2, 1), true);
});

test("movement path samples intermediate positions so clients cannot cross water", () => {
  assert.equal(movementPathCollides(world, 0, 1, 4, 1), true);
  assert.equal(movementPathCollides(world, 0, 0, 4, 0), false);
  assert.equal(movementPathCollides(null, 0, 0, 4, 4), false);
});
