export const DAYS_PER_YEAR = 365;
export const LIGHT_DELAY_DAYS = 1595;
export const LIGHT_DELAY_YEARS = (LIGHT_DELAY_DAYS / DAYS_PER_YEAR).toFixed(2);
export const SAVE_KEY = 'intent-horizon-save-v1';
export const SAVE_VERSION = 1;
export const MAP_SIZE = 32;

// Communications: one transmission window per local day, per direction.
// Application payload capacity per window and a small disclosed envelope overhead.
export const WINDOW_BITS = 2800;
export const WINDOW_DAYS = 1;
export const ENVELOPE_BITS = 96;
export const bitsForPayload = (payload) => ENVELOPE_BITS + new TextEncoder().encode(JSON.stringify(payload)).length * 8;
export const windowsFor = (bits) => Math.max(1, Math.ceil(bits / WINDOW_BITS));

export const BUILDINGS = {
  habitat: { label: 'Habitat', footprint: [2, 2], cost: 18, labor: 20, days: 90, color: 0xd9d4ba },
  solar: { label: 'Solar Array', footprint: [2, 2], cost: 12, labor: 12, days: 55, color: 0x477e8b },
  battery: { label: 'Battery Bank', footprint: [1, 1], cost: 10, labor: 10, days: 45, color: 0x5c6b68 },
  greenhouse: { label: 'Hydroponic Greenhouse', footprint: [3, 2], cost: 22, labor: 24, days: 110, color: 0x78b4aa },
  reservoir: { label: 'Reservoir', footprint: [2, 2], cost: 16, labor: 16, days: 80, color: 0x4b858a },
  workshop: { label: 'Workshop', footprint: [2, 1], cost: 20, labor: 20, days: 100, color: 0xb78355 },
  mine: { label: 'Iridium Mine', footprint: [2, 2], cost: 30, labor: 30, days: 150, color: 0x8a7760 },
  launch: { label: 'Launch Pad', footprint: [3, 2], cost: 28, labor: 26, days: 135, color: 0xb78355 },
};

export const TOOL_NAMES = [
  'connect_steward', 'read_inbox', 'inspect_colony', 'read_doctrine',
  'construct_building', 'send_report', 'yield_control', 'wait_for_event',
  'survey_region', 'build_road', 'assign_robots', 'inspect_resource_network',
  'modify_production', 'set_power_priority', 'schedule_maintenance',
  'register_policy', 'request_authorization', 'launch_cargo',
];

// Mission II shared codebook: the definition is transmitted in-band once;
// later references to the version are short because both sides possess it.
export const RESILIENCE_24 = {
  name: 'RESILIENCE-24', version: 1, reference: 'RESILIENCE-24/v1',
  body: 'Maintain food reserve >= 24 months; power reserve >= 20%; protected wetland loss = 0; prefer existing clusters; every intervention reversible; request Earth review when a floor is at risk.',
};

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
