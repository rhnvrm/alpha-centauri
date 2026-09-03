import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { integrate, sendReport, nextEarthArrivalDay, queueHumanIntent, constructBuilding, queueLocalRoad, queueLocalSurvey, inspectProjection } from '../src/game/engine.js';
import { loadGame, saveGame } from '../src/game/storage.js';
import { createStore } from '../src/game/store.js';
import { earthDemoGuide, earthMissionStatus, earthProjection, eventControlCopy } from '../src/game/projections.js';
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

test('a rover survey expands Daneel knowledge first, then Earth knowledge only after its telemetry arrives', () => {
  let s = createGame('rightToDecide');
  const initiallyObserved = new Set(s.observedKnowledge.surveyedTiles);
  s = queueLocalSurvey(s, 'ridge');
  s = integrate(s, 60);
  const localRegion = inspectProjection(s).surveyedRegions.find((region) => region.id === 'ridge');
  assert.equal(localRegion?.name, 'Cobalt Ridge');
  assert.ok(s.localKnowledge.surveyedTiles.some((key) => !initiallyObserved.has(key)), 'Daneel has a newly surveyed area');
  assert.deepEqual(s.observedKnowledge.surveyedTiles, [...initiallyObserved], 'Earth has not received the survey');
  s = sendReport(s, 'Cobalt Ridge survey complete.');
  s = integrate(s, s.packets.at(-1).arrivalDay - s.localDay);
  assert.ok(s.observedKnowledge.regions.some((region) => region.name === 'Cobalt Ridge'));
  assert.deepEqual(s.observedKnowledge.surveyedTiles, s.localKnowledge.surveyedTiles);
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

test('demo pace advances exactly one local day per 1× tick', () => {
  const store = createStore({ storage: fakeStorage() });
  store.advance(178);
  store.toggleDemoPace();
  const after = store.demoStep();
  assert.equal(after.demoPace, true);
  assert.equal(after.localDay, 179, 'one 1× tick advances one local day');
  const next = store.demoStep();
  assert.equal(next.localDay, 180, 'the authored event still lands on its exact day');
  assert.equal(next.mission.interruption.startedAt, 180);
  store.advance(180);
  const steady = store.demoStep();
  assert.equal(steady.localDay, 361, 'uneventful time does not silently jump ahead');
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
  assert.equal(proj.packets.length, 0, 'an in-flight downlink is not yet visible to Earth');
  const flight = s.packets.at(-1).arrivalDay - s.localDay;
  s = integrate(s, flight);
  proj = earthProjection(s);
  assert.ok(proj.packets[0].status === 'delivered');
  assert.equal(s.observedWorld.roads.length >= 1, true);
  assert.equal(s.reports.length, 1);
});

test('Earth UI cannot infer an unreceived mission result from the local simulation', () => {
  let s = createGame('firstLight');
  s = buildLocal(s, 'habitat'); s = buildLocal(s, 'solar'); s = buildLocal(s, 'battery');
  s = integrate(s, 361);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(earthMissionStatus(s).label, 'IN PROGRESS · OBSERVED');
  assert.equal(earthProjection(s).packets.some((packet) => packet.kind === 'mission-result'), false);
  const result = s.packets.find((packet) => packet.kind === 'mission-result');
  s = integrate(s, result.arrivalDay - s.localDay);
  assert.equal(earthMissionStatus(s).label, 'COMPLETE · CONFIRMED');
  assert.equal(earthProjection(s).packets.some((packet) => packet.kind === 'mission-result'), true);
});

test('demo guide only advances from Earth-known connection and received relay facts', () => {
  let s = createGame('firstLight');
  assert.equal(earthDemoGuide(s).action, 'daneel');
  s.connection.status = 'connected';
  assert.equal(earthDemoGuide(s).action, 'pace');
  s.demoPace = true;
  // The local mission can already be resolved, but Earth cannot call it complete
  // or offer a new instruction until a downlink has arrived.
  s.mission.status = 'pending-confirmation';
  s.mission.outcome = 'objective-secured';
  assert.equal(earthDemoGuide(s).action, 'wait');
  s.reports.push({ id: 'received-report', receivedDay: s.localDay, payload: { text: 'received' } });
  assert.equal(earthDemoGuide(s).action, 'intent');
});

test('Earth NEXT controls do not expose Daneel local schedule before telemetry', () => {
  const s = createGame('firstLight');
  s.jobs.push({ id: 'local-construction', type: 'construct', status: 'active', completeDay: 42 });
  s.pendingEvents.push({ type: 'power-outage', day: 84, days: 3 });
  const earth = eventControlCopy(s, { nextLocalBoundary: 42, nextEarthBoundary: 365 });
  assert.equal(earth.next, 'NEXT EVENT');
  assert.equal(earth.earth, 'RECEIVE: NEXT EARTH RECEIPT');
  assert.doesNotMatch(`${earth.next} ${earth.earth}`, /42|365|CONSTRUCTION|POWER|LOCAL/i);

  const local = eventControlCopy(s, { local: true, nextLocalBoundary: 42, nextEarthBoundary: 365 });
  assert.match(local.next, /CONSTRUCTION COMPLETE · DAY 42/);
});
