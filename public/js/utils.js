// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/utils.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Tiện ích toán học & chuẩn hóa dữ liệu (Math Helpers & Data Normalizers): Tính khoảng cách
//      Euclidean (dist), số ngẫu nhiên (randInt), nội suy tuyến tính (lerp), phân giải JSON an toàn
//      (parseEquipSlot, normalizeWorldDto), chuyển đổi format người chơi giữa BE và FE (mapBEPlayerToFE).
// 2. CẤU HÌNH LIÊN QUAN:
//    - Không phụ thuộc bên ngoài (Pure functions).
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Đảm bảo tính toán khoảng cách và giải mã dữ liệu an toàn, không bao giờ ném lỗi (crash)
//      khi server trả về dữ liệu rỗng hoặc sai cấu trúc.
// ════════════════════════════════════════════════════════════════════════════════════════

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
  console.log("[Utils] Chuẩn hóa map", dto.code || dto.maMap || dto.id, `${dto.w || dto.width || "?"}x${dto.h || dto.height || "?"}`);
  
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
  const layers = parseStringOrObj(dto.layers || {}, {});
  
  return {
    id: dto.id || code,
    code: code,
    name: dto.tenMap || dto.name || code,
    jsonMap: tiles,
    layers: {
      ground: parseStringOrObj(layers.ground || [], []),
      objects: parseStringOrObj(layers.objects || [], []),
      elevation: parseStringOrObj(layers.elevation || [], []),
    },
    biome: dto.biome || "LEGACY",
    seed: dto.seed || code,
    version: Number(dto.version || 0),
    w: w,
    h: h,
    portals: parseStringOrObj(dto.portals || dto.danhSachCong || [], []).map(p => ({
      ...p,
      x: Number(p.x || 0),
      y: Number(p.y || 0),
      toX: Number(p.toX || 0),
      toY: Number(p.toY || 0)
    })),
    monsters: parseStringOrObj(dto.monsters || dto.danhSachQuai || [], []).map(m => ({
      ...m,
      hp: Number(m.hp || 0),
      maxHp: Number(m.maxHp || m.hp || 0),
      atk: Number(m.atk || 0),
      def: Number(m.def || 0),
      spawnX: Number(m.spawnX ?? Math.floor(w / 2)),
      spawnY: Number(m.spawnY ?? Math.floor(h / 2))
    })),
    monsterSpawns: parseStringOrObj(dto.monsterSpawns || dto.baiQuai || [], []),
    npcs: parseStringOrObj(dto.npcs || dto.danhSachNpc || [], []).map(n => ({
      ...n,
      x: Number(n.x || 0),
      y: Number(n.y || 0)
    })),
    isDefault: dto.isDefault,
  };
}
