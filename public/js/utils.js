"use strict";
// ════════════════════════════════════════════════════════════
// utils.js — §5 Utility Functions & Data Normalizers
// ════════════════════════════════════════════════════════════

function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function parseEquipSlot(slot) {
  if (slot == null || slot === "") return null;
  if (typeof slot === "object") return slot;
  if (typeof slot === "string") {
    try {
      return JSON.parse(slot);
    } catch {
      return null;
    }
  }
  return null;
}

function parseStringOrObj(val, fallback) {
  if (Array.isArray(val) || (val && typeof val === "object")) return val;
  if (typeof val === "string" && val.trim().startsWith("[")) {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  if (typeof val === "string" && val.trim().startsWith("{")) {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeWorldDto(dto) {
  if (!dto || typeof dto !== "object") return null;
  return {
    id: dto.id,
    code: dto.code,
    name: dto.tenMap || dto.name || dto.code,
    jsonMap: parseStringOrObj(dto.jsonMap, []),
    w: dto.w || 0,
    h: dto.h || 0,
    portals: parseStringOrObj(dto.portals, []),
    monsters: parseStringOrObj(dto.monsters, []),
    npcs: parseStringOrObj(dto.npcs, []),
    isDefault: dto.isDefault,
  };
}
