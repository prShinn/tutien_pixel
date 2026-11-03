(function exposeContentManager(root, factory) {
  const utils = typeof module === "object" && module.exports
    ? require("./content-utils")
    : root.AdminContentUtils;
  const api = factory(utils);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ContentAdmin = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createContentManager(utils) {
  "use strict";

  const EDITABLE_COLLECTIONS = new Set(["quests", "npcs", "items", "skills"]);

  function createController({ api, getJson, adminHeaders }) {
    if (!api || typeof getJson !== "function" || typeof adminHeaders !== "function") {
      throw new TypeError("Thiếu cấu hình để kết nối bộ quản lý nội dung.");
    }

    function ensureEditable(collection) {
      if (!EDITABLE_COLLECTIONS.has(String(collection || "").toLowerCase())) {
        throw new Error("Collection này chỉ cho phép xem.");
      }
    }

    function jsonHeaders() {
      return { ...adminHeaders(), "content-type": "application/json" };
    }

    return {
      async list(collection) {
        return getJson(api.BASE + api.PATHS.admin.content(collection), { headers: adminHeaders() });
      },

      async save(collection, { id, json, existingId = null }) {
        ensureEditable(collection);
        const record = utils.parseRecord(json, id, existingId, collection);
        const isUpdate = existingId !== null && existingId !== undefined;
        const url = isUpdate
          ? api.BASE + api.PATHS.admin.contentItem(collection, existingId)
          : api.BASE + api.PATHS.admin.content(collection);
        return getJson(url, {
          method: isUpdate ? "PUT" : "POST",
          headers: jsonHeaders(),
          body: JSON.stringify(record),
        });
      },

      async remove(collection, id) {
        ensureEditable(collection);
        return getJson(api.BASE + api.PATHS.admin.contentItem(collection, id), {
          method: "DELETE",
          headers: adminHeaders(),
        });
      },
    };
  }

  return { EDITABLE_COLLECTIONS, createController };
});
