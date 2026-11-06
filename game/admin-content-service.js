"use strict";

const MUTABLE_COLLECTIONS = new Set(["quests", "npcs", "items", "skills", "monsters"]);
const ITEM_TYPES = new Set(["STONE", "POTION", "CONSUME", "LINDAN", "MATERIAL", "EQUIPMENT", "BREAKTHROUGH_PILL"]);
const SKILL_TYPES = new Set(["COMMON", "PHYS", "MAGIC"]);
const SKILL_CATEGORIES = new Set(["ACTIVE", "PASSIVE"]);
const NUMERIC_ITEM_FIELDS = ["giaMua", "giaBan", "giaTriTuVi", "tuViLinhCanVal", "healHp", "healMp", "requiredRealmStt"];
const NUMERIC_SKILL_FIELDS = ["tier", "mpTieuHao", "hoiChieu", "range", "satThuong", "dienRong", "effectVal", "thoiGianBuff"];
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function containsUnsafeKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => UNSAFE_KEYS.has(key) || containsUnsafeKey(child));
}

function validateRecord(collection, record) {
  const key = String(collection || "").toLowerCase();
  if (!MUTABLE_COLLECTIONS.has(key)) return "Collection này chỉ cho phép xem";
  if (!record || typeof record !== "object" || Array.isArray(record)) return "Bản ghi phải là một đối tượng JSON";
  if (containsUnsafeKey(record)) return "Bản ghi chứa tên trường không được hỗ trợ";
  if (!String(record.id || "").trim()) return "Bản ghi cần có mã";
  const name = record.name ?? record.tenDo ?? record.tenNangLuc ?? record.title;
  if (!String(name ?? "").trim()) return "Bản ghi cần có tên hiển thị";

  if (key === "items") {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(record.maDo || "").trim())) return "Mã vật phẩm cần là mã hợp lệ";
    const type = String(record.type || record.loai || "").trim().toUpperCase();
    if (!type) return "Vật phẩm cần có type hoặc loai";
    if (!ITEM_TYPES.has(type)) return "Loại vật phẩm không được hỗ trợ";
    if (record.type && record.loai && String(record.type).toUpperCase() !== String(record.loai).toUpperCase()) return "type và loai của vật phẩm phải thống nhất";
    for (const field of NUMERIC_ITEM_FIELDS) {
      if (record[field] !== undefined && (!Number.isFinite(Number(record[field])) || Number(record[field]) < 0)) {
        return `Trường ${field} phải là số không âm`;
      }
    }
    if (type === "EQUIPMENT" && record.requiredRealmStt === undefined) return "Trang bị cần requiredRealmStt";
    if (record.requiredRealmStt !== undefined && (!Number.isInteger(Number(record.requiredRealmStt)) || Number(record.requiredRealmStt) < 1)) {
      return "requiredRealmStt phải là số nguyên từ 1 trở lên";
    }
  }

  if (key === "skills") {
    if (!String(record.code || "").trim()) return "Kỹ năng cần có mã code";
    if (!String(record.linhCan || "").trim()) return "Kỹ năng cần có linh căn";
    if (record.type && !SKILL_TYPES.has(String(record.type).toUpperCase())) return "Loại kỹ năng không được hỗ trợ";
    if (record.category && !SKILL_CATEGORIES.has(String(record.category).toUpperCase())) return "Nhóm kỹ năng không được hỗ trợ";
    for (const field of NUMERIC_SKILL_FIELDS) {
      if (record[field] !== undefined && (!Number.isFinite(Number(record[field])) || Number(record[field]) < 0)) {
        return `Trường ${field} phải là số không âm`;
      }
    }
    if (record.tier !== undefined && (!Number.isInteger(Number(record.tier)) || Number(record.tier) < 1)) return "Cấp kỹ năng phải là số nguyên từ 1 trở lên";
  }

  if (key === "monsters") {
    if (!/^[A-Z0-9_]{1,64}$/.test(String(record.id)) || String(record.code || "") !== String(record.id)) return "Mã quái phải trùng code và chỉ gồm chữ hoa, số, gạch dưới";
    if (!String(record.linhCan || "").trim() || !["NORMAL", "ELITE", "BOSS"].includes(String(record.type || "").toUpperCase())) return "Quái cần linh căn và loại hợp lệ";
    for (const field of ["level", "hp", "maxHp", "atk", "def", "speed", "respawnMs"]) {
      const value = Number(record[field]);
      if (!Number.isFinite(value) || value < (field === "def" ? 0 : 0.1)) return `Trường ${field} phải là số hợp lệ`;
    }
  }

  if (key === "npcs" && (!String(record.role || "").trim() || !String(record.mapCode || "").trim())) {
    return "NPC cần có vai trò và mã bản đồ";
  }
  if (key === "quests") {
    for (const field of ["level", "steps"]) {
      if (record[field] !== undefined && (!Number.isInteger(Number(record[field])) || Number(record[field]) < 1)) {
        return `Trường ${field} phải là số nguyên dương`;
      }
    }
  }
  return null;
}

function hasDuplicate(collection, key, candidate, ignoreId = null) {
  return collection.some((record) => {
    if (ignoreId !== null && String(record.id) === String(ignoreId)) return false;
    if (String(record.id) === String(candidate.id)) return true;
    if (key === "items" && String(record.maDo || "") === String(candidate.maDo || "")) return true;
    if (key === "skills" && String(record.code || "").toLowerCase() === String(candidate.code || "").toLowerCase()) return true;
    return false;
  });
}

module.exports = { MUTABLE_COLLECTIONS, validateRecord, hasDuplicate };
