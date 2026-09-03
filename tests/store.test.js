import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { integrate, sendAuthorizationRequest, queueHumanAuthResponse, constructBuilding } from '../src/game/engine.js';
import { LIGHT_DELAY_DAYS } from '../src/game/constants.js';
import { createStore } from '../src/game/store.js';
import { loadGame, saveGame, clearGame, storageProbe, exportGame, validateImport, SAVE_SIZE_BUDGET } from '../src/game/storage.js';
import { createToolSet } from '../src/webmcp/tools.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (storage.failWrites) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem: (k) => map.delete(k), map, failWrites: false,
  };
  return storage;
}

test('save/load roundtrip restores the exact simulation day and packet ETAs', () => {
  const storage = fakeStorage();
  let s = createGame(); s = integrate(s, 1200);
  const packet = s.packets.at(-1);
  assert.equal(saveGame(s, storage), true);
  const loaded = loadGame(storage);
  assert.equal(loaded.localDay, 1200);
  assert.equal(loaded.packets.at(-1).arrivalDay, packet.arrivalDay);
});

test('legacy saves without authorization questions load without resetting progress', () => {
  const legacy = integrate(createGame('firstLight', 'legacy-session'), 45);
  delete legacy.pendingQuestions;
  const raw = JSON.stringify(legacy);
  const storage = fakeStorage({ 'intent-horizon-save-v1': raw });
  const store = createStore({ storage });
  const loaded = store.getState();
  assert.deepEqual(loaded.pendingQuestions.filter((q) => !q.answered), []);
  assert.equal(loaded.sessionId, 'legacy-session');
  assert.equal(loaded.localDay, 45);
  assert.deepEqual(loaded.resources, legacy.resources);
  assert.equal(storage.getItem('intent-horizon-save-v1'), raw, 'loading leaves the original save intact');
  store.advance(1);
  assert.equal(store.getState().localDay, 46);
  assert.deepEqual(loadGame(storage).pendingQuestions, []);
});

test('legacy simulation extensions are filled in without overwriting saved fields', () => {
  const legacy = createGame('enough', 'legacy-extensions');
  legacy.localDay = 25;
  legacy.mission.exported = 123;
  legacy.doctrine.authority.exports = true;
  for (const key of ['pendingQuestions', 'pendingEvents', 'floodKeys', 'flows', 'productionRates', 'earthCoast', 'demoPace', 'observedWorld']) delete legacy[key];
  delete legacy.mission.interruption;
  delete legacy.mission.collapsedAt;
  delete legacy.mission.powerZeroStreak;
  delete legacy.doctrine.protocols;
  delete legacy.doctrine.charter;
  const storage = fakeStorage({ 'intent-horizon-save-v1': JSON.stringify(legacy) });
  const loaded = createStore({ storage });
  assert.deepEqual(loaded.getState().doctrine.protocols, []);
  assert.equal(loaded.getState().doctrine.charter.missionId, 'enough');
  assert.equal(loaded.getState().doctrine.authority.exports, true);
  assert.equal(loaded.getState().mission.exported, 123);
  assert.deepEqual(loaded.getState().productionRates, {});
  assert.equal(loaded.getState().demoPace, false);
  assert.doesNotThrow(() => loaded.advance(1));
  assert.equal(loaded.getState().localDay, 26);
  assert.equal(loaded.getState().mission.status, 'active');
});

test('imports use the same legacy migration and preserve existing questions', () => {
  const legacy = createGame('rightToDecide');
  delete legacy.pendingQuestions;
  const migrated = validateImport(JSON.stringify(legacy));
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.state.pendingQuestions, []);
  legacy.pendingQuestions = [{ packetId: 'question-1', question: 'Allow?', answered: false }];
  const storage = fakeStorage({ 'intent-horizon-save-v1': JSON.stringify(legacy) });
  assert.deepEqual(loadGame(storage).pendingQuestions, legacy.pendingQuestions);
  assert.deepEqual(validateImport(JSON.stringify(legacy)).state.pendingQuestions, legacy.pendingQuestions);
});

test('a write failure keeps the last committed world and pauses play', () => {
  const storage = fakeStorage(); storage.failWrites = true;
  const store = createStore({ storage });
  const before = store.getState().localDay;
  store.advance(30);
  assert.equal(store.getState().localDay, before, 'uncommitted advance is not visible');
  assert.equal(store.getState().paused, true);
  assert.equal(store.getState().saveError, true);
});

test('superposition is a scarce, timed visual diagnostic with a persistent cooldown', () => {
  const store = createStore({ storage: fakeStorage() });
  const before = store.getState(); const now = 1_000_000;
  const first = store.activateSuperposition(now);
  assert.equal(first.ok, true);
  assert.equal(store.getState().superposition.passes, 1);
  assert.equal(store.getState().superposition.activeUntilMs, now + 30_000);
  assert.equal(store.getState().localDay, before.localDay, 'visual access does not advance local time');
  assert.deepEqual(store.getState().resources, before.resources, 'visual access does not mutate resources');
  assert.equal(store.activateSuperposition(now + 10_000).reason, 'ACTIVE');
  assert.equal(store.activateSuperposition(now + 40_000).reason, 'COOLDOWN');
  const second = store.activateSuperposition(now + 60_000);
  assert.equal(second.ok, true);
  assert.equal(store.getState().superposition.passes, 0);
  assert.equal(store.activateSuperposition(now + 120_000).reason, 'NO_PASSES');
});

test('invalid and newer saves are preserved for recovery, not silently reset', () => {
  const storage = fakeStorage({ 'intent-horizon-save-v1': JSON.stringify({ junk: true }) });
  assert.equal(loadGame(storage), null);
  assert.ok(storage.map.has('intent-horizon-save-v1:invalid'));
  // A newer schema version is treated the same way.
  const newer = fakeStorage({ 'intent-horizon-save-v1': JSON.stringify({ schemaVersion: 999, sessionId: 'x', localDay: 0 }) });
  assert.equal(loadGame(newer), null);
  assert.ok(newer.map.has('intent-horizon-save-v1:invalid'));
});

test('storage probe reports availability and denial separately', () => {
  assert.equal(storageProbe(fakeStorage()).available, true);
  const denied = { getItem: () => null, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => {} };
  assert.equal(storageProbe(denied).available, false);
});

test('oversized saves are refused instead of corrupting the quota', () => {
  const storage = fakeStorage();
  const s = { schemaVersion: 1, sessionId: 'big', localDay: 0, blob: 'x'.repeat(SAVE_SIZE_BUDGET + 10) };
  assert.equal(saveGame(s, storage), false);
});

test('export/import is scoped and schema-validated; imports get a fresh session', () => {
  const s = createGame('enough'); s.localDay = 555;
  const doc = exportGame(s);
  const result = validateImport(doc);
  assert.equal(result.ok, true);
  assert.equal(result.state.localDay, 555);
  assert.notEqual(result.state.sessionId, s.sessionId);
  assert.equal(validateImport('not json').ok, false);
  assert.equal(validateImport(JSON.stringify({ nope: 1 })).ok, false);
});

test('same operationId never applies twice and revision mismatch is rejected', async () => {
  let state = createGame(); const store = { getState: () => state, commit: (n) => { state = n; } };
  const tools = createToolSet(store);
  const connect = tools.find((t) => t.name === 'connect_steward');
  const c = await connect.execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  const leaseId = c.result.leaseId; state = store.getState();
  assert.equal(state.paused, false); assert.equal(state.demoPace, true);
  state.inbox.push({ id: 'store-earth-intent', kind: 'intent', payload: { text: 'Proceed with a safe resilience action.' }, deliveredDay: state.localDay, handled: false });
  const acknowledged = await tools.find((t) => t.name === 'yield_control').execute({ sessionId: state.sessionId, leaseId, expectedRevision: state.revision, operationId: 'ack-store-earth-intent', handledMessageIds: ['store-earth-intent'] });
  assert.equal(acknowledged.ok, true);
  state = store.getState();
  const construct = tools.find((t) => t.name === 'construct_building');
  const args = { sessionId: state.sessionId, leaseId, expectedRevision: state.revision, operationId: 'op-1', type: 'battery', x: 5, y: 5 };
  const first = await construct.execute(args);
  const second = await construct.execute({ ...args, expectedRevision: state.revision });
  assert.equal(first.ok, true);
  assert.deepEqual(second.result, first.result);
  assert.equal(state.jobs.filter((j) => j.type === 'construct').length, 1);
  const stale = await construct.execute({ ...args, operationId: 'op-2', expectedRevision: state.revision - 1 });
  assert.equal(stale.ok, false); assert.equal(stale.error.code, 'STALE_REVISION');
});

test('an old runtime lease cannot mutate a reset session', async () => {
  let state = createGame(); const store = { getState: () => state, commit: (n) => { state = n; } };
  const tools = createToolSet(store);
  const c = await tools.find((t) => t.name === 'connect_steward').execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  const oldLease = c.result.leaseId;
  store.commit(createGame('enough')); // new game: new session + old lease invalid
  const res = await tools.find((t) => t.name === 'construct_building').execute({ sessionId: state.sessionId, leaseId: oldLease, expectedRevision: state.revision, operationId: 'op-x', type: 'battery', x: 5, y: 5 });
  assert.equal(res.ok, false); assert.equal(res.error.code, 'LEASE_EXPIRED');
});

test('wait_for_event uses distinct cursors and reports an empty wait honestly', async () => {
  let state = createGame('rightToDecide'); const store = { getState: () => state, commit: (n) => { state = n; } };
  const tools = createToolSet(store);
  await tools.find((t) => t.name === 'connect_steward').execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  state = store.getState();
  const wait = tools.find((t) => t.name === 'wait_for_event');
  const empty = await wait.execute({ sessionId: state.sessionId, leaseId: state.connection.leaseId, cursor: 0, timeoutMs: 5 });
  assert.equal(empty.result.timedOut, true);
  // A local discovery event (authored, deterministic) arrives after the first
  // Earth directive window -> sequence grows past the cursor.
  const discovery = state.pendingEvents.find((event) => event.type === 'survey-discovery');
  state = integrate(state, discovery.day);
  const next = await wait.execute({ sessionId: state.sessionId, leaseId: state.connection.leaseId, cursor: empty.result.cursor, timeoutMs: 5 });
  assert.equal(next.result.timedOut, false);
  assert.ok(next.result.events.length > 0);
  const after = await wait.execute({ sessionId: state.sessionId, leaseId: state.connection.leaseId, cursor: next.result.cursor, timeoutMs: 5 });
  assert.equal(after.result.events.length, 0);
});

test('register_policy requires a delivered instruction reference', async () => {
  let state = createGame(); const store = { getState: () => state, commit: (n) => { state = n; } };
  const tools = createToolSet(store);
  await tools.find((t) => t.name === 'connect_steward').execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  const reg = tools.find((t) => t.name === 'register_policy');
  const denied = await reg.execute({ sessionId: state.sessionId, leaseId: state.connection.leaseId, expectedRevision: state.revision, operationId: 'p1', name: 'r24', sourceInstructionId: 'never-delivered' });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'CHECKPOINT_CLOSED');
});

test('authorization round trip: question reaches Earth, an answer arrives back 2D later', () => {
  let s = createGame('rightToDecide');
  s = sendAuthorizationRequest(s, { question: 'May we use the direct ridge route?', options: ['allow', 'deny'], safeDefault: 'deny' });
  const qPacket = s.packets.at(-1);
  s = integrate(s, LIGHT_DELAY_DAYS);
  const question = s.pendingQuestions.find((q) => q.packetId === qPacket.id);
  assert.ok(question, 'Earth sees the question only after D');
  assert.equal(question.answerDay, LIGHT_DELAY_DAYS + LIGHT_DELAY_DAYS);
  s = queueHumanAuthResponse(s, qPacket.id, 'allow');
  assert.equal(s.doctrine.authority.habitatLoss, false);
  s = integrate(s, LIGHT_DELAY_DAYS);
  assert.equal(s.doctrine.authority.habitatLoss, true, 'authority applies only after the answer arrives');
  assert.equal(s.pendingQuestions.find((q) => q.packetId === qPacket.id).answered, true);
  // With authority, a wetland build is possible but counts as irreversible loss.
  const wet = s.tiles.find((t) => t.terrain === 'wetland');
  s = constructBuilding(s, 'battery', wet.x, wet.y, 'daneel');
  assert.ok(s.mission.protectionLost > 0);
});
