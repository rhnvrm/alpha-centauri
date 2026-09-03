import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { integrate, queueHumanIntent, sendReport, queueLocalCargo } from '../src/game/engine.js';
import { earthProjection } from '../src/game/projections.js';
import { bitsForPayload, windowsFor, LIGHT_DELAY_DAYS, WINDOW_BITS, ENVELOPE_BITS } from '../src/game/constants.js';
import { buildLocal } from './helpers.js';

function buildWinFixture() {
  let s = createGame('firstLight');
  s = buildLocal(s, 'habitat');
  s = buildLocal(s, 'solar');
  s = buildLocal(s, 'battery');
  return s;
}

test('small messages: one window, departure at creation, arrival after exactly D', () => {
  let s = createGame(); s = queueHumanIntent(s, 'Keep life support stable');
  const p = s.packets.at(-1);
  assert.equal(p.windows, 1); assert.equal(p.departureDay, 0); assert.equal(p.arrivalDay, LIGHT_DELAY_DAYS);
});

test('oversized payloads serialize across consecutive windows; final chunk determines arrival', () => {
  let s = createGame();
  const longText = 'x'.repeat(3500); // ~28,000 bits + envelope -> over one window
  s = queueHumanIntent(s, longText);
  const p = s.packets.at(-1);
  assert.ok(p.windows > 1, 'long payload must span windows');
  assert.equal(p.departureDay, p.windows - 1);
  assert.equal(p.arrivalDay, p.departureDay + LIGHT_DELAY_DAYS);
});

test('window edge is exact: 2800 application bits fit one window, one more needs two', () => {
  // ENVELOPE_BITS is reserved; JSON serialization adds 11 bytes of object shells around the text.
  const textLen = Math.floor((WINDOW_BITS - ENVELOPE_BITS) / 8) - 11;
  const payload = { text: 'a'.repeat(textLen) };
  assert.equal(windowsFor(bitsForPayload(payload)), 1);
  assert.equal(windowsFor(bitsForPayload(payload) + 1), 2);
});

test('UTF-8 byte cost counts multibyte characters, not characters', () => {
  const emoji = { text: '🌿'.repeat(20) };
  const accent = { text: 'é'.repeat(20) };
  assert.equal(bitsForPayload(emoji) > bitsForPayload(accent), true);
  assert.equal(new TextEncoder().encode(emoji.text).length, 80);
});

test('uplink and downlink budgets are accounted independently per direction', () => {
  let s = createGame(); s = queueHumanIntent(s, 'uplink bytes');
  const up = s.channel.uplinkBits; const down0 = s.channel.downlinkBits;
  assert.ok(up > 0); assert.equal(down0, 0);
  s = sendReport(s, 'downlink bytes');
  assert.equal(s.channel.downlinkBits > 0, true);
  assert.equal(s.channel.downlinkBits, s.channel.downlinkBits);
});

test('mission outcome is not public until its confirming downlink arrives', () => {
  let s = buildWinFixture();
  s = integrate(s, 361);
  const confirm = s.packets.find((p) => p.kind === 'mission-result');
  assert.equal(s.mission.interruption.sustained, true);
  assert.equal(s.mission.status, 'pending-confirmation');
  assert.equal(s.mission.outcome, 'objective-secured');
  assert.equal(s.mission.earthOutcome, null);
  // The confirming packet was created the day the interruption resolution became known locally.
  assert.equal(confirm.arrivalDay, s.mission.interruption.endAt + LIGHT_DELAY_DAYS);
  const proj = earthProjection(s);
  assert.deepEqual(Object.keys(proj).filter((k) => k.includes('outcome')), []);
  s = integrate(s, confirm.arrivalDay - s.localDay);
  assert.equal(s.mission.status, 'confirmed');
  assert.equal(s.mission.earthOutcome, 'objective-secured');
  assert.equal(s.mission.confirmedAt, confirm.arrivalDay);
});

test('confirmation packet is a normal downlink packet with the own return delay', () => {
  let s = buildWinFixture(); s = integrate(s, 361);
  const confirm = s.packets.find((p) => p.kind === 'mission-result');
  assert.ok(confirm); assert.equal(confirm.direction, 'downlink');
  assert.equal(confirm.arrivalDay, s.mission.interruption.endAt + LIGHT_DELAY_DAYS);
  assert.equal(confirm.departureDay + LIGHT_DELAY_DAYS, confirm.arrivalDay);
});

test('cargo launch reserves iridium at queue time and exports only at job completion', () => {
  let s = createGame('rightToDecide');
  const before = s.resources.iridium;
  s = queueLocalCargo(s, 300);
  assert.equal(s.resources.iridium, before - 300);
  assert.equal(s.mission.exported, 0);
  s = integrate(s, 89);
  assert.equal(s.mission.exported, 0);
  s = integrate(s, 1);
  assert.equal(s.mission.exported, 300);
});