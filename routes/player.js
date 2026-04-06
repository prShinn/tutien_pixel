/**
 * routes/player.js
 * GET  /api/player         — Load dữ liệu nhân vật (nếu có)
 * POST /api/player/save    — Lưu toàn bộ dữ liệu nhân vật
 * GET  /api/player/list    — Danh sách người chơi đang online (public)
 */
const express = require("express");
const { PlayerDB, WorldDB } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// ── Load player ───────────────────────────────────────────────────
router.get("/", authMiddleware, (req, res) => {
  const player = PlayerDB.findByUserId(req.userId);
  if (!player) return res.json({ exists: false });
  res.json({ exists: true, player });
});

// ── Save player ───────────────────────────────────────────────────
// Gọi mỗi khi: đổi map, phá cảnh, 30s auto-save
router.post("/save", authMiddleware, (req, res) => {
  try {
    const { playerData } = req.body;
    if (!playerData) return res.status(400).json({ error: "Thiếu playerData" });

    // Validate bắt buộc — tránh save data rác
    const required = ["name", "realm", "stage", "stats", "hp", "mp", "xu"];
    for (const f of required) {
      if (playerData[f] === undefined)
        return res.status(400).json({ error: `Thiếu field: ${f}` });
    }

    // Strip client-side secrets, chỉ lưu những gì cần thiết
    const safe = {
      userId: req.userId,
      username: req.username,
      name: String(playerData.name).slice(0, 20),
      root: playerData.root,
      realm: Number(playerData.realm),
      stage: Number(playerData.stage),
      stats: playerData.stats,
      hp: Number(playerData.hp),
      maxHp: Number(playerData.maxHp),
      mp: Number(playerData.mp),
      maxMp: Number(playerData.maxMp),
      xu: Number(playerData.xu),
      tuExp: Number(playerData.tuExp),
      tuNeeded: Number(playerData.tuNeeded),
      mapId: String(playerData.mapId || "wilderness"),
      mapX: Number(playerData.x || 26),
      mapY: Number(playerData.y || 30),
      inventory: Array.isArray(playerData.inventory)
        ? playerData.inventory
        : [],
      tuSkill: Number(playerData.tuSkill || 0),
      tuSkillCount: Number(playerData.tuSkillCount || 0),
    };

    PlayerDB.save(req.userId, safe);

    // Log world event (dùng cho world feed / leaderboard sau này)
    if (playerData._event) {
      WorldDB.logEvent(playerData._event.type, {
        username: req.username,
        ...playerData._event.data,
      });
    }

    res.json({ ok: true, savedAt: Date.now() });
  } catch (e) {
    console.error("[save]", e);
    res.status(500).json({ error: "Lỗi lưu dữ liệu" });
  }
});

// ── Player list (public — leaderboard / who's online) ─────────────
router.get("/list", (req, res) => {
  const list = PlayerDB.listOnline();
  res.json({ players: list });
});

// ── World events feed ─────────────────────────────────────────────
router.get("/events", (req, res) => {
  const { WorldDB } = require("../db");
  res.json({ events: WorldDB.recentEvents(30) });
});

module.exports = router;
