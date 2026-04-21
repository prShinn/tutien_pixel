"use strict";
// ════════════════════════════════════════════════════════════
// config.js — §0 API Config + §1 Static Game Constants
// Data tổ chức (ITEMS, SKILLS, ROOTS, REALMS) được load từ API
// qua gamedata.js tại thời điểm boot.
// ════════════════════════════════════════════════════════════

const API = {
  BASE: "http://localhost:8090",         // ← server URL
  SOCKET_URL: "http://localhost:3000",   // ← socket URL
  AUTO_SAVE_MS: 60000,                   // auto-save mỗi 60 giây
};

// ── Static game rules (không thay đổi theo data) ──
const CFG = {
  TS: 32,           // tile size (pixels)
  INV_MAX: 40,      // max inventory slots
  ATK_CD: 42,       // ticks cooldown đánh thường
  REGEN_HP: 0.01,   // HP regen per ms
  REGEN_MP: 0.006,  // MP regen per ms
  MON_AGGRO: 4.2,   // tile aggro range
  MON_LEASH: 11,    // tile leash range
  MON_RESPAWN: 420, // respawn ticks

  // ── Data được populate bởi GameData.load() ──
  REALMS: [],   // [{ stt, code, tenCanhGioi, tuViTienCap, ... }]
  ROOTS: [],    // [{ id, name, emoji, color, bg }]
  ITEMS: {},    // { id: { id, name, icon, type, ... } }
  SKILLS: {},   // { linhCan: [[tier1_opts], [tier2_opts], ...] }
  SHOP_SELL: [], // [item_id, ...]
};

// ── Linh_CAN lookup (populated sau khi load ROOTS) ──
// Dùng để tra màu sắc realtime trong UI.update()
let Linh_CAN = {};
