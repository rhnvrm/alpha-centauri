# Browser-only state and persistence

Status: implementation specification. This documents the user's explicit no-backend constraint; it does not claim the persistence layer is already implemented.

## Fixed boundaries

- All durable game state is in **localStorage**. No database, IndexedDB save, server, API route, cloud synchronization, or separate MCP daemon.
- The static page runs the simulation and registers WebMCP tools. Daneel's tools invoke local functions, not a remote game endpoint.
- React and the 3D scene consume projections of one store. They do not own independent copies of game state.
- An in-memory working copy is necessary while the page is running; the durable checkpoint is localStorage. Native browser coordination primitives do not introduce another persistent state store.
- The host's connected model supplies reasoning. There is no model key in the web bundle and no game-owned inference backend. This is not a promise that the external agent can reason offline.
- Save data belongs to an origin and browser profile. A new hostname, port, protocol, profile, or device is not the same save location. A session URL identifies a local save; it does not carry one.
- Closing the page suspends the game. Load at the last committed simulation day, paused. No offline production, hidden simulation tab, or wall-clock catch-up.

## Data flow

```text
human mouse / composer ─→ queue Earth packet ─┐
                                             │
Daneel's WebMCP tools ─→ validated local action├─→ pure reducer / event engine
                                             │             ↓
simulation clock ─→ bounded event step ───────┘       proposed next state
                                                           ↓
                                            localStorage checkpoint succeeds
                                                           ↓
                                               publish revision / render
                                                 ↙                 ↘
                                          Earth projection      local tool result
```

Human commands are still delayed. Sharing a JavaScript process and storage does not make the fictional radio instantaneous. Projections and tool validation enforce game causality.

## Save format

Use one versioned canonical record per campaign save, under a narrowly scoped key such as `intent-horizon:save:v1:<sessionId>`. Keep a small separate index for the save picker, reconstructable from the matching game-prefixed keys if index maintenance was interrupted. Never enumerate or export another application's storage records.

The canonical record contains:

- Schema version, session identity, deterministic scenario seed, and RNG state.
- Mission, simulation day, time-unit constants, state revision, and checkpoint state.
- Actual local colony: terrain changes, structures, robots, jobs, resource stocks/flows, network topology.
- Received Earth reconstruction plus undelivered telemetry deltas and their delivery times.
- Uplink/downlink queues, delivered inbox, reports, channel budgets/windows, and byte accounting.
- Delivered doctrines, versioned shared protocols, and bounded registered policies.
- Objective progress, score components, distinct durable inbox/event cursors, handled-message IDs, explicitly pending decisions, and compact debrief events.
- Durable mutation receipts keyed by operation ID, including canonical argument fingerprint and result metadata.

Do not store textures, images, meshes, giant per-frame world snapshots, React component state, WebMCP runtime handles, timers, or active locks in localStorage. Static art is bundled with the site. Rebuild derived graphs, render data, and lookup indexes from validated saved inputs.

Agent connection handles, runtime incarnation ID, and active lease expiration are ephemeral. Reloading creates a new runtime incarnation and invalidates any old lease. An old operation receipt remains durable for recovery, but an old tab/agent must reconnect before querying or writing.

## Commit discipline

1. Serialize all engine changes through one local mutation queue, including human interactions, clock ticks, and WebMCP calls.
2. Validate the session, runtime lease where applicable, operation ID, revision, inputs, authority, and resources.
3. Compute next state without mutating the committed working state. Advance by bounded deterministic event steps, not render frames.
4. Serialize and validate a single complete checkpoint containing both the gameplay effect and the receipt.
5. Call `localStorage.setItem` for that save key inside error handling.
6. Only after successful persistence, replace the in-memory committed state, notify UI subscribers, resolve event waiters, and return tool success.

Do not claim a multi-key transaction. The game record is authoritative; the picker index is derived convenience metadata. Do not acknowledge a local job and then defer saving its idempotency receipt.

For clock advancement, keep event batches and checkpoints bounded to avoid blocking the UI. Cosmetics use animation frames without saves. Debounced preferences may be separate, but a successful game mutation must not depend on an eventual `beforeunload` write.

## One owning tab

localStorage is not a reliable compare-and-swap lock. The [HTML Web Storage standard](https://html.spec.whatwg.org/multipage/webstorage.html) warns authors against assuming cross-context locking. Do not implement "read lease, then write lease" as if it were mutually exclusive.

Proposed mechanism: feature-detect [Web Locks](https://www.w3.org/TR/web-locks/) and acquire one exclusive same-origin game-writer lock, `intent-horizon:writer`, for the lifetime of the owning page. It gates the simulation, save changes, and agent mutations. This is a browser-native coordination primitive, not a backend or a second persistence system.

- The first tab owns the engine. Human and agent share **that same page**.
- Another tab is a read-only viewer with a visible "Game running in another tab" notice. It must not register functional mutation tools or advance time.
- The storage event can refresh received Earth state in a viewer. Never forward the current local colony into its public UI.
- Switching ownership requires the old owner to release/close; do not silently steal its lock or run two stewards.
- On loss of ownership, invalidate the local lease and pause immediately.
- If native locking is unavailable, explain the compatibility requirement and allow read-only inspection/export rather than promise race-free writes using localStorage alone. Investigate only browser-native alternatives; do not add a server.

## Storage failure and recovery

- Probe storage availability before starting a new game. Treat access denial, full storage, private-mode limitations, parse errors, and unsupported schema versions as separate visible states.
- Failed writes keep the last committed world unchanged and pause further simulation mutations. Show an honest unsaved/storage-error notice; never display "Saved" before success.
- Preserve a corrupt or newer-version raw save. Offer explicit download/export and recovery options; never automatically overwrite it with a new game.
- Optional JSON export/import is a user-initiated file transfer, not a second automatic state store or cloud save. Export only this game's selected save; warn that it includes local/future information and is spoiler-bearing.
- Validate import size, schema, finite numeric ranges, map/entity limits, references, packet times, job dependency cycles, and revision/receipt structure. Treat imported text as data, not code. Import into a new session identity after user confirmation so old agent handles remain invalid.
- Clearing the browser's site data removes the game. Communicate that clearly and offer export. New Game and Reset affect only the exact selected game record; never call `localStorage.clear()`.

## Bounded storage, not unbounded snapshots

localStorage is synchronous and capacity-limited. Track serialized save size and test on the target browser. Define a conservative measured size budget rather than assume a universal quota.

Retain the current local state, received Earth reconstruction, pending delayed deltas, and bounded mission events needed for a three-level debrief. Coalesce telemetry only when delivery semantics and reserved bandwidth accounting remain correct. Store compact primitive data and regenerate renderer artifacts.

Never prune an undelivered message, a delta necessary for a future reconstruction, an unresolved job, or an idempotency receipt still eligible for retry. A documented receipt-retention window must reject retired operation IDs rather than accidentally execute an old retry again. At this demo's small scope, prefer retaining all gameplay mutation receipts until the mission/session is explicitly retired.

## Acceptance checks

1. The built site serves only static assets; no game-state or inference endpoint is required.
2. A localStorage checkpoint restores the exact simulation day, packet ETAs, goals, jobs, authority, and received observations after reload.
3. Loading is paused and requires a fresh agent connection; no elapsed wall-clock catch-up occurs.
4. A successful tool response survives immediate reload without losing or duplicating its mutation.
5. A full or denied storage store refuses the mutation and leaves the last valid checkpoint intact.
6. Two tabs cannot both own the simulation or mutate saves. The second tab identifies itself as read-only.
7. Save keys and session fragment URLs remain origin-local; a missing save is not silently recreated when the agent opens a different browser/profile.
8. A corrupted/newer save is preserved and exportable; reset requires an explicit user action on an exact game key.
9. The human can see only received projections even though the local save necessarily includes both sides of the simulated light cone.
10. Export/import recovery is schema-validated, explicit, scoped, and never a requirement to configure a backend.
