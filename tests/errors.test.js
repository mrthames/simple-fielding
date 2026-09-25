// Errors: the coach says a play was misplayed; the engine shows what it costs, by the clock.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');
const Field = require('../app/js/field.js');
const Scenarios = require('../app/js/scenarios.js');
const Share = require('../app/js/share.js');

const on = (...b) => Object.fromEntries(b.map((x) => [x, true]));
const play = (league, runners, event) => Engine.planPlay({ league, runners, outs: 0 }, event);
const err = (type, extra) => Object.assign({ result: 'error', error: { type } }, extra);
const SS = { x: -40, y: 80 };
const runner = (plan, id) => plan.runners.find((r) => r.id === id);
const LEVELS = ['littleLeague', 'intermediate', 'highSchool', 'pro', 'softball', 'softballCollege'];

test('each batted ball lists the errors it can have', () => {
  assert.deepEqual(play('littleLeague', {}, { kind: 'ground', at: SS }).errorOptions, ['bobble', 'legs', 'throw']);
  assert.deepEqual(play('littleLeague', {}, { kind: 'bunt', at: { x: 3, y: 20 } }).errorOptions, ['bobble', 'throw']);
  assert.deepEqual(play('littleLeague', {}, { kind: 'pop', at: { x: 5, y: 50 } }).errorOptions, [], 'a caught pop-up: nothing to misplay here');
  // An error play lists the same choices as the clean one, so the app can offer the others.
  assert.deepEqual(play('littleLeague', {}, Object.assign({ kind: 'ground', at: SS }, err('throw'))).errorOptions, ['bobble', 'legs', 'throw']);
});

test('a bobble costs the out at 1st, and is scored as an error on the fielder', () => {
  const clean = play('littleLeague', {}, { kind: 'ground', at: SS });
  assert.ok(runner(clean, 'batter').out, 'the clean play gets the batter');
  const p = play('littleLeague', {}, Object.assign({ kind: 'ground', at: SS }, err('bobble')));
  assert.equal(p.error.type, 'bobble');
  assert.match(p.title, /^E6: bobbled/);
  assert.ok(!runner(p, 'batter').out, 'the batter beats the late throw');
  assert.match(p.summary, /safe at 1st.*\(E6\)/);
  assert.ok(p.timeline.events.some((e) => e.text === 'Bobbled!'));
});

test('a throw that gets away: the backup runs it down and every runner tries for one more base', () => {
  const p = play('littleLeague', on('first'), Object.assign({ kind: 'ground', at: SS }, err('throw')));
  assert.equal(p.error.type, 'throw');
  const wild = p.throws.find((t) => t.wild);
  assert.ok(wild, 'one throw is marked wild');
  assert.equal(p.throws[p.throws.length - 1].fromPos, p.error.retriever, 'the retriever makes the last throw');
  assert.equal(runner(p, 'batter').to === 'second' || runner(p, 'batter').held === 'first', true);
  assert.ok(['third', 'second'].includes(runner(p, 'first').to), 'the runner from 1st goes on');
  // The retriever's track ends where the ball went.
  const k = p.timeline.tracks[p.error.retriever];
  const last = k[k.length - 1];
  assert.ok(Math.hypot(last.x - wild.wild.x, last.y - wild.wild.y) < 8, 'the retriever gets to the ball');
  assert.ok(p.timeline.events.some((e) => e.text === 'Gets away!'));
});

test('a runner who was staying put goes when the throw gets away, not before', () => {
  const p = play('littleLeague', on('second'), Object.assign({ kind: 'ground', at: SS }, err('throw')));
  const r = runner(p, 'second');
  assert.equal(r.start, 'onWild');
  const k = p.timeline.tracks['runner:second'];
  const wildT = p.timeline.events.find((e) => e.text === 'Gets away!').t;
  const moved = k.find((q) => Math.hypot(q.x - k[0].x, q.y - k[0].y) > 2);
  assert.ok(moved && moved.t >= wildT, 'no move toward 3rd before the throw gets by');
});

test('through the legs: the ball goes on into the outfield, and the error is on the infielder who missed it', () => {
  const p = play('littleLeague', on('first'), Object.assign({ kind: 'ground', at: SS }, err('legs')));
  assert.equal(p.error.type, 'legs');
  const clean = play('littleLeague', on('first'), { kind: 'ground', at: SS });
  assert.equal(p.error.pos, clean.fielder, 'the infielder who would have fielded it');
  assert.equal(p.classification, 'outfieldHit');
  assert.match(p.title, /^E\d: through the legs/);
  assert.match(p.assignments[clean.fielder].job, /under your glove/);
  // The coach can say where it rolled.
  const q = play('littleLeague', {}, Object.assign({ kind: 'ground', at: SS }, err('legs'), { error: { type: 'legs', to: { x: -20, y: 170 } } }));
  assert.ok(Math.hypot(q.ball.fieldPoint.x + 20, q.ball.fieldPoint.y - 170) < 12);
});

test('a dropped fly ball: the batter is on, and it is named for what was hit', () => {
  const p = play('littleLeague', on('first'), Object.assign({ kind: 'fly', at: { x: -60, y: 120 } }, err('bobble')));
  assert.equal(p.error.type, 'bobble');
  assert.match(p.title, /^E7: dropped fly ball to left field/);
  assert.ok(!runner(p, 'batter').out);
  assert.ok(p.timeline.events.some((e) => e.text === 'Dropped!'));
});

test('an outfielder who lets a single get away: the runners try for an extra base', () => {
  const p = play('littleLeague', on('second'), Object.assign({ kind: 'line', at: { x: -60, y: 110 } }, err('bobble')));
  assert.match(p.title, /^E7: it gets away — single to left field/);
  assert.equal(runner(p, 'batter').to, 'second');
  assert.equal(runner(p, 'second').to, 'home');
});

test('every list play, every error it offers, on several levels: a finite timeline and a truthful summary', () => {
  for (const league of LEVELS) {
    const geo = Field.geometry(league);
    for (const sc of Scenarios.ALL) {
      if (!sc.event.at || !['ground', 'line', 'fly', 'pop', 'bunt'].includes(sc.event.kind)) continue;
      const k = geo.base / 60;
      const at = sc.abs ? sc.event.at : { x: sc.event.at.x * k, y: sc.event.at.y * k };
      // Error takes the place of Single, Double or Caught under "What happens?", as in the app.
      const base = Object.assign({}, sc.event, { at, result: undefined });
      const s = { league, runners: sc.runners, outs: sc.outs || 0, batter: sc.batter };
      const opts = Engine.planPlay(s, base).errorOptions;
      for (const type of opts) {
        const p = Engine.planPlay(s, Object.assign({}, base, err(type)));
        const name = `${league} · ${sc.name} · ${type}`;
        assert.ok(p.error, `${name}: the error happens`);
        assert.ok(Number.isFinite(p.timeline.duration) && p.timeline.duration < 30, `${name}: duration ${p.timeline.duration}`);
        for (const id in p.timeline.tracks) for (const q of p.timeline.tracks[id]) assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.t), `${name}: ${id}`);
        // The summary names each runner's fate as the clock decided it.
        for (const r of p.runners) {
          if (r.out) assert.match(p.summary, /is out at/, name);
          if (r.held && r.held !== r.from) assert.match(p.summary, /holds at/, name);
        }
        if (!p.runners.some((r) => r.out)) assert.doesNotMatch(p.summary, /is out at/, name);
        assert.match(p.summary, /\(E\d\)/, name);
      }
    }
  }
});

test('an error survives a share link', () => {
  const ev = Object.assign({ kind: 'ground', at: { x: -45, y: 95 } }, err('throw'));
  ev.error.to = { x: 40, y: 70 };
  const d = Share.decode(Share.encode({ league: 'pro', runners: on('first'), outs: 1 }, ev, 'Bad throw'));
  assert.deepEqual(d.event.error, { type: 'throw', to: { x: 40, y: 70 } });
  assert.equal(d.event.result, 'error');
  const d2 = Share.decode(Share.encode({ league: 'softball', runners: {}, outs: 0 }, Object.assign({ kind: 'ground', at: { x: -30, y: 60 } }, err('legs')), ''));
  assert.deepEqual(d2.event.error, { type: 'legs' });
});
