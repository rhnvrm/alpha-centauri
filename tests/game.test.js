import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, telemetryFor } from '../src/game/state.js';
import { advanceToNextEvent, constructBuilding, integrate, queueHumanIntent, sendReport, cancelJob, queueLocalRoad } from '../src/game/engine.js';
import { createToolSet } from '../src/webmcp/tools.js';
import { placeBuildingNearRoad } from './helpers.js';

test('one-way packets are absent before exact arrival and present at arrival', () => {
  let s = createGame(); s = queueHumanIntent(s, 'Keep the first habitat safe');
  assert.equal(s.inbox.length, 0); s = integrate(s, 1594); assert.equal(s.inbox.length, 0); s = integrate(s, 1); assert.equal(s.inbox.length, 1); assert.equal(s.inbox[0].deliveredDay, 1595);
});

test('local construction reserves material and completes only after labor time', () => {
  let s = createGame(); const material = s.resources.material; s = constructBuilding(s, 'habitat', 5, 5); assert.equal(s.resources.material, material - 18); assert.equal(s.buildings.at(-1).status, 'queued'); s = integrate(s, 89); assert.equal(s.buildings.at(-1).status, 'queued'); s = integrate(s, 1); assert.equal(s.buildings.at(-1).status, 'complete'); assert.equal(s.jobs.at(-1).status, 'complete');
});

test('road work assigns the construction unit, preserves its work path, and becomes a faster route on completion', () => {
  let s = createGame('firstLight');
  const existingRoads = new Set(s.roads.map((road) => `${road.x},${road.y}`));
  const first = s.tiles.find((tile) => tile.terrain === 'regolith' && !existingRoads.has(`${tile.x},${tile.y}`)
    && s.tiles.some((next) => next.terrain === 'regolith' && Math.abs(next.x - tile.x) + Math.abs(next.y - tile.y) === 1 && !existingRoads.has(`${next.x},${next.y}`)));
  const second = s.tiles.find((tile) => tile.terrain === 'regolith' && Math.abs(tile.x - first.x) + Math.abs(tile.y - first.y) === 1 && !existingRoads.has(`${tile.x},${tile.y}`));
  s = queueLocalRoad(s, [first, second]);
  const job = s.jobs.at(-1); const builder = s.robots.find((robot) => robot.id === 'builder-1');
  assert.equal(job.robotId, builder.id);
  assert.deepEqual(job.workPath, [{ x: first.x, y: first.y }, { x: second.x, y: second.y }]);
  assert.ok(job.route.length > 0, 'the construction unit has a physical route to its road work');
  s = integrate(s, job.completeDay - s.localDay);
  assert.equal(s.jobs.at(-1).status, 'complete');
  assert.equal(s.roads.some((road) => road.x === first.x && road.y === first.y), true);
  assert.equal(s.robots.find((robot) => robot.id === builder.id).status, 'idle');
});

test('authored service fleet patrols locally without consuming specialist labor', () => {
  let s = createGame('rightToDecide');
  const service = s.robots.filter((robot) => robot.status === 'patrolling');
  assert.equal(service.length, 3);
  const before = service.map((robot) => ({ id: robot.id, x: robot.x, y: robot.y }));
  s = integrate(s, 1);
  assert.equal(s.robots.filter((robot) => robot.status === 'patrolling').length, 3);
  assert.ok(s.robots.some((robot) => before.some((start) => start.id === robot.id && (start.x !== robot.x || start.y !== robot.y))), 'a service unit advances along its authored patrol');
  assert.equal(s.robots.filter((robot) => robot.status === 'idle').length, 4, 'service units do not join the available labor pool');
  const received = telemetryFor(s).observedWorld.robots.find((robot) => robot.id === 'logistics-1');
  assert.equal(received.lifecycle, 'patrolling');
  assert.match(received.purpose, /stores/i);
});

test('cancellation is recoverable and refunds most reserved material', () => { let s = createGame(); s = constructBuilding(s, 'battery', 5, 5); const j = s.jobs.at(-1); s = cancelJob(s, j.id); assert.equal(s.jobs.at(-1).status, 'cancelled'); assert.equal(s.buildings.at(-1).status, 'cancelled'); assert.equal(s.resources.material, 118); });

test('reports use the serialized downlink delay and preserve capture day', () => { let s = createGame(); s = sendReport(s, 'Solar array stable'); assert.equal(s.reports.length, 0); const p = s.packets.at(-1); s = integrate(s, p.arrivalDay - s.localDay); assert.equal(s.reports.length, 1); assert.equal(s.reports[0].payload.capturedDay, 0); assert.equal(s.reports[0].receivedDay, p.arrivalDay); });

test('native tool write retries with one operation receipt and one job', async () => {
  let state = createGame(); const store = { getState: () => state, commit: (next) => { state = next; } }; const tools = createToolSet(store); const connect = tools.find((t) => t.name === 'connect_steward'); const connected = await connect.execute({ sessionId: state.sessionId, protocolVersion: 'v1', agentLabel: 'test' }); assert.equal(connected.ok, true); const leaseId = connected.result.leaseId; state = store.getState(); const construct = tools.find((t) => t.name === 'construct_building'); const args = { sessionId: state.sessionId, leaseId, expectedRevision: state.revision, operationId: 'op-1', type: 'battery', x: 5, y: 5 }; const first = await construct.execute(args); const second = await construct.execute({ ...args, expectedRevision: state.revision }); assert.equal(first.ok, true); assert.deepEqual(second, first); assert.equal(state.jobs.filter((j) => j.type === 'construct').length, 1);
});

test('Daneel receives a concrete day-zero charter through the WebMCP doctrine read', async () => {
  let state = createGame('firstLight');
  const store = { getState: () => state, commit: (next) => { state = next; } };
  const tools = createToolSet(store);
  const connect = tools.find((tool) => tool.name === 'connect_steward');
  const connected = await connect.execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  const doctrine = await tools.find((tool) => tool.name === 'read_doctrine').execute({ sessionId: state.sessionId, leaseId: connected.result.leaseId });
  assert.equal(doctrine.ok, true);
  assert.equal(doctrine.result.charter.missionId, 'firstLight');
  assert.match(doctrine.result.charter.objective, /100-person life-support capacity/);
});

test('Daneel can secure Mission I through the same WebMCP construction contract exposed to the browser', async () => {
  let state = createGame('firstLight');
  const store = { getState: () => state, commit: (next) => { state = next; } };
  const tools = createToolSet(store);
  const connect = tools.find((tool) => tool.name === 'connect_steward');
  const construct = tools.find((tool) => tool.name === 'construct_building');
  const connected = await connect.execute({ sessionId: state.sessionId, protocolVersion: 'v1', agentLabel: 'Daneel test' });
  assert.equal(connected.ok, true);
  const leaseId = connected.result.leaseId;

  for (const type of ['habitat', 'solar', 'battery']) {
    const cell = placeBuildingNearRoad(state, type)[0];
    const result = await construct.execute({
      sessionId: state.sessionId,
      leaseId,
      expectedRevision: state.revision,
      operationId: `mission-one-${type}`,
      type,
      ...cell,
    });
    assert.equal(result.ok, true, `${type} construction was accepted`);
  }

  state = integrate(state, 361);
  assert.equal(state.mission.status, 'pending-confirmation');
  assert.equal(state.mission.outcome, 'objective-secured');
  assert.ok(state.buildings.filter((building) => building.origin === 'daneel').length >= 3);
});

test('Daneel production controls change local facility output and remain inspectable', async () => {
  let state = createGame('enough');
  const store = { getState: () => state, commit: (next) => { state = next; } };
  const tools = createToolSet(store);
  const connected = await tools.find((tool) => tool.name === 'connect_steward').execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  const healthy = structuredClone(state);
  const result = await tools.find((tool) => tool.name === 'modify_production').execute({
    sessionId: state.sessionId,
    leaseId: connected.result.leaseId,
    expectedRevision: state.revision,
    operationId: 'throttle-green-1',
    facilityId: 'green-1',
    rate: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(state.productionRates['green-1'], 0);
  const inspection = await tools.find((tool) => tool.name === 'inspect_colony').execute({ sessionId: state.sessionId, leaseId: connected.result.leaseId });
  assert.equal(inspection.result.productionRates['green-1'], 0);
  assert.ok(inspection.result.safeBuildSites.solar.length > 0, 'Daneel receives local, grid-adjacent construction options instead of guessing from Earth telemetry');

  state = integrate(state, 1);
  const uninterrupted = integrate(healthy, 1);
  assert.ok(Math.abs((uninterrupted.resources.food - state.resources.food) - 2) < 1e-9, 'the throttled greenhouse no longer produces its 2 food/day');
});

test('Daneel can win Mission II with a local production and grid response', async () => {
  let state = createGame('enough');
  const store = { getState: () => state, commit: (next) => { state = next; } };
  const tools = createToolSet(store);
  const connected = await tools.find((tool) => tool.name === 'connect_steward').execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  const construct = tools.find((tool) => tool.name === 'construct_building');
  for (const type of ['solar', 'greenhouse', 'reservoir']) {
    const cell = placeBuildingNearRoad(state, type)[0];
    const result = await construct.execute({
      sessionId: state.sessionId, leaseId: connected.result.leaseId, expectedRevision: state.revision,
      operationId: `mission-two-${type}`, type, ...cell,
    });
    assert.equal(result.ok, true, `${type} construction was accepted`);
    state = store.getState();
  }
  state = integrate(state, 730);
  assert.equal(state.mission.status, 'pending-confirmation');
  assert.equal(state.mission.outcome, 'objective-secured');
  assert.equal(state.mission.protectionLost, 0);
});

test('next-event integration reaches a completion boundary', () => { let s = constructBuilding(createGame(), 'battery', 5, 5); s = advanceToNextEvent(s); assert.equal(s.jobs[0].status, 'complete'); });

test('WebMCP action schemas expose the inputs their handlers require', () => {
  const store = { getState: () => createGame(), commit: () => {} };
  const tools = createToolSet(store);
  const road = tools.find((tool) => tool.name === 'build_road');
  const robots = tools.find((tool) => tool.name === 'assign_robots');
  const report = tools.find((tool) => tool.name === 'send_report');
  assert.equal(road.inputSchema.required.includes('path'), true);
  assert.equal(road.inputSchema.properties.path.items.required.includes('x'), true);
  assert.equal(robots.inputSchema.required.includes('jobId'), true);
  assert.equal(robots.inputSchema.required.includes('robotIds'), true);
  assert.equal(report.inputSchema.required.includes('text'), true);
});
