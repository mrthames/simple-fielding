// High school, college, 13U-14U and pro fields, and ballpark shapes.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');
const Field = require('../app/js/field.js');
const Scenarios = require('../app/js/scenarios.js');

const on = (...b) => Object.fromEntries(b.map((x) => [x, true]));
const LEVELS = ['junior90', 'highSchool', 'college', 'pro'];
const polar = (a, r) => { const t = (a + 45) * Math.PI / 180; return { x: Math.cos(t) * r, y: Math.sin(t) * r }; };

test('every park draws its published distances down the lines and to center', () => {
  for (const p of Field.PARKS) {
    const league = p.for === 'littleLeague' ? 'littleLeague' : 'pro';
    const g = Field.geometry(league, p.key);
    assert.equal(g.park, p.key);
    const pub = (a) => p.fence.find((q) => q.a === a).ft;
    assert.equal(Math.round(g.fenceDir(0)), pub(0), p.key + ' RF line');
    assert.equal(Math.round(g.fenceDir(45)), pub(45), p.key + ' CF');
    assert.equal(Math.round(g.fenceDir(90)), pub(90), p.key + ' LF line');
    // Between two published points the wall never dips below the nearer, shorter one.
    for (let a = 0; a <= 90; a += 1) {
      const lo = Math.min(...p.fence.filter((q) => Math.abs(q.a - a) <= 23).map((q) => q.ft));
      assert.ok(g.fenceDir(a) >= lo - 0.5, `${p.key} at ${a}`);
    }
  }
});

test('nobody starts outside the fence, in any park or level', () => {
  const fields = [];
  for (const L of LEVELS) { fields.push([L, null]); for (const p of Field.parksFor(L)) fields.push([L, p.key]); }
  for (const p of Field.parksFor('littleLeague')) fields.push(['littleLeague', p.key]);
  for (const [L, park] of fields) {
    const g = Field.geometry(L, park);
    for (const outs of [0, 2]) {
      const r = Field.readyPositions(g, { runners: on('first'), outs });
      for (const pos of Field.POSITIONS) {
        const d = Math.hypot(r[pos].x, r[pos].y);
        assert.ok(d < g.fenceAt(r[pos]) - 20, `${L}/${park} ${pos} at ${d.toFixed(0)}`);
      }
    }
  }
});

test('every play on a 90 ft field gives all nine a job and a finite timeline', () => {
  for (const L of LEVELS) {
    for (const sc of Scenarios.ALL.filter((s) => Scenarios.fits(s, L))) {
      const p = Engine.planPlay({ runners: sc.runners, outs: sc.outs, batter: sc.batter, league: L }, sc.event);
      assert.equal(Object.keys(p.assignments).length, 9, `${L}: ${sc.name}`);
      assert.ok(Number.isFinite(p.timeline.duration) && p.timeline.duration > 0 && p.timeline.duration < 30, `${L}: ${sc.name}`);
    }
  }
});

test('90 ft plays are listed only on 90 ft fields', () => {
  const abs = Scenarios.ALL.filter((s) => s.abs && s.sport !== 'softball');
  assert.ok(abs.length >= 10);
  for (const s of abs) {
    assert.ok(!Scenarios.fits(s, 'littleLeague'));
    assert.ok(Scenarios.fits(s, 'pro'));
  }
});

test('pro speed of play: DP turned, average steal safe, deep sac fly scores', () => {
  const dp = Engine.planPlay({ runners: on('first'), outs: 0, league: 'pro' }, { kind: 'ground', at: { x: -38, y: 132 } });
  assert.ok(dp.runners.find((r) => r.id === 'first').out && dp.runners.find((r) => r.id === 'batter').out, '6-4-3');
  const steal = Engine.planPlay({ runners: on('first'), outs: 0, league: 'pro' }, { kind: 'steal2' });
  assert.ok(steal.runners.find((r) => r.id === 'first').safe, 'steal of 2nd');
  const sac = Engine.planPlay({ runners: on('third'), outs: 0, league: 'pro' }, { kind: 'fly', at: { x: 0, y: 320 } });
  assert.ok(sac.runners.find((r) => r.id === 'third').safe, 'sac fly at 320');
});

test("younger players take longer: the same double play is slower at 13U-14U than at pro, and often isn't turned", () => {
  const t = (L) => {
    const p = Engine.planPlay({ runners: on('first'), outs: 0, league: L }, { kind: 'ground', at: { x: -38, y: 132 } });
    // When the relay throw reaches 1st.
    return Math.max(...p.timeline.events.filter((e) => e.type === 'throw').map((e) => e.tEnd));
  };
  assert.ok(t('junior90') > t('highSchool') && t('highSchool') > t('pro'));
  const j = Engine.planPlay({ runners: on('first'), outs: 0, league: 'junior90' }, { kind: 'ground', at: { x: -38, y: 132 } });
  assert.ok(j.runners.find((r) => r.id === 'first').out, 'the lead runner is still out at 13U-14U');
});

test('the cutoff home stands about 45 ft from the plate at 90 ft', () => {
  const p = Engine.planPlay({ runners: on('second'), outs: 1, league: 'pro' }, { kind: 'ground', at: { x: 10, y: 255 }, result: 'single' });
  const cut = Object.values(p.assignments).find((a) => a.role === 'cutoff');
  const end = cut.path ? cut.path[cut.path.length - 1] : cut.to;
  assert.ok(Math.abs(Math.hypot(end.x, end.y) - 45) < 3, `cutoff at ${Math.hypot(end.x, end.y)}`);
});

test('a park changes the wall: a fly that stays in a standard park is gone at Fenway', () => {
  const std = Field.geometry('pro'), fen = Field.geometry('pro', 'redsox-fenway');
  const a = 88;
  assert.ok(fen.fenceDir(a) < std.fenceDir(a));
  const at = polar(a, (fen.fenceDir(a) + std.fenceDir(a)) / 2 + 2);
  const inStd = Engine.planPlay({ runners: {}, outs: 0, league: 'pro' }, { kind: 'fly', at });
  const inFen = Engine.planPlay({ runners: {}, outs: 0, league: 'pro', park: 'redsox-fenway' }, { kind: 'fly', at });
  assert.ok(!inStd.homeRun);
  assert.ok(inFen.homeRun);
});

test('review fixes: reach from hang time, infield range past the dirt, cut play, short walls', () => {
  const pro = (runners, ev, park) => Engine.planPlay({ runners, outs: 0, league: 'pro', park }, ev);
  // C1: a 4.7 s fly 58 ft from the center fielder is caught.
  assert.equal(pro({}, { kind: 'fly', at: { x: 58, y: 320 } }).classification, 'outfieldFly');
  // C2: a grounder 12 ft behind the shortstop is still the shortstop's.
  const g = pro({}, { kind: 'ground', at: { x: -46, y: 152 } });
  assert.equal(g.fielder, 'SS');
  // C3: on the 1st & 3rd cut play the ball goes out to the cutoff in front of 2nd.
  const ft = pro(on('first', 'third'), { kind: 'firstThirdSteal' });
  const throws = ft.timeline.events.filter((e) => e.type === 'throw');
  assert.ok(throws.length && Math.hypot(throws[0].to.x, throws[0].to.y) > 60, 'first throw goes toward 2nd');
  // C4: off Fenway's short left-field wall it's a double, not a triple.
  const f = pro({}, { kind: 'line', at: { x: -205, y: 214 } }, 'redsox-fenway');
  assert.notEqual(f.hitBases, 3);
  // M1: a "double" never leaves the park.
  const d = Engine.planPlay({ runners: {}, outs: 0, league: 'junior90' }, { kind: 'line', at: { x: -205, y: 222 }, result: 'double' });
  assert.ok(!d.homeRun);
});
