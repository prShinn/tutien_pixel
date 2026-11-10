"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("client-authored attack effects cannot be broadcast as authoritative damage", () => {
  // Server realtime nằm ở BE; FE chỉ cần không phát hoặc nhận hiệu ứng đòn đánh do client tự tạo.
  const combat = source("public/js/combat.js");
  const skills = source("public/js/skills.js");
  const net = source("public/js/net.js");

  assert.doesNotMatch(combat, /emit\(["']attack_effect["']/);
  assert.doesNotMatch(skills, /emit\(["']attack_effect["']/);
  assert.doesNotMatch(net, /socket\.on\(["']attack_fx["']/);
  assert.match(net, /socket\.on\(["']combat_result["']/);
});
