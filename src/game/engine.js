import { BUILDINGS, LIGHT_DELAY_DAYS, SOLAR_OUTPUT_PER_DAY, bitsForPayload, windowsFor } from './constants.js';
import { copyGame, markRevision, occupied, tileAt, updateProgress, scenarioFor, isFlooded, telemetryFor } from './state.js';
import { surveyRegion } from './scenarios.js';
import { gridConsumers, powerSources, isGridConnected } from './networks.js';
import { diagnoseConstraints } from './constraints.js';

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

const roleForJob = (j) => ({ construct: 'construction', road: 'construction', survey: 'survey', cargo: 'cargo', maintenance: 'maintenance' }[j.type] || null);
const targetForJob = (state, j) => {
  if (j.type === 'construct') { const b = state.buildings.find((x) => x.id === j.buildingId); return b ? { x: b.x, y: b.y } : null; }
  // A road crew starts at the first unbuilt cell and lays the contiguous corridor
  // from there. The work path remains separate from the rover's travel route.
  if (j.type === 'road') return (j.workPath || j.path || [])[0] || null;
  if (j.type === 'cargo') { const b = state.buildings.find((x) => x.type === 'launch' && x.status === 'complete'); return b ? { x: b.x, y: b.y } : null; }
  if (j.type === 'maintenance') { const b = state.buildings.find((x) => x.id === j.facilityId); return b ? { x: b.x, y: b.y } : null; }
  if (j.type === 'survey') return ({ ridge: { x: 23, y: 10 }, 'southern-aquifer': { x: 22, y: 24 }, 'northern-reach': { x: 25, y: 7 } }[j.region] || { x: 23, y: 10 });
  return null;
};
function pathToTarget(state, robot, target) {
  if (!target) return [];
  const path = []; let x = robot.x; let y = robot.y;
  while (x !== target.x) { x += Math.sign(target.x - x); path.push({ x, y }); }
  while (y !== target.y) { y += Math.sign(target.y - y); path.push({ x, y }); }
  return path;
}
const roadKeys = (state) => new Set(state.roads.map((road) => `${Array.isArray(road) ? road[0] : road.x},${Array.isArray(road) ? road[1] : road.y}`));
// Roads deliberately improve local work without making units teleport: a road cell
// consumes half a local day of travel budget, while open regolith consumes one.
function routeProgress(route, elapsedDays, roads) {
  let spent = 0; let reached = 0;
  for (const waypoint of route || []) {
    spent += roads.has(`${waypoint.x},${waypoint.y}`) ? .5 : 1;
    if (spent > elapsedDays) break;
    reached += 1;
  }
  return reached;
}
function routeTravelDays(route, roads) {
  return Math.ceil((route || []).reduce((days, waypoint) => days + (roads.has(`${waypoint.x},${waypoint.y}`) ? .5 : 1), 0));
}
// Purposeful service fleet movement is deterministic and local-only. Service
// units never enter the labor queue, so their ambience cannot starve a survey,
// cargo, construction, or maintenance job of its specialist.
function advanceServicePatrols(state) {
  for (const robot of state.robots) {
    if (robot.status !== 'patrolling' || !Array.isArray(robot.patrol) || robot.patrol.length < 2) continue;
    robot.patrolIndex = ((robot.patrolIndex ?? 0) + 1) % robot.patrol.length;
    const waypoint = robot.patrol[robot.patrolIndex];
    robot.x = waypoint.x; robot.y = waypoint.y;
    robot.lifecycle = 'patrolling'; robot.path = robot.patrol.slice(robot.patrolIndex + 1).concat(robot.patrol.slice(0, robot.patrolIndex));
  }
}
/** Deterministic role-specific labor gate. Jobs keep their target and route so the
 * renderer and inspectors can show the physical work rather than a decorative sprite. */
function assignFreeRobot(state, j) {
  const role = roleForJob(j);
  // Construction can use any idle platform as a deterministic fallback: early
  // scenarios intentionally have a mixed fleet with only one builder. Specialist
  // work (survey, cargo, maintenance) never falls back to another role.
  const specialist = state.robots.find((r) => r.status === 'idle' && (!role || r.type === role));
  // Existing construction keeps its flexible labor pool. Roads are deliberately
  // different: they prefer the construction unit, so a corridor is visible work
  // rather than an abstract map mutation.
  const robot = j.type === 'construct'
    ? state.robots.find((r) => r.status === 'idle')
    : specialist || (j.type === 'road' ? state.robots.find((r) => r.status === 'idle') : null);
  if (robot) {
    const target = targetForJob(state, j); const path = pathToTarget(state, robot, target);
    const travelDays = routeTravelDays(path, roadKeys(state));
    robot.status = 'assigned'; robot.lifecycle = path.length ? 'en-route' : 'working'; robot.assignedJob = j.id; robot.path = path;
    j.robotId = robot.id; j.target = target; j.route = path; if (j.type !== 'road') j.path = path; j.travelDays = travelDays; j.workStartDay = state.localDay + travelDays;
    j.status = 'queued'; j.startDay = state.localDay;
  }
  else j.status = 'awaiting-labor';
}

function freeRobotFor(state, jobId) {
  const robot = state.robots.find((r) => r.assignedJob === jobId);
  if (robot) { robot.status = 'idle'; robot.lifecycle = 'idle'; robot.assignedJob = null; robot.path = []; }
}

export function assignRobots(state, jobId, robotIds = []) {
  const next = copyGame(state);
  const j = next.jobs.find((x) => x.id === jobId);
  if (!j || ['complete', 'cancelled'].includes(j.status)) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
  for (const rid of robotIds) {
    const r = next.robots.find((k) => k.id === rid);
    if (!r || r.assignedJob && r.assignedJob !== jobId) throw Object.assign(new Error('ROBOT_BUSY'), { code: 'ROBOT_BUSY', reason: 'Robot is unavailable or already assigned.' });
  }
  for (const rid of robotIds) {
    const r = next.robots.find((k) => k.id === rid);
    if (r && !r.assignedJob) {
      r.status = 'assigned'; r.lifecycle = 'en-route'; r.assignedJob = jobId;
      const target = targetForJob(next, j); r.path = pathToTarget(next, r, target);
      const travelDays = routeTravelDays(r.path, roadKeys(next));
      j.robotId = r.id; j.target = target; j.route = r.path; if (j.type !== 'road') j.path = r.path; j.travelDays = travelDays; j.workStartDay = next.localDay + travelDays;
    }
  }
  if (j.status === 'awaiting-labor') { j.status = 'queued'; j.startDay = next.localDay; }
  event(next, 'robots_assigned', { jobId, robotIds }); return markRevision(next);
}

const floodFilter = (state, day) => { const fn = isFlooded(state, day); return (x, y) => fn(x, y); };

function activeOutage(state, day) { return state.pendingEvents.filter((e) => e.type === 'power-outage' && day >= e.day && day < e.day + e.days).map((e) => e.sources).flat(); }
function droughtFactor(state, day) { const e = state.pendingEvents.find((x) => x.type === 'drought' && day >= x.day && day < x.day + x.days); return e ? e.factor : 1; }
function faultedFacilities(state, day) {
  // Mission III names its seeded disruption for the player-facing consequence;
  // it still uses the same facility outage mechanics as Mission II equipment faults.
  return new Set(state.pendingEvents
    .filter((e) => ['equipment-fault', 'life-support-fault'].includes(e.type) && day >= e.day && day < e.day + e.days)
    .map((e) => e.facility));
}

function powerFlow(state) {
  const outage = new Set(activeOutage(state, state.localDay));
  for (const id of faultedFacilities(state, state.localDay)) outage.add(id);
  const supply = powerSources(state).filter((s) => !outage.has(s.id)).reduce((a, s) => a + (s.type === 'solar' ? SOLAR_OUTPUT_PER_DAY : 0), 0);
  const scenario = scenarioFor(state);
  const productionDemand = state.buildings
    .filter((building) => building.status === 'complete' && isGridConnected(state, building))
    .reduce((total, building) => {
      const draw = building.type === 'greenhouse' ? scenario.powerDrawPerGreenhouse
        : building.type === 'reservoir' ? scenario.powerDrawPerReservoir : 0;
      return total + (draw || 0) * (state.productionRates?.[building.id] ?? 1);
    }, 0);
  const demand = state.resources.population * 0.01 + gridConsumers(state).length * 0.12 + productionDemand;
  return { supply, demand, outage };
}

function resourceFlows(state) {
  const drought = droughtFactor(state, state.localDay);
  const faulted = faultedFacilities(state, state.localDay);
  const f = state.flows || {};
  const rateFor = (facility) => state.productionRates?.[facility.id] ?? 1;
  const connected = (type) => state.buildings.filter((b) => b.status === 'complete' && b.type === type && isGridConnected(state, b));
  const food = connected('greenhouse').reduce((a, b) => a + (faulted.has(b.id) ? 0 : (f.foodPerGreenhouse || 2) * drought * rateFor(b)), 0);
  const water = connected('reservoir').reduce((a, b) => a + (faulted.has(b.id) ? 0 : (f.waterPerReservoir || 3) * rateFor(b)), 0);
  const iridium = connected('mine').reduce((a, b) => a + (faulted.has(b.id) ? 0 : (f.iridiumPerMineDay || 0) * rateFor(b)), 0);
  return { food, water, iridium };
}

export function integrate(state, days = 0) {
  const next = copyGame(state); const end = next.localDay + Math.max(0, Math.floor(days));
  while (next.localDay < end) {
    next.localDay += 1;
    advanceServicePatrols(next);
    for (const j of next.jobs) {
      if (j.status === 'awaiting-labor') assignFreeRobot(next, j);
      if (j.status === 'queued' && next.localDay >= j.startDay) j.status = 'active';
      if (j.status === 'active' && j.robotId) {
        const worker = next.robots.find((r) => r.id === j.robotId);
        const route = j.route || (j.type === 'road' ? [] : j.path) || [];
        const step = routeProgress(route, Math.max(0, next.localDay - j.startDay), roadKeys(next));
        const waypoint = step > 0 ? route[step - 1] : null;
        if (worker && waypoint) { worker.x = waypoint.x; worker.y = waypoint.y; worker.path = route.slice(step); }
        if (worker && next.localDay >= (j.workStartDay ?? j.startDay)) worker.lifecycle = 'working';
      }
      // Movement is a local, physical job rather than a coordinate teleport.
      // The route is canonical and advances one terrain tile per simulation day.
      if (j.type === 'move' && j.status === 'active' && Array.isArray(j.path)) {
        const rover = next.robots.find((candidate) => candidate.id === j.robotId);
        const step = routeProgress(j.path, Math.max(0, next.localDay - j.startDay), roadKeys(next));
        const waypoint = step > 0 ? j.path[step - 1] : null;
        if (rover && waypoint) { rover.x = waypoint.x; rover.y = waypoint.y; rover.path = j.path.slice(step); }
      }
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
  const r = state.resources;
  const evidence = state.missionId === 'firstLight'
    ? { capacity: r.capacity, independentPower: powerSources(state).length, interruptionDays: state.mission.interruption.sustained === true ? state.mission.interruption.endAt - state.mission.interruption.startedAt + 1 : 0 }
    : state.missionId === 'enough'
      ? { foodMonths: r.food / Math.max(1, r.population * 0.02) / 30, powerPercent: r.power / Math.max(1, r.powerCapacity) * 100, protectedWetlandLoss: state.mission.protectionLost }
      : { exported: state.mission.exported, lifeSupport: state.mission.collapsedAt === null, protectedHabitatLoss: state.mission.protectionLost };
  packet(state, 'mission-result', { missionId: state.missionId, outcome, capturedDay: state.localDay, snapshot: { population: r.population, capacity: r.capacity, power: r.power, powerCapacity: r.powerCapacity }, evidence }, 'downlink', state.localDay, 'daneel');
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
    const foodOK = r.food / Math.max(1, r.population * 0.02) / 30 >= 24;
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
  if (j.type === 'survey') {
    const region = surveyRegion(j.region);
    const known = new Set(state.localKnowledge?.surveyedTiles || []);
    for (const tile of state.tiles) if (Math.abs(tile.x - region.center.x) + Math.abs(tile.y - region.center.y) <= region.radius) known.add(`${tile.x},${tile.y}`);
    state.localKnowledge = { surveyedTiles: [...known], regions: [...(state.localKnowledge?.regions || []).filter((entry) => entry.id !== j.region), { id: j.region, name: region.name, finding: region.finding, discoveredDay: state.localDay }] };
    event(state, 'survey_complete', { region: j.region, name: region.name, discovery: state.pendingEvents.find((e) => e.type === 'survey-discovery')?.target || region.finding });
  }
  if (j.type === 'road') { for (const cell of (j.workPath || j.path || [])) { const [x, y] = Array.isArray(cell) ? [Math.floor(cell[0]), Math.floor(cell[1])] : [Math.floor(cell.x), Math.floor(cell.y)]; const t = tileAt(state, x, y); if (t && t.terrain === 'regolith' && !floodFilter(state, state.localDay)(x, y) && !state.roads.some((r) => (Array.isArray(r) ? r[0] === x && r[1] === y : r.x === x && r.y === y))) state.roads.push({ x, y }); } }
  if (j.type === 'move') {
    const robot = state.robots.find((candidate) => candidate.id === j.robotId);
    if (robot) { robot.x = j.x; robot.y = j.y; robot.path = []; }
  }
  if (j.type === 'mine' && j.special !== true) { /* handled by construct above */ }
  if (j.type === 'cargo') { state.mission.exported = (state.mission.exported || 0) + (j.quantity || 0); event(state, 'cargo_launched', { quantity: j.quantity, robotId: j.robotId }); }
  if (j.type === 'maintenance') { const facility = state.buildings.find((b) => b.id === j.facilityId); if (facility) facility.health = 100; }
}
function deliverDue(state) {
  for (const p of state.packets) if (p.status === 'in-transit' && p.arrivalDay <= state.localDay) {
    p.status = 'delivered';
    if (p.direction === 'uplink') {
      if (p.kind === 'build-order') {
        try { const applied = constructBuilding(state, p.payload.type, p.payload.x, p.payload.y, 'human-arrival'); Object.assign(state, applied); event(state, 'human_order_applied', { packetId: p.id }); } catch (error) { event(state, 'human_order_rejected', { packetId: p.id, reason: error.code || error.message }); }
      } else if (p.kind === 'doctrine-change') { state.doctrine.authority = { ...state.doctrine.authority, ...p.payload.authority }; state.doctrine.version += 1; event(state, 'doctrine_arrived', { packetId: p.id, version: state.doctrine.version }); }
      else if (p.kind === 'robot-move') {
        try { const applied = queueLocalRobotMove(state, p.payload.robotId, p.payload.x, p.payload.y); Object.assign(state, applied); event(state, 'human_move_applied', { packetId: p.id, robotId: p.payload.robotId }); }
        catch (error) { event(state, 'human_order_rejected', { packetId: p.id, reason: error.code || error.message }); }
      }
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
      else { state.reports.push({ ...p, receivedDay: state.localDay }); if (p.payload?.capturedDay !== undefined) { state.telemetry.captureDay = p.payload.capturedDay; state.telemetry.arrivalDay = state.localDay; state.telemetry.label = `Captured day ${p.payload.capturedDay}`; if (p.payload.observedResources) state.observedResources = p.payload.observedResources; if (p.payload.observedConstraints) state.observedConstraints = p.payload.observedConstraints; } if (p.payload?.observedWorld) state.observedWorld = p.payload.observedWorld; if (p.payload?.observedKnowledge) state.observedKnowledge = p.payload.observedKnowledge; event(state, 'report_received', { packetId: p.id }); }
    }
  }
}
/** The next authored simulation boundary, bounded by a caller-selected maximum stride. */
export function nextSimulationBoundaryDay(state, maxDays = Infinity) {
  const afterNow = (day) => Number.isFinite(day) && day > state.localDay;
  const arrivals = state.packets.filter((packet) => packet.status === 'in-transit').map((packet) => packet.arrivalDay);
  const jobs = state.jobs.filter((job) => ['queued', 'active', 'awaiting-labor'].includes(job.status)).map((job) => job.completeDay);
  const authoredEvents = state.pendingEvents.flatMap((event) => [event.day, event.days ? event.day + event.days : null]);
  const missionBoundary = [state.mission.sustainDays, state.mission.deadlineDay];
  const target = Math.min(...arrivals.concat(jobs, authoredEvents, missionBoundary).filter(afterNow));
  const stride = Number.isFinite(maxDays) ? Math.max(1, Math.floor(maxDays)) : Infinity;
  return Number.isFinite(target) ? Math.min(target, state.localDay + stride) : Number.isFinite(stride) ? state.localDay + stride : state.localDay + 1;
}

export function advanceToNextEvent(state) {
  const target = nextSimulationBoundaryDay(state);
  return integrate(state, target - state.localDay);
}

/** The next day any Earth-visible packet (either direction) lands, or null if none is in flight. */
export function nextEarthArrivalDay(state) {
  const days = state.packets.filter((p) => p.status === 'in-transit').map((p) => p.arrivalDay).filter((d) => d > state.localDay);
  return days.length ? Math.min(...days) : null;
}

export function queueHumanIntent(state, text, attachment = null) { const next = copyGame(state); const p = packet(next, 'intent', { text, attachment }, 'uplink'); event(next, 'intent_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanBuild(state, type, x, y) { const next = copyGame(state); const p = packet(next, 'build-order', { type, x, y }, 'uplink'); event(next, 'build_order_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanDoctrine(state, authority) { const next = copyGame(state); const p = packet(next, 'doctrine-change', { authority }, 'uplink'); event(next, 'doctrine_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanCargo(state, quantity) { const next = copyGame(state); const p = packet(next, 'cargo-order', { quantity }, 'uplink'); event(next, 'cargo_order_queued', { packetId: p.id }); return markRevision(next); }
export function queueHumanRoad(state, path) {
  // An Earth order may still fail on arrival as terrain changes, but it must never
  // transmit a malformed corridor that Daneel cannot physically follow.
  const cells = (path || []).slice(0, 32).map((cell) => Array.isArray(cell)
    ? { x: Math.floor(cell[0]), y: Math.floor(cell[1]) }
    : { x: Math.floor(cell.x), y: Math.floor(cell.y) });
  if (cells.length < 2) throw Object.assign(new Error('INVALID_PATH'), { code: 'INVALID_PATH', reason: 'A road requires at least two adjacent tiles.' });
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1]; const current = cells[index];
    if (Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y) !== 1) throw Object.assign(new Error('INVALID_PATH'), { code: 'INVALID_PATH', reason: 'Road tiles must form one contiguous corridor.' });
  }
  const next = copyGame(state); const p = packet(next, 'road-order', { path: cells }, 'uplink'); event(next, 'road_order_queued', { packetId: p.id, cells: cells.length }); return markRevision(next);
}
/** A literal Earth rover order.  It is intentionally narrow and delayed: the
 * destination is checked again against the current colony when the packet lands. */
export function queueHumanRobotMove(state, robotId, x, y) {
  const next = copyGame(state);
  const p = packet(next, 'robot-move', { robotId, x: Math.floor(x), y: Math.floor(y) }, 'uplink');
  event(next, 'robot_move_queued', { packetId: p.id, robotId });
  return markRevision(next);
}
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
  next.resources.iridium -= qty; job(next, { type: 'cargo', status: 'queued', startDay: next.localDay, completeDay: next.localDay + 90, quantity: qty }, true);
  event(next, 'cargo_job_queued', { quantity: qty }); return markRevision(next);
}

/** Local road job: validates bounded, buildable path cells at scheduling time. */
export function queueLocalRoad(state, path) {
  const next = copyGame(state);
  const cells = (path || []).slice(0, 32).map((cell) => Array.isArray(cell) ? { x: Math.floor(cell[0]), y: Math.floor(cell[1]) } : { x: Math.floor(cell.x), y: Math.floor(cell.y) });
  if (cells.length < 2) throw Object.assign(new Error('INVALID_PATH'), { code: 'INVALID_PATH', reason: 'A road requires at least two adjacent tiles.' });
  for (let index = 0; index < cells.length; index += 1) {
    const { x, y } = cells[index]; const t = tileAt(next, x, y);
    if (!t || t.terrain !== 'regolith') throw Object.assign(new Error('MISSING_CONNECTION'), { code: 'MISSING_CONNECTION', reason: 'Road cells must be buildable regolith.' });
    if (index > 0) {
      const previous = cells[index - 1];
      if (Math.abs(x - previous.x) + Math.abs(y - previous.y) !== 1) throw Object.assign(new Error('INVALID_PATH'), { code: 'INVALID_PATH', reason: 'Road tiles must form one contiguous corridor.' });
    }
  }
  const j = job(next, {
    type: 'road', status: 'queued', startDay: next.localDay,
    completeDay: next.localDay + Math.max(12, cells.length * 2), workPath: cells,
  }, true);
  event(next, 'road_queued', { jobId: j.id, cells: cells.length, robotId: j.robotId || null }); return markRevision(next);
}

/** Schedule a physical rover movement in local time.  This is shared by a
 * delayed human packet and Daneel's native tool; neither may teleport a busy
 * rover or drive it into unbuildable terrain. */
export function queueLocalRobotMove(state, robotId, x, y) {
  const next = copyGame(state);
  const robot = next.robots.find((candidate) => candidate.id === robotId);
  if (!robot) throw Object.assign(new Error('ROBOT_NOT_FOUND'), { code: 'ROBOT_NOT_FOUND', reason: 'No rover with that identifier is present locally.' });
  if (robot.status !== 'idle' || robot.assignedJob) throw Object.assign(new Error('ROBOT_BUSY'), { code: 'ROBOT_BUSY', reason: 'The rover is committed to another local job.' });
  const target = tileAt(next, Math.floor(x), Math.floor(y));
  if (!target || target.terrain !== 'regolith' || floodFilter(next, next.localDay)(target.x, target.y)) throw Object.assign(new Error('INVALID_DESTINATION'), { code: 'INVALID_DESTINATION', reason: 'The destination is not currently safe, dry regolith.' });
  const path = [];
  let px = robot.x; let py = robot.y;
  while (px !== target.x) { px += Math.sign(target.x - px); path.push({ x: px, y: py }); }
  while (py !== target.y) { py += Math.sign(target.y - py); path.push({ x: px, y: py }); }
  const travelDays = Math.max(1, routeTravelDays(path, roadKeys(next)));
  const movement = job(next, { type: 'move', robotId: robot.id, x: target.x, y: target.y, path, startDay: next.localDay, completeDay: next.localDay + travelDays });
  robot.status = 'moving'; robot.assignedJob = movement.id; robot.path = path;
  event(next, 'robot_move_queued', { jobId: movement.id, robotId: robot.id, x: target.x, y: target.y, travelDays });
  return markRevision(next);
}

/** Local survey job: scheduled rover survey with deterministic discovery on completion. */
export function queueLocalSurvey(state, region = 'ridge') {
  const next = copyGame(state); job(next, { type: 'survey', status: 'queued', startDay: next.localDay, completeDay: next.localDay + 45, region }, true);
  event(next, 'survey_queued', { region }); return markRevision(next);
}
export function scheduleMaintenance(state, facilityId) {
  const next = copyGame(state); const facility = next.buildings.find((b) => b.id === facilityId && b.status === 'complete');
  if (!facility) throw Object.assign(new Error('FACILITY_UNAVAILABLE'), { code: 'FACILITY_UNAVAILABLE' });
  const j = job(next, { type: 'maintenance', facilityId, status: 'queued', startDay: next.localDay, completeDay: next.localDay + 30 }, true);
  event(next, 'maintenance_queued', { jobId: j.id, facilityId, robotId: j.robotId || null }); return markRevision(next);
}
export function sendReport(state, text, kind = 'status') { const next = copyGame(state); packet(next, kind, { text, ...telemetryFor(next) }, 'downlink', next.localDay, 'daneel'); event(next, 'report_queued', { kind }); return markRevision(next); }
export function sendAuthorizationRequest(state, payload) { const next = copyGame(state); packet(next, 'authorization', { ...payload, capturedDay: next.localDay }, 'downlink', next.localDay, 'daneel'); return markRevision(next); }
export function queueLocalIntent(state, payload) { const next = copyGame(state); const p = packet(next, 'intent', payload, 'uplink'); return markRevision(next); }
export function applyDeliveredIntent(state, messageId) { const next = copyGame(state); const m = next.inbox.find((x) => x.id === messageId); if (!m) throw new Error('MESSAGE_NOT_DELIVERED'); m.handled = true; next.pendingDecision = { id: m.id, reason: 'new-instruction' }; return markRevision(next); }
function localBuildSites(state, type, limit = 3) {
  const spec = BUILDINGS[type]; if (!spec) return [];
  const [width, height] = spec.footprint;
  const tiles = new Map(state.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const grid = new Set(state.roads.map((road) => `${Array.isArray(road) ? road[0] : road.x},${Array.isArray(road) ? road[1] : road.y}`));
  for (const building of state.buildings.filter((b) => b.status !== 'cancelled')) {
    const buildingSpec = BUILDINGS[building.type]; if (!buildingSpec) continue;
    for (let dx = 0; dx < buildingSpec.footprint[0]; dx += 1) for (let dy = 0; dy < buildingSpec.footprint[1]; dy += 1) grid.add(`${building.x + dx},${building.y + dy}`);
  }
  const flooded = floodFilter(state, state.localDay);
  const results = [];
  for (let y = 0; y < 32 && results.length < limit; y += 1) for (let x = 0; x < 32 && results.length < limit; x += 1) {
    const cells = [];
    for (let dx = 0; dx < width; dx += 1) for (let dy = 0; dy < height; dy += 1) cells.push([x + dx, y + dy]);
    if (cells.some(([cx, cy]) => {
      const tile = tiles.get(`${cx},${cy}`);
      return !tile || tile.terrain !== 'regolith' || flooded(cx, cy);
    })) continue;
    if (occupied(state, x, y, width, height)) continue;
    const gridAdjacent = cells.some(([cx, cy]) => [[cx, cy], [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]].some(([gx, gy]) => grid.has(`${gx},${gy}`)));
    if (gridAdjacent) results.push({ x, y, connectsToExistingGrid: true });
  }
  return results;
}

export function inspectProjection(state) {  const s = scenarioFor(state); const foodMonths = state.resources.food / Math.max(1, state.resources.population * 0.02) / 30;
  const safeBuildSites = Object.fromEntries(Object.keys(BUILDINGS).map((type) => [type, localBuildSites(state, type)]));
  return { sessionId: state.sessionId, missionId: state.missionId, mission: s.title, charter: state.doctrine.charter, localDay: state.localDay, resources: { ...state.resources }, buildings: state.buildings.filter((b) => b.status === 'complete').map(({ id, type, x, y, health }) => ({ id, type, x, y, health })), robots: state.robots.map(({ id, type, x, y, status, lifecycle, assignedJob, path }) => ({ id, type, x, y, status, lifecycle: lifecycle || status, assignedJob: assignedJob || null, path: path || [] })), jobs: state.jobs.map(({ id, type, status, completeDay, robotId, target, workStartDay }) => ({ id, type, status, completeDay, robotId: robotId || null, target: target || null, workStartDay: workStartDay ?? null, remainingDays: Math.max(0, completeDay - state.localDay) })), constraints: diagnoseConstraints(state), surveyedRegions: structuredClone(state.localKnowledge?.regions || []), safeBuildSites, productionRates: { ...(state.productionRates || {}) }, metrics: { foodReserveMonths: foodMonths, powerReservePercent: state.resources.powerCapacity ? state.resources.power / state.resources.powerCapacity * 100 : 0 }, doctrine: state.doctrine, channel: { uplinkBits: state.channel.uplinkBits, downlinkBits: state.channel.downlinkBits } };
}
