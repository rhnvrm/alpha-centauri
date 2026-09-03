// End-to-end smoke test: drives a real session through the browser UI.
//
// Usage:
//   PORT=4173 BROWSER_PATH=/path/to/chromium node scripts/e2e.mjs
//
// Requires the dev server to be running (`npm run dev -- --port 4173`) and a
// playwright-core or puppeteer-core installation to launch a browser. The game
// exposes `window.__store` in development builds so the test can assert on the
// real engine state behind the UI.
const PORT = process.env.PORT || '4173';
const URL = `http://localhost:${PORT}/`;

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright-core'); } catch { try { pw = require('puppeteer-core'); } catch { console.error('Install playwright-core (npm i playwright-core) and provide BROWSER_PATH to run the e2e smoke.'); process.exit(0); } }

const browserPath = process.env.BROWSER_PATH;
const launch = pw.chromium
  ? pw.chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
  : pw.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });

const results = { passed: 0, failed: 0 };
const check = (name, ok, extra = '') => { results[ok ? 'passed' : 'failed'] += 1; console.log(`${ok ? 'ok' : 'FAIL'} - ${name}${extra ? ' :: ' + extra : ''}`); };

await (async () => {
  const browser = await launch;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  check('title screen renders cards', await page.locator('.mission-card').count() === 3);

  // Mission I onboarding -> play
  await page.locator('.mission-card').first().click();
  await page.waitForTimeout(150);
  const promptText = await page.locator('.prompt-card pre').innerText();
  check('startup prompt includes tool names', promptText.includes('connect_steward') && promptText.includes('wait_for_event'));
  await page.locator('.onboard-actions .primary').click();
  await page.waitForTimeout(700);
  check('3D canvas present', (await page.locator('.scene-shell canvas').count()) >= 1);
  check('minimap present', (await page.locator('.minimap').count()) >= 1);
  check('day-zero charter remains visible', (await page.locator('.mission-charter').innerText()).includes('100-person life-support capacity'));

  // A player must deliberately choose an Earth-visible map tile before the
  // construction control unlocks. Try several unobstructed terrain positions
  // because the rendered colony itself occupies part of the canvas.
  const canvas = page.locator('.colony-canvas');
  const queueBuild = page.locator('.queue-build');
  check('build stays locked without a target', !(await queueBuild.isEnabled()));
  const box = await canvas.boundingBox();
  for (const point of [[.18, .7], [.78, .3], [.2, .32], [.7, .7]]) {
    if (await queueBuild.isEnabled()) break;
    await canvas.click({ position: { x: Math.round(box.width * point[0]), y: Math.round(box.height * point[1]) }, force: true });
    await page.waitForTimeout(100);
  }
  check('received map tile unlocks construction', await queueBuild.isEnabled());
  await queueBuild.click();
  await page.waitForTimeout(150);
  const state0 = await page.evaluate(() => window.__store.getState());
  check('build order queued', state0.packets.length === 1 && state0.packets[0].kind === 'build-order');
  check('no local job before arrival', state0.jobs.length === 0, `jobs=${state0.jobs.length}`);
  check('packet timeline visible', (await page.locator('.packet').count()) >= 1);

  // Compose and transmit an intent; the label must show the exact window math.
  await page.fill('.composer textarea', 'Keep the first habitat safe and connected.');
  const arrivalLabel = await page.locator('.composer .arrival').innerText();
  check('arrival label shows 4.37y', arrivalLabel.includes('1595') && arrivalLabel.includes('4.37'));
  await page.locator('.composer .transmit').click();
  await page.waitForTimeout(150);
  const state1 = await page.evaluate(() => window.__store.getState());
  check('intent packet counted with bits', state1.packets.length === 2 && state1.packets[1].bits > 100);

  // Advance time: packets stay in-transit past their serialization window.
  await page.locator('.time-controls button').nth(1).click();
  await page.waitForTimeout(100);
  const state2 = await page.evaluate(() => window.__store.getState());
  check('+1 day advances the clock', state2.localDay === 1);
  await page.locator('.time-controls button').nth(2).click(); // +30 days
  await page.waitForTimeout(100);
  const state3 = await page.evaluate(() => window.__store.getState());
  check('orders are still in transit after 31 days', state3.localDay === 31 && state3.packets.every((p) => p.status === 'in-transit'));
  check('no job created by stale clock advance', state3.jobs.length === 0);

  // Doctrine sheet modal
  await page.locator('.build-tools button', { hasText: 'DOCTRINE' }).click();
  await page.waitForTimeout(100);
  check('doctrine modal opens', (await page.locator('.doctrine-modal').count()) === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Escape closes doctrine modal', (await page.locator('.doctrine-modal').count()) === 0);

  // Escape again exits the correspondence desk without mutating the save. This
  // is the recovery route for a player who wants to abandon a bad plan and
  // choose a fresh mission.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Escape returns to mission selection', (await page.locator('.mission-card').count()) === 3);
  await page.locator('.continue-card').click();
  await page.waitForTimeout(250);

  // Reload: the save must be resumable through the Continue card with the same session.
  const sessionId = await page.evaluate(() => window.__store.getState().sessionId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);
  check('Continue card appears after reload', (await page.locator('.continue-card').count()) === 1);
  await page.locator('.continue-card').click();
  await page.waitForTimeout(700);
  const resumed = await page.evaluate(() => window.__store.getState());
  check('same session resumed', resumed.sessionId === sessionId, `day=${resumed.localDay}`);
  check('packet ETAs survived reload', resumed.packets[0].arrivalDay === 1595);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${results.passed} passed, ${results.failed} failed`);
  process.exit(results.failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
