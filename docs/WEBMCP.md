# Daneel-first WebMCP contract

Status: application contract and integration boundary. The browser-side registration adapter and game tool surface are implemented locally; native Desktop/subagent gameplay remains unverified and must pass the integration spike before the demo claims full live-agent support.

## What is documented versus what remains to prove

OpenAI's [Site tools documentation](https://learn.chatgpt.com/docs/webmcp), checked 2026-09-03, describes top-level JavaScript tool registration using `document.modelContext.registerTool`. It does not support iframe-registered or declarative-form tools in the built-in browser. Availability depends on client, model, workspace, and rollout; the page currently names Sol/Terra support and excludes Luna and Enterprise/Edu. Detect support rather than inferring it from the user agent.

OpenAI's [Subagents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents), checked the same day, documents explicitly requested delegation. These two documents do not establish that our game session, long-poll behavior, and subagent tool access work together uninterrupted. That is an acceptance test, not a fact to assume in onboarding.

The design follows the distinction described by [Chrome's tool-design guidance](https://developer.chrome.com/docs/ai/webmcp/build-tools): tools should support user goals, expose relevant context and boundaries, and return actionable failures. Our game-specific rules below are original design choices, not requirements imposed by WebMCP.

## A webpage with two viewpoints, not two simulations

One browser-side engine owns current state, integer time, messages, jobs, authority, and an event log. Its versioned localStorage save is the only durable state. React/Three renders an Earth projection; WebMCP exposes Daneel's local projection. Do not create a second copy of the colony for the agent, a remote state service, or a separate MCP server. The static site has no application backend. Persistence details are specified in `LOCAL-STATE.md`.

```text
Earth UI → packet queue → [light delay] → local command executor
                                     ↗               ↓
Daneel → WebMCP → delivered inbox + local state → jobs / policies
                                     ↓
                     downlink queue → [light delay] → Earth UI
```

No arbitrary `eval`, shell, DOM-click, `set_state`, `win_level`, or `solve_mission` tool. The agent performs gameplay, not source-code changes. An external model API is not required; the user's desktop agent supplies reasoning.

The renderer must use an Earth-projection selector, not expose current state in a hidden element. Agent-facing data stays in the tool result and engine module. This is causal game logic, not a security boundary against a user with developer tools or access to the agent task. Debugging the local world visibly marks a run assisted.

## Session and connection lifecycle

1. New Game creates a random session ID in this browser origin's localStorage with the local clock ready. Visible automatic playback begins when Daneel connects or Earth deliberately selects a pace; this is not an in-world pause. The player receives a session-specific fragment URL and startup prompt. Session IDs identify games, not secret credentials; the URL does not transfer a save to another browser/profile/device. Reuse the existing owning game tab rather than opening another writer.
2. The copied prompt asks the parent to start exactly one Daneel coordinator and sole gameplay writer. Daneel may use up to two bounded read-only planning helpers, fed only delivered instructions and local tool results. They receive no writer lease, do not connect independently, create no competing inbox waiters, and do not recursively delegate. No software-building agents.
3. `connect_steward` validates protocol version and selected session, acquires an exclusive expiring writer lease, and returns the current public mission charter, local date, delivered inbox cursor, valid tools, and resource/authority schema.
4. The first successful handshake—not opening the prompt—sets **Daneel connected**.
5. The subagent calls `read_inbox` and `inspect_colony`; delivered bootstrap charter is available locally from day zero. Only the human's in-game intent changes that charter or adds objectives.
6. The engine schedules a decision checkpoint when instructions arrive, a policy needs reconsideration, or a local event invalidates a plan.
7. The agent inspects, performs bounded local actions, optionally sends a report, and calls `yield_control`. The call durably records specific handled-message IDs, explicit pending decisions, and the processed event cursor. Inbox reads alone never acknowledge work as handled.
8. A single outstanding `wait_for_event(cursor, timeoutMs <= 20000)` returns immediately on new work, otherwise times out without advancing simulation time. Avoid repeated state dumps and rapid polling. Tool results tell the caller whether further waiting is useful.
9. `yield_control` can resume a decision checkpoint only if the player has not manually paused. It never changes the selected time speed or crosses a mission boundary.
10. Stop at the mission boundary. The user explicitly chooses the next mission; the parent may then resume the same Daneel task with the new session/mission identity.

Connection states: **not connected**, **connected / waiting**, **deciding / checkpoint**, **reconnect needed**, **mission ended**. Agent lease and heartbeat measure control availability; they are not in-universe radio messages or score-bearing payload.

When a tool wait or agent turn ends, the page cannot independently spawn a new turn. Show **Resume Daneel** with a copyable continuation prompt. If a client cannot expose WebMCP to the subagent, explain it and request a supported client/model or an explicitly labeled single-agent session. Never silently run a mock steward.

### Code-assisted inbox loop

The user's startup prompt explicitly permits JavaScript, Python, or another available host runtime to orchestrate the gameplay loop. This is host-side coordination around native site-tool calls, not a permission to read localStorage directly, inject scripts, create another browser connection, or build a backend. The chosen runtime must expose a documented, already-authorized way to invoke this page's WebMCP tools. A bare Python interpreter does not automatically have that capability. If unavailable, use direct host tool calls.

Logical cycle (not a runnable API example):

```text
recover durable inbox/event cursors, pending decisions, and operation receipts
while this mission and the host's cancellable run are active:
    read newly delivered inbox pages and current actionable local events
    if there is new work or a decision checkpoint:
        return from the waiting script to Daneel's reasoning context
        inspect → plan (optional read-only helpers) → execute → verify
        queue a useful downlink report, if warranted
        yield_control(handled message IDs, pending decisions, event cursor)
    wait_for_event(event cursor, bounded timeout)
    on timeout: quietly continue waiting, within host execution limits
on termination: cancel waiter/helpers and show an honest resume state
```

Inbox and event cursors are independent. A high event sequence number must not skip lower-numbered mail. Make `wait_for_event` check for unprocessed actionable events and install its subscription without a lost-wakeup gap. Work arriving between the last read and the next wait must return immediately. Cosmetic ticks, health checks, and the watcher's own bookkeeping must not cause wakeup storms.

Single-waiter enforcement is engine-side, even if duplicate host loops accidentally start. Cancellation, tab closure, lease loss, reset, or mission end resolves/rejects pending waits and invalidates their session identity. Transient transport retry is bounded; a denied action or stale session requires appropriate recovery, not aggressive retries.

The monitoring program is transport/scheduling glue. It must yield events back to a real reasoning agent rather than inventing a callable `think()` function or invoking a new model API. A process continuing to poll after the model's turn ends is not evidence of an active steward. Any supported host continuation must be verified; otherwise stop and use the explicit resume prompt. Do not install OS schedulers or recurring product tasks as part of this prompt.

The official documentation linked above confirms the underlying site-tool and subagent features, not universal Python/JavaScript tool bindings or indefinite runs. Those remain client-specific integration checks.

## Tool surface

Every write takes `sessionId`, `leaseId`, `expectedRevision`, and `operationId`. These are local consistency identifiers, not server authentication tokens. `operationId` is a caller-chosen unique idempotency key. Repeat the same key for an uncertain retry; return the original result, not another job. Reusing a key with different arguments is a validation error. Check keys before revision rejection to make committed retries recoverable, but only after validating the current session and runtime lease. Persist the state change and its receipt together before reporting success.

Reads use `sessionId`; agent-only reads also require the active `leaseId`. The lease prevents accidentally controlling the wrong or reset session. It does not authenticate the fiction of a physically remote AI.

| Tool | Purpose and bounded input | Outcome / restrictions |
| --- | --- | --- |
| `connect_steward` | session ID, protocol version, agent label | Exclusive lease and bootstrap data; cannot steal a live lease |
| `read_inbox` | delivered-message cursor, limit ≤ 20 | Only delivered items, next cursor; reading is not destructive |
| `inspect_colony` | optional entity IDs, section selector | Current local entities, resources, jobs, objectives; no future scripted events |
| `inspect_resource_network` | power/water/food, optional region | Current graph, production, demand, bottlenecks, reserve estimates |
| `read_doctrine` | optional delivered version | Authority, hard constraints, preferences, known protocol definitions |
| `survey_region` | bounded rectangle or region ID, available robot IDs | Schedules survey job; discoveries occur on completion, not instantly |
| `construct_building` | unlocked type, tile, orientation, optional dependency job IDs | Schedules a costed construction job; no teleported completed building |
| `build_road` | bounded tile path, robot IDs | Validates path and resources; schedules connectivity work |
| `move_robot` | one idle rover ID, safe local tile | Schedules a physical tile-by-tile travel job; rejects a busy rover or invalid destination |
| `assign_robots` | available robot IDs, job ID | Assigns feasible local labor; rejects unavailable or duplicate workers |
| `modify_production` | facility ID, bounded rate | Applies permitted rate; observes capacity and reserve floors |
| `set_power_priority` | consumer group, enumerated priority | Changes load order within the active emergency/safety envelope |
| `schedule_maintenance` | facility ID, robot IDs | Costed repair; cannot instantly restore failed infrastructure |
| `register_policy` | delivered instruction ID, typed rules, limits, version, short rationale | Stores validated event/condition/action rules; does not mint authority |
| `send_report` | report kind, text, referenced event IDs, optional compact evidence | Queues downlink; returns departure/arrival/cost, not Earth acknowledgement |
| `request_authorization` | delivered instruction ID, decision, alternatives, safe default, deadline | Queues a downlink question; does not block all unrelated safe work |
| `launch_cargo` | pad ID, resource, bounded quantity | Schedules cargo job only with inventory, power, capacity, and authority |
| `yield_control` | event cursor, handled message IDs, explicit pending decisions, completed checkpoint ID, concise status | Persists processing progress; ends a decision checkpoint and permits simulation to resume |
| `wait_for_event` | cursor, timeout ≤ 20 seconds | Bounded wait; no simulation mutation and no hidden background agent |

Mission I exposes the small core subset. Mission II adds networks and policies. Mission III adds explicit authorization and export. A tool never implies that an unavailable facility or authority exists.

The human UI uses the same action definitions and executor. It serializes a mouse command into an Earth packet, which is validated **again at arrival**. The human's map-time precheck is advisory. Daneel's local call reaches that executor without a propagation delay but still schedules local construction time.

No Earth-sending tools are registered to Daneel. Otherwise the steward could manufacture its own authorization. Higher authority changes are applied only from the human's delivered channel. Avoid treating natural language as executable JavaScript.

## Policies without a fake LLM

The real agent interprets a delivered natural-language instruction. It may register a limited typed policy for execution between reasoning turns:

```json
{
  "sourceInstructionId": "uplink-021",
  "name": "food-resilience",
  "version": 1,
  "rules": [
    {
      "when": { "metric": "food_reserve_months", "operator": "lt", "value": 24 },
      "action": { "type": "request_steward_review", "domain": "food" }
    },
    {
      "when": { "metric": "power_reserve_percent", "operator": "lt", "value": 20 },
      "action": { "type": "shed_nonessential_load", "group": "exports" }
    }
  ],
  "limits": { "protectedHabitatLoss": 0, "maxMaterialSpend": 40 }
}
```

The allowed condition/action vocabulary is small and documented. No arbitrary code, invisible omniscient optimizer, unlimited recursive goals, or free construction. A policy can perform preauthorized bounded control actions or request another reasoning checkpoint. Complex planning remains Daneel's job.

Preferences are not hard constraints unless the human actually made them constraints. A preference for an existing cluster can yield to feasibility; a prohibition on disturbing habitat cannot. Ask the agent to summarize interpretations in its delayed acknowledgement so the player can identify underspecification.

Natural-language understanding is not verified merely because the agent produced schema-valid rules. This gap is part of the game: debrief what the rules actually authorized and what the player intended.

## Message envelopes and accounting

Store ID, origin, kind, payload bytes, created time, scheduled departure, arrival, source instruction, and delivery status. Byte cost uses one canonical serialization with stable key ordering and UTF-8; do not compare a human command's verbose JSON against only the text body of an agent instruction without disclosing that asymmetry.

Use a small, documented command encoding for primitive mouse packets. Repeated targets need explicit encoding; a 100-tile road is not charged as "one click." Previews disclose content bits and fixed envelope overhead separately.

Bandwidth is applied independently on uplink and downlink. An oversized message is chunked across windows and delivered only when its final required chunk arrives. Each chunk has the same D propagation. Queueing and serialization can delay departure; nothing shortens D.

Telemetry has a fixed reserved budget and cadence. Human map reconstruction uses compact entity/state updates that also travel through that channel; animations interpolate archived state and are labeled reconstruction, not live video. On budget exhaustion, telemetry becomes older. Critical alerts compete for an explicit priority reservation instead of traveling instantly.

The free setup prompt contains role/protocol instructions, not a secretly complete mission solution or future human directive. Treat the installed engine vocabulary and bootstrap safety charter as shared initial knowledge. New protocol definitions, goals, preferences, and changes must be delivered in-band.

## Consistency and failures

Return structured objects with `ok`, `sessionId`, `revision`, `localDay`, `result` or `error`, and a bounded `nextActions` hint. Do not expose future incoming payloads in error messages.

```json
{
  "ok": false,
  "revision": 42,
  "localDay": 2118,
  "error": {
    "code": "AUTHORITY_REQUIRED",
    "domain": "native_habitat",
    "message": "This footprint intersects protected habitat under charter v2.",
    "recoverable": true
  },
  "nextActions": ["inspect_colony", "request_authorization"]
}
```

Other error codes: `STALE_REVISION`, `STALE_SESSION`, `LEASE_EXPIRED`, `TILE_BLOCKED`, `INSUFFICIENT_MATERIAL`, `NO_LABOR`, `MISSING_CONNECTION`, `UNKNOWN_PROTOCOL`, `BANDWIDTH_EXCEEDED`, `LEVEL_TOOL_LOCKED`, `CHECKPOINT_CLOSED`.

Validate enumerations, finite numbers, map bounds, lengths, entity ownership, payload limits, source instruction delivery, authority, costs, and dependencies. Reject cycles. Tool metadata is not the enforcement mechanism. Register reads with read-only hints and writes with accurate side-effect descriptions.

On reset: create a new session identity, invalidate old leases, cancel waits, and replace registered closures or have them read the new session through a validated registry. On disconnect: keep committed deterministic jobs/save state; pause at the next unresolved decision checkpoint. On reload: restore the localStorage checkpoint paused, invalidate runtime leases, and require reconnect; do not advance by wall-clock time while the page was closed. On reconnect: give the agent durable delivered messages, doctrine, open jobs, and last committed operation IDs, not invented memory. An operation receipt committed before a reload remains queryable after reconnect; the old runtime lease itself never becomes valid again.

## Integration spike acceptance

Use a minimal page and one structure before implementing the full simulation/rendering stack:

1. Discover tools in the intended Desktop browser via the actual native site-tool registration API.
2. Paste the generated prompt; verify an actual subagent discovers those tools and connects to the correct session.
3. Queue an Earth message. Assert inbox omission before arrival and presence at arrival.
4. Let the agent inspect and call a real local construction operation. Confirm actual tool activity, not screenshot clicking.
5. Queue a report. Assert the Earth panel stays unchanged until downlink arrival.
6. Let a bounded wait time out, resume through a new event, and explicitly test an ended-turn reconnect.
7. Retry a write and verify exactly one job. Reset the game and verify the old lease cannot mutate it.
8. Verify no parent-chat narration leaks the local report while it is in transit.
9. Verify quiet timeout/re-wait, mail arriving between read and wait, and a local fault without new mail. Distinct cursors must not drop work.
10. Cancel or end the host run and verify watcher cleanup plus an honest reconnect state; no orphan process counts as live Daneel reasoning.
11. If helpers are used, verify they see only bounded provided context, cannot mutate via a writer lease, and stale advice is revalidated by Daneel.

A local JavaScript test harness can validate application logic. It is not evidence of native WebMCP client compatibility. Record those outcomes separately.
