"use strict";

const express = require("express");

function createQuestRouter({ authenticate, playerFor, players, questService, items, readInventory }) {
  const router = express.Router();

  router.get("/", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    players.set(player.id, player);
    return res.json(questService.snapshot(player));
  });

  router.post("/:id/accept", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const result = questService.accept(player, req.params.id);
    if (!result.ok) return res.status(result.code === "QUEST_NOT_FOUND" ? 404 : 409).json({ error: result.message, code: result.code });
    players.set(player.id, player);
    return res.json(result);
  });

  router.post("/:id/track", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const result = questService.track(player, req.params.id);
    if (!result.ok) return res.status(result.code === "QUEST_NOT_FOUND" ? 404 : 409).json({ error: result.message, code: result.code });
    players.set(player.id, player);
    return res.json(result);
  });

  router.post("/:id/claim", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const result = questService.claim(player, req.params.id, items);
    if (!result.ok) {
      const status = result.code === "QUEST_NOT_FOUND" ? 404 : result.code === "QUEST_NOT_READY" ? 409 : 400;
      return res.status(status).json({ error: result.message, code: result.code });
    }
    players.set(player.id, player);
    return res.json({ ...result, player: { xu: player.xu, tuViHienTai: player.tuViHienTai, inventory: readInventory(player) } });
  });

  return router;
}

module.exports = createQuestRouter;
