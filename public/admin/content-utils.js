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

  return { createBlankRecord, parseRecord, escapeHtml, formatValue, filterRecords, summarizeRecord };
});
