(function exposeContentUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdminContentUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createContentUtils() {
  "use strict";

  const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
  const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const ITEM_TYPES = new Set(["STONE", "POTION", "LINDAN", "MATERIAL", "EQUIPMENT", "BREAKTHROUGH_PILL"]);
  const SKILL_TYPES = new Set(["COMMON", "PHYS", "MAGIC"]);
  const SKILL_CATEGORIES = new Set(["ACTIVE", "PASSIVE"]);
  const templates = {
    quests: { name: "Nhiệm vụ mới", status: "DRAFT", level: 1, steps: 1, reward: "" },
    npcs: { name: "NPC mới", role: "GUIDE", mapCode: "thanh_van_tran", status: "DRAFT" },
    items: { maDo: "", tenDo: "Vật phẩm mới", name: "Vật phẩm mới", icon: "◇", loai: "MATERIAL", type: "MATERIAL", giaMua: 0, giaBan: 0, moTa: "" },
    skills: { code: "", name: "Kỹ năng mới", icon: "✦", linhCan: "COMMON", tier: 1, mpTieuHao: 0, hoiChieu: 1, range: 1, type: "COMMON", category: "ACTIVE", targetType: "ENEMY", scalingStat: "ene", satThuong: 1, dienRong: 0, effect: "", effectVal: 0, thoiGianBuff: 0, moTa: "" },
  };

  function createBlankRecord(collection, now = Date.now(), records = []) {
    const key = String(collection || "").toLowerCase();
    const fields = templates[key];
    if (!fields) throw new Error("Collection này chưa hỗ trợ tạo bản ghi");
    const prefix = key === "items" ? "ITEM" : key === "skills" ? "SKILL" : key.toUpperCase();
    const numericIds = key === "skills" ? records.map((record) => Number(record.id)).filter(Number.isSafeInteger) : [];
    const id = key === "skills" ? Math.max(0, ...numericIds) + 1 : `${prefix}_NEW_${now}`;
    const record = { id, ...JSON.parse(JSON.stringify(fields)) };
    if (key === "items") record.maDo = record.id;
    if (key === "skills") record.code = `SKILL_${record.id}`;
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

    const recordId = String(expectedId ?? id ?? "").trim();
    if (!ID_PATTERN.test(recordId)) throw new Error("Mã bản ghi chỉ được gồm chữ, số, gạch dưới hoặc gạch nối (tối đa 80 ký tự).");
    const displayName = fields.name ?? fields.tenDo ?? fields.tenNangLuc ?? fields.title;
    if (!String(displayName ?? "").trim()) throw new Error("Hãy nhập tên hiển thị cho bản ghi.");

    const key = String(collection || "").toLowerCase();
    if (key === "items") {
      if (String(fields.maDo || "").trim() !== recordId) throw new Error("Mã vật phẩm phải trùng với mã bản ghi.");
      const type = String(fields.type || fields.loai || "").trim().toUpperCase();
      if (!type) throw new Error("Vật phẩm cần có loại (type hoặc loai).");
      if (!ITEM_TYPES.has(type)) throw new Error("Loại vật phẩm không được hỗ trợ.");
      if (fields.type && fields.loai && String(fields.type).toUpperCase() !== String(fields.loai).toUpperCase()) throw new Error("type và loai phải thống nhất.");
      for (const field of ["giaMua", "giaBan", "giaTriTuVi", "tuViLinhCanVal", "healHp", "healMp"]) {
        if (fields[field] !== undefined && (!Number.isFinite(Number(fields[field])) || Number(fields[field]) < 0)) throw new Error(`Trường ${field} phải là số không âm.`);
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

  function summarizeRecord(record, maxFields = 3) {
    return Object.entries(record || {})
      .filter(([key]) => !["id", "updatedAt", "img", "animation"].includes(key))
      .slice(0, maxFields)
      .map(([key, value]) => ({ key, value: formatValue(value) }));
  }

  return { createBlankRecord, createSampleInventory, parseRecord, escapeHtml, formatValue, filterRecords, summarizeRecord };
});
