import { constructBuilding } from '../src/game/engine.js';

const SPEC = { habitat: [2, 2], solar: [2, 2], battery: [1, 1], greenhouse: [3, 2], reservoir: [2, 2] };

/** Deterministic scan for a footprint on regolith, non-flooded (day 0), unoccupied, and touching a road tile. */
export function placeBuildingNearRoad(state, type, extra = {}) {
  const w = SPEC[type][0]; const h = SPEC[type][1];
  const vehicles = [];
  for (let y = 2; y < 30 - h; y += 1) for (let x = 2; x < 30 - w; x += 1) {
    let cellsOk = true;
    for (let fy = 0; fy < h; fy += 1) for (let fx = 0; fx < w; fx += 1) {
      const t = state.tiles.find((k) => k.x === x + fx && k.y === y + fy);
      if (!t || t.terrain !== 'regolith') { cellsOk = false; break; }
    }
    if (!cellsOk) continue;
    const occupied = state.buildings.some((b) => b.status !== 'cancelled' && x < b.x + 3 && x + w > b.x && y < b.y + 2 && y + h > b.y);
    if (occupied) continue;
    const touchesRoad = state.roads.some((r) => {
      const rx = Array.isArray(r) ? r[0] : r.x; const ry = Array.isArray(r) ? r[1] : r.y;
      for (let fy = 0; fy < h; fy += 1) for (let fx = 0; fx < w; fx += 1) if (Math.abs(rx - (x + fx)) + Math.abs(ry - (y + fy)) <= 1) return true;
      return false;
    });
    if (touchesRoad) vehicles.push({ x, y });
  }
  if (!vehicles.length) throw new Error('no road-adjacent free cell for ' + type);
  return vehicles;
}

export function buildLocal(state, type, origin = 'daneel') {
  const found = placeBuildingNearRoad(state, type);
  const cell = found[0];
  return constructBuilding(state, type, cell.x, cell.y, origin);
}