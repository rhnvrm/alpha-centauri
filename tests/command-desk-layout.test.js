import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('constrained desktop command desk reflows controls instead of clipping them', () => {
  assert.match(css, /@media \(min-width: 1101px\) and \(max-width: 1600px\)/);
  assert.match(css, /\.time-controls\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /\.time-controls\s*\{[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.time-controls\s*\{[\s\S]*?right:\s*402px;/);
  assert.match(css, /\.dates\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?white-space:\s*nowrap;/);
  assert.match(css, /\.aside-head > div\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*1 1 auto;/);
  assert.match(css, /\.play-body\s*\{[\s\S]*?minmax\(360px, 390px\)/);
});
