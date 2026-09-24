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
