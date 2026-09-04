---
name: in-app-browser-preflight
description: Verify that a Codex task has a real in-app Browser bridge before attempting browser-driven gameplay, WebMCP validation, or visible recording. Use for local interactive demos; do not use for ordinary unit tests.
---

# In-app Browser Preflight

Use this before claiming a visible playthrough, native WebMCP interaction, or
recording that must show genuine in-app browser input.

1. Check whether the Browser plugin is actually exposed in the current task.
   When the Node REPL is available, emit—not merely evaluate—the capability
   check:

   ```js
   nodeRepl.write(JSON.stringify({ agent: typeof agent, browser: typeof browser }))
   ```

2. A usable bridge requires the relevant browser globals/tools to exist. Do not
   infer access from an ambient browser URL, a running local server, or the
   presence of the Node REPL alone.

3. When available, use the Browser plugin's visible accessibility/CUA actions
   for interaction. Do not substitute CDP clicks, direct localStorage changes,
   page-script injection, or engine calls when validating a real game loop.

4. When unavailable, report the exact missing capability and restrict claims to
   source, build, and deterministic test evidence. Do not describe that work as
   a playtest or WebMCP verification. Preserve the local server/save; the user
   can reconnect an enabled browser task later.

5. Re-run the preflight after a new task, plugin change, or browser reconnect;
   capability is task-scoped and should not be assumed from another session.
