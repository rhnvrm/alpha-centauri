import { SAVE_KEY, SAVE_VERSION } from './constants.js';
import { createGame, validateGame } from './state.js';

export const SAVE_SIZE_BUDGET = 900_000; // conservative measured budget in bytes

export function storageProbe(storage = globalThis.localStorage) {
  if (!storage) return { available: false, reason: 'NO_STORAGE' };
  try { const k = '__probe__'; storage.setItem(k, '1'); storage.removeItem(k); return { available: true, reason: null }; }
  catch (error) { return { available: false, reason: error?.name === 'QuotaExceededError' ? 'QUOTA' : 'DENIED' }; }
}

export function saveSize(state) { try { return new TextEncoder().encode(JSON.stringify(state)).length; } catch { return 0; } }

/** Add fields introduced during the v1 demo without resetting the saved colony. */
function migrateGame(raw) {
  const state = validateGame(raw);
  const defaults = createGame(state.missionId, state.sessionId);
  for (const key of ['pendingQuestions', 'pendingEvents', 'floodKeys', 'flows', 'productionRates', 'earthCoast', 'demoPace', 'timeScale', 'superposition', 'localKnowledge', 'observedKnowledge', 'observedConstraints']) {
    if (state[key] === undefined) state[key] = defaults[key];
  }
  // A pre-existing save has already been launched, even if it is still at day zero.
  if (state.launched === undefined) state.launched = true;
  state.mission = { ...defaults.mission, ...state.mission,
    interruption: { ...defaults.mission.interruption, ...state.mission?.interruption } };
  state.doctrine = { ...defaults.doctrine, ...state.doctrine,
    authority: { ...defaults.doctrine.authority, ...state.doctrine?.authority } };
  // The colony service fleet grew after the first saves shipped. Preserve all
  // player progress, jobs, and specialist positions, but add newly authored
  // autonomous crews on load so an old save is not permanently locked into an
  // empty-looking world. Their patrol position is projected to the saved local
  // day instead of spawning every new crew at the landing point.
  const existingRobotIds = new Set((state.robots || []).map((robot) => robot.id));
  const addedCrew = defaults.robots.filter((robot) => robot.status === 'patrolling' && !existingRobotIds.has(robot.id));
  for (const crew of addedCrew) {
    const cadence = Math.max(1, Math.floor(crew.patrolCadence || 1));
    const phase = Math.floor(crew.patrolPhase || 0);
    const patrol = crew.patrol || [];
    const advances = patrol.length ? Math.floor((state.localDay + phase) / cadence) - Math.floor(phase / cadence) : 0;
    const patrolIndex = patrol.length ? advances % patrol.length : 0;
    const point = patrol[patrolIndex];
    state.robots.push({ ...crew, patrolIndex, x: point?.x ?? crew.x, y: point?.y ?? crew.y, path: patrol.slice(patrolIndex + 1).concat(patrol.slice(0, patrolIndex)) });
  }
  // Keep the existing v1 observation migration shared by load and import.
  if (!state.observedWorld) state.observedWorld = {
    buildings: state.buildings.filter((b) => b.status === 'complete').map(({ id, type, x, y, health }) => ({ id, type, x, y, status: 'complete', health })),
    robots: state.robots.map(({ id, type, x, y, status }) => ({ id, type, x, y, status })),
    roads: state.roads.map((r) => ({ x: Array.isArray(r) ? r[0] : r.x, y: Array.isArray(r) ? r[1] : r.y })),
  };
  return state;
}

export function loadGame(storage = globalThis.localStorage) {
  if (!storage) return null;
  const raw = storage.getItem(SAVE_KEY); if (!raw) return null;
  try {
    return migrateGame(JSON.parse(raw));
  } catch (error) { try { storage.setItem(`${SAVE_KEY}:invalid`, raw); } catch { /* preserve in place */ } return null; }
}

export function saveGame(state, storage = globalThis.localStorage) {
  if (!storage) return false;
  const raw = JSON.stringify(state);
  if (raw.length > SAVE_SIZE_BUDGET) return false;
  try { storage.setItem(SAVE_KEY, raw); return true; } catch { return false; }
}

export function clearGame(storage = globalThis.localStorage) { try { storage?.removeItem(SAVE_KEY); } catch { /* ignore */ } }

/** Export the exact selected save as a JSON document. Spoilering: contains both sides of the light cone. */
export function exportGame(state) {
  return JSON.stringify({ exportedAt: Date.now(), kind: 'intent-horizon-save', ...state });
}

export function validateImport(text) {
  if (typeof text !== 'string' || text.length > SAVE_SIZE_BUDGET) return { ok: false, reason: 'PAYLOAD_TOO_LARGE' };
  let raw; try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'INVALID_JSON' }; }
  try { const s = migrateGame({ ...raw, sessionId: raw.sessionId || 'import' }); return { ok: true, state: { ...s, sessionId: `import-${Date.now().toString(36)}` } }; }
  catch (error) { return { ok: false, reason: error.message }; }
}
