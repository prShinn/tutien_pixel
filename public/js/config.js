"use strict";
// ════════════════════════════════════════════════════════════
// config.js — §0 API Config + §1 Static Game Constants
// Data tổ chức (ITEMS, SKILLS, ROOTS, REALMS) được load từ API
// qua gamedata.js tại thời điểm boot.
// ════════════════════════════════════════════════════════════

const API = {
  BASE: window.location.origin,
  SOCKET_URL: window.location.origin,
  AUTO_SAVE_MS: 30000,                   // auto-save mỗi 30 giây
};

// ── Static game rules (không thay đổi theo data) ──
const CFG = {
  TS: 8,            // tile size (logical 8x8 pixel)
  ACTOR_W: 15,
  ACTOR_H: 19,
  DS: 4,            // display scale (phóng to UI/Map 4 lần cho dễ nhìn)
  INV_MAX: 40,      // max inventory slots
  ATK_CD: 42,       // ticks cooldown đánh thường
  BASIC_ATTACK_RANGE: 2.0, // phạm vi đánh thường, tính theo ô map
  REGEN_HP: 0.01,   // HP regen per ms
  REGEN_MP: 0.006,  // MP regen per ms
  MON_AGGRO: 15,    // Tăng tầm aggro vì tile nhỏ đi
  MON_LEASH: 35,    // Tăng tầm leash vì tile nhỏ đi
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
