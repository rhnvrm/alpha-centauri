import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { integrate, constructBuilding, queueLocalCargo } from '../src/game/engine.js';
import { buildLocal } from './helpers.js';

const settleAt = (state, day) => {
  state.localDay = day - 1;
  return integrate(state, 1);
};

test('Mission I winning fixture: capacity, two sources, and a sustained 180-day interruption', () => {
  let s = createGame('firstLight');
  s = buildLocal(s, 'habitat');       // capacity 64 -> 100
  s = buildLocal(s, 'solar');         // source #2
  s = buildLocal(s, 'battery');       // reserve buffer
  const outage = s.pendingEvents.find((event) => event.type === 'power-outage');
  s = integrate(s, outage.day + outage.days + 1);
  assert.equal(s.resources.capacity, 100);
  assert.equal(s.mission.interruption.sustained, true);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'objective-secured');
  const eventLog = s.events.filter((e) => ['power_interruption_started', 'power_interruption_ended', 'job_complete'].includes(e.type));
  assert.ok(eventLog.length >= 4);
});

test('Mission I manual route is not forced: no second source means the outage is survivable only via stock', () => {
  let s = createGame('firstLight');
  s = buildLocal(s, 'battery');
  const outage = s.pendingEvents.find((event) => event.type === 'power-outage');
  s = integrate(s, outage.day + outage.days + 1);
  // Only one connected source -> mission cannot resolve as complete; it stays in progress.
  assert.equal(s.mission.status, 'active');
  assert.notEqual(s.mission.outcome, 'objective-secured');
});

test('Mission II winning fixture: reserve floors for two local years', () => {
  let s = createGame('enough');
  s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar');
  s = buildLocal(s, 'battery');
  s = buildLocal(s, 'greenhouse'); s = buildLocal(s, 'greenhouse'); s = buildLocal(s, 'greenhouse');
  s = buildLocal(s, 'reservoir');
  s = settleAt(s, s.mission.sustainDays);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'objective-secured');
  assert.equal(s.mission.protectionLost, 0);
  assert.ok(s.resources.food / (s.resources.population * 0.02) / 30 >= 24, 'food floor held at the end');
  assert.ok(s.resources.powerCapacity ? s.resources.power / s.resources.powerCapacity >= 0.2 : false, 'power reserve held at the end');
});

test('Mission II cannot be won by waiting on a fresh colony', () => {
  const fresh = createGame('enough');
  const s = settleAt(fresh, fresh.mission.sustainDays);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'reserves-broken');
  assert.notEqual(s.mission.outcome, 'objective-secured');
});

test('Mission II losing fixture: building across protected wetland loses the wetlands outcome', () => {
  let s = createGame('enough');
  // Same build-out as the winning fixture so the colony survives; the protected loss is the failure.
  s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar');
  s = buildLocal(s, 'battery');
  s = buildLocal(s, 'greenhouse');
  s = buildLocal(s, 'reservoir');
  s.doctrine.authority.habitatLoss = true; // human granted the authority via delivered doctrine
  const wet = s.tiles.find((t) => t.terrain === 'wetland' && t.x > 2 && t.y > 2 && t.x < 29 && t.y < 29 && !s.buildings.some((b) => b.x === t.x && b.y === t.y));
  s = constructBuilding(s, 'battery', wet.x, wet.y, 'daneel');
  assert.ok(s.mission.protectionLost > 0, 'protected cells are counted');
  s = settleAt(s, s.mission.sustainDays);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'wetlands-lost');
  assert.ok(s.events.find((e) => e.type === 'protected_habitat_lost'));
});

test('Mission III trust earned: export 1,000 t before the deadline without habitat loss', () => {
  let s = createGame('rightToDecide');
  s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar');
  s = buildLocal(s, 'battery'); s = buildLocal(s, 'battery');
  s = queueLocalCargo(s, 300);
  s = integrate(s, 90);
  s = queueLocalCargo(s, 380);
  s = integrate(s, 90);
  s = queueLocalCargo(s, 360);
  s = settleAt(s, s.mission.deadlineDay);
  assert.ok(s.mission.exported >= 1000);
  assert.equal(s.mission.protectionLost, 0);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'trust-earned');
});

test('Mission III hollow success: export met, but an authorized habitat loss fails stewardship', () => {
  let s = createGame('rightToDecide');
  s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar');
  s = buildLocal(s, 'battery');
  s.doctrine.authority.habitatLoss = true;
  const wet = s.tiles.find((t) => t.terrain === 'wetland');
  s = constructBuilding(s, 'battery', wet.x, wet.y, 'daneel');
  assert.ok(s.mission.protectionLost > 0);
  s = queueLocalCargo(s, 300); s = integrate(s, 90);
  s = queueLocalCargo(s, 380); s = integrate(s, 90);
  s = queueLocalCargo(s, 360); s = settleAt(s, s.mission.deadlineDay);
  assert.ok(s.mission.exported >= 1000);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'hollow-success');
});

test('Mission III safe but late: no export by the deadline is a distinct outcome', () => {
  let s = createGame('rightToDecide');
  s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'solar');
  s = buildLocal(s, 'battery');
  s = settleAt(s, s.mission.deadlineDay);
  assert.equal(s.mission.exported, 0);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'safe-but-late');
});
