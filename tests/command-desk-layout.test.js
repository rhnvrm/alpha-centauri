import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('rendered command-desk layout is covered by the browser smoke test', () => {
  assert.match(fs.readFileSync(new URL('../scripts/e2e.mjs', import.meta.url), 'utf8'), /command desk fits the viewport/);
});

test('command desk keeps decisions ahead of secondary controls', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /selection-next/);
  assert.match(app, /primary-command/);
  assert.match(app, /secondary-actions/);
  assert.match(app, /time-cluster clock-cluster/);
  assert.match(app, /time-cluster speed-cluster/);
  assert.match(app, /time-cluster event-cluster/);
  assert.match(app, /RECOMMENDED FIRST DIRECTIVE/);
  assert.match(app, /USE AS DRAFT/);
  assert.match(app, /Scouts mapped/);
  assert.match(app, /store\.demoStep\(5 \* timeScale\)/);
});

test('confirmed command desk switches to a terminal read-only state', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /const missionConfirmed = missionStatus\.complete/);
  assert.match(app, /MISSION TERMINAL · READ ONLY/);
  assert.match(app, /Review mission debrief/);
  assert.match(app, /Return to mission selection/);
  assert.match(app, /EARTH COMMAND CLOSED/);
  assert.match(app, /SIMULATION TERMINAL/);
  assert.match(app, /screen !== "play" \|\| missionConfirmed/);

  const correspondenceStart = app.indexOf('aria-label="Confirmed mission result"');
  const correspondenceEnd = app.indexOf(') : <div className="composer composer-orders">', correspondenceStart);
  const correspondenceTerminal = app.slice(correspondenceStart, correspondenceEnd);
  assert.doesNotMatch(correspondenceTerminal, /<button/);
  const commandStart = app.indexOf('aria-label="Mission terminal status"');
  const commandEnd = app.indexOf('</div> : <div className="build-tools">', commandStart);
  const commandTerminal = app.slice(commandStart, commandEnd);
  assert.doesNotMatch(commandTerminal, /<button/);
  const simulationStart = app.indexOf('aria-label="Simulation terminal state"');
  const simulationEnd = app.indexOf('</div> : <div className="time-controls">', simulationStart);
  const simulationTerminal = app.slice(simulationStart, simulationEnd);
  assert.doesNotMatch(simulationTerminal, /<button/);
});

test('persistent decision HUD does not regress to decorative microtype', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.metrics small \{ font-size: 9px/);
  assert.match(css, /\.footer-strip \{ font-size: 9px/);
});
