import { LIGHT_DELAY_DAYS, LIGHT_DELAY_YEARS } from './constants.js';
/** The status Earth may honestly display without peeking at Daneel's local state. */
export const earthMissionStatus = (state) => state.mission.earthOutcome
  ? { label: 'COMPLETE · CONFIRMED', complete: true }
  : { label: 'IN PROGRESS · OBSERVED', complete: false };

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
