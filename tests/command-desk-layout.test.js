import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('rendered command-desk layout is covered by the browser smoke test', () => {
  assert.match(fs.readFileSync(new URL('../scripts/e2e.mjs', import.meta.url), 'utf8'), /command desk fits the viewport/);
});

test('confirmed command desk switches to a terminal read-only state', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /const missionConfirmed = missionStatus\.complete/);
  assert.match(app, /MISSION TERMINAL · READ ONLY/);
  assert.match(app, /REVIEW MISSION DEBRIEF/);
  assert.match(app, /EARTH COMMAND CLOSED/);
  assert.match(app, /SIMULATION TERMINAL/);
  assert.match(app, /screen !== "play" \|\| missionConfirmed/);
});
