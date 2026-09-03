import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeDeadlines, SUPERPOSITION_COOLDOWN_MS, SUPERPOSITION_DURATION_MS } from '../src/game/superposition.js';

test('runtime superposition deadlines use monotonic time while preserving persisted wall-clock remaining time', () => {
  const wallNow = 10_000;
  const runtimeNow = 500;
  const deadlines = runtimeDeadlines({
    activeUntilMs: wallNow + SUPERPOSITION_DURATION_MS,
    lastActivatedAtMs: wallNow,
  }, wallNow, runtimeNow);

  assert.equal(deadlines.activeUntil, runtimeNow + SUPERPOSITION_DURATION_MS);
  assert.equal(deadlines.cooldownUntil, runtimeNow + SUPERPOSITION_COOLDOWN_MS);

  const afterWallClockJump = runtimeDeadlines({
    activeUntilMs: wallNow + SUPERPOSITION_DURATION_MS,
    lastActivatedAtMs: wallNow,
  }, wallNow + 1_000_000, 900);
  assert.equal(afterWallClockJump.activeUntil, 900);
  assert.equal(afterWallClockJump.cooldownUntil, 900);
});
