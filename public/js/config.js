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
  TS: 1,            // micro-grid: 1 ô địa hình = 1 logical pixel
  ACTOR_W: 20,
  ACTOR_H: 25,
  DS: 4,            // display scale (phóng to UI/Map 4 lần cho dễ nhìn)
  INV_MAX: 40,      // max inventory slots
  ATK_CD: 42,       // ticks cooldown đánh thường
  BASIC_ATTACK_RANGE: 24,  // world-pixel; lớn hơn bề rộng nhân vật
  SKILL_RANGE_SCALE: 6,    // 1 đơn vị range trong data = 6 world-pixel
  PLAYER_COLLISION_RADIUS: 4,
  INTERACTION_RANGE: 24,
  NET_SNAP_DISTANCE: 48,
  REGEN_HP: 0.01,   // HP regen per ms
  REGEN_MP: 0.006,  // MP regen per ms
  MON_AGGRO: 40,    // Aggro riêng từng quái theo world-pixel
  MON_LEASH: 72,    // Quái quay về bãi khi đi quá xa
  MON_ATTACK_RANGE: 18,
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
