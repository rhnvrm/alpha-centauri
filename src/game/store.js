import { createGame } from './state.js';
import { integrate, advanceToNextEvent, nextEarthArrivalDay, queueHumanIntent, queueHumanBuild, queueHumanDoctrine, queueHumanCargo, queueHumanRoad, queueHumanRobotMove, queueHumanProtocol, queueHumanAuthResponse, constructBuilding, cancelJob } from './engine.js';
import { loadGame, saveGame } from './storage.js';
import { SUPERPOSITION_DURATION_MS, SUPERPOSITION_COOLDOWN_MS } from './superposition.js';

export function createStore({ storage = globalThis.localStorage } = {}) {
  let state = loadGame(storage) || createGame(); let listeners = new Set();
  const publish = (next) => {
    if (!saveGame(next, storage)) { state = { ...state, paused: true, saveError: true }; listeners.forEach((fn) => fn(state)); return state; }
    state = next; listeners.forEach((fn) => fn(state)); return state;
  };
  /** Advance by days, stopping at the next Earth-visible arrival when coast mode is on. */
  const advance = (days) => {
    const want = Math.max(0, Math.floor(days));
    if (state.earthCoast && want > 1) {
      const arrival = nextEarthArrivalDay(state);
      const capped = arrival === null ? want : Math.min(want, arrival - state.localDay);
      return publish(integrate(state, Math.max(1, capped)));
    }
    return publish(integrate(state, want));
  };
  const activateSuperposition = (now = Date.now()) => {
    const meta = state.superposition || { passes: 0, activations: 0, lastActivatedAtMs: 0, activeUntilMs: 0 };
    if (now < meta.activeUntilMs) return { ok: false, reason: 'ACTIVE', state };
    if (now < meta.lastActivatedAtMs + SUPERPOSITION_COOLDOWN_MS) return { ok: false, reason: 'COOLDOWN', remainingMs: meta.lastActivatedAtMs + SUPERPOSITION_COOLDOWN_MS - now, state };
    if (meta.passes < 1) return { ok: false, reason: 'NO_PASSES', state };
    const next = publish({ ...state, superposition: { ...meta, passes: meta.passes - 1, activations: meta.activations + 1, lastActivatedAtMs: now, activeUntilMs: now + SUPERPOSITION_DURATION_MS } });
    return { ok: true, untilMs: next.superposition.activeUntilMs, state: next };
  };
  return {
    getState: () => state, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)), commit: publish, nextEarthArrivalDay: () => nextEarthArrivalDay(state),
    newGame: (missionId) => publish({ ...createGame(missionId), launched: true }), advance, nextEvent: () => publish(advanceToNextEvent(state)),
    // The browser playback is calendar-time compression, not an event jump.  The
    // caller supplies the visible pace multiplier; integration still processes every
    // boundary in order, so Daneel's work remains legible in Superposition.
    demoStep: (days = 1) => publish(integrate(state, Math.max(1, Math.floor(days)))),
    nextEarthEvent: () => { const arrival = nextEarthArrivalDay(state); return publish(integrate(state, arrival === null ? 1 : arrival - state.localDay)); },
    toggleCoast: () => publish({ ...state, earthCoast: !state.earthCoast }),
    toggleDemoPace: () => publish({ ...state, demoPace: !state.demoPace }),
    setTimeScale: (timeScale) => {
      const scale = [1, 2, 5, 10].includes(timeScale) ? timeScale : 1;
      return publish({ ...state, timeScale: scale, demoPace: true, paused: false });
    },
    intent: (text, attachment) => publish(queueHumanIntent(state, text, attachment)), construct: (type, x, y) => publish(queueHumanBuild(state, type, x, y)), moveRobot: (robotId, x, y) => publish(queueHumanRobotMove(state, robotId, x, y)),
    doctrine: (authority) => publish(queueHumanDoctrine(state, authority)), cargo: (quantity) => publish(queueHumanCargo(state, quantity)), road: (path) => publish(queueHumanRoad(state, path)), protocol: (definition) => publish(queueHumanProtocol(state, definition)), respondAuth: (questionId, answer) => publish(queueHumanAuthResponse(state, questionId, answer)),
    localConstruct: (type, x, y) => publish(constructBuilding(state, type, x, y, 'human')), cancel: (id) => publish(cancelJob(state, id)),
    activateSuperposition, pause: () => publish({ ...state, paused: true }), resume: () => publish({ ...state, paused: false }),
  };
}
