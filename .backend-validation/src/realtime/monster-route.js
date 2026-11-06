const MAX_VISITED_TILES = 384;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function clearMonsterSegment(from, to, canWalk) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 0.25));
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    if (!canWalk(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)) return false;
  }
  return true;
}

function findMonsterRoute(from, to, canWalk) {
  const startX = Math.floor(from.x);
  const startY = Math.floor(from.y);
  const goalX = Math.floor(to.x);
  const goalY = Math.floor(to.y);
  const key = (x, y) => `${x}:${y}`;
  const goalKey = key(goalX, goalY);
  const startKey = key(startX, startY);
  const open = [{ x: startX, y: startY, cost: 0, priority: 0, parent: null }];
  const best = new Map([[startKey, 0]]);
  for (let visited = 0; open.length && visited < MAX_VISITED_TILES; visited += 1) {
    open.sort((left, right) => right.priority - left.priority);
    const node = open.pop();
    const nodeKey = key(node.x, node.y);
    if (node.cost !== best.get(nodeKey)) continue;
    if (nodeKey === goalKey) {
      const route = [];
      for (let point = node; point.parent; point = point.parent) route.push({ x: point.x + 0.5, y: point.y + 0.5 });
      return route.reverse();
    }
    for (const [dx, dy] of DIRECTIONS) {
      const x = node.x + dx;
      const y = node.y + dy;
      const nextKey = key(x, y);
      const cost = node.cost + 1;
      if ((best.get(nextKey) ?? Infinity) <= cost || !canWalk(x + 0.5, y + 0.5)) continue;
      best.set(nextKey, cost);
      open.push({ x, y, cost, priority: cost + Math.abs(x - goalX) + Math.abs(y - goalY), parent: node });
    }
  }
  return [];
}

module.exports = { clearMonsterSegment, findMonsterRoute };
