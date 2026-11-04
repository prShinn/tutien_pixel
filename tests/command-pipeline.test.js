"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createCommandPipeline } = require("../socket/command-pipeline");

const socket = { id: "test-socket" };
const pickup = (requestId, itemId = "drop-1") => ({
  requestId,
  type: "loot.pickup",
  payload: { itemId },
});

test("retrying the same pickup request returns its original result without applying twice", async () => {
  let claims = 0;
  const pipeline = createCommandPipeline({ handlers: {
    "loot.pickup"() { claims += 1; return { accepted: true }; },
  } });
  const send = (envelope) => new Promise((resolve) => pipeline.dispatch(socket, envelope, resolve));
  try {
    const results = await Promise.all([
      send(pickup("same-request")),
      send(pickup("same-request")),
    ]);
    assert.equal(claims, 1);
    assert.deepEqual(results[0], results[1]);
  } finally {
    pipeline.close();
  }
});

test("different pickup requests cannot claim one synchronous ground drop twice", async () => {
  const drops = [{ id: "drop-1" }];
  let inventoryCount = 0;
  const pipeline = createCommandPipeline({ handlers: {
    "loot.pickup"({ itemId }) {
      const index = drops.findIndex((drop) => drop.id === itemId);
      if (index < 0) return { __commandError: { code: "LOOT_NOT_FOUND", message: "Vật phẩm đã biến mất" } };
      inventoryCount += 1;
      drops.splice(index, 1);
      return { accepted: true };
    },
  } });
  const send = (envelope) => new Promise((resolve) => pipeline.dispatch(socket, envelope, resolve));
  try {
    const results = await Promise.all([
      send(pickup("request-a")),
      send(pickup("request-b")),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(inventoryCount, 1);
    assert.equal(drops.length, 0);
  } finally {
    pipeline.close();
  }
});
