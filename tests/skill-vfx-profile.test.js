"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { ALLOWED_FORMS, normalizeSkillVfxProfile } = require("../game/skill-vfx-profile");

const validProfile = {
  skillCode: "HOA_CAU",
  root: "hoa",
  form: "fireball",
  label: "Hỏa cầu",
  durationMs: 580,
  colors: { main: "#E56A3E", light: "#FFD16B", dark: "#873746", accent: "#FFF0AE" },
};

test("profile normalizer returns a bounded, canonical profile", () => {
  const result = normalizeSkillVfxProfile(validProfile.skillCode, validProfile);
  assert.equal(result.ok, true);
  assert.deepEqual(result.profile, {
    skillCode: "HOA_CAU",
    root: "HOA",
    form: "fireball",
    label: "Hỏa cầu",
    durationMs: 580,
    colors: { main: "#e56a3e", light: "#ffd16b", dark: "#873746", accent: "#fff0ae" },
  });
});

test("profile normalizer rejects unknown skills, roots, forms, names, duration, and colors", () => {
  const cases = [
    ["UNKNOWN", validProfile, "SKILL_NOT_FOUND"],
    ["HOA_CAU", { ...validProfile, root: "UNKNOWN" }, "INVALID_ROOT"],
    ["HOA_CAU", { ...validProfile, form: "not-an-animation" }, "INVALID_FORM"],
    ["HOA_CAU", { ...validProfile, label: " " }, "INVALID_LABEL"],
    ["HOA_CAU", { ...validProfile, label: "x".repeat(61) }, "INVALID_LABEL"],
    ["HOA_CAU", { ...validProfile, durationMs: 299 }, "INVALID_DURATION"],
    ["HOA_CAU", { ...validProfile, durationMs: 1201 }, "INVALID_DURATION"],
    ["HOA_CAU", { ...validProfile, durationMs: 580.5 }, "INVALID_DURATION"],
    ["HOA_CAU", { ...validProfile, colors: { ...validProfile.colors, main: "url(javascript:alert(1))" } }, "INVALID_COLOR"],
    ["HOA_CAU", { ...validProfile, colors: { main: "#000000" } }, "INVALID_COLOR"],
  ];
  for (const [code, input, expectedCode] of cases) {
    const result = normalizeSkillVfxProfile(code, input);
    assert.equal(result.ok, false, `${expectedCode} should be rejected`);
    assert.equal(result.code, expectedCode);
  }
});

test("every authored game skill animation form is accepted by the server", () => {
  const vfxSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "skill-vfx.js"), "utf8");
  const formsBlock = vfxSource.match(/\bforms:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*palette:/)?.[1];
  assert.ok(formsBlock, "could not locate SkillVFX.forms catalog");
  const authoredForms = [...formsBlock.matchAll(/:\s*["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(authoredForms.length >= 60, "expected the complete skill animation catalog");
  for (const form of new Set(authoredForms)) assert.ok(ALLOWED_FORMS.has(form), `server rejects client form: ${form}`);
});
