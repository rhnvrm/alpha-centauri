import { LIGHT_DELAY_DAYS, LIGHT_DELAY_YEARS } from './constants.js';

const localEventBoundaryLabel = (state, day) => {
  const packet = state.packets.find((candidate) => candidate.status === 'in-transit' && candidate.arrivalDay === day);
  if (packet) {
    const names = { 'mission-result': 'MISSION RESULT RECEIPT', telemetry: 'TELEMETRY RECEIPT', 'cargo-order': 'CARGO ORDER ARRIVAL', intent: 'INTENT ARRIVAL' };
    return names[packet.kind] || `${packet.kind.toUpperCase()} ARRIVAL`;
  }
  const job = state.jobs.find((candidate) => ['queued', 'active', 'awaiting-labor'].includes(candidate.status) && candidate.completeDay === day);
  if (job) return ({ cargo: 'CARGO LAUNCH', survey: 'SURVEY COMPLETE', construct: 'CONSTRUCTION COMPLETE', road: 'ROAD COMPLETE' }[job.type] || `${job.type.toUpperCase()} COMPLETE`);
  const authored = state.pendingEvents.find((candidate) => candidate.day === day);
  if (authored) return ({ 'survey-discovery': 'SURVEY DISCOVERY', 'power-outage': 'POWER INTERRUPTION', flood: 'FLOOD WINDOW', drought: 'DROUGHT WINDOW', 'equipment-fault': 'EQUIPMENT FAULT', 'life-support-fault': 'LIFE-SUPPORT FAULT' }[authored.type] || authored.type.toUpperCase());
  if (state.mission.deadlineDay === day) return 'MISSION DEADLINE';
  if (state.mission.sustainDays === day) return 'RESERVE CHECK';
  return 'NEXT LOCAL BOUNDARY';
};

/** Copy for time controls. Earth must not disclose Daneel's unreceived local schedule. */
export const eventControlCopy = (state, { local = false, nextLocalBoundary, nextEarthBoundary } = {}) => {
  if (!local) {
    return {
      next: 'NEXT EVENT',
      earth: nextEarthBoundary === null ? 'EARTH: NO RECEIPT AHEAD' : 'RECEIVE: NEXT EARTH RECEIPT',
    };
  }
  return {
    next: `NEXT: ${localEventBoundaryLabel(state, nextLocalBoundary)} · DAY ${nextLocalBoundary}`,
    earth: nextEarthBoundary === null
      ? 'EARTH: NO RECEIPT AHEAD'
      : `RECEIVE: ${localEventBoundaryLabel(state, nextEarthBoundary)} · DAY ${nextEarthBoundary}`,
  };
};

/** The status Earth may honestly display without peeking at Daneel's local state. */
export const earthMissionStatus = (state) => state.mission.earthOutcome
  ? { label: 'COMPLETE · CONFIRMED', complete: true }
  : { label: 'IN PROGRESS · OBSERVED', complete: false };

/**
 * Earth-safe relay activity for the command desk.
 *
 * This is intentionally a projection of only the public connection lease and
 * packet lifecycle. It does not inspect jobs, resources, local events, packet
 * kinds, payloads, targets, or dates, so activity can be legible without
 * turning an unreceived Daneel action into an Earth-side fact. `status` is a
 * small render contract: disconnected | packet-in-flight | awaiting-report |
 * relay-ready.
 */
export const earthRelayActivity = (state) => {
  if (state.connection?.status !== 'connected') {
    return {
      status: 'disconnected',
      label: 'RELAY DISCONNECTED',
      detail: 'No active Daneel connection is visible to Earth.',
      inFlight: 0,
      awaitingReport: false,
    };
  }

  const packets = Array.isArray(state.packets) ? state.packets : [];
  const inFlight = packets.filter((packet) => packet.status === 'in-transit').length;
  if (inFlight) {
    return {
      status: 'packet-in-flight',
      label: 'PACKET IN FLIGHT',
      detail: 'A relay packet is crossing the light-delay.',
      inFlight,
      awaitingReport: false,
    };
  }

  // Packet order is sufficient here and avoids using local/arrival dates. An
  // Earth-authored packet that has arrived at Daneel likewise means the desk
  // may honestly wait for a corresponding report.
  const latestDelivered = [...packets].reverse().find((packet) => packet.status === 'delivered');
  const awaitingReport = latestDelivered?.direction === 'uplink';
  return awaitingReport
    ? {
        status: 'awaiting-report',
        label: 'RELAY READY · AWAITING REPORT',
        detail: 'Daneel is connected; Earth is waiting for the next downlink.',
        inFlight: 0,
        awaitingReport: true,
      }
    : {
        status: 'relay-ready',
        label: 'DANEEL STANDING BY · AWAITING EARTH DIRECTIVE',
        detail: 'Daneel is connected, but local work cannot begin until Earth sends an intent across the gap.',
        inFlight: 0,
        awaitingReport: false,
      };
};

// Alias kept descriptive for callers that name projections by their Earth
// surface rather than by the relay component.
export const earthActivityProjection = earthRelayActivity;

export const earthProjection = (state) => ({
  localDay: state.localDay,
  observedDay: state.telemetry.captureDay,
  observationLabel: state.telemetry.label,
  resources: state.observedResources,
  constraints: state.observedConstraints || [],
  reports: state.reports.filter((r) => r.receivedDay <= state.localDay),
  // Earth knows its own uplinks immediately. A local downlink is not visible until
  // it has physically arrived, even if the simulation has already scheduled it.
  packets: state.packets
    .filter((p) => p.direction === 'uplink' || p.arrivalDay <= state.localDay)
    .map(({ id, kind, direction, bits, windows, bytes, createdDay, departureDay, arrivalDay, status }) => ({ id, kind, direction, bits, windows, bytes, createdDay, departureDay, arrivalDay, status })),
});

/** The newest packet Earth can actually read, including the confirming result. */
export const earthRelayHero = (state) => {
  const reports = (state.reports || [])
    .filter((report) => report.receivedDay <= state.localDay)
    .map((report) => ({ ...report, earthReceivedDay: report.receivedDay }));
  const missionResults = (state.packets || [])
    .filter((packet) => packet.direction === 'downlink' && packet.kind === 'mission-result' && packet.arrivalDay <= state.localDay)
    .map((packet) => ({ ...packet, receivedDay: packet.arrivalDay, earthReceivedDay: packet.arrivalDay }));
  return [...reports, ...missionResults]
    .sort((a, b) => b.earthReceivedDay - a.earthReceivedDay || String(b.id).localeCompare(String(a.id)))[0] || null;
};

/** The confirmed result is the only Earth-authorized source for the terminal debrief. */
export const earthMissionDebrief = (state) => {
  const result = earthRelayHero(state);
  if (!result || result.kind !== 'mission-result' || !result.payload?.evidence) return null;
  const { missionId, evidence } = result.payload;
  const goals = missionId === 'firstLight'
    ? [
        ['capacity', evidence.capacity >= 100, `${Math.round(evidence.capacity)}/100 residents of life-support capacity`],
        ['independentPower', evidence.independentPower >= 2, `${evidence.independentPower} independent power sources`],
        ['interruption', evidence.interruptionDays >= 180, evidence.interruptionDays >= 180 ? `${evidence.interruptionDays}-day interruption survived` : 'Interruption not survived'],
      ]
    : missionId === 'enough'
      ? [
          ['foodReserve', evidence.foodMonths >= 24, `${evidence.foodMonths.toFixed(1)} months of food reserve`],
          ['powerReserve', evidence.powerPercent >= 20, `${Math.round(evidence.powerPercent)}% power reserve`],
          ['protectedWetlands', evidence.protectedWetlandLoss === 0, `${evidence.protectedWetlandLoss} protected wetland cells lost`],
        ]
      : [
          ['export', evidence.exported >= 1000, `${Math.round(evidence.exported)} t iridium exported`],
          ['lifeSupport', evidence.lifeSupport, evidence.lifeSupport ? 'Life support remained online' : 'Life support collapsed'],
          ['habitat', evidence.protectedHabitatLoss === 0, `${evidence.protectedHabitatLoss} protected habitat cells lost`],
        ];
  return {
    outcome: result.payload.outcome,
    capturedDay: result.payload.capturedDay,
    receivedDay: result.arrivalDay ?? result.receivedDay,
    snapshot: result.payload.snapshot || null,
    goals: goals.map(([id, achieved, value]) => ({ id, achieved, value })),
  };
};

/**
 * A deliberately conservative play guide.  Every branch is based on facts on
 * the Earth desk: the charter, this browser's Daneel connection, packets that
 * Earth authored, or packets that have already arrived.  In particular it
 * never inspects local jobs, resources, or the unreceived mission result.
 */
export function earthDemoGuide(state) {
  const projection = earthProjection(state);
  const reports = projection.reports;
  const uplinks = projection.packets.filter((packet) => packet.direction === 'uplink');
  const questions = (state.pendingQuestions || []).filter((question) => !question.answered);

  if (state.mission.earthOutcome) {
    return { phase: 'COMPLETE', index: 4, action: 'debrief', title: 'Review the confirmed outcome', detail: 'This result arrived on Earth; it is no longer an inference.' };
  }
  if (questions.length) {
    return { phase: 'DECISION', index: 4, action: 'answer', title: 'Answer Daneel’s received question', detail: 'Your reply is an uplink and will still take one light-delay to reach the colony.' };
  }
  if (state.connection?.status !== 'connected') {
    return { phase: '01 / 04', index: 1, action: 'daneel', title: 'Deploy Daneel with the day-zero charter', detail: 'Copy the startup prompt into a supported ChatGPT Desktop task. Daneel acts locally through WebMCP; Earth does not receive a live feed.' };
  }
  if (!state.demoPace) {
    return { phase: '02 / 04', index: 2, action: 'pace', title: 'Start the simulation clock', detail: 'Choose 1×, 2×, 5×, or 10×. Local work slows into visible beats; quiet light-speed transit cruises. It never chooses for Daneel.' };
  }
  if (!reports.length) {
    return { phase: '03 / 04', index: 3, action: 'wait', title: 'Let the first downlink cross the gap', detail: 'Keep the simulation clock running. The desk announces a transmission only when it physically reaches Earth; do not treat silence as a colony report.' };
  }
  if (!uplinks.length) {
    return { phase: '04 / 04', index: 4, action: 'intent', title: 'Reply with one focused Earth intent', detail: 'Use the received report to state a constraint or priority. A mouse order is also an uplink, so send it only from the received map.' };
  }
  return { phase: '04 / 04', index: 4, action: 'wait', title: 'Keep the relay loop moving', detail: 'Daneel has the charter and your packet is in the light-delay. The speed controls make the round trip watchable without skipping it.' };
}
export const lightCopy = `${LIGHT_DELAY_YEARS} years one way · ${LIGHT_DELAY_DAYS} simulation days`;
