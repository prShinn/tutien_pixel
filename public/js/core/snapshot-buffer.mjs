export const SNAPSHOT_RENDER_DELAY_MS = 100;
export const SNAPSHOT_BUFFER_SIZE = 3;

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function createSnapshotBuffer({ delayMs = SNAPSHOT_RENDER_DELAY_MS, maxSamples = SNAPSHOT_BUFFER_SIZE, snapDistance = 48 } = {}) {
  const sampleLimit = Math.max(2, Math.floor(Number(maxSamples) || SNAPSHOT_BUFFER_SIZE));
  const renderDelay = Math.max(0, Number(delayMs) || 0);
  const teleportDistance = Math.max(0, Number(snapDistance) || 0);

  function reset(entity, x, y, timestamp = monotonicNow()) {
    if (!entity || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
    const sample = { x: Number(x), y: Number(y), time: Number(timestamp) };
    entity._snapshots = [sample];
    entity.px = sample.x;
    entity.py = sample.y;
    return sample;
  }

  function push(entity, x, y, timestamp = monotonicNow()) {
    if (!entity || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y)) || !Number.isFinite(Number(timestamp))) return false;
    const sample = { x: Number(x), y: Number(y), time: Number(timestamp) };
    const snapshots = Array.isArray(entity._snapshots) ? entity._snapshots : [];
    const latest = snapshots[snapshots.length - 1];
    if (latest && sample.time < latest.time) return false;
    if (!latest) {
      reset(entity, sample.x, sample.y, sample.time);
      return true;
    }
    if (Math.hypot(sample.x - latest.x, sample.y - latest.y) > teleportDistance) {
      reset(entity, sample.x, sample.y, sample.time);
      return true;
    }
    if (sample.time === latest.time) snapshots[snapshots.length - 1] = sample;
    else snapshots.push(sample);
    if (snapshots.length > sampleLimit) snapshots.splice(0, snapshots.length - sampleLimit);
    entity._snapshots = snapshots;
    return true;
  }

  function sample(entity, renderTime = monotonicNow() - renderDelay) {
    const snapshots = entity?._snapshots;
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return entity && Number.isFinite(Number(entity.px)) && Number.isFinite(Number(entity.py))
        ? { x: Number(entity.px), y: Number(entity.py) }
        : null;
    }
    if (snapshots.length === 1 || renderTime <= snapshots[0].time) {
      return { x: snapshots[0].x, y: snapshots[0].y };
    }
    for (let index = 1; index < snapshots.length; index += 1) {
      const newer = snapshots[index];
      if (renderTime > newer.time) continue;
      const older = snapshots[index - 1];
      const span = newer.time - older.time;
      const alpha = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.time) / span)) : 1;
      return { x: older.x + (newer.x - older.x) * alpha, y: older.y + (newer.y - older.y) * alpha };
    }
    const latest = snapshots[snapshots.length - 1];
    return { x: latest.x, y: latest.y };
  }

  return Object.freeze({ delayMs: renderDelay, maxSamples: sampleLimit, reset, push, sample });
}

export const EntitySnapshots = createSnapshotBuffer();
