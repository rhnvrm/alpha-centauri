import { createGame } from './state.js';
import { integrate, advanceToNextEvent, nextEarthArrivalDay, queueHumanIntent, queueHumanBuild, queueHumanDoctrine, queueHumanCargo, queueHumanRoad, queueHumanProtocol, queueHumanAuthResponse, constructBuilding, cancelJob } from './engine.js';
import { loadGame, saveGame } from './storage.js';

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
  return {
    getState: () => state, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)), commit: publish, nextEarthArrivalDay: () => nextEarthArrivalDay(state),
    newGame: (missionId) => publish(createGame(missionId)), advance, nextEvent: () => publish(advanceToNextEvent(state)),
    nextEarthEvent: () => { const arrival = nextEarthArrivalDay(state); return publish(integrate(state, arrival === null ? 1 : arrival - state.localDay)); },
    toggleCoast: () => publish({ ...state, earthCoast: !state.earthCoast }),
    intent: (text, attachment) => publish(queueHumanIntent(state, text, attachment)), construct: (type, x, y) => publish(queueHumanBuild(state, type, x, y)),
    doctrine: (authority) => publish(queueHumanDoctrine(state, authority)), cargo: (quantity) => publish(queueHumanCargo(state, quantity)), road: (path) => publish(queueHumanRoad(state, path)), protocol: (definition) => publish(queueHumanProtocol(state, definition)), respondAuth: (questionId, answer) => publish(queueHumanAuthResponse(state, questionId, answer)),
    localConstruct: (type, x, y) => publish(constructBuilding(state, type, x, y, 'human')), cancel: (id) => publish(cancelJob(state, id)),
    pause: () => publish({ ...state, paused: true }), resume: () => publish({ ...state, paused: false }),
  };
}