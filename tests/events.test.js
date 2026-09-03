import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, isFlooded } from '../src/game/state.js';
import { integrate, constructBuilding, queueLocalSurvey } from '../src/game/engine.js';
import { SOLAR_OUTPUT_PER_DAY } from '../src/game/constants.js';

test('flood tiles are deterministic per seed and depend on the local day', () => {
  const a = createGame('firstLight'); const b = createGame('firstLight');
  const day0 = isFlooded(a, 0); const during = isFlooded(a, 300); const after = isFlooded(a, 400);
  const someKey = a.floodKeys[0];
  assert.equal(day0(someKey.split(',')[0], someKey.split(',')[1]), false);
  assert.equal(during(someKey.split(',')[0], someKey.split(',')[1]), true);
  assert.equal(after(someKey.split(',')[0], someKey.split(',')[1]), false);
  assert.deepEqual(a.floodKeys, b.floodKeys, 'same seed, same flood cells');
});

test('construction is rejected on a flooded tile during the seeded flood', () => {
  let s = createGame('firstLight');
  const key = s.floodKeys[0]; const [x, y] = key.split(',').map(Number);
  const before = constructBuilding(s, 'battery', Number(x), Number(y), 'daneel'); // day 0: not flooded
  assert.equal(before.buildings.at(-1).status, 'queued');
  s = before; s = integrate(s, 300 - 1); // now inside the flood window
  assert.throws(() => constructBuilding(s, 'battery', Number(x), Number(y), 'daneel'), (e) => e.code === 'TILE_FLOODED');
});

test('stale human fixed coordinates fail when the flood has changed the tile by arrival time', () => {
  // An uplink order validates again at arrival against the *current* local observation.
  let s = createGame('firstLight');
  const key = s.floodKeys.find((k) => { const [x, y] = k.split(',').map(Number); return x + y > 30; });
  const [x, y] = key.split(',').map(Number);
  const before = constructBuilding(s, 'battery', x, y, 'human'); s = before;
  // A new builder (local) at the same tile after the flood must be rejected; the same validation
  // gate runs for a human-arrival order executed at that local day.
  s = integrate(s, 240);
  assert.throws(() => constructBuilding(s, 'battery', x, y, 'human-arrival'), (e) => e.code === 'TILE_FLOODED');
});

test('power outage excludes the seeded source for exactly its window', () => {
  let s = createGame('firstLight');
  // Only solar-1 exists -> outage must starve power and drive the zero-power streak.
  s = integrate(s, 180); assert.equal(s.resources.power > 0, true);
  s = integrate(s, 179);
  assert.equal(s.mission.interruption.startedAt, 180);
  assert.equal(s.mission.interruption.sustained, s.mission.interruption.minPower >= 0);
  assert.equal(s.mission.interruption.endAt, 359);
  // Day 360 onward solar-1 is back.
  s = integrate(s, 1);
  assert.equal(s.mission.interruption.sustained, true);
});

test('Mission III life-support fault disables its named solar facility for the authored window', () => {
  let faulted = createGame('rightToDecide');
  // Isolate the facility event at day 400: solar-1 is connected, and zero
  // population makes the fault's lost solar generation directly observable.
  faulted.localDay = 399;
  faulted.resources.population = 0;
  faulted.resources.power = 100;
  const healthy = structuredClone(faulted);
  healthy.pendingEvents = healthy.pendingEvents.filter((event) => event.type !== 'life-support-fault');

  faulted = integrate(faulted, 1);
  const uninterrupted = integrate(healthy, 1);

  assert.ok(Math.abs((uninterrupted.resources.power - faulted.resources.power) - SOLAR_OUTPUT_PER_DAY) < 1e-9);
});

test('collapse is deterministic: sixty zero-power days end the mission', () => {
  // Deterministic starvation fixture: a day-zero outage removes the only connected source.
  let s = createGame('firstLight');
  s.pendingEvents.push({ day: 0, type: 'power-outage', days: 999, sources: ['solar-1'] });
  s.resources.power = 20;
  s = integrate(s, 60);
  assert.equal(s.resources.power, 0);
  assert.equal(s.mission.collapsedAt, null); // streak under 60
  s = integrate(s, 60);
  assert.ok(s.mission.collapsedAt >= 90 && s.mission.collapsedAt <= 120, `collapsedAt was ${s.mission.collapsedAt}`);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'life-support-collapse');
});

test('survey completion discovers the authored ecology on schedule', () => {
  let s = createGame('rightToDecide');
  s = queueLocalSurvey(s, 'ridge');
  s = integrate(s, 60);
  const evt = s.events.find((e) => e.type === 'survey_complete');
  assert.equal(evt.discovery, 'microbial-mat');
  assert.ok(s.events.find((e) => e.type === 'discovery' && e.day === 60));
});

test('no negative inventories or NaN at any point in a long no-build run', () => {
  let s = createGame('enough');
  let day = 0;
  while (day < 900) { s = integrate(s, 30); day += 30; for (const v of Object.values(s.resources)) { assert.ok(Number.isFinite(v), 'finite'); assert.ok(v >= 0, 'non-negative'); } }
});
