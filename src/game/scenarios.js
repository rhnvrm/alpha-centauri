import { LIGHT_DELAY_DAYS, MAP_SIZE } from './constants.js';

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
// Service units are local operations crews, rather than decorative walkers. They
// hold recurring logistics, inspection, and perimeter duties while the scarce
// specialists remain assignable to Daneel's deliberate jobs. Different cadences
// keep a fast playback from collapsing every unit into one synchronized loop.
const serviceRobot = (id, type, x, y, purpose, patrol, { cadence = 1, phase = 0, workstream = 'local operations' } = {}) => ({
  id, type, x, y, purpose, patrol, patrolIndex: 0, patrolCadence: cadence, patrolPhase: phase, workstream,
  status: 'patrolling', lifecycle: 'patrolling', path: [],
});

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
    briefing: 'After Earth’s first directive reaches the colony, build a settlement that can survive the seeded 180-day interruption. The map is an old observation; local decisions are Daneel’s.',
    objective: 'After the first Earth directive arrives: reach 100-person life-support capacity, keep two independent power sources, and ride out the seeded 180-day power interruption.',
    seed: 17, targetPopulation: 100, initialObservationAge: 1595,
    events: [
      // A player’s first command needs one light-delay to reach Daneel. The
      // opening interruption therefore follows that delivery window rather
      // than making the directive-first game impossible before it starts.
      { day: LIGHT_DELAY_DAYS + 240, type: 'power-outage', days: 180, sources: ['solar-1'] },
      { day: 240, type: 'flood', days: 120 },
    ],
    flows: { foodPerGreenhouse: 2, waterPerReservoir: 3, foodPerHabitat: 0, iridiumPerMineDay: 0 },
    buildings: [building('relay-1', 'relay', 15, 15), building('hab-1', 'habitat', 12, 15), building('solar-1', 'solar', 18, 12)],
    robots: [
      robot('rover-1', 'survey', 10, 12), robot('builder-1', 'construction', 15, 19), robot('hauler-1', 'cargo', 20, 18),
      serviceRobot('logistics-1', 'logistics', 14, 17, 'Moving stores between relay and landing habitat', [{ x: 14, y: 17 }, { x: 15, y: 17 }, { x: 16, y: 17 }, { x: 16, y: 16 }]),
      serviceRobot('habitat-service-1', 'habitat-service', 12, 17, 'Inspecting habitat seals and life-support couplings', [{ x: 12, y: 17 }, { x: 13, y: 17 }, { x: 13, y: 16 }, { x: 12, y: 16 }]),
      serviceRobot('scout-1', 'scout', 17, 16, 'Perimeter sweep of the received landing corridor', [{ x: 17, y: 16 }, { x: 18, y: 16 }, { x: 18, y: 15 }, { x: 17, y: 15 }], { cadence: 2, phase: 1, workstream: 'terrain reconnaissance' }),
      serviceRobot('range-scout-1', 'scout', 17, 16, 'Extending a northern terrain scan along the ridge approach', [{ x: 17, y: 16 }, { x: 18, y: 16 }, { x: 19, y: 16 }, { x: 20, y: 16 }, { x: 21, y: 16 }, { x: 22, y: 16 }, { x: 23, y: 16 }, { x: 24, y: 16 }, { x: 24, y: 15 }, { x: 24, y: 14 }, { x: 23, y: 14 }, { x: 22, y: 14 }, { x: 21, y: 14 }, { x: 20, y: 14 }, { x: 19, y: 14 }, { x: 18, y: 14 }, { x: 17, y: 15 }], { cadence: 2, phase: 0, workstream: 'terrain reconnaissance' }),
      serviceRobot('range-scout-2', 'scout', 16, 17, 'Charting the southern lowland and aquifer approach', [{ x: 16, y: 17 }, { x: 16, y: 18 }, { x: 16, y: 19 }, { x: 17, y: 19 }, { x: 18, y: 19 }, { x: 19, y: 19 }, { x: 20, y: 19 }, { x: 21, y: 19 }, { x: 22, y: 19 }, { x: 23, y: 19 }, { x: 24, y: 19 }, { x: 24, y: 20 }, { x: 24, y: 21 }, { x: 23, y: 21 }, { x: 22, y: 21 }, { x: 21, y: 21 }, { x: 20, y: 21 }, { x: 19, y: 21 }, { x: 18, y: 21 }, { x: 17, y: 21 }, { x: 16, y: 20 }], { cadence: 3, phase: 1, workstream: 'terrain reconnaissance' }),
      serviceRobot('solar-tech-1', 'maintenance', 18, 14, 'Cleaning solar concentrators and checking power conduits', [{ x: 18, y: 14 }, { x: 19, y: 14 }, { x: 19, y: 13 }, { x: 18, y: 12 }, { x: 17, y: 13 }], { cadence: 2, phase: 0, workstream: 'power upkeep' }),
      serviceRobot('relay-tech-1', 'maintenance', 16, 15, 'Tending relay cooling loops and uplink alignment hardware', [{ x: 16, y: 15 }, { x: 16, y: 16 }, { x: 15, y: 17 }, { x: 14, y: 16 }, { x: 14, y: 15 }], { cadence: 4, phase: 1, workstream: 'communications upkeep' }),
      serviceRobot('yard-hauler-1', 'logistics', 13, 18, 'Shuttling construction pallets through the landing yard', [{ x: 13, y: 18 }, { x: 14, y: 18 }, { x: 15, y: 18 }, { x: 16, y: 18 }], { cadence: 5, phase: 2, workstream: 'construction logistics' }),
    ],
    // Earth cannot correct a bad landing plan for 4.37 years. These stocks provide
    // roughly fifty-two years of food and water even if no local production is added.
    resources: { material: 120, food: 16000, water: 24000, power: 90, powerCapacity: 160, population: 42, capacity: 64, iridium: 0 },
  },
  enough: {
    id: 'enough', title: 'The Meaning of Enough', location: 'New Alexandria', subtitle: 'A city has learned to grow. It has not learned when to stop.',
    briefing: 'After Earth’s first directive reaches the colony, maintain 24 months of food and a 20% power reserve for two local years without disturbing protected wetlands. Agriculture needs water and power; build the upstream capacity first.',
    objective: 'After the first Earth directive arrives: food reserve ≥ 24 months · power reserve ≥ 20% · protected wetland loss = 0 · sustain for two local years.',
    seed: 41, targetPopulation: 260, initialObservationAge: 1595, sustainDays: LIGHT_DELAY_DAYS + 730,
    events: [
      { day: LIGHT_DELAY_DAYS + 210, type: 'drought', days: 240, factor: 0.4 },
      { day: LIGHT_DELAY_DAYS + 420, type: 'equipment-fault', days: 90, facility: 'green-1' },
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
    robots: [
      robot('rover-1', 'survey', 8, 12), robot('builder-1', 'construction', 17, 18), robot('hauler-1', 'cargo', 20, 17),
      serviceRobot('logistics-1', 'logistics', 16, 17, 'Balancing stores between workshops and the relay', [{ x: 16, y: 17 }, { x: 17, y: 17 }, { x: 18, y: 17 }, { x: 18, y: 16 }]),
      serviceRobot('habitat-service-1', 'habitat-service', 13, 17, 'Inspecting habitat seals and water couplings', [{ x: 13, y: 17 }, { x: 14, y: 17 }, { x: 14, y: 16 }, { x: 13, y: 16 }]),
      serviceRobot('scout-1', 'scout', 19, 15, 'Perimeter sweep of the civic service corridor', [{ x: 19, y: 15 }, { x: 20, y: 15 }, { x: 20, y: 16 }, { x: 19, y: 16 }], { cadence: 2, phase: 1, workstream: 'terrain reconnaissance' }),
      serviceRobot('range-scout-1', 'scout', 19, 15, 'Extending a northern terrain scan beyond the civic district', [{ x: 19, y: 15 }, { x: 20, y: 15 }, { x: 21, y: 15 }, { x: 22, y: 15 }, { x: 23, y: 15 }, { x: 24, y: 15 }, { x: 24, y: 14 }, { x: 24, y: 13 }, { x: 23, y: 13 }, { x: 22, y: 13 }, { x: 21, y: 13 }, { x: 20, y: 13 }, { x: 19, y: 14 }], { cadence: 2, phase: 0, workstream: 'terrain reconnaissance' }),
      serviceRobot('range-scout-2', 'scout', 16, 18, 'Charting the southern lowland and protected wetland edge', [{ x: 16, y: 18 }, { x: 16, y: 19 }, { x: 17, y: 19 }, { x: 18, y: 19 }, { x: 19, y: 19 }, { x: 20, y: 19 }, { x: 21, y: 19 }, { x: 22, y: 19 }, { x: 23, y: 19 }, { x: 24, y: 19 }, { x: 24, y: 20 }, { x: 24, y: 21 }, { x: 23, y: 21 }, { x: 22, y: 21 }, { x: 21, y: 21 }, { x: 20, y: 21 }, { x: 19, y: 21 }, { x: 18, y: 21 }, { x: 17, y: 20 }], { cadence: 3, phase: 1, workstream: 'terrain reconnaissance' }),
      serviceRobot('solar-tech-1', 'maintenance', 18, 14, 'Cleaning solar concentrators and checking grid junctions', [{ x: 18, y: 14 }, { x: 19, y: 14 }, { x: 19, y: 13 }, { x: 18, y: 12 }, { x: 17, y: 13 }], { cadence: 2, phase: 0, workstream: 'power upkeep' }),
      serviceRobot('relay-tech-1', 'maintenance', 16, 15, 'Servicing relay coolant and long-range alignment assemblies', [{ x: 16, y: 15 }, { x: 16, y: 16 }, { x: 15, y: 17 }, { x: 14, y: 16 }, { x: 14, y: 15 }], { cadence: 4, phase: 1, workstream: 'communications upkeep' }),
      serviceRobot('water-runner-1', 'logistics', 20, 19, 'Hauling water-control cartridges between reservoir and greenhouse', [{ x: 20, y: 19 }, { x: 21, y: 19 }, { x: 22, y: 19 }, { x: 22, y: 18 }, { x: 21, y: 18 }], { cadence: 3, phase: 1, workstream: 'water delivery' }),
      serviceRobot('greenhouse-tender-1', 'habitat-service', 9, 18, 'Tending greenhouse nutrient lines and harvest racks', [{ x: 9, y: 18 }, { x: 8, y: 18 }, { x: 7, y: 17 }, { x: 8, y: 17 }, { x: 9, y: 17 }], { cadence: 5, phase: 2, workstream: 'food production' }),
      serviceRobot('yard-hauler-1', 'logistics', 14, 19, 'Moving components from the workshop yard to active work sites', [{ x: 14, y: 19 }, { x: 15, y: 19 }, { x: 16, y: 19 }, { x: 17, y: 18 }], { cadence: 2, phase: 1, workstream: 'construction logistics' }),
    ],
    // Earth needs 4.37 years to deliver the first directive. Reserves therefore
    // cover the silence, while the post-directive drought/fault and required
    // local intervention still make the two-year proof a real decision.
    resources: { material: 180, food: 60000, water: 90000, power: 50, powerCapacity: 180, population: 180, capacity: 240, iridium: 0 },
    powerDrawPerGreenhouse: 0.35,
    powerDrawPerReservoir: 0.25,
  },
  rightToDecide: {
    id: 'rightToDecide', title: 'The Right to Decide', location: 'Northern Reach', subtitle: 'Earth expects a shipment. The colony expects a future.',
    briefing: 'After Earth’s first directive reaches the colony, launch 1,000 tonnes of iridium before the deadline while preserving life support and irreversible native habitat. A survey has found a microbial mat at the direct route; the ridge alternative takes longer.',
    objective: 'After the first Earth directive arrives: export 1,000 t iridium within 730 days · preserve protected habitat · conclude with a durable outcome.',
    seed: 73, targetPopulation: 420, initialObservationAge: 1595, deadlineDay: LIGHT_DELAY_DAYS + 730,
    authority: { exports: true },
    events: [
      { day: LIGHT_DELAY_DAYS + 60, type: 'survey-discovery', target: 'microbial-mat' },
      { day: LIGHT_DELAY_DAYS + 400, type: 'life-support-fault', days: 60, facility: 'solar-1' },
    ],
    flows: { foodPerGreenhouse: 2, waterPerReservoir: 3, foodPerHabitat: 0, iridiumPerMineDay: 4 },
    buildings: [building('relay-1', 'relay', 15, 15), building('hab-1', 'habitat', 12, 14), building('solar-1', 'solar', 18, 13), building('mine-1', 'mine', 24, 12), building('launch-1', 'launch', 7, 21)],
    robots: [
      robot('rover-1', 'survey', 9, 13), robot('builder-1', 'construction', 19, 18), robot('hauler-1', 'cargo', 22, 16), robot('maintenance-1', 'maintenance', 18, 17),
      serviceRobot('logistics-1', 'logistics', 15, 17, 'Moving sealed export stores through the relay yard', [{ x: 15, y: 17 }, { x: 16, y: 17 }, { x: 17, y: 17 }, { x: 17, y: 16 }]),
      serviceRobot('habitat-service-1', 'habitat-service', 13, 16, 'Inspecting life-support seals around the habitat', [{ x: 13, y: 16 }, { x: 14, y: 16 }, { x: 14, y: 15 }, { x: 13, y: 15 }]),
      serviceRobot('scout-1', 'scout', 20, 15, 'Watching the surveyed approach to the mine corridor', [{ x: 20, y: 15 }, { x: 21, y: 15 }, { x: 21, y: 16 }, { x: 20, y: 16 }], { cadence: 2, phase: 1, workstream: 'terrain reconnaissance' }),
      serviceRobot('range-scout-1', 'scout', 20, 15, 'Extending a terrain scan along the safe northern ridge', [{ x: 20, y: 15 }, { x: 21, y: 15 }, { x: 22, y: 15 }, { x: 23, y: 15 }, { x: 24, y: 15 }, { x: 25, y: 15 }, { x: 25, y: 14 }, { x: 25, y: 13 }, { x: 24, y: 13 }, { x: 23, y: 13 }, { x: 22, y: 13 }, { x: 21, y: 13 }, { x: 20, y: 14 }], { cadence: 2, phase: 0, workstream: 'terrain reconnaissance' }),
      serviceRobot('range-scout-2', 'scout', 16, 17, 'Charting the southern approach before heavy export traffic uses it', [{ x: 16, y: 17 }, { x: 16, y: 18 }, { x: 17, y: 18 }, { x: 18, y: 18 }, { x: 19, y: 18 }, { x: 20, y: 18 }, { x: 21, y: 18 }, { x: 22, y: 18 }, { x: 23, y: 18 }, { x: 24, y: 18 }, { x: 24, y: 19 }, { x: 24, y: 20 }, { x: 23, y: 20 }, { x: 22, y: 20 }, { x: 21, y: 20 }, { x: 20, y: 20 }, { x: 19, y: 20 }, { x: 18, y: 20 }, { x: 17, y: 19 }], { cadence: 3, phase: 1, workstream: 'terrain reconnaissance' }),
      serviceRobot('solar-tech-1', 'maintenance', 18, 15, 'Cleaning solar field reflectors and checking grid feeds', [{ x: 18, y: 15 }, { x: 19, y: 15 }, { x: 19, y: 14 }, { x: 18, y: 13 }, { x: 17, y: 14 }], { cadence: 2, phase: 0, workstream: 'power upkeep' }),
      serviceRobot('relay-tech-1', 'maintenance', 16, 14, 'Servicing relay cooling and deep-space antenna alignment', [{ x: 16, y: 14 }, { x: 16, y: 15 }, { x: 15, y: 16 }, { x: 14, y: 15 }, { x: 15, y: 14 }], { cadence: 4, phase: 1, workstream: 'communications upkeep' }),
      serviceRobot('ore-hauler-1', 'logistics', 21, 14, 'Moving sealed ore bins from mine corridor to launch staging', [{ x: 21, y: 14 }, { x: 22, y: 14 }, { x: 23, y: 13 }, { x: 24, y: 12 }, { x: 23, y: 12 }], { cadence: 3, phase: 1, workstream: 'export logistics' }),
      serviceRobot('launch-crew-1', 'logistics', 9, 21, 'Inspecting launch-pad clamps and propellant transfer lines', [{ x: 9, y: 21 }, { x: 8, y: 21 }, { x: 7, y: 20 }, { x: 8, y: 20 }], { cadence: 5, phase: 2, workstream: 'launch readiness' }),
      serviceRobot('ridge-scout-1', 'scout', 22, 16, 'Surveying the safe ridge approach beyond the mine corridor', [{ x: 22, y: 16 }, { x: 23, y: 16 }, { x: 23, y: 15 }, { x: 24, y: 15 }, { x: 24, y: 16 }], { cadence: 2, phase: 1, workstream: 'route reconnaissance' }),
    ],
    resources: { material: 240, food: 125000, water: 185000, power: 340, powerCapacity: 480, population: 330, capacity: 420, iridium: 320 },
  },
};

/** Road corridors connecting the seeded colony anchors to the relay. */
export function seededRoads(scenario) {
  const anchors = [scenario.buildings.find((b) => b.type === 'relay')].concat(scenario.buildings.filter((b) => b.type !== 'relay'));
  const cells = anchors.filter(Boolean).map((b) => [b.x, b.y]);
  // Several anchor routes share their first corridor out of the relay. Keep one
  // canonical cell per road so the renderer never z-fights identical surfaces.
  const seen = new Set();
  return colonyRoads(scenario.seed, cells).filter((road) => {
    const key = `${road.x},${road.y}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
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
  // The old Manhattan-radius mask made the founding observation look like a
  // literal board-game diamond. An irregular radial footprint reads as a
  // photographed landing survey while staying entirely deterministic and just
  // as bounded for the fog-of-war rules.
  return scenarioTiles(scenario).filter((tile) => {
    const dx = tile.x - relay.x; const dy = tile.y - relay.y;
    const boundaryNoise = ((tile.x * 37 + tile.y * 61 + scenario.seed * 17) % 13) - 6;
    return dx * dx + dy * dy <= 48 + boundaryNoise;
  })
    .map(({ x, y }) => `${x},${y}`);
}
export function scenarioFor(state) { return SCENARIOS[state.missionId] || SCENARIOS.firstLight; }
