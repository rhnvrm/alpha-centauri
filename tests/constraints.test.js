import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { diagnoseConstraints } from '../src/game/constraints.js';
import { integrate, sendReport } from '../src/game/engine.js';
import { earthProjection } from '../src/game/projections.js';
import { createToolSet } from '../src/webmcp/tools.js';

test('live constraints diagnose power and export state with symptom, cause, and remedy', () => {
  const power = diagnoseConstraints(createGame('firstLight')).find((constraint) => constraint.id === 'power-reserve');
  assert.ok(power);
  assert.match(power.symptom, /Power reserve/);
  assert.ok(power.cause.length > 0); assert.ok(power.remedy.length > 0);

  const exportConstraint = diagnoseConstraints(createGame('rightToDecide')).find((constraint) => constraint.id === 'export-deadline');
  assert.ok(exportConstraint);
  assert.match(exportConstraint.symptom, /1000 t/);
  assert.match(exportConstraint.remedy, /cargo/i);
});

test('inspect_colony gives Daneel current diagnoses and Earth sees only downlinked diagnoses', async () => {
  let state = createGame('rightToDecide');
  const store = { getState: () => state, commit: (next) => { state = next; } };
  const tools = createToolSet(store);
  const connected = await tools.find((tool) => tool.name === 'connect_steward').execute({ sessionId: state.sessionId, protocolVersion: 'v1' });
  const inspection = await tools.find((tool) => tool.name === 'inspect_colony').execute({ sessionId: state.sessionId, leaseId: connected.result.leaseId });
  assert.ok(inspection.result.constraints.some((constraint) => constraint.id === 'export-deadline'));
  assert.deepEqual(earthProjection(state).constraints, []);

  state = sendReport(state, 'Export diagnosis filed.');
  state = integrate(state, state.packets.at(-1).arrivalDay - state.localDay);
  assert.ok(earthProjection(state).constraints.some((constraint) => constraint.id === 'export-deadline'));
  assert.equal(state.mission.bindingConstraint, 'export-deadline', 'mission progress labels follow the binding diagnosis');
});
