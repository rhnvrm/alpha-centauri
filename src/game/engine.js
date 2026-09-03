import { BUILDINGS, LIGHT_DELAY_DAYS, bitsForPayload, windowsFor } from './constants.js';
import { copyGame, markRevision, occupied, tileAt, updateProgress, scenarioFor, isFlooded, telemetryFor } from './state.js';
import { gridConsumers, powerSources, isGridConnected } from './networks.js';

const now = () => Date.now();
function event(state, type, payload = {}) { state.counters.event += 1; state.events.push({ id: state.counters.event, day: state.localDay, type, ...payload }); }
function packet(state, kind, payload, direction, createdDay = state.localDay, source = 'earth') {
  state.counters.packet += 1; const bits = bitsForPayload(payload); const windows = windowsFor(bits);
  const departureDay = createdDay + (windows - 1) * 1; // serialization: one window per local day; final chunk determines deliverability
  const p = { id: `packet-${state.counters.packet}`, kind, payload, direction, bits, windows, bytes: Math.ceil(bits / 8), createdDay, departureDay, arrivalDay: departureDay + LIGHT_DELAY_DAYS, status: 'in-transit', source };
  state.packets.push(p); if (direction === 'uplink') state.channel.uplinkBits += bits; else state.channel.downlinkBits += bits;
  return p;
}
function job(state, data, labor = false) {
  state.counters.job += 1; const j = { id: `job-${state.counters.job}`, status: 'queued', startDay: state.localDay, ...data, labor }; state.jobs.push(j);
  if (labor) assignFreeRobot(state, j);
  return j;
}

/** Deterministic labor gate: construction needs one idle robot; otherwise the job waits. */
function assignFreeRobot(state, j) {
  const robot = state.robots.find((r) => r.status === 'idle');
  if (robot) { robot.status = 'assigned'; robot.assignedJob = j.id; j.status = 'queued'; j.startDay = state.localDay; }
  else j.status = 'awaiting-labor';
}

function freeRobotFor(state, jobId) {
  const robot = state.robots.find((r) => r.assignedJob === jobId);
  if (robot) { robot.status = 'idle'; robot.assignedJob = null; }
}

export function assignRobots(state, jobId, robotIds = []) {
  const next = copyGame(state);
  const j = next.jobs.find((x) => x.id === jobId);
  if (!j || ['complete', 'cancelled'].includes(j.status)) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
  for (const rid of robotIds) {
    const r = next.robots.find((k) => k.id === rid);
    if (!r || r.assignedJob && r.assignedJob !== jobId) throw Object.assign(new Error('ROBOT_BUSY'), { code: 'ROBOT_BUSY', reason: 'Robot is unavailable or already assigned.' });
  }
  for (const rid of robotIds) { const r = next.robots.find((k) => k.id === rid); if (r && !r.assignedJob) { r.status = 'assigned'; r.assignedJob = jobId; } }
  if (j.status === 'awaiting-labor') { j.status = 'queued'; j.startDay = next.localDay; }
  event(next, 'robots_assigned', { jobId, robotIds }); return markRevision(next);
}

const floodFilter = (state, day) => { const fn = isFlooded(state, day); return (x, y) => fn(x, y); };

function activeOutage(state, day) { return state.pendingEvents.filter((e) => e.type === 'power-outage' && day >= e.day && day < e.day + e.days).map((e) => e.sources).flat(); }
function droughtFactor(state, day) { const e = state.pendingEvents.find((x) => x.type === 'drought' && day >= x.day && day < x.day + x.days); return e ? e.factor : 1; }
function faultedFacilities(state, day) { return new Set(state.pendingEvents.filter((e) => e.type === 'equipment-fault' && day >= e.day && day < e.day + e.days).map((e) => e.facility)); }

function powerFlow(state) {
  const outage = new Set(activeOutage(state, state.localDay));
  for (const id of faultedFacilities(state, state.localDay)) outage.add(id);
  const supply = powerSources(state).filter((s) => !outage.has(s.id)).reduce((a, s) => a + (s.type === 'solar' ? 0.8 : 0), 0);
  const demand = state.resources.population * 0.01 + gridConsumers(state).length * 0.12;
  return { supply, demand, outage };
}

function resourceFlows(state) {
  const drought = droughtFactor(state, state.localDay);
  const faulted = faultedFacilities(state, state.localDay);
  const f = state.flows || {};
  const connected = (type) => state.buildings.filter((b) => b.status === 'complete' && b.type === type && isGridConnected(state, b));
  const food = connected('greenhouse').reduce((a, b) => a + (faulted.has(b.id) ? 0 : (f.foodPerGreenhouse || 2) * drought), 0);
  const water = connected('reservoir').reduce((a, b) => a + (faulted.has(b.id) ? 0 : (f.waterPerReservoir || 3)), 0);
  const iridium = connected('mine').reduce((a) => a + (f.iridiumPerMineDay || 0), 0);
  return { food, water, iridium };
}

export function integrate(state, days = 0) {
  const next = copyGame(state); const end = next.localDay + Math.max(0, Math.floor(days));
  while (next.localDay < end) {
    next.localDay += 1;
    for (const j of next.jobs) {
      if (j.status === 'awaiting-labor') assignFreeRobot(next, j);
      if (j.status === 'queued' && next.localDay >= j.startDay) j.status = 'active';
      const laborOk = !j.labor || j.status === 'active';
      if (j.status === 'active' && next.localDay >= j.completeDay && laborOk) { j.status = 'complete'; freeRobotFor(next, j.id); applyJob(next, j); event(next, 'job_complete', { jobId: j.id }); }
    }
    const flows = resourceFlows(next);
    next.resources.food = Math.max(0, next.resources.food - next.resources.population * 0.02 + flows.food);
    next.resources.water = Math.max(0, next.resources.water - next.resources.population * 0.03 + flows.water);
    next.resources.iridium = Math.max(0, next.resources.iridium + flows.iridium);
    const pf = powerFlow(next);
    next.resources.power = Math.max(0, Math.min(next.resources.powerCapacity, next.resources.power + pf.supply - pf.demand));
    // Track the seeded interruption and life-support collapse deterministically.
    const window = next.pendingEvents.find((e) => e.type === 'power-outage');
    if (window && next.localDay >= window.day && next.localDay < window.day + window.days) {
      if (next.mission.interruption.startedAt === null) { next.mission.interruption.startedAt = window.day; event(next, 'power_interruption_started', { sources: window.sources, days: window.days }); }
      next.mission.interruption.minPower = Math.min(next.mission.interruption.minPower, next.resources.power);
      if (next.localDay === window.day + window.days - 1) { next.mission.interruption.endAt = next.localDay; next.mission.interruption.sustained = next.mission.interruption.minPower >= 0; event(next, 'power_interruption_ended', { sustained: next.mission.interruption.sustained, minPower: next.mission.interruption.minPower }); }
    }
    if (next.missionId === 'rightToDecide') for (const e of next.pendingEvents) if (e.type === 'survey-discovery' && next.localDay === e.day) event(next, 'discovery', { target: e.target });
    // The autonomy envelope files compact telemetry on a fixed cadence; Earth sees it after D.
    if (next.localDay > 0 && next.localDay % 365 === 0) { packet(next, 'telemetry', telemetryFor(next), 'downlink', next.localDay, 'autonomy'); event(next, 'telemetry_filed', { capturedDay: next.localDay }); }
    if (next.resources.power === 0) next.mission.powerZeroStreak += 1; else next.mission.powerZeroStreak = 0;
    if (next.mission.collapsedAt === null && (next.mission.powerZeroStreak >= 60 || (next.resources.food === 0 && next.resources.water === 0))) next.mission.collapsedAt = next.localDay;
    deliverDue(next);
    resolveMission(next);
  }
  deliverDue(next); updateProgress(next); return next;
}

function finalizeMission(state, outcome) {
  if (state.mission.status !== 'active') return;
  state.mission.status = 'pending-confirmation'; state.mission.outcome = outcome; state.mission.progressLabel = outcome;
  packet(state, 'mission-result', { outcome, capturedDay: state.localDay }, 'downlink', state.localDay, 'daneel');
  event(state, 'mission_objective_met', { outcome });
  state.paused = true; // stop the clock at the boundary; the human chooses the next mission
}

function resolveMission(state) {
  const m = state.mission; const r = state.resources;
  if (m.status !== 'active') return;
  if (m.collapsedAt !== null) return finalizeMission(state, 'life-support-collapse');
  if (state.missionId === 'firstLight') {
    const capacityOK = r.capacity >= 100;
    const sourceCount = powerSources(state).length;
    if (capacityOK && sourceCount >= 2 && m.interruption.sustained === true && state.localDay >= m.interruption.endAt) finalizeMission(state, 'objective-secured');
  } else if (state.missionId === 'enough') {
    const foodOK = r.food / Math.max(1, r.population * 0.02) >= 24;
    const powerOK = r.powerCapacity ? r.power / r.powerCapacity >= 0.2 : false;
    if (m.sustainDays && state.localDay >= m.sustainDays) {
      if (m.protectionLost === 0 && foodOK && powerOK) finalizeMission(state, 'objective-secured');
      else if (m.protectionLost > 0) finalizeMission(state, 'wetlands-lost');
      else finalizeMission(state, 'reserves-broken');
    }
  } else if (state.missionId === 'rightToDecide') {
    if (m.deadlineDay && state.localDay >= m.deadlineDay) {
      if ((m.exported || 0) >= 1000 && m.protectionLost === 0) finalizeMission(state, 'trust-earned');
      else if ((m.exported || 0) >= 1000) finalizeMission(state, 'hollow-success');
      else finalizeMission(state, 'safe-but-late');
    }
  }
}

function applyJob(state, j) {
  if (j.type === 'construct') {
    const b = state.buildings.find((x) => x.id === j.buildingId); if (!b) return;
    b.status = 'complete';
    if (b.type === 'habitat') state.resources.capacity += 36;
    if (b.type === 'solar' || b.type === 'battery') { state.resources.powerCapacity += 80; state.resources.power = Math.min(state.resources.powerCapacity, state.resources.power + 70); }
    if (b.type === 'greenhouse') state.resources.food += 2400;
    if (b.type === 'reservoir') state.resources.water += 1800;
    if (b.type === 'mine') state.resources.iridium += 720;
    if (b.type === 'launch') { /* launch pad: no direct stock */ }
  }
  if (j.type === 'survey') { event(state, 'survey_complete', { region: j.region, discovery: state.pendingEvents.find((e) => e.type === 'survey-discovery')?.target || 'safe-ridge' }); }
  if (j.type === 'road') { for (const cell of (j.path || [])) { const [x, y] = Array.isArray(cell) ? [Math.floor(cell[0]), Math.floor(cell[1])] : [Math.floor(cell.x), Math.floor(cell.y)]; const t = tileAt(state, x, y); if (t && t.terrain === 'regolith' && !floodFilter(state, state.localDay)(x, y) && !state.roads.some((r) => (Array.isArray(r) ? r[0] === x && r[1] === y : r.x === x && r.y === y))) state.roads.push({ x, y }); } }
  if (j.type === 'mine' && j.special !== true) { /* handled by construct above */ }
  if (j.type === 'cargo') { state.mission.exported = (state.mission.exported || 0) + (j.quantity || 0); event(state, 'cargo_launched', { quantity: j.quantity }); }
}
function deliverDue(state) {
  for (const p of state.packets) if (p.status === 'in-transit' && p.arrivalDay <= state.localDay) {
    p.status = 'delivered';
    if (p.direction === 'uplink') {
      if (p.kind === 'build-order') {
        try { const applied = constructBuilding(state, p.payload.type, p.payload.x, p.payload.y, 'human-arrival'); Object.assign(state, applied); event(state, 'human_order_applied', { packetId: p.id }); } catch (error) { event(state, 'human_order_rejected', { packetId: p.id, reason: error.code || error.message }); }
      } else if (p.kind === 'doctrine-change') { state.doctrine.authority = { ...state.doctrine.authority, ...p.payload.authority }; state.doctrine.version += 1; event(state, 'doctrine_arrived', { packetId: p.id, version: state.doctrine.version }); }
      else if (p.kind === 'cargo-order') {
        const pad = state.buildings.some((b) => b.type === 'launch' && b.status === 'complete');
        const has = state.doctrine.authority.exports && (p.payload.quantity || 0) <= state.resources.iridium && pad;
        if (!has) event(state, 'cargo_order_rejected', { packetId: p.id, reason: 'AUTHORITY_REQUIRED or insufficient iridium or no launch pad' });
        else { state.resources.iridium -= p.payload.quantity; job(state, { type: 'cargo', startDay: state.localDay, completeDay: state.localDay + 90, quantity: p.payload.quantity }); event(state, 'cargo_job_queued', { packetId: p.id }); }
      } else if (p.kind === 'authorization-response') {
        const q = state.pendingQuestions.find((x) => x.packetId === p.payload.questionId);
        if (q) { q.answered = true; q.answer = p.payload.answer; q.answeredDay = state.localDay; state.doctrine.authority = { ...state.doctrine.authority, ...(p.payload.authority || {}) }; state.doctrine.version += 1; event(state, 'authorization_resolved', { packetId: p.id, questionId: q.packetId, answer: p.payload.answer }); state.pendingDecision = { id: p.id, reason: 'authorization-answer' }; }
      } else if (p.kind === 'protocol-definition') {
        const def = p.payload;
        if (!state.doctrine.protocols.some((x) => x.reference === def.reference)) {
          state.doctrine.protocols.push({ name: def.name, version: def.version, body: def.body, reference: def.reference, delivered: true, sourcePacketId: p.id, definitionBits: bitsForPayload({ ...def }) });
          state.inbox.push({ id: p.id, kind: 'protocol-definition', payload: def, deliveredDay: state.localDay, handled: false });
          event(state, 'protocol_defined', { packetId: p.id, reference: def.reference });
        }
      } else if (p.kind === 'road-order') {
        try { const applied = queueLocalRoad(state, p.payload.path); Object.assign(state, applied); event(state, 'human_road_applied', { packetId: p.id }); }
        catch (error) { event(state, 'human_order_rejected', { packetId: p.id, reason: error.code || error.message }); }
      } else { state.inbox.push({ id: p.id, kind: p.kind, payload: p.payload, deliveredDay: state.localDay, handled: false }); event(state, 'message_arrived', { packetId: p.id }); }
    } else {
      if (p.kind === 'mission-result') { state.mission.status = 'confirmed'; state.mission.earthOutcome = p.payload.outcome; state.mission.confirmedAt = state.localDay; event(state, 'mission_confirmed', { outcome: p.payload.outcome }); }
      else if (p.kind === 'authorization') { state.pendingQuestions.push({ packetId: p.id, question: p.payload.question, options: p.payload.options, safeDefault: p.payload.safeDefault, receivedDay: state.localDay, answered: false, answerDay: state.localDay + LIGHT_DELAY_DAYS }); event(state, 'authorization_question', { packetId: p.id }); }
      else { state.reports.push({ ...p, receivedDay: state.localDay }); if (p.payload?.capturedDay !== undefined) { state.telemetry.captureDay = p.payload.capturedDay; state.telemetry.arrivalDay = state.localDay; state.telemetry.label = `Captured day ${p.payload.capturedDay}`; if (p.payload.observedResources) state.observedResources = p.payload.observedResources; } if (p.payload?.observedWorld) state.observedWorld = p.payload.observedWorld; event(state, 'report_received', { packetId: p.id }); }
    }
  }
}
export function advanceToNextEvent(state) { const pending = state.packets.filter((p) => p.status === 'in-transit').map((p) => p.arrivalDay).filter((d) => d > state.localDay); const jobs = state.jobs.filter((j) => ['queued', 'active', 'awaiting-labor'].includes(j.status)).map((j) => j.completeDay).filter((d) => d > state.localDay); const target = Math.min(...pending.concat(jobs)); return Number.isFinite(target) ? integrate(state, target - state.localDay) : integrate(state, 1); }

/** The next day any Earth-visible packet (either direction) lands, or null if none is in flight. */
export function nextEarthArrivalDay(state) {
  const days = state.packets.filter((p) => p.status === 'in-transit').map((p) => p.arrivalDay).filter((d) => d > state.localDay);
  return days.length ? Math.min(...days) : null;
}

export function queueHumanIntent(state, text, attachment = null) { const next = copyGame(state); const p = packet(next, 'intent', { text, attachment }, 'uplink'); event(next, 'intent_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanBuild(state, type, x, y) { const next = copyGame(state); const p = packet(next, 'build-order', { type, x, y }, 'uplink'); event(next, 'build_order_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanDoctrine(state, authority) { const next = copyGame(state); const p = packet(next, 'doctrine-change', { authority }, 'uplink'); event(next, 'doctrine_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanCargo(state, quantity) { const next = copyGame(state); const p = packet(next, 'cargo-order', { quantity }, 'uplink'); event(next, 'cargo_order_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanRoad(state, path) { const next = copyGame(state); const p = packet(next, 'road-order', { path: path.slice(0, 48) }, 'uplink'); event(next, 'road_order_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanProtocol(state, definition) { const next = copyGame(state); const p = packet(next, 'protocol-definition', { ...definition, reference: `${definition.name}/v${definition.version}` }, 'uplink'); event(next, 'protocol_queued', { packetId: p.id, reference: p.payload.reference }); return markRevision(next); }
export function queueHumanAuthResponse(state, questionPacketId, answer) { const next = copyGame(state); const p = packet(next, 'authorization-response', { questionId: questionPacketId, answer, authority: answer === 'allow' ? { habitatLoss: true } : {} }, 'uplink'); event(next, 'auth_response_queued', { packetId: p.id, questionId: questionPacketId }); return markRevision(next); }

/** Build footprint cells overlapping protected wetland, counted when authority permits the loss. */
function protectionLoss(state, x, y, w, h, authority) {
  let loss = 0;
  for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) {
    const t = tileAt(state, x + dx, y + dy);
    if (t && t.protected) { if (authority) loss += 1; else return { blocked: true, code: 'PROTECTED_HABITAT', reason: 'Footprint intersects protected native habitat.' }; }
  }
  return { blocked: false, loss };
}

export function constructBuilding(state, type, x, y, origin = 'agent') {
  const next = copyGame(state); const spec = BUILDINGS[type]; if (!spec) throw Object.assign(new Error('UNKNOWN_BUILDING'), { code: 'UNKNOWN_BUILDING' });
  const w = spec.footprint[0]; const h = spec.footprint[1];
  for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) {
    const t = tileAt(next, x + dx, y + dy); if (!t) throw Object.assign(new Error('OUT_OF_BOUNDS'), { code: 'OUT_OF_BOUNDS' });
    if (t.terrain === 'rock') throw Object.assign(new Error('TILE_BLOCKED'), { code: 'TILE_BLOCKED', reason: 'Tile terrain is rock and cannot be built on.' });
    if (t.terrain === 'wetland' && !next.doctrine.authority.habitatLoss) throw Object.assign(new Error('PROTECTED_HABITAT'), { code: 'PROTECTED_HABITAT', reason: 'Tile is protected native habitat; no authority to disturb it.' });
    if (floodFilter(next, next.localDay)(x + dx, y + dy)) throw Object.assign(new Error('TILE_FLOODED'), { code: 'TILE_FLOODED', reason: 'Tile is flooded in the current local observation.' });
  }
  const prot = protectionLoss(next, x, y, w, h, next.doctrine.authority.habitatLoss);
  if (prot.blocked) throw Object.assign(new Error(prot.code), { code: prot.code, reason: prot.reason });
  if (occupied(next, x, y, w, h)) throw Object.assign(new Error('OCCUPIED'), { code: 'OCCUPIED' });
  if (next.resources.material < spec.cost) throw Object.assign(new Error('INSUFFICIENT_MATERIAL'), { code: 'INSUFFICIENT_MATERIAL' });
  next.resources.material -= spec.cost; const id = `${type}-x${next.counters.job + 1}`; next.buildings.push({ id, type, x, y, level: 0, status: 'queued', health: 100, origin });
  const j = job(next, { type: 'construct', buildingId: id, cost: spec.cost, labor: spec.labor, completeDay: next.localDay + spec.days }, true); event(next, 'construction_queued', { jobId: j.id, buildingId: id, robotId: next.robots.find((r) => r.assignedJob === j.id)?.id || null });
  if (prot.loss > 0) { next.mission.protectionLost = (next.mission.protectionLost || 0) + prot.loss; next.doctrine.protectedWetlandLoss += prot.loss; event(next, 'protected_habitat_lost', { cells: prot.loss, buildingId: id }); }
  return markRevision(next);
}
export function cancelJob(state, jobId) { const next = copyGame(state); const j = next.jobs.find((x) => x.id === jobId); if (!j || j.status === 'complete') throw new Error('JOB_NOT_CANCELLABLE'); j.status = 'cancelled'; const b = next.buildings.find((x) => x.id === j.buildingId); if (b) b.status = 'cancelled'; freeRobotFor(next, jobId); next.resources.material += Math.floor(j.cost * 0.8); return markRevision(next); }

/** Local cargo launch: requires standing export authority, a completed launch pad, and on-hand iridium. */
export function queueLocalCargo(state, quantity) {
  const next = copyGame(state);
  if (!next.doctrine.authority.exports) throw Object.assign(new Error('AUTHORITY_REQUIRED'), { code: 'AUTHORITY_REQUIRED', reason: 'No standing export authority in the active doctrine.' });
  if (!next.buildings.some((b) => b.type === 'launch' && b.status === 'complete')) throw Object.assign(new Error('NO_PAD'), { code: 'NO_PAD', reason: 'No completed launch pad exists.' });
  const qty = Math.min(Math.max(0, Math.floor(quantity || 0)), next.resources.iridium);
  if (qty <= 0) throw Object.assign(new Error('INVALID_QUANTITY'), { code: 'INVALID_QUANTITY' });
  next.resources.iridium -= qty; job(next, { type: 'cargo', status: 'queued', startDay: next.localDay, completeDay: next.localDay + 90, quantity: qty });
  event(next, 'cargo_job_queued', { quantity: qty }); return markRevision(next);
}

/** Local road job: validates bounded, buildable path cells at scheduling time. */
export function queueLocalRoad(state, path) {
  const next = copyGame(state);
  const cells = (path || []).slice(0, 32); if (!cells.length) throw Object.assign(new Error('INVALID_PATH'), { code: 'INVALID_PATH' });
  for (const c of cells) { const [x, y] = Array.isArray(c) ? [Math.floor(c[0]), Math.floor(c[1])] : [Math.floor(c.x), Math.floor(c.y)]; const t = tileAt(next, x, y); if (!t || t.terrain !== 'regolith') throw Object.assign(new Error('MISSING_CONNECTION'), { code: 'MISSING_CONNECTION', reason: 'Road cells must be buildable regolith.' }); }
  job(next, { type: 'road', status: 'queued', startDay: next.localDay, completeDay: next.localDay + 20, path: cells });
  event(next, 'road_queued', { cells: cells.length }); return markRevision(next);
}

/** Local survey job: scheduled rover survey with deterministic discovery on completion. */
export function queueLocalSurvey(state, region = 'ridge') {
  const next = copyGame(state); job(next, { type: 'survey', status: 'queued', startDay: next.localDay, completeDay: next.localDay + 45, region });
  event(next, 'survey_queued', { region }); return markRevision(next);
}
export function sendReport(state, text, kind = 'status') { const next = copyGame(state); packet(next, kind, { text, ...telemetryFor(next) }, 'downlink', next.localDay, 'daneel'); event(next, 'report_queued', { kind }); return markRevision(next); }
export function sendAuthorizationRequest(state, payload) { const next = copyGame(state); packet(next, 'authorization', { ...payload, capturedDay: next.localDay }, 'downlink', next.localDay, 'daneel'); return markRevision(next); }
export function queueLocalIntent(state, payload) { const next = copyGame(state); const p = packet(next, 'intent', payload, 'uplink'); return markRevision(next); }
export function applyDeliveredIntent(state, messageId) { const next = copyGame(state); const m = next.inbox.find((x) => x.id === messageId); if (!m) throw new Error('MESSAGE_NOT_DELIVERED'); m.handled = true; next.pendingDecision = { id: m.id, reason: 'new-instruction' }; return markRevision(next); }
export function inspectProjection(state) {  const s = scenarioFor(state); const foodMonths = state.resources.food / Math.max(1, state.resources.population * 0.02);
  return { sessionId: state.sessionId, missionId: state.missionId, mission: s.title, localDay: state.localDay, resources: { ...state.resources }, buildings: state.buildings.filter((b) => b.status === 'complete').map(({ id, type, x, y, health }) => ({ id, type, x, y, health })), robots: state.robots.map(({ id, type, x, y, status }) => ({ id, type, x, y, status })), jobs: state.jobs.map(({ id, type, status, completeDay }) => ({ id, type, status, completeDay })), metrics: { foodReserveMonths: foodMonths, powerReservePercent: state.resources.powerCapacity ? state.resources.power / state.resources.powerCapacity * 100 : 0 }, doctrine: state.doctrine, channel: { uplinkBits: state.channel.uplinkBits, downlinkBits: state.channel.downlinkBits } };
}