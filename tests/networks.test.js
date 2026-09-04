import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { integrate, constructBuilding, queueLocalRoad } from '../src/game/engine.js';
import { isGridConnected, powerSources, gridConsumers, roadKeys } from '../src/game/networks.js';
import { buildLocal, placeBuildingNearRoad } from './helpers.js';
import { SCENARIOS, seededRoads } from '../src/game/scenarios.js';

test('seed roads connect the starting settlement to the relay', () => {
  const s = createGame('firstLight');
  assert.ok(s.roads.length >= 4, 'seeded roads exist');
  assert.ok(isGridConnected(s, s.buildings.find((b) => b.type === 'habitat')));
  assert.ok(isGridConnected(s, s.buildings.find((b) => b.type === 'solar')), 'solar-1 is on the grid');
});

test('seeded road cells are unique even when colony anchors share a corridor', () => {
  for (const scenario of Object.values(SCENARIOS)) {
    const roads = seededRoads(scenario);
    assert.equal(new Set(roads.map((road) => `${road.x},${road.y}`)).size, roads.length, `${scenario.id} has no overlapping road meshes`);
  }
});

test('an isolated solar array contributes no power until a road reaches it', () => {
  let s = createGame('firstLight');
  const before = s.resources.power;
  s = constructBuilding(s, 'solar', 28, 3, 'daneel'); // isolated from the seeded grid
  const solar = s.buildings.find((b) => b.type === 'solar' && b.id !== 'solar-1');
  assert.equal(isGridConnected(s, solar), false);
  assert.equal(powerSources(s).length, 1); // only solar-1 counts
  s = integrate(s, 55); // completes but stays off-grid
  const poweredA = s.resources.power;
  s = integrate(s, 5);
  assert.ok(s.resources.power < before + (poweredA - 0), 'no grid input from the island');
});

test('building on a road tile connects a solar array to the grid', () => {
  let s = createGame('firstLight');
  const spot = placeBuildingNearRoad(s, 'solar')[0];
  s = constructBuilding(s, 'solar', spot.x, spot.y, 'daneel');
  const solar = s.buildings.at(-1);
  assert.equal(isGridConnected(s, solar), true);
  s = integrate(s, 55);
  assert.equal(powerSources(s).length, 2);
});

test('a battery bank anchors a remote power island (local microgrid)', () => {
  let s = createGame('firstLight');
  s = constructBuilding(s, 'battery', 28, 3, 'daneel');
  // Footprint boxes reserve an extra cell of clearance; (26,3) shares an edge with (28,3)
  // without overlapping the battery's collision box, so the solar joins the island.
  s = constructBuilding(s, 'solar', 26, 3, 'daneel');
  const solar = s.buildings.at(-1);
  assert.equal(isGridConnected(s, solar), true, 'solar adjacent to a battery is a supply node');
  s = integrate(s, 45); // battery completes: solar-1 (main grid) + battery (island) counted
  assert.ok(powerSources(s).length >= 2, 'battery becomes a supply node on completion');
});

test('roads carry connectivity: a found corridor connects a distant consumer', () => {
  let s = createGame('firstLight');
  s = constructBuilding(s, 'habitat', 28, 4, 'daneel');
  const hab = s.buildings.at(-1);
  assert.equal(isGridConnected(s, hab), false);
  assert.equal(gridConsumers(s).some((c) => c.id === hab.id), false);
  // BFS a regolith corridor from the habitat to the nearest seeded road tile.
  const blocked = new Set(['rock', 'wetland'].map((t) => t));
  const nix = new Set();
  for (const b of s.buildings) if (b.status !== 'cancelled') for (let dy = 0; dy < (b.type === 'greenhouse' || b.type === 'launch' ? 2 : 2); dy += 1) for (let dx = 0; dx < (b.type === 'greenhouse' || b.type === 'launch' ? 3 : 2); dx += 1) nix.add(`${b.x + dx},${b.y + dy}`);
  const roadTargets = new Set(s.roads.map((r) => `${r.x},${r.y}`));
  const start = `28,4`; const prev = { [start]: null };
  const queue = [[28, 4]]; let goal = null;
  while (queue.length && !goal) {
    const [x, y] = queue.shift();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 2 || ny < 2 || nx > 29 || ny > 29) continue;
      const k = `${nx},${ny}`;
      const t = s.tiles.find((q) => q.x === nx && q.y === ny);
      if (!t || t.terrain !== 'regolith' || nix.has(k) || prev[k] !== undefined) continue;
      prev[k] = `${x},${y}`;
      if (roadTargets.has(k)) { goal = k; break; }
      queue.push([nx, ny]);
    }
  }
  assert.ok(goal, 'a corridor to the grid exists');
  const path = []; let cur = goal;
  while (cur !== start && cur !== null) { path.unshift(cur.split(',').map(Number)); cur = prev[cur]; }
  s = queueLocalRoad(s, path.map(([x, y]) => ({ x, y })));
  s = integrate(s, 90); // road completes at 20d; the habitat completes at 90d
  assert.equal(isGridConnected(s, s.buildings.find((b) => b.id === hab.id)), true, 'corridor connects the habitat');
  assert.ok(gridConsumers(s).some((c) => c.id === hab.id));
});

test('power reserve has a defined denominator and handles the zero-capacity edge', () => {
  let s = createGame('firstLight');
  s.resources.powerCapacity = 0; s.resources.power = 0;
  s = integrate(s, 3);
  assert.ok(Number.isFinite(s.resources.power));
  assert.equal(s.mission.powerZeroStreak > 0, true);
});

test('zero-demand edge: a full colony with no consumers holds capacity', () => {
  let s = createGame('firstLight');
  s.resources.population = 0;
  s.buildings = s.buildings.filter((b) => b.type === 'relay' || b.type === 'solar');
  s = integrate(s, 10);
  assert.ok(Number.isFinite(s.resources.power) && s.resources.power >= 0);
  assert.equal(s.resources.power <= s.resources.powerCapacity, true, 'power never exceeds capacity');
});

test('road keys deduplicate repeated corridor cells', () => {
  const roads = [{ x: 4, y: 4 }, { x: 4, y: 4 }, [5, 5], [5, 5]];
  assert.equal(roadKeys(roads).size, 2);
});
