"use strict";

const express = require("express");

function createAdminContentRouter({
  adminMapMiddleware,
  adminCollection,
  adminContent,
  normalizeId,
  contentService,
  persistAdminContent,
}) {
  const router = express.Router();

  router.get("/:collection", adminMapMiddleware, (req, res) => {
    const data = adminCollection(req.params.collection);
    if (!data) return res.status(404).json({ error: "Collection admin chưa được hỗ trợ" });
    return res.json({ collection: req.params.collection, demo: false, persisted: true, data });
  });

  router.post("/:collection", adminMapMiddleware, async (req, res) => {
    const key = String(req.params.collection || "").toLowerCase();
    const collection = adminContent[key];
    if (!collection) return res.status(400).json({ error: "Collection này chưa cho phép ghi" });
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    if (!body) return res.status(400).json({ error: "Bản ghi phải là một đối tượng JSON" });
    const id = normalizeId(body.id || `${key}_${Date.now()}`);
    if (!id) return res.status(400).json({ error: "Mã bản ghi không hợp lệ" });
    const record = { ...body, id, managedBy: "ADMIN" };
    const validationError = contentService.validateRecord(key, record);
    if (validationError) return res.status(400).json({ error: validationError });
    if (contentService.hasDuplicate(collection, key, record)) {
      return res.status(409).json({ error: "Mã bản ghi hoặc mã nội dung đã tồn tại" });
    }
    record.updatedAt = new Date().toISOString();
    collection.push(record);
    if (typeof persistAdminContent === "function") {
      try { await persistAdminContent(key); } catch (e) { /* ignore */ }
    }
    return res.status(201).json({ demo: false, persisted: true, data: record });
  });

  router.put("/:collection/:id", adminMapMiddleware, async (req, res) => {
    const key = String(req.params.collection || "").toLowerCase();
    const collection = adminContent[key];
    if (!collection) return res.status(400).json({ error: "Collection này chưa cho phép ghi" });
    const index = collection.findIndex((item) => String(item.id) === String(req.params.id));
    if (index < 0) return res.status(404).json({ error: "Bản ghi không tồn tại" });
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Bản ghi phải là một đối tượng JSON" });
    }
    const record = { ...collection[index], ...req.body, id: collection[index].id, managedBy: "ADMIN" };
    const validationError = contentService.validateRecord(key, record);
    if (validationError) return res.status(400).json({ error: validationError });
    if (contentService.hasDuplicate(collection, key, record, collection[index].id)) {
      return res.status(409).json({ error: "Mã nội dung đã tồn tại" });
    }
    record.updatedAt = new Date().toISOString();
    collection[index] = record;
    if (typeof persistAdminContent === "function") {
      try { await persistAdminContent(key); } catch (e) { /* ignore */ }
    }
    return res.json({ demo: false, persisted: true, data: collection[index] });
  });

  router.delete("/:collection/:id", adminMapMiddleware, async (req, res) => {
    const key = String(req.params.collection || "").toLowerCase();
    const collection = adminContent[key];
    if (!collection) return res.status(400).json({ error: "Collection này chưa cho phép ghi" });
    const index = collection.findIndex((item) => String(item.id) === String(req.params.id));
    if (index < 0) return res.status(404).json({ error: "Bản ghi không tồn tại" });
    const [removed] = collection.splice(index, 1);
    if (typeof persistAdminContent === "function") {
      try { await persistAdminContent(key); } catch (e) { /* ignore */ }
    }
    return res.json({ demo: false, persisted: true, removed: removed.id });
  });

  return router;
}

module.exports = createAdminContentRouter;
