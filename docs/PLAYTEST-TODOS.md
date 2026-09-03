# Live playtest findings — Northern Reach

**Runs:** Earth and Daneel, native in-app browser + WebMCP  
**Valid result:** Fresh Northern Reach session `session-jxevh4w`: Daneel surveyed the ridge, launched 1,000t of iridium at day 260, cargo completed day 350, and Earth received `TRUST EARNED` at day 2325. `COMPLETE · CONFIRMED` is now grounded in a successful current-balance run.

**Invalidated observation:** The earlier retained session `session-m1vad6h` had already collapsed at day 178 under the pre-balance save. Its old mission-result packet arrived later, so it could not validate the subsequent cargo action. It was discarded rather than treated as a successful run.

## Findings for the next implementation pass

### 1. Exploration has no information value

- **Role / moment:** Earth, viewing the opening colony reconstruction; Daneel, after scheduling the ridge survey.
- **Expected:** The survey rover should reveal an unknown world: traversable terrain, deposits, hazards, and valid expansion sites.
- **Actual:** The entire colony map is legible from day zero. The survey completes deterministically, but does not reveal a meaningful new part of the world. The rover has no strategic information role.
- **Fix:** Introduce mission-authored fog-of-war / reconnaissance layers. Render unrevealed cells distinctly; reveal bounded regions around survey jobs and make deposits, hazards, and buildability depend on received survey data.

### 2. Vehicles do not enact their stated jobs

- **Role / moment:** Daneel, cargo launch on local days 535–625.
- **Expected:** A cargo hauler should visibly collect and carry the export; construction and survey units should travel to active work and expose `en route` / `working` states.
- **Actual:** The cargo job completed, while the cargo hauler remained `idle` at its starting coordinates. Construction and cargo vehicles are currently role-labelled sprites, not causal simulation actors.
- **Fix:** Bind job lifecycle to suitable robots, generate paths to a job target, animate status/motion through `en-route` and `working`, and release the robot after completion. Make the player able to inspect the assignment and time-to-complete.

### 3. Relay summary contradicts confirmed state

- **Role / moment:** Earth, immediately after receiving the mission-result packet.
- **Expected:** The active relay card should identify the newest received packet and explain what `captured day` and `Earth receipt day` mean.
- **Actual:** The top bar correctly became `COMPLETE · CONFIRMED`, but the correspondence panel continued to lead with `Bootstrap observation` and “No downlink has arrived.”
- **Fix:** Derive the relay hero card from the newest delivered report/mission result, add compact capture/receipt labels, and make the confirmation state explicit.

### 4. Time controls work but do not communicate the outcome boundary

- **Role / moment:** Earth, `NEXT EVENT` followed by `EARTH` receive.
- **Expected:** It should be obvious whether the next jump is local work completion, a message arrival, or the final mission confirmation.
- **Actual:** The controls functioned, but the outcome arrived with little anticipation; the relationship between local day, packet capture, and Earth receipt remains easy to misread.
- **Fix:** Make the next-event and Earth-event buttons name their pending boundary (for example, `NEXT: cargo launch · day 625` and `RECEIVE: mission result · 4.37y`).

## Regression checkpoints

1. Start Northern Reach with the world visibly unrevealed outside the initial relay radius.
2. Run a Daneel survey and observe a new safe area / resource signal become visible.
3. Launch cargo and watch the hauler animate through its job, then return idle.
4. Receive the outcome as Earth and confirm that the relay hero shows mission result rather than bootstrap copy.

### 5. Command desk clips at the active browser width

- **Role / moment:** Earth, live in-app browser at a 1600px-wide desktop viewport after a received telemetry packet.
- **Expected:** The top time controls, Earth date, correspondence heading, and relay card remain completely legible without relying on page scrollbars.
- **Actual:** Horizontal content is clipped: the top-right command controls/date and `Daneel / Correspondence` heading lose their right edges. The no-scrollbar rule currently hides rather than resolves the overflow.
- **Capture:** `docs/playtest-captures/northern-reach-fog-and-command-desk-before.png`
- **Fix:** Make the command-shell columns and top controls adapt at constrained desktop widths: preserve a readable correspondence rail, compact/reflow time controls, and avoid clipping any interactive control or receipt label.

### 6. Fog hides terrain but leaks remote structures

- **Role / moment:** Earth, Northern Reach, immediately after opening a fogged Earth-side reconstruction.
- **Expected:** Outside the received survey area, neither terrain nor identifiable colony structures should provide actionable information.
- **Actual:** The terrain is fogged, but distant launch-pad and industrial sprites remain visibly recognizable beyond the revealed island. This makes fog look decorative and reveals strategic infrastructure.
- **Capture:** `docs/playtest-captures/northern-reach-fog-and-command-desk-before.png`
- **Fix:** Apply the Earth knowledge mask consistently to buildings, robots, roads, selections, and minimap markers; retain only deliberately permitted remote relay cues. Superposition remains the explicit read-only exception.

### 7. Onboarding makes the Daneel handoff feel like documentation

- **Role / moment:** Earth, fresh First Light onboarding screen in the in-app browser.
- **Expected:** The player can understand the mission, copy the Daneel handoff, and enter the command desk in a few seconds.
- **Actual:** The screen leads with a large scrollable block of operational prompt text. It reads as a manual, competes with the mission briefing, and makes the first interaction feel daunting.
- **Capture:** `docs/playtest-captures/first-light-onboarding-before.png`
- **Fix:** Collapse the full prompt behind a single `Copy Daneel brief` action. Surface only a short three-step handoff summary, a clear copy-confirmation state, and the start button; retain access to the full text for inspection without making it the visual center.

### 8. Responsive desk fix still fails visual regression

- **Role / moment:** Earth, First Light command desk, after the first responsive-layout implementation.
- **Expected:** The saved 1600px desktop command-desk capture should show complete top controls, Earth date, and correspondence heading after the fix.
- **Actual:** The current live screenshot still clips the right edge of all three. CSS token tests pass, but the rendered game does not satisfy the intended viewport.
- **Capture:** `docs/playtest-captures/northern-reach-fog-and-command-desk-before.png` (same geometry; rerun live after the implementation).
- **Fix:** Replace token-level layout assertions with a browser-layout measurement/check. Account for the actual game shell width and fixed rail positions rather than only adding a media query.

### 9. Earth’s event control leaks Daneel’s unreceived local work

- **Role / moment:** First Light, Earth desk, while the connected Daneel scheduled a solar array locally. Earth’s last observed day was still 0 and no downlink had arrived.
- **Expected:** Earth should see only an honestly labelled simulation control such as “advance local time”; it must not learn which local activity will happen next before a report has crossed the gap.
- **Actual:** The control said `NEXT: CONSTRUCTION COMPLETE · DAY 76`, revealing both that Daneel had chosen construction and its completion date despite the relay still saying “No downlink has arrived.”
- **Capture:** `docs/playtest-captures/first-light-earth-while-daneel-builds.png`
- **Fix:** On the Earth view, hide local job/event names and dates until telemetry arrives. Keep a role-neutral advance affordance; reserve the precise event schedule for Daneel and Superposition.

### 10. Superposition’s 30-second read-only pass drains at simulation cadence

- **Role / moment:** First Light, Earth, immediately after spending the first Superposition pass while a local construction job was active.
- **Expected:** A pass labelled “30s local view” should last approximately 30 wall-clock seconds, independent of the colony’s simulation tick rate, and visibly count down.
- **Actual:** The badge fell from 30 seconds to 8 and then 1 during a short live observation (well under a 30-second wall-clock pass). It did not remain a dependable observation window.
- **Captures:** `docs/playtest-captures/first-light-superposition-live.png`, `docs/playtest-captures/first-light-superposition-ended-early.png`
- **Fix:** Drive the pass from a monotonic real-time deadline, not simulation advances or render ticks; keep the countdown legible and restore the normal Earth reconstruction only at expiry.

### 11. Home screen does not use the available viewport as a mission entry point

- **Role / moment:** Earth, title screen, live in-app browser at the normal desktop viewport.
- **Expected:** The opening screen should establish a composed, legible mission-control atmosphere and make continuing or choosing one of three scenarios feel intentional.
- **Actual:** The hero composition is confined to a narrow central/left column with a large dead black area on the right. Mission and footer copy are dim/small, and the Continue card visibly truncates an opaque session identifier.
- **Capture:** `docs/playtest-captures/home-screen-before-spruce.png`
- **Fix:** Rebalance the full-viewport title composition while retaining the existing hero art; raise typography and interactive-card hierarchy, give the entry actions clear focus/hover states, and suppress implementation-only session identifiers.

### 12. First responsive reflow still clips the live embedded command desk

- **Role / moment:** Earth, First Light command desk, live in-app browser after `fix: keep command desk within viewport`.
- **Expected:** The actual rendered browser view fits all top-bar dates, controls, correspondence title, rail copy, and the lower command card within the visible shell.
- **Actual:** The screenshot still clips the right half of the correspondence heading, the Earth date, intent panel, and several time controls. The browser image is 1600px wide, but the game shell’s effective layout width is narrower than the CSS breakpoint assumes.
- **Capture:** `docs/playtest-captures/command-desk-responsive-after.png`
- **Fix:** Measure and adapt to the actual shell/container width, not only `window.innerWidth`; collapse or reflow rail/controls before any right edge escapes.

### 13. Redesigned title screen clips the mission choice cards at desktop height

- **Role / moment:** Earth, title screen, normal in-app desktop viewport after the visual title-screen redesign.
- **Expected:** Continue and all three complete mission cards are visible and actionable in the fixed no-scroll frame.
- **Actual:** The hero/relay composition is now strong, but the lower portions of the mission cards are cut off below the viewport. This makes the mission choices look unfinished and hides useful copy.
- **Capture:** `docs/playtest-captures/home-screen-after-spruce.png`
- **Fix:** Preserve the full-bleed visual composition while vertically budgeting the intro, relay, Continue action, and complete cards for the real desktop viewport.

## Fresh First Light completion — session `session-jhjqr1y`

**Validated outcome:** Daneel inspected the day-zero charter, built a second solar source and a habitat locally, and kept the colony through the 180-day interruption. Earth received `OBJECTIVE SECURED` captured on colony day 359 on Earth day 1954. The live relay capture/receipt labels and the outcome agree.

### 14. Completion has no visible route into the debrief or next mission

- **Role / moment:** Earth, immediately after the First Light mission-result packet arrived and the header became `COMPLETE · CONFIRMED`.
- **Expected:** The confirmed end state should present a prominent, unambiguous action to review the debrief and continue to mission selection.
- **Actual:** The desk says “Review the confirmed outcome,” but exposes no visible debrief button. The only known path is the unstated `Esc` mission-select shortcut followed by Continue, which is not a completion flow.
- **Capture:** `docs/playtest-captures/first-light-complete-live.png`
- **Fix:** Add a clear primary `Review mission debrief` action at confirmation, with a secondary return-to-missions action.

### 15. Confirmed missions leave dead transmission and simulation controls exposed

- **Role / moment:** Earth, same confirmed First Light end state.
- **Expected:** A completed, paused mission should make its terminal state obvious and prevent or clearly explain actions that can no longer affect it.
- **Actual:** The live desk still presents `WRITE AN INTENT`, `TRANSMIT INTENT`, `RESUME`, manual day jumps, and speed controls—even though the header is confirmed and no later Earth action can change the completed result.
- **Capture:** `docs/playtest-captures/first-light-complete-live.png`
- **Fix:** Replace or disable terminal controls with a concise completed-state panel; retain relay history as read-only evidence.

### 16. The final Earth view gives no synthesized account of what the colony achieved

- **Role / moment:** Earth, after receiving `OBJECTIVE SECURED`.
- **Expected:** A final result should translate the delayed packet into the resources/conditions the player earned: capacity reached, independent power sources, outage survived, and what Earth can honestly know.
- **Actual:** The only summary is the generic result sentence. The top resource strip still visually reads as the day-zero projection, while the player has no final mission-specific explanation without hunting through sparse relay copy.
- **Capture:** `docs/playtest-captures/first-light-complete-live.png`
- **Fix:** Add a compact outcome debrief with goal-by-goal evidence and a deliberately labelled “last received colony state,” rather than leaving the opening metrics to carry the conclusion.

## Current-code First Light completion — session `session-8cqtyev`

**Validated outcome:** Under the new mission-result payload format, Earth received capacity `100`, two independent sources, and a 180-day interruption survival record with capture day 359 / receipt day 1954. The terminal controls became read-only and the debrief route works, but the following live visual defects remain.

### 17. Confirmed mission evidence overlaps into an unreadable block

- **Role / moment:** Earth, opening the current-code First Light debrief after pressing `Review mission debrief`.
- **Expected:** Goal-by-goal evidence and the received colony snapshot should read as a compact, scannable final report.
- **Actual:** The goal names, numeric values, snapshot heading, explanatory copy, and snapshot figures visually collide into one another. The evidence data is correct but the typography/layout defeats it.
- **Capture:** `docs/playtest-captures/first-light-debrief-current-code.png`
- **Fix:** Give evidence rows and received snapshot an explicit grid/stack layout, real spacing, semantic labels, and responsive wrapping; verify the actual desktop render.

### 18. Terminal confirmation presents the same debrief/navigation actions three times

- **Role / moment:** Earth, current-code confirmed First Light desk before opening the debrief.
- **Expected:** One obvious completion action area should replace mutable controls.
- **Actual:** The top confirmation banner, correspondence terminal panel, and lower terminal deck each offer overlapping debrief/mission-selection controls. This makes the terminal state more cluttered than the active game it replaced.
- **Capture:** `docs/playtest-captures/first-light-terminal-current-code.png`
- **Fix:** Choose a single primary completion action group; retain one compact read-only explanation in the other areas instead of repeating navigation.

### 19. Debrief still displays a stale “confirmed through” date beside current received evidence

- **Role / moment:** Earth, same current-code First Light debrief.
- **Expected:** Date labels must distinguish the founding/previous Earth projection from the actual final packet receipt.
- **Actual:** The debrief correctly says the snapshot was captured day 359 and received day 1954, but its metric grid says `CONFIRMED THROUGH 2280.01`, suggesting day-zero knowledge and contradicting the terminal narrative.
- **Capture:** `docs/playtest-captures/first-light-debrief-current-code.png`
- **Fix:** Replace this stale metric with explicit colony capture and Earth receipt dates sourced from the confirmed result; reserve “last observed” for the projection only.

### 21. The final received timeline is cut off inside the fixed no-scroll debrief viewport

- **Role / moment:** Earth, First Light debrief after receiving the confirmed result in the live WebMCP run.
- **Expected:** The final evidence and received timeline should be legible as a complete end-of-mission report at the supported embedded desktop viewport, without exposing a page scrollbar.
- **Actual:** The evidence section now reads cleanly, but the lower received timeline extends below the fixed 1384px viewport and is clipped. The document deliberately has `overflow: hidden`, so there is no reachable way to inspect its final entries.
- **Capture:** `docs/playtest-captures/first-light-debrief-build-mode-run.png`
- **Fix:** Budget the debrief for the actual fixed viewport: compact the header/metric area, progressively disclose or constrain the timeline, and keep all remaining completion actions visible without introducing vertical scrolling.

### 22. Mission 2 can be won by waiting because its initial reserves dwarf its stated two-year challenge

- **Role / moment:** Daneel, fresh `The Meaning of Enough` run, after reading the charter, inbox, current colony inspector, and resource network through native WebMCP.
- **Expected:** The food/power/wetland objective should create a legible local tradeoff: Daneel must make an authorized production, network, or protection decision to sustain the colony for the required two years.
- **Actual:** The Earth HUD starts at about 23 years of food and 25 years of water. Daneel's local inspector shows 277.6 months of food and a 74% power reserve for a goal requiring only 24 months and 20%. There are no immediate local events or binding inbox decisions, so yielding and waiting is the safe winning strategy.
- **Capture / evidence:** Native WebMCP `inspect_colony` and `inspect_resource_network` on fresh session `session-x0at28n`; the visible Earth charter/HUD recorded the 23y/25y values.
- **Fix:** Rebalance or structure Mission 2 around an actual sustainable-production tradeoff: start near the 24-month reserve floor, introduce a predictable degradation/seasonal constraint, and expose one or two authorized choices (for example greenhouse rate vs. wetland protection, or water/power network investment) whose consequences Daneel must manage locally.

## Fresh Earth command-desk inspection — build/selection flow

### 20. Construction is implicitly armed, so ordinary world inspection is ambiguous

- **Role / moment:** Earth, fresh First Light command desk before any correspondence; choose a building in the Earth Order control and then try to inspect a rover, facility, or map tile.
- **Expected:** The map should begin in a clear **Select** mode where clicking received buildings and rovers always inspects them. Construction should require an explicit **Build mode**, show a placement preview only while that mode is active, and provide a visible cancel/escape route back to selection.
- **Actual:** The Earth Order panel always has a building selected and any selected tile immediately becomes a construction target with a build ghost. Worse, a live click directly on the visible rover selected its underlying `tile-17-19`: transparent tile pick meshes win the Three.js raycast over units. This makes click intent unclear and causes units to be effectively inaccessible in the normal flow.
- **Captures:** `docs/playtest-captures/build-selection-before.png`, `docs/playtest-captures/build-selection-tile-armed.png`
- **Fix:** Add mutually exclusive Select / Build / Road / Rover-move interaction modes. Keep Select as the default, never show a build ghost outside Build mode, make build controls explicitly arm/cancel the mode, and give the map hint and selected-object panel an unambiguous current-mode label. In the scene raycast, prioritize buildings/robots over their transparent underlying tile target, then fall back to the tile.
- **Resolution (live verified):** `fix: make Earth construction mode explicit` adds the explicit command modes. The scene selector now carries entity coordinates and ranks robot/building hits above tile targets. In the current WebMCP session, clicking the visible rover selected `rover-1`; entering Build mode showed the placement instructions, and cancelling returned the desk to Select mode. Capture: `docs/playtest-captures/build-selection-live-verified.png`.
