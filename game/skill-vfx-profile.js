"use strict";

const { roots, skills } = require("../data/mock-data");

const ALLOWED_ROOTS = new Set(["COMMON", ...roots.map((root) => String(root.id || root.code || "").toUpperCase())]);
const ALLOWED_FORMS = new Set([
  "slash", "shield", "shatter", "orbit", "blade-rain", "crescent", "heal", "root", "growth", "branch",
  "forest", "wood-spirit", "ice-arrow", "water-shield", "ice-pool", "water-current", "snowfall", "tide",
  "fireball", "candle-flame", "fire-lotus", "solar-mark", "volcanic-lotus", "flame-field", "stone-strike",
  "stone-armor", "quake", "earth-rune", "mountain-slam", "stone-cage", "light-blade", "star-heal", "purify",
  "light-speed", "sun-column", "starburst", "shadow-needles", "curse-web", "dark-eye", "ghost-hand", "void-field",
  "soul-drain", "wind-blade", "leaf-speed", "vortex", "cyclone-cage", "nine-gales", "wind-wave", "thunder-strike",
  "thunder-shield", "lightning-chain", "sky-bolt", "lightning-rain", "storm-field", "meditate", "five-elements",
  "clear-heart", "passive-metal", "passive-leaf", "passive-water", "passive-flame", "passive-stone", "passive-sun",
  "passive-shadow", "passive-wind", "passive-lightning",
]);
const COLOR_KEYS = ["main", "light", "dark", "accent"];
const SKILL_CODES = new Set(skills.map((skill) => String(skill.code || skill.id || "")));

function isKnownSkillCode(skillCode) {
  return SKILL_CODES.has(String(skillCode || "").trim());
}

function normalizeSkillVfxProfile(skillCode, input = {}) {
  const code = String(skillCode || "").trim();
  if (!isKnownSkillCode(code)) return { ok: false, code: "SKILL_NOT_FOUND", message: "Skill không tồn tại trong danh mục" };

  const root = String(input.root || "").trim().toUpperCase();
  if (!ALLOWED_ROOTS.has(root)) return { ok: false, code: "INVALID_ROOT", message: "Linh căn không hợp lệ" };

  const form = String(input.form || "").trim();
  if (!ALLOWED_FORMS.has(form)) return { ok: false, code: "INVALID_FORM", message: "Mẫu animation không hợp lệ" };

  const label = String(input.label || "").trim();
  if (!label || label.length > 60) return { ok: false, code: "INVALID_LABEL", message: "Tên hiệu ứng phải dài từ 1 đến 60 ký tự" };

  const durationMs = Number(input.durationMs);
  if (!Number.isInteger(durationMs) || durationMs < 300 || durationMs > 1200) {
    return { ok: false, code: "INVALID_DURATION", message: "Thời lượng hiệu ứng phải từ 300 đến 1200 ms" };
  }

  const colors = {};
  for (const key of COLOR_KEYS) {
    const color = String(input.colors?.[key] || "");
    if (!/^#[0-9a-f]{6}$/i.test(color)) return { ok: false, code: "INVALID_COLOR", message: "Mỗi màu phải có định dạng #RRGGBB" };
    colors[key] = color.toLowerCase();
  }

  return { ok: true, profile: { skillCode: code, root, form, label, durationMs, colors } };
}

module.exports = { ALLOWED_FORMS, ALLOWED_ROOTS, isKnownSkillCode, normalizeSkillVfxProfile };
