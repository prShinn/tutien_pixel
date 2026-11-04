const MovementFeedback = {
  CORRECTION_MS: 180,
  MAX_BLEND_DISTANCE: 96,

  reconcile(player, x, y, tileSize = CFG.TS, now = Date.now()) {
    const nextX = Number(x);
    const nextY = Number(y);
    if (!player || !Number.isFinite(nextX) || !Number.isFinite(nextY)) return false;

    const fromX = Number.isFinite(Number(player.px)) ? Number(player.px) : nextX * tileSize + tileSize / 2;
    const fromY = Number.isFinite(Number(player.py)) ? Number(player.py) : nextY * tileSize + tileSize / 2;
    const toX = nextX * tileSize + tileSize / 2;
    const toY = nextY * tileSize + tileSize / 2;
    const offsetX = fromX - toX;
    const offsetY = fromY - toY;

    player.x = nextX;
    player.y = nextY;
    player.visualCorrection = Math.hypot(offsetX, offsetY) <= this.MAX_BLEND_DISTANCE
      ? { x: offsetX, y: offsetY, startedAt: now, duration: this.CORRECTION_MS }
      : null;
    player.px = player.visualCorrection ? fromX : toX;
    player.py = player.visualCorrection ? fromY : toY;
    player.lastEmitX = nextX;
    player.lastEmitY = nextY;
    player.targetMovePos = null;
    return true;
  },

  apply(player, tileSize = CFG.TS, now = Date.now()) {
    if (!player) return;
    const baseX = Number(player.x) * tileSize + tileSize / 2;
    const baseY = Number(player.y) * tileSize + tileSize / 2;
    const correction = player.visualCorrection;
    if (!correction) {
      player.px = baseX;
      player.py = baseY;
      return;
    }

    const progress = Math.max(0, Math.min(1, (now - correction.startedAt) / correction.duration));
    const remaining = (1 - progress) * (1 - progress);
    player.px = baseX + correction.x * remaining;
    player.py = baseY + correction.y * remaining;
    if (progress >= 1) player.visualCorrection = null;
  },
};
