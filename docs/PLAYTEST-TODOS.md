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
