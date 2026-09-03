import { LIGHT_DELAY_DAYS, SAVE_VERSION, clamp } from './constants.js';
import { SCENARIOS, scenarioTiles, seededRoads, scenarioFloodKeys, initialSurveyKnowledge } from './scenarios.js';
import { powerSources } from './networks.js';
import { diagnoseConstraints } from './constraints.js';

const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export function createGame(missionId = 'firstLight', sessionId = id('session')) {
  const scenario = SCENARIOS[missionId] || SCENARIOS.firstLight;
  return {
    // A colony is never notionally frozen while Earth composes a packet.  The
    // presentation only begins stepping the clock once the live desk is shown.
    schemaVersion: SAVE_VERSION, sessionId, revision: 0, missionId, localDay: 0, launched: false, paused: false, earthCoast: false, demoPace: false, timeScale: 1,
    connection: { status: 'not-connected', leaseId: null, expiresAt: 0, agentLabel: null },
    channel: { uplinkBits: 0, downlinkBits: 0, uplinkPackets: 0, downlinkPackets: 0 },
    resources: { ...scenario.resources }, observedResources: { ...scenario.resources }, buildings: structuredClone(scenario.buildings), robots: structuredClone(scenario.robots),
    // These two ledgers are deliberately independent: Daneel can act on a completed
    // rover scan immediately, while Earth must wait for the corresponding downlink.
    localKnowledge: { surveyedTiles: initialSurveyKnowledge(scenario), regions: [{ id: 'landing-perimeter', name: 'Landing relay perimeter', discoveredDay: 0 }] },
    observedKnowledge: { surveyedTiles: initialSurveyKnowledge(scenario), regions: [{ id: 'landing-perimeter', name: 'Landing relay perimeter', discoveredDay: 0 }] },
    observedWorld: { buildings: scenario.buildings.map(({ id, type, x, y }) => ({ id, type, x, y, status: 'complete' })), robots: structuredClone(scenario.robots).map(({ id, type, x, y, status }) => ({ id, type, x, y, status })), roads: seededRoads(scenario).map((r) => ({ x: r.x, y: r.y })) },
    tiles: scenarioTiles(scenario), floodKeys: [...scenarioFloodKeys(scenario)], roads: seededRoads(scenario), jobs: [], packets: [], inbox: [], reports: [], observations: [], events: [], logs: [], receipts: {},
    pendingEvents: structuredClone(scenario.events || []),
    flows: { ...(scenario.flows || {}) },
    // Daneel may deliberately throttle completed productive facilities.
    // Omitted entries run at their normal (100%) output.
    productionRates: {},
    // The local, day-zero mandate carried by Daneel before any Earth packet arrives.
    doctrine: {
      version: 1,
      charter: {
        version: 1,
        issuedBy: 'Earth Mission Control',
        deliveredDay: 0,
        missionId: scenario.id,
        title: scenario.title,
        objective: scenario.objective,
        briefing: scenario.briefing,
      },
      authority: { roads: true, repairs: true, food: true, settlements: false, habitatLoss: false, exports: false, ...(scenario.authority || {}) },
      protectedWetlandLoss: 0,
      protocols: [],
    },
    pendingQuestions: [],
    cursors: { inbox: 0, event: 0 }, pendingDecision: null,
    mission: {
      status: 'active', progress: 0, progressLabel: 'Awaiting confirmation',
      outcome: null, earthOutcome: null, confirmedAt: null, exported: 0, startedAt: 0,
      deadlineDay: scenario.deadlineDay ?? null, sustainDays: scenario.sustainDays ?? null,
      powerZeroStreak: 0, collapsedAt: null, protectionLost: 0, interruption: { startedAt: null, endAt: null, minPower: Infinity, sustained: null },
    },
    observedConstraints: [],
    telemetry: { captureDay: 0, arrivalDay: LIGHT_DELAY_DAYS, label: 'Bootstrap observation' },
    // Browser-local diagnostic budget: never advances or mutates the colony simulation.
    superposition: { passes: 2, activations: 0, lastActivatedAtMs: 0, activeUntilMs: 0 },
    counters: { packet: 0, job: 0, event: 0 },
  };
}

export function scenarioFor(state) { return SCENARIOS[state.missionId] || SCENARIOS.firstLight; }

/** What a downlink observation honestly carries: stocks plus completed structures, robots, and roads. */
export function telemetryFor(state) {
  return {
    capturedDay: state.localDay,
    observedResources: { ...state.resources },
    observedWorld: {
      buildings: state.buildings.filter((b) => b.status === 'complete').map(({ id, type, x, y, health }) => ({ id, type, x, y, status: 'complete', health })),
      robots: state.robots.map(({ id, type, x, y, status }) => ({ id, type, x, y, status: 'idle' })),
      roads: state.roads.map((r) => ({ x: Array.isArray(r) ? r[0] : r.x, y: Array.isArray(r) ? r[1] : r.y })),
    },
    observedKnowledge: structuredClone(state.localKnowledge || { surveyedTiles: [], regions: [] }),
    observedConstraints: diagnoseConstraints(state),
  };
}
export function validateGame(state) {
  if (!state || state.schemaVersion !== SAVE_VERSION || !state.sessionId || !Number.isInteger(state.localDay)) throw new Error('Invalid or newer save');
  if (!state.resources || !Array.isArray(state.buildings) || !Array.isArray(state.packets) || !Array.isArray(state.roads)) throw new Error('Malformed save');
  return state;
}
export function copyGame(state) { return structuredClone(state); }
export function markRevision(state) { state.revision += 1; return state; }
export function tileAt(state, x, y) { return state.tiles.find((t) => t.x === x && t.y === y); }
export function occupied(state, x, y, w = 1, h = 1) {
  return state.buildings.some((b) => b.status !== 'cancelled' && x < b.x + (b.type === 'greenhouse' || b.type === 'launch' ? 3 : 2) && x + w > b.x && y < b.y + 2 && y + h > b.y);
}

/** True when seasonal flooding makes the tile impassable/buildable-locked on a given day. */
export function isFlooded(state, day) {
  const window = state.pendingEvents.find((e) => e.type === 'flood');
  if (!window || day < window.day || day >= window.day + window.days) return () => false;
  const keys = new Set(state.floodKeys);
  return (x, y) => keys.has(`${x},${y}`);
}

export function updateProgress(state) {
  const r = state.resources;
  const foodMonths = r.food / Math.max(1, r.population * 0.02);
  const powerReserve = r.powerCapacity ? clamp(r.power / r.powerCapacity, 0, 1) : 0;
  const m = state.mission;
  const binding = diagnoseConstraints(state)[0];
  m.bindingConstraint = binding?.id || null;
  let label = 'Awaiting confirmation';
  if (state.missionId === 'firstLight') {
    const capacityOK = r.capacity >= 100; const sourcesOK = powerSources(state).length >= 2;
    const sustained = m.interruption.sustained;
    const frac = clamp(r.capacity / 100, 0, 1) * 0.5 + (sourcesOK ? 0.2 : clamp(powerSources(state).length / 2, 0, 1) * 0.2) + (sustained === true ? 0.3 : sustained === false ? 0 : 0.15);
    m.progress = clamp(frac * 100, 0, 100); label = capacityOK && sourcesOK ? 'Housing and power ready' : 'Expanding capacity and sources';
    if (m.progress >= 100 && m.status === 'active') m.readyToConfirm = true;
  }
  if (state.missionId === 'enough') {
    const floors = {
      atDay0: r.food / Math.max(1, r.population * 0.02) >= 24 && powerReserve >= 0.2 && m.protectionLost === 0,
    };
    const base = floors.atDay0 ? 1 : 0;
    const dayShare = m.sustainDays ? clamp(state.localDay / m.sustainDays, 0, 1) : 1;
    m.progress = clamp(base * dayShare * 100, 0, 100); label = m.protectionLost > 0 ? 'Protected wetland loss recorded' : 'Maintaining reserve floors';
    if (m.sustainDays && state.localDay >= m.sustainDays && floors.atDay0) m.readyToConfirm = true;
  }
  if (state.missionId === 'rightToDecide') {
    const exported = (m.exported || 0) / 1000;
    m.progress = clamp(Math.min(exported, 1) * 0.7 + (m.protectionLost === 0 ? 0.3 : 0), 0, 100); label = m.bindingConstraint === 'export-deadline' ? `Export constraint: ${Math.round(m.exported || 0)} / 1000 t` : `Exported ${Math.round(m.exported || 0)} / 1000 t`;
    if (m.deadlineDay && state.localDay >= m.deadlineDay) m.readyToConfirm = true;
  }
  return Object.assign(state, { _metrics: { foodMonths, powerReserve } });
}
