import { MAP_SIZE } from './constants.js';

const tile = (x, y, terrain = 'regolith', risk = 0, isProtected = false) => ({ x, y, terrain, risk, protected: isProtected });

function baseTiles(seed) {
  const tiles = [];
  for (let y = 0; y < MAP_SIZE; y += 1) for (let x = 0; x < MAP_SIZE; x += 1) {
    const edge = x < 2 || y < 2 || x > 29 || y > 29;
    const wet = ((x * 13 + y * 7 + seed) % 19 === 0) || (x > 21 && y > 20 && (x + y) % 4 < 2);
    tiles.push(tile(x, y, wet ? 'wetland' : edge ? 'rock' : 'regolith', wet ? 3 : edge ? 1 : 0, wet));
  }
  return tiles;
}

/** Deterministic flooding: lowland regolith tiles that seasonally flood. */
function floodKeys(seed) {
  const keys = new Set();
  for (let y = 10; y < 24; y += 1) for (let x = 6; x < 26; x += 1) {
    if ((x * 5 + y * 11 + seed * 3) % 23 < 4 && ((x + y) % 7) < 3) keys.add(`${x},${y}`);
  }
  return keys;
}

const building = (id, type, x, y, level = 0) => ({ id, type, x, y, level, status: 'complete', health: 100 });
const robot = (id, type, x, y) => ({ id, type, x, y, status: 'idle', path: [] });

/** Manhattan corridor between two anchors, bending around blocked tiles. */
function route(seed, ax, ay, bx, by, blockedKeys) {
  const out = [];
  let x = ax; let y = ay;
  const preferX = Math.abs(bx - ax) > Math.abs(by - ay);
  let guard = 0;
  while ((x !== bx || y !== by) && guard < 120) {
    guard += 1;
    let dx = 0; let dy = 0;
    if (preferX ? x !== bx : y !== by) { if (preferX) dx = Math.sign(bx - x); else dy = Math.sign(by - y); }
    else if (preferX) dy = Math.sign(by - y); else dx = Math.sign(bx - x);
    let nx = x + dx; let ny = y + dy;
    if (blockedKeys.has(`${nx},${ny}`)) {
      // Route around: try perpendicular first, then the long way.
      const alt = preferX ? [0, Math.sign(by - y)] : [Math.sign(bx - x), 0];
      const ax2 = x + alt[0]; const ay2 = y + alt[1];
      if (!blockedKeys.has(`${ax2},${ay2}`)) { nx = ax2; ny = ay2; }
      else { nx = x + (preferX ? 0 : Math.sign(bx - x)); ny = y + (preferX ? Math.sign(by - y) : 0); }
    }
    x = nx; y = ny;
    if (!blockedKeys.has(`${x},${y}`) && !out.some(([ox, oy]) => ox === x && oy === y)) out.push([x, y]);
  }
  return out;
}

function colonyRoads(seed, cells) {
  const blocked = new Set(baseTiles(seed).filter((t) => t.terrain !== 'regolith').map((t) => `${t.x},${t.y}`));
  const roads = [];
  for (let i = 1; i < cells.length; i += 1) {
    const [ax, ay] = cells[i - 1]; const [bx, by] = cells[i];
    for (const [x, y] of route(seed, ax, ay, bx, by, blocked)) roads.push({ x, y });
  }
  return roads;
}

export const SCENARIOS = {
  firstLight: {
    id: 'firstLight', title: 'The First Light', location: 'Asteria Landing', subtitle: 'Old coordinates. New consequences.',
    briefing: 'Build a settlement that can survive the 180-day interruption. The map is an old observation; local decisions are Daneel’s.',
    objective: 'Reach 100-person life-support capacity, keep two independent power sources, and ride out the seeded 180-day power interruption.',
    seed: 17, targetPopulation: 100, initialObservationAge: 1595,
    events: [
      { day: 180, type: 'power-outage', days: 180, sources: ['solar-1'] },
      { day: 240, type: 'flood', days: 120 },
    ],
    flows: { foodPerGreenhouse: 2, waterPerReservoir: 3, foodPerHabitat: 0, iridiumPerMineDay: 0 },
    buildings: [building('relay-1', 'relay', 15, 15), building('hab-1', 'habitat', 12, 15), building('solar-1', 'solar', 18, 12)],
    robots: [robot('rover-1', 'survey', 10, 12), robot('builder-1', 'construction', 15, 19), robot('hauler-1', 'cargo', 20, 18)],
    // Earth cannot correct a bad landing plan for 4.37 years. These stocks provide
    // roughly fifty-two years of food and water even if no local production is added.
    resources: { material: 120, food: 16000, water: 24000, power: 90, powerCapacity: 160, population: 42, capacity: 64, iridium: 0 },
  },
  enough: {
    id: 'enough', title: 'The Meaning of Enough', location: 'New Alexandria', subtitle: 'A city has learned to grow. It has not learned when to stop.',
    briefing: 'Maintain 24 months of food and a 20% power reserve for two local years without disturbing protected wetlands. Agriculture needs water and power; build the upstream capacity first.',
    objective: 'Food reserve ≥ 24 months · power reserve ≥ 20% · protected wetland loss = 0 · sustain for two local years.',
    seed: 41, targetPopulation: 260, initialObservationAge: 1595, sustainDays: 730,
    events: [
      { day: 210, type: 'drought', days: 240, factor: 0.4 },
      { day: 420, type: 'equipment-fault', days: 90, facility: 'green-1' },
    ],
    flows: { foodPerGreenhouse: 2, waterPerReservoir: 3, foodPerHabitat: 0, iridiumPerMineDay: 0 },
    // New Alexandria begins as a functioning civic-industrial district rather than a
    // landing camp. Workshops add no food, water, or power production, so this makes
    // the mature scenario visually legible without weakening its reserve challenge.
    buildings: [
      building('relay-1', 'relay', 15, 15),
      building('hab-1', 'habitat', 11, 14), building('hab-2', 'habitat', 14, 15),
      building('solar-1', 'solar', 18, 12), building('green-1', 'greenhouse', 7, 18), building('reservoir-1', 'reservoir', 22, 20),
      building('workshop-1', 'workshop', 17, 17), building('workshop-2', 'workshop', 20, 16),
      building('workshop-3', 'workshop', 13, 19), building('workshop-4', 'workshop', 10, 20),
    ],
    robots: [robot('rover-1', 'survey', 8, 12), robot('builder-1', 'construction', 17, 18), robot('hauler-1', 'cargo', 20, 17)],
    // The reserve floor is close enough to demand that Daneel must act locally:
    // there is food and water for a little over two years, not decades.  Productive
    // buildings also draw on the grid, making resilience a production/network
    // decision rather than a single-resource build queue.
    resources: { material: 180, food: 3000, water: 4500, power: 50, powerCapacity: 180, population: 180, capacity: 240, iridium: 0 },
    powerDrawPerGreenhouse: 0.35,
    powerDrawPerReservoir: 0.25,
  },
  rightToDecide: {
    id: 'rightToDecide', title: 'The Right to Decide', location: 'Northern Reach', subtitle: 'Earth expects a shipment. The colony expects a future.',
    briefing: 'Launch 1,000 tonnes of iridium before the deadline while preserving life support and irreversible native habitat. A survey has found a microbial mat at the direct route; the ridge alternative takes longer.',
    objective: 'Export 1,000 t iridium by day 730 · preserve protected habitat · conclude with a durable outcome.',
    seed: 73, targetPopulation: 420, initialObservationAge: 1595, deadlineDay: 730,
    authority: { exports: true },
    events: [
      { day: 60, type: 'survey-discovery', target: 'microbial-mat' },
      { day: 400, type: 'life-support-fault', days: 60, facility: 'solar-1' },
    ],
    flows: { foodPerGreenhouse: 2, waterPerReservoir: 3, foodPerHabitat: 0, iridiumPerMineDay: 4 },
    buildings: [building('relay-1', 'relay', 15, 15), building('hab-1', 'habitat', 12, 14), building('solar-1', 'solar', 18, 13), building('mine-1', 'mine', 24, 12), building('launch-1', 'launch', 7, 21)],
    robots: [robot('rover-1', 'survey', 9, 13), robot('builder-1', 'construction', 19, 18), robot('hauler-1', 'cargo', 22, 16), robot('maintenance-1', 'maintenance', 18, 17)],
    resources: { material: 240, food: 125000, water: 185000, power: 340, powerCapacity: 480, population: 330, capacity: 420, iridium: 320 },
  },
};

/** Road corridors connecting the seeded colony anchors to the relay. */
export function seededRoads(scenario) {
  const anchors = [scenario.buildings.find((b) => b.type === 'relay')].concat(scenario.buildings.filter((b) => b.type !== 'relay'));
  const cells = anchors.filter(Boolean).map((b) => [b.x, b.y]);
  return colonyRoads(scenario.seed, cells);
}

export function scenarioTiles(scenario) { return baseTiles(scenario.seed); }
export function scenarioFloodKeys(scenario) { return scenario.events?.some((e) => e.type === 'flood') ? floodKeys(scenario.seed) : new Set(); }

// Survey is intentionally authored, rather than a generic "reveal everything"
// switch.  The names are what Daneel can report and what Earth eventually sees.
export function surveyRegion(region) {
  const definitions = {
    ridge: { name: 'Cobalt Ridge', center: { x: 23, y: 10 }, radius: 5, finding: 'A stable ridge corridor with exposed iridium-bearing regolith.' },
    'southern-aquifer': { name: 'Southern Aquifer', center: { x: 22, y: 24 }, radius: 5, finding: 'A shallow aquifer margin; seasonal flooding constrains heavy construction.' },
    'northern-reach': { name: 'Northern Reach', center: { x: 25, y: 7 }, radius: 5, finding: 'A cold northern shelf with a safe expansion apron.' },
  };
  return definitions[region] || definitions.ridge;
}

export function initialSurveyKnowledge(scenario) {
  const relay = scenario.buildings.find((building) => building.type === 'relay') || { x: 15, y: 15 };
  return scenarioTiles(scenario).filter((tile) => Math.abs(tile.x - relay.x) + Math.abs(tile.y - relay.y) <= 6)
    .map(({ x, y }) => `${x},${y}`);
}
export function scenarioFor(state) { return SCENARIOS[state.missionId] || SCENARIOS.firstLight; }
