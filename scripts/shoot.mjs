// Dev helper: screenshots of the app at iPad and phone sizes. node scripts/shoot.mjs <outdir>
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = process.argv[2] || 'shots';
const url = pathToFileURL(path.resolve('app/index.html')).href;
const browser = await chromium.launch();
const sizes = [['ipad-land', 1180, 820], ['ipad-port', 820, 1180], ['phone', 390, 844]];
const scen = Number(process.argv[3] || 13);
const errors = [];
for (const [name, w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  await page.goto(url);
  await page.screenshot({ path: `${out}/${name}-0-ready.png` });
  await page.evaluate((sc) => { window.SimpleFielding.runScenario(sc); }, scen);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-1-mid.png`, fullPage: name === 'phone' });
  await page.evaluate(() => window.SimpleFielding.seekEnd());
  await page.screenshot({ path: `${out}/${name}-2-end.png`, fullPage: name === 'phone' });
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
