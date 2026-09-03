import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { advanceToNextEvent, constructBuilding, integrate, queueHumanIntent, sendReport, cancelJob } from '../src/game/engine.js';
import { createToolSet } from '../src/webmcp/tools.js';

test('one-way packets are absent before exact arrival and present at arrival', () => {
  let s = createGame(); s = queueHumanIntent(s, 'Keep the first habitat safe');
  assert.equal(s.inbox.length, 0); s = integrate(s, 1594); assert.equal(s.inbox.length, 0); s = integrate(s, 1); assert.equal(s.inbox.length, 1); assert.equal(s.inbox[0].deliveredDay, 1595);
});

test('local construction reserves material and completes only after labor time', () => {
  let s = createGame(); const material = s.resources.material; s = constructBuilding(s, 'habitat', 5, 5); assert.equal(s.resources.material, material - 18); assert.equal(s.buildings.at(-1).status, 'queued'); s = integrate(s, 89); assert.equal(s.buildings.at(-1).status, 'queued'); s = integrate(s, 1); assert.equal(s.buildings.at(-1).status, 'complete'); assert.equal(s.jobs.at(-1).status, 'complete');
});

test('cancellation is recoverable and refunds most reserved material', () => { let s = createGame(); s = constructBuilding(s, 'battery', 5, 5); const j = s.jobs.at(-1); s = cancelJob(s, j.id); assert.equal(s.jobs.at(-1).status, 'cancelled'); assert.equal(s.buildings.at(-1).status, 'cancelled'); assert.equal(s.resources.material, 118); });

test('reports use the serialized downlink delay and preserve capture day', () => { let s = createGame(); s = sendReport(s, 'Solar array stable'); assert.equal(s.reports.length, 0); const p = s.packets.at(-1); s = integrate(s, p.arrivalDay - s.localDay); assert.equal(s.reports.length, 1); assert.equal(s.reports[0].payload.capturedDay, 0); assert.equal(s.reports[0].receivedDay, p.arrivalDay); });

test('native tool write retries with one operation receipt and one job', async () => {
  let state = createGame(); const store = { getState: () => state, commit: (next) => { state = next; } }; const tools = createToolSet(store); const connect = tools.find((t) => t.name === 'connect_steward'); const connected = await connect.execute({ sessionId: state.sessionId, protocolVersion: 'v1', agentLabel: 'test' }); assert.equal(connected.ok, true); const leaseId = connected.result.leaseId; state = store.getState(); const construct = tools.find((t) => t.name === 'construct_building'); const args = { sessionId: state.sessionId, leaseId, expectedRevision: state.revision, operationId: 'op-1', type: 'battery', x: 5, y: 5 }; const first = await construct.execute(args); const second = await construct.execute({ ...args, expectedRevision: state.revision }); assert.equal(first.ok, true); assert.deepEqual(second, first); assert.equal(state.jobs.filter((j) => j.type === 'construct').length, 1);
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
