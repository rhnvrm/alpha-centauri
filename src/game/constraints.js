import { SOLAR_OUTPUT_PER_DAY } from './constants.js';
import { gridConsumers, powerSources } from './networks.js';

const months = (stock, dailyUse) => stock / Math.max(.001, dailyUse) / 30;
const severity = (score) => score >= 80 ? 'critical' : score >= 50 ? 'urgent' : score >= 20 ? 'watch' : 'stable';
const active = (job) => !['complete', 'cancelled'].includes(job.status);

/** Small, live diagnoses: each one names a visible symptom, causal condition, and remedy. */
export function diagnoseConstraints(state) {
  const r = state.resources;
  const demand = r.population * .01 + gridConsumers(state).length * .12;
  const outage = new Set((state.pendingEvents || [])
    .filter((e) => ['power-outage', 'equipment-fault', 'life-support-fault'].includes(e.type) && state.localDay >= e.day && state.localDay < e.day + e.days)
    .flatMap((e) => e.sources || (e.facility ? [e.facility] : [])));
  const supply = powerSources(state).filter((source) => !outage.has(source.id)).reduce((total, source) => total + (source.type === 'solar' ? SOLAR_OUTPUT_PER_DAY : 0), 0);
  const reserve = r.powerCapacity ? r.power / r.powerCapacity : 0;
  const powerScore = reserve < .2 ? 90 : supply < demand ? 65 : state.missionId === 'firstLight' && powerSources(state).length < 2 ? 40 : 0;
  const constraints = [];
  if (powerScore) constraints.push({ id: 'power-reserve', severity: severity(powerScore), score: powerScore,
    symptom: `Power reserve ${Math.round(reserve * 100)}%; ${supply.toFixed(2)} supply/day versus ${demand.toFixed(2)} demand/day.`,
    cause: outage.size ? 'A connected power source is unavailable.' : supply < demand ? 'Connected generation is below current demand.' : 'Only one connected power source can carry the interruption.',
    remedy: state.missionId === 'firstLight' ? 'Add a connected solar array or battery before the interruption.' : 'Restore or add connected power capacity before the reserve floor is crossed.' });

  const foodMonths = months(r.food, r.population * .02); const waterMonths = months(r.water, r.population * .03);
  const foodRate = state.buildings.filter((b) => b.status === 'complete' && b.type === 'greenhouse').length * (state.flows?.foodPerGreenhouse || 2) - r.population * .02;
  const waterRate = state.buildings.filter((b) => b.status === 'complete' && b.type === 'reservoir').length * (state.flows?.waterPerReservoir || 3) - r.population * .03;
  const reserveScore = Math.min(foodMonths, waterMonths) < 12 ? 85 : Math.min(foodMonths, waterMonths) < 24 ? 55 : (foodRate < 0 || waterRate < 0) ? 20 : 0;
  if (reserveScore || state.missionId === 'enough') constraints.push({ id: 'life-support-reserve', severity: severity(reserveScore), score: reserveScore,
    symptom: `Food ${foodMonths.toFixed(1)} months and water ${waterMonths.toFixed(1)} months; trends ${foodRate.toFixed(2)} and ${waterRate.toFixed(2)} units/day.`,
    cause: foodRate < 0 || waterRate < 0 ? 'Production is below population use.' : 'The reserve floor is held, but must survive the mission window.',
    remedy: foodRate < 0 ? 'Restore greenhouse output or add connected food production.' : waterRate < 0 ? 'Restore reservoir output or add connected water production.' : 'Keep food, water, and power above their reserve floors.' });

  const blocked = state.jobs.filter((job) => active(job) && job.status === 'awaiting-labor')[0];
  const longRoute = state.jobs.filter(active).sort((a, b) => (b.travelDays || 0) - (a.travelDays || 0))[0];
  if (blocked || (longRoute && (longRoute.travelDays || 0) >= 20)) constraints.push({ id: 'job-route-bottleneck', severity: blocked ? 'urgent' : 'watch', score: blocked ? 60 : 25,
    symptom: blocked ? `${blocked.type} job ${blocked.id} is waiting for its required robot.` : `${longRoute.type} job ${longRoute.id} has ${longRoute.travelDays} route-days before work starts.`,
    cause: blocked ? 'The matching specialist is busy or unavailable.' : 'The active job’s physical route consumes the remaining schedule.',
    remedy: blocked ? 'Finish, cancel, or reassign the competing robot job.' : 'Protect the assigned route and avoid adding work to its robot.' });

  if (state.missionId === 'rightToDecide') {
    const committed = state.jobs.filter((job) => active(job) && job.type === 'cargo').reduce((sum, job) => sum + (job.quantity || 0), 0);
    const remaining = Math.max(0, 1000 - (state.mission.exported || 0) - committed); const days = Math.max(0, (state.mission.deadlineDay || state.localDay) - state.localDay);
    const score = remaining > 0 && days <= 90 ? 90 : remaining > 0 ? 45 : 0;
    if (score) constraints.push({ id: 'export-deadline', severity: severity(score), score,
      symptom: `${Math.round(state.mission.exported || 0)} / 1000 t exported; ${Math.round(remaining)} t is not committed with ${days} days left.`,
      cause: committed ? 'Committed cargo does not yet cover the export target.' : 'No cargo launch currently covers the export gap.',
      remedy: 'Accumulate iridium and schedule cargo from the completed launch pad before the 90-day launch cycle becomes fatal.' });
  }
  return constraints.sort((a, b) => b.score - a.score).slice(0, 3);
}
