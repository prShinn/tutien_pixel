"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const coreDirectory = path.join(__dirname, "..", "public", "js", "core");

test("ES modules own the shared gameplay configuration and runtime state", async () => {
  const config = await import(pathToFileURL(path.join(coreDirectory, "config.mjs")).href);
  const state = await import(pathToFileURL(path.join(coreDirectory, "state.mjs")).href);

  assert.equal(config.CFG.PLAYER_MOVE_SPEED, 44);
  assert.equal(state.S.players instanceof Map, true);
  assert.equal(state.S.creation.gender, "MALE");

  const affinity = { HOA: "#e56a3e" };
  config.setLinhCan(affinity);
  assert.equal(config.getLinhCan(), affinity);

  const canvasContext = state.getCanvasContext();
  canvasContext.cW = 640;
  assert.equal(state.getCanvasContext().cW, 640);
});

test("sequential client loader waits for each script and stops at the first failure", async () => {
  const { loadSequentially, orderByDependencies } = await import(pathToFileURL(path.join(coreDirectory, "sequential-loader.mjs")).href);
  const loaded = [];
  const dependencies = orderByDependencies([
    { id: "entry", dependsOn: ["runtime"] },
    { id: "runtime", dependsOn: ["api"] },
    { id: "api", dependsOn: [] },
  ]);
  assert.deepEqual(dependencies.map((entry) => entry.id), ["api", "runtime", "entry"]);

  const entries = [{ id: "first", dependsOn: [] }, { id: "broken", dependsOn: ["first"] }, { id: "last", dependsOn: ["broken"] }];

  await assert.rejects(loadSequentially(entries, async (entry) => {
    await Promise.resolve();
    loaded.push(entry.id);
    if (entry.id === "broken") throw new Error("network error");
  }), /network error/);

  assert.deepEqual(loaded, ["first", "broken"]);
  assert.throws(() => orderByDependencies([{ id: "a", dependsOn: ["missing"] }]), /Unknown client dependency/);
  assert.throws(() => orderByDependencies([
    { id: "a", dependsOn: ["b"] },
    { id: "b", dependsOn: ["a"] },
  ]), /dependency cycle/);
});
