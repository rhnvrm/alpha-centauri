import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('confirmed Earth desk exposes both completion routes', () => {
  assert.match(app, /className="completion-banner" aria-label="Mission confirmed"/);
  assert.match(app, /Review mission debrief/);
  assert.match(app, /Return to mission selection/);

  const confirmation = app.slice(app.indexOf('className="completion-banner"'));
  assert.match(confirmation, /setScreen\("debrief"\)/);
  assert.match(confirmation, /setScreen\("title"\)/);
  assert.match(styles, /\.completion-banner/);
  assert.match(styles, /\.secondary-action/);
});

test('mission debrief timing uses confirmed packet dates and keeps the projection fallback labelled', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const debriefGrid = app.slice(app.indexOf('className="debrief-grid"'));
  assert.match(debriefGrid, /COLONY CAPTURE DAY/);
  assert.match(debriefGrid, /missionDebrief\.capturedDay/);
  assert.match(debriefGrid, /EARTH RECEIPT DAY/);
  assert.match(debriefGrid, /missionDebrief\.receivedDay/);
  assert.match(debriefGrid, /LAST OBSERVED/);
  assert.match(debriefGrid, /dayLabel\(projection\.observedDay\)/);
  assert.doesNotMatch(debriefGrid, /CONFIRMED THROUGH/);
});

test('mission debrief keeps its final received timeline inside the fixed no-scroll shell', () => {
  assert.match(app, /const timelineEvents = state\.events\.slice\(-7\)/);
  assert.match(app, /hiddenTimelineEventCount/);
  assert.match(app, /earlier events compacted into the received packet ledger/);
  assert.match(app, /className="timeline-scroll" aria-label="All received mission events"/);
  assert.match(styles, /\.timeline-scroll \{[\s\S]*?overflow: hidden;/);
  assert.doesNotMatch(styles, /\.timeline-scroll \{[\s\S]*?overflow-y: auto;/);
  assert.match(styles, /\.debrief \{[\s\S]*?padding: 30px 7vw 22px;/);
});
