// Holds the play engine to the coaching conventions in docs/SCENARIOS.md.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');
const Field = require('../app/js/field.js');
const Scenarios = require('../app/js/scenarios.js');

const on = (...b) => Object.fromEntries(b.map((x) => [x, true]));
const play = (runners, event, extra) => Engine.planPlay(Object.assign({ runners, outs: 0 }, extra), event);
const role = (plan, pos) => plan.assignments[pos].role;
const near = (a, b, d = 6) => Math.hypot(a.x - b.x, a.y - b.y) <= d;
const geo = Field.geometry('littleLeague');
const B = geo.bases;
const end = (plan, pos) => { const a = plan.assignments[pos]; return a.path ? a.path[a.path.length - 1] : a.to; };

test('every plan gives all nine fielders a job and a finite timeline', () => {
  for (const sc of Scenarios.ALL) {
    const p = Engine.planPlay({ runners: sc.runners, outs: sc.outs, batter: sc.batter, leadoffs: sc.leadoffs }, sc.event);
    assert.equal(Object.keys(p.assignments).length, 9, sc.name);
    for (const pos of Field.POSITIONS) assert.ok(p.assignments[pos].job.length > 5, `${sc.name}: ${pos} has a job`);
    assert.ok(Number.isFinite(p.timeline.duration) && p.timeline.duration > 1 && p.timeline.duration < 30, `${sc.name}: duration ${p.timeline.duration}`);
    for (const id in p.timeline.tracks) {
      for (const k of p.timeline.tracks[id]) assert.ok(Number.isFinite(k.x) && Number.isFinite(k.y) && Number.isFinite(k.t), `${sc.name}: ${id} keyframe`);
    }
  }
});

test('nobody is sent outside the fence', () => {
  for (const sc of Scenarios.ALL) {
    const p = Engine.planPlay({ runners: sc.runners, outs: sc.outs }, sc.event);
    for (const pos of Field.POSITIONS) {
      const e = end(p, pos);
      assert.ok(Math.hypot(e.x, e.y) <= geo.fence, `${sc.name}: ${pos} at ${JSON.stringify(e)}`);
    }
  }
});

test('single to left, nobody on: SS cutoff, 2B covers 2nd, pitcher backs up', () => {
  const p = play({}, { kind: 'ground', at: { x: -80, y: 135 } });
  assert.equal(p.fielder, 'LF');
  assert.equal(p.target, 'second');
  assert.equal(role(p, 'SS'), 'cutoff');
  assert.equal(role(p, '2B'), 'cover');
  assert.ok(near(end(p, '2B'), B.second));
  assert.equal(role(p, 'P'), 'backup');
  assert.equal(role(p, 'CF'), 'backup');
});

test('single to right, nobody on: 2B cutoff, SS covers 2nd', () => {
  const p = play({}, { kind: 'ground', at: { x: 80, y: 135 } });
  assert.equal(p.fielder, 'RF');
  assert.equal(role(p, '2B'), 'cutoff');
  assert.ok(near(end(p, 'SS'), B.second));
});

test('single with a runner on 1st: throw to 3rd, SS cutoff, pitcher backs up 3rd', () => {
  const p = play(on('first'), { kind: 'ground', at: { x: 80, y: 135 } });
  assert.equal(p.target, 'third');
  assert.equal(role(p, 'SS'), 'cutoff');
  assert.ok(near(end(p, '3B'), B.third));
  assert.ok(end(p, 'P').x < B.third.x, 'pitcher is beyond 3rd base');
});

test('single with a runner on 2nd: throw home; 3B cuts from left, 1B from center and right', () => {
  const left = play(on('second'), { kind: 'ground', at: { x: -80, y: 135 } });
  assert.equal(left.target, 'home');
  assert.equal(role(left, '3B'), 'cutoff');
  assert.ok(near(end(left, 'SS'), B.third));
  const right = play(on('second'), { kind: 'ground', at: { x: 80, y: 135 } });
  assert.equal(role(right, '1B'), 'cutoff');
  assert.ok(near(end(right, '2B'), B.first));
  for (const p of [left, right]) {
    assert.ok(end(p, 'P').y < 0, 'pitcher backs up behind home');
    assert.equal(role(p, 'C'), 'cover');
  }
});

test('extra-base hit: relay and trailer, first baseman trails to 2nd', () => {
  const p = play({}, { kind: 'line', at: { x: -118, y: 128 }, result: 'double' });
  assert.equal(role(p, 'SS'), 'relay');
  assert.equal(role(p, '2B'), 'trail');
  assert.ok(near(end(p, '1B'), B.second));
  const r = play({}, { kind: 'line', at: { x: 118, y: 128 }, result: 'double' });
  assert.equal(role(r, '2B'), 'relay');
  assert.equal(role(r, 'SS'), 'trail');
});

test('double with a runner on 1st: relay lines up with home, 1B cuts in front of the plate', () => {
  const p = play(on('first'), { kind: 'line', at: { x: -52, y: 172 }, result: 'double' });
  assert.equal(p.target, 'home');
  assert.equal(role(p, '1B'), 'cutoff');
});

test('ground ball to the right side: pitcher covers 1st', () => {
  const p = play({}, { kind: 'ground', at: { x: 30, y: 62 } });
  assert.equal(p.fielder, '1B');
  assert.equal(role(p, 'P'), 'cover');
  assert.ok(near(end(p, 'P'), B.first));
});

test('double play: grounder to short, 2B covers; grounder to 2nd, SS covers', () => {
  const ss = play(on('first'), { kind: 'ground', at: { x: -22, y: 76 } });
  assert.deepEqual(ss.targets, ['second', 'first']);
  assert.ok(near(end(ss, '2B'), B.second));
  const sb = play(on('first'), { kind: 'ground', at: { x: 22, y: 76 } });
  assert.ok(near(end(sb, 'SS'), B.second));
});

test('bases loaded, less than two outs: force at home first', () => {
  const p = play(on('first', 'second', 'third'), { kind: 'ground', at: { x: 20, y: 74 } });
  assert.deepEqual(p.targets, ['home', 'first']);
});

test('two outs: take the easiest out', () => {
  const p = play(on('first', 'second'), { kind: 'ground', at: { x: -36, y: 50 } }, { outs: 2 });
  assert.deepEqual(p.targets, ['third']);
});

test('runner on 2nd only: no force, throw to 1st, look the runner back', () => {
  const p = play(on('second'), { kind: 'ground', at: { x: -24, y: 78 } });
  assert.deepEqual(p.targets, ['first']);
  assert.ok(p.notes.some((n) => /look them back/i.test(n)));
});

test('foul pop behind the plate: catcher catches, pitcher covers home', () => {
  const p = play(on('first'), { kind: 'pop', at: { x: -12, y: -14 } });
  assert.equal(p.fielder, 'C');
  assert.equal(role(p, 'P'), 'cover');
  assert.ok(near(end(p, 'P'), B.home, 4));
});

test('pop-up behind 2nd: middle infielder or center fielder, never the pitcher', () => {
  const p = play({}, { kind: 'pop', at: { x: 6, y: 102 } });
  assert.ok(['SS', '2B', 'CF'].includes(p.fielder), p.fielder);
});

test('fly to center with a runner on 3rd: tag up and throw home', () => {
  const p = play(on('third'), { kind: 'fly', at: { x: 0, y: 172 } });
  assert.equal(p.fielder, 'CF');
  assert.equal(p.target, 'home');
  assert.ok(p.runners.find((r) => r.id === 'third').tagUp);
});

test('bunt: 2B covers 1st, corners charge', () => {
  const p = play(on('first'), { kind: 'bunt', at: { x: -18, y: 26 } });
  assert.equal(p.fielder, '3B');
  assert.ok(near(end(p, '2B'), B.first));
});

test('steal of 2nd: 2B covers with a righty, SS with a lefty', () => {
  const r = play(on('first'), { kind: 'steal2' }, { batter: 'R' });
  assert.equal(role(r, '2B'), 'cover');
  assert.equal(role(r, 'SS'), 'backup');
  const l = play(on('first'), { kind: 'steal2' }, { batter: 'L' });
  assert.equal(role(l, 'SS'), 'cover');
});

test('Little League runners leave when the pitch arrives; with leadoffs they leave at once', () => {
  const ll = play(on('first'), { kind: 'steal2' });
  const leads = play(on('first'), { kind: 'steal2' }, { leadoffs: true });
  const start = (p) => p.runners.find((r) => r.id === 'first').start;
  assert.ok(start(ll) > start(leads));
});

test('passed ball with a runner on 3rd: catcher chases, pitcher covers home', () => {
  const p = play(on('third'), { kind: 'passedBall' });
  assert.equal(p.fielder, 'C');
  assert.equal(p.target, 'home');
  assert.ok(near(end(p, 'P'), B.home, 4));
});

test('home run and foul grounder are recognised', () => {
  assert.equal(play({}, { kind: 'fly', at: { x: 0, y: 260 } }).classification, 'homeRun');
  assert.equal(play({}, { kind: 'ground', at: { x: 40, y: 20 } }).classification, 'foulGround');
});

test('softball and 50/70 fields plan every scenario', () => {
  for (const league of ['softball', 'intermediate']) {
    const k = Field.geometry(league).base / 60;
    for (const sc of Scenarios.ALL) {
      const ev = Object.assign({}, sc.event);
      if (ev.at) ev.at = { x: ev.at.x * k, y: ev.at.y * k };
      const p = Engine.planPlay({ runners: sc.runners, outs: sc.outs, league }, ev);
      assert.equal(Object.keys(p.assignments).length, 9, `${league}: ${sc.name}`);
    }
  }
});
