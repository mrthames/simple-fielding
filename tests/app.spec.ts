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
  // Most tests exercise the full tool set; the Basic-mode tests switch back themselves.
  await page.addInitScript(() => { if (!sessionStorage.getItem('sf.test.mode')) { localStorage.setItem('sf.mode', '"coach"'); sessionStorage.setItem('sf.test.mode', '1'); } });
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
  await expect(page.locator('#play-title')).toHaveText('Single to left field');
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
  await expect(page.locator('#play-title')).toHaveText('Fly ball to left field');
});

test('steal button puts a runner on 1st and runs the steal', async ({ page }) => {
  await page.locator('#other-plays [data-play="steal2"]').click();
  await expect(page.locator('#play-title')).toHaveText('Stealing 2nd');
  await expect(page.locator('.mini-base.b1')).toHaveClass(/on/);
});

test('play library runs a scenario', async ({ page }) => {
  await page.locator('#btn-library').click();
  await expect(page.locator('#library')).toBeVisible();
  await page.locator('#library .lib-item', { hasText: 'Foul pop behind the plate' }).click();
  await expect(page.locator('#library')).toBeHidden();
  await expect(page.locator('#jobs li[data-pos="P"]')).toContainText('home plate');
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
  await expect(page.locator('#play-title')).toHaveText('Single to left field');
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
  await expect(page.locator('#play-title')).toHaveText('Single to left field');
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
  await expect(page.locator('#play-title')).toHaveText('Double to center field');
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
  await expect(page.locator('#play-title')).toHaveText('Single to left field');
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
  await expect(page.locator('#play-title')).toHaveText('Single to left field');
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

test('basic mode: a first visit shows the quick-pick list and hides the coach tools', async ({ page }) => {
  await page.evaluate(() => { localStorage.removeItem('sf.mode'); });
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/mode-basic/);
  for (const id of ['#btn-team', '#btn-board', '#btn-library', '#result-chips', '#other-plays', '#batter-seg']) {
    await expect(page.locator(id)).toBeHidden();
  }
  await expect(page.locator('#quick')).toBeVisible();
  await expect(page.locator('#sport-seg')).toBeVisible();
  await expect(page.locator('#outs')).toBeVisible();
  await page.locator('#quick-list .lib-item').nth(3).click();
  await expect(page.locator('#quick-list .lib-item.on')).toHaveCount(1);
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#quick-next').click();
  await expect(page.locator('#quick-list .lib-item').nth(4)).toHaveClass(/on/);
  // Dragging still works in Basic, and clears the pick.
  await dragBall(page, { x: -80, y: 135 });
  await expect(page.locator('#quick-list .lib-item.on')).toHaveCount(0);
  // Keyboard shortcuts for coach tools do nothing.
  await page.keyboard.press('w');
  await expect(page.locator('#board-bar')).toBeHidden();
});

test('basic mode: switching to coach mode brings everything back and sticks', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('sf.mode', '"basic"'); });
  await page.reload();
  await page.locator('#to-coach').click();
  await expect(page.locator('body')).not.toHaveClass(/mode-basic/);
  await expect(page.locator('#btn-team')).toBeVisible();
  await expect(page.locator('#quick')).toBeHidden();
  await page.reload();
  await expect(page.locator('#btn-board')).toBeVisible();
  await page.locator('#btn-settings').click();
  await page.locator('#mode-seg [data-mode="basic"]').click();
  await expect(page.locator('body')).toHaveClass(/mode-basic/);
  await expect(page.locator('#league')).toBeHidden();
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
  const s = await page.evaluate(() => (window as any).SimpleFielding.state.plan);
  expect(s.fielder).toBe('LF');
  expect(s.missedBy).toBe('SS');
});
