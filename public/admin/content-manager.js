(function exposeContentManager(root, factory) {
  const utils = typeof module === "object" && module.exports
    ? require("./content-utils")
    : root.AdminContentUtils;
  const api = factory(utils);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ContentAdmin = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createContentManager(utils) {
  "use strict";

  const EDITABLE_COLLECTIONS = new Set(["quests", "items", "skills", "monsters", "alchemyRecipes", "lootTables"]);
  const EDITABLE_LOWER = new Set([...EDITABLE_COLLECTIONS].map((entry) => entry.toLowerCase()));

  function createController({ api, getJson, adminHeaders }) {
    if (!api || typeof getJson !== "function" || typeof adminHeaders !== "function") {
      throw new TypeError("Thiếu cấu hình để kết nối bộ quản lý nội dung.");
    }

    function ensureEditable(collection) {
      if (!EDITABLE_LOWER.has(String(collection || "").toLowerCase())) {
        throw new Error("Collection này chỉ cho phép xem.");
      }
    }

    function jsonHeaders() {
      return { ...adminHeaders(), "content-type": "application/json" };
    }

    function requirePersistentResult(result, action) {
      if (result?.persisted !== true || result?.demo === true) {
        throw new Error(`Backend chưa xác nhận ${action} vào MySQL. Không xem dữ liệu là đã lưu.`);
      }
      return result;
    }

    return {
      async list(collection, params) {
        const query = params ? "?" + new URLSearchParams(params).toString() : "";
        return getJson(api.BASE + api.PATHS.admin.content(collection) + query, { headers: adminHeaders() });
      },

      async save(collection, { id, json, existingId = null, pixelImage }) {
        ensureEditable(collection);
        const record = utils.parseRecord(json, id, existingId, collection);
        if (pixelImage !== undefined) {
          delete record.img;
          if (pixelImage) {
            if (typeof pixelImage !== "string" || pixelImage.length > 24000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(pixelImage)) {
              throw new Error("Ảnh pixel cần là PNG hợp lệ và không vượt giới hạn dung lượng.");
            }
            record.img = pixelImage;
            if (collection === "monsters") {
              // The generator exports one frame. Keep the display size without slicing it as a sheet.
              const { width, height } = record.animation || {};
              record.animation = { kind: "procedural", width, height };
            }
          }
        }
        const isUpdate = existingId !== null && existingId !== undefined;
        const url = isUpdate
          ? api.BASE + api.PATHS.admin.contentItem(collection, existingId)
          : api.BASE + api.PATHS.admin.content(collection);
        const result = await getJson(url, {
          method: isUpdate ? "PUT" : "POST",
          headers: jsonHeaders(),
          body: JSON.stringify(record),
        });
        return requirePersistentResult(result, "ghi dữ liệu");
      },

      async remove(collection, id) {
        ensureEditable(collection);
        if (collection === "quests" || collection === "monsters") {
          throw new Error("Xóa quest hoặc quái có thể làm mất tiến độ và cấu hình map. Hãy ẩn hoặc đổi trạng thái bản ghi.");
        }
        const result = await getJson(api.BASE + api.PATHS.admin.contentItem(collection, id), {
          method: "DELETE",
          headers: adminHeaders(),
        });
        return requirePersistentResult(result, "xóa dữ liệu");
      },
    };
  }

  return { EDITABLE_COLLECTIONS, createController };
});
