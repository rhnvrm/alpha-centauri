export const SUPERPOSITION_DURATION_MS = 30_000;
export const SUPERPOSITION_COOLDOWN_MS = 60_000;

export function monotonicNow() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

/**
 * Convert persisted wall-clock deadlines into deadlines for this page's
 * monotonic runtime clock. Persistence remains wall-clock based so a reload
 * cannot reset an active pass or its cooldown.
 */
export function runtimeDeadlines(meta = {}, wallNow = Date.now(), runtimeNow = monotonicNow()) {
  const activeRemainingMs = Math.max(0, (meta.activeUntilMs || 0) - wallNow);
  const cooldownRemainingMs = Math.max(0, (meta.lastActivatedAtMs || 0) + SUPERPOSITION_COOLDOWN_MS - wallNow);
  return {
    activeUntil: runtimeNow + activeRemainingMs,
    cooldownUntil: runtimeNow + cooldownRemainingMs,
  };
}
