import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { integrate, sendReport, nextEarthArrivalDay, queueHumanIntent, constructBuilding, queueLocalRoad } from '../src/game/engine.js';
import { loadGame, saveGame } from '../src/game/storage.js';
import { createStore } from '../src/game/store.js';
import { earthProjection } from '../src/game/projections.js';
import { buildLocal } from './helpers.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

test('Earth renders only the received world: local builds stay invisible until telemetry lands', () => {
  let s = createGame('firstLight');
  const localBefore = s.observedWorld.buildings.length;
  s = buildLocal(s, 'habitat'); // Daneel builds locally
  assert.equal(s.observedWorld.buildings.length, localBefore, 'Earth sees nothing until a report arrives');
  s = integrate(s, 90); // the habitat completes locally
  s = sendReport(s, 'Habitat framed; framing continues.');
  const flight = s.packets.at(-1).arrivalDay - s.localDay;
  s = integrate(s, flight);
  assert.equal(s.observedWorld.buildings.length, localBefore + 1, 'the completed habitat appears in the received world');
  assert.ok(s.observedWorld.buildings.some((b) => b.type === 'habitat' && b.id !== 'hab-1'));
});

test('queued local builds (not yet complete) never leak into telemetry', () => {
  let s = createGame('firstLight');
  s = constructBuilding(s, 'battery', 28, 3, 'daneel'); // queued, not complete
  const payload = sendReport(s, 'status').packets.at(-1).payload;
  assert.equal(payload.observedWorld.buildings.some((b) => b.type === 'battery'), false);
});

test('autonomous telemetry is filed on a fixed yearly cadence and arrives with the normal delay', () => {
  let s = createGame('firstLight');
  s = integrate(s, 364);
  assert.equal(s.packets.filter((p) => p.kind === 'telemetry').length, 0);
  s = integrate(s, 1);
  const filed = s.packets.filter((p) => p.kind === 'telemetry');
  assert.equal(filed.length, 1);
  assert.equal(filed[0].source, 'autonomy');
  assert.equal(s.observedWorld.buildings.length, 3, 'Earth world unchanged before arrival');
  s = integrate(s, filed[0].arrivalDay - s.localDay);
  assert.ok(s.events.find((e) => e.type === 'report_received'));
});

test('nextEarthArrivalDay returns the exact next arrival or null', () => {
  let s = createGame('firstLight');
  assert.equal(nextEarthArrivalDay(s), null);
  s = queueHumanIntent(s, 'hello');
  s = sendReport(s, 'world');
  const arrivals = s.packets.map((p) => p.arrivalDay);
  assert.equal(nextEarthArrivalDay(s), Math.min(...arrivals));
  assert.ok(nextEarthArrivalDay(s) > s.localDay);
});

test('store coast advance caps at the arrival and nextEarthEvent jumps exactly there', () => {
  const storage = fakeStorage();
  const store = createStore({ storage });
  let st = store.getState();
  st = st; store.commit({ ...st, earthCoast: true });
  const after = store.advance(30);
  assert.equal(after.localDay, 30, 'no packets in flight, so nothing to cap');
  // Now queue a packet and coast again.
  store.intent('a distant instruction');
  const target = store.nextEarthArrivalDay();
  const coasted = store.advance(5000);
  assert.ok(coasted.localDay <= target, `coast stopped at or before arrival (${coasted.localDay} <= ${target})`);
  assert.equal(coasted.localDay, target, 'coast lands exactly on the arrival day');
  // Autonomous telemetry filed during the coast creates the next Earth-bound arrivals.
  const nextArrival = store.nextEarthArrivalDay();
  assert.ok(nextArrival !== null && nextArrival > target);
  const earth = store.nextEarthEvent();
  assert.equal(earth.localDay, nextArrival, 'Earth Event lands on the next Earth-visible arrival');
  assert.ok(earth.packets.find((p) => p.kind === 'intent')?.status === 'delivered');
});

test('old saves without observedWorld migrate to the founding observation', () => {
  let s = createGame('firstLight');
  delete s.observedWorld; delete s.earthCoast;
  const storage = fakeStorage(); saveGame(s, storage);
  const loaded = loadGame(storage);
  assert.ok(loaded.observedWorld, 'migrated');
  assert.equal(loaded.observedWorld.buildings.length, s.buildings.filter((b) => b.status === 'complete').length);
  assert.equal(loaded.earthCoast, false);
});

test('reports carry the observed world and Earth projection exposes it only after arrival', () => {
  let s = createGame('firstLight');
  s = sendReport(s, 'all nominal');
  let proj = earthProjection(s);
  assert.equal(proj.packets[0].status, 'in-transit');
  const flight = s.packets.at(-1).arrivalDay - s.localDay;
  s = integrate(s, flight);
  proj = earthProjection(s);
  assert.ok(proj.packets[0].status === 'delivered');
  assert.equal(s.observedWorld.roads.length >= 1, true);
  assert.equal(s.reports.length, 1);
});