export const FIXED_UPDATE_MS = 1000 / 60;

export function createFixedStepClock({ stepMs = FIXED_UPDATE_MS, maxFrameDeltaMs = 100, maxCatchUpSteps = 5 } = {}) {
  const step = Math.max(1, Number(stepMs) || FIXED_UPDATE_MS);
  const maxDelta = Math.max(step, Number(maxFrameDeltaMs) || 100);
  const maxSteps = Math.max(1, Math.floor(Number(maxCatchUpSteps) || 5));
  let previousTime = null;
  let accumulator = 0;

  return Object.freeze({
    stepMs: step,
    reset(timestamp = null) {
      previousTime = Number.isFinite(Number(timestamp)) ? Number(timestamp) : null;
      accumulator = 0;
    },
    advance(timestamp) {
      const now = Number(timestamp);
      if (!Number.isFinite(now)) return Object.freeze({ frameDelta: 0, steps: 0, alpha: accumulator / step });
      if (previousTime === null) {
        previousTime = now;
        return Object.freeze({ frameDelta: 0, steps: 0, alpha: 0 });
      }
      const frameDelta = Math.min(maxDelta, Math.max(0, now - previousTime));
      previousTime = now;
      accumulator = Math.min(accumulator + frameDelta, step * maxSteps);
      const steps = Math.min(maxSteps, Math.floor((accumulator + 1e-8) / step));
      accumulator = Math.max(0, accumulator - steps * step);
      return Object.freeze({ frameDelta, steps, alpha: Math.min(1, accumulator / step) });
    },
  });
}
