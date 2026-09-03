# Implementation status

Checked 2026-09-03 (continuation passes). This document records implementation evidence separately from native-agent acceptance.

## Runnable slice

- Static Vite app runs at `http://localhost:4173/` when the local dev server is started with `npm run dev -- --port 4173`.
- `npm test` passes **64 deterministic tests** (engine, communications, events, networks, levels, labor/codebook, observed-world projection, store, tools); `node scripts/e2e.mjs` adds 18 browser checks.
- `npm run build` succeeds; the production preview serves `dist/` with no dev server and renders WebGL 2.0 with zero page errors. Vite reports a non-blocking Three.js bundle-size warning.
- Durable state is a versioned `localStorage` record (`intent-horizon-save-v1`); the engine does not use a backend, database, IndexedDB, model API, or independent MCP server.
- `src/scene/ColonyScene.jsx` uses real Three.js geometry, orthographic projection, shadows, picking, snapped Q/E camera rotations, and wheel zoom. Verified in a real headless Chromium 151: WebGL 2.0 context, zero page errors, Q/E rotation visibly changes the rendered frame, and all three missions render the 3D world.
- Headless-browser verification was performed with a locally installed Chromium (system deps fetched from Debian pools into `/tmp/chrome-deps`; run `LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu FONTCONFIG_FILE=/tmp/fonts.conf XDG_CACHE_HOME=/tmp/fcache node /tmp/shots/probe.js` to reproduce).

## Milestones

### M1 — runnable WebMCP slice: implemented locally

New Game/three-mission selection, session-specific startup prompt, connection status, Earth composer, packet timeline, step/next-event controls, constructible-object flow, delayed reports, and native `document.modelContext.registerTool` feature detection. The tool set is `connect_steward`, `read_inbox`, `inspect_colony`, `read_doctrine`, `construct_building`, `send_report`, `yield_control`, `wait_for_event`, plus the bounded scenario tools. Tool guards now return structured `ok:false` objects (never uncaught throws) for stale sessions, expired leases, revision mismatches, missing ids, and closed checkpoints.

### M2–M5 — simulation, networks, events, and authored outcomes

This pass added the previously missing mechanics and test coverage:

- **Transmission windows.** One `2800`-bit application window per local day per direction; payloads spanning windows serialize across consecutive days, and the final chunk determines deliverability. Envelope overhead is disclosed (`ENVELOPE_BITS`); the composer shows exact UTF-8 bit cost, window count, and arrival date. Uplink/downlink budgets are accounted separately.
- **Seeded scenario events.** Deterministic seasonal flood (changes buildable lowland tiles and invalidates stale orders at arrival), a 180-day single-source power interruption (Mission I), drought and equipment fault (Mission II), and an authored survey-discovery plus life-support fault (Mission III). Collapse is deterministic: 60 consecutive zero-power days end the mission.
- **Road networks.** Roads carry connectivity through a union-find grid; isolated structures contribute no power/food/water until a corridor or battery anchor reaches them. Starting settlements are seeded road-connected; new constructions must touch the grid to count. `MISSING_CONNECTION`, `PROTECTED_HABITAT`, `TILE_FLOODED`, `NO_PAD`, and `CHECKPOINT_CLOSED` are engine-enforced errors.
- **Mission outcomes with delayed confirmation.** Objective success is only *public* after a confirming downlink with its own 1595-day delay arrives at Earth. Mission III has `trust-earned` (export + stewardship), `safe-but-late` (no export by day 730), and `hollow-success` (export met but authorized habitat loss). Mission II distinguishes `wetlands-lost` and `reserves-broken`. Debrief copy varies per outcome.
- **Authorization round trip.** `request_authorization` queues a downlink question; Earth sees it after D, answers, and the answer arrives 2D later. Only then does authority apply (e.g., `habitatLoss`), and building on protected wetland then counts irreversible loss. The Earth UI surfaces pending questions with the round-trip ETA.
- **Store/save hardening.** Storage probe, size budget, export/import validation with fresh session identity, corrupt/newer-save preservation under `:invalid`, and a write-failure path that keeps the last committed world and pauses play.
- **UI additions.** Amber ghosts for in-transit Earth build orders at the commanded tile, robots that visibly move toward active construction, a Continue card for resuming a saved session, an authorization banner, honest Earth station clock (`Earth date = colony day + D`), and a WebGL-unavailable fallback panel. Screenshots: `docs/progress/`.

- **Robot labor.** Construction now claims exactly one idle robot; jobs beyond the fleet wait deterministically (`awaiting-labor`), resume when a robot frees, and release it on completion or cancellation. `assign_robots` transfers labor with `ROBOT_BUSY`/`JOB_NOT_FOUND` semantics; assigned robots are visually marked (teal mast) in the scene.
- **Mission II shared codebook.** Earth can transmit `RESILIENCE-24/v1` as an in-band `protocol-definition` packet (~2.2 kb). It is not local until it arrives; after delivery the agent can `register_policy` against the compact version reference, and the debrief shows definition cost vs. the small reference (typically >90% saved). A reference never works before its definition arrives (`CHECKPOINT_CLOSED`).
- **Human road orders.** A road-corridor mode picks two tiles; the order travels as a `road-order` packet and is **validated again at arrival** — a wetland/flooded/bad cell yields a structured `human_order_rejected` (MISSING_CONNECTION) instead of silent rerouting. The Earth build palette now exposes all eight structure types.
- **UI/scene.** Mission II protocol transmit button, road-mode hints, a first-run tutorial hint, flooded lowland tint as the seeded hazard hint, and a Continue card for saved sessions.
- **Full play surface.** Roads render as connectivity ribbons (teal when on the relay grid), a 150px minimap with click-to-center panning, amber planned lines from assigned robots to their construction targets, in-transit road-corridor ghosts, native ecology mats on protected wetland (after discovery), a Doctrine sheet modal (authority domains, in-transit changes, delivered protocols; Escape to close), and a received-timeline in the debrief.
- **End-to-end smoke.** `scripts/e2e.mjs` drives a real session through the UI (title → onboarding prompt → 3D world → queued build order → windowed intent → time advance → doctrine modal → reload/Continue → same session id) — 18/18 checks pass in headless Chromium. The production build (`npm run build` + `npm run preview`) also renders the 3D world with zero page errors.

## Critique-driven gameplay pass (2026-09-03, second continuation)

Reviewed the game as a *playable loop* rather than a mechanic list; fixed the five largest issues:

1. **Earth now sees only what was received.** The 3D world renders `observedWorld` — buildings, robots, and roads shipped in downlink telemetry — never the live colony. Earth's own in-transit orders remain amber ghosts; Daneel's local work is invisible until a report or the yearly autonomous telemetry captures it. This restores the design's core tension (acting on a stale world) and is enforced at the engine level (`telemetryFor` excludes queued/cancelled structures), not just in the UI.
2. **The channel has a pulse.** The autonomy envelope now files compact telemetry yearly (365-day cadence, normal multi-window delay). New `EARTH EVENT` and `COAST` controls stop time exactly at the next Earth-visible arrival; a toast + chime announces deliveries.
3. **Onboarding beat.** Mission I shows a 4-step checklist mapped to real milestones (send → arrive → read report → read the date gap), dismissible, progressing as the player actually does the loop.
4. **Debrief efficiency story.** USEFUL GAIN (outcome-scaled 0–100) and INTENT GAIN (gain per transmitted kilobit) per DESIGN §5, alongside payload totals and the codebook compression numbers.
5. **Sensory feedback.** WebAudio transmit chirp and incoming-letter chime (lazy AudioContext, gesture-gated).

## Native integration status

Unverified/blocked on the current host — unchanged from the previous check. Browser setup reproduced the same compatibility error:

`Cannot find module '/home/rhnvrm/.codex/plugins/cache/openai-bundled/browser/26.831.21537/scripts/browser-service.mjs'`

The installed Browser skill directory is `26.825.31414`. No plugin files were changed and no alternate browser was used. A supported host must still prove discovery, `connect_steward`, delivered-mail omission before arrival, local construction, delayed downlink, bounded wait/resume, and cleanup. Passing the local JavaScript suite is not evidence of a live Daneel connection.

## Verification commands

```sh
npm test        # 64/64 pass
npm run build   # succeeds
npm run dev -- --port 4173
```
