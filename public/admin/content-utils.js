(function exposeContentUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdminContentUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createContentUtils() {
  "use strict";

  const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
  const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const ITEM_TYPES = new Set([
    "EQUIPMENT", "ENHANCE_GEM", "PROTECT_CHARM", "STONE", "ELEMSTONE", "POTION",
    "CONSUME", "LINDAN", "MATERIAL", "MAT", "BREAKTHROUGH_PILL", "BAG_EXPAND", "STAT_RESET", "EXCHANGE_XU",
  ]);
  const ITEM_RARITIES = new Set(["NORMAL", "MAGIC", "EXL", "ANCIENT"]);
  const SPARKLE_PRESETS = new Set(["NONE", "DEWDROP", "SHIMMER", "MYTHIC_PRISM", "ELEMENTAL"]);
  const SKILL_TYPES = new Set(["COMMON", "PHYS", "MAGIC"]);
  const SKILL_CATEGORIES = new Set(["ACTIVE", "PASSIVE"]);
  const templates = {
    quests: { title: "Nhiệm vụ mới", category: "side", giver: "Lão Tu Sĩ", location: "Bình Nguyên Hoang Dã", summary: "Mô tả nhiệm vụ.", objective: "Đánh bại yêu thú", target: 1, eventType: "monster_kill", initialStatus: "available", initialProgress: 0, rewards: [] },
    items: { maDo: "", tenDo: "Vật phẩm mới", name: "Vật phẩm mới", icon: "◇", loai: "MATERIAL", type: "MATERIAL", giaMua: 0, giaBan: 0, moTa: "" },
    skills: { code: "", name: "Kỹ năng mới", icon: "✦", linhCan: "COMMON", tier: 1, mpTieuHao: 0, hoiChieu: 1, range: 1, type: "COMMON", category: "ACTIVE", targetType: "ENEMY", scalingStat: "ene", satThuong: 1, dienRong: 0, effect: "", effectVal: 0, thoiGianBuff: 0, moTa: "" },
    alchemyrecipes: { code: "", name: "Công thức mới", category: "BREAKTHROUGH", quality: "HA_PHAM", outputItemCode: "DAN_PHI_THANG", upgradedItemCode: "DAN_PHI_THANG_TRUNG", outputQuantity: 1, craftSuccessRate: 0.65, mutationChance: 0.05, requiredRealmStt: 1, costXu: 100, costLinhThach: 0, ingredients: [{ itemCode: "MAT_THAO_DUOC", quantity: 4 }, { itemCode: "STONE_LINH_NHO", quantity: 3 }] },
    loottables: { entries: [{ itemId: "STONE_LINH_NHO", chance: 0.5, min: 1, max: 1 }] },
  };

  function createBlankRecord(collection, now = Date.now(), records = []) {
    const key = String(collection || "").toLowerCase();
    const fields = templates[key];
    if (!fields) throw new Error("Collection này chưa hỗ trợ tạo bản ghi");
    const prefix = key === "items"
      ? "ITEM"
      : key === "skills"
        ? "SKILL"
        : key === "quests"
          ? "quest"
          : key === "alchemyrecipes"
            ? "REC"
            : key === "loottables"
              ? "loot"
              : key.toUpperCase();
    const numericIds = key === "skills" ? records.map((record) => Number(record.id)).filter(Number.isSafeInteger) : [];
    const id = key === "skills"
      ? (numericIds.length ? Math.max(...numericIds) + 1 : Math.max(1, Number.isSafeInteger(now) ? now : Date.now()))
      : `${prefix}_${(key === "quests" || key === "loottables") ? "new" : "NEW"}_${now}`;
    const record = { ...JSON.parse(JSON.stringify(fields)), id };
    if (key === "items") record.maDo = record.id;
    if (key === "skills") record.code = `SKILL_${record.id}`;
    if (key === "alchemyrecipes") record.code = record.id;
    return record;
  }

  function createSampleInventory() {
    const slots = [
      { slot: "hat", label: "Nón", items: ["Nón Hành Cước", "Mũ Thanh Vân", "Thiên Tằm Quan"], icon: "♙", defense: 1 },
      { slot: "armor", label: "Giáp", items: ["Áo Vải Tu Sĩ", "Giáp Thanh Cương", "Bảo Giáp Huyền Thiết"], icon: "♢", defense: 3 },
      { slot: "pants", label: "Quần", items: ["Quần Hành Cước", "Hộ Khố Thanh Cương", "Quần Huyền Tằm"], icon: "▤", defense: 2 },
      { slot: "boots", label: "Giày", items: ["Giày Mộc", "Ủng Thanh Vân", "Phi Vân Ngoa"], icon: "⌑", defense: 1 },
    ];
    const tiers = [
      { realm: 1, suffix: "NHAP_MON", label: "Nhập Môn", cost: 180, defense: 1, maxHP: 8 },
      { realm: 2, suffix: "NGUNG_KHI", label: "Ngưng Khí", cost: 720, defense: 4, maxHP: 28 },
      { realm: 3, suffix: "TRUC_CO", label: "Trúc Cơ", cost: 2200, defense: 9, maxHP: 72 },
    ];
    const equipment = slots.flatMap((slot) => tiers.map((tier, index) => {
      const id = `SAMPLE_${slot.slot.toUpperCase()}_${tier.suffix}`;
      const name = slot.items[index];
      return {
        id,
        maDo: id,
        tenDo: name,
        name,
        icon: slot.icon,
        loai: "EQUIPMENT",
        type: "EQUIPMENT",
        slot: slot.slot,
        requiredRealmStt: tier.realm,
        giaMua: tier.cost,
        giaBan: Math.floor(tier.cost / 2),
        stats: { pDef: tier.defense + slot.defense, maxHP: tier.maxHP },
        moTa: `${slot.label} bộ ${tier.label}, tăng ${tier.defense + slot.defense} phòng thủ và ${tier.maxHP} HP.`,
      };
    }));
    const supplies = [
      { id: "SAMPLE_HUYET_NGOC_TRUNG", tenDo: "Huyết Ngọc Trung", icon: "🧪", type: "POTION", healHp: 180, giaMua: 65, giaBan: 32, moTa: "Hồi 180 HP." },
      { id: "SAMPLE_LINH_KHI_DAN", tenDo: "Linh Khí Đan", icon: "🔵", type: "POTION", healMp: 90, giaMua: 70, giaBan: 35, moTa: "Hồi 90 MP." },
      { id: "SAMPLE_SONG_MACH_DAN", tenDo: "Song Mạch Đan", icon: "🟣", type: "POTION", healHp: 100, healMp: 55, giaMua: 95, giaBan: 47, moTa: "Hồi 100 HP và 55 MP." },
      { id: "SAMPLE_LINH_THACH_TRUNG", tenDo: "Linh Thạch Trung", icon: "💎", type: "STONE", giaTriTuVi: 400, giaMua: 80, giaBan: 40, moTa: "Tài nguyên tu luyện chứa linh khí ổn định." },
      { id: "SAMPLE_NGOC_TUY_TRUNG", tenDo: "Linh Căn Ngọc Tủy Trung", icon: "🔷", type: "LINDAN", tuViLinhCanVal: 180, giaMua: 360, giaBan: 180, moTa: "Tăng 180 tu vi linh căn." },
      { id: "SAMPLE_THAN_MOC", tenDo: "Gỗ Thần Mộc", icon: "🪵", type: "MATERIAL", giaMua: 12, giaBan: 6, moTa: "Nguyên liệu chế tạo thu thập trong rừng." },
      { id: "SAMPLE_HUYEN_THIET", tenDo: "Huyền Thiết", icon: "⚒️", type: "MATERIAL", giaMua: 24, giaBan: 12, moTa: "Quặng cứng dùng rèn trang bị." },
      { id: "SAMPLE_LOI_TINH", tenDo: "Lôi Tinh", icon: "⚡", type: "MATERIAL", giaMua: 45, giaBan: 22, moTa: "Tinh thể còn lưu lại lôi linh khí." },
    ].map((item) => ({ ...item, name: item.tenDo, maDo: item.id, loai: item.type }));
    return [...equipment, ...supplies];
  }

  function containsUnsafeKey(value) {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) => UNSAFE_KEYS.has(key) || containsUnsafeKey(child));
  }

  function parseRecord(json, id, expectedId = null, collection = "") {
    let fields;
    try {
      fields = JSON.parse(String(json || ""));
    } catch {
      throw new Error("Dữ liệu chưa phải JSON hợp lệ.");
    }
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      throw new Error("Bản ghi phải là một đối tượng JSON.");
    }
    if (containsUnsafeKey(fields)) throw new Error("Bản ghi chứa tên trường không được hỗ trợ.");

    const recordId = String(expectedId ?? id ?? fields.code ?? "").trim();
    if (!ID_PATTERN.test(recordId)) throw new Error("Mã bản ghi chỉ được gồm chữ, số, gạch dưới hoặc gạch nối (tối đa 80 ký tự).");
    const key = String(collection || "").toLowerCase();
    if (key !== "loottables") {
      const displayName = fields.name ?? fields.tenDo ?? fields.tenNangLuc ?? fields.title;
      if (!String(displayName ?? "").trim()) throw new Error("Hãy nhập tên hiển thị cho bản ghi.");
    }
    if (key === "alchemyrecipes") {
      if (!String(fields.outputItemCode || "").trim()) throw new Error("Công thức luyện đan cần vật phẩm đầu ra.");
      const rate = Number(fields.craftSuccessRate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 0.7) throw new Error("Tỷ lệ thành công luyện đan phải nằm trong khoảng (0, 0.7].");
      if (!Array.isArray(fields.ingredients) || fields.ingredients.length === 0) throw new Error("Công thức phải có ít nhất 1 nguyên liệu.");
    }
    if (key === "loottables") {
      if (!Array.isArray(fields.entries)) throw new Error("Bảng rớt đồ cần trường entries là danh sách.");
      for (const entry of fields.entries) {
        const chance = Number(entry?.chance);
        const min = Number(entry?.min ?? 1);
        const max = Number(entry?.max ?? min);
        if (!String(entry?.itemId || "").trim() || !Number.isFinite(chance) || chance <= 0 || chance > 1 || min < 1 || max < min) {
          throw new Error("Dòng vật phẩm trong bảng rớt không hợp lệ.");
        }
      }
    }
    if (key === "items") {
      if (!ID_PATTERN.test(String(fields.maDo || "").trim())) throw new Error("Mã vật phẩm cần là mã hợp lệ gồm chữ, số, gạch dưới hoặc gạch nối.");
      const type = String(fields.type || fields.loai || "").trim().toUpperCase();
      if (!type) throw new Error("Vật phẩm cần có loại (type hoặc loai).");
      if (!ITEM_TYPES.has(type)) throw new Error("Loại vật phẩm không được hỗ trợ.");
      if (fields.type && fields.loai && String(fields.type).toUpperCase() !== String(fields.loai).toUpperCase()) throw new Error("type và loai phải thống nhất.");
      for (const field of ["giaMua", "giaBan", "giaTriTuVi", "tuViLinhCanVal", "healHp", "healMp", "itemLevel", "requiredRealmStt"]) {
        if (fields[field] !== undefined && (!Number.isFinite(Number(fields[field])) || Number(fields[field]) < 0)) throw new Error(`Trường ${field} phải là số không âm.`);
      }
      if (fields.rarity !== undefined && !ITEM_RARITIES.has(String(fields.rarity).toUpperCase())) {
        throw new Error("Phẩm chất vật phẩm phải là NORMAL, MAGIC, EXL hoặc ANCIENT.");
      }
      if (fields.sparkle !== undefined && (!fields.sparkle || typeof fields.sparkle !== "object" || !SPARKLE_PRESETS.has(String(fields.sparkle.preset || "NONE").toUpperCase()))) {
        throw new Error("Cấu hình hiệu ứng lấp lánh 2D không hợp lệ.");
      }
    }
    if (key === "quests") {
      if (!/^[a-z0-9_-]{1,64}$/.test(recordId) || !String(fields.title || "").trim()) throw new Error("Quest cần mã chữ thường và tiêu đề hợp lệ.");
      if (!["main", "side", "daily"].includes(fields.category)) throw new Error("Nhóm quest không hợp lệ.");
      if (!["monster_kill", "collect_item", "map_enter"].includes(fields.eventType)) throw new Error("Sự kiện quest không được hỗ trợ.");
      if (!Number.isSafeInteger(Number(fields.target)) || Number(fields.target) < 0 || Number(fields.target) > 1000000) throw new Error("Mục tiêu quest phải là số nguyên từ 0 trở lên.");
      if (!["active", "available"].includes(fields.initialStatus) || !Number.isSafeInteger(Number(fields.initialProgress)) || Number(fields.initialProgress) < 0 || Number(fields.initialProgress) > Number(fields.target)) throw new Error("Trạng thái ban đầu hoặc tiến độ quest không hợp lệ.");
      if (!Array.isArray(fields.rewards)) throw new Error("Phần thưởng quest phải là một danh sách.");
    }
    if (key === "monsters") {
      if (!/^[A-Z0-9_]{1,64}$/.test(recordId) || String(fields.code || "") !== recordId) throw new Error("Mã quái phải trùng code và chỉ gồm chữ hoa, số, gạch dưới.");
      if (!["NORMAL", "ELITE", "BOSS"].includes(fields.type)) throw new Error("Phân loại quái không hợp lệ.");
      for (const field of ["level", "hp", "maxHp", "atk", "def", "speed", "respawnMs"]) {
        if ((field === "maxHp" || field === "respawnMs") && fields[field] == null) continue;
        if (!Number.isFinite(Number(fields[field])) || Number(fields[field]) < (field === "def" ? 0 : 0.1)) throw new Error(`Trường ${field} phải là số hợp lệ.`);
      }
    }
    if (key === "skills") {
      if (!String(fields.code || "").trim()) throw new Error("Kỹ năng cần có mã code.");
      if (!String(fields.linhCan || "").trim()) throw new Error("Kỹ năng cần có linh căn.");
      if (fields.type && !SKILL_TYPES.has(String(fields.type).toUpperCase())) throw new Error("Loại kỹ năng không được hỗ trợ.");
      if (fields.category && !SKILL_CATEGORIES.has(String(fields.category).toUpperCase())) throw new Error("Nhóm kỹ năng không được hỗ trợ.");
      for (const field of ["tier", "mpTieuHao", "hoiChieu", "range", "satThuong", "dienRong", "effectVal", "thoiGianBuff"]) {
        if (fields[field] !== undefined && (!Number.isFinite(Number(fields[field])) || Number(fields[field]) < 0)) throw new Error(`Trường ${field} phải là số không âm.`);
      }
      if (fields.tier !== undefined && (!Number.isInteger(Number(fields.tier)) || Number(fields.tier) < 1)) throw new Error("Cấp kỹ năng phải là số nguyên từ 1 trở lên.");
    }
    if (key === "npcs" && (!String(fields.role || "").trim() || !String(fields.mapCode || "").trim())) {
      throw new Error("NPC cần có vai trò và mã bản đồ.");
    }

    delete fields.id;
    delete fields.updatedAt;
    return { ...fields, id: recordId };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function formatValue(value) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function filterRecords(records, query) {
    const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
    if (!normalizedQuery) return records.slice();
    return records.filter((record) => JSON.stringify(record).toLocaleLowerCase().includes(normalizedQuery));
  }

  function validatePagedResult(payload, { page = 1, limit = 24 } = {}) {
    if (!Array.isArray(payload?.data)) throw new Error("API Admin trả danh sách không hợp lệ.");
    const pagination = payload.pagination;
    if (!pagination) throw new Error("Backend chưa trả phân trang máy chủ. Hãy cập nhật API Admin; danh sách đang khóa để tránh tải toàn bộ dữ liệu.");
    if (!Number.isSafeInteger(pagination.page) || pagination.page < 1 || pagination.page !== Number(page)
        || !Number.isSafeInteger(pagination.limit) || pagination.limit !== Number(limit)
        || !Number.isSafeInteger(pagination.total) || pagination.total < 0 || payload.data.length > pagination.limit) {
      throw new Error("API Admin trả thông tin phân trang không hợp lệ.");
    }
    return payload;
  }

  function summarizeRecord(record, maxFields = 3) {
    return Object.entries(record || {})
      .filter(([key]) => !["id", "updatedAt", "img", "animation"].includes(key))
      .slice(0, maxFields)
      .map(([key, value]) => ({ key, value: formatValue(value) }));
  }

  return { createBlankRecord, createSampleInventory, parseRecord, escapeHtml, formatValue, filterRecords, validatePagedResult, summarizeRecord };
});
