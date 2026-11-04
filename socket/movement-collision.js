"use strict";

const PLAYER_COLLISION_RADIUS = 0.45;

function isSolidTile(world, tx, ty) {
  if (!world || tx < 0 || ty < 0 || tx >= Number(world.w || 0) || ty >= Number(world.h || 0)) return true;
  const tiles = world.jsonMap || world.tiles;
  // Tile 2 represents water and remains the only blocked terrain for now.
  return Number(tiles?.[ty]?.[tx]) === 2;
}

function positionCollides(world, x, y) {
  if (!world) return false;
  const cx = Number(x) + 0.5;
  const cy = Number(y) + 0.5;
  const minX = Math.floor(cx - PLAYER_COLLISION_RADIUS);
  const maxX = Math.floor(cx + PLAYER_COLLISION_RADIUS - 1e-9);
  const minY = Math.floor(cy - PLAYER_COLLISION_RADIUS);
  const maxY = Math.floor(cy + PLAYER_COLLISION_RADIUS - 1e-9);
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (isSolidTile(world, tx, ty)) return true;
    }
  }
  return false;
}

function movementPathCollides(world, fromX, fromY, toX, toY) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(1, Math.ceil(distance / 0.5));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    if (positionCollides(world, fromX + (toX - fromX) * progress, fromY + (toY - fromY) * progress)) return true;
  }
  return false;
}

module.exports = { isSolidTile, positionCollides, movementPathCollides };
