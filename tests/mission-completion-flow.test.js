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
