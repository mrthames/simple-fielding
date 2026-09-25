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

test('build a play: runner on 1st stealing with a lead, then a pickoff, then a passed ball placed on the field', async ({ page }) => {
  await page.locator('#btn-settings').click();
  await page.locator('#league').selectOption('pro');
  await page.locator('#settings [data-close]').click();
  await page.locator('#panel-mode [data-pm="build"]').click();
  await expect(page.locator('#build')).toBeVisible();
  await expect(page.locator('#quick')).toBeHidden();
  await page.locator('#mini-diamond [data-base="first"]').click();
  const row = page.locator('#build-runners .br-row').first();
  await row.locator('input').fill('14');
  await row.locator('.br-go').click();
  await expect(row.locator('.br-go')).toHaveText('Stealing');
  await page.locator('#build-go').click();
  let plan = await page.evaluate(() => { const p = (window as any).SimpleFielding.state.plan; return { title: p.title, lead: p.runners[0].leadStart }; });
  expect(plan).toEqual({ title: 'Stealing 2nd', lead: 14 });
  // Pickoff at 1st with a big lead is an out at pro.
  await page.locator('#build-what [data-what="pickoff"]').click();
  await row.locator('input').fill('17');
  await page.locator('#build-go').click();
  plan = await page.evaluate(() => { const p = (window as any).SimpleFielding.state.plan; return { title: p.title, out: !!p.runners[0].out }; });
  expect(plan).toEqual({ title: 'Pickoff at 1st', out: true });
  // Passed ball: tap behind the plate to put it there.
  await page.locator('#build-what [data-what="pitch"]').click();
  await page.locator('#btn-reset').click();
  const pt = await page.evaluate(() => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = -30; p.y = 30; const q = p.matrixTransform(svg.getScreenCTM()!); return { x: q.x, y: q.y };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('#build-result [data-res="passed"]')).toHaveClass(/on/);
  await expect(page.locator('.ball-spot')).toHaveCount(1);
  await page.locator('#build-go').click();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.title)).toContain('Passed ball');
});

test('build a play: drag a fielder to a new spot; it is saved into a shared link', async ({ page }) => {
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('#mini-diamond [data-base="first"]').click();
  const toScreen = (x: number, y: number) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(svg.getScreenCTM()!); return { x: q.x, y: q.y };
  }, [x, y]);
  const ss = await page.evaluate(() => (window as any).SimpleFielding.state && document.querySelector('.player[data-pos="SS"]')!.getBoundingClientRect());
  await page.mouse.move(ss.x + ss.width / 2, ss.y + ss.height / 2);
  await page.mouse.down();
  const to = await toScreen(-10, 60);
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const start = await page.evaluate(() => (window as any).SimpleFielding.state.build.start.SS);
  expect(Math.abs(start.x + 10) < 4 && Math.abs(start.y - 60) < 4).toBeTruthy();
  await page.locator('#build-go').click();
  const code = await page.evaluate(() => { const S = (window as any).Share; const st = (window as any).SimpleFielding.state; return S.encode({ league: st.league, runners: st.runners, outs: st.outs, start: st.build.start }, st.lastEvent, 'SS in'); });
  const d = await page.evaluate((c) => (window as any).Share.decode(c), code);
  expect(d.situation.start.SS.y).toBeCloseTo(start.y, 0);
});

test('build a play on the field: press and hold or right-click a base, a runner, the plate and the pitcher', async ({ page }) => {
  await page.locator('#btn-settings').click();
  await page.locator('#league').selectOption('pro');
  await page.locator('#settings [data-close]').click();
  await page.locator('#panel-mode [data-pm="build"]').click();
  const toScreen = (x: number, y: number) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('field') as unknown as SVGSVGElement;
    const p = svg.createSVGPoint(); p.x = x; p.y = -y; const q = p.matrixTransform(svg.getScreenCTM()!); return { x: q.x, y: q.y };
  }, [x, y]);
  const menu = page.locator('#field-menu');
  // Right-click 1st base: put a runner there.
  let at = await page.evaluate(() => { const r = document.querySelector('#field .base[data-base="first"]')!.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Put a runner on 1st' }).click();
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.runners.first)).toBe(true);
  // Press and hold the runner: set the lead and send them. The long press must not take the runner off.
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(menu).toBeVisible();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.runners.first)).toBe(true);
  await menu.locator('input[type=range]').fill('14');
  await expect(menu.locator('.fm-lead span')).toHaveText('Lead: 14 ft');
  await menu.getByRole('menuitem', { name: 'Steals on the pitch' }).click();
  await expect(page.locator('#build-runners .br-go').first()).toHaveText('Stealing');
  // Home plate: what happens on the pitch.
  at = await toScreen(0, 1);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(menu.locator('.fm-title')).toHaveText('What happens?');
  await menu.getByRole('menuitem', { name: /It gets by/ }).click();
  await expect(page.locator('#build-result [data-res="passed"]')).toHaveClass(/on/);
  // The pitcher: a pickoff throw to 1st, then run it from the menu.
  const p = await page.evaluate(() => document.querySelector('.player[data-pos="P"]')!.getBoundingClientRect());
  await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2, { button: 'right' });
  await menu.getByRole('menuitem', { name: 'Pickoff throw to 1st' }).click();
  await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2, { button: 'right' });
  await menu.locator('.fm-go').click();
  const plan = await page.evaluate(() => { const p = (window as any).SimpleFielding.state.plan; return { title: p.title, lead: p.runners[0].leadStart }; });
  expect(plan).toEqual({ title: 'Pickoff at 1st', lead: 14 });
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

test('dropped third strike, delayed steal and look-back plays', async ({ page }) => {
  await page.locator('#other-plays [data-play="droppedThird"]').click();
  await expect(page.locator('#play-title .pt-name')).toContainText('Dropped third strike');
  await page.locator('#sport-seg [data-sport="softball"]').click();
  await page.locator('#other-plays [data-play="delayedSteal"]').click();
  await expect(page.locator('#play-title .pt-name')).toContainText('delayed steal');
  await page.locator('#quick-list .lib-item', { hasText: 'stops: out by rule' }).click();
  await expect(page.locator('#result-title')).toContainText('Look-back');
  // Builder: strike three in the dirt.
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('#build-result [data-res="dropped"]').click();
  await page.locator('#build-go').click();
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.plan.title)).toContain('Dropped third strike');
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

test('changing the level starts a clean slate: no runners, a fresh builder, and no pickoff without leadoffs', async ({ page }) => {
  const pick = async (lg: string) => page.evaluate((lg) => { const s = document.getElementById('league') as HTMLSelectElement; s.value = lg; s.dispatchEvent(new Event('change')); }, lg);
  await pick('pro');
  await page.locator('#panel-mode [data-pm="build"]').click();
  await page.locator('.mini-base.b1').click();
  const lead = page.locator('#build-runners input[type=range]').first();
  await lead.fill('25');
  await expect(page.locator('#build-runners .br-lead span').first()).toHaveText('25 ft lead');
  await expect(page.locator('#build-what [data-what="pickoff"]')).toBeVisible();
  await pick('littleLeague');
  expect(await page.evaluate(() => (window as any).SimpleFielding.state.runners)).toEqual({ first: false, second: false, third: false });
  await expect(page.locator('#build-runners .br-row')).toHaveCount(0);
  await expect(page.locator('#build-what [data-what="pickoff"]')).toBeHidden();
  // A runner put on at Little League has no lead to set.
  await page.locator('.mini-base.b1').click();
  await expect(page.locator('#build-runners .br-lead span').first()).toHaveText('No lead');
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
