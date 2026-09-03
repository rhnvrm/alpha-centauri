// Road/power network connectivity.
//
// Roads carry connectivity: two grid cells are neighbors when they share an
// edge. A building is grid-connected when any of its footprint cells lies in
// the same connected component as the relay anchor (or a battery bank) through
// the road+footprint graph. Power generation and distribution only count
// connected buildings; an isolated structure consumes nothing and provides
// nothing until the colony reaches it with roads or an adjacent structure.
import { BUILDINGS } from './constants.js';

const key = (x, y) => `${x},${y}`;
const BUILDING_WIDTH = (type) => (BUILDINGS[type]?.footprint?.[0] ?? 1);
const BUILDING_HEIGHT = (type) => (BUILDINGS[type]?.footprint?.[1] ?? 1);

/** Footprint cells occupied by a building (as [x, y] integer tuples). */
export function footprintCells(b) {
  const w = BUILDING_WIDTH(b.type); const h = BUILDING_HEIGHT(b.type);
  const cells = [];
  for (let dx = 0; dx < w; dx += 1) for (let dy = 0; dy < h; dy += 1) cells.push([b.x + dx, b.y + dy]);
  return cells;
}

/** Road tiles as a Set of "x,y" keys, deduplicating path segments. */
export function roadKeys(roads) {
  const set = new Set();
  for (const r of roads) { if (Array.isArray(r)) { if (r.length >= 2) set.add(key(Math.floor(r[0]), Math.floor(r[1]))); } else set.add(key(Math.floor(r.x), Math.floor(r.y))); }
  return set;
}

/**
 * Connected grid components over road tiles plus building footprints.
 * Returns a Map<"x,y", componentId>.
 */
export function gridComponents(state) {
  const cells = roadKeys(state.roads);
  const buildings = state.buildings.filter((b) => b.status !== 'cancelled');
  for (const b of buildings) for (const [x, y] of footprintCells(b)) cells.add(key(x, y));
  const parent = new Map();
  const find = (k) => { let root = k; while (parent.has(root) && parent.get(root) !== root) root = parent.get(root); let cur = k; while (parent.has(cur) && parent.get(cur) !== cur) { const next = parent.get(cur); parent.set(cur, root); cur = next; } return root; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (const k of cells) parent.set(k, k);
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const nk = key(nx, ny); if (cells.has(nk)) union(k, nk); }
  }
  return { cells, components: new Map([...parent].map(([k]) => [k, find(k)])), find };
}

/** True when any footprint cell of the building is connected to the colony grid. */
export function isGridConnected(state, building) {
  const { components } = gridComponents(state);
  const anchors = state.buildings.filter((b) => b.status !== 'cancelled' && (b.type === 'relay' || b.type === 'battery'));
  const anchorComponents = new Set();
  for (const a of anchors) for (const [x, y] of footprintCells(a)) anchorComponents.add(components.get(key(x, y)));
  if (anchorComponents.size === 0) return false;
  for (const [x, y] of footprintCells(building)) if (anchorComponents.has(components.get(key(x, y)))) return true;
  return false;
}

/** Buildings that supply power to the grid (solar/battery) and are connected. */
export function powerSources(state) {
  return state.buildings.filter((b) => b.status === 'complete' && (b.type === 'solar' || b.type === 'battery') && isGridConnected(state, b));
}

/** Consumer buildings (everything else on the grid). */
export function gridConsumers(state) {
  return state.buildings.filter((b) => b.status === 'complete' && b.type !== 'relay' && b.type !== 'solar' && b.type !== 'battery' && isGridConnected(state, b));
}

/** Number of independent connected power-supplying clusters (source independence). */
export function independentPowerClusters(state) {
  const { components } = gridComponents(state);
  const clusterIds = new Set();
  for (const s of powerSources(state)) for (const [x, y] of footprintCells(s)) clusterIds.add(components.get(key(x, y)));
  return clusterIds.size;
}