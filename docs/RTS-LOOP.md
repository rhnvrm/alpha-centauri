# The Intent Horizon RTS loop

The playable unit is not a building click. It is a constrained civilization loop:

> **Set intent → simulate → observe a constraint → diagnose → reconfigure → expand or survive → receive the consequence.**

## Two coupled roles

| Earth (human) | Daneel (local agent) |
| --- | --- |
| Sets bounded priorities and hard floors | Observes current local truth |
| Receives compressed, delayed telemetry | Diagnoses the binding constraint |
| Revises policy after consequences arrive | Builds, routes, allocates, and monitors within authority |
| Can send literal but slow spatial orders | Requests authority only when the doctrine cannot decide |

The light delay is not a pause between turns. It is why a robust policy is more valuable than a perfect mouse command.

## Demo-scale production loop

For the three-mission demo, each scenario should expose one readable equilibrium that can become unstable:

1. **First Light — resilience:** population and life-support demand outgrow a single power source; build redundant grid capacity before an interruption.
2. **Meaning of Enough — carrying capacity:** food/water production, protected terrain, and settlement demand compete; grow without consuming the ecological floor.
3. **Right to Decide — logistics:** survey route choices, mining output, cargo hauling, and export deadline compete; earn the export without sacrificing the colony.

## Player-facing cadence

1. A clear next action names the current constraint, not merely a building category.
2. The map and resource HUD show a symptom: unserved demand, a bottlenecked route, depleted reserve trend, unsurveyed opportunity, or an approaching deadline.
3. Daneel's local tools turn an intent into small causal decisions; working vehicles make those decisions legible.
4. A receipt tells Earth what changed, why, and which constraint is next.

## Implementation guardrails

- Avoid fake complexity. Every visible resource, rover, road, and warning must affect at least one decision or outcome.
- Make each constraint diagnosable before it becomes fatal; a player should be able to see an actionable cause, not only a loss screen.
- Fog of war gives surveying an information role. Causal vehicles give logistics a physical role. Resource trends give policies a temporal role.
- An outcome must report its colony capture day and Earth receipt day, so the player can understand which decision was made with stale information.
