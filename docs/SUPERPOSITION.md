# Superposition visual diagnostic

Superposition is a deliberately exceptional, browser-local visual mode. It temporarily renders the live local state—the view available to Daneel—while the normal map continues to render only `observedWorld` received at Earth.

## Invariant

- A pass lasts at most **30 real-time seconds**.
- Starting a pass consumes one of **two persistent parity passes** for that saved mission.
- A second pass cannot start until **60 real-time seconds** after the previous start.
- The store, rather than the component timer, enforces the duration and cooldown timestamps. Reloading the page cannot reset either rule.
- The mode is visual/read-only: it does not advance local days, alter resources, queue packets, or update `observedWorld`. Tile selection is disabled while active.
- On expiry, `ColonyScene` immediately returns to Earth mode and hides live queued work again. Inactive Earth mode never reads local buildings, robots, or roads for rendering.

The cost is intentionally not a fictional signal transfer: it is a scarce, persistent diagnostic/parity-pass budget. This is feasible in-browser, is visible to the player before activation, and prevents the local view from becoming the default way to erase the light-cone constraint.
