import { test, expect } from '@playwright/test';

// The store apps set window.SF_NATIVE (native/plugins/with-web-app.js), and their privacy answers say they send
// nothing anywhere. Tester reporting is the only thing that could, so it must stay off whichever way it's asked for.
test("store apps: tester mode can't be turned on, and nothing is sent", async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.addInitScript(() => {
    (window as any).SF_NATIVE = true;
    // As if a tester had turned it on in an earlier version
    localStorage.setItem('sf.tester', 'true');
    localStorage.setItem('sf.testerUrl', JSON.stringify('https://script.google.com/macros/s/x/exec'));
  });
  await page.goto('/#tester=https%3A%2F%2Fexample.com%2Fexec');
  for (let i = 0; i < 5; i++) await page.locator('#version').dispatchEvent('click');
  const tester = await page.evaluate(() => (window as any).SimpleFielding.tester);
  expect(tester).toEqual({ on: false, url: '' });
  await expect(page.locator('#tester')).toBeHidden();
  await expect(page.locator('#btn-report')).toBeHidden();
  expect(posts).toEqual([]);
});

// In the store apps the page is a file on the phone, so a shared link has to point at the web app instead.
test('store apps: a shared play links to simplefielding.com, and the link opens the play', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { (window as any).SF_NATIVE = true; });
  await page.goto('/');
  await page.evaluate(() => (window as any).SimpleFielding.runEvent({ kind: 'ground', at: { x: -40, y: 80 } }));
  await page.evaluate(() => { (navigator as any).share = undefined; });
  await page.locator('#btn-share').click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/^https:\/\/simplefielding\.com\/app\/#p=/);
  // The same link, opened in the web app, is the same play.
  await page.goto('/' + url.slice(url.indexOf('#')));
  await expect(page.locator('#play-title .pt-name')).toHaveText(/ground ball to the/i);
});

// Android's back button: the top-most open thing closes first; with nothing open, back() says so and the app closes.
test('store apps: back closes a sheet, then the whiteboard, then reports nothing left', async ({ page }) => {
  await page.goto('/');
  const back = () => page.evaluate(() => (window as any).SimpleFielding.back());
  expect(await back()).toBe(false);
  await page.evaluate(() => (window as any).SimpleFielding.openBoard());
  await page.locator('#btn-settings').click({ force: true });
  await expect(page.locator('#settings')).toBeVisible();
  expect(await back()).toBe(true);
  await expect(page.locator('#settings')).toBeHidden();
  expect(await page.evaluate(() => (window as any).SimpleFielding.board.on)).toBe(true);
  expect(await back()).toBe(true);
  expect(await page.evaluate(() => (window as any).SimpleFielding.board.on)).toBe(false);
  expect(await back()).toBe(false);
});
