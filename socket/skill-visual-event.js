"use strict";

function buildSupportSkillVisual(playerId, result) {
  const skillCode = String(result?.skillCode || "").trim().slice(0, 80);
  if (!playerId || !skillCode) return null;
  return {
    playerId: String(playerId),
    skillCode,
    skillName: String(result.skillName || "").slice(0, 80),
    effect: String(result.effect || "").slice(0, 40),
    effectVal: Number.isFinite(Number(result.effectVal)) ? Number(result.effectVal) : 0,
    effectDurationMs: Math.max(0, Math.min(120000, Number(result.effectDurationMs) || 0)),
  };
}

function publishSupportSkill({ socket, session, result, emitNear }) {
  const visual = buildSupportSkillVisual(socket?.id, result);
  if (!visual) return false;
  emitNear(session.mapId, session.x, session.y, "player_skill_cast", visual, socket.id);
  socket.emit("skill_result", result);
  return true;
}

module.exports = { buildSupportSkillVisual, publishSupportSkill };
