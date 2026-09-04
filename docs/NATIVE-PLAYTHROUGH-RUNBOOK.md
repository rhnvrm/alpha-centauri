# Native Browser and Daneel Runbook

Use this runbook for a real Earth-and-Daneel playthrough. It is a browser-host
integration guide, not an alternate game API. The colony must still be changed
only through the page's registered WebMCP tools.

## Before play

1. Start or resume the mission in one in-app Browser tab. Its `localStorage`
   session belongs to that browser profile; do not open a second writer tab.
2. In the Codex task, select or mention that exact tab. A tab mention must match
   the available Browser session and its provider tab ID, title, and URL before
   it can be claimed. A tab owned by another task session is unavailable, not a
   reason to take over a different user tab.
3. Discover the tab's native `webmcp` capability and print its tool list. A
   successful page load is not proof that the agent can use site tools.
4. If the browser bridge itself is missing, stop and report the host limitation.
   Do not use the DOM, localStorage, a second page, an HTTP endpoint, or engine
   internals as a substitute. The repository's
   [`browser-webmcp-recovery`](../skills/browser-webmcp-recovery/SKILL.md)
   skill covers the narrow service-only-cache failure observed in the desktop
   host.

## Daneel's first turn

The visible **Daneel prompt** is the authoritative source for the current
session ID. With the tab's native WebMCP tools:

1. Call `connect_steward(sessionId, "v1")`; retain its lease ID and revision.
2. In order, call `read_doctrine`, `read_inbox`, `inspect_colony`, and
   `inspect_resource_network`.
3. Treat the local inspector—not the Earth map—as current truth. Capture the
   local revision before every write and use one unique operation ID per logical
   write.
4. If no Earth intent is delivered, leave construction, survey, movement,
   production, road, maintenance, and export tools untouched. A short
   connection/risk report may be queued, then the steward re-inspects and waits.
5. On a delivered intent, state the smallest local plan, acknowledge the exact
   message through `yield_control`, re-inspect, perform only the authorized
   action, verify it, and queue a concise `plan` report with `declaredFocus`.

## Full Earth ↔ Daneel loop

1. Earth sends one bounded intent through the visible composer and advances only
   with the visible clock/event controls.
2. Daneel reads the message only after `read_inbox` shows it delivered. He does
   not infer authority from a day-zero charter or Earth’s stale map.
3. Daneel handles the exact message IDs, performs and verifies the narrow local
   response, then calls `yield_control` with the event cursor.
4. Earth waits for the actual delayed report/telemetry packet and evaluates its
   capture day, Earth receipt day, and debrief before declaring the mission
   secure.

`wait_for_event` is bounded. If the host transport times out before the page's
20-second maximum, retry only with a shorter wait; a host timeout is not a
colony event. Do not claim continuous monitoring once the host task ends.

## Live evidence, 2026-09-04

In the in-app Browser, a controlled Earth Command tab exposed all 19 native
WebMCP tools. Daneel connected to First Light, read doctrine and an empty inbox,
inspected the colony and resource network, queued a concise connection/risk
report, re-inspected the committed revision, and performed no unauthorized
local work. The host accepted a 10-second bounded wait; a 20-second browser
evaluation hit the host transport ceiling. This proves the native tool path,
not an unattended monitoring service or a completed mission.
