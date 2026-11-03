"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const SkillVfxProfileStore = require("../game/skill-vfx-profile-store");

const profile = {
  skillCode: "HOA_CAU", root: "HOA", form: "fireball", label: "Hỏa cầu", durationMs: 580,
  colors: { main: "#e56a3e", light: "#ffd16b", dark: "#873746", accent: "#fff0ae" },
};

async function makeStore(t, filename = "skill-vfx.json") {
  const testDataRoot = path.join(__dirname, ".vfx-test-data");
  await fs.mkdir(testDataRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(testDataRoot, "case-"));
  t.after(async () => {
    const root = `${path.resolve(testDataRoot)}${path.sep}`;
    const target = path.resolve(directory);
    if (target.startsWith(root)) await fs.rm(target, { recursive: true, force: true });
  });
  return { directory, store: new SkillVfxProfileStore(path.join(directory, filename)) };
}

test("profile store persists create, update and delete and reloads only valid profiles", async (t) => {
  const { directory, store } = await makeStore(t);
  const created = await store.create(profile);
  assert.equal(created.ok, true);
  assert.equal((await store.create(profile)).code, "PROFILE_EXISTS");

  const changed = { ...profile, form: "starburst", label: "Tinh hỏa" };
  const updated = await store.update("HOA_CAU", changed);
  assert.equal(updated.ok, true);
  assert.equal(updated.profile.form, "starburst");
  assert.equal((await store.update("THO_KICH", profile)).status, 404);

  const reloaded = new SkillVfxProfileStore(path.join(directory, "skill-vfx.json"));
  assert.equal(reloaded.list().HOA_CAU.form, "starburst");
  assert.equal((await reloaded.remove("HOA_CAU")).removed, "HOA_CAU");
  assert.equal((await reloaded.remove("HOA_CAU")).status, 404);
  assert.deepEqual(new SkillVfxProfileStore(path.join(directory, "skill-vfx.json")).list(), {});
});

test("concurrent creates are serialized and only one profile can win", async (t) => {
  const { directory, store } = await makeStore(t);
  const results = await Promise.all([store.create(profile), store.create(profile)]);
  assert.deepEqual(results.map((result) => result.status || 201).sort(), [201, 409]);
  const persisted = JSON.parse(await fs.readFile(path.join(directory, "skill-vfx.json"), "utf8"));
  assert.deepEqual(Object.keys(persisted), ["HOA_CAU"]);
});

test("profile store rejects malformed values and unknown skill codes", async (t) => {
  const { store } = await makeStore(t);
  assert.equal((await store.create({ ...profile, colors: { main: "bad" } })).code, "INVALID_COLOR");
  assert.equal((await store.create({ ...profile, skillCode: "NOT_A_SKILL" })).code, "SKILL_NOT_FOUND");
  assert.deepEqual(store.list(), {});
});

test("failed disk writes leave the live profile set unchanged", async () => {
  const missingDirectory = path.join(__dirname, ".vfx-test-data", `missing-${process.pid}-${Date.now()}`, "child");
  const store = new SkillVfxProfileStore(path.join(missingDirectory, "skill-vfx.json"));
  await assert.rejects(store.create(profile), { code: "ENOENT" });
  assert.deepEqual(store.list(), {});
});

test("loading ignores invalid stored profiles without exposing their payloads", async (t) => {
  const { directory } = await makeStore(t);
  await fs.writeFile(path.join(directory, "skill-vfx.json"), JSON.stringify({
    HOA_CAU: profile,
    NOT_A_SKILL: { ...profile, skillCode: "NOT_A_SKILL", label: "unknown" },
  }));
  const store = new SkillVfxProfileStore(path.join(directory, "skill-vfx.json"));
  assert.deepEqual(Object.keys(store.list()), ["HOA_CAU"]);
});
