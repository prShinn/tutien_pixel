const TILE_W = 40;
const TILE_H = 30;

function makeTiles(seed) {
  return Array.from({ length: TILE_H }, (_, y) =>
    Array.from({ length: TILE_W }, (_, x) => {
      if (x === 0 || y === 0 || x === TILE_W - 1 || y === TILE_H - 1) return 3;
      if (seed === "thanh_van_tran" && (x === 12 || x === 27) && y > 4 && y < 24) return 3;
      if (seed === "binh_nguyen" && (x * 7 + y * 3) % 29 === 0) return 5;
      return (x + y) % 17 === 0 ? 1 : 0;
    }),
  );
}

const realms = [
  { id: 1, stt: 1, code: "LUYEN_THE", tenCanhGioi: "Luyện Thể", soTang: 9, tuViTienCap: 0, heSoTang: 1.2, moTa: "Rèn luyện thân thể, đặt nền móng tu tiên.", danPhaCanh: null },
  { id: 2, stt: 2, code: "KHI_DONG", tenCanhGioi: "Khí Động", soTang: 9, tuViTienCap: 1200, heSoTang: 1.25, moTa: "Cảm nhận và vận chuyển linh khí.", danPhaCanh: "DAN_KHI_DONG" },
];

const roots = [
  ["KIM", "Kim", "⚙", "#e8e8e8", "#4a4a4a"],
  ["MOC", "Mộc", "🌿", "#88ff88", "#1a3a1a"],
  ["THUY", "Thủy", "💧", "#88ffff", "#1a2a3a"],
  ["HOA", "Hỏa", "🔥", "#ff8888", "#3a1a1a"],
  ["THO", "Thổ", "🪨", "#ffcc88", "#2a1a1a"],
  ["QUANG", "Quang", "✨", "#ffff88", "#3a3a1a"],
  ["AM", "Ám", "🌑", "#aaaaff", "#1a1a3a"],
  ["PHONG", "Phong", "💨", "#aaffff", "#1a3a3a"],
  ["LOI", "Lôi", "⚡", "#ffff88", "#3a3a1a"],
].map(([id, name, emoji, color, bg]) => ({ id, name, emoji, color, bg }));

const items = [
  { id: "STONE_LINH_NHO", maDo: "STONE_LINH_NHO", tenDo: "Linh Thạch Nhỏ", name: "Linh Thạch Nhỏ", icon: "💎", loai: "STONE", type: "STONE", giaTriTuVi: 120, giaMua: 20, giaBan: 10, moTa: "Một viên linh thạch chứa linh khí non trẻ." },
  { id: "HUYET_NGOC_NHO", maDo: "HUYET_NGOC_NHO", tenDo: "Huyết Ngọc Nhỏ", name: "Huyết Ngọc Nhỏ", icon: "🧪", loai: "POTION", type: "POTION", healHp: 60, giaMua: 30, giaBan: 15, moTa: "Hồi phục một lượng HP." },
  { id: "MAT_LANG_NANH", maDo: "MAT_LANG_NANH", tenDo: "Nanh Hoang Sói", name: "Nanh Hoang Sói", icon: "🦴", loai: "MATERIAL", type: "MATERIAL", giaMua: 0, giaBan: 8, moTa: "Chiến lợi phẩm từ Hoang Sói." },
  { id: "SWORD_BAO_KHI_1", maDo: "SWORD_BAO_KHI_1", tenDo: "Kiếm Bảo Khí", name: "Kiếm Bảo Khí", icon: "⚔️", loai: "EQUIPMENT", type: "EQUIPMENT", giaMua: 120, giaBan: 60, stats: { pAtk: 8 }, moTa: "Thanh kiếm nhập môn của tu sĩ." },
];

const skills = [
  { id: 1, code: "KIM_TRAM", name: "Kim Trảm", icon: "⚔️", linhCan: "KIM", tier: 1, mpTieuHao: 5, hoiChieu: 2, range: 5, type: "PHYS", satThuong: 1.2, moTa: "Một nhát chém sắc bén." },
  { id: 2, code: "MOC_DUONG", name: "Mộc Dưỡng", icon: "🌿", linhCan: "MOC", tier: 1, mpTieuHao: 6, hoiChieu: 4, range: 4, type: "MAGIC", satThuong: 0.8, effect: "heal", effectVal: 30, moTa: "Hồi phục sinh lực." },
  { id: 3, code: "HOA_CAU", name: "Hỏa Cầu", icon: "🔥", linhCan: "HOA", tier: 1, mpTieuHao: 8, hoiChieu: 3, range: 6, type: "MAGIC", satThuong: 1.4, moTa: "Phóng hỏa cầu vào mục tiêu." },
  { id: 4, code: "THUYEN_BANG", name: "Băng Tiễn", icon: "❄️", linhCan: "THUY", tier: 1, mpTieuHao: 7, hoiChieu: 3, range: 6, type: "MAGIC", satThuong: 1.1, effect: "slow", moTa: "Mũi tên băng làm chậm mục tiêu." },
];

const monsterDefs = [
  { id: "HOANG_SOI", code: "HOANG_SOI", name: "Hoang Sói", icon: "🐺", type: "NORMAL", level: 1, nguHanh: ["KIM"], color: "#8855cc", hp: 90, maxHp: 90, atk: 9, def: 2, spawnX: 9, spawnY: 12, lootTableId: "SOI_LOOT" },
  { id: "THO_HEO", code: "THO_HEO", name: "Thổ Heo Rừng", icon: "🐗", type: "NORMAL", level: 2, nguHanh: ["THO"], color: "#996633", hp: 120, maxHp: 120, atk: 12, def: 4, spawnX: 22, spawnY: 17, lootTableId: "HEO_LOOT" },
  { id: "DOC_THAO", code: "DOC_THAO", name: "Độc Thảo Yêu", icon: "🌱", type: "ELITE", level: 3, nguHanh: ["MOC"], color: "#33aa66", hp: 180, maxHp: 180, atk: 16, def: 6, spawnX: 31, spawnY: 10, lootTableId: "THAO_LOOT" },
];

const worlds = [
  {
    id: "thanh_van_tran", code: "thanh_van_tran", tenMap: "Thanh Vân Trấn", type: "CITY", w: TILE_W, h: TILE_H, isDefault: true, spawnX: 20, spawnY: 15,
    jsonMap: makeTiles("thanh_van_tran"),
    portals: [{ id: "portal_binh_nguyen", x: 37, y: 15, toMap: "binh_nguyen", toX: 2, toY: 15, tenMapDen: "Bình Nguyên Hoang Dã" }],
    monsters: [],
    npcs: [{ id: "npc_huong_dan", name: "Lão Tu Sĩ", x: 17, y: 14, color: "#e8c878", dialog: "Chào mừng tu sĩ đến Thanh Vân Trấn! Hãy ra ngoài tìm cơ duyên." }, { id: "npc_shop", name: "Chủ Tiệm", x: 23, y: 14, color: "#88aacc", dialog: "Ta có linh thạch và huyết ngọc cho người cần." }],
  },
  {
    id: "binh_nguyen", code: "binh_nguyen", tenMap: "Bình Nguyên Hoang Dã", type: "PLAIN", w: TILE_W, h: TILE_H, isDefault: false, spawnX: 3, spawnY: 15,
    jsonMap: makeTiles("binh_nguyen"),
    portals: [{ id: "portal_thanh_van", x: 2, y: 15, toMap: "thanh_van_tran", toX: 35, toY: 15, tenMapDen: "Thanh Vân Trấn" }],
    monsters: monsterDefs,
    npcs: [],
  },
];

module.exports = { realms, roots, items, skills, monsterDefs, worlds };
