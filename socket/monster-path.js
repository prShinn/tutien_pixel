"use strict";

function findMonsterPath(world, startX, startY, targetX, targetY, maxExpanded = 30000) {
  const tiles = world?.jsonMap || world?.tiles;
  const width = Number(world?.w || world?.width || tiles?.[0]?.length || 0);
  const height = Number(world?.h || world?.height || tiles?.length || 0);
  if (!width || !height || ![startX, startY, targetX, targetY].every((value) => Number.isFinite(Number(value)))) return null;

  const canWalk = (x, y) => x >= 1 && y >= 1 && x < width - 1 && y < height - 1
    && Number(tiles?.[y]?.[x] ?? 0) !== 2;
  const sx = Math.floor(Number(startX));
  const sy = Math.floor(Number(startY));
  const tx = Math.floor(Number(targetX));
  const ty = Math.floor(Number(targetY));
  if (!canWalk(sx, sy) || !canWalk(tx, ty)) return null;

  const startIndex = sy * width + sx;
  const targetIndex = ty * width + tx;
  if (startIndex === targetIndex) return [];
  const total = width * height;
  const gScore = new Float64Array(total);
  gScore.fill(Infinity);
  const previous = new Int32Array(total);
  previous.fill(-1);
  const closed = new Uint8Array(total);
  const heap = [];
  const heuristic = (x, y) => {
    const dx = Math.abs(tx - x);
    const dy = Math.abs(ty - y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const push = (node) => {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent].f <= node.f) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = node;
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        const child = right < heap.length && heap[right].f < heap[left].f ? right : left;
        if (heap[child].f >= last.f) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  const directions = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];

  gScore[startIndex] = 0;
  push({ index: startIndex, g: 0, f: heuristic(sx, sy) });
  let expanded = 0;
  while (heap.length && expanded < Math.min(total, maxExpanded)) {
    const current = pop();
    if (!current || current.g !== gScore[current.index] || closed[current.index]) continue;
    if (current.index === targetIndex) {
      const path = [];
      for (let cursor = targetIndex; cursor !== startIndex; cursor = previous[cursor]) {
        if (cursor < 0) return null;
        path.push({ x: cursor % width, y: Math.floor(cursor / width) });
      }
      return path.reverse();
    }
    closed[current.index] = 1;
    expanded += 1;
    const x = current.index % width;
    const y = Math.floor(current.index / width);
    for (const [stepX, stepY, cost] of directions) {
      const nextX = x + stepX;
      const nextY = y + stepY;
      if (!canWalk(nextX, nextY)) continue;
      if (stepX && stepY && (!canWalk(x + stepX, y) || !canWalk(x, y + stepY))) continue;
      const nextIndex = nextY * width + nextX;
      const nextG = current.g + cost;
      if (nextG >= gScore[nextIndex]) continue;
      gScore[nextIndex] = nextG;
      previous[nextIndex] = current.index;
      push({ index: nextIndex, g: nextG, f: nextG + heuristic(nextX, nextY) });
    }
  }
  return null;
}

function getMonsterChaseWaypoint(world, monster, target, now = Date.now(), replanIntervalMs = 500) {
  if (!monster || !target || ![monster.x, monster.y, target.x, target.y].every((value) => Number.isFinite(Number(value)))) {
    return { waypoint: null, failed: true, replanned: false };
  }

  const targetId = String(target.id ?? "");
  const targetTileX = Math.floor(Number(target.x));
  const targetTileY = Math.floor(Number(target.y));
  const sameTarget = monster.chasePathTargetId === targetId;
  const targetTileMoved = monster.chasePathTargetX !== targetTileX || monster.chasePathTargetY !== targetTileY;
  const elapsed = now - Number(monster.chasePathPlannedAt || 0);
  const canReplan = elapsed >= replanIntervalMs;
  const pathExhaustedAtDistance = Array.isArray(monster.chasePath)
    && monster.chasePath.length === 0
    && Math.hypot(Number(target.x) - Number(monster.x), Number(target.y) - Number(monster.y)) > 1.5;
  const unplanned = !Array.isArray(monster.chasePath) && !monster.chasePathFailed;
  const retryFailedPath = monster.chasePathFailed && canReplan;
  const shouldReplan = !sameTarget || unplanned || (canReplan && (targetTileMoved || retryFailedPath || pathExhaustedAtDistance));
  let replanned = false;

  if (shouldReplan) {
    monster.chasePath = findMonsterPath(world, monster.x, monster.y, target.x, target.y);
    monster.chasePathFailed = !monster.chasePath;
    monster.chasePathTargetId = targetId;
    monster.chasePathTargetX = targetTileX;
    monster.chasePathTargetY = targetTileY;
    monster.chasePathPlannedAt = now;
    replanned = true;
  }

  if (monster.chasePathFailed || !Array.isArray(monster.chasePath)) {
    return { waypoint: null, failed: true, replanned };
  }
  while (monster.chasePath.length && Math.hypot(
    monster.chasePath[0].x - Number(monster.x),
    monster.chasePath[0].y - Number(monster.y),
  ) <= 0.15) {
    monster.chasePath.shift();
  }
  return { waypoint: monster.chasePath[0] || null, failed: false, replanned };
}

function clearMonsterChasePath(monster) {
  if (!monster) return;
  monster.chasePath = null;
  monster.chasePathFailed = false;
  monster.chasePathTargetId = null;
  monster.chasePathPlannedAt = 0;
}

module.exports = { findMonsterPath, getMonsterChaseWaypoint, clearMonsterChasePath };
