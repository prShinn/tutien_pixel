"use strict";

function markRoomActive(runtime) {
  runtime.emptySince = 0;
  return runtime;
}

function markRoomEmpty(runtime, now = Date.now()) {
  if (!runtime.emptySince) runtime.emptySince = now;
  return runtime;
}

function shouldDisposeRoom(runtime, now, ttlMs, hasLiveDrops) {
  return !hasLiveDrops && Number(runtime?.emptySince || 0) > 0
    && now - Number(runtime.emptySince) >= ttlMs;
}

module.exports = { markRoomActive, markRoomEmpty, shouldDisposeRoom };
