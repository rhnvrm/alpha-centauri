# THE INTENT HORIZON

## A three-mission WebMCP game demo

Status: design specification, not a claim that the demo is implemented.

**You govern from Earth. Daneel lives with the consequences.**

A human and a real AI agent play different roles in the same isometric 3D colony. The human sends distant intentions; the agent turns them into local decisions through WebMCP. The interesting resource is not clicks per minute. It is how much worthwhile change an instruction can cause without saying something the player did not mean.

Priority: **Daneel → story and missions → visual/interaction design → simulation → presentation polish.**

Non-negotiable deployment constraint: **fully client-side, with localStorage as the only persistent game-state store.** The site is a static build. No game server, database, serverless functions, independent MCP server, cloud save, or model API backend. The simulation and registered WebMCP handlers execute in the open game page; the user's connected agent supplies Daneel's reasoning. See `docs/LOCAL-STATE.md` for persistence, single-tab ownership, and recovery.

This supersedes the initial keyword-based steward and 2D canvas experiments in `src/`. Do not extend those into the final architecture. Their useful ideas are delayed snapshots and inspectable packets, not the mock intelligence or renderer.

## 1. The promise

- A real connected ChatGPT agent plays Daneel. No keyword parser impersonates him.
- WebMCP is the primary play interface for Daneel, not an optional automation demonstration bolted onto a mouse game.
- Humans can always select robots, lay roads, place buildings, set production, and send repair orders with the mouse. Every order enters the same lightspeed-limited uplink.
- Natural-language instructions take exactly as long to reach Daneel as individual orders. Their advantage is local interpretation and contingent action, never faster transmission.
- Daneel's replies take the same time to come back. Questions, warnings, and authorization requests are gameplay.
- The colony is actual 3D geometry viewed through an orthographic isometric camera, with selectable objects, height, lighting, shadows, and animated robots. Concept paintings and sprites support it; they do not substitute for a world simulation.
- Exactly three missions, approximately 20–30 minutes total depending on agent response time. No endless mode or full civilization game.

## 2. Story: three letters to a world

Earth, 2247. The Colonial Administration establishes its first extrasolar command desk. Its construction fleet has reached the fictional planet Aurora in the Alpha Centauri A/B system. There is no claim that this habitable planet actually exists.

You inherit the desk. Twelve surveyors, six construction robots, and an autonomous steward are waiting at the frontier. Your title is Administrator. Your tools make you feel like a city-builder's mayor. The separation makes that impossible.

R. Daneel Olivaw is the fleet's Colonial Steward: precise, courteous, reluctant to confuse compliance with care. Retain the user-requested name for this private homage; consider naming/licensing separately before commercial release. Write original dialogue. Do not reproduce Asimov passages or game assets.

Visual influences are roles, not copies: Caesar's legible civic infrastructure; StarCraft's readable industrial silhouettes and machinery; Alpha Centauri's alien ecology and ideological tension; Asimov's patient machines and uncomfortable questions about authority.

The dramatic progression is not "the AI becomes evil."

1. **Can you do what I say?** Distance defeats micromanagement.
2. **Can you understand what I mean?** Shared context gives words operational power.
3. **Can I trust you to act without me?** A good instruction defines boundaries as well as objectives.

End on a functioning colony and an unresolved political question, not a sequel-sized narrative system.

## 3. One causal model

Use a common simulation reference clock. Earth's and the colony's simultaneous dates are approximately the same; the *observation timestamp* lags. Ignore relativistic clock corrections and stellar orbital distance changes in this demo.

One-way delay `D = 4.37 simulation years`. A response to an observation can influence the colony `2D = 8.74 years` after that observed event.

```text
Human / Earth                         Daneel / colony
mouse command or written intent
            ─────── 4.37 y ────────→ delivered inbox
                                     inspect current conditions
                                     use local WebMCP tools
                                     build / adapt / request authority
received telemetry and reply
            ←────── 4.37 y ───────── queued downlink
```

At common time T:

- Human world view renders the latest received snapshot, with its capture date prominent.
- A speculative building placement is a hollow amber ghost, not a completed structure.
- Daneel sees current local state and messages with `arrivalTime <= T` only.
- Daneel must not see a still-being-typed instruction, future packet body, unsent doctrine, or future scenario event.
- A packet reaching its calculated arrival time lets Earth say "arrival time elapsed; awaiting report." It does not confirm execution.
- Local action traces and outcomes become visible in the game only after their downlinks arrive. A debrief can replay already-received events.
- A cancellation, policy revision, or answer is another delayed packet, not an instant edit.
- Completing a mission locally does not reveal success to Earth until confirming telemetry arrives.

Use integer simulation days internally. Define one demo year as 365 days and D as 1,595 days (4.36986 years); display **4.37 years**, not an inconsistent years-and-days conversion. Serialize the chosen constants and unit in saves and tool results.

### Pacing

The demo must teach delay without making people sit idle for years. Controls: pause, 1×, 4×, and **Next transmission event**. Initial tuning: one simulated year per eight wall-clock seconds at 1×; approximately 35 seconds each way, nine seconds at 4×. These are proposed tuning values, not measured playtest results.

Fast-forward integrates every intermediate simulation event. It never skips costs, storms, jobs, packet arrivals, or the need for a local decision. Deterministic construction and supply systems keep running between decisions.

At a delivered directive or a decision requiring new reasoning, establish a simulation checkpoint. Pause simulation time while the external agent reasons; keep cosmetic animation running and label **Daneel is deliberating · simulation paused**. Reasoning latency must not kill the colony or give one model a strategic advantage. Resume after a valid plan/yield. Enforce a wall-clock timeout and a visible disconnect state.

The page cannot assume it can wake an agent whose turn has ended. A bounded WebMCP wait is usable while the agent's turn is alive; reconnect/resume is explicit otherwise. Closing the game suspends the simulation. Reloading restores saved simulation time, not wall-clock catch-up, and requires an agent reconnection. No server or background worker runs the colony while the page is closed.

Daneel's startup prompt permits a cancellable JS/Python/available-runtime inbox loop through the host's documented WebMCP interface. Empty inboxes mean wait, not mission completion. New work returns to Daneel for actual reasoning. He may use bounded read-only planning subagents, but remains the sole writer and sole inbox-wait owner. These host-side helpers introduce no backend or second game-state store. See `docs/WEBMCP.md` for cursor, cancellation, and host-lifetime requirements.

## 4. Three missions

### I — THE FIRST LIGHT

**Lesson:** an action against an old map is not a plan for the current world.

**Location:** Landing Basin. Small map: rocky uplands, seasonal floodplain, landing craft, relay, twelve surveyors and six robots. Seed stores sustain the landing party through the first feedback loop; emergency failure is not the tutorial's opening move.

**Briefing:** "The next ship carries one hundred settlers. They need a home. You have a map. It is already out of date."

**Objective:** provide connected housing and life-support capacity for 100 people, with two independent generation sources. Pass a seeded single-source power interruption for 180 local days before the arrival deadline. Confirm success through delayed telemetry.

**Opening, roughly two minutes:**

1. New Game introduces the copyable Daneel startup prompt and verifies his connection. He is present from the beginning, not unlocked after building a conventional city-builder.
2. First tutorial click orders one robot to survey a tile. The route appears immediately as an amber *planned* line; the robot does not move in the received observation.
3. The order packet departs. Next Event demonstrates the journey; a reply requires the return journey.
4. The player can continue manually or send: "Prepare reliable power and connected housing for 100 settlers. Avoid the floodplain."
5. A seeded seasonal flood changes buildable lowland tiles during transit. It happens independently of which control mode the player chooses. The briefing offers risk contours so careful manual planning remains viable.
6. Daneel receives the instruction, surveys the present world, chooses safe sites, assigns robots, and creates a power/storage/housing network through actual tool calls.
7. The same local executor processes human orders. It does not quietly repair a wrong fixed instruction; stale or blocked targets produce a failure report. Agent orders may fail too, but Daneel can inspect and revise locally.

**Tools emphasized:** `read_inbox`, `inspect_colony`, `survey_region`, `construct_building`, `build_road`, `assign_robots`, `send_report`.

**Human agency:** choose layouts, costs, safety margins, and when to delegate. Direct controls never disappear. No forced manual failure and no prescripted "Daneel wins" path.

**Narrative beat, illustrative rather than guaranteed agent output:** "The coordinates were correct when you sent them. The river was not obliged to remain there."

**Debrief:** compare received objectives achieved, elapsed local time, and actual uplink cost. Expand one delivered instruction to see the local decisions it enabled. The number of tool calls is explanatory, not the score.

### II — THE MEANING OF ENOUGH

**Lesson:** a useful instruction is a goal plus constraints and preferences; shared vocabulary compresses that specification.

**Location:** New Alexandria. A medium-sized colony with agriculture, a reservoir, a reactor, emerging native wetlands, and a limited buildable ridge. A time jump advances the story with a new seeded mission save rather than simulating every intervening year.

**Briefing:** "The city has learned to grow. It has not learned when to stop."

**Objective:** maintain at least 24 months of food and 20% power reserve for two local years without losing protected wetland tiles. Fix the resource bottleneck under a strict communication budget.

**Core situation:** agriculture requires water and power. Adding farms without upstream capacity does little. A drought and one equipment fault expose this during the mission. Site conditions, costs, and alternatives are inspectable locally, not a hidden puzzle answer.

**Initial uplink:** 2,800 application payload bits per transmission window. UTF-8 encoding, not a guessed token count. A queued message may need multiple windows, delaying departure; the extra cost is serialization, not altered light speed. Show the exact encoded cost before send.

**Decisions:**

- "Build three farms at these coordinates" binds future actions to old assumptions.
- "Maximize food" delegates more but omits reserve targets and preferences. Daneel is not scripted to sabotage the colony; different reasonable interpretations have different costs. Contradictory or dangerous requests may produce a clarification.
- "Maintain 24 months of food; preserve wetlands; keep power reserve above 20%; prefer existing clusters" defines a closed-loop policy with trade-offs.
- Players may revise a message before departure. Once emitted, revisions are new packets.

**Shared codebook:** unlock the named, inspectable `RESILIENCE-24/v1` protocol after its definition has been delivered and acknowledged. It specifies the goal, reserve floors, reversible siting preference, and allowed actions. A subsequent reference to that version is short because both sides possess the definition. Changing a definition creates a new version that must be transmitted; an alias cannot smuggle an unseen page of text across the channel.

**Tools emphasized:** `inspect_resource_network`, `modify_production`, `schedule_maintenance`, `register_policy`, plus construction and messaging tools from mission I.

**Narrative beat:** Daneel's downlink says what changed, why water came first, and what he deliberately did not build. A concise report is useful compression in the opposite direction.

**Debrief:** show achieved utility per transmitted kilobit, constraints preserved, and codebook definition cost versus subsequent reuse. Do not claim Shannon channel capacity increased. What increased was useful influence per transmitted payload bit.

### III — THE RIGHT TO DECIDE

**Lesson:** autonomy is an envelope of authority, and asking permission is itself a costly action.

**Location:** Northern Reach. A linked town, iridium outcrop, an existing launch pad, vulnerable power corridor, and an unsurveyed ecological area. Reuse most assets; the new dramatic element is authority, not a giant second economy.

**Briefing:** "Earth expects its first shipment. The colony expects a future. You must say which promises can bend."

**Objective:** launch 1,000 tonnes of iridium by the mission deadline while maintaining life support and no irreversible destruction of protected native habitat. The deadline permits a reversible but slower ecological route if Daneel has appropriate authority. Numeric balancing is to be verified in seeded playtests.

**Core situation:** Earth sends an expansion/export objective. Before it arrives, a local survey discovers an ecologically sensitive microbial mat at the best access route. Daneel may use a costly ridge route, relocate modular equipment, request an exception, or defer.

**The autonomy envelope:** roads and repairs autonomous; food autonomous under reserve constraints; new settlements require permission; native habitat destruction forbidden; life-support emergency measures explicitly bounded and reversible. The player can revise these rules, but revisions arrive after D, like everything else.

**Clarification timeline:**

| Event | Time since original instruction |
| --- | --- |
| Earth transmits expansion intent | 0 |
| Daneel receives it and sends a question | 4.37 years |
| Earth receives the question | 8.74 years |
| Daneel receives Earth's immediate answer | 13.11 years |

The interface makes this visible before the player chooses "Ask Earth" as a default. It is not a gotcha revealed only afterward.

**A second decision:** a bounded life-support fault happens before Earth's response can return. Daneel can stabilize it if authority allows. He describes his emergency actions in a delayed report. The player judges that decision after the fact and revises future doctrine, rather than magically intervening in the past.

**Tools emphasized:** `read_doctrine`, `register_policy`, `request_authorization`, `set_power_priority`, `schedule_maintenance`, `launch_cargo`, `send_report`.

**Endings:**

- **Trust earned:** the export launches, constraints survive, and the final report explains the local compromise.
- **Safe but late:** the colony survives; excessive requests for permission cost the export deadline. This is an intelligible outcome, not a generic loss screen.
- **A hollow success:** export targets met but a player-authorized ecological concession fails the stewardship goal. Show precisely which transmitted choice enabled it; do not fabricate a foolish agent.

**Closing authored epilogue, distinct from live agent speech:** "The colony has become a place, not a project. Your next instruction will arrive in four years. What should still be yours to decide?"

## 5. Gameplay and fair scoring

One repeating loop: **observe an old world → decide what must remain true → transmit → let local agency operate → receive consequences → revise intent**.

Resources: population/life-support capacity, food stock and consumption, water stock and flow, power generation/demand/storage, construction material, robot labor, protected tiles, and (mission III) iridium/cargo. Avoid currencies and systems that do not support one of the three lessons.

Local tools schedule real jobs with location, dependencies, material cost, labor, completion time, and failure reasons. Roads carry connectivity. Power is a graph. Production is a flow, not a button that directly adds a magical stockpile. The agent chooses a plan; the engine runs deterministic jobs.

Authority is enforced by the engine, not just written in a prompt. A goal or macro never grants authority by itself. Human primitive commands are explicit orders but still cannot violate the active hard safety charter. A delayed human doctrine revision may authorize a previously unavailable option. Violations are rejected with structured reasons.

Top-level mission outcomes come before efficiency. A catastrophic run does not win for being terse.

- Each mission has normalized objective progress, sustained safety metrics, and explicit irreversible-damage penalties.
- `useful_gain = max(0, final_utility - starting_utility)` using documented scenario weights.
- `intent_gain = useful_gain / max(1, uplink_payload_bits / 1000)`; display as a secondary diagnostic, not a scientific absolute or global leaderboard.
- Downlink usefulness/cost is reported separately. Core numeric telemetry has a disclosed fixed reservation; summaries, annotations, and optional detailed traces consume discretionary downlink capacity.
- Report both text/payload bits and nominal protocol overhead assumptions; do not present a free full-world snapshot as proof of extreme semantic compression.
- Tool-call count appears only in the causal replay: "one instruction led to these decisions."
- A real manual-versus-agent comparison needs the same seed and initial conditions. Before such trials exist, show no invented efficiency multiplier.

## 6. Interface: an RTS with a correspondence desk

The map dominates. Do not design a SaaS dashboard with a decorative colony thumbnail.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Mission II · New Alexandria   EARTH DATE 2281.04  OBSERVED 2276.67       │
│ Food 1.8 y  Water 38%  Power +26%  Population 6482   [old telemetry]     │
├──────────────────────────────────────────────────┬─────────────────────┤
│                                                  │ DANEEL / INBOX      │
│     ISOMETRIC 3D WORLD · roughly 75% width         │ Received letters    │
│                                                  │ Sent / in transit   │
│     selectable units, roads, colony, ecology      │                     │
│                                                  │ Write an intent…    │
│     amber ghosts = orders Earth has sent         │                     │
│     solid world = received reconstruction        │ 864 / 2800 bits     │
│                                                  │ ARRIVES 2285.41     │
│     minimap                 layer / zoom         │ [Transmit]          │
├──────────────────────────────────────────────────┴─────────────────────┤
│ Selected unit/building · portrait · state · Build / Move / Repair      │
│ EARTH ─────→ outgoing packet ───── COLONY ─────→ returning report       │
│ [pause] [1×] [4×] [Next event]          current inference ≠ confirmation │
└────────────────────────────────────────────────────────────────────────┘
```

Screens to design, not dozens of menus:

1. **Title / mission select:** The Intent Horizon, three mission cards, Continue, New Game, connection prerequisites.
2. **Bring Daneel online:** copy prompt, game/session identity, agent handshake state, retry/resume, explicit unsupported-browser explanation.
3. **Main play:** world, selected object command card, mission strip, transmission horizon, persistent correspondence panel.
4. **Doctrine sheet:** a small modal with domains, limits, safe defaults, transmitted versions, and clear arrival time.
5. **Debrief:** received-timeline replay, goal outcomes, losses avoided/incurred, communication budget, next mission.

Map controls: left-click select; shift-click multi-select; right-click issues a queued move/work order; a selected build item shows a terrain footprint and cost; left-click commits it to the outgoing queue. Drag or edge-pan camera, wheel zoom, Q/E snap camera through four isometric views. Escape cancels local placement, not an emitted radio packet. Provide keyboard and toolbar alternatives; disable browser context menu only inside the map.

The letter composer, not an omniscient action feed, is the primary sidebar. It exposes a recipient, message, optional attachment of the *already observed* selected tile, UTF-8 bit cost, departure window, propagation delay, and estimated earliest reply. It never displays a fabricated model understanding before delivery. Preview can show costs and syntax only.

Color and shape both communicate state: amber dashed outbound ghosts; off-white received constructions; teal received messages; red striped hard conflicts. Old observations carry timestamp labels on selection cards. Keep text crisp in HTML rather than baking it into sprites.

## 7. Visual pieces and asset limits

See `docs/ART-DIRECTION.md` and `docs/ASSET-PROMPTS.md`.

- A real Three.js scene, orthographic camera around 35.264° elevation, quarter-turn rotation, modular grid-aligned terrain, restrained shadows.
- Target: 32×32 terrain cells in mission I, at most 48×48 in the other two; dozens, not thousands, of simulated entities.
- Approximately twelve structure families and three robot families, reused across missions.
- Native ecology must be visually unlike terrestrial forest without being unreadable: low teal branching mats, amber seed-spires, wetland pools.
- Architecture: ivory ceramic shells, dark ribbed metal, oxidized copper/orange service elements, disciplined blue-green lighting.
- Interface: graphite, parchment text, muted amber, restrained scan-line texture only on communications imagery. No illegible terminal wall.
- Scene assets are geometry; portraits, mission plates, terrain textures, icons, and effects may be generated raster assets.
- Sound, if implemented: short optional transmit chirp, incoming-letter cue, quiet machinery and wind. No voice acting or generated music required for acceptance.

## 8. Architecture and implementation sequence

### Gate A — real agent before graphics

Build a minimal session page exposing the contract in `docs/WEBMCP.md`. Confirm that a real Daneel subagent can connect, observe only delivered mail, invoke one local action, and enqueue a delayed reply. Capture tool activity as evidence. Do not produce the final 3D scene before this test passes or an explicit integration blocker is established.

### Gate B — design artifacts

Use this story, mission state diagrams, world/structure concepts, the gameplay UI mockup, and the startup prompt. Pick a coherent visual direction before producing a large sprite collection. Asset-generation capability is optional tooling, not permission to replace the actual agent with scripted intelligence.

### Gate C — small deterministic engine

Implement integer-time event queue; separate current/local and delayed/Earth projections; delivered inbox; construction jobs; road/power graph; resource stocks/flows; scenario events; doctrines; bounded agent checkpoints; localStorage save/load with idempotency and reconnect. Pure browser-side core modules, independently testable, no React state as the authority. Use one in-memory working state and a versioned localStorage checkpoint; UI and WebMCP call the same reducer/store. There is no second backend state or IndexedDB state store.

### Gate D — 3D game shell

React/Three.js or React Three Fiber for a persistent scene; HTML HUD; shared selection model and tool-driven state updates. Reuse the same validated executor for human packet arrivals and Daneel's immediate local actions.

### Gate E — all three missions and demo polish

Implement the three authored scenario configurations and debriefs. Verify each with an actual connected agent and a manual baseline. Add concise tutorial guidance, performance budget, reduced motion, readable small-screen fallback, and resilient saving.

### Not in this demo

Combat, multiplayer, real-time voice, full social simulation, procedural universe, trade economy, six-level technology tree, a full political ending system, accounts, subscriptions, or any backend. No independent MCP server as a compatibility fallback: an unsupported WebMCP browser must show an honest limitation while leaving manual play available.

## 9. Acceptance tests

1. An undispatched or in-transit instruction body cannot be retrieved by Daneel's inbox tools.
2. No mouse order or doctrine change executes before its arrival timestamp.
3. A changed tile invalidates a fixed command at arrival; Daneel can inspect and replan with delivered authority.
4. Reports and observed resource changes remain unavailable to Earth until their capture/transmit time plus D.
5. A round-trip request takes 2D; an instruction–question–answer sequence takes 3D.
6. Skipping time integrates intermediate faults, production, construction, and deadlines, and stops at unresolved agent checkpoints.
7. Agent disconnection is visible and does not activate a hidden planner. Reconnect reuses committed state without duplicate jobs.
8. Every agent mutation uses registered WebMCP tools, validated schemas, a revision, and an idempotency key. No DOM-click or arbitrary-JavaScript substitute is counted as WebMCP play.
9. A policy and a macro are subject to the same charter, costs, and geography as primitives.
10. Goal utility, damage, and message cost determine debrief metrics; redundant tool calls cannot increase the score.
11. A shared protocol reference is valid only after its exact version is delivered; first definition and revisions consume bandwidth.
12. Each level has a real winning sequence, a comprehensible setback, a manual route, and a delayed narrative payoff.
13. Save/reload retains packet times, jobs, mission state, doctrine versions, reports, and the agent cursor. An old agent lease cannot mutate a reset session.
14. New Game gives a session-specific copyable prompt, with no claim of connection until the handshake succeeds.
15. Earth gameplay and agent operator/debug views are distinct. Opening spoiler diagnostics marks the run assisted and cannot silently improve its score.
16. All durable game state lives in versioned localStorage records. A static production build requires no application API calls; external agent inference is supplied by the host, not by the game.
17. Only one tab may advance or mutate a save. Other tabs are read-only; reload invalidates old runtime leases, and a copied URL never claims to contain the save.
18. A denied or full localStorage store visibly pauses play without acknowledging unsaved mutations. Invalid or newer-version saves are preserved for export, not silently reset.

## 10. Known integration risks

Official documentation establishes site tools and subagents separately, not this game's persistent combined run. Prove tool discovery, subagent access, bounded waits, reconnection, and UI updates in the intended desktop environment before promising one-paste continuous play. See `docs/WEBMCP.md` for source links and fallback behavior.

A prompt is not security isolation. The user can inspect the Daneel task or developer tools and learn current colony information. For a local demo, this is an explicit honor-system boundary plus an assisted/debug mode, not a secure competitive environment.

The existing starter source is incomplete and not a playable build. This specification intentionally replaces its proposed fake steward and canvas renderer rather than describing them as finished work.
