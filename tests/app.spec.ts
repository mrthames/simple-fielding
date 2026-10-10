import { test, expect, Page } from '@playwright/test';

// Drags from home plate to a field point given in feet, the way a finger would.
async function dragBall(page: Page, to: { x: number; y: number }) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.evaluate((to) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const m = svg.getScreenCTM()!;
    const pt = (x: number, y: number) => { const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(m); return { x: q.x, y: q.y }; };
    return { from: pt(0, 1), to: pt(to.x, to.y) };
  }, to);
  await page.mouse.move(box.from.x, box.from.y);
  await page.mouse.down();
  await page.mouse.move((box.from.x + box.to.x) / 2, (box.from.y + box.to.y) / 2, { steps: 5 });
  await page.mouse.move(box.to.x, box.to.y, { steps: 5 });
  await page.mouse.up();
}

// Taps a field point given in feet (Build a play answers questions with taps on the field).
async function tapField(page: Page, x: number, y: number) {
  const pt = await page.evaluate(([x, y]) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(svg.getScreenCTM()!); return { x: q.x, y: q.y };
  }, [x, y]);
  await page.mouse.click(pt.x, pt.y);
}
// Taps a player or a base on the field.
async function tapOnField(page: Page, selector: string) {
  const b = (await page.locator('#field ' + selector).boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as any)._errors = errors;
  // Most tests watch plays run; the Ask-first test turns it back on itself.
  await page.addInitScript(() => { if (!sessionStorage.getItem('sf.test.mode')) { localStorage.setItem('sf.askFirst', 'false'); sessionStorage.setItem('sf.test.mode', '1'); } });
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect((page as any)._errors).toEqual([]);
});

test('loads with nine fielders and the drag hint', async ({ page }) => {
  await expect(page.locator('.player')).toHaveCount(9);
  await expect(page.locator('#field-hint')).toBeVisible();
  await expect(page.locator('#result')).toBeHidden();
});

test('dragging the ball to left field plays a single with a cutoff', async ({ page }) => {
  await dragBall(page, { x: -80, y: 135 });
  await expect(page.locator('#play-title .pt-name')).toHaveText(/single to left field$/i);
  await expect(page.locator('#jobs li')).toHaveCount(9);
  await expect(page.locator('#jobs li[data-pos="SS"]')).toContainText('cutoff');
  await expect(page.locator('#field-hint')).toBeHidden();
});

test('tapping a base puts a runner on, and the play changes', async ({ page }) => {
  await page.locator('.mini-base.b1').click();
  await expect(page.locator('.mini-base.b1')).toHaveClass(/on/);
  await expect(page.locator('.runner')).toHaveCount(1);
  await dragBall(page, { x: -80, y: 135 });
  await expect(page.locator('#result-summary')).toContainText('3rd');
});

test('fly ball chip changes the hit, and the play re-runs', async ({ page }) => {
  await dragBall(page, { x: -90, y: 146 });
  await page.locator('#kind-chips [data-kind="fly"]').click();
  await expect(page.locator('#play-title .pt-name')).toHaveText('Fly ball to left field');
});

test('steal button puts a runner on 1st and runs the steal', async ({ page }) => {
  await page.locator('#other-plays [data-play="steal2"]').click();
  await expect(page.locator('#play-title .pt-name')).toHaveText('Stealing 2nd');
  await expect(page.locator('.mini-base.b1')).toHaveClass(/on/);
});

test('the play list runs a scenario', async ({ page }) => {
  await page.locator('#quick-list .lib-item', { hasText: 'Foul pop behind the plate' }).click();
  await expect(page.locator('#jobs li[data-pos="P"]')).toContainText('home plate');
  await expect(page.locator('#play-title')).toContainText('Foul pop behind the plate');
});

test('tapping a job spotlights that fielder', async ({ page }) => {
  await dragBall(page, { x: 80, y: 135 });
  await page.locator('#jobs li[data-pos="2B"]').click();
  await expect(page.locator('#spot-card')).toBeVisible();
  await expect(page.locator('#spot-card')).toContainText('Second base');
});

test('playback: finishes, then replays', async ({ page }) => {
  await dragBall(page, { x: -24, y: 78 });
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  await expect(page.locator('#btn-play')).toHaveAttribute('data-mode', 'replay');
  await page.locator('#btn-play').click();
  await expect(page.locator('#btn-play')).toHaveAttribute('data-mode', 'pause');
});

test('settings: switching to softball redraws the field', async ({ page }) => {
  await page.locator('#btn-settings').click();
  await page.locator('#league').selectOption('softball');
  await page.keyboard.press('Escape');
  await dragBall(page, { x: -80, y: 135 });
  await expect(page.locator('#play-title .pt-name')).toHaveText(/single to left field$/i);
});

// ---- Whiteboard

async function fieldPoint(page: Page, x: number, y: number) {
  return page.evaluate(([x, y]) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = x; p.y = -y;
    const q = p.matrixTransform(svg.getScreenCTM()!);
    return { x: q.x, y: q.y };
  }, [x, y]);
}

async function stroke(page: Page, pts: [number, number][]) {
  const first = await fieldPoint(page, ...pts[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) { const q = await fieldPoint(page, ...p); await page.mouse.move(q.x, q.y, { steps: 6 }); }
  await page.mouse.up();
}

test('whiteboard: drag a fielder, draw, undo and redo', async ({ page }) => {
  await page.locator('#btn-board').click();
  await expect(page.locator('#board-bar')).toBeVisible();
  await expect(page.locator('#transport')).toBeHidden();
  const ss = await page.evaluate(() => (window as any).SimpleFielding.board.state.players.SS);
  await stroke(page, [[ss.x, ss.y], [-60, 120]]);
  const moved = await page.evaluate(() => (window as any).SimpleFielding.board.state.players.SS);
  expect(Math.round(moved.x)).toBe(-60);
  expect(Math.round(moved.y)).toBe(120);

  await page.locator('#board-bar [data-tool="pen"]').click();
  await stroke(page, [[-100, 150], [-60, 110], [0, 84]]);
  await expect(page.locator('.layer-ink .ink')).toHaveCount(1);

  await page.locator('#bb-undo').click();
  await expect(page.locator('.layer-ink .ink')).toHaveCount(0);
  await page.locator('#bb-redo').click();
  await expect(page.locator('.layer-ink .ink')).toHaveCount(1);
});

test('whiteboard: arrow tool draws an arrowhead, eraser removes it', async ({ page }) => {
  await page.locator('#btn-board').click();
  await page.locator('#board-bar [data-tool="arrow"]').click();
  await stroke(page, [[40, 120], [20, 100], [0, 84]]);
  await expect(page.locator('.layer-ink .ink-arrow polygon')).toHaveCount(1);
  await page.locator('#board-bar [data-tool="eraser"]').click();
  await stroke(page, [[20, 100], [22, 102]]);
  await expect(page.locator('.layer-ink .ink')).toHaveCount(0);
});

test('whiteboard: the drawing stays after Done, and clears when the next play runs', async ({ page }) => {
  await dragBall(page, { x: -80, y: 135 });
  await page.locator('#btn-board').click();
  await page.locator('#board-bar [data-tool="pen"]').click();
  await stroke(page, [[-100, 150], [-60, 110]]);
  await page.locator('#bb-done').click();
  await expect(page.locator('#board-bar')).toBeHidden();
  await expect(page.locator('.layer-ink .ink')).toHaveCount(1);
  await expect(page.locator('#play-title .pt-name')).toHaveText(/single to left field$/i);
  await dragBall(page, { x: 80, y: 135 });
  await expect(page.locator('.layer-ink .ink')).toHaveCount(0);
});

test('whiteboard: tapping a base adds a runner', async ({ page }) => {
  await page.locator('#btn-board').click();
  const b = await page.evaluate(() => ({ x: 42.43, y: 42.43 }));
  const p = await fieldPoint(page, b.x, b.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.runner')).toHaveCount(1);
});

// ---- Team

async function addPlayer(page: Page, first: string, last: string, num: string) {
  await page.fill('#add-player [name=first]', first);
  await page.fill('#add-player [name=last]', last);
  await page.fill('#add-player [name=num]', num);
  await page.click('#add-player button');
}

test('team: add players, drag one to shortstop, and the field shows their name', async ({ page }) => {
  await page.locator('#btn-team').click();
  await addPlayer(page, 'Maya', 'Rivera', '7');
  await addPlayer(page, 'Leo', 'Park', '12');
  await expect(page.locator('#bench .chip')).toHaveCount(2);

  const chip = page.locator('#bench .chip', { hasText: 'Maya' });
  const cb = (await chip.boundingBox())!;
  const sb = (await page.locator('.slot[data-drop="SS"]').boundingBox())!;
  await page.mouse.move(cb.x + 20, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.slot[data-drop="SS"] .chip')).toContainText('Maya');

  await page.locator('#label-seg [data-label="first"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.player[data-pos="SS"] .tag-text')).toHaveText('Maya');

  await page.locator('#label-seg [data-label="number"]').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('.player[data-pos="SS"] .label')).toHaveText('7');
});

test('team: tap a player then a position; job list uses their name; it survives a reload', async ({ page }) => {
  await page.locator('#btn-team').click();
  await addPlayer(page, 'Leo', 'Park', '12');
  await page.locator('#bench .chip .chip-name').click();
  await page.locator('.slot[data-drop="2B"] .slot-pos').click();
  await expect(page.locator('.slot[data-drop="2B"] .chip')).toContainText('Leo');
  await page.keyboard.press('Escape');
  await dragBall(page, { x: 80, y: 135 });
  await expect(page.locator('#jobs li[data-pos="2B"]')).toContainText('Leo P.');
  await page.reload();
  await page.locator('#btn-team').click();
  await expect(page.locator('.slot[data-drop="2B"] .chip')).toContainText('Leo');
});

test('team: press and hold a fielder to name them, then back to just the position', async ({ page }) => {
  await page.locator('#btn-team').click();
  await page.locator('#label-seg [data-label="first"]').click();
  await page.keyboard.press('Escape');
  const box = (await page.locator('.player[data-pos="CF"] .body').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('#pos-editor')).toBeVisible();
  await expect(page.locator('#pe-title')).toHaveText('Center field');
  await page.fill('#pe-name [name=oneoff]', 'Sam');
  await page.click('#pe-name button');
  await expect(page.locator('.player[data-pos="CF"] .tag-text')).toHaveText('Sam');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.click('#pe-generic');
  await expect(page.locator('.player[data-pos="CF"] .tag')).toBeHidden();
});

// ---- Tester reports

test('tester: hidden until switched on; five taps on the version turns it on', async ({ page }) => {
  await dragBall(page, { x: -80, y: 135 });
  await expect(page.locator('#btn-report')).toBeHidden();
  await page.locator('#btn-settings').click();
  for (let i = 0; i < 5; i++) await page.locator('#version').click();
  await expect(page.locator('#tester')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-report')).toBeVisible();
});

test('tester: a report posts the play log to the Sheet endpoint', async ({ page }) => {
  let posted: any = null;
  await page.route('https://script.google.com/**', async (route) => {
    posted = JSON.parse(route.request().postData() || 'null');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
  });
  await page.goto('/#tester=' + encodeURIComponent('https://script.google.com/macros/s/TEST/exec'));
  await page.locator('.mini-base.b1').click();
  await page.locator('.mini-base.b2').click();
  await page.locator('#outs').click();
  await page.locator('#outs').click();
  await page.locator('#kind-chips [data-kind="line"]').click();
  await page.locator('#result-chips [data-result="double"]').click();
  await dragBall(page, { x: 52, y: 172 });
  await page.locator('#btn-report').click();
  await page.fill('#report-said', 'Runner from 1st should hold at 3rd.');
  await page.locator('#report-pos [data-pos="Runners"]').click();
  await page.locator('#report-send').click();
  await expect(page.locator('#report-status')).toContainText('Sent');
  expect(posted.app).toBe('simple-fielding');
  expect(posted.said).toBe('Runner from 1st should hold at 3rd.');
  expect(posted.positions).toEqual(['Runners']);
  expect(posted.situationText).toContain('Runners on 1st & 2nd · 2 outs');
  expect(posted.didText).toContain('holds at 3rd');
  expect(posted.replay).toContain('#replay=r1.');
});

test('replay link reopens the exact play', async ({ page }) => {
  const code = await page.evaluate(() => (window as any).PlayLog.encodeReplay(
    { runners: { first: true, second: true, third: false }, outs: 2, batter: 'L', league: 'littleLeague', leadoffs: false },
    { kind: 'line', at: { x: 52, y: 172 }, result: 'double' }));
  await page.goto('/#replay=' + code);
  await expect(page.locator('#play-title .pt-name')).toHaveText('Double to center field');
  await expect(page.locator('.mini-base.b1')).toHaveClass(/on/);
  await expect(page.locator('#outs span.on')).toHaveCount(2);
  await expect(page.locator('#batter-seg [data-batter="L"]')).toHaveClass(/on/);
});

test('replay link keeps the coach\'s call: the 1st & 3rd shortstop cut', async ({ page }) => {
  const code = await page.evaluate(() => (window as any).PlayLog.encodeReplay(
    { runners: { first: true, second: false, third: true }, outs: 1, batter: 'R', league: 'littleLeague', d13: 'cutSS' },
    { kind: 'firstThirdSteal' }));
  await page.goto('/#replay=' + code);
  await expect(page.locator('#play-title .pt-name')).toContainText('shortstop cuts it');
  await expect(page.locator('#d13-seg [data-d13="cutSS"]')).toHaveClass(/on/);
});

test('the logo goes back to the website homepage', async ({ page }) => {
  await expect(page.locator('.topbar .brand')).toHaveAttribute('href', '../');
  await page.locator('#btn-settings').click();
  await expect(page.locator('.home-link a').first()).toHaveAttribute('href', '../');
});

test('press and hold on the field, then drag, scrubs the play', async ({ page }) => {
  await dragBall(page, { x: -80, y: 135 });
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  const box = (await page.locator('#field').boundingBox())!;
  const y = box.y + box.height * 0.35;
  // Hold on empty outfield grass, then drag left to go back in time.
  await page.mouse.move(box.x + box.width * 0.75, y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await expect(page.locator('#scrub-hint')).toBeVisible();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 8 });
  const t = await page.evaluate(() => (window as any).SimpleFielding.state.t);
  const dur = await page.evaluate(() => (window as any).SimpleFielding.state.plan.timeline.duration);
  expect(t).toBeLessThan(dur * 0.7);
  await page.mouse.up();
  await expect(page.locator('#scrub-hint')).toBeHidden();
  // Scrubbing didn't hit a new ball.
  await expect(page.locator('#play-title .pt-name')).toHaveText(/single to left field$/i);
});

test('a plain drag on the field scrubs right away', async ({ page }) => {
  await dragBall(page, { x: -80, y: 135 });
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  const box = (await page.locator('#field').boundingBox())!;
  const y = box.y + box.height * 0.35;
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 10 });
  const t = await page.evaluate(() => (window as any).SimpleFielding.state.t);
  const dur = await page.evaluate(() => (window as any).SimpleFielding.state.plan.timeline.duration);
  expect(t).toBeLessThan(dur * 0.5);
  await page.mouse.up();
  await expect(page.locator('#play-title .pt-name')).toHaveText(/single to left field$/i);
});

test('dragging the timeline slider moves the play (while paused)', async ({ page }) => {
  await dragBall(page, { x: -80, y: 135 });
  await page.waitForTimeout(600);
  await page.locator('#btn-play').click(); // pause
  const box = (await page.locator('#scrub').boundingBox())!;
  const before = await page.evaluate(() => (window as any).SimpleFielding.state.t);
  const value = Number(await page.locator('#scrub').inputValue());
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * value / 1000, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, y, { steps: 8 });
  await page.mouse.up();
  const after = await page.evaluate(() => (window as any).SimpleFielding.state.t);
  expect(after).toBeGreaterThan(before + 1);
});

test('a grounder that gets through: drag from the ring to the outfield', async ({ page }) => {
  await dragBall(page, { x: -22, y: 76 });
  await expect(page.locator('.roll-handle')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  const pts = await page.evaluate(() => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const m = svg.getScreenCTM()!;
    const pt = (x: number, y: number) => { const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(m); return { x: q.x, y: q.y }; };
    const at = (window as any).SimpleFielding.state.lastEvent.at;
    return { from: pt(at.x, at.y), to: pt(-70, 140) };
  });
  await page.mouse.move(pts.from.x, pts.from.y);
  await page.mouse.down();
  await page.mouse.move((pts.from.x + pts.to.x) / 2, (pts.from.y + pts.to.y) / 2, { steps: 5 });
  await page.mouse.move(pts.to.x, pts.to.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#result-title')).toContainText('Through the infield');
  await expect(page.locator('.ball-target.through')).toHaveCount(1);
  await expect(page.locator('.ball-roll')).toHaveCount(1);
  const s = await page.evaluate(() => (window as any).SimpleFielding.state.plan);
  expect(s.fielder).toBe('LF');
  expect(s.missedBy).toBe('SS');
});

test('coach flow: a tap on a loaded play keeps it; changing runners re-runs the same hit', async ({ page }) => {
  await dragBall(page, { x: -24, y: 78 });
  const before = await page.evaluate(() => (window as any).SimpleFielding.state.lastEvent.at);
  const pt = await page.evaluate(() => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = 90; p.y = -120; const q = p.matrixTransform(svg.getScreenCTM()!); return { x: q.x, y: q.y };
  });
  await page.mouse.click(pt.x, pt.y);
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.lastEvent.at)).toEqual(before);
  await page.locator('#mini-diamond [data-base="first"]').click();
  await expect(page.locator('#result')).toBeVisible();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.target)).toBe('second');
  await expect(page.locator('#sit-strip')).toContainText('Runner on 1st');
});

test('ask first (the default): the play waits at the hit, the question is in the title, Next comes at the end', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('sf.askFirst'));
  await page.reload();
  await expect(page.locator('#btn-ask')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#quick-list .lib-item').first().click();
  await expect(page.locator('#play-title .pt-ask')).toBeVisible();
  await expect(page.locator('.ball-target')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.playing)).toBe(false);
  await expect(page.locator('#field-next')).toBeHidden();
  await page.locator('#btn-play').click();
  await expect(page.locator('#play-title .pt-ask')).toBeHidden();
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  await expect(page.locator('#field-next')).toBeVisible();
  await page.locator('#field-next').click();
  await expect(page.locator('#quick-list .lib-item').nth(1)).toHaveClass(/on/);
  await expect(page.locator('#play-title .pt-ask')).toBeVisible();
});

test('a single on a grounder at an infielder gets through', async ({ page }) => {
  await page.locator('#result-chips [data-result="single"]').click();
  await dragBall(page, { x: -22, y: 76 });
  await expect(page.locator('#result-title')).toContainText('Through the infield');
});

test('levels and parks: pro field, then Fenway, with the wall distances and 90 ft plays', async ({ page }) => {
  await expect(page.locator('.wall-dist')).toHaveCount(3);
  await page.locator('#btn-settings').click();
  await expect(page.locator('#park-row')).toBeVisible(); // Little League: the Series fields
  await page.locator('#league').selectOption('pro');
  await page.locator('#park').selectOption('redsox-fenway');
  await page.locator('#settings [data-close]').click();
  await expect(page.locator('.wall-dist').nth(1)).toHaveText('390');
  await expect(page.locator('.wall-dist').nth(0)).toHaveText('310');
  await expect(page.locator('#quick-list h4').first()).toContainText('90 ft');
  await page.locator('#quick-list .lib-item').first().click();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.geo.park)).toBe('redsox-fenway');
  // Back to softball: no parks, no 90 ft plays.
  await page.locator('#sport-seg [data-sport="softball"]').click();
  await expect(page.locator('#quick-list h4', { hasText: '90 ft' })).toHaveCount(0);
});

test('save a play: it appears under My plays, survives a reload, and replays', async ({ page }) => {
  await page.locator('#quick-list .lib-item', { hasText: 'Single to left, runner on 1st' }).click();
  await page.locator('#btn-save').click();
  await page.locator('#save-name').fill('Tuesday — cutoff to 3rd');
  await page.locator('#save-form button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('Saved');
  await expect(page.locator('#quick-list .lib-item.mine')).toHaveText(/Tuesday — cutoff to 3rd/);
  await page.reload();
  await page.locator('#quick-list .lib-item.mine').first().click();
  await expect(page.locator('#play-title .pt-name')).toHaveText('Tuesday — cutoff to 3rd');
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.target)).toBe('third');
  // Manage: rename is a prompt, delete asks first.
  page.on('dialog', (d) => d.accept());
  await page.locator('#quick-list [data-manage]').click();
  await expect(page.locator('#myplays')).toBeVisible();
  await page.locator('#mp-list [data-act="del"]').first().click();
  await expect(page.locator('#mp-empty')).toBeVisible();
});

test('a share link opens the same play on the right field, and the address is tidied', async ({ page }) => {
  const code = await page.evaluate(() => (window as any).Share.encode(
    { league: 'pro', park: 'redsox-fenway', runners: { second: true }, outs: 1, batter: 'R', leadoffs: true },
    { kind: 'ground', at: { x: -10, y: 255 }, result: 'single' }, 'Play at the plate'));
  expect(code.length).toBeLessThan(60);
  await page.goto('/#p=' + code);
  await expect(page.locator('#play-title .pt-name')).toHaveText('Play at the plate');
  const s = await page.evaluate(() => { const st = (window as any).SimpleFielding.state; return { league: st.league, park: st.park, target: st.plan.target }; });
  expect(s).toEqual({ league: 'pro', park: 'redsox-fenway', target: 'home' });
  expect(page.url()).not.toContain('#p=');
});

// Drags on the field between two points given in feet.
async function dragField(page: Page, from: [number, number], to: [number, number]) {
  const [a, b] = await page.evaluate(([f, t]) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const m = svg.getScreenCTM()!;
    const pt = ([x, y]: number[]) => { const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(m); return { x: q.x, y: q.y }; };
    return [pt(f), pt(t)];
  }, [from, to]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test('build a play: a lead off 3rd by dragging, then the delayed steal and the cut home', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'building a play is for tablets and computers');
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('.mini-base.b1').click();
  await page.locator('.mini-base.b3').click();
  await page.locator('.bp-act', { hasText: 'Pitch' }).click();
  await page.locator('.bp-chip', { hasText: 'Catcher catches it' }).click();
  await page.locator('.bp-runner[data-runner="first"] .bp-chip', { hasText: 'Run to 2nd' }).click();
  // The lead: "Stop partway" shows only the 3rd-to-home line; dragging along it answers.
  await page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Stop partway' }).click();
  await expect(page.locator('.bp-q')).toContainText('drag along the orange line');
  await expect(page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Back to' })).toHaveCount(0);
  const third = await page.evaluate(() => { const b = (window as any).SimpleFielding.geo().bases; return [b.third.x, b.third.y, b.home.x, b.home.y]; });
  const at = (f: number): [number, number] => [third[0] + (third[2] - third[0]) * f, third[1] + (third[3] - third[1]) * f];
  await dragField(page, at(0.05), at(0.2));
  await expect(page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Stop partway' })).toHaveAttribute('aria-pressed', 'true');
  const stop = await page.evaluate(() => (window as any).SimpleFielding.builder.script.steps[0].runners.third.stop);
  expect(stop).toBeGreaterThan(3.1);
  expect(stop).toBeLessThan(3.35);
  // The shortstop cheats in during the pitch.
  const ss = await page.evaluate(() => { const p = (window as any).SimpleFielding.view.actorAt('SS'); return [p.x, p.y]; });
  await dragField(page, [ss[0], ss[1]], [ss[0] * 0.6, ss[1] * 0.8]);
  // The catcher throws to the shortstop; the runner on 3rd breaks as it leaves.
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await page.locator('.bp-chips.pos [data-pos="SS"]').click();
  await page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Run home' }).click();
  // The shortstop throws home and the catcher tags him.
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await tapOnField(page, '.player[data-pos="C"]');
  await page.locator('.bp-act', { hasText: 'Tag a runner' }).click();
  await page.locator('.bp-chip', { hasText: 'The runner from 3rd' }).click();
  expect(await page.locator('.bp-step:not(.setup) b').allTextContents()).toEqual([
    'Pitch. The catcher catches it.',
    'The catcher throws to the shortstop.',
    'The shortstop throws to the catcher.',
    'The catcher tags the runner from 3rd. Out.',
  ]);
  await expect(page.locator('.bp-step .fix')).toHaveCount(0);
});

test('build a play: endings, a wild throw, and coaching it on the whiteboard', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'building a play is for tablets and computers');
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('.mini-base.b1').click();
  await page.locator('.mini-base.b3').click();
  // The main play: he commits and is tagged at home.
  await page.locator('.bp-act', { hasText: 'Pitch' }).click();
  await page.locator('.bp-chip', { hasText: 'Catcher catches it' }).click();
  await page.locator('.bp-runner[data-runner="first"] .bp-chip', { hasText: 'Run to 2nd' }).click();
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await page.locator('.bp-chips.pos [data-pos="SS"]').click();
  await page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Run home' }).click();
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await tapOnField(page, '.player[data-pos="C"]');
  await page.locator('.bp-act', { hasText: 'Tag a runner' }).click();
  await page.locator('.bp-chip', { hasText: 'The runner from 3rd' }).click();
  await expect(page.locator('#bp-endings')).toHaveCount(0);
  // Not on the last step: there it read as "add the next step" (his iPad, 2026-10-10).
  await page.locator('.bp-step[data-step="3"]').click();
  await expect(page.locator('#bp-detail')).toBeVisible();
  await expect(page.locator('#bp-fork')).toHaveCount(0);
  // Another ending after step 2: he sees the shortstop cut it and turns back.
  await page.locator('.bp-step[data-step="1"]').click();
  await page.locator('#bp-fork').click();
  await expect(page.locator('#bp-endings [data-ending]')).toHaveCount(2);
  await expect(page.locator('#bp-endings [data-ending="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(2);
  await expect(page.locator('.bp-step.shared')).toHaveCount(2);
  await page.locator('#bp-ending-name').fill('He turns back');
  await page.locator('#bp-ending-name').press('Tab');
  await page.locator('#bp-endings [data-ending="-1"]').click();
  await page.locator('#bp-ending-name').fill('He commits');
  await page.locator('#bp-ending-name').press('Tab');
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(4);
  await page.locator('#bp-endings [data-ending="0"]').click();
  await expect(page.locator('#bp-endings [data-ending="0"]')).toHaveText('He turns back');
  // The shortstop throws home as he goes back; the catcher runs at him; the toss to 3rd is wild; the left fielder gets it.
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await tapOnField(page, '.player[data-pos="C"]');
  await page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Back to 3rd' }).click();
  await page.locator('.bp-act', { hasText: 'Run with it' }).click();
  await tapField(page, -14, 16);
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await tapOnField(page, '.base[data-base="third"]');
  await page.locator('.bp-err .bp-chip', { hasText: 'Wild throw' }).click();
  await tapField(page, -62, 30);
  await expect(page.locator('.bp-q')).toHaveText('Who gets the ball? Tap them on the field.');
  await page.locator('.bp-next .bp-chips.pos [data-pos="LF"]').click();
  expect(await page.locator('.bp-step:not(.setup) b').allTextContents()).toEqual([
    'Pitch. The catcher catches it.',
    'The catcher throws to the shortstop.',
    'The shortstop throws to the catcher.',
    'The catcher runs with the ball.',
    'The catcher throws to the third baseman. Wild throw: it gets past.',
    'The left fielder gets the ball.',
  ]);
  await expect(page.locator('.bp-step .fix')).toHaveCount(0);
  const err = await page.evaluate(() => (window as any).SimpleFielding.state.plan.error.code);
  expect(err).toBe('E2');
  // The main play is untouched, and everything survives a reload.
  await page.locator('#bp-endings [data-ending="-1"]').click();
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(4);
  await page.reload();
  await page.locator('#panel-mode [data-pm="build"]').click();
  await expect(page.locator('#bp-endings [data-ending]')).toHaveText(['He commits', 'He turns back']);
  // Coaching: pause partway, open the whiteboard, then play on as built.
  await page.locator('#bp-endings [data-ending="0"]').click();
  await page.evaluate(() => (window as any).SimpleFielding.seek(2));
  await page.locator('#btn-board').click();
  await expect(page.locator('#bb-play')).toBeVisible();
  await page.locator('#bb-play').click();
  await expect(page.locator('#board-bar')).toBeHidden();
  const t0 = await page.evaluate(() => (window as any).SimpleFielding.state.t);
  await page.waitForTimeout(400);
  const t1 = await page.evaluate(() => (window as any).SimpleFielding.state.t);
  expect(t0).toBeGreaterThanOrEqual(1.9);
  expect(t1).toBeGreaterThan(t0);
});

test('a shared play with endings: anyone, on a phone too, can switch endings and watch each', async ({ page }) => {
  const code = await page.evaluate(() => (window as any).Share.encode(
    { league: 'littleLeague', runners: { first: true, third: true }, outs: 1, batter: 'R' },
    { kind: 'script', title: '1st & 3rd cut', main: 'He commits', steps: [
      { a: 'pitch', r: 'caught', runners: { first: { go: 'second' }, third: { stop: 3.2 } } },
      { a: 'throw', to: 'SS', at: { x: -12, y: 55 }, runners: { third: { go: 'home' } } },
      { a: 'throw', to: 'C', at: { x: 0, y: 2 } },
      { a: 'tag', runner: 'third', call: 'out' },
    ], alts: [{ name: 'He turns back', from: -1, at: 1, steps: [
      { a: 'throw', to: 'C', at: { x: 0, y: 2 }, runners: { third: { go: 'third' } } },
      { a: 'run', at: { x: -14, y: 16 } },
      { a: 'throw', to: '3B', at: { x: -40, y: 43 } },
      { a: 'tag', runner: 'third', call: 'out' },
    ] }] }, '1st & 3rd cut'));
  await page.goto('/#p=' + code);
  await expect(page.locator('#bp-endings [data-ending]')).toHaveText(['He commits', 'He turns back']);
  // It opens at the start, not with the play already over.
  await expect(page.locator('.bp-step.setup')).toHaveClass(/\bon\b/);
  await expect(page.locator('#scrub')).toHaveValue('0');
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(4);
  await page.locator('#bp-endings [data-ending="0"]').click();
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(6);
  const plan = await page.evaluate(() => { const p = (window as any).SimpleFielding.state.plan; return { issues: p.scriptIssues.length, steps: p.scriptStates.length }; });
  expect(plan).toEqual({ issues: 0, steps: 6 });
});

test('build a play: the 1st & 3rd trap, step by step, with taps on the field', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'building a play is for tablets and computers');
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('.mini-base.b1').click();
  await page.locator('.mini-base.b3').click();
  await expect(page.locator('.bp-q')).toHaveText('What does the pitcher do?');
  await page.locator('.bp-act', { hasText: 'Pitch' }).click();
  await page.locator('.bp-chip', { hasText: 'Catcher catches it' }).click();
  await page.locator('.bp-runner[data-runner="first"] .bp-chip', { hasText: 'Run to 2nd' }).click();
  await expect(page.locator('.bp-q')).toHaveText('What does the catcher do?');
  // The catcher throws to the shortstop, faking to 2nd; the runner on 3rd breaks.
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await page.locator('.bp-chips.pos [data-pos="SS"]').click();
  await page.locator('.bp-detail .bp-chip', { hasText: /^To 2nd$/ }).click();
  await page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Run home' }).click();
  // The shortstop throws home: tap the catcher on the field. The runner turns back.
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await expect(page.locator('.bp-ring')).not.toHaveCount(0);
  await tapOnField(page, '.player[data-pos="C"]');
  await page.locator('.bp-runner[data-runner="third"] .bp-chip', { hasText: 'Back to 3rd' }).click();
  // The catcher runs at the runner, throws to 3rd (tap the base), and the third baseman tags.
  await page.locator('.bp-act', { hasText: 'Run with it' }).click();
  await tapField(page, -18, 20);
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await tapOnField(page, '.base[data-base="third"]');
  await page.locator('.bp-act', { hasText: 'Tag a runner' }).click();
  await page.locator('.bp-chip', { hasText: 'The runner from 3rd' }).click();
  expect(await page.locator('.bp-step:not(.setup) b').allTextContents()).toEqual([
    'Pitch. The catcher catches it.',
    'The catcher throws to the shortstop (fakes to 2nd first).',
    'The shortstop throws to the catcher.',
    'The catcher runs with the ball.',
    'The catcher throws to the third baseman.',
    'The third baseman tags the runner from 3rd. Out.',
  ]);
  await expect(page.locator('.bp-step .fix')).toHaveCount(0);
  const types = await page.evaluate(() => (window as any).SimpleFielding.state.plan.timeline.events.map((e: any) => e.type));
  expect(types.filter((t: string) => t === 'throw')).toHaveLength(3);
  expect(types.filter((t: string) => t === 'out')).toHaveLength(1);
  // Undo the tag, then redo it.
  await page.locator('#bp-undo').click();
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(5);
  await page.locator('#bp-redo').click();
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(6);
  // Name it, save it to My plays, and its link opens it again as steps.
  await page.locator('#bp-title').fill('Trap');
  await page.locator('#bp-title').press('Tab');
  await page.locator('#bp-save').click();
  await expect(page.locator('#save-name')).toHaveValue('Trap');
  await page.locator('#save-go').click();
  const saved = await page.evaluate(() => (window as any).Share.list(localStorage));
  expect(saved.map((p: any) => p.name)).toEqual(['Trap']);
  const d = await page.evaluate((c) => (window as any).Share.decode(c), saved[0].code);
  expect(d.event.kind).toBe('script');
  expect(d.event.steps).toHaveLength(6);
  await page.locator('#bp-reset').click();
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(0);
  await page.goto('/#p=' + saved[0].code);
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(6);
  await expect(page.locator('#bp-title')).toHaveValue('Trap');
});

test('build a play: a ground ball to short, thrown to 1st; only moves that fit, and the coach makes the calls', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'building a play is for tablets and computers');
  await page.locator('#panel-mode [data-pm="build"]').click();
  // Nobody on: no pickoff to offer.
  await expect(page.locator('.bp-act', { hasText: 'Pickoff' })).toHaveCount(0);
  await page.locator('.bp-act', { hasText: 'Pitch' }).click();
  await page.locator('.bp-chip', { hasText: 'Batter hits it' }).click();
  await page.locator('.bp-chip', { hasText: 'Ground ball' }).click();
  await tapField(page, -22, 62);
  // A loose ball: the only question is who gets it, and the nearest fielder is suggested.
  await expect(page.locator('.bp-q')).toHaveText('Who gets the ball? Tap them on the field.');
  await expect(page.locator('.bp-ring.suggest')).toHaveCount(1);
  await tapOnField(page, '.player[data-pos="SS"]');
  await page.locator('.bp-act', { hasText: 'Throw' }).click();
  await tapOnField(page, '.base[data-base="first"]');
  await expect(page.locator('.bp-step:not(.setup) b').last()).toHaveText('The shortstop throws to the first baseman.');
  await page.locator('.bp-act', { hasText: 'Step on a base' }).click();
  await page.locator('.bp-next .bp-chip', { hasText: /^1st$/ }).click();
  // The force on the batter is out unless the coach says safe.
  await expect(page.locator('.bp-step:not(.setup) b').last()).toHaveText('The first baseman steps on 1st. The batter is out.');
  await page.locator('.bp-chip.call-safe').click();
  await expect(page.locator('.bp-step:not(.setup) b').last()).toHaveText('The first baseman steps on 1st. The batter is safe.');
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.timeline.events.some((e: any) => e.type === 'safe'))).toBe(true);
  // Drag the second baseman during step 3 (the throw): they move in that step.
  await page.locator('.bp-step[data-step="2"]').click();
  const b2 = (await page.locator('#field .player[data-pos="2B"]').boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 + 30, b2.y + b2.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.bp-step[data-step="2"] .mw')).toHaveText('The second baseman moves.');
  // Delete the last step.
  await page.locator('.bp-step[data-step="3"]').click();
  await page.locator('#bp-delete').click();
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(3);
});

test('a built play opened from a link: a phone watches and shares it; a tablet can change it', async ({ page }, info) => {
  const code = await page.evaluate(() => (window as any).Share.encode({ league: 'littleLeague', runners: { first: true, second: false, third: true }, outs: 1 },
    { kind: 'script', title: 'Trap', steps: [
      { a: 'pitch', r: 'caught', runners: { first: { go: 'second' } } },
      { a: 'throw', to: 'SS', at: { x: -4, y: 66 }, fake: 'second', runners: { third: { go: 'home' } } },
      { a: 'throw', to: 'C', at: { x: 0, y: 2 } },
      { a: 'tag', runner: 'third', call: 'out' },
    ] }, 'Trap'));
  await page.goto('/#p=' + code);
  await expect(page.locator('#play-title .pt-name')).toHaveText('Trap');
  await expect(page.locator('.bp-step:not(.setup)')).toHaveCount(4);
  if (info.project.name === 'phone') {
    await expect(page.locator('.bp-phone')).toBeVisible();
    await expect(page.locator('.bp-act')).toHaveCount(0);
    await expect(page.locator('#btn-edit')).toBeHidden();
    await expect(page.locator('#btn-share')).toBeVisible();
    // Watching still works: play it to the end.
    await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
    expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.timeline.events.filter((e: any) => e.type === 'out').length)).toBe(1);
  } else {
    await expect(page.locator('.bp-act').first()).toBeVisible();
    await expect(page.locator('#bp-title')).toHaveValue('Trap');
  }
});

test('errors: pick Error, then the kind; drag where a wild throw ends up', async ({ page }) => {
  await page.locator('#mini-diamond [data-base="first"]').click();
  await page.locator('#result-chips [data-result="error"]').click();
  // The kinds come first, before any drag, with the default picked.
  await expect(page.locator('#error-tip')).toHaveText(/^Pick the error, then drag the hit/);
  await expect(page.locator('#error-chips button:not([hidden])')).toHaveCount(3);
  await expect(page.locator('#error-chips [data-err="bobble"]')).toHaveClass(/on/);
  await dragBall(page, { x: -40, y: 80 });
  await expect(page.locator('#error-chips')).toBeVisible();
  await expect(page.locator('#error-chips button:not([hidden])')).toHaveCount(3);
  await expect(page.locator('#play-title .pt-name')).toHaveText(/^E\d: bobbled/);
  await page.locator('#error-chips [data-err="throw"]').click();
  await expect(page.locator('#play-title .pt-name')).toHaveText(/the throw gets away/);
  await expect(page.locator('#error-tip')).toHaveText(/Drag the ring/);
  // Drag the ring to a new spot: the play re-runs with the ball there.
  const ring = await page.evaluate(() => { const th = (window as any).SimpleFielding.state.plan.throws.find((t: any) => t.wild); return th.wild; });
  const toScreen = (x: number, y: number) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(svg.getScreenCTM()!); return { x: q.x, y: q.y };
  }, [x, y]);
  const a = await toScreen(ring.x, ring.y), b = await toScreen(ring.x + 15, ring.y + 25);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  const moved = await page.evaluate(() => { const st = (window as any).SimpleFielding.state; return { to: st.errTo, wild: st.plan.throws.find((t: any) => t.wild).wild }; });
  expect(Math.abs(moved.to.x - (ring.x + 15)) < 4 && Math.abs(moved.to.y - (ring.y + 25)) < 4).toBeTruthy();
  expect(Math.hypot(moved.wild.x - moved.to.x, moved.wild.y - moved.to.y) < 6).toBeTruthy();
  // A pop-up in the infield has nothing to misplay (yet): the kinds go away and the tip says why.
  await page.locator('#kind-chips [data-kind="pop"]').click();
  await dragBall(page, { x: 5, y: 50 });
  await expect(page.locator('#error-chips')).toBeHidden();
  await expect(page.locator('#error-tip')).toHaveText(/^A pop-up caught in the infield/);
});

test('errors show on the field: the callout, E5 on the fielder, SAFE calls, and the outcome under the title', async ({ page }) => {
  await page.locator('#mini-diamond [data-base="first"]').click();
  await page.locator('#result-chips [data-result="error"]').click();
  await dragBall(page, { x: -40, y: 80 });
  await expect(page.locator('#play-title .pt-name')).toHaveText(/^E5: bobbled/);
  const err = await page.evaluate(() => (window as any).SimpleFielding.state.plan.error);
  // Just before the error: no badge. At the moment: the big callout, and the badge on the third baseman.
  await page.evaluate((t) => (window as any).SimpleFielding.seek(t), err.t - 0.2);
  await expect(page.locator('.player[data-pos="3B"] .ebadge')).toBeHidden();
  await page.evaluate((t) => (window as any).SimpleFielding.seek(t), err.t + 0.1);
  await expect(page.locator('.caption.note.err')).toHaveText('Bobbled!');
  await expect(page.locator('.player[data-pos="3B"] .ebadge')).toBeVisible();
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  await expect(page.locator('.caption.note.err')).toHaveCount(0);
  // At the end: the badge is still on 3B, SAFE calls stay up, and the outcome line says what it cost.
  await expect(page.locator('.player[data-pos="3B"] .ebadge')).toBeVisible();
  await expect(page.locator('.player[data-pos="3B"] .ebadge text')).toHaveText('E5');
  await expect(page.locator('.player[data-pos="SS"] .ebadge')).toBeHidden();
  await expect(page.locator('.caption.safe')).toHaveCount(2);
  await expect(page.locator('#play-title .pt-outcome')).toBeVisible();
  await expect(page.locator('#play-title .pt-outcome')).toHaveText('E5, bobbled: batter safe at 1st, runner from 1st safe at 2nd.');
});

test('errors: the callout is big and orange at the moment, and the outcome waits for the end', async ({ page }) => {
  await page.locator('#result-chips [data-result="error"]').click();
  await page.locator('#error-chips [data-err="legs"]').click();
  await dragBall(page, { x: -40, y: 80 });
  await expect(page.locator('#play-title .pt-name')).toHaveText(/^E\d: through the legs/);
  // Scrub to just after the ball goes through: the callout is up, the badge is on, the outcome isn't yet.
  const { t, pos, code } = await page.evaluate(() => (window as any).SimpleFielding.state.plan.error);
  await page.evaluate((t) => {
    const sf = (window as any).SimpleFielding, dur = sf.state.plan.timeline.duration;
    const s = document.getElementById('scrub') as HTMLInputElement;
    s.value = String(Math.round(((t + 0.2) / dur) * 1000)); s.dispatchEvent(new Event('input', { bubbles: true }));
  }, t);
  await expect(page.locator('.caption.note.err')).toHaveText('Through the legs!');
  await expect(page.locator(`.player[data-pos="${pos}"] .ebadge`)).toBeVisible();
  await expect(page.locator('#play-title .pt-outcome')).toBeHidden();
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  await expect(page.locator('#play-title .pt-outcome')).toHaveText(new RegExp(`^${code}, through the legs: batter safe at 1st\\.$`));
});

test('errors: an error the hit can\'t have is switched, and the tip says so', async ({ page }) => {
  await page.locator('#mini-diamond [data-base="first"]').click();
  await page.locator('#kind-chips [data-kind="line"]').click();
  await page.locator('#result-chips [data-result="error"]').click();
  await expect(page.locator('#error-chips button:not([hidden])')).toHaveCount(2);
  await expect(page.locator('#error-chips [data-err="legs"]')).toBeHidden();
  await page.locator('#error-chips [data-err="bobble"]').click();
  // A liner caught by the shortstop can't be bobbled here; the only error is the throw.
  await dragBall(page, { x: -20, y: 60 });
  await expect(page.locator('#error-tip')).toHaveText('This hit can’t be bobbled or dropped, so it’s a throw that gets away instead.');
  await expect(page.locator('#error-chips [data-err="throw"]')).toHaveClass(/on/);
});

test('errors point to passed balls and wild pitches, which live with the steals', async ({ page }) => {
  await expect(page.locator('#error-more')).toBeHidden();
  await page.locator('#result-chips [data-result="error"]').click();
  await expect(page.locator('#error-more')).toBeVisible();
  await page.locator('#to-other').click();
  await expect(page.locator('#other-card')).toHaveClass(/flash/);
  await expect(page.locator('#other-card')).toBeInViewport();
});

test('draw what happened: steps with a moved fielder and a caption play back, save, and copy', async ({ page }) => {
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('#mini-diamond [data-base="first"]').click();
  await page.locator('#build-draw').click();
  await expect(page.locator('#draw-bar')).toBeVisible();
  await expect(page.locator('#db-label')).toHaveText('Start');
  await page.locator('#db-add').click();
  await expect(page.locator('#db-label')).toHaveText('Step 1 of 1');
  // Move the shortstop in this step.
  const toScreen = (x: number, y: number) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(svg.getScreenCTM()!); return { x: q.x, y: q.y };
  }, [x, y]);
  const ss = await page.evaluate(() => (window as any).SimpleFielding.state && document.querySelector('.player[data-pos="SS"]')!.getBoundingClientRect());
  await page.mouse.move(ss.x + ss.width / 2, ss.y + ss.height / 2);
  await page.mouse.down();
  const to = await toScreen(-40, 110);
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.locator('#db-cap').fill('Error! It gets by');
  await page.locator('#db-finish').click();
  await expect(page.locator('#draw-bar')).toBeHidden();
  const plan = await page.evaluate(() => { const p = (window as any).SimpleFielding.state.plan; return { drawn: p.drawn, steps: (window as any).SimpleFielding.state.lastEvent.steps.length, note: p.timeline.events[0] && p.timeline.events[0].text }; });
  expect(plan).toEqual({ drawn: true, steps: 2, note: 'Error! It gets by' });
  await expect(page.locator('#result-notes')).toContainText('Error! It gets by');
  // Save it, then make a copy from My plays.
  await page.locator('#btn-save').click();
  await page.locator('#save-name').fill('What happened');
  await page.locator('#save-go').click();
  await page.locator('#panel-mode [data-pm="plays"]').click();
  await page.locator('#quick-list [data-manage]').click();
  await page.locator('#mp-list [data-act="copy"]').first().click();
  await expect(page.locator('#mp-list .mp-row')).toHaveCount(2);
  await expect(page.locator('#mp-list .mp-name').first()).toHaveText('What happened (copy)');
  // Open the copy, change it, and save the changes: still two plays.
  await page.locator('#mp-list .mp-name').first().click();
  await page.locator('#btn-save').click();
  await expect(page.locator('#save-new')).toBeVisible();
  await page.locator('#save-name').fill('What we want');
  await page.locator('#save-go').click();
  const names = await page.evaluate(() => (window as any).Share.list(localStorage).map((p: any) => p.name));
  expect(names.sort()).toEqual(['What happened', 'What we want']);
});

test('edit a play the app worked out: it becomes steps you can change', async ({ page }) => {
  await page.locator('#quick-list .lib-item', { hasText: 'Single to left, runner on 1st' }).click();
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  await page.locator('#btn-edit').click();
  await expect(page.locator('#draw-bar')).toBeVisible();
  const n = await page.locator('#db-label').textContent();
  expect(n).toMatch(/Step 1 of [2-9]/);
  await page.locator('#db-finish').click();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.drawn)).toBe(true);
});

test('softball levels: the list, the slapper, and 8U coach pitch', async ({ page }) => {
  await page.locator('#sport-seg [data-sport="softball"]').click();
  await expect(page.locator('#batter-slap')).toBeVisible();
  await page.locator('#btn-settings').click();
  await page.locator('#league').selectOption('softballHS');
  await page.locator('#settings [data-close]').click();
  await expect(page.locator('#quick-list h4').first()).toContainText('Softball');
  await page.locator('#batter-seg [data-batter="S"]').click();
  await page.locator('#quick-list .lib-item', { hasText: 'Soft slap' }).click();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.situation.batter)).toBe('S');
  await page.locator('#btn-settings').click();
  await page.locator('#league').selectOption('softball8');
  await page.locator('#settings [data-close]').click();
  await expect(page.locator('#batter-slap')).toBeHidden();
  await expect(page.locator('.coach-marker')).toHaveCount(1);
  await expect(page.locator('#other-card')).toBeHidden();
  // Baseball, then back to softball: it remembers 8U.
  await page.locator('#sport-seg [data-sport="baseball"]').click();
  await page.locator('#sport-seg [data-sport="softball"]').click();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.league)).toBe('softball8');
});

test('dropped third strike, delayed steal and look-back plays', async ({ page }, info) => {
  await page.locator('#other-plays [data-play="droppedThird"]').click();
  await expect(page.locator('#play-title .pt-name')).toContainText('Dropped third strike');
  await page.locator('#sport-seg [data-sport="softball"]').click();
  await page.locator('#other-plays [data-play="delayedSteal"]').click();
  await expect(page.locator('#play-title .pt-name')).toContainText('delayed steal');
  await page.locator('#quick-list .lib-item', { hasText: 'stops: out by rule' }).click();
  await expect(page.locator('#result-title')).toContainText('Look-back');
  // Build a play: strike three in the dirt (tablets and computers).
  if (info.project.name === 'phone') return;
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('.bp-act', { hasText: 'Pitch' }).click();
  await page.locator('.bp-chip', { hasText: 'Strike 3 in the dirt' }).click();
  await page.locator('.bp-chip', { hasText: 'Just behind the plate' }).click();
  await expect(page.locator('.bp-step:not(.setup) b').first()).toHaveText('Pitch. Strike 3 in the dirt.');
  expect(await page.evaluate(() => Object.keys((window as any).SimpleFielding.state.plan.scriptStates[0].runners))).toContain('batter');
});

test('3D view: turns on, offers player cameras, follows the timeline, and turns off', async ({ page }) => {
  await page.locator('#quick-list .lib-item', { hasText: 'Single to left, runner on 1st' }).click();
  await page.locator('#btn-3d').click();
  const ok = await page.waitForFunction(() => document.body.classList.contains('view3d') || !!document.querySelector('#toast:not([hidden])'), null, { timeout: 15000 });
  void ok;
  if (!(await page.evaluate(() => document.body.classList.contains('view3d')))) test.skip(true, 'no WebGL in this browser');
  await expect(page.locator('canvas.field3d')).toBeVisible();
  await expect(page.locator('#cam option[value="player:SS"]')).toHaveCount(1);
  await expect(page.locator('#cam option[value="runner:first"]')).toHaveCount(1);
  // No headset in the test browser: the VR button stays hidden.
  await expect(page.locator('#btn-vr')).toBeHidden();
  await page.selectOption('#cam', 'player:SS');
  await page.evaluate(() => (window as any).SimpleFielding.seekEnd());
  await page.locator('#btn-3d').click();
  await expect(page.locator('canvas.field3d')).toBeHidden();
  await expect(page.locator('#field')).toBeVisible();
});

test('infield depth: In plays the grounder home', async ({ page }) => {
  await page.locator('#mini-diamond [data-base="third"]').click();
  await page.locator('#depth-seg [data-depth="in"]').click();
  await expect(page.locator('#depth-seg [data-depth="in"]')).toHaveClass(/on/);
  await page.evaluate(() => (window as any).SimpleFielding.runEvent({ kind: 'ground', at: { x: -22, y: 62 } }));
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.target)).toBe('home');
});

test('defensive calls: the 1st & 3rd and bunt defense buttons change the play', async ({ page }) => {
  await page.locator('#d13-seg [data-d13="pitcher"]').click();
  await page.locator('#other-plays [data-play="firstThirdSteal"]').click();
  await expect(page.locator('#play-title .pt-name')).toContainText('pitcher');
  // The shortstop cut: the catcher fakes to 2nd and throws to the shortstop, who throws home.
  await page.locator('#d13-seg [data-d13="cutSS"]').click();
  await page.locator('#other-plays [data-play="firstThirdSteal"]').click();
  await expect(page.locator('#play-title .pt-name')).toContainText('shortstop cuts it');
  await expect(page.locator('#buntd-row')).toBeHidden();
  await page.locator('#kind-chips [data-kind="bunt"]').click();
  await expect(page.locator('#buntd-row')).toBeVisible();
});

test('rundown button plays a rundown with everyone\'s job', async ({ page }) => {
  await page.locator('#other-plays [data-play="rundown"]').click();
  await expect(page.locator('#play-title .pt-name')).toContainText('Rundown between 1st and 2nd');
  await expect(page.locator('#jobs li')).toHaveCount(9);
});

test('ask first: tap a player to see their job and only their route; dragging does not move them', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('sf.askFirst'));
  await page.reload();
  await page.locator('#quick-list .lib-item', { hasText: 'Single to left, runner on 1st' }).click();
  await expect(page.locator('#play-title .pt-ask')).toContainText('Tap a player');
  // Routes are hidden while the play asks.
  await expect(page.locator('.path[data-pos="SS"]')).toBeHidden();
  const r = await page.locator('.player[data-pos="SS"]').boundingBox();
  const c = { x: r!.x + r!.width / 2, y: r!.y + r!.height / 2 };
  // A drag leaves the shortstop where they are.
  const before = await page.evaluate(() => (window as any).SimpleFielding.state.plan && document.querySelector('.player[data-pos="SS"]')!.getAttribute('transform'));
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 80, c.y - 40, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(() => document.querySelector('.player[data-pos="SS"]')!.getAttribute('transform'))).toBe(before);
  // A tap shows their job, and their route alone.
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('#spot-card')).toBeVisible();
  await expect(page.locator('.path[data-pos="SS"]')).toBeVisible();
  await expect(page.locator('.path[data-pos="LF"]')).toBeHidden();
  await expect(page.locator('.quiz-guess')).toHaveCount(0);
});

test('timeline markers jump to a moment in the play; ¼× speed exists', async ({ page }) => {
  await page.locator('#quick-list .lib-item', { hasText: 'Single to left, runner on 1st' }).click();
  const marks = page.locator('#scrub-marks .scrub-mark');
  expect(await marks.count()).toBeGreaterThan(1);
  const last = marks.last();
  await last.click();
  const t = await page.evaluate(() => (window as any).SimpleFielding.state.t);
  expect(t).toBeGreaterThan(1);
  await expect(page.locator('.transport [data-speed="0.25"]')).toHaveCount(1);
});

test('projector mode survives the browser dropping full screen on a touch device, with a way back and a way out', async ({ page }) => {
  await page.evaluate(() => {
    // Pretend we're a touch device and the browser just left full screen by itself.
    const mm = window.matchMedia;
    (window as any).matchMedia = (q: string) => (q.includes('pointer: coarse') ? { matches: true } as any : mm.call(window, q));
    document.body.classList.add('projector');
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await expect(page.locator('body')).toHaveClass(/projector/);
  await expect(page.locator('#fs-back')).toBeVisible();
  await page.locator('#fs-exit').click();
  await expect(page.locator('body')).not.toHaveClass(/projector/);
});

test('playlist: with a saved play open, Next steps through My plays in order', async ({ page }) => {
  for (const n of ['Single to left, runner on 1st', 'Fly ball to left, nobody on']) {
    await page.locator('#quick-list .lib-item', { hasText: n }).first().click();
    await page.locator('#btn-save').click();
    await page.locator('#save-name').fill('Tonight: ' + n);
    await page.locator('#save-go').click();
  }
  // My plays lists newest first: "Fly ball…" then "Single…".
  await page.locator('#quick-list .lib-item.mine').first().click();
  await expect(page.locator('#play-title .pt-name')).toHaveText('Tonight: Fly ball to left, nobody on');
  await page.locator('#quick-next').click();
  await expect(page.locator('#play-title .pt-name')).toHaveText('Tonight: Single to left, runner on 1st');
  await expect(page.locator('#quick-list .lib-item.mine.on')).toHaveCount(1);
  await page.locator('#quick-next').click();
  await expect(page.locator('#play-title .pt-name')).toHaveText('Tonight: Fly ball to left, nobody on');
});

test('Reset clears the look cones along with the rest of the play', async ({ page }) => {
  await page.evaluate(() => (window as any).SimpleFielding.runEvent({ kind: 'ground', at: { x: -80, y: 135 } }));
  await page.evaluate(() => (window as any).SimpleFielding.seek(2));
  expect(await page.locator('.layer-looks path').count()).toBeGreaterThan(0);
  await page.locator('#btn-reset').click();
  await expect(page.locator('.layer-looks path')).toHaveCount(0);
});

test('the color key names the level and field', async ({ page }) => {
  await expect(page.locator('#fk-level')).toHaveText('Little League · 60 ft bases');
  await page.evaluate(() => { const s = document.getElementById('league') as HTMLSelectElement; s.value = 'pro'; s.dispatchEvent(new Event('change')); });
  await expect(page.locator('#fk-level')).toHaveText('MLB · 90 ft bases');
  await page.evaluate(() => { const s = document.getElementById('park') as HTMLSelectElement; s.value = [...s.options].find((o) => o.textContent!.includes('Fenway'))!.value; s.dispatchEvent(new Event('change')); });
  await expect(page.locator('#fk-level')).toHaveText('MLB · Red Sox — Fenway Park');
});

test('3D players: the fielder who gets the ball catches it and throws, and a batter stands in on a steal', async ({ page }) => {
  await page.locator('#btn-3d').click();
  await page.waitForFunction(() => document.body.classList.contains('view3d') || !!document.querySelector('#toast:not([hidden])'), null, { timeout: 15000 });
  if (!(await page.evaluate(() => document.body.classList.contains('view3d')))) test.skip(true, 'no WebGL in this browser');
  const lf = await page.evaluate(() => {
    const sf = (window as any).SimpleFielding;
    sf.runEvent({ kind: 'ground', at: { x: -80, y: 135 } });
    return sf.view3d().actions.LF.map((a: any) => a.type + ':' + (a.style || ''));
  });
  expect(lf[0]).toBe('catch:grounder');
  expect(lf).toContain('throw:');
  // A steal has no batter-runner, but there's still a batter at the plate.
  await page.evaluate(() => { const sf = (window as any).SimpleFielding; sf.state.runners = { first: true, second: false, third: false }; });
  await page.locator('#other-plays [data-play="steal2"]').click();
  expect(await page.evaluate(() => !!(window as any).SimpleFielding.view3d().batter)).toBe(true);
});

test('3D calls: OUT goes over the runner forced at 2nd and over the batter at 1st', async ({ page }) => {
  await page.locator('#btn-3d').click();
  await page.waitForFunction(() => document.body.classList.contains('view3d') || !!document.querySelector('#toast:not([hidden])'), null, { timeout: 15000 });
  if (!(await page.evaluate(() => document.body.classList.contains('view3d')))) test.skip(true, 'no WebGL in this browser');
  const calls = await page.evaluate(() => {
    const sf = (window as any).SimpleFielding;
    sf.state.runners = { first: true, second: false, third: false };
    sf.runEvent({ kind: 'ground', at: { x: -35, y: 85 } });
    const v = sf.view3d();
    const c = v.calls[0];
    sf.seek(c.t + 0.2);
    return { who: v.calls.map((x: any) => x.runner), shown: c.sprite.visible };
  });
  expect(calls.who).toContain('first');
  expect(calls.who).toContain('batter');
  expect(calls.shown).toBe(true);
});

test('3D follows a level and park changed while it was off', async ({ page }) => {
  await page.locator('#btn-3d').click();
  await page.waitForFunction(() => document.body.classList.contains('view3d') || !!document.querySelector('#toast:not([hidden])'), null, { timeout: 15000 });
  if (!(await page.evaluate(() => document.body.classList.contains('view3d')))) test.skip(true, 'no WebGL in this browser');
  await page.locator('#btn-3d').click();
  await page.evaluate(() => {
    const s = document.getElementById('league') as HTMLSelectElement; s.value = 'pro'; s.dispatchEvent(new Event('change'));
    const k = document.getElementById('park') as HTMLSelectElement; k.value = [...k.options].find((o) => o.textContent!.includes('Wrigley'))!.value; k.dispatchEvent(new Event('change'));
  });
  await page.locator('#btn-3d').click();
  await page.waitForFunction(() => document.body.classList.contains('view3d'));
  const g = await page.evaluate(() => { const v = (window as any).SimpleFielding.view3d(); return { key: v.geo.key, park: v.geo.park, base: v.geo.base }; });
  expect(g).toEqual({ key: 'pro', park: expect.stringContaining('wrigley'), base: 90 });
});

test('changing the level starts a clean slate: no runners, and no pickoff without leadoffs', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'building a play is for tablets and computers');
  const pick = async (lg: string) => page.evaluate((lg) => { const s = document.getElementById('league') as HTMLSelectElement; s.value = lg; s.dispatchEvent(new Event('change')); }, lg);
  await pick('pro');
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('.mini-base.b1').click();
  await expect(page.locator('.bp-act', { hasText: 'Pickoff throw' })).toBeVisible();
  await pick('littleLeague');
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.runners)).toEqual({ first: false, second: false, third: false });
  // Little League runners can't lead off, so there is nothing to pick off.
  await page.locator('.mini-base.b1').click();
  await expect(page.locator('.bp-act', { hasText: 'Pitch' })).toBeVisible();
  await expect(page.locator('.bp-act', { hasText: 'Pickoff throw' })).toHaveCount(0);
});

test('fielding lessons: pick a track and position, answer by dragging your player, get graded, finish the lesson', async ({ page }) => {
  await page.locator('#btn-learn').click();
  await page.locator('#learn-track [data-track="baseball"]').click();
  await page.locator('#learn-pos button', { hasText: '1B' }).click();
  // Filtered to what a first baseman needs.
  await expect(page.locator('.learn-item', { hasText: 'Pitcher, cover first' })).toBeVisible();
  await expect(page.locator('.learn-item', { hasText: 'Outfield: throw it in' })).toHaveCount(0);
  await page.locator('.learn-item', { hasText: 'Ball, base, backup' }).click();
  await page.locator('[data-go]').click();
  await expect(page.locator('#trainer-bar')).toContainText("You're the first baseman");
  // The answers stay hidden while you decide.
  await expect(page.locator('#result')).toBeHidden();
  const pts = await page.evaluate(() => {
    const T = (window as any).SimpleFielding.state.trainer;
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const m = svg.getScreenCTM()!;
    const pt = (x: number, y: number) => { const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(m); return { x: q.x, y: q.y }; };
    return { from: pt(T.start.x, T.start.y), to: pt(T.want.x, T.want.y) };
  });
  await page.mouse.move(pts.from.x, pts.from.y);
  await page.mouse.down();
  await page.mouse.move(pts.to.x, pts.to.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.tb-verdict')).toHaveText('Yes!');
  await expect(page.locator('.quiz-guess.right')).toHaveCount(1);
  // The rest of the lesson; a wrong choice offers a retry.
  while (await page.locator('[data-next]').count()) {
    const label = await page.locator('[data-next]').textContent();
    await page.locator('[data-next]').click();
    if (label && label.includes('Finish')) break;
    if (await page.locator('[data-stay]').count()) await page.locator('[data-stay]').click();
    else if (await page.locator('.tb-options button').count()) await page.locator('.tb-options button').first().click();
  }
  await expect(page.locator('#trainer-bar')).toContainText('Lesson done');
  await page.locator('[data-exit]').click();
  await expect(page.locator('#trainer-bar')).toBeHidden();
  await page.locator('#btn-learn').click();
  await expect(page.locator('.learn-item.done', { hasText: 'Ball, base, backup' })).toHaveCount(1);
});

test('lessons: every play says what was hit and the situation; you can try a step again or go back', async ({ page }) => {
  await page.evaluate(() => (window as any).SimpleFielding.lesson.start('bb-t-alligator'));
  await expect(page.locator('#trainer-bar .tb-what')).toContainText('A ground ball to the left side.');
  await expect(page.locator('#trainer-bar .tb-what')).toContainText('0 outs');
  await page.locator('#trainer-bar [data-stay]').click();
  await page.locator('#trainer-bar [data-next]').click();
  // Step 2 is a question; answer it right, then try it again: the question and its options come back.
  await page.locator('#trainer-bar .tb-choices button', { hasText: 'Down on the ground' }).click();
  await expect(page.locator('#trainer-bar .tb-verdict')).toHaveText('Yes!');
  await page.locator('#trainer-bar [data-retry]').click();
  await expect(page.locator('#trainer-bar .tb-q')).toContainText('Where is your glove');
  await expect(page.locator('#trainer-bar .tb-choices button')).toHaveCount(3);
  // And back to step 1.
  await page.locator('#trainer-bar [data-back]').click();
  await expect(page.locator('#trainer-bar .tb-head')).toContainText('1 of 3');
  await expect(page.locator('#trainer-bar [data-stay]')).toBeVisible();
});

test('lessons are 2D: the 3D button is hidden during a lesson and back afterwards', async ({ page }) => {
  await expect(page.locator('#btn-3d')).toBeVisible();
  await page.evaluate(() => (window as any).SimpleFielding.lesson.start('bb-m-jobs'));
  await expect(page.locator('#btn-3d')).toBeHidden();
  await page.locator('#trainer-bar .tb-x').click();
  await expect(page.locator('#btn-3d')).toBeVisible();
});
