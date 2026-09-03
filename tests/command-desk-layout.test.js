import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('rendered command-desk layout is covered by the browser smoke test', () => {
  assert.match(fs.readFileSync(new URL('../scripts/e2e.mjs', import.meta.url), 'utf8'), /command desk fits the viewport/);
});
