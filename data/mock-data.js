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

const rootDesign = {
  KIM: { role: "single_target", identity: "Sát thương đơn và xuyên giáp", passive: "Mỗi đòn đánh thứ 4 gây thêm 10% sát thương." },
  MOC: { role: "sustain", identity: "Hồi phục, trói chân và đánh lâu dài", passive: "Hồi 2% HP tối đa sau mỗi lần dùng kỹ năng." },
  THUY: { role: "control", identity: "Tầm xa, làm chậm và kiểm soát nhịp", passive: "Kỹ năng khống chế kéo dài thêm 8%." },
  HOA: { role: "burst", identity: "Bộc phát và thiêu đốt", passive: "Thiêu đốt gây thêm 12% sát thương theo thời gian." },
  THO: { role: "defender", identity: "Khiên, chống chịu và phản kích", passive: "Nhận 6% giảm sát thương khi dưới 50% HP." },
  QUANG: { role: "support", identity: "Thanh tẩy, tăng tốc và hỗ trợ", passive: "Hiệu ứng có lợi lên bản thân mạnh hơn 8%." },
  AM: { role: "attrition", identity: "Suy yếu, nguyền rủa và hút lực", passive: "Mục tiêu bị nguyền chịu thêm 8% sát thương." },
  PHONG: { role: "mobility", identity: "Cơ động, né tránh và đẩy lùi", passive: "Nhận 5% tốc độ di chuyển trong giao tranh." },
  LOI: { role: "chain_burst", identity: "Liên kích và choáng ngắn", passive: "Mỗi mục tiêu bị đánh trúng tăng 3% chí mạng, tối đa 3 lần." },
};

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
].map(([id, name, emoji, color, bg]) => ({ id, name, emoji, color, bg, ...rootDesign[id] }));

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

// Bộ kỹ năng cân bằng cho MVP: mỗi linh căn có đúng 5 vị trí, cùng một ngân sách.
// Tier 1/1 là nhập môn, 2/2 là bản sắc, tier 3 là tuyệt kỹ. Server là nguồn sự thật.
const skillBlueprints = {
  KIM: [["KIM_KICH", "Kim Kích", "⚔️", 1.15], ["THIET_HO", "Thiết Hộ", "🛡️", 0, "shield", 15], ["PHA_GIAP", "Phá Giáp", "🗡️", 1.35, "armor_break", 15], ["KIM_LUAN", "Kim Luân", "⚙️", 1.2, "slow", 15], ["VAN_KIM_TRAM", "Vạn Kim Trảm", "☄️", 2.2, "stun", 1.2]],
  MOC: [["MOC_DUONG", "Mộc Dưỡng", "🌿", 0, "heal", 30], ["RE_MOC", "Rễ Mộc", "🌱", 1.0, "root", 1.2], ["SINH_TRUONG", "Sinh Trưởng", "🍃", 0, "heal", 55], ["MOC_LAO", "Mộc Lao", "🌳", 1.15, "root", 1.8], ["VAN_MOC_THANH", "Vạn Mộc Thành", "🌲", 1.9, "heal", 70]],
  THUY: [["BANG_TIEN", "Băng Tiễn", "❄️", 1.1, "slow", 15], ["THUY_KHIEN", "Thủy Khiên", "💧", 0, "shield", 12], ["HAN_TRI", "Hàn Trì", "🧊", 1.25, "slow", 25], ["THUY_LUU", "Thủy Lưu", "🌊", 1.15, "root", 1.1], ["CUU_THIEN_BANG", "Cửu Thiên Băng", "🌨️", 2.0, "slow", 35]],
  HOA: [["HOA_CAU", "Hỏa Cầu", "🔥", 1.4], ["HOA_YEM", "Hỏa Yểm", "🕯️", 0.95, "burn", 18], ["LIEN_HOA", "Liên Hoa Hỏa", "🌺", 1.3, "burn", 25], ["PHAN_THIEN", "Phần Thiên", "☀️", 1.2, "burn", 30], ["THIEN_HOA_LIEN", "Thiên Hỏa Liên", "🌋", 2.05, "burn", 45]],
  THO: [["THO_KICH", "Thổ Kích", "🪨", 1.05], ["THO_GIAP", "Thổ Giáp", "🛡️", 0, "shield", 20], ["SON_CHAN", "Sơn Chấn", "⛰️", 1.3, "stun", 0.8], ["DIA_MACH", "Địa Mạch", "🌍", 0, "heal", 35], ["SON_HA_DAI_THAN", "Sơn Hà Đại Thân", "🏔️", 1.85, "shield", 35]],
  QUANG: [["QUANG_DAO", "Quang Đao", "✨", 1.1], ["TINH_LOC", "Tinh Lộc", "🌟", 0, "heal", 25], ["THANH_TAY", "Thanh Tẩy", "💫", 0, "cleanse", 1], ["QUANG_TOC", "Quang Tốc", "⚡", 1.1, "speed", 20], ["THIEN_QUANG", "Thiên Quang Phổ Chiếu", "🌞", 1.8, "heal", 65]],
  AM: [["AM_THICH", "Ám Thích", "🌑", 1.25], ["AM_CHU", "Ám Chú", "🕸️", 0.85, "curse", 15], ["THUC_HON", "Thực Hồn", "👁️", 1.2, "slow", 20], ["U_MINH", "U Minh", "🌘", 1.15, "curse", 25], ["CỬU_U_AM_GIOI", "Cửu U Ám Giới", "🌌", 2.0, "curse", 40]],
  PHONG: [["PHONG_NHAN", "Phong Nhẫn", "💨", 1.1], ["THANH_PHONG", "Thanh Phong", "🍃", 0, "speed", 25], ["PHONG_BO", "Phong Bộ", "🌀", 1.15, "slow", 15], ["LOAN_PHONG", "Loạn Phong", "🌪️", 1.2, "root", 0.9], ["CUU_TANG_PHONG", "Cửu Tầng Phong", "🌬️", 1.95, "stun", 1.0]],
  LOI: [["LOI_KICH", "Lôi Kích", "⚡", 1.25], ["LOI_HO", "Lôi Hộ", "🔰", 0, "shield", 10], ["DIEN_LIEN", "Điện Liên", "🔗", 1.2, "stun", 0.6], ["THIEN_LOI", "Thiên Lôi", "🌩️", 1.25, "stun", 0.8], ["VAN_LOI_THIEN_PHAT", "Vạn Lôi Thiên Phạt", "🌩️", 2.0, "stun", 1.1]],
};

const balancedSkills = Object.entries(skillBlueprints).flatMap(([linhCan, entries], rootIndex) =>
  entries.map(([code, name, icon, damage, effect = "", effectVal = 0], index) => ({
    id: 100 + rootIndex * 10 + index,
    code,
    name,
    icon,
    linhCan,
    tier: index < 2 ? 1 : index < 4 ? 2 : 3,
    mpTieuHao: [5, 8, 12, 17, 28][index],
    hoiChieu: [2, 8, 6, 12, 26][index],
    range: [5, 3, 5, 4, 6][index],
    type: ["KIM", "THO", "PHONG", "LOI"].includes(linhCan) ? "PHYS" : "MAGIC",
    satThuong: damage,
    dienRong: index >= 3 ? (index === 4 ? 2.5 : 1.8) : 0,
    effect,
    effectVal,
    thoiGianBuff: effect === "stun" || effect === "root" ? effectVal : 4,
    moTa: `${name}: kỹ năng ${rootDesign[linhCan].identity.toLowerCase()}.`,
  })),
);

const commonSkills = [
  ["THIEN_CANH", "Thiền Cảnh", "🧘", 0, "heal", 18],
  ["NGU_HANH_KICH", "Ngũ Hành Kích", "✦", 1.0, "", 0],
  ["THANH_TAM", "Thanh Tâm", "💠", 0, "cleanse", 1],
  ["BO_PHAP_CO_BAN", "Bộ Pháp Cơ Bản", "👣", 0, "speed", 12],
  ["HO_THAN", "Hộ Thân", "🔰", 0, "shield", 8],
  ["TAP_TRUNG", "Tập Trung", "🎯", 0, "buff_crit", 5],
].map(([code, name, icon, damage, effect, effectVal], index) => ({
  id: 300 + index, code, name, icon, linhCan: "COMMON", category: "ACTIVE", tier: 1,
  mpTieuHao: [4, 5, 7, 8, 10, 12][index], hoiChieu: [3, 2, 8, 10, 12, 15][index],
  range: 4, type: "COMMON", satThuong: damage, effect, effectVal, thoiGianBuff: 4,
  moTa: "Thần thông cơ bản, mọi tu sĩ đều có thể học.",
}));

const passiveSkills = roots.map((root, index) => ({
  id: 400 + index,
  code: `${root.id}_TAM_PHAP`,
  name: `${root.name} Tâm Pháp`,
  icon: root.emoji,
  linhCan: root.id,
  category: "PASSIVE",
  tier: 1,
  effect: "passive",
  effectVal: 3 + index % 3,
  moTa: `Bị động: ${root.passive}`,
}));

const skillCatalog = [...commonSkills, ...balancedSkills, ...passiveSkills];

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

module.exports = { realms, roots, items, skills: skillCatalog, commonSkills, passiveSkills, monsterDefs, worlds };
