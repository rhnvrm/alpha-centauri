export async function registerNativeTools(toolDefinitions, { signal } = {}) {
  const modelContext = globalThis.document?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return { supported: false, registered: [], reason: 'This browser does not expose document.modelContext.registerTool.' };
  const registered = [];
  for (const definition of toolDefinitions) {
    if (signal?.aborted) break;
    await modelContext.registerTool(definition, { signal });
    registered.push(definition.name);
  }
  return { supported: true, registered };
}
