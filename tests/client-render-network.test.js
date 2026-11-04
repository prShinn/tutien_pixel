"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const coreDirectory = path.join(root, "public", "js", "core");

test("fixed-step clock gives the same 60 gameplay ticks at 240Hz and 20FPS", async () => {
  const { createFixedStepClock } = await import(pathToFileURL(path.join(coreDirectory, "fixed-step.mjs")).href);
  for (const frameInterval of [1000 / 240, 50]) {
    const clock = createFixedStepClock();
    clock.reset(0);
    let updates = 0;
    for (let frame = 1; frame <= Math.round(1000 / frameInterval); frame += 1) {
      updates += clock.advance(frame * frameInterval).steps;
    }
    assert.equal(updates, 60);
  }
});

test("fixed-step clock caps catch-up after a long stalled frame", async () => {
  const { createFixedStepClock } = await import(pathToFileURL(path.join(coreDirectory, "fixed-step.mjs")).href);
  const clock = createFixedStepClock({ maxCatchUpSteps: 5 });
  clock.reset(0);
  const stalledFrame = clock.advance(1000);
  assert.equal(stalledFrame.frameDelta, 100);
  assert.equal(stalledFrame.steps, 5);
  assert.equal(stalledFrame.alpha, 0);
});

test("snapshot buffer interpolates delayed samples and snaps teleports", async () => {
  const { createSnapshotBuffer } = await import(pathToFileURL(path.join(coreDirectory, "snapshot-buffer.mjs")).href);
  const snapshots = createSnapshotBuffer({ delayMs: 100, maxSamples: 3, snapDistance: 48 });
  const entity = {};
  snapshots.reset(entity, 0, 0, 0);
  snapshots.push(entity, 10, 4, 50);
  snapshots.push(entity, 20, 8, 100);
  assert.deepEqual(snapshots.sample(entity, 75), { x: 15, y: 6 });
  assert.equal(entity._snapshots.length, 3);
  assert.equal(snapshots.push(entity, 25, 9, 90), false, "out-of-order packets must not rewind the buffer");
  snapshots.push(entity, 100, 100, 150);
  assert.deepEqual(entity._snapshots, [{ x: 100, y: 100, time: 150 }], "teleport should reset stale interpolation history");
  assert.deepEqual(snapshots.sample(entity, 200), { x: 100, y: 100 });
});

test("state bus publishes HUD events only when displayed values change", async () => {
  const { StateBus } = await import(pathToFileURL(path.join(coreDirectory, "state.mjs")).href);
  const vitals = [];
  const positions = [];
  const unsubscribeVitals = StateBus.on("player:vitals_changed", (value) => vitals.push(value));
  const unsubscribePosition = StateBus.on("player:position_changed", (value) => positions.push(value));
  const player = { hp: 50.4, maxHp: 100, mp: 20, maxMp: 40, tuViHienTai: 7, tuViLenCap: 100, xu: 12, x: 1.1, y: 2.8 };
  StateBus.publishPlayerVitals(player);
  StateBus.publishPlayerVitals({ ...player, hp: 50.9 });
  StateBus.publishPlayerVitals({ ...player, hp: 49.9 });
  StateBus.publishPlayerPosition(player, "test-map");
  StateBus.publishPlayerPosition({ ...player, x: 1.9 }, "test-map");
  StateBus.publishPlayerPosition({ ...player, x: 2.1 }, "test-map");
  unsubscribeVitals();
  unsubscribePosition();
  assert.equal(vitals.length, 2);
  assert.equal(vitals[1].hp, 49);
  assert.equal(positions.length, 2);
  assert.equal(positions[1].x, 2);
});

test("HUD consumes vitals events using cultivation field names", async () => {
  const { StateBus } = await import(pathToFileURL(path.join(coreDirectory, "state.mjs")).href);
  const uiSource = fs.readFileSync(path.join(root, "public", "js", "ui.js"), "utf8");
  const elements = new Map(["ui-hp", "b-hp", "ui-mp", "b-mp", "ui-tu", "b-tu", "ui-xu"].map((id) => [id, { style: {}, textContent: "" }]));
  const context = vm.createContext({
    StateBus,
    document: { getElementById(id) { return elements.get(id) || null; } },
  });
  vm.runInContext(`${uiSource}\nglobalThis.__UI = UI;`, context);
  StateBus.publishPlayerVitals({ hp: 40, maxHp: 100, mp: 10, maxMp: 50, tuViHienTai: 25, tuViLenCap: 200, xu: 1234 });
  assert.equal(elements.get("ui-hp").textContent, "40/100");
  assert.equal(elements.get("ui-mp").textContent, "10/50");
  assert.equal(elements.get("ui-tu").textContent, "25/200");
  assert.equal(elements.get("ui-xu").textContent.replace(/[.,]/g, ""), "1234");
});

test("renderer uses stable global Y order for drawable entities", () => {
  const renderSource = fs.readFileSync(path.join(root, "public", "js", "render.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(`${renderSource}\nglobalThis.__Render = Render;`, context);
  const drawables = [
    { id: "near-player", y: 10, order: 4, sequence: 3 },
    { id: "loot", y: 5, order: 0, sequence: 0 },
    { id: "monster", y: 10, order: 2, sequence: 1 },
    { id: "npc", y: 10, order: 1, sequence: 2 },
  ];
  const sorted = context.__Render.sortDrawables(drawables);
  assert.deepEqual(Array.from(sorted, (entry) => entry.id), ["loot", "npc", "monster", "near-player"]);
});
