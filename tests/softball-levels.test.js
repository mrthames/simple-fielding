// Fastpitch levels: 8U coach pitch, 14U, high school, college and pro. Targets from softball-levels-spec.md 2.7.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');
const Field = require('../app/js/field.js');
const Scenarios = require('../app/js/scenarios.js');

const on = (...b) => Object.fromEntries(b.map((x) => [x, true]));
const LEVELS = ['softball8', 'softball14', 'softballHS', 'softballCollege', 'softballPro'];
const play = (league, runners, ev, extra) => Engine.planPlay(Object.assign({ league, runners, outs: 0 }, extra), ev);
const call = (p, id) => { const r = p.runners.find((x) => x.id === id); return r.out ? 'out' : r.safe ? 'safe' : r.held ? 'held' : 'none'; };

test('a routine grounder to short is an out from 14U up, and a slapper beats it', () => {
  for (const L of ['softball14', 'softballHS', 'softballCollege', 'softballPro']) {
    assert.equal(call(play(L, {}, { kind: 'ground', at: { x: -26, y: 84 } }), 'batter'), 'out', L);
    assert.equal(call(play(L, {}, { kind: 'ground', at: { x: -26, y: 84 } }, { batter: 'S' }), 'batter'), 'safe', L + ' slapper');
  }
});

test('the shortstop covers 2nd on a softball steal, and the steal is close at college', () => {
  const p = play('softballCollege', on('first'), { kind: 'steal2' });
  assert.equal(p.assignments.SS.role, 'cover');
  const safeAt = p.timeline.events.find((e) => e.type === 'safe' || e.type === 'out');
  assert.ok(safeAt, 'a call is made');
});

test('softball triples are still possible, and a slapper sets the slap alignment', () => {
  const t = play('softballCollege', {}, { kind: 'fly', at: { x: -110, y: 175 }, result: 'triple' });
  assert.equal(t.hitBases, 3);
  const g = Field.geometry('softballHS');
  const r = Field.readyPositions(g, { runners: {}, outs: 0, batter: 'S' });
  assert.ok(Math.hypot(r['3B'].x, r['3B'].y) < 40, '3B is in');
  assert.ok(r.SS.x < -28, 'SS shades to the hole');
});

test('8U: a coach pitches, the player pitcher stands beside the circle, no steals and no leads', () => {
  const g = Field.geometry('softball8');
  assert.equal(g.rules.pitcher, 'adult');
  assert.deepEqual(Field.readyPositions(g, { runners: on('first') }).P, { x: 15, y: 36 });
  assert.equal(g.tempo.lead.first, 0);
  assert.ok(!Scenarios.ALL.filter((s) => Scenarios.fits(s, 'softball8')).some((s) => s.steal), 'no steal plays at 8U');
});

test('softball plays are listed only on softball fields, and every play runs at every softball level', () => {
  assert.ok(!Scenarios.ALL.filter((s) => s.sport === 'softball').some((s) => Scenarios.fits(s, 'pro')));
  for (const L of LEVELS) {
    for (const sc of Scenarios.ALL.filter((s) => Scenarios.fits(s, L))) {
      const p = Engine.planPlay({ league: L, runners: sc.runners, outs: sc.outs, batter: sc.batter }, sc.event);
      assert.equal(Object.keys(p.assignments).length, 9, `${L}: ${sc.name}`);
      assert.ok(Number.isFinite(p.timeline.duration) && p.timeline.duration < 30, `${L}: ${sc.name}`);
    }
    const g = Field.geometry(L);
    const r = Field.readyPositions(g, { runners: on('first'), outs: 0 });
    for (const pos of Field.POSITIONS) assert.ok(Math.hypot(r[pos].x, r[pos].y) < g.fenceAt(r[pos]) - 20, `${L} ${pos}`);
  }
});

test('the youth softball fields play exactly as before', () => {
  const p = play('softball', on('first'), { kind: 'ground', at: { x: -80, y: 135 } });
  assert.equal(p.fielder, 'LF');
  assert.equal(Field.geometry('softball').older, false);
});

// ---- 2026-09-25 softball adversarial review
test('review C1: a sacrifice bunt is an out at 1st from 14U up (the fielder meets the ball)', () => {
  for (const L of ['softball14', 'softballHS', 'softballCollege', 'softballPro']) {
    const p = play(L, on('first'), { kind: 'bunt', at: { x: -12, y: 30 } });
    assert.equal(call(p, 'batter'), 'out', L);
    assert.ok(Math.hypot(p.ball.fieldPoint.x, p.ball.fieldPoint.y) < 32, 'fielded on the way in');
  }
});
test('review C2: slap with a runner on 1st — the sure out at 1st', () => {
  for (const L of ['softball14', 'softballHS', 'softballCollege']) {
    const p = play(L, on('first'), { kind: 'ground', at: { x: -24, y: 56 }, slap: 'soft' }, { batter: 'S' });
    assert.equal(p.target, 'first', L);
    assert.equal(call(p, 'batter'), 'out', L);
  }
});
test('review M5/M6/M7/M9: back-pick at HS, 2B covers 1st on a slap, squeeze runner goes, a corner steps on the bag', () => {
  const bp = play('softballHS', on('first'), { kind: 'pitch', move: 'pitch', result: 'caught', runners: { first: { lead: 16 } } });
  assert.equal(bp.title, 'Back-pick at 1st');
  assert.equal(bp.assignments['2B'].role, 'cover', 'the second baseman sneaks in behind the runner');
  const sl = play('softballHS', {}, { kind: 'ground', at: { x: -26, y: 50 }, slap: 'soft' }, { batter: 'S' });
  assert.ok(Math.hypot(sl.assignments['2B'].to.x - 42.4, sl.assignments['2B'].to.y - 42.4) < 5, '2B covers 1st');
  const sq = play('softballHS', on('third'), { kind: 'bunt', at: { x: 6, y: 22 }, squeeze: true }, { outs: 1 });
  assert.equal(sq.runners.find((r) => r.id === 'third').to, 'home');
  const ld = play('softball', on('third'), { kind: 'line', at: { x: -30, y: 36 } });
  if (ld.fielder === '3B') assert.ok(ld.throws[0].step, '3B steps on the bag');
});
