// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/config.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Cấu hình hằng số toàn cục phía Client (Client Game Configuration): Khai báo endpoint API/Socket,
//      chu kỳ auto-save, kích thước micro-grid (TS=1), tỉ lệ phóng đại màn hình (DS=3), kích thước nhân vật,
//      tốc độ di chuyển, tầm đánh cơ bản, cooldown, giới hạn ô túi đồ.
// 2. CẤU HÌNH LIÊN QUAN:
//    - API, CFG.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Tập trung toàn bộ thông số gameplay vào một nơi duy nhất để dễ dàng căn chỉnh tỷ lệ
//      màn hình, độ mượt di chuyển và camera mà không bị rải rác mã nguồn.
// ════════════════════════════════════════════════════════════════════════════════════════

/* API contract lives in api.js. */
/*
const LEGACY_API = {
  BASE: window.location.origin,
  SOCKET_URL: window.location.origin,
  AUTO_SAVE_MS: 30000,                   // auto-save mỗi 30 giây
};
*/

// ── Static game rules (không thay đổi theo data) ──
const CFG = {
  TS: 1,            // micro-grid: 1 ô địa hình = 1 logical pixel
  ACTOR_W: 14,
  ACTOR_H: 18,
  ACTOR_FOOT_OFFSET: 3,
  DS: 3,            // thấy rộng hơn nhưng vẫn giữ pixel-art rõ nét
  INV_MAX: 40,      // max inventory slots
  ATK_CD: 42,       // ticks cooldown đánh thường
  BASIC_ATTACK_RANGE: 24,  // world-pixel; lớn hơn bề rộng nhân vật
  ATTACK_RANGE_PADDING: 2, // bù sai số tâm actor giữa render và tọa độ server
  SKILL_RANGE_SCALE: 6,    // 1 đơn vị range trong data = 6 world-pixel
  PLAYER_COLLISION_RADIUS: 0.45,
  PLAYER_MOVE_SPEED: 44,   // world-pixel/giây; server cho sai số mạng riêng
  REMOTE_MOVE_SPEED: 56,
  INTERACTION_RANGE: 24,
  NET_SNAP_DISTANCE: 48,
  REGEN_HP: 0,      // Không hồi nền; chỉ hồi qua skill/buff/item
  REGEN_MP: 0,      // Không hồi nền; chỉ hồi qua skill/buff/item
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
