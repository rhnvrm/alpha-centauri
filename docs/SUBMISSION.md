# WebMCP Challenge submission

- Devpost: [The Intent Horizon](https://devpost.com/software/the-intent-horizon)
- Demo video: [The Intent Horizon, YouTube](https://www.youtube.com/watch?v=6y38e-7NxSM)
- Live app: [rhnvrm.github.io/alpha-centauri](https://rhnvrm.github.io/alpha-centauri/)
- Source: [rhnvrm/alpha-centauri](https://github.com/rhnvrm/alpha-centauri)

## Submission title

**The Intent Horizon — a city builder where distance forces intelligence**

## Elevator pitch

An Asimov-inspired WebMCP strategy game about why agentic instruction matters: bits take years to reach Alpha Centauri and Earth’s view is already old, so Daneel needs intent, not clicks.

## Devpost description

Traditional city builders assume the world waits for your next click. **The Intent Horizon** removes that assumption: Earth observes a delayed reconstruction of a colony four light-years away, and every message takes 1,595 simulation days to arrive.

The player is not asked to micromanage a remote settlement. They state what must remain true—such as food reserves, power floors, protected habitat, and preferences. Daneel, the colony's local steward, receives that intent beside the current colony and uses structured WebMCP tools to inspect conditions, schedule work, build, report, request higher authority, and wait for the next meaningful event.

That division is the game mechanic. The human owns values and delegated authority; the agent owns feasible, contingent local action. Both are constrained by the same deterministic simulation: road and power networks, material and labor limits, seeded hazards, construction time, authorization delays, a fixed radio bit budget, and delayed reports. Earth never receives a hidden live feed, and Daneel cannot invent authority or bypass the simulation.

Three missions turn this premise into a progression: establish reliable life support, express resilience with a shared codebook, then decide what autonomy is safe when export and habitat protection conflict.

The project is a fully client-side static Vite application. It has no game backend, model API, database, or custom MCP server. Native tool registration is feature-detected through `document.modelContext.registerTool`; unsupported clients are told so plainly rather than being shown a simulated agent.

## What makes the human-agent experience better

- **Complementary roles:** the human sends goals, constraints, and authority; the agent sees the present and performs bounded local work.
- **Meaningful tools, not UI automation:** WebMCP exposes domain actions such as `inspect_colony`, `read_inbox`, `construct_building`, `send_report`, and bounded `wait_for_event`—all validated by the same simulation used by the UI.
- **Visible accountability:** every packet has a bit cost, departure, delivery date, and delayed consequence. Earth sees only received telemetry.
- **Honest capability boundary:** a connected state requires a real successful handshake; the app does not substitute a scripted steward.

## Links to provide

- Live app: https://rhnvrm.github.io/alpha-centauri/
- Source: https://github.com/rhnvrm/alpha-centauri
- Demo video: https://www.youtube.com/watch?v=6y38e-7NxSM

## Three-minute video structure

1. **0:00–0:25 — Hook.** “A city builder where every Earth order takes 4.37 years to reach the colony.” Show the Earth command desk, delayed map, and packet timeline.
2. **0:25–0:55 — Human role.** Send a compact intent with food, power, and habitat constraints. Point out the bit budget and delivery date.
3. **0:55–1:45 — Agent role.** In a supported in-app-browser session, show tool discovery, `connect_steward`, inbox/colony inspection, one valid local action, a report, and a bounded wait. Keep the tool results visible; do not stage DOM clicks as agent work.
4. **1:45–2:25 — Consequence.** Show Earth receiving the delayed report and the difference between captured colony date and receipt date. Use the mission confirmation/debrief.
5. **2:25–3:00 — Why WebMCP.** State the division of authority and the three-mission arc. End on the live URL and repository.

The published video is the challenge demo. The native tool-use segment remains the strongest supporting evidence and should be recaptured if the video is revised.

## Submission status

- [x] Public live application URL
- [x] Public source repository URL
- [x] Project description and demo narrative
- [x] Published Devpost submission
- [x] Published demo video
- [x] Deterministic tests pass
- [x] Production build passes
- [x] Browser smoke test covers the visible session flow
- [ ] Verify tool registration, connection, read, local action, delayed report, bounded wait, and reconnect/resume in the supported target client
- [x] Complete Devpost fields and rules acknowledgements

## Evidence to retain

Keep the final recording, a clean fresh-session screenshot, the production build log, and the native tool-use transcript. The latter is the strongest proof that this is an agent-native game rather than a conventional game with an automation veneer.
