const unavailable = () => ({
  supported: false,
  registered: [],
  reason: 'This browser does not expose document.modelContext.registerTool.',
});

const waitFor = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve();
  const finish = () => {
    signal?.removeEventListener('abort', abort);
    resolve();
  };
  const abort = () => {
    clearTimeout(timer);
    finish();
  };
  const timer = setTimeout(finish, ms);
  signal?.addEventListener('abort', abort, { once: true });
});

// Desktop hosts can attach modelContext just after the application mounts. Give
// that hand-off a short, cancellable window instead of permanently publishing an
// unavailable status from the first render.
export async function registerNativeTools(toolDefinitions, {
  signal,
  discoveryTimeoutMs = 0,
  retryIntervalMs = 250,
} = {}) {
  const deadline = Date.now() + Math.max(0, discoveryTimeoutMs);
  let modelContext = globalThis.document?.modelContext;
  while ((!modelContext || typeof modelContext.registerTool !== 'function') && !signal?.aborted && Date.now() < deadline) {
    await waitFor(Math.min(retryIntervalMs, Math.max(0, deadline - Date.now())), signal);
    modelContext = globalThis.document?.modelContext;
  }
  if (!modelContext || typeof modelContext.registerTool !== 'function') return unavailable();
  const registered = [];
  for (const definition of toolDefinitions) {
    if (signal?.aborted) break;
    await modelContext.registerTool(definition, { signal });
    registered.push(definition.name);
  }
  return { supported: true, registered };
}
