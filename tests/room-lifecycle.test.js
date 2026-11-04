"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { markRoomActive, markRoomEmpty, shouldDisposeRoom } = require("../game/room-lifecycle");

test("empty room starts one grace period, resumes cleanly, and retains unexpired loot", () => {
  const runtime = { emptySince: 0 };
  markRoomEmpty(runtime, 1000);
  markRoomEmpty(runtime, 2000);
  assert.equal(runtime.emptySince, 1000);
  assert.equal(shouldDisposeRoom(runtime, 121000, 120000, true), false);
  assert.equal(shouldDisposeRoom(runtime, 121000, 120000, false), true);
  markRoomActive(runtime);
  assert.equal(runtime.emptySince, 0);
  assert.equal(shouldDisposeRoom(runtime, 500000, 120000, false), false);
});
