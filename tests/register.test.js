import test from 'node:test';
import assert from 'node:assert/strict';
import { registerNativeTools } from '../src/webmcp/register.js';

test('native registration waits briefly for a host that attaches modelContext after mount', async () => {
  const originalDocument = globalThis.document;
  const calls = [];
  globalThis.document = {};
  try {
    const pending = registerNativeTools([{ name: 'inspect_colony' }], {
      discoveryTimeoutMs: 100,
      retryIntervalMs: 5,
    });
    setTimeout(() => {
      globalThis.document.modelContext = {
        registerTool: async (tool) => calls.push(tool.name),
      };
    }, 10);
    assert.deepEqual(await pending, { supported: true, registered: ['inspect_colony'] });
    assert.deepEqual(calls, ['inspect_colony']);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('native registration reports unavailable once its discovery window closes', async () => {
  const originalDocument = globalThis.document;
  globalThis.document = {};
  try {
    const result = await registerNativeTools([], { discoveryTimeoutMs: 1, retryIntervalMs: 1 });
    assert.equal(result.supported, false);
    assert.match(result.reason, /modelContext/);
  } finally {
    globalThis.document = originalDocument;
  }
});
