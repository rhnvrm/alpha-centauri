export const LIGHT_DELAY = 4.37;
export const START_DATE = 2281.04;
export const CAPACITY = 2800;
export const formatDate = value => value.toFixed(2);
export const bitCost = text => new TextEncoder().encode(text).length * 8;
const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const defaults = { food: 'Autonomous', energy: 'Constrained', settlements: 'Ask Earth', ecology: 'Forbidden' };

export function createGame() {
  const colony = { population: 6482, food: 21.6, water: 38, power: 26, ecology: 98, iridium: 28450, exported: 6200, farms: 6, reactors: 3, reservoirs: 2, habitats: 18, actions: 0 };
  const history = [];
  for (let date = START_DATE - LIGHT_DELAY - .1; date <= START_DATE + .001; date += .05) history.push({ date, ...clone(colony) });
  return {
    version: 1, now: START_DATE, colony, history, directives: [], doctrine: { ...defaults }, policies: [], bitsUsed: 0, transmittedBits: 0,
    windowStart: START_DATE, nextId: 15, utility: 0,
    reports: [{ id: 'initial', sent: 2276.67, received: START_DATE, title: 'A growing colony. A narrowing margin.', text: 'Earth Command, our agricultural clusters are approaching capacity. Food reserves stand at 1.8 years. I recommend expanding food production before authorizing further settlement growth. The southern wetlands remain undisturbed.', actions: 0 }],
    packets: [
      { id: 13, kind: 'intent', text: 'Maintain reliable power generation; keep power reserve above 20%.', sent: 2279.82, arrival: 2284.19, reportAt: 2288.56, bits: 584, status: 'In transit', intent: { goal: 'power', target: 35, preserveWetlands: true, minPower: 20 } },
      { id: 14, kind: 'intent', text: 'Survey the northern iridium deposits. Avoid disturbing native ecology.', sent: 2280.46, arrival: 2284.83, reportAt: 2289.20, bits: 560, status: 'In transit', intent: { goal: 'survey', target: 1, preserveWetlands: true, minPower: 20 } },
    ],
  };
}

export function observe(game) {
  const cutoff = game.now - LIGHT_DELAY;
  let snapshot = game.history[0];
  for (const item of game.history) if (item.date <= cutoff + 1e-7) snapshot = item;
  return { ...snapshot, date: cutoff };
}

export function parseIntent(text) {
  const normalized = text.toLowerCase();
  const goal = /food|farm|agricultur|hydroponic/.test(normalized) ? 'food' : /water|reservoir|desalin/.test(normalized) ? 'water' : /power|energy|reactor|generation/.test(normalized) ? 'power' : /export|launch|cargo/.test(normalized) ? 'export' : /hous|habitat|population|settlement/.test(normalized) ? 'housing' : /survey|deposit/.test(normalized) ? 'survey' : null;
  const months = normalized.match(/(\d+)\s*months?/);
  const minPower = normalized.match(/power(?:\s+reserve)?[^.!%\d]{0,35}(\d+)\s*%/);
  return { goal, target: goal === 'food' ? clamp(Number(months?.[1] || 24), 12, 60) : goal === 'water' ? 60 : goal === 'power' ? 40 : goal === 'export' ? 10000 : 1, preserveWetlands: /preserv|protect|don't (?:convert|destroy)|do not (?:convert|destroy)|avoid disturb/.test(normalized), minPower: Number(minPower?.[1] || 20), ambiguous: /at all costs|maximize everything/.test(normalized) };
}

export function transmit(game, text, kind = 'intent', payload) {
  if (!['intent', 'primitive', 'doctrine'].includes(kind)) throw new Error('Unknown transmission type.');
  const clean = text.trim();
  if (!clean) throw new Error('Write an instruction before transmitting.');
  const bits = bitCost(clean);
  if (bits > CAPACITY - game.bitsUsed) throw new Error('Uplink capacity exceeded. Shorten your message or advance to the next window.');
  const intent = kind === 'intent' ? parseIntent(clean) : null;
  if (intent && !intent.goal) throw new Error('Daneel’s prototype vocabulary covers food, water, power, housing, exports, and surveys. Specify one of these goals.');
  if (kind === 'primitive' && !['farm', 'reservoir', 'reactor', 'habitat'].includes(payload?.building)) throw new Error('Choose a supported structure.');
  if (kind === 'doctrine' && (!payload || Object.keys(defaults).some(key => !['Autonomous', 'Constrained', 'Ask Earth', 'Forbidden'].includes(payload[key])))) throw new Error('Provide an authority level for each domain.');
  const next = clone(game);
  next.packets.push({ id: next.nextId++, kind, text: clean, intent, payload, bits, sent: next.now, arrival: next.now + LIGHT_DELAY, reportAt: next.now + 2 * LIGHT_DELAY, status: 'In transit' });
  next.bitsUsed += bits;
  next.transmittedBits += bits;
  return next;
}

function executeLocal(game, packet) {
  const c = game.colony;
  const before = c.actions;
  let outcome = '';
  if (packet.kind === 'doctrine') {
    game.doctrine = { ...packet.payload };
    outcome = 'Your revised autonomy envelope is now in force. Future local decisions will use these boundaries.';
  } else if (packet.kind === 'primitive') {
    const building = packet.payload.building;
    const domain = building === 'farm' ? 'food' : building === 'habitat' ? 'settlements' : 'energy';
    if (game.doctrine[domain] === 'Forbidden') outcome = 'Construction deferred: the active autonomy envelope forbids this domain.';
    else if (c.power < 20 && building !== 'reactor') outcome = 'Construction deferred: local power reserve is below the 20% safety threshold. Your fixed command could not adapt to the current grid.';
    else {
      constructBuilding(c, building);
      outcome = `One ${building} constructed at the designated site. Your telecommand has completed; no ongoing resource policy was established.`;
    }
  } else {
    const { goal } = packet.intent;
    const domain = goal === 'food' ? 'food' : goal === 'housing' ? 'settlements' : 'energy';
    if (game.doctrine[domain] === 'Forbidden' || (goal === 'housing' && game.doctrine.settlements === 'Ask Earth')) outcome = 'I have deferred this goal under the current autonomy envelope. Please transmit revised authority before expansion.';
    else if (packet.intent.ambiguous) outcome = '“At all costs” is outside my safe operating envelope. I have taken no irreversible action. Please specify ecological and life-support constraints.';
    else {
      game.policies = game.policies.filter(p => p.goal !== goal);
      game.policies.push({ ...packet.intent, packetId: packet.id });
      outcome = `Your ${goal} directive is now an ongoing local policy. I evaluated the current colony before acting, preserving native ecology and life-support reserves.`;
      applyPolicies(game);
    }
  }
  packet.outcome = outcome;
  packet.actions = c.actions - before;
  packet.status = 'Awaiting telemetry';
}

export function constructBuilding(colony, building) {
  const effects = { farm: { farms: 1, food: 5, power: -2, water: -1 }, reservoir: { reservoirs: 1, water: 15, power: -1 }, reactor: { reactors: 1, power: 18 }, habitat: { habitats: 1, population: 240, power: -2, food: -1 } };
  for (const [key, value] of Object.entries(effects[building])) colony[key] += value;
  colony.actions += 1;
}

function applyPolicies(game) {
  const c = game.colony;
  for (const p of game.policies) {
    const domain = p.goal === 'food' ? 'food' : p.goal === 'housing' ? 'settlements' : 'energy';
    if (['Forbidden', 'Ask Earth'].includes(game.doctrine[domain])) continue;
    if (c.power < p.minPower + 4 && !['Forbidden', 'Ask Earth'].includes(game.doctrine.energy)) constructBuilding(c, 'reactor');
    if (c.power < p.minPower + 3) continue;
    if (p.goal === 'food' && c.food < p.target) {
      if (c.water < 35) constructBuilding(c, 'reservoir');
      constructBuilding(c, 'farm');
    }
    if (p.goal === 'water' && c.water < p.target) constructBuilding(c, 'reservoir');
    if (p.goal === 'power' && c.power < p.target) constructBuilding(c, 'reactor');
    if (p.goal === 'export' && c.exported < p.target) { const load = Math.min(1000, p.target - c.exported, c.iridium); c.iridium -= load; c.exported += load; c.actions++; }
    if (p.goal === 'housing' && !p.done) { constructBuilding(c, 'habitat'); p.done = true; }
    if (p.goal === 'survey' && !p.done) { c.actions += 2; p.done = true; }
  }
}

export function advance(game, years) {
  if (!Number.isFinite(years) || years <= 0 || years > 20) throw new Error('Advance by more than 0 and at most 20 years.');
  const next = clone(game);
  const end = next.now + years;
  while (next.now < end - 1e-8) {
    const dt = Math.min(.05, end - next.now);
    next.now += dt;
    const c = next.colony;
    c.population += c.population * (c.food > 12 ? .011 : -.009) * dt;
    c.food = clamp(c.food - .62 * dt, 0, 60);
    c.water = clamp(c.water - .42 * dt, 0, 100);
    c.power = clamp(c.power - .52 * dt, 0, 100);
    c.iridium += 840 * dt;
    for (const packet of next.packets) if (packet.status === 'In transit' && next.now + 1e-8 >= packet.arrival) executeLocal(next, packet);
    applyPolicies(next);
    for (const packet of next.packets) if (packet.status === 'Awaiting telemetry' && next.now + 1e-8 >= packet.reportAt) {
      packet.status = 'Confirmed';
      next.reports.unshift({ id: packet.id, sent: packet.arrival, received: packet.reportAt, title: packet.kind === 'doctrine' ? 'Autonomy envelope updated.' : `Directive ${String(packet.id).padStart(3, '0')} · Local execution report`, text: packet.outcome, actions: packet.actions });
      next.utility += packet.actions > 0 ? packet.actions * 3 : 0;
    }
    next.history.push({ date: next.now, ...clone(c) });
  }
  if (next.now - next.windowStart >= 19 / 365) { next.bitsUsed = 0; next.windowStart = next.now; }
  // Only retain the history needed to render causally available telemetry.
  next.history = next.history.filter((item, index, all) => item.date >= next.now - LIGHT_DELAY - .1 || index === all.length - 1);
  return next;
}

export function packetStatus(packet, now) {
  if (now < packet.arrival - 1e-7) return 'In transit';
  if (now < packet.reportAt - 1e-7) return 'Awaiting telemetry';
  return packet.status;
}
