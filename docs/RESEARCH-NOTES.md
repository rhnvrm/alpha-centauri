# Research notes — original task

Owner: original research/design task `01a06779-2f2f-7a10-ac1a-44af08713a4e`. Implementation should consume findings here; do not rewrite this file during concurrent work. Checked 2026-09-03 unless otherwise marked.

## Verified findings relevant to implementation

### R1 — Luna implementation is not Luna WebMCP gameplay

The user explicitly chose Luna for the implementation task. Preserve that choice. OpenAI's [Site tools documentation](https://learn.chatgpt.com/docs/webmcp) currently names Sol/Terra support and says Luna's site tools are disabled. Therefore writing/testing application handlers in Luna and proving native WebMCP calls are separate activities. The research task will handle the latter when the host browser is usable.

### R2 — Desktop registration target

The same [official page](https://learn.chatgpt.com/docs/webmcp) shows top-level `document.modelContext.registerTool` with a name, description, JSON input schema, annotations, and execute handler. It excludes declarative-form and iframe-registered tools in that browser. Use feature detection and keep registration isolated from the game core. No modelContext polyfill should make the UI announce native support.

This verifies a documented integration shape, not a successful runtime handshake for this project. Broader WebMCP standard/browser implementations may differ. Compatibility adapters must be checked, not guessed.

### R3 — Subagents and code loops are host capabilities

[Official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) describes explicit delegation. A plain Python/JS process is not automatically an authorized WebMCP client, nor an indefinitely running reasoning agent. Discover a supported host interface, return actionable events to real reasoning, and expose resume when host execution ends. The copy prompt already describes this conditionally.

### R4 — Browser plugin startup is currently blocked

Observed in this task: Browser initialization failed before any page opened, requesting `/home/rhnvrm/.codex/plugins/cache/openai-bundled/browser/26.831.21537/scripts/browser-service.mjs`. Read-only filesystem checks found only installed version `26.825.31414`. The user was asked to reload the app/plugin. No plugin files were modified, and no alternate browser was used.

This is evidence from the earlier attempt, not proof that a later task's runtime still fails. Try the prescribed Browser setup once when testing. If it recurs, record the exact error and continue unaffected application implementation. Do not spend the implementation budget reverse-engineering or modifying the user's browser plugin.

### R5 — localStorage needs explicit single-tab coordination

The [HTML Web Storage standard](https://html.spec.whatwg.org/multipage/webstorage.html) warns against assuming locking across contexts and specifies write failure behavior. Use one committed game record, guarded by an origin-wide browser writer lock; [Web Locks](https://www.w3.org/TR/web-locks/) provides the native coordination mechanism. Save and receipts must be committed together, and storage errors must not leave an acknowledged but unsaved action.

### R6 — current registration lifecycle uses an abort signal

The current [WebMCP specification](https://webmachinelearning.github.io/webmcp/) places the API on `document.modelContext`. `registerTool(definition, { signal })` returns a promise and an `AbortSignal` unregisters that registration. Older proposal examples using `navigator.modelContext` or a string-based `unregisterTool(name)` are stale relative to this draft. The registration adapter should create an `AbortController` for each active tool set, await registrations, and abort the old controller during route/session/ownership changes and unmount.

Do not assume ordering against unrelated timer tasks merely because the registration promise has not resolved; the specification notes separate task-source timing. For the app, await the registration promise before displaying the tool as registered, and make cleanup/re-registration explicit rather than racing session reset.

This is a draft standard under active development. The target Desktop implementation may expose only the subset documented by OpenAI. Feature-detect the exact API and verify lifecycle behavior in that client; do not add a `navigator.modelContext` fallback merely to satisfy old examples unless a target-client test proves it is required and the UI labels the compatibility path accurately.

## Open questions owned by research

- Native registration/discovery/execution in the actual Desktop browser and exact unregister/disposal behavior.
- Real subagent access to the same owning page, bounded wait cancellation, host timeout limits, and reconnect.
- Measured localStorage capacity/performance and Web Locks behavior in that environment.
- Source-backed science notes and concise in-game language for light delay, closed-loop agency, and semantic efficiency.
- Whether the generated asset direction needs a simpler but equally coherent geometry treatment for demo performance.

## Coordination

Implementation starts with the handoff in `docs/IMPLEMENTATION-HANDOFF.md`. Research will send actionable changes through task messages and update this file. Do not block normal coding on unresolved client-specific validation; report that test as unverified and retain truthful disconnected/manual modes.
