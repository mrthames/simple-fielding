// Regression tests for the 2026-09-24 adversarial reviews (a professional baseball defensive
// coordinator and a fastpitch softball coach). Each test is one finding, with the reviewer's own repro.
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');
const Field = require('../app/js/field.js');
const Scenarios = require('../app/js/scenarios.js');

const on = (...b) => Object.fromEntries(b.map((x) => [x, true]));
const play = (runners, event, extra) => Engine.planPlay(Object.assign({ runners, outs: 0 }, extra), event);
const soft = (runners, event, extra) => play(runners, event, Object.assign({ league: 'softball' }, extra));
const geo = Field.geometry('littleLeague');
const B = geo.bases;
const end = (p, pos) => { const a = p.assignments[pos]; return a.path ? a.path[a.path.length - 1] : a.to; };
const pts = (p, pos) => { const a = p.assignments[pos]; return [...(a.path || []), a.to]; };
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inLane = (q) => { const along = (q.x + q.y) / Math.SQRT2, foul = (q.x - q.y) / Math.SQRT2; return along > 14 && along < 62 && foul > -1 && foul < 6; };
function segDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}
const runner = (p, id) => p.runners.find((r) => r.id === id);
const events = (p, type) => p.timeline.events.filter((e) => e.type === type);

// ---------------------------------------------------------------- CRITICAL (baseball)
test('C1: covering 1st, nobody runs or stands in the batter-runner\'s lane', () => {
  for (const at of [{ x: 30, y: 62 }, { x: 22, y: 76 }, { x: 40, y: 80 }]) {
    const p = play({}, { kind: 'ground', at });
    for (const pos of Field.POSITIONS) {
      if (p.assignments[pos].role === 'field') continue;
      for (const q of pts(p, pos)) assert.ok(!inLane(q), `${pos} at ${JSON.stringify(q)} on ${JSON.stringify(at)}`);
    }
  }
});

test('C2: on a bunt the first baseman doesn\'t park in the running lane', () => {
  for (const at of [{ x: -18, y: 26 }, { x: 2, y: 30 }]) {
    const p = play(on('first'), { kind: 'bunt', at });
    assert.ok(!inLane(end(p, '1B')), JSON.stringify(end(p, '1B')));
  }
});

test('C3: pop-up priority by direction — corners own balls in front of them; the pitcher never takes one', () => {
  assert.equal(play({}, { kind: 'pop', at: { x: 30, y: 40 } }).fielder, '1B');
  assert.equal(play({}, { kind: 'pop', at: { x: -30, y: 40 } }).fielder, '3B');
  assert.notEqual(play({}, { kind: 'pop', at: { x: 15, y: 45 } }).fielder, '2B');
  assert.notEqual(play({}, { kind: 'pop', at: { x: 0, y: 46 } }).fielder, 'P');
  assert.ok(['SS', '2B', 'CF'].includes(play({}, { kind: 'pop', at: { x: 6, y: 102 } }).fielder));
});

test('C4: a pop in front of the plate — the catcher takes it and the pitcher stays out of the way', () => {
  for (const kind of ['pop', 'line']) {
    const p = play({}, { kind, at: { x: 0, y: 25 } });
    if (kind === 'pop') assert.equal(p.fielder, 'C');
    if (p.fielder !== 'P') for (const q of pts(p, 'P')) assert.ok(d(q, { x: 0, y: 25 }) > 5, `P passes the catch at ${JSON.stringify(q)}`);
    assert.ok(d(end(p, 'CF'), { x: 0, y: 50 }) > 20, 'CF doesn\'t run 120 ft in to back up a catcher');
  }
});

// ---------------------------------------------------------------- MAJOR (baseball)
test('M1: on a bunt, the shortstop covers 2nd', () => {
  for (const runners of [{}, on('first'), on('first', 'third')]) {
    const p = play(runners, { kind: 'bunt', at: { x: -18, y: 26 } });
    assert.ok(d(end(p, 'SS'), B.second) < 6, JSON.stringify(runners));
  }
});

test('M2: bases-loaded bunt, less than two outs — take the force at home', () => {
  for (const at of [{ x: -18, y: 26 }, { x: 2, y: 30 }]) {
    const p = play(on('first', 'second', 'third'), { kind: 'bunt', at });
    assert.equal(p.targets[0], 'home');
  }
});

test('M3: the cutoff to 3rd stays off the base path', () => {
  for (const at of [{ x: 82, y: 132 }, { x: 40, y: 150 }]) {
    const p = play(on('first'), { kind: 'ground', at });
    const ss = end(p, 'SS');
    assert.ok(Math.min(segDist(ss, B.first, B.second), segDist(ss, B.second, B.third)) >= 6, JSON.stringify(ss));
  }
});

test('M4: every library play shows what it\'s named for', () => {
  const byName = (n) => Scenarios.ALL.find((s) => s.name === n);
  const run = (sc) => Engine.planPlay({ runners: sc.runners, outs: sc.outs, batter: sc.batter, leadoffs: sc.leadoffs }, sc.event);
  let p = run(byName('Tag up from 3rd — fly to center'));
  assert.ok(!runner(p, 'third').held && !runner(p, 'third').out, 'the runner tags and scores');
  p = run(byName('Tag up from 2nd — fly to right'));
  assert.ok(!runner(p, 'second').held, 'the runner tags up to 3rd');
  p = run(byName('Triple to the right-field corner'));
  assert.equal(runner(p, 'batter').to, 'third');
  // Bases loaded, double to deep center: nobody out at home while a trailing runner holds.
  p = play(on('first', 'second', 'third'), { kind: 'line', at: { x: 0, y: 190 }, result: 'double' });
  assert.ok(!runner(p, 'second').out, 'the runner from 2nd scores on a double');
});

test('M4: a ~165 ft fly with a runner on 3rd scores', () => {
  const p = play(on('third'), { kind: 'fly', at: { x: 0, y: 165 } });
  assert.ok(!runner(p, 'third').held && !runner(p, 'third').out);
});

test('M5: contested plays are decided by the clock, and runners do score on singles', () => {
  // A runner on 2nd scores on a clean single to the outfield.
  for (const at of [{ x: -80, y: 135 }, { x: 10, y: 150 }, { x: 82, y: 132 }]) {
    const p = play(on('second'), { kind: 'ground', at }, { outs: 1 });
    assert.ok(!runner(p, 'second').held && !runner(p, 'second').out, JSON.stringify(at));
  }
  // Nothing is out "by default": every out has a ball that got there first.
  for (const sc of Scenarios.ALL) {
    const p = Engine.planPlay({ runners: sc.runners, outs: sc.outs, batter: sc.batter, leadoffs: sc.leadoffs }, sc.event);
    for (const r of p.runners) if (r.out) assert.ok(events(p, 'out').length > 0, sc.name);
  }
});

test('M6: on pickoffs the second baseman stays off the 1st–2nd base path', () => {
  for (const kind of ['primaryLead', 'secondaryLead']) {
    const p = play(on('first'), { kind }, { league: 'intermediate', leadoffs: true });
    const g = Field.geometry('intermediate');
    assert.ok(segDist(end(p, '2B'), g.bases.first, g.bases.second) >= 5, kind);
  }
});

test('M7: on the 1st & 3rd cut play the pitcher never crosses the plate', () => {
  const p = play(on('first', 'third'), { kind: 'firstThirdSteal' });
  const keys = p.timeline.tracks.P;
  for (const k of keys) assert.ok(Math.hypot(k.x, k.y) > 5, JSON.stringify(k));
});

test('M8: a tag play at home is set up in front of the plate, not on it', () => {
  const p = play(on('second'), { kind: 'ground', at: { x: 82, y: 132 } });
  const c = end(p, 'C');
  assert.ok(c.y >= 2.5, JSON.stringify(c));
  assert.match(p.assignments.C.job, /leave the runner a path/);
});

test('M9: a line drive belongs to whoever is in its path, and runners freeze', () => {
  const p = play(on('first'), { kind: 'line', at: { x: 10, y: 58 } });
  assert.equal(p.fielder, 'P');
  assert.equal(p.target, 'first');
});

test('M10: foul flies out of play aren\'t caught; deep foul flies allow a tag-up', () => {
  assert.equal(play({}, { kind: 'fly', at: { x: 180, y: 150 } }).ball.caught, false);
  assert.equal(play({}, { kind: 'pop', at: { x: 0, y: -40 } }).ball.caught, false);
  const p = play(on('third'), { kind: 'fly', at: { x: -110, y: 95 } });
  assert.equal(p.target, 'home');
});

test('M11: softball — the second baseman covers 1st when the first baseman fields it', () => {
  const p = soft({}, { kind: 'ground', at: { x: 34, y: 50 } });
  assert.equal(p.fielder, '1B');
  assert.ok(d(end(p, '2B'), B.first) < 6);
});

test('M12: on a ball to the gap the far corner outfielder doesn\'t run across the field', () => {
  const p = play(on('third'), { kind: 'ground', at: { x: -40, y: 150 } });
  assert.ok(end(p, 'RF').x > 0, JSON.stringify(end(p, 'RF')));
});

// ---------------------------------------------------------------- MINOR (baseball)
test('minor: no two fielders end on the same spot, on any library play or a sweep of grounders', () => {
  const plays = Scenarios.ALL.map((sc) => [sc.name, { runners: sc.runners, outs: sc.outs, batter: sc.batter, leadoffs: sc.leadoffs }, sc.event]);
  for (const r of [on('second'), on('first', 'second', 'third')]) plays.push(['grounder to 3B', { runners: r, outs: 0 }, { kind: 'ground', at: { x: -38, y: 52 } }]);
  for (const [name, s, e] of plays) {
    const p = Engine.planPlay(s, e);
    for (const a of Field.POSITIONS) for (const b of Field.POSITIONS) {
      if (a >= b) continue;
      assert.ok(d(end(p, a), end(p, b)) >= 6, `${name}: ${a} and ${b}`);
    }
  }
});

test('minor: grounder to 3rd with a runner on 2nd — somebody covers 3rd', () => {
  const p = play(on('second'), { kind: 'ground', at: { x: -38, y: 52 } });
  assert.ok(Field.POSITIONS.some((pos) => pos !== '3B' && d(end(p, pos), B.third) < 6));
});

test('minor: two outs, everybody runs on contact', () => {
  const p = play(on('second'), { kind: 'ground', at: { x: -24, y: 78 } }, { outs: 2 });
  assert.notEqual(runner(p, 'second').to, 'second');
});

test('minor: catcher fields a dribbler with the bases loaded — the pitcher isn\'t on the plate', () => {
  const p = play(on('first', 'second', 'third'), { kind: 'ground', at: { x: 3, y: 8 } });
  assert.equal(p.fielder, 'C');
  assert.ok(d(end(p, 'P'), { x: 0, y: 0 }) > 6);
  assert.doesNotMatch(p.assignments.P.job, /bunt/);
});

test('minor: steal of 3rd with a lefty batter doesn\'t mention a right-handed batter', () => {
  const p = play(on('second'), { kind: 'steal3' }, { batter: 'L' });
  assert.doesNotMatch(p.assignments.C.job, /right-handed/);
});

test('minor: the cutoff to home scales with the field', () => {
  const p = play(on('second'), { kind: 'ground', at: { x: 90, y: 150 } }, { league: 'intermediate' });
  const cut = end(p, '1B');
  assert.match(p.assignments['1B'].job, /42 feet/);
  assert.ok(Math.abs(Math.hypot(cut.x, cut.y) - 42) < 3);
});

test('minor: infield fly rule is mentioned when it applies', () => {
  const p = play(on('first', 'second'), { kind: 'pop', at: { x: -20, y: 70 } });
  assert.ok(p.notes.some((n) => /Infield fly rule/.test(n)));
});

test('minor: a ground ball dropped beyond the fence stays in the park', () => {
  const p = play({}, { kind: 'ground', at: { x: 0, y: 260 } });
  assert.ok(Math.hypot(p.ball.fieldPoint.x, p.ball.fieldPoint.y) < geo.fence);
});

test('minor: passed ball with a throw to 3rd — the left fielder backs up 3rd', () => {
  const p = play(on('second'), { kind: 'passedBall' });
  assert.equal(p.target, 'third');
  assert.equal(p.assignments.LF.role, 'backup');
});

// ---------------------------------------------------------------- softball
test('S1: softball runners leave on the release, and steals are decided by the clock', () => {
  const p = soft(on('first'), { kind: 'steal2' });
  assert.equal(runner(p, 'first').start, 0);
  const ll = play(on('first'), { kind: 'steal2' });
  assert.ok(runner(ll, 'first').start > 0);
});

test('S2: softball corners play even with the bag, and come in with a runner on 1st', () => {
  const g = Field.geometry('softball');
  assert.ok(g.ready['3B'].y <= g.bases.third.y + 2);
  const r = Field.readyPositions(g, { runners: on('first'), outs: 0 });
  assert.ok(Math.hypot(r['3B'].x, r['3B'].y) < 42);
  assert.ok(g.ready.CF.y < 0.75 * g.fence);
});

test('S4: softball — a runner on 2nd scores on a single', () => {
  const p = soft(on('second'), { kind: 'ground', at: { x: -60, y: 110 } }, { outs: 1 });
  assert.ok(!runner(p, 'second').held && !runner(p, 'second').out);
});

test('S6: bunt fielded by the third baseman with a runner on 1st — the catcher covers 3rd', () => {
  const p = soft(on('first'), { kind: 'bunt', at: { x: -15, y: 22 } });
  assert.equal(p.fielder, '3B');
  assert.ok(d(end(p, 'C'), B.third) < 6);
});

test('S7: softball look-back — based on the lead runner, and the pitcher holds the ball', () => {
  const p = soft(on('second'), { kind: 'primaryLead' });
  assert.equal(p.target, 'second');
  // The only throw is the catcher's return to the pitcher; the pitcher holds it.
  assert.equal(p.throws.filter((t) => t.to !== 'mound').length, 0);
  assert.ok(runner(p, 'second'));
  assert.ok(!runner(p, 'first'));
});

test('S8: softball — nobody assigns the pitcher a pop-up in the circle', () => {
  assert.notEqual(soft({}, { kind: 'pop', at: { x: 3, y: 38 } }).fielder, 'P');
});

test('S11: 1st & 3rd with two outs — throw through to 2nd', () => {
  const p = soft(on('first', 'third'), { kind: 'firstThirdSteal' }, { outs: 2 });
  assert.equal(p.target, 'second');
});

test('S14: softball wording — the circle, not the mound', () => {
  for (const sc of Scenarios.ALL) {
    const p = Engine.planPlay({ runners: sc.runners, outs: sc.outs, league: 'softball' }, sc.event);
    for (const pos of Field.POSITIONS) assert.doesNotMatch(p.assignments[pos].job, /mound/, `${sc.name}: ${pos}`);
  }
});

test('S15: a 10U softball field (35 ft) plans every library play', () => {
  const g = Field.geometry('softball10');
  assert.equal(g.mound.y, 35);
  for (const sc of Scenarios.ALL) {
    const p = Engine.planPlay({ runners: sc.runners, outs: sc.outs, league: 'softball10' }, sc.event);
    assert.equal(Object.keys(p.assignments).length, 9, sc.name);
  }
});
