# The Intent Horizon

The Intent Horizon is a three-mission isometric strategy game about governing a colony from four light-years away.

You are Earth. The colony is Aurora, a fictional world in the Alpha Centauri system. R. Daneel Olivaw is the local steward: a real connected agent that can inspect the colony and act through the page's WebMCP tools.

The premise is simple:

> The farther away a system is, the less useful imperative commands become.

Every human order and every written instruction crosses the same 1,595-day one-way delay. Earth sees an old reconstruction of the colony, not its current state. Daneel receives a delivered instruction, inspects the colony as it exists now, and turns the human's intent into local, contingent work.

This is not an AI that clicks through a game for you. It is a shared visual world with two complementary participants:

- The human sees the colony's shape, history, risks, and consequences, then supplies judgment, priorities, constraints, and values.
- Daneel gets structured WebMCP affordances for inspection and action, then handles local planning, adaptation, and execution.

WebMCP is therefore the game mechanic. The demo asks how much worthwhile change a short instruction can cause without saying something the player did not mean.

## The demo thesis

The game turns a communication problem into a strategy loop:

```text
observe an old world → decide what must remain true → transmit intent
→ let local agency operate → receive consequences → revise intent
```

The advantage of an agent is not a faster radio or more bandwidth. It is local intelligence operating against current conditions. Instead of transmitting thousands of brittle clicks, Earth can transmit a goal, constraints, and preferences; Daneel can produce a policy of action that responds to what he actually finds.

That creates three linked ideas:

- Distance forces abstraction: commands become tasks, goals, policies, and values.
- Shared vocabulary increases useful meaning per bit, without increasing Shannon channel capacity.
- Delegation is also governance: the player must decide what Daneel may do autonomously, what requires permission, and what must never happen.

The human remains essential because visual judgment is not reduced to a tool call. The agent remains essential because a fixed command cannot anticipate a world that changes during transmission.

## The three missions

1. **The First Light** — learn that an order aimed at an old map is not a plan for the present colony. Build connected housing and redundant power for 100 settlers, then survive a seeded interruption.
2. **The Meaning of Enough** — express a goal with reserve floors, ecological constraints, and preferences. Maintain 24 months of food and a 20% power reserve without losing protected wetlands, within a 2,800-bit transmission window.
3. **The Right to Decide** — define an autonomy envelope. Launch 1,000 tonnes of iridium while maintaining life support and protecting native habitat; asking for permission is itself delayed and costly.

The game is intentionally bounded: three authored missions, roughly 20–30 minutes depending on agent response time, and no endless-mode economy. The ending is a functioning colony and an unresolved political question—not a claim that Earth should govern forever.

## What is implemented

The current playable slice includes:

- A deterministic browser simulation with delayed uplink/downlink packets, transmission windows, seeded events, construction jobs, robot labor, roads, power/water/food networks, and mission outcomes.
- A real Three.js isometric colony with selectable geometry, shadows, moving robots, minimap, planned-order ghosts, ecology, and an Earth-only observed-world projection.
- A shared-codebook protocol for Mission II, authorization round-trips for Mission III, delayed reports, yearly telemetry, coast-to-arrival controls, and a received-event debrief.
- Native `document.modelContext.registerTool` feature detection and a structured Daneel tool surface. The page never substitutes a scripted steward when native tools are unavailable.
- Browser-only persistence in versioned localStorage. There is no game backend, database, cloud save, independent MCP server, or model API owned by the game.

Local tests and the production build pass. Native Daneel gameplay still needs verification in a compatible ChatGPT Desktop/browser environment; see [implementation status](docs/IMPLEMENTATION-STATUS.md).

## Design and implementation notes

The documentation is part of the project because this repo is both a game and a WebMCP demonstration:

- [Design specification](DESIGN.md) — story, causal model, missions, gameplay, scoring, UI, and acceptance criteria.
- [WebMCP contract](docs/WEBMCP.md) — session lifecycle, tool surface, authority, message accounting, and native integration boundary.
- [Browser-only state](docs/LOCAL-STATE.md) — localStorage persistence, one owning tab, recovery, and save guarantees.
- [Daneel startup/resume prompt](docs/DANEEL-START-PROMPT.md) — the intended human-agent onboarding flow.
- [Implementation status](docs/IMPLEMENTATION-STATUS.md) — local evidence versus native-agent evidence.
- [Implementation handoff](docs/IMPLEMENTATION-HANDOFF.md) — the original execution plan and acceptance tests.
- [Art direction](docs/ART-DIRECTION.md) and [asset provenance](docs/ASSET-PROMPTS.md) — visual language and concept-art boundaries.
- [Screenshot archive](docs/progress/) — progress evidence and visual targets.

## Run locally

```sh
npm install
npm test
npm run dev -- --port 4173
```

Open `http://localhost:4173/`. Manual play is always available. A real connected host agent is required for Daneel; the page never fakes that connection.

For a production build:

```sh
npm run build
npm run preview -- --port 4174
```

For the browser smoke test, install `playwright-core` (or `puppeteer-core`) and provide a Chromium binary:

```sh
npm i playwright-core
npm run dev -- --port 4173 &
BROWSER_PATH=/path/to/chromium node scripts/e2e.mjs
```

## Deployment

The public demo is deployed through GitHub Pages:

<https://rhnvrm.github.io/alpha-centauri/>

The Pages workflow runs the test suite and production build before publishing `dist/`. The app is static; game state remains local to the browser origin where a player starts it.

## Native integration boundary

The remaining acceptance test is a real Daneel session in a supported Desktop/browser environment: discover the page tools, connect to the correct session, observe only delivered mail, perform a local action, send a causally delayed report, exercise bounded wait/resume, and verify cleanup. The current host has a documented Browser plugin version mismatch, so local JavaScript tests are reported separately from native-agent evidence.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository's Conventional Commits policy.
