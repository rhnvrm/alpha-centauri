# The Intent Horizon

A three-level isometric 3D strategy demo about lightspeed, communication, and agency. The player is Earth; a real WebMCP-connected agent is Daneel, the colony's local steward.

**Entirely client-side.** The browser runs the simulation and WebMCP handlers; localStorage holds all persistent game state. No backend, database, model API, independent MCP server, or cloud save. Build artifacts can be served by any static web host. The connected host agent still needs its normal model connection—backend-free does not mean offline AI inference.

## Current state

**Implemented and verified locally.** Deterministic engine with transmission windows, seeded scenario events, road/power/water/food networks, robot labor, a shared-codebook protocol, authorization round-trips, and delayed mission outcomes; a real Three.js isometric colony that shows **only what Earth has actually received** (observed-world projection, not the live colony); channel pacing with coast-to-arrival and yearly autonomous telemetry; a guided-first-mission tutorial; and 64 unit tests plus an 18-step browser end-to-end test. The production build was smoke-tested in headless Chromium (WebGL 2.0, zero page errors). Native Daneel integration remains unverified on the current host due to a documented Browser plugin version mismatch; see [implementation status](docs/IMPLEMENTATION-STATUS.md).

## Design package

- [Implementation handoff and milestone test plan](docs/IMPLEMENTATION-HANDOFF.md)
- [Full concept, story, three missions, gameplay, UI, and acceptance criteria](DESIGN.md)
- [WebMCP architecture and proposed tool contract](docs/WEBMCP.md)
- [Browser-only state, localStorage persistence, and recovery](docs/LOCAL-STATE.md)
- [ChatGPT Desktop startup and resume prompts](docs/DANEEL-START-PROMPT.md)
- [Art direction and bounded asset manifest](docs/ART-DIRECTION.md)
- [Visual-generation prompts and provenance](docs/ASSET-PROMPTS.md)
- [Screenshot progress archive](docs/progress/)
- [Main-play visual target](docs/concepts/main-play-v1.png)
- [Structures and robots concept sheet](docs/concepts/structures-and-robots-v1.png)

## The three missions

1. **The First Light** — old coordinates versus local decisions. Reach 100-person capacity with two independent power sources and ride out the seeded 180-day interruption.
2. **The Meaning of Enough** — goals, constraints, and a shared codebook. Hold 24 months of food and a 20% power reserve for two local years with zero wetland loss, under a 2,800-bit window budget.
3. **The Right to Decide** — permission, reversible action, and trust. Export 1,000 t of iridium before the deadline without destroying protected habitat; three distinct endings.

Every mouse order and written instruction travels for 1595 simulation days (4.37 years). Every report takes another 4.37 years to return. The agent acts through local WebMCP tools; it never receives faster-than-light messages.

## Run locally

```sh
npm install
npm test            # 57 deterministic engine/communications/network/level tests
npm run dev -- --port 4173
```

Open `http://localhost:4173/`. The app can be played manually; a real connected host agent is required for Daneel and is never simulated by the page.

### End-to-end smoke test

Requires `playwright-core` (or `puppeteer-core`) and a Chromium binary:

```sh
npm i playwright-core
npm run dev -- --port 4173 &
BROWSER_PATH=/path/to/chromium node scripts/e2e.mjs   # 18 checks: prompts, world, packets, doctrine, reload/continue
```

### Static production build

```sh
npm run build
npm run preview -- --port 4174   # serves dist/ with no dev server; the game state stays browser-local
```

## Native integration gate

Prove a real Desktop Daneel subagent can read a delivered inbox, invoke a local action, and send a causally delayed report through native WebMCP. Then treat the local acceptance as complete. The current host reproduces the documented Browser plugin mismatch (`browser-service.mjs` version drift) and cannot perform the live validation; a JavaScript test harness alone is not native-agent evidence. See [implementation status](docs/IMPLEMENTATION-STATUS.md) for the exact outstanding acceptance test.