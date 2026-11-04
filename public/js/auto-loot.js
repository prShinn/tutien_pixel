const AutoLoot = (() => {
  const STORAGE_KEY = "tutien.autoLoot.v1";
  const attempts = new Map();

  function readEnabled() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  }

  let enabled = readEnabled();

  return {
    isEnabled() {
      return enabled;
    },

    setEnabled(value) {
      enabled = Boolean(value);
      attempts.clear();
      try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { }
      return enabled;
    },

    nearby(drops, player, { radius = 22, tileSize = 1 } = {}) {
      if (!enabled || !player || !Array.isArray(drops)) return [];
      const px = Number(player.px ?? player.x);
      const py = Number(player.py ?? player.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return [];

      return drops
        .filter((drop) => drop?.id !== undefined && drop?.id !== null)
        .map((drop) => {
          const x = Number(drop.x) * tileSize + tileSize / 2;
          const y = Number(drop.y) * tileSize + tileSize / 2;
          return { drop, distance: Math.hypot(px - x, py - y) };
        })
        .filter(({ distance }) => Number.isFinite(distance) && distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .map(({ drop }) => drop);
    },

    claim(itemId, now = Date.now()) {
      if (!enabled || itemId === undefined || itemId === null) return false;
      const key = String(itemId);
      const current = attempts.get(key);
      if (current && (current.inFlight || now < current.nextAt)) return false;
      attempts.set(key, { inFlight: true, nextAt: now + 2400 });
      return true;
    },

    settle(itemId, retryAfterMs = 2400, now = Date.now()) {
      const key = String(itemId);
      if (!attempts.has(key)) return;
      attempts.set(key, { inFlight: false, nextAt: now + Math.max(0, Number(retryAfterMs) || 0) });
    },

    complete(itemId) {
      attempts.delete(String(itemId));
    },

    retain(itemIds) {
      const current = new Set((itemIds || []).map((id) => String(id)));
      for (const key of attempts.keys()) if (!current.has(key)) attempts.delete(key);
    },
  };
})();
