# Two-Sided Playtest Loop

Every gameplay change begins with a complete, real playthrough in the in-app
browser. The test must use the same localStorage session and native WebMCP tools
that a player and Daneel use; unit tests are supporting evidence, not a substitute.

Before the first run, follow the [native Browser and Daneel runbook](NATIVE-PLAYTHROUGH-RUNBOOK.md) to claim the exact tab and complete the first-turn authority gate.

## Roles

- **Earth player:** reads only received telemetry, sets time speed, sends intent
  packets or literal delayed orders, and decides when uncertainty is acceptable.
- **Daneel:** connects through the tab's WebMCP tools, reads doctrine and inbox,
  inspects local state, acts only within standing authority, and reports material
  outcomes across the light-delay.

## Loop

1. Start a clean mission and state the mission's success condition.
2. Play Earth until Daneel is deployed; record the first decision that is unclear
   or too slow.
3. Play Daneel through native WebMCP: inspect, decide, write, re-inspect, and
   yield control. Never use DOM or direct store writes to stand in for Daneel.
4. Switch back to Earth and advance only with visible speed, Next Event, or Earth
   Event controls. Read the actual delayed report.
5. Repeat the two roles until the mission resolves and Earth receives confirmation.
6. Write observed friction to a todo with: role, moment, expected understanding,
   actual result, and the smallest candidate fix. Do not change gameplay mid-run
   unless it is a hard blocker.
7. After the debrief, group independent fixes and dispatch them as parallel Luna
   implementation tasks. Terra remains responsible for live WebMCP regression
   playtesting and final integration.

## Completion evidence

A run is complete only when the in-app browser shows a mission outcome that has
arrived at Earth. Record the session id, outcome, critical packets, and every
open todo before implementation begins.
