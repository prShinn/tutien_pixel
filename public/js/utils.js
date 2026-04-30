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
  if (!dto) return null;
  console.log("[Utils] Đang chuẩn hóa DTO bản đồ:", dto);
  
  // Hỗ trợ cả trường hợp dto chính là mảng gạch (tiles)
  let tiles = [];
  if (Array.isArray(dto)) {
    tiles = dto;
  } else {
    tiles = parseStringOrObj(dto.jsonMap || dto.mapData || dto.tiles || dto.data, []);
  }

  // Nếu tiles là mảng 2 chiều, tự động tính w, h nếu thiếu
  let w = dto.w || dto.width || (Array.isArray(tiles[0]) ? tiles[0].length : 0);
  let h = dto.h || dto.height || (Array.isArray(tiles) ? tiles.length : 0);
  
  const code = dto.code || dto.maMap || dto.id || "unknown";
  
  return {
    id: dto.id || code,
    code: code,
    name: dto.tenMap || dto.name || code,
    jsonMap: tiles,
    w: w,
    h: h,
    portals: parseStringOrObj(dto.portals || dto.danhSachCong || [], []),
    monsters: parseStringOrObj(dto.monsters || dto.danhSachQuai || [], []),
    npcs: parseStringOrObj(dto.npcs || dto.danhSachNpc || [], []),
    isDefault: dto.isDefault,
  };
}
