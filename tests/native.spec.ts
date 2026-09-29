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
