// The app's screens for the store images, rendered from the web app itself at each device's exact screen size.
// Run from the repo root: node native/scripts/store-screenshots.mjs [outdir]   (default: marketing/store/raw)
// Then native/scripts/store-frames.mjs puts each one in a device on the branded background, with its headline.
//
// iPad is the primary target, so it leads, in landscape. Each screen keeps the device's real status-bar and
// home-indicator space (the navy header runs up behind the status bar, as in the app); the frame draws the bar.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const out = path.resolve(process.argv[2] || 'marketing/store/raw');
const url = pathToFileURL(path.resolve('app/index.html')).href;

// [folder, CSS width, CSS height, pixel ratio, safe top, safe bottom] -> CSS size x ratio is the screen in pixels.
const DEVICES = [
  ['app-store/ipad-13', 1376, 1032, 2, 24, 20],     // iPad 13" landscape (required: the app runs on iPad)
  ['app-store/iphone-6.9', 440, 956, 3, 62, 34],    // iPhone 6.9" portrait (required)
  ['google-play/tablet-10', 1280, 800, 2, 28, 24],
  // Portrait, and narrower than 600 CSS px: in landscape at this size the color key covers home plate, and from
  // 600 to about 720 px wide the full header doesn't fit (a web layout bug, logged). 480 x 2.5 = 1200 x 1920.
  ['google-play/tablet-7', 480, 768, 2.5, 28, 24],
  ['google-play/phone', 432, 768, 2.5, 32, 24],
];

const SF = 'window.SimpleFielding';
// Each scene sets up the app, then the shot is taken. Scenario numbers are Scenarios.ALL indexes.
const SCENES = [
  ['1-double-play', async (p) => { await p.evaluate(`${SF}.runScenario(2)`); await at(p, 0.55); }],
  ['2-relay', async (p) => { await p.evaluate(`${SF}.runScenario(21)`); await at(p, 0.6); }],
  ['3-in-3d', async (p) => {
    await p.evaluate(`${SF}.runScenario(12)`);
    await p.locator('#btn-3d').click();
    await p.waitForFunction(() => document.body.classList.contains('view3d'), null, { timeout: 20000 });
    await at(p, 0.45); await p.waitForTimeout(1500);
  }],
  ['4-errors', async (p) => {
    await p.locator('#mini-diamond [data-base="first"]').click();
    await p.locator('#result-chips [data-result="error"]').click();
    await p.evaluate(`${SF}.runEvent({ kind: 'ground', at: { x: -40, y: 80 } })`);
    await p.evaluate(`${SF}.seekEnd()`);
  }],
  ['5-lesson', async (p) => { await p.evaluate(`${SF}.lesson.start('bb-c-cover')`); await p.waitForTimeout(2500); }],
  ['6-pop-up', async (p) => { await p.evaluate(`${SF}.runScenario(26)`); await at(p, 0.7); }],
];

async function at(p, frac) {
  await p.evaluate(({ frac }) => { const sf = window.SimpleFielding; sf.seek(sf.state.plan.timeline.duration * frac); }, { frac });
  await p.waitForTimeout(400);
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [dir, w, h, ratio, top, bottom] of DEVICES) {
  mkdirSync(path.join(out, dir), { recursive: true });
  for (const [name, setup] of SCENES) {
    // A fresh page for every shot: nothing carries over from the scene before.
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: ratio, hasTouch: true, isMobile: w < 900 });
    page.on('pageerror', (e) => errors.push(`${dir}/${name}: ${e.message}`));
    await page.goto(url);
    await page.waitForFunction(() => !!window.SimpleFielding);
    // The device's status bar and home indicator, as the store app's shell passes them in.
    await page.evaluate(({ top, bottom }) => {
      const s = document.documentElement.style;
      s.setProperty('--safe-top', top + 'px'); s.setProperty('--safe-bottom', bottom + 'px');
    }, { top, bottom });
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.panel')?.scrollTo(0, 0); });
    await setup(page);
    const file = path.join(out, dir, `${name}.png`);
    await page.screenshot({ path: file });
    const m = await sharp(file).metadata();
    console.log(`${dir}/${name}.png  ${m.width}x${m.height}`);
    await page.close();
  }
}

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
