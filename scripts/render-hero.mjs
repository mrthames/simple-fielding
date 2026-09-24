// Renders the homepage hero image from the app itself: the real field, the real engine, frozen at the
// end of a simple, correct play. Re-run whenever the app's look changes:  node scripts/render-hero.mjs
import { chromium } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 1400 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(ROOT, 'app/index.html')).href);
await page.evaluate(() => {
  // Single to left field, nobody on, nobody out, Little League field.
  const sf = window.SimpleFielding;
  sf.state.runners = { first: false, second: false, third: false };
  sf.runEvent({ kind: 'ground', at: { x: -80, y: 135 } });
  sf.seekEnd();
});
const title = await page.locator('#play-title').textContent();
if (title !== 'Single to left field') throw new Error('unexpected play: ' + title);
await page.locator('#field-wrap').screenshot({ path: path.join(ROOT, 'website/images/hero-play.png') });
console.log('wrote website/images/hero-play.png —', title);
await browser.close();
