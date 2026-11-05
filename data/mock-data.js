// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: data/mock-data.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Kho dữ liệu mẫu in-memory (In-Memory Game Database): Chứa toàn bộ định nghĩa gốc về
//      Cảnh giới (realms), Linh căn (roots), Vật phẩm & trang bị (items), Thần thông (skills),
//      Quái vật (monsterDefs), Bảng rơi đồ (lootTables), Bãi quái (monsterSpawns), và 2 bản đồ
//      chuẩn micro-grid 600x400 tiles (Thanh Vân Trấn & Bình Nguyên Hoang Dã) cùng thuật toán tạo địa hình procedural.
// 2. CẤU HÌNH LIÊN QUAN:
//    - TILE_W (600), TILE_H (400).
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Giúp dự án chạy độc lập và cực nhanh mà chưa cần cài đặt Database quan hệ phức tạp.
//    - Đảm bảo data nhỏ, logic chặt chẽ, tạo khuôn schema chuẩn để sau này Backend dựng DB theo khuôn này ngay.
// ════════════════════════════════════════════════════════════════════════════════════════

const TILE_W = 600;
const TILE_H = 400;
const { calcTuViNeeded, breakthroughThreshold, minimumBreakthroughOvr } = require("./balance");

function hashSeed(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function randomAt(x, y, seed) {
  let value = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(value) { return value * value * (3 - 2 * value); }
function mix(a, b, amount) { return a + (b - a) * amount; }

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = smooth(x - x0), ty = smooth(y - y0);
  const top = mix(randomAt(x0, y0, seed), randomAt(x0 + 1, y0, seed), tx);
  const bottom = mix(randomAt(x0, y0 + 1, seed), randomAt(x0 + 1, y0 + 1, seed), tx);
  return mix(top, bottom, ty);
}

function fbm(x, y, seed) {
  let total = 0, amplitude = .55, frequency = 1, weight = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 971) * amplitude;
    weight += amplitude;
    amplitude *= .5;
    frequency *= 2;
  }
  return total / weight;
}

function clearCircle(ground, objects, elevation, cx, cy, radius, groundTile = 0) {
  for (let y = Math.max(0, cy - radius); y <= Math.min(TILE_H - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(TILE_W - 1, cx + radius); x += 1) {
      if (Math.hypot(x - cx, y - cy) > radius) continue;
      ground[y][x] = groundTile;
      objects[y][x] = -1;
      elevation[y][x] = Math.min(1, elevation[y][x]);
    }
  }
}

function makeTerrain(kind) {
  const seed = hashSeed(kind);
  const ground = Array.from({ length: TILE_H }, () => Array(TILE_W).fill(0));
  const objects = Array.from({ length: TILE_H }, () => Array(TILE_W).fill(-1));
  const elevation = Array.from({ length: TILE_H }, () => Array(TILE_W).fill(0));
  const city = kind === "thanh_van_tran";

  for (let y = 0; y < TILE_H; y += 1) {
    for (let x = 0; x < TILE_W; x += 1) {
      const high = fbm(x / 118, y / 118, seed);
      const moisture = fbm(x / 92 + 9, y / 92 - 7, seed ^ 0x9e3779b9);
      const detail = randomAt(x, y, seed ^ 0x85ebca6b);
      elevation[y][x] = high > .73 ? 3 : high > .61 ? 2 : high > .48 ? 1 : 0;

      if (city) {
        if (moisture > .64 && detail > .16) objects[y][x] = 5;
        if (high > .74) { ground[y][x] = 1; objects[y][x] = 6; }
      } else if (high > .72) {
        ground[y][x] = 1;
        objects[y][x] = 6;
      } else if (high > .64) {
        ground[y][x] = 1;
      } else if (moisture > .59 && detail > .08) {
        objects[y][x] = 5;
      }
    }
  }

  if (city) {
    const left = 205, right = 425, top = 125, bottom = 275, wall = 5;
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      ground[y][x] = (Math.abs(x - 315) < 10 || Math.abs(y - 200) < 10) ? 7 : 4;
      objects[y][x] = -1;
      elevation[y][x] = 0;
      const onWall = x < left + wall || x > right - wall || y < top + wall || y > bottom - wall;
      const eastGate = x > right - wall && Math.abs(y - 200) < 18;
      const westGate = x < left + wall && Math.abs(y - 200) < 18;
      if (onWall && !eastGate && !westGate) objects[y][x] = 3;
    }
    for (let x = 12; x < TILE_W - 8; x += 1) for (let y = 192; y <= 208; y += 1) {
      ground[y][x] = 4; objects[y][x] = -1; elevation[y][x] = 0;
    }
    clearCircle(ground, objects, elevation, 300, 200, 24, 7);
    clearCircle(ground, objects, elevation, 590, 200, 14, 4);
  } else {
    const phase = randomAt(1, 1, seed) * Math.PI * 2;
    for (let y = 0; y < TILE_H; y += 1) {
      const center = TILE_W * .48 + Math.sin(y * .022 + phase) * 58 + (valueNoise(y * .025, 4.7, seed) - .5) * 86;
      const width = 13 + Math.round(valueNoise(y * .04, 9.2, seed) * 9);
      for (let x = Math.floor(center - width); x <= Math.ceil(center + width); x += 1) {
        if (ground[y]?.[x] === undefined) continue;
        ground[y][x] = 2; objects[y][x] = -1; elevation[y][x] = 0;
      }
    }
    for (let x = 8; x < TILE_W - 12; x += 1) {
      const pathY = Math.round(200 + Math.sin(x * .026 + phase) * 11);
      for (let y = pathY - 4; y <= pathY + 4; y += 1) {
        if (ground[y]?.[x] === undefined) continue;
        ground[y][x] = 4; objects[y][x] = -1; elevation[y][x] = 0;
      }
    }
    for (const bridgeY of [90, 200, 315]) {
      const center = TILE_W * .48 + Math.sin(bridgeY * .022 + phase) * 58 + (valueNoise(bridgeY * .025, 4.7, seed) - .5) * 86;
      for (let y = bridgeY - 6; y <= bridgeY + 6; y += 1) for (let x = Math.floor(center - 38); x <= Math.ceil(center + 38); x += 1) {
        if (ground[y]?.[x] === undefined) continue;
        ground[y][x] = 4; objects[y][x] = -1; elevation[y][x] = 0;
      }
    }
    for (const [x, y, radius] of [[20, 200, 20], [80, 200, 24], [340, 280, 30], [500, 110, 26]]) {
      clearCircle(ground, objects, elevation, x, y, radius, 0);
    }
  }

  for (let x = 0; x < TILE_W; x += 1) for (let edge = 0; edge < 3; edge += 1) {
    objects[edge][x] = 6; objects[TILE_H - 1 - edge][x] = 6;
  }
  for (let y = 0; y < TILE_H; y += 1) for (let edge = 0; edge < 3; edge += 1) {
    objects[y][edge] = 6; objects[y][TILE_W - 1 - edge] = 6;
  }
  const collision = ground.map((row, y) => row.map((tile, x) => objects[y][x] >= 0 ? objects[y][x] : tile));
  return { ground, objects, elevation, collision };
}

const realmDefinitions = [
  { id: 1, stt: 1, code: "LUYEN_THE", tenCanhGioi: "Luyện Thể", soTang: 9, heSoTang: 1.24, moTa: "Rèn luyện thân thể, đặt nền móng tu tiên.", danPhaCanh: "DAN_PHI_THANG" },
  { id: 2, stt: 2, code: "KHI_DONG", tenCanhGioi: "Khí Động", soTang: 9, heSoTang: 1.24, moTa: "Cảm nhận linh khí, khai mở kinh mạch và vận hành chu thiên.", danPhaCanh: "DAN_KHI_NGUNG" },
  { id: 3, stt: 3, code: "LY_HOP", tenCanhGioi: "Ly Hợp", soTang: 9, heSoTang: 1.24, moTa: "Linh lực ly hợp tùy tâm, thân và khí bắt đầu hòa làm một.", danPhaCanh: "DAN_LY_HOP" },
  { id: 4, stt: 4, code: "CHAN_NGUYEN", tenCanhGioi: "Chân Nguyên", soTang: 9, heSoTang: 1.24, moTa: "Linh khí ngưng luyện thành chân nguyên bền vững.", danPhaCanh: "DAN_CHAN_NGUYEN" },
  { id: 5, stt: 5, code: "THAN_DU", tenCanhGioi: "Thần Du", soTang: 9, heSoTang: 1.24, moTa: "Thần thức có thể rời thân, cảm ứng thiên địa ở khoảng cách xa.", danPhaCanh: "DAN_THAN_HANH" },
  { id: 6, stt: 6, code: "SIEU_PHAM", tenCanhGioi: "Siêu Phàm", soTang: 9, heSoTang: 1.24, moTa: "Vượt khỏi giới hạn phàm thể, sinh mệnh bước sang tầng thứ mới.", danPhaCanh: "DAN_SIEU_PHAM" },
  { id: 7, stt: 7, code: "NHAP_THANH", tenCanhGioi: "Nhập Thánh", soTang: 9, heSoTang: 1.24, moTa: "Chạm tới thánh đạo, pháp tắc bắt đầu hiện hình.", danPhaCanh: "DAN_THANH_VI" },
  { id: 8, stt: 8, code: "THANH_VUONG", tenCanhGioi: "Thánh Vương", soTang: 9, heSoTang: 1.24, moTa: "Thánh lực viên mãn, đủ sức thống lĩnh một phương.", danPhaCanh: "DAN_HU_KHONG" },
  { id: 9, stt: 9, code: "DONG_HU", tenCanhGioi: "Động Hư", soTang: 9, heSoTang: 1.24, moTa: "Nhìn thấu hư không, lĩnh ngộ khe nứt và quy luật không gian.", danPhaCanh: "DAN_HU_VUONG" },
  { id: 10, stt: 10, code: "HU_VUONG", tenCanhGioi: "Hư Vương", soTang: 9, heSoTang: 1.24, moTa: "Làm chủ hư không, một niệm có thể vượt qua khoảng cách lớn.", danPhaCanh: "DAN_DAI_DAO" },
  { id: 11, stt: 11, code: "DAO_NGUYEN", tenCanhGioi: "Đạo Nguyên", soTang: 9, heSoTang: 1.24, moTa: "Truy nguyên đại đạo, cô đọng đạo lực của bản thân.", danPhaCanh: "DAN_DE_NGUYEN" },
  { id: 12, stt: 12, code: "DE_TON", tenCanhGioi: "Đế Tôn", soTang: 9, heSoTang: 1.24, moTa: "Đạo lực hóa đế uy, đứng trên đỉnh của muôn pháp.", danPhaCanh: "DAN_DAI_DE" },
  { id: 13, stt: 13, code: "DAI_DE", tenCanhGioi: "Đại Đế", soTang: 1, heSoTang: 1.24, moTa: "Cảnh giới tối cao hiện tại, đại đạo quy nhất.", danPhaCanh: null },
];

// Schema tầng tu vi dùng chung cho mock API và database thật sau này.
const realms = realmDefinitions.map((realm, realmIndex) => ({
  ...realm,
  tuViTienCap: calcTuViNeeded(realm, 1),
  tangTuVi: Array.from({ length: Number(realm.soTang || 9) }, (_, index) => {
    const tang = index + 1;
    const toiCao = realmIndex === realmDefinitions.length - 1 && tang === Number(realm.soTang || 9);
    const daiCanhGioi = !toiCao && tang === Number(realm.soTang || 9);
    const tangDich = daiCanhGioi ? 1 : tang + 1;
    const canhGioiDich = daiCanhGioi ? realm.stt + 1 : realm.stt;
    const realmDich = daiCanhGioi ? { ...realm, stt: canhGioiDich } : realm;
    return {
      id: `${realm.code}_T${tang}`,
      stt: tang,
      tenTang: `Tầng ${tang}`,
      code: `${realm.code}_T${tang}`,
      tuViCan: calcTuViNeeded(realm, tang),
      nguongDotPha: toiCao ? null : breakthroughThreshold(realm, tang),
      // Mục tiêu tiếp theo được ghi rõ để client không hiểu nhầm nguongDotPha là tầng đích.
      mucTieu: toiCao ? null : (daiCanhGioi ? `Cảnh giới ${canhGioiDich} - Tầng 1` : `Tầng ${tangDich}`),
      tuViCanMucTieuTiepTheo: toiCao ? null : calcTuViNeeded(realmDich, tangDich),
      tangDich: toiCao ? null : tangDich,
      canhGioiDich: toiCao ? null : canhGioiDich,
      ovrToiThieu: toiCao ? null : minimumBreakthroughOvr(realm, tang, daiCanhGioi),
      daiCanhGioi,
      toiCao,
    };
  }),
}));

const rootDesign = {
  KIM: { role: "single_target", polarity: "YANG", identity: "Sát thương đơn và xuyên giáp", passive: "Mỗi đòn đánh thứ 4 gây thêm 10% sát thương." },
  MOC: { role: "sustain", polarity: "YIN", identity: "Hồi phục, trói chân và đánh lâu dài", passive: "Hồi 2% HP tối đa sau mỗi lần dùng kỹ năng." },
  THUY: { role: "control", polarity: "YIN", identity: "Tầm xa, làm chậm và kiểm soát nhịp", passive: "Kỹ năng khống chế kéo dài thêm 8%." },
  HOA: { role: "burst", polarity: "YANG", identity: "Bộc phát và thiêu đốt", passive: "Thiêu đốt gây thêm 12% sát thương theo thời gian." },
  THO: { role: "defender", polarity: "BALANCED", identity: "Khiên, chống chịu và phản kích", passive: "Nhận 6% giảm sát thương khi dưới 50% HP." },
  QUANG: { role: "support", polarity: "YANG", identity: "Thanh tẩy, tăng tốc và hỗ trợ", passive: "Hiệu ứng có lợi lên bản thân mạnh hơn 8%." },
  AM: { role: "attrition", polarity: "YIN", identity: "Suy yếu, nguyền rủa và hút lực", passive: "Mục tiêu bị nguyền chịu thêm 8% sát thương." },
  PHONG: { role: "mobility", polarity: "YANG", identity: "Cơ động, né tránh và đẩy lùi", passive: "Nhận 5% tốc độ di chuyển trong giao tranh." },
  LOI: { role: "chain_burst", polarity: "YANG", identity: "Liên kích và choáng ngắn", passive: "Mỗi mục tiêu bị đánh trúng tăng 3% chí mạng, tối đa 3 lần." },
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

const breakthroughPills = [
  ["DAN_PHI_THANG", "Phi Thăng Đan", "KHI_DONG", "Luyện Thể", "Khí Động"],
  ["DAN_KHI_NGUNG", "Khí Ngưng Đan", "LY_HOP", "Khí Động", "Ly Hợp"],
  ["DAN_LY_HOP", "Ly Hợp Đan", "CHAN_NGUYEN", "Ly Hợp", "Chân Nguyên"],
  ["DAN_CHAN_NGUYEN", "Chân Nguyên Đan", "THAN_DU", "Chân Nguyên", "Thần Du"],
  ["DAN_THAN_HANH", "Thần Hành Đan", "SIEU_PHAM", "Thần Du", "Siêu Phàm"],
  ["DAN_SIEU_PHAM", "Siêu Phàm Đan", "NHAP_THANH", "Siêu Phàm", "Nhập Thánh"],
  ["DAN_THANH_VI", "Thánh Vị Đan", "THANH_VUONG", "Nhập Thánh", "Thánh Vương"],
  ["DAN_HU_KHONG", "Hư Không Đan", "DONG_HU", "Thánh Vương", "Động Hư"],
  ["DAN_HU_VUONG", "Hư Vương Đan", "HU_VUONG", "Động Hư", "Hư Vương"],
  ["DAN_DAI_DAO", "Đại Đạo Nguyên Đan", "DAO_NGUYEN", "Hư Vương", "Đạo Nguyên"],
  ["DAN_DE_NGUYEN", "Đế Nguyên Đan", "DE_TON", "Đạo Nguyên", "Đế Tôn"],
  ["DAN_DAI_DE", "Đại Đế Hóa Thân", "DAI_DE", "Đế Tôn", "Đại Đế"],
].map(([id, name, realmCode, fromRealm, toRealm]) => ({
  id,
  maDo: id,
  tenDo: name,
  name,
  icon: "🔴",
  loai: "BREAKTHROUGH_PILL",
  type: "BREAKTHROUGH_PILL",
  realmCode,
  giaMua: 0,
  giaBan: 0,
  moTa: `Đan dược đặc thù để đột phá từ ${fromRealm} lên ${toRealm}.`,
}));

const items = [
  { id: "STONE_LINH_NHO", maDo: "STONE_LINH_NHO", tenDo: "Linh Thạch Nhỏ", name: "Linh Thạch Nhỏ", icon: "💎", loai: "STONE", type: "STONE", giaTriTuVi: 120, giaMua: 20, giaBan: 10, moTa: "Một viên linh thạch chứa linh khí non trẻ." },
  { id: "HUYET_NGOC_NHO", maDo: "HUYET_NGOC_NHO", tenDo: "Huyết Ngọc Nhỏ", name: "Huyết Ngọc Nhỏ", icon: "🧪", loai: "POTION", type: "POTION", healHp: 60, giaMua: 30, giaBan: 15, moTa: "Hồi phục một lượng HP." },
  { id: "POTION_TIEU_HOAN", maDo: "POTION_TIEU_HOAN", tenDo: "Tiểu Hoàn Đan", name: "Tiểu Hoàn Đan", icon: "💊", loai: "POTION", type: "POTION", healHp: 120, giaMua: 25, giaBan: 12, moTa: "Đan dược sơ cấp hồi phục nhanh 120 điểm Khí Huyết (HP)." },
  { id: "POTION_TU_KHI", maDo: "POTION_TU_KHI", tenDo: "Tụ Khí Đan", name: "Tụ Khí Đan", icon: "🧪", loai: "POTION", type: "POTION", healMp: 70, giaMua: 30, giaBan: 15, moTa: "Đan dược ngưng tụ linh khí, hồi phục 70 điểm Pháp Lực (MP)." },
  { id: "POTION_TAY_TUY", maDo: "POTION_TAY_TUY", tenDo: "Tẩy Tủy Đan", name: "Tẩy Tủy Đan", icon: "🌟", loai: "CONSUME", type: "CONSUME", statBoost: 1, giaMua: 350, giaBan: 175, moTa: "Thần dược hoán cốt tẩy tủy, tăng ngẫu nhiên 1 điểm Tiềm Năng vĩnh viễn." },
  { id: "LINH_CAN_NGOC_TUY", maDo: "LINH_CAN_NGOC_TUY", tenDo: "Linh Căn Ngọc Tủy", name: "Linh Căn Ngọc Tủy", icon: "🔷", loai: "LINDAN", type: "LINDAN", tuViLinhCanVal: 80, giaMua: 180, giaBan: 90, moTa: "Thiên tài địa bảo tăng nhẹ tu vi linh căn." },
  { id: "THIEN_TAI_DIA_BAO", maDo: "THIEN_TAI_DIA_BAO", tenDo: "Thiên Tài Địa Bảo", name: "Thiên Tài Địa Bảo", icon: "💠", loai: "LINDAN", type: "LINDAN", tuViLinhCanVal: 220, giaMua: 520, giaBan: 260, moTa: "Tài nguyên hiếm, tăng tu vi linh căn có giới hạn." },
  { id: "MAT_LANG_NANH", maDo: "MAT_LANG_NANH", tenDo: "Nanh Hoang Sói", name: "Nanh Hoang Sói", icon: "🦴", loai: "MATERIAL", type: "MATERIAL", giaMua: 16, giaBan: 8, moTa: "Nanh vuốt sắc nhọn thu được từ Hoang Sói." },
  { id: "MAT_QUANG_SAT", maDo: "MAT_QUANG_SAT", tenDo: "Quặng Sắt Thô", name: "Quặng Sắt Thô", icon: "⛏️", loai: "MATERIAL", type: "MATERIAL", giaMua: 15, giaBan: 8, moTa: "Quặng sắt sơ cấp khai thác từ vách đá, dùng cho thợ rèn." },
  { id: "MAT_THAO_DUOC", maDo: "MAT_THAO_DUOC", tenDo: "Bạch Linh Thảo", name: "Bạch Linh Thảo", icon: "🌿", loai: "MATERIAL", type: "MATERIAL", giaMua: 12, giaBan: 6, moTa: "Thảo dược mọc ven sông rãnh, nguyên liệu luyện đan dược." },
  { id: "MAT_DA_THU", maDo: "MAT_DA_THU", tenDo: "Da Thú Dày", name: "Da Thú Dày", icon: "📜", loai: "MATERIAL", type: "MATERIAL", giaMua: 18, giaBan: 9, moTa: "Tấm da dày của heo rừng và hoang dã thú, dùng may trang bị." },
  { id: "WEAPON_KIEM_GO", maDo: "WEAPON_KIEM_GO", tenDo: "Kiếm Gỗ Tân Thủ", name: "Kiếm Gỗ Tân Thủ", icon: "🗡️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", requiredRealmStt: 1, giaMua: 30, giaBan: 15, stats: { pAtk: 5 }, moTa: "Kiếm gỗ đào sơ cấp cho tu sĩ mới nhập môn." },
  { id: "WEAPON_DAO_SAT", maDo: "WEAPON_DAO_SAT", tenDo: "Thiết Đao Thợ Rèn", name: "Thiết Đao Thợ Rèn", icon: "⚔️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", requiredRealmStt: 1, giaMua: 90, giaBan: 45, stats: { pAtk: 12 }, moTa: "Đao được rèn từ quặng sắt thô, sắc bén cứng cáp." },
  { id: "WEAPON_TRUC_KIEM", maDo: "WEAPON_TRUC_KIEM", tenDo: "Thanh Trúc Linh Kiếm", name: "Thanh Trúc Linh Kiếm", icon: "🌿", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", requiredRealmStt: 2, giaMua: 260, giaBan: 130, stats: { pAtk: 20, mAtk: 14 }, moTa: "Kiếm trúc khắc phù chú linh lực, uy lực bất phàm." },
  { id: "SWORD_BAO_KHI_1", maDo: "SWORD_BAO_KHI_1", tenDo: "Kiếm Bảo Khí", name: "Kiếm Bảo Khí", icon: "⚔️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", requiredRealmStt: 1, giaMua: 120, giaBan: 60, stats: { pAtk: 8 }, moTa: "Thanh kiếm nhập môn của tu sĩ." },
  { id: "HAT_NON_LA", maDo: "HAT_NON_LA", tenDo: "Nón Lá Tân Thủ", name: "Nón Lá Tân Thủ", icon: "👒", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", requiredRealmStt: 1, giaMua: 25, giaBan: 12, stats: { pDef: 3, maxHp: 20 }, moTa: "Nón lá đan từ cỏ tranh che mưa che nắng, tăng nhẹ sinh lực." },
  { id: "HAT_KHAN_COT_DA", maDo: "HAT_KHAN_COT_DA", tenDo: "Khăn Cột Da Sói", name: "Khăn Cột Da Sói", icon: "🐺", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", requiredRealmStt: 1, giaMua: 85, giaBan: 40, stats: { pDef: 6, agi: 2 }, moTa: "Khăn buộc đầu may từ da sói hoang, giúp thân pháp thêm linh hoạt." },
  { id: "ARMOR_AO_VAI", maDo: "ARMOR_AO_VAI", tenDo: "Áo Vải Thô Sơ", name: "Áo Vải Thô Sơ", icon: "🥋", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", requiredRealmStt: 1, giaMua: 40, giaBan: 20, stats: { pDef: 5, maxHp: 35 }, moTa: "Y phục may bằng vải thô mộc mạc của tu sĩ phàm nhân." },
  { id: "ARMOR_DAO_BAO_THANH_VAN", maDo: "ARMOR_DAO_BAO_THANH_VAN", tenDo: "Đạo Bào Thanh Vân", name: "Đạo Bào Thanh Vân", icon: "🎽", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", requiredRealmStt: 1, giaMua: 140, giaBan: 70, stats: { pDef: 10, mDef: 8, maxMp: 30 }, moTa: "Đạo bào đệ tử Thanh Vân Môn dệt từ tơ tằm linh khí." },
  { id: "PANTS_QUAN_VAI", maDo: "PANTS_QUAN_VAI", tenDo: "Quần Vải Tân Thủ", name: "Quần Vải Tân Thủ", icon: "👖", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "pants", requiredRealmStt: 1, giaMua: 30, giaBan: 15, stats: { pDef: 4, maxHp: 20 }, moTa: "Quần vải đơn sơ, dễ dàng vận động." },
  { id: "PANTS_QUAN_DA_THU", maDo: "PANTS_QUAN_DA_THU", tenDo: "Quần Da Heo Rừng", name: "Quần Da Heo Rừng", icon: "🐗", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "pants", requiredRealmStt: 1, giaMua: 95, giaBan: 45, stats: { pDef: 8, vit: 2 }, moTa: "Quần thuộc da heo rừng dày dặn, phòng ngự vững chắc." },
  { id: "BOOTS_GIAY_CO", maDo: "BOOTS_GIAY_CO", tenDo: "Giày Cỏ Sơ Nhập", name: "Giày Cỏ Sơ Nhập", icon: "👡", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "boots", requiredRealmStt: 1, giaMua: 25, giaBan: 12, stats: { spd: 4, pDef: 2 }, moTa: "Đôi giày cỏ dệt thủ công, nhẹ nhàng thanh thoát." },
  { id: "BOOTS_GIAY_DA_SOI", maDo: "BOOTS_GIAY_DA_SOI", tenDo: "Hành Vân Thú Hài", name: "Hành Vân Thú Hài", icon: "👞", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "boots", requiredRealmStt: 1, giaMua: 90, giaBan: 45, stats: { spd: 8, pDef: 4, agi: 1 }, moTa: "Đôi hài may bằng da thú, lướt nhanh tựa mây." },
  { id: "RING_DONG_TRAM", maDo: "RING_DONG_TRAM", tenDo: "Nhẫn Đồng Cổ", name: "Nhẫn Đồng Cổ", icon: "💍", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", requiredRealmStt: 1, giaMua: 65, giaBan: 30, stats: { pAtk: 4, pDef: 3 }, moTa: "Nhẫn đồng xanh khắc hoa văn tăng uy lực đòn đánh." },
  { id: "RING_THACH_ANH", maDo: "RING_THACH_ANH", tenDo: "Thạch Anh Giới Chỉ", name: "Thạch Anh Giới Chỉ", icon: "💎", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", requiredRealmStt: 2, giaMua: 170, giaBan: 85, stats: { mAtk: 8, maxMp: 40 }, moTa: "Nhẫn nạm đá thạch anh tự nhiên bồi dưỡng linh thức." },
  { id: "AMULET_NGOC_BOI", maDo: "AMULET_NGOC_BOI", tenDo: "Ngọc Bội Bình An", name: "Ngọc Bội Bình An", icon: "📿", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "amulet", requiredRealmStt: 1, giaMua: 80, giaBan: 40, stats: { maxHp: 50, maxMp: 25 }, moTa: "Mảnh ngọc bội trừ tà hộ thể, chúc phúc bình an." },
  { id: "BELT_DA_THO", maDo: "BELT_DA_THO", tenDo: "Đai Da Thô", name: "Đai Da Thô", icon: "🥋", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "belt", requiredRealmStt: 1, giaMua: 35, giaBan: 18, stats: { pDef: 3, maxHp: 30 }, moTa: "Thắt lưng da thú chắc chắn, nẹp chặt đan điền khí hải." },
  // ─────────────────────────────────────────────────────────────────────────
  // TRANG BỊ THEO LINH CĂN
  // Mỗi linh căn có weapon, armor, hat, ring và 1–2 slot phụ theo vai trò.
  // requiredRealmStt: 1 = Luyện Thể, 2 = Khí Động, 3 = Ly Hợp, 4 = Chân Nguyên
  // ─────────────────────────────────────────────────────────────────────────

  // ── KIM (Kim — đơn mục tiêu, xuyên giáp, str/pAtk) ──────────────────────
  { id: "KIM_WEAPON_THIET_KIEM", maDo: "KIM_THIET_KIEM", tenDo: "Thiết Kim Kiếm", name: "Thiết Kim Kiếm", icon: "⚔️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "KIM", requiredRealmStt: 1, giaMua: 110, giaBan: 55, stats: { pAtk: 14, str: 1 }, moTa: "Kiếm đúc từ quặng kim tinh, lưỡi kiếm sắc bén có thể xuyên qua sơ cấp giáp đồng." },
  { id: "KIM_WEAPON_BACH_KIM_KIEM", maDo: "KIM_BACH_KIM_KIEM", tenDo: "Bạch Kim Thần Kiếm", name: "Bạch Kim Thần Kiếm", icon: "🗡️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "KIM", requiredRealmStt: 2, giaMua: 380, giaBan: 190, stats: { pAtk: 30, str: 2 }, moTa: "Bạch kim tinh luyện ngàn lần, từng nhát chém khắc kim văn chấn hồn địch thủ." },
  { id: "KIM_ARMOR_THIET_GIAP", maDo: "KIM_THIET_GIAP", tenDo: "Giáp Thiết Nguyên", name: "Giáp Thiết Nguyên", icon: "🛡️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "KIM", requiredRealmStt: 1, giaMua: 130, giaBan: 65, stats: { pDef: 13, maxHp: 45 }, moTa: "Giáp đúc từ thiết bản nguyên chất, nặng chắc bảo vệ kiên cường." },
  { id: "KIM_ARMOR_BACH_KIM_GIAP", maDo: "KIM_BACH_KIM_GIAP", tenDo: "Bạch Kim Trấn Giáp", name: "Bạch Kim Trấn Giáp", icon: "🔩", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "KIM", requiredRealmStt: 2, giaMua: 420, giaBan: 210, stats: { pDef: 24, str: 2, maxHp: 60 }, moTa: "Giáp bạch kim luyện từ pháp bảo vật liệu, phòng ngự siêu việt mọi kim thuộc sơ cấp." },
  { id: "KIM_HAT_THIET_MU", maDo: "KIM_THIET_MU", tenDo: "Mũ Thiết Phiến", name: "Mũ Thiết Phiến", icon: "⛑️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "KIM", requiredRealmStt: 1, giaMua: 90, giaBan: 45, stats: { pDef: 8, str: 1 }, moTa: "Mũ trụ thiết phiến che chắn đầu, kích thích sức mạnh vật chất cho Kim tu sĩ." },
  { id: "KIM_RING_KIM_NHAN", maDo: "KIM_KIM_NHAN", tenDo: "Nhẫn Kim Tinh Luyện", name: "Nhẫn Kim Tinh Luyện", icon: "💍", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "KIM", requiredRealmStt: 1, giaMua: 100, giaBan: 50, stats: { pAtk: 7, str: 1 }, moTa: "Nhẫn đúc từ kim tinh cổ đại, khuếch đại sát thương đơn mục tiêu." },
  { id: "KIM_BOOTS_KIM_HAI", maDo: "KIM_KIM_HAI", tenDo: "Hài Kim Cương Trảm", name: "Hài Kim Cương Trảm", icon: "👢", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "boots", linhCan: "KIM", requiredRealmStt: 2, giaMua: 310, giaBan: 155, stats: { spd: 8, pDef: 6, str: 1 }, moTa: "Hài đúc kim cương, mỗi bước chân mang theo lực xuyên giáp vô hình." },

  // ── MỘC (Mộc — sustain, hồi phục, vit/maxHp) ─────────────────────────────
  { id: "MOC_WEAPON_CON_MU_LINH", maDo: "MOC_CON_MU_LINH", tenDo: "Côn Mộc Linh", name: "Côn Mộc Linh", icon: "🌿", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "MOC", requiredRealmStt: 1, giaMua: 100, giaBan: 50, stats: { pAtk: 9, maxHp: 40 }, moTa: "Côn gỗ linh được Mộc tu sĩ chú khắc dưỡng sinh pháp, mỗi đòn đánh hồi nhẹ sinh lực." },
  { id: "MOC_WEAPON_NGOC_TRUC_TRUONG", maDo: "MOC_NGOC_TRUC_TRUONG", tenDo: "Ngọc Trúc Trường Trượng", name: "Ngọc Trúc Trường Trượng", icon: "🎋", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "MOC", requiredRealmStt: 2, giaMua: 350, giaBan: 175, stats: { pAtk: 16, mAtk: 14, maxHp: 70, vit: 1 }, moTa: "Trượng ngọc trúc ngàn năm thấm linh khí đại địa, vừa tấn công vừa nuôi dưỡng sinh mệnh." },
  { id: "MOC_ARMOR_LINH_MOC_AO", maDo: "MOC_LINH_MOC_AO", tenDo: "Áo Linh Mộc Dưỡng", name: "Áo Linh Mộc Dưỡng", icon: "🌱", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "MOC", requiredRealmStt: 1, giaMua: 115, giaBan: 57, stats: { pDef: 8, maxHp: 55, vit: 1 }, moTa: "Áo dệt từ sợi linh thảo Mộc hệ, bọc cơ thể trong linh khí mộc dưỡng liên tục." },
  { id: "MOC_ARMOR_SINH_MOC_BAO", maDo: "MOC_SINH_MOC_BAO", tenDo: "Bào Sinh Mộc Vương", name: "Bào Sinh Mộc Vương", icon: "🌲", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "MOC", requiredRealmStt: 2, giaMua: 390, giaBan: 195, stats: { pDef: 17, maxHp: 90, vit: 2 }, moTa: "Bào bọc từ vỏ cây Mộc Vương linh thụ, hồi phục sinh lực từng khắc trong chiến đấu." },
  { id: "MOC_HAT_LIEN_HOA_MU", maDo: "MOC_LIEN_HOA_MU", tenDo: "Mũ Liên Hoa Mộc", name: "Mũ Liên Hoa Mộc", icon: "🌸", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "MOC", requiredRealmStt: 1, giaMua: 80, giaBan: 40, stats: { pDef: 5, maxHp: 38 }, moTa: "Mũ đan từ cành liên hoa linh mộc, trú dưỡng thần trí bình an trong trận." },
  { id: "MOC_RING_RE_LINH_NHAN", maDo: "MOC_RE_LINH_NHAN", tenDo: "Nhẫn Rễ Linh Mộc", name: "Nhẫn Rễ Linh Mộc", icon: "💚", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "MOC", requiredRealmStt: 1, giaMua: 95, giaBan: 47, stats: { maxHp: 65, vit: 1 }, moTa: "Nhẫn chạm khắc hình rễ cây cổ linh, tăng cường sinh lực và sức chịu đựng." },
  { id: "MOC_BELT_CO_LINH_DAI", maDo: "MOC_CO_LINH_DAI", tenDo: "Đai Cỏ Linh Căn", name: "Đai Cỏ Linh Căn", icon: "🌾", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "belt", linhCan: "MOC", requiredRealmStt: 1, giaMua: 70, giaBan: 35, stats: { pDef: 4, maxHp: 48, vit: 1 }, moTa: "Thắt lưng bện từ cỏ linh căn Mộc hệ, ổn định đan điền dưỡng sinh." },

  // ── THỦY (Thủy — control, tầm xa, ene/mAtk/maxMp) ───────────────────────
  { id: "THUY_WEAPON_THUY_LONG_TRUONG", maDo: "THUY_THUY_LONG_TRUONG", tenDo: "Thủy Long Trượng", name: "Thủy Long Trượng", icon: "💧", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "THUY", requiredRealmStt: 1, giaMua: 115, giaBan: 57, stats: { mAtk: 15, maxMp: 35 }, moTa: "Trượng ngọc thủy long, pháp lực xoáy băng lạnh khống chế đường trận." },
  { id: "THUY_WEAPON_HAI_TRIEU_KIEM", maDo: "THUY_HAI_TRIEU_KIEM", tenDo: "Hải Triều Linh Kiếm", name: "Hải Triều Linh Kiếm", icon: "🌊", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "THUY", requiredRealmStt: 2, giaMua: 400, giaBan: 200, stats: { mAtk: 28, ene: 2, maxMp: 60 }, moTa: "Kiếm mang linh khí sóng thần đại dương, mỗi chiêu đánh làm địch thủ chậm chân." },
  { id: "THUY_ARMOR_BANG_HA_AO", maDo: "THUY_BANG_HA_AO", tenDo: "Áo Băng Hà Linh", name: "Áo Băng Hà Linh", icon: "❄️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "THUY", requiredRealmStt: 1, giaMua: 120, giaBan: 60, stats: { pDef: 7, mDef: 11, maxMp: 45 }, moTa: "Áo dệt từ sợi băng hà linh, bảo vệ pháp lực và khuếch đại thủy thuật." },
  { id: "THUY_ARMOR_HAI_VUONG_BAO", maDo: "THUY_HAI_VUONG_BAO", tenDo: "Bào Hải Vương Linh", name: "Bào Hải Vương Linh", icon: "🌀", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "THUY", requiredRealmStt: 2, giaMua: 410, giaBan: 205, stats: { pDef: 15, mDef: 20, maxMp: 75, ene: 1 }, moTa: "Bào của Hải Vương đệ tử, trú tăng pháp lực như thủy triều dâng không ngừng." },
  { id: "THUY_HAT_BANG_TINH_MU", maDo: "THUY_BANG_TINH_MU", tenDo: "Mũ Băng Tinh", name: "Mũ Băng Tinh", icon: "🧊", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "THUY", requiredRealmStt: 1, giaMua: 85, giaBan: 42, stats: { pDef: 4, mDef: 7, maxMp: 32 }, moTa: "Mũ đúc từ tinh thể băng vĩnh cửu, tăng khả năng kiểm soát thủy thuật." },
  { id: "THUY_RING_THUY_NGOC_NHAN", maDo: "THUY_THUY_NGOC_NHAN", tenDo: "Nhẫn Thủy Tinh Ngọc", name: "Nhẫn Thủy Tinh Ngọc", icon: "💙", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "THUY", requiredRealmStt: 1, giaMua: 105, giaBan: 52, stats: { mAtk: 8, maxMp: 55 }, moTa: "Nhẫn thủy ngọc xanh thẫm, bồi dưỡng pháp lực và kéo dài khống chế." },
  { id: "THUY_AMULET_BANG_LINH_BOI", maDo: "THUY_BANG_LINH_BOI", tenDo: "Bội Băng Linh Hàn", name: "Bội Băng Linh Hàn", icon: "📿", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "amulet", linhCan: "THUY", requiredRealmStt: 2, giaMua: 350, giaBan: 175, stats: { mAtk: 12, maxMp: 65, ene: 1 }, moTa: "Bội đá băng hàn ngàn năm, chứa đựng linh lực thủy thuật cực hạn." },

  // ── HỎA (Hỏa — burst, thiêu đốt, ene/mAtk) ──────────────────────────────
  { id: "HOA_WEAPON_HOA_LINH_TRUONG", maDo: "HOA_HOA_LINH_TRUONG", tenDo: "Hỏa Linh Trượng", name: "Hỏa Linh Trượng", icon: "🔥", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "HOA", requiredRealmStt: 1, giaMua: 120, giaBan: 60, stats: { mAtk: 17 }, moTa: "Trượng kim cang ngậm hỏa linh thạch, phun hỏa cầu thiêu đốt thiên địa." },
  { id: "HOA_WEAPON_THIEN_VIEM_KIEM", maDo: "HOA_THIEN_VIEM_KIEM", tenDo: "Thiên Viêm Linh Kiếm", name: "Thiên Viêm Linh Kiếm", icon: "🌋", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "HOA", requiredRealmStt: 2, giaMua: 420, giaBan: 210, stats: { mAtk: 32, ene: 2 }, moTa: "Kiếm mang lửa thiên viêm không tắt, mỗi đòn thiêu đốt mục tiêu để lại dấu lửa." },
  { id: "HOA_ARMOR_HOA_LINH_AO", maDo: "HOA_HOA_LINH_AO", tenDo: "Áo Hỏa Linh", name: "Áo Hỏa Linh", icon: "🧡", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "HOA", requiredRealmStt: 1, giaMua: 115, giaBan: 57, stats: { pDef: 6, mDef: 8, mAtk: 6 }, moTa: "Áo thêu hỏa văn linh phù, không lo lửa thiêu và khuếch đại hỏa thuật bùng phát." },
  { id: "HOA_ARMOR_THIEN_YEM_BAO", maDo: "HOA_THIEN_YEM_BAO", tenDo: "Bào Thiên Yểm Hỏa", name: "Bào Thiên Yểm Hỏa", icon: "🔴", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "HOA", requiredRealmStt: 2, giaMua: 400, giaBan: 200, stats: { pDef: 13, mAtk: 14, ene: 1 }, moTa: "Bào luyện từ hoả tinh huyền thiết, thiêu đốt bùng phát liên tục không dứt." },
  { id: "HOA_HAT_LIET_HOA_MU", maDo: "HOA_LIET_HOA_MU", tenDo: "Mũ Liệt Hỏa", name: "Mũ Liệt Hỏa", icon: "🎩", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "HOA", requiredRealmStt: 1, giaMua: 85, giaBan: 42, stats: { pDef: 4, mAtk: 7 }, moTa: "Mũ đúc từ hỏa tinh cổ thạch, khuếch đại hỏa thuật bùng phát của Hỏa tu sĩ." },
  { id: "HOA_RING_HOA_TAM_NHAN", maDo: "HOA_HOA_TAM_NHAN", tenDo: "Nhẫn Hỏa Tâm", name: "Nhẫn Hỏa Tâm", icon: "🔴", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "HOA", requiredRealmStt: 1, giaMua: 105, giaBan: 52, stats: { mAtk: 10, ene: 1 }, moTa: "Nhẫn đá hỏa tâm rực lửa, cộng hưởng Hỏa linh căn khuếch đại sát thương tức thì." },
  { id: "HOA_PANTS_HOA_LINH_QUAN", maDo: "HOA_HOA_LINH_QUAN", tenDo: "Quần Hỏa Linh", name: "Quần Hỏa Linh", icon: "🩱", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "pants", linhCan: "HOA", requiredRealmStt: 1, giaMua: 75, giaBan: 37, stats: { pDef: 5, mAtk: 5 }, moTa: "Quần dệt hỏa sợi linh, không bắt lửa và tăng cường hỏa pháp bộc phát." },

  // ── THỔ (Thổ — defender, khiên, pDef/maxHp) ──────────────────────────────
  { id: "THO_WEAPON_DIA_CUI_THUONG", maDo: "THO_DIA_CUI_THUONG", tenDo: "Chùy Thổ Địa", name: "Chùy Thổ Địa", icon: "🪨", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "THO", requiredRealmStt: 1, giaMua: 100, giaBan: 50, stats: { pAtk: 12, pDef: 4 }, moTa: "Chùy sắt luyện từ thổ linh thạch, nặng chắc xốc trực tiếp vào kẻ địch bảo vệ đồng đội." },
  { id: "THO_WEAPON_SON_HA_TRUC_KIEM", maDo: "THO_SON_HA_TRUC_KIEM", tenDo: "Kiếm Sơn Hà", name: "Kiếm Sơn Hà", icon: "⛰️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "THO", requiredRealmStt: 2, giaMua: 380, giaBan: 190, stats: { pAtk: 23, vit: 2, pDef: 9 }, moTa: "Kiếm nặng luyện từ thiết thổ sơn hà, mỗi đòn chém mang nặng sức đất núi trùng." },
  { id: "THO_ARMOR_DIA_MACH_GIAP", maDo: "THO_DIA_MACH_GIAP", tenDo: "Giáp Địa Mạch", name: "Giáp Địa Mạch", icon: "🏔️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "THO", requiredRealmStt: 1, giaMua: 140, giaBan: 70, stats: { pDef: 17, maxHp: 65 }, moTa: "Giáp dày luyện từ địa mạch thạch linh, phòng ngự vô song cho Thổ tu sĩ tiền tuyến." },
  { id: "THO_ARMOR_CU_THACH_GIAP", maDo: "THO_CU_THACH_GIAP", tenDo: "Giáp Cự Thạch Vương", name: "Giáp Cự Thạch Vương", icon: "🗿", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "THO", requiredRealmStt: 2, giaMua: 480, giaBan: 240, stats: { pDef: 30, maxHp: 110, vit: 2 }, moTa: "Giáp đúc từ Cự Thạch Vương linh khoáng, bất bại trong mọi đòn tấn công sơ-trung cấp." },
  { id: "THO_HAT_THO_THAN_MU", maDo: "THO_THO_THAN_MU", tenDo: "Mũ Thổ Thần", name: "Mũ Thổ Thần", icon: "🪖", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "THO", requiredRealmStt: 1, giaMua: 95, giaBan: 47, stats: { pDef: 10, maxHp: 42 }, moTa: "Mũ trụ thổ thần linh khí, bảo vệ thần trí và tăng sức chịu đựng cho Thổ tu sĩ." },
  { id: "THO_RING_DAI_DIA_NHAN", maDo: "THO_DAI_DIA_NHAN", tenDo: "Nhẫn Đại Địa Linh", name: "Nhẫn Đại Địa Linh", icon: "🟤", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "THO", requiredRealmStt: 1, giaMua: 100, giaBan: 50, stats: { pDef: 6, maxHp: 55, vit: 1 }, moTa: "Nhẫn đất đại địa linh khoáng, căn cơ Thổ tu sĩ trở nên kiên cố như núi." },
  { id: "THO_BELT_CU_THACH_DAI", maDo: "THO_CU_THACH_DAI", tenDo: "Đai Cự Thạch Linh", name: "Đai Cự Thạch Linh", icon: "🧱", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "belt", linhCan: "THO", requiredRealmStt: 1, giaMua: 75, giaBan: 37, stats: { pDef: 7, maxHp: 52 }, moTa: "Đai đúc thạch linh đại địa, nẹp chặt cơ thể tạo lớp giáp linh khí bao bọc." },

  // ── QUANG (Quang — support, thanh tẩy, maxHp+maxMp cân bằng) ─────────────
  { id: "QUANG_WEAPON_QUANG_MINH_TRUONG", maDo: "QUANG_QUANG_MINH_TRUONG", tenDo: "Trượng Quang Minh", name: "Trượng Quang Minh", icon: "✨", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "QUANG", requiredRealmStt: 1, giaMua: 115, giaBan: 57, stats: { mAtk: 13, maxMp: 28 }, moTa: "Trượng ngọc quang minh toả ánh hào quang linh khí, tăng cường hiệu quả hỗ trợ đồng đội." },
  { id: "QUANG_WEAPON_THIEN_QUANG_KIEM", maDo: "QUANG_THIEN_QUANG_KIEM", tenDo: "Kiếm Thiên Quang", name: "Kiếm Thiên Quang", icon: "🌟", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "QUANG", requiredRealmStt: 2, giaMua: 390, giaBan: 195, stats: { mAtk: 25, ene: 2, maxMp: 50 }, moTa: "Kiếm chứa ánh thiên quang tinh khiết, mỗi nhát chém có thể thanh tẩy hiệu ứng tối tăm." },
  { id: "QUANG_ARMOR_ANH_DUONG_AO", maDo: "QUANG_ANH_DUONG_AO", tenDo: "Áo Ánh Dương Linh", name: "Áo Ánh Dương Linh", icon: "🌞", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "QUANG", requiredRealmStt: 1, giaMua: 120, giaBan: 60, stats: { pDef: 7, mDef: 10, maxMp: 38 }, moTa: "Áo thêu ánh dương linh, bảo vệ cơ thể và khuếch đại pháp thuật hỗ trợ." },
  { id: "QUANG_HAT_QUANG_MIEN", maDo: "QUANG_QUANG_MIEN", tenDo: "Miện Quang Minh", name: "Miện Quang Minh", icon: "👑", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "QUANG", requiredRealmStt: 1, giaMua: 88, giaBan: 44, stats: { pDef: 5, mDef: 6, maxHp: 32 }, moTa: "Miện đúc từ quang linh ngọc, khai thông thần trí để hỗ trợ hiệu quả hơn." },
  { id: "QUANG_RING_ANH_SANG_NHAN", maDo: "QUANG_ANH_SANG_NHAN", tenDo: "Nhẫn Ánh Sáng", name: "Nhẫn Ánh Sáng", icon: "⭐", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "QUANG", requiredRealmStt: 1, giaMua: 100, giaBan: 50, stats: { maxHp: 42, maxMp: 42 }, moTa: "Nhẫn quang linh cân bằng khí huyết và pháp lực, lý tưởng cho vai trò hỗ trợ." },
  { id: "QUANG_AMULET_QUANG_MINH_BOI", maDo: "QUANG_QUANG_MINH_BOI", tenDo: "Bội Quang Minh Hộ Thể", name: "Bội Quang Minh Hộ Thể", icon: "🌠", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "amulet", linhCan: "QUANG", requiredRealmStt: 1, giaMua: 115, giaBan: 57, stats: { maxHp: 58, mDef: 8 }, moTa: "Bội ngọc quang minh hộ thể, che chắn khỏi các hiệu ứng tối tăm nguy hiểm." },

  // ── ÁM (Ám — attrition, nguyền rủa, agi/mAtk) ────────────────────────────
  { id: "AM_WEAPON_AM_DA_DAO", maDo: "AM_AM_DA_DAO", tenDo: "Đao Ám Dạ", name: "Đao Ám Dạ", icon: "🌑", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "AM", requiredRealmStt: 1, giaMua: 105, giaBan: 52, stats: { pAtk: 10, mAtk: 9 }, moTa: "Đao đúc từ ám linh thạch đen sì, hai mặt: vật lý và pháp thuật đan xen ám hại." },
  { id: "AM_WEAPON_U_MINH_KIEM", maDo: "AM_U_MINH_KIEM", tenDo: "Kiếm U Minh Linh", name: "Kiếm U Minh Linh", icon: "🌘", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "AM", requiredRealmStt: 2, giaMua: 395, giaBan: 197, stats: { mAtk: 26, agi: 2 }, moTa: "Kiếm u minh thấm độc ám khí, mỗi nhát chém khắc dấu nguyền lên địch thủ." },
  { id: "AM_ARMOR_AM_LINH_AO", maDo: "AM_AM_LINH_AO", tenDo: "Áo Ám Linh Huyền", name: "Áo Ám Linh Huyền", icon: "🕷️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "AM", requiredRealmStt: 1, giaMua: 110, giaBan: 55, stats: { pDef: 7, mDef: 10, agi: 1 }, moTa: "Áo thêu ám huyền linh phù, giảm bị phát hiện và tăng cường hiệu lực nguyền rủa." },
  { id: "AM_HAT_AM_DA_MU", maDo: "AM_AM_DA_MU", tenDo: "Mũ Ám Dạ Hành", name: "Mũ Ám Dạ Hành", icon: "🎭", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "AM", requiredRealmStt: 1, giaMua: 82, giaBan: 41, stats: { pDef: 5, agi: 1, mAtk: 4 }, moTa: "Mũ ám dạ che giấu tung tích, Ám tu sĩ ẩn thân hoàn hảo giữa chiến trận." },
  { id: "AM_RING_AM_HON_NHAN", maDo: "AM_AM_HON_NHAN", tenDo: "Nhẫn Ám Hồn Linh", name: "Nhẫn Ám Hồn Linh", icon: "🖤", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "AM", requiredRealmStt: 1, giaMua: 98, giaBan: 49, stats: { mAtk: 8, agi: 1 }, moTa: "Nhẫn ám hồn linh thạch đen, khuếch đại sức mạnh nguyền rủa tích lũy dần theo thời gian." },
  { id: "AM_BOOTS_AM_HANH_HAI", maDo: "AM_AM_HANH_HAI", tenDo: "Hài Ám Hành Vô Ảnh", name: "Hài Ám Hành Vô Ảnh", icon: "🕵️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "boots", linhCan: "AM", requiredRealmStt: 1, giaMua: 88, giaBan: 44, stats: { spd: 8, agi: 2 }, moTa: "Hài thêu ám phù vô ảnh, Ám tu sĩ di chuyển không tiếng động tạo bất ngờ cho địch." },

  // ── PHONG (Phong — mobility, né tránh, agi/spd) ───────────────────────────
  { id: "PHONG_WEAPON_THANH_PHONG_KIEM", maDo: "PHONG_THANH_PHONG_KIEM", tenDo: "Kiếm Thanh Phong", name: "Kiếm Thanh Phong", icon: "💨", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "PHONG", requiredRealmStt: 1, giaMua: 108, giaBan: 54, stats: { pAtk: 11, agi: 2 }, moTa: "Kiếm thanh phong nhẹ như gió, lướt tấn công nhanh thoắt khó đỡ." },
  { id: "PHONG_WEAPON_CUONG_PHONG_KIEM", maDo: "PHONG_CUONG_PHONG_KIEM", tenDo: "Kiếm Cuồng Phong Linh", name: "Kiếm Cuồng Phong Linh", icon: "🌪️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "PHONG", requiredRealmStt: 2, giaMua: 380, giaBan: 190, stats: { pAtk: 22, agi: 3, spd: 5 }, moTa: "Kiếm cuồng phong vô hình, tốc độ công kích vượt qua mắt thường của địch thủ." },
  { id: "PHONG_ARMOR_PHONG_LINH_AO", maDo: "PHONG_PHONG_LINH_AO", tenDo: "Áo Phong Linh Vũ", name: "Áo Phong Linh Vũ", icon: "🌬️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "PHONG", requiredRealmStt: 1, giaMua: 110, giaBan: 55, stats: { pDef: 6, spd: 6, agi: 1 }, moTa: "Áo nhẹ dệt từ sợi phong linh, giúp Phong tu sĩ di chuyển tự do linh hoạt." },
  { id: "PHONG_HAT_THANH_PHONG_MU", maDo: "PHONG_THANH_PHONG_MU", tenDo: "Mũ Thanh Phong", name: "Mũ Thanh Phong", icon: "🪁", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "PHONG", requiredRealmStt: 1, giaMua: 78, giaBan: 39, stats: { pDef: 4, spd: 5, agi: 1 }, moTa: "Mũ nhẹ phong linh, giúp đầu óc tỉnh táo và phản xạ nhanh trong khi chiến đấu." },
  { id: "PHONG_RING_PHONG_HANH_NHAN", maDo: "PHONG_PHONG_HANH_NHAN", tenDo: "Nhẫn Phong Hành", name: "Nhẫn Phong Hành", icon: "💚", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "PHONG", requiredRealmStt: 1, giaMua: 95, giaBan: 47, stats: { agi: 3, spd: 6 }, moTa: "Nhẫn phong hành linh, tăng tốc độ và kỹ năng né tránh vượt bậc." },
  { id: "PHONG_BOOTS_PHONG_HANH_HAI", maDo: "PHONG_PHONG_HANH_HAI", tenDo: "Hài Phong Hành", name: "Hài Phong Hành", icon: "🌀", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "boots", linhCan: "PHONG", requiredRealmStt: 1, giaMua: 100, giaBan: 50, stats: { spd: 14, agi: 2 }, moTa: "Hài thêu phong văn hành pháp, Phong tu sĩ di chuyển nhanh như gió không để lại dấu chân." },

  // ── LÔI (Lôi — chain burst, liên kích, str+ene kết hợp) ──────────────────
  { id: "LOI_WEAPON_THIEN_LOI_TRUONG", maDo: "LOI_THIEN_LOI_TRUONG", tenDo: "Trượng Thiên Lôi", name: "Trượng Thiên Lôi", icon: "⚡", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "LOI", requiredRealmStt: 1, giaMua: 118, giaBan: 59, stats: { mAtk: 15, str: 1 }, moTa: "Trượng kim lôi dẫn điện thiên lôi, mỗi đòn đánh xuyên qua mục tiêu nổ lôi liên hoàn." },
  { id: "LOI_WEAPON_THIEN_LOI_KIEM", maDo: "LOI_THIEN_LOI_KIEM", tenDo: "Kiếm Thiên Lôi Linh", name: "Kiếm Thiên Lôi Linh", icon: "🌩️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", linhCan: "LOI", requiredRealmStt: 2, giaMua: 405, giaBan: 202, stats: { mAtk: 28, ene: 1, str: 1 }, moTa: "Kiếm mang điện lôi thiên định, mỗi chiêu sát thương lan rộng tới các mục tiêu gần nhau." },
  { id: "LOI_ARMOR_LOI_LINH_AO", maDo: "LOI_LOI_LINH_AO", tenDo: "Áo Lôi Linh Hành", name: "Áo Lôi Linh Hành", icon: "⛈️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", linhCan: "LOI", requiredRealmStt: 1, giaMua: 115, giaBan: 57, stats: { pDef: 8, mDef: 8 }, moTa: "Áo lôi linh cách điện nội bộ, hấp thụ một phần sét tấn công và phản hồi điện lực." },
  { id: "LOI_HAT_LOI_DIEN_MU", maDo: "LOI_LOI_DIEN_MU", tenDo: "Mũ Lôi Điện", name: "Mũ Lôi Điện", icon: "🌪️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", linhCan: "LOI", requiredRealmStt: 1, giaMua: 85, giaBan: 42, stats: { pDef: 5, mAtk: 6 }, moTa: "Mũ lôi điện thu thập điện khí thiên địa, khuếch đại sức mạnh liên kích điện." },
  { id: "LOI_RING_LOI_HANH_NHAN", maDo: "LOI_LOI_HANH_NHAN", tenDo: "Nhẫn Lôi Hành", name: "Nhẫn Lôi Hành", icon: "🔵", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", linhCan: "LOI", requiredRealmStt: 1, giaMua: 102, giaBan: 51, stats: { mAtk: 8, str: 1 }, moTa: "Nhẫn lôi hành lục linh thạch, tăng sức mạnh liên kích và thời gian choáng địch thủ." },
  { id: "LOI_PANTS_LOI_LINH_QUAN", maDo: "LOI_LOI_LINH_QUAN", tenDo: "Quần Lôi Linh", name: "Quần Lôi Linh", icon: "🩲", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "pants", linhCan: "LOI", requiredRealmStt: 1, giaMua: 78, giaBan: 39, stats: { pDef: 5, mDef: 6 }, moTa: "Quần dệt lôi linh sợi, dẫn điện an toàn cho cơ thể trong khi tung chiêu lôi thuật." },

  // ── CHUNG (COMMON — cân bằng mọi linh căn, realm 1–2) ────────────────────
  { id: "COM_WEAPON_BACH_TINH_KIEM", maDo: "COM_BACH_TINH_KIEM", tenDo: "Bạch Tinh Linh Kiếm", name: "Bạch Tinh Linh Kiếm", icon: "🔮", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", requiredRealmStt: 1, giaMua: 150, giaBan: 75, stats: { pAtk: 10, mAtk: 9 }, moTa: "Linh kiếm vô thuộc tính luyện từ tinh thạch bạch ngân, thích hợp cho mọi linh căn tu sĩ." },
  { id: "COM_WEAPON_NGUY_NGUYEN_KIEM", maDo: "COM_NGUY_NGUYEN_KIEM", tenDo: "Nguỵ Nguyên Vạn Hành Kiếm", name: "Nguỵ Nguyên Vạn Hành Kiếm", icon: "🌈", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", requiredRealmStt: 3, giaMua: 650, giaBan: 325, stats: { pAtk: 20, mAtk: 20, str: 1, ene: 1 }, moTa: "Kiếm vạn hành ngũ tinh luyện, hội tụ khí lực mọi linh căn, bậc tu sĩ cao cấp mới dùng được." },
  { id: "COM_ARMOR_LINH_KHI_AO", maDo: "COM_LINH_KHI_AO", tenDo: "Áo Linh Khí Vạn Dụng", name: "Áo Linh Khí Vạn Dụng", icon: "🎽", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", requiredRealmStt: 2, giaMua: 310, giaBan: 155, stats: { pDef: 13, mDef: 11, maxHp: 45, maxMp: 45 }, moTa: "Áo luyện từ linh khí ngũ hành cân bằng, phù hợp bảo vệ mọi hướng tu luyện." },
  { id: "COM_HAT_LINH_CAN_MU", maDo: "COM_LINH_CAN_MU", tenDo: "Mũ Linh Căn Chung", name: "Mũ Linh Căn Chung", icon: "🎓", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "hat", requiredRealmStt: 2, giaMua: 200, giaBan: 100, stats: { pDef: 8, mDef: 7, maxMp: 28 }, moTa: "Mũ linh căn trung tính tăng cường tư duy linh lực cho mọi hệ tu luyện." },
  { id: "COM_RING_LINH_NGOC_NHAN", maDo: "COM_LINH_NGOC_NHAN", tenDo: "Nhẫn Linh Ngọc", name: "Nhẫn Linh Ngọc", icon: "🔮", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "ring", requiredRealmStt: 2, giaMua: 220, giaBan: 110, stats: { pAtk: 5, mAtk: 6, maxHp: 32, maxMp: 32 }, moTa: "Nhẫn ngọc linh căn trung hòa năm hành, tăng đều cả vật lý lẫn pháp thuật." },
  { id: "COM_AMULET_HO_THE_BOI", maDo: "COM_HO_THE_BOI", tenDo: "Bội Hộ Thể Linh", name: "Bội Hộ Thể Linh", icon: "🧿", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "amulet", requiredRealmStt: 1, giaMua: 120, giaBan: 60, stats: { maxHp: 65, maxMp: 32, pDef: 4 }, moTa: "Bội hộ thể linh thông dụng, bảo vệ toàn diện cho mọi tu sĩ dù bất kể linh căn nào." },
  { id: "COM_BELT_LINH_CUONG_DAI", maDo: "COM_LINH_CUONG_DAI", tenDo: "Đai Linh Cương", name: "Đai Linh Cương", icon: "🔗", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "belt", requiredRealmStt: 2, giaMua: 185, giaBan: 92, stats: { pDef: 8, maxHp: 40, maxMp: 20 }, moTa: "Đai linh cương bền chắc cân bằng sinh lực và pháp lực, ai cũng có thể đeo." },
  { id: "COM_PANTS_LINH_VAN_QUAN", maDo: "COM_LINH_VAN_QUAN", tenDo: "Quần Linh Vân", name: "Quần Linh Vân", icon: "🩳", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "pants", requiredRealmStt: 1, giaMua: 95, giaBan: 47, stats: { pDef: 6, maxHp: 28, spd: 3 }, moTa: "Quần linh vân nhẹ nhàng vừa bảo vệ vừa tăng khả năng di chuyển cho bất kỳ tu sĩ nào." },
  { id: "COM_BOOTS_VAN_HANH_HAI", maDo: "COM_VAN_HANH_HAI", tenDo: "Hài Vạn Hành Linh", name: "Hài Vạn Hành Linh", icon: "👟", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "boots", requiredRealmStt: 1, giaMua: 100, giaBan: 50, stats: { spd: 7, pDef: 3, agi: 1 }, moTa: "Hài vạn hành linh thích hợp mọi địa hình, tu sĩ nào mang cũng tăng tốc độ hành quân." },

  ...breakthroughPills,
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
  KIM: [["KIM_KICH", "Kim Kích", "⚔️", 1.1], ["THIET_HO", "Thiết Hộ", "🛡️", 0, "shield", 15], ["PHA_GIAP", "Phá Giáp", "🗡️", 1.25, "armor_break", 15], ["KIM_LUAN", "Kim Luân", "⚙️", 0, "buff_atk", 25, 6], ["VAN_KIM_TRAM", "Vạn Kim Trảm", "☄️", 2.05, "stun", 1.2], ["KIM_SAT_THANH", "Kim Sát Thành", "🔶", 1.45, "armor_break", 20]],
  MOC: [["MOC_DUONG", "Mộc Dưỡng", "🌿", 0, "heal", 30], ["RE_MOC", "Rễ Mộc", "🌱", 1.0, "root", 1.2], ["SINH_TRUONG", "Sinh Trưởng", "🍃", 0, "buff_hp_regen", 8, 8], ["MOC_LAO", "Mộc Lao", "🌳", 1.15, "root", 1.8], ["VAN_MOC_THANH", "Vạn Mộc Thành", "🌲", 1.75, "root", 1.5], ["MOC_HON_DON", "Mộc Hồn Độn", "🪵", 1.35, "root", 2.0]],
  THUY: [["BANG_TIEN", "Băng Tiễn", "❄️", 1.0, "slow", 15], ["THUY_KHIEN", "Thủy Khiên", "💧", 0, "buff_vitals", 20, 8], ["HAN_TRI", "Hàn Trì", "🧊", 1.1, "slow", 25], ["THUY_LUU", "Thủy Lưu", "🌊", 1.0, "root", 1.1], ["CUU_THIEN_BANG", "Cửu Thiên Băng", "🌨️", 1.8, "slow", 35], ["THUYET_HAI", "Tuyết Hải", "🌊", 1.4, "slow", 40]],
  HOA: [["HOA_CAU", "Hỏa Cầu", "🔥", 1.3], ["HOA_YEM", "Hỏa Yểm", "🕯️", 0.9, "burn", 18], ["LIEN_HOA", "Liên Hoa Hỏa", "🌺", 1.2, "burn", 25], ["PHAN_THIEN", "Phần Thiên", "☀️", 0, "buff_crit", 20, 6], ["THIEN_HOA_LIEN", "Thiên Hỏa Liên", "🌋", 1.9, "burn", 45], ["HOA_VUC", "Hỏa Vực", "🔥", 1.5, "burn", 55]],
  THO: [["THO_KICH", "Thổ Kích", "🪨", 1.0], ["THO_GIAP", "Thổ Giáp", "🛡️", 0, "buff_def", 25, 8], ["SON_CHAN", "Sơn Chấn", "⛰️", 1.2, "stun", 0.8], ["DIA_MACH", "Địa Mạch", "🌍", 0, "buff_vitals", 18, 8], ["SON_HA_DAI_THAN", "Sơn Hà Đại Thân", "🏔️", 1.7, "stun", 1.1], ["THACH_LUYEN", "Thạch Luyện", "🪨", 1.35, "stun", 1.0]],
  QUANG: [["QUANG_DAO", "Quang Đao", "✨", 1.0], ["TINH_LOC", "Tinh Lộc", "🌟", 0, "heal", 25], ["THANH_TAY", "Thanh Tẩy", "💫", 0, "cleanse", 1], ["QUANG_TOC", "Quang Tốc", "⚡", 0, "buff_spd", 25, 6], ["THIEN_QUANG", "Thiên Quang Phổ Chiếu", "🌞", 1.7], ["NHAT_DIEM", "Nhất Diện Quang", "🔆", 1.4, "cleanse", 1]],
  AM: [["AM_THICH", "Ám Thích", "🌑", 1.15], ["AM_CHU", "Ám Chú", "🕸️", 0.8, "curse", 15], ["THUC_HON", "Thực Hồn", "👁️", 0, "buff_cast", 20, 6], ["U_MINH", "U Minh", "🌘", 1.0, "curse", 25], ["CỬU_U_AM_GIOI", "Cửu U Ám Giới", "🌌", 1.8, "curse", 40], ["AM_THUC", "Ám Thực", "🌑", 1.4, "curse", 50]],
  PHONG: [["PHONG_NHAN", "Phong Nhẫn", "💨", 1.0], ["THANH_PHONG", "Thanh Phong", "🍃", 0, "buff_spd", 25, 6], ["PHONG_BO", "Phong Bộ", "🌀", 1.05, "slow", 15], ["LOAN_PHONG", "Loạn Phong", "🌪️", 1.1, "root", 0.9], ["CUU_TANG_PHONG", "Cửu Tầng Phong", "🌬️", 1.85, "stun", 1.0], ["PHONG_LIEU", "Phong Liêu", "🌪️", 1.4, "slow", 20]],
  LOI: [["LOI_KICH", "Lôi Kích", "⚡", 1.15], ["LOI_HO", "Lôi Hộ", "🔰", 0, "shield", 10], ["DIEN_LIEN", "Điện Liên", "🔗", 1.1, "stun", 0.6], ["THIEN_LOI", "Thiên Lôi", "🌩️", 1.15, "stun", 0.8], ["VAN_LOI_THIEN_PHAT", "Vạn Lôi Thiên Phạt", "🌩️", 1.9, "stun", 1.1], ["LOI_VUC", "Lôi Vực", "⚡", 1.45, "slow", 30]],
};

const balancedSkills = Object.entries(skillBlueprints).flatMap(([linhCan, entries], rootIndex) =>
  entries.map(([code, name, icon, damage, effect = "", effectVal = 0, duration], index) => ({
    id: 100 + rootIndex * 10 + index,
    code,
    name,
    icon,
    linhCan,
    tier: index < 2 ? 1 : index < 4 ? 2 : 3,
    mpTieuHao: [5, 8, 12, 17, 28, 34][index],
    hoiChieu: [2, 8, 6, 12, 26, 30][index],
    range: [5, 3, 5, 4, 6, 5][index],
    type: ["KIM", "THO", "PHONG", "LOI"].includes(linhCan) ? "PHYS" : "MAGIC",
    category: "ACTIVE",
    targetType: damage > 0 ? "ENEMY" : "SELF",
    scalingStat: ["KIM", "THO", "PHONG", "LOI"].includes(linhCan) ? "str" : "ene",
    satThuong: damage,
    dienRong: index >= 3 && damage > 0 ? (index === 4 ? 2.5 : 1.8) : 0,
    effect,
    effectVal,
    thoiGianBuff: duration ?? (effect === "stun" || effect === "root" ? effectVal : 4),
    moTa: `${name}: kỹ năng ${rootDesign[linhCan].identity.toLowerCase()}.`,
    amDuong: rootDesign[linhCan].polarity,
  })),
);

const commonSkills = [
  ["THIEN_CANH", "Thiền Cảnh", "🧘", 0, "restore_mp", 18],
  ["NGU_HANH_KICH", "Ngũ Hành Kích", "✦", 1.0, "", 0],
  ["THANH_TAM", "Thanh Tâm", "💠", 0, "cleanse", 1],
].map(([code, name, icon, damage, effect, effectVal, duration = 4], index) => ({
  id: 300 + index, code, name, icon, linhCan: "COMMON", category: "ACTIVE", tier: 1,
  mpTieuHao: [4, 5, 7, 8, 10, 12, 12, 12, 10, 12, 10, 10][index], hoiChieu: [3, 2, 8, 10, 12, 15, 18, 18, 16, 20, 18, 18][index],
  range: 4, type: "COMMON", satThuong: damage, effect, effectVal, thoiGianBuff: duration,
  moTa: "Thần thông cơ bản, mọi tu sĩ đều có thể học.",
}));

const passiveDesign = {
  KIM: { name: "Kim Thể Chi Pháp", description: "Tăng 0.3% sát thương kỹ năng Kim mỗi cấp; tăng 0.5% xuyên giáp." , modifiers: { skillDamagePct: 0.003, pDefPenPct: 0.005 } },
  MOC: { name: "Mộc Linh Sinh Pháp", description: "Tăng 0.5% HP tối đa và 0.4% hồi HP mỗi cấp.", modifiers: { maxHpPct: 0.005, hpRegenPct: 0.004 } },
  THUY: { name: "Thủy Đức Hộ Thể", description: "Tăng 0.5% MP tối đa và 0.3% hiệu lực khiên/thể lực.", modifiers: { maxMpPct: 0.005, shieldPct: 0.003 } },
  HOA: { name: "Hỏa Tâm Liệt Ý", description: "Tăng 0.3% tỷ lệ chí mạng và 0.2% sát thương kỹ năng Hỏa.", modifiers: { critPct: 0.003, skillDamagePct: 0.002 } },
  THO: { name: "Hậu Thổ Chân Thân", description: "Tăng 0.5% phòng thủ và 0.4% HP tối đa mỗi cấp.", modifiers: { defensePct: 0.005, maxHpPct: 0.004 } },
  QUANG: { name: "Quang Minh Tịnh Tâm", description: "Tăng 0.3% tốc độ và 0.2% kháng hiệu ứng.", modifiers: { speedPct: 0.003, resistPct: 0.002 } },
  AM: { name: "U Ám Liễm Tức", description: "Giảm 0.3% thời gian hồi chiêu kỹ năng và tăng 0.2% sát thương Ám.", modifiers: { cooldownPct: 0.003, skillDamagePct: 0.002 } },
  PHONG: { name: "Phong Hành Vô Ảnh", description: "Tăng 0.5% tốc độ di chuyển và 0.2% sát thương kỹ năng Phong.", modifiers: { speedPct: 0.005, skillDamagePct: 0.002 } },
  LOI: { name: "Lôi Thể Chi Pháp", description: "Tăng 0.3% sát thương kỹ năng Lôi mỗi cấp; tăng 1% hiệu lực điện giật/làm chậm.", modifiers: { skillDamagePct: 0.003, statusEffectPct: 0.01 } },
};

const passiveSkills = roots.map((root, index) => ({
  id: 400 + index,
  code: `${root.id}_TAM_PHAP`,
  name: passiveDesign[root.id]?.name || `${root.name} Tâm Pháp`,
  icon: root.emoji,
  linhCan: root.id,
  category: "PASSIVE",
  tier: 1,
  effect: "passive",
  effectVal: 1,
  passiveModifiers: passiveDesign[root.id]?.modifiers || {},
  moTa: `Bị động tự áp dụng: ${passiveDesign[root.id]?.description || root.passive}`,
}));

const skillCatalog = [...commonSkills, ...balancedSkills, ...passiveSkills];

const monsterDefs = [
  { id: "MOC_NHAN", code: "MOC_NHAN", name: "Mộc Nhân Thung", icon: "🪵", img: "./assets/monsters/doc_thao_sheet.png", animation: { kind: "grid", cols: 4, rows: 4, width: 16, height: 16 }, type: "NORMAL", level: 1, linhCan: "MOC", nguHanh: ["MOC"], color: "#b3895d", hp: 60, maxHp: 60, mp: 20, maxMp: 20, atk: 2, def: 1, speed: 0.6, spawnX: 315, spawnY: 215, lootTableId: "MOC_NHAN_LOOT" },
  { id: "HOANG_SOI", code: "HOANG_SOI", name: "Hoang Sói", icon: "🐺", img: "./assets/monsters/hoang_soi_sheet.png", animation: { kind: "grid", cols: 4, rows: 4, width: 16, height: 16 }, type: "NORMAL", level: 1, linhCan: "KIM", nguHanh: ["KIM"], color: "#8855cc", hp: 90, maxHp: 90, mp: 24, maxMp: 24, atk: 9, def: 2, speed: 1.25, spawnX: 80, spawnY: 200, lootTableId: "SOI_LOOT" },
  { id: "THO_HEO", code: "THO_HEO", name: "Thổ Heo Rừng", icon: "🐗", img: "./assets/monsters/tho_heo_sheet.png", animation: { kind: "grid", cols: 4, rows: 4, width: 19, height: 17 }, type: "NORMAL", level: 2, linhCan: "THO", nguHanh: ["THO"], color: "#996633", hp: 120, maxHp: 120, mp: 28, maxMp: 28, atk: 12, def: 4, speed: 1.05, spawnX: 340, spawnY: 280, lootTableId: "HEO_LOOT" },
  { id: "DOC_THAO", code: "DOC_THAO", name: "Độc Thảo Yêu", icon: "🌱", img: "./assets/monsters/doc_thao_sheet.png", animation: { kind: "grid", cols: 4, rows: 4, width: 18, height: 21 }, type: "ELITE", level: 3, linhCan: "MOC", nguHanh: ["MOC"], color: "#33aa66", hp: 180, maxHp: 180, mp: 45, maxMp: 45, atk: 16, def: 6, speed: 0.85, spawnX: 500, spawnY: 110, lootTableId: "THAO_LOOT" },
  { id: "XICH_LUYEN_HO", code: "XICH_LUYEN_HO", name: "Xích Luyện Hổ", icon: "🐯", img: "./assets/monsters/hoang_soi_sheet.png", animation: { kind: "grid", cols: 4, rows: 4, width: 18, height: 18 }, type: "ELITE", level: 4, linhCan: "HOA", nguHanh: ["HOA"], color: "#d66a3d", hp: 280, maxHp: 280, mp: 60, maxMp: 60, atk: 22, def: 8, speed: 1.05, respawnMs: 30000, lootTableId: "HO_LUYEN_LOOT" },
  { id: "HUYET_NGUYET_LANG", code: "HUYET_NGUYET_LANG", name: "Huyết Nguyệt Lang", icon: "🐺", img: "./assets/monsters/hoang_soi_sheet.png", animation: { kind: "grid", cols: 4, rows: 4, width: 20, height: 20 }, type: "BOSS", level: 7, linhCan: "AM", nguHanh: ["AM"], color: "#d43f72", hp: 720, maxHp: 720, mp: 120, maxMp: 120, atk: 34, def: 14, speed: 1.15, respawnMs: 90000, lootTableId: "HUYET_LANG_LOOT" },
];

const lootTables = {
  MOC_NHAN_LOOT: [
    { itemId: "STONE_LINH_NHO", chance: 0.8, min: 1, max: 2 },
    { itemId: "WEAPON_KIEM_GO", chance: 0.2, min: 1, max: 1 },
    { itemId: "HAT_NON_LA", chance: 0.15, min: 1, max: 1 },
  ],
  SOI_LOOT: [
    { itemId: "MAT_LANG_NANH", chance: 0.6, min: 1, max: 2 },
    { itemId: "MAT_DA_THU", chance: 0.5, min: 1, max: 2 },
    { itemId: "STONE_LINH_NHO", chance: 0.35, min: 1, max: 2 },
    { itemId: "HAT_KHAN_COT_DA", chance: 0.12, min: 1, max: 1 },
    { itemId: "BOOTS_GIAY_DA_SOI", chance: 0.1, min: 1, max: 1 },
  ],
  HEO_LOOT: [
    { itemId: "STONE_LINH_NHO", chance: 0.6, min: 1, max: 2 },
    { itemId: "MAT_DA_THU", chance: 0.55, min: 1, max: 2 },
    { itemId: "POTION_TIEU_HOAN", chance: 0.35, min: 1, max: 1 },
    { itemId: "PANTS_QUAN_DA_THU", chance: 0.1, min: 1, max: 1 },
    { itemId: "BELT_DA_THO", chance: 0.12, min: 1, max: 1 },
  ],
  THAO_LOOT: [
    { itemId: "MAT_THAO_DUOC", chance: 0.75, min: 1, max: 3 },
    { itemId: "POTION_TU_KHI", chance: 0.4, min: 1, max: 2 },
    { itemId: "WEAPON_DAO_SAT", chance: 0.1, min: 1, max: 1 },
    { itemId: "RING_DONG_TRAM", chance: 0.1, min: 1, max: 1 },
  ],
  HO_LUYEN_LOOT: [
    { itemId: "STONE_LINH_NHO", chance: 0.85, min: 2, max: 5 },
    { itemId: "LINH_CAN_NGOC_TUY", chance: 0.3, min: 1, max: 1 },
    { itemId: "ARMOR_DAO_BAO_THANH_VAN", chance: 0.15, min: 1, max: 1 },
    { itemId: "AMULET_NGOC_BOI", chance: 0.12, min: 1, max: 1 },
  ],
  HUYET_LANG_LOOT: [
    { itemId: "THIEN_TAI_DIA_BAO", chance: 0.5, min: 1, max: 1 },
    { itemId: "POTION_TAY_TUY", chance: 0.25, min: 1, max: 1 },
    { itemId: "WEAPON_TRUC_KIEM", chance: 0.25, min: 1, max: 1 },
    { itemId: "RING_THACH_ANH", chance: 0.2, min: 1, max: 1 },
  ],
};

const monsterSpawns = [
  { packId: "PACK_MOC_NHAN", templateId: "MOC_NHAN", centerX: 315, centerY: 215, count: 2, radius: 10, aggroRange: 24, leashDistance: 35, chaseDurationMs: 4000 },
  { packId: "PACK_HOANG_SOI", templateId: "HOANG_SOI", centerX: 80, centerY: 200, count: 5, radius: 18, aggroRange: 38, leashDistance: 80, chaseDurationMs: 8000 },
  { packId: "PACK_THO_HEO", templateId: "THO_HEO", centerX: 340, centerY: 280, count: 5, radius: 28, aggroRange: 40, leashDistance: 84, chaseDurationMs: 8500 },
  { packId: "PACK_DOC_THAO", templateId: "DOC_THAO", centerX: 500, centerY: 110, count: 4, radius: 22, aggroRange: 42, leashDistance: 88, chaseDurationMs: 9000 },
  { packId: "PACK_XICH_LUYEN_HO", templateId: "XICH_LUYEN_HO", centerX: 430, centerY: 315, count: 2, radius: 18, aggroRange: 36, leashDistance: 72, chaseDurationMs: 7000 },
  { packId: "PACK_HUYET_NGUYET_LANG", templateId: "HUYET_NGUYET_LANG", centerX: 535, centerY: 330, count: 1, radius: 4, aggroRange: 48, leashDistance: 110, chaseDurationMs: 12000 },
];

const cityTerrain = makeTerrain("thanh_van_tran");
const plainTerrain = makeTerrain("binh_nguyen");
const valleyTerrain = makeTerrain("thanh_van_son_coc");

const worlds = [
  {
    id: "thanh_van_tran", code: "thanh_van_tran", tenMap: "Thanh Vân Trấn", type: "CITY", biome: "CITY", version: 3, w: TILE_W, h: TILE_H, isDefault: true, spawnX: 300, spawnY: 200,
    jsonMap: cityTerrain.collision,
    layers: { ground: cityTerrain.ground, objects: cityTerrain.objects, elevation: cityTerrain.elevation },
    portals: [
      { id: "portal_binh_nguyen", x: 590, y: 200, toMap: "binh_nguyen", denMap: "binh_nguyen", toX: 36, toY: 200, tenMapDen: "Bình Nguyên Hoang Dã" },
      { id: "portal_son_coc", x: 300, y: 15, toMap: "thanh_van_son_coc", denMap: "thanh_van_son_coc", toX: 300, toY: 375, tenMapDen: "Sơn Cốc Thanh Vân" },
    ],
    monsters: [
      { id: "MOC_NHAN", code: "MOC_NHAN", name: "Mộc Nhân Thung", icon: "🪵", img: "./assets/monsters/doc_thao_sheet.png", animation: { kind: "grid", cols: 4, rows: 4, width: 16, height: 16 }, type: "NORMAL", level: 1, nguHanh: ["MOC"], color: "#b3895d", hp: 60, maxHp: 60, atk: 2, def: 1, speed: 0.6, spawnX: 315, spawnY: 215, lootTableId: "MOC_NHAN_LOOT" }
    ],
    monsterSpawns: [
      { packId: "PACK_MOC_NHAN", templateId: "MOC_NHAN", centerX: 315, centerY: 215, count: 2, radius: 10, aggroRange: 24, leashDistance: 35, chaseDurationMs: 4000 }
    ],
    npcs: [
      { id: "npc_truong_thon", name: "Trưởng Thôn Lý Huyền", x: 275, y: 190, color: "#f39c12", dialog: "Chào mừng đạo hữu đến Thanh Vân Trấn! Đạo đồ gian nan, nghịch thiên nhi hành. Hãy rèn luyện từ Mộc Nhân Thung cạnh đây rồi ra Bình Nguyên trừ yêu thú!" },
      { id: "npc_tho_ren", name: "Thợ Rèn Thiết Trảm", x: 285, y: 220, color: "#e74c3c", dialog: "Lão phu là Thiết Trảm, thợ rèn đệ nhất trấn! Ta có đủ kiếm gỗ, đao sắt, nón trúc, giáp da sơ cấp cho người mới nhập môn. Đao kiếm sắc bén thì trừ yêu mới vững tâm!" },
      { id: "npc_duoc_su", name: "Dược Sư Bạch Hạc", x: 325, y: 220, color: "#2ecc71", dialog: "Lão hủ Bạch Hạc chuyên luyện đan trị thương. Ta có Tiểu Hoàn Đan hồi phục khí huyết và Tụ Khí Đan bồi bổ chân nguyên. Đi xa chớ quên mang theo phòng thân!" },
      { id: "npc_thuong_nhan", name: "Thương Nhân Tiền Vạn Hưng", x: 345, y: 190, color: "#3498db", dialog: "Bản tiệm Vạn Hưng thu mua mọi chiến lợi phẩm: Nanh sói, da thú, quặng sắt, linh thạch... Cần mua linh thạch tu luyện cứ tìm ta!" },
      { id: "npc_giao_dau", name: "Giáo Đầu Tần Chấn", x: 300, y: 175, color: "#9b59b6", dialog: "Muốn đặt chân lên con đường tu tiên, căn cơ phải vững! Đạo hữu nhớ kiểm tra bảng Tu Vi (phím C), khi đột phá cảnh giới sẽ nhận được điểm tiềm năng để tăng cường thực lực!" },
    ],
  },
  {
    id: "binh_nguyen", code: "binh_nguyen", tenMap: "Bình Nguyên Hoang Dã", type: "PLAIN", biome: "RIVER_VALLEY", version: 3, w: TILE_W, h: TILE_H, isDefault: false, spawnX: 20, spawnY: 200,
    jsonMap: plainTerrain.collision,
    layers: { ground: plainTerrain.ground, objects: plainTerrain.objects, elevation: plainTerrain.elevation },
    portals: [
      { id: "portal_thanh_van", x: 12, y: 200, toMap: "thanh_van_tran", denMap: "thanh_van_tran", toX: 565, toY: 200, tenMapDen: "Thanh Vân Trấn" },
      { id: "portal_son_coc", x: 590, y: 200, toMap: "thanh_van_son_coc", denMap: "thanh_van_son_coc", toX: 36, toY: 200, tenMapDen: "Sơn Cốc Thanh Vân" },
    ],
    monsters: monsterDefs.filter((m) => ["HOANG_SOI", "THO_HEO", "DOC_THAO"].includes(m.code)),
    monsterSpawns: monsterSpawns.filter((s) => ["PACK_HOANG_SOI", "PACK_THO_HEO", "PACK_DOC_THAO"].includes(s.packId)),
    npcs: [
      { id: "npc_tien_tram", name: "Vệ Sĩ Tiền Trạm", x: 40, y: 195, color: "#1abc9c", dialog: "Phía trước là đồng hoang đầy rẫy Hoang Sói và Thổ Heo Rừng hung hãn. Đạo hữu nhớ trang bị đầy đủ đao giáp trước khi xông vào!" },
    ],
  },
  {
    id: "thanh_van_son_coc", code: "thanh_van_son_coc", tenMap: "Sơn Cốc Thanh Vân", type: "MOUNTAIN_FOOTHILL", biome: "MOUNTAIN_FOOTHILL", version: 3, w: TILE_W, h: TILE_H, isDefault: false, spawnX: 300, spawnY: 375,
    jsonMap: valleyTerrain.collision,
    layers: { ground: valleyTerrain.ground, objects: valleyTerrain.objects, elevation: valleyTerrain.elevation },
    portals: [
      { id: "portal_ve_thanh_van", x: 300, y: 388, toMap: "thanh_van_tran", denMap: "thanh_van_tran", toX: 300, toY: 35, tenMapDen: "Thanh Vân Trấn" },
      { id: "portal_ve_binh_nguyen", x: 12, y: 200, toMap: "binh_nguyen", denMap: "binh_nguyen", toX: 565, toY: 200, tenMapDen: "Bình Nguyên Hoang Dã" },
    ],
    monsters: monsterDefs.filter((m) => ["DOC_THAO", "XICH_LUYEN_HO", "HUYET_NGUYET_LANG"].includes(m.code)),
    monsterSpawns: [
      { packId: "PACK_COC_DOC_THAO", templateId: "DOC_THAO", centerX: 180, centerY: 200, count: 4, radius: 20, aggroRange: 42, leashDistance: 88, chaseDurationMs: 9000 },
      { packId: "PACK_COC_XICH_HO", templateId: "XICH_LUYEN_HO", centerX: 350, centerY: 180, count: 3, radius: 22, aggroRange: 38, leashDistance: 80, chaseDurationMs: 7500 },
      { packId: "PACK_COC_BOSS_LANG", templateId: "HUYET_NGUYET_LANG", centerX: 480, centerY: 220, count: 1, radius: 6, aggroRange: 50, leashDistance: 120, chaseDurationMs: 12000 },
    ],
    npcs: [
      { id: "npc_an_cu", name: "Tu Sĩ Ẩn Cư", x: 310, y: 190, color: "#ecf0f1", dialog: "Sơn cốc này linh khí u ám, sâu trong rừng có Xích Luyện Hổ và Huyết Nguyệt Lang vương cực kỳ nguy hiểm. Chưa đạt Khí Động kỳ chớ dại dột khiêu chiến!" },
    ],
  },
];

module.exports = { realms, roots, items, skills: skillCatalog, commonSkills, passiveSkills, monsterDefs, lootTables, monsterSpawns, worlds };
