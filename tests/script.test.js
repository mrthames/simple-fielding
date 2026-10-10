// Build a play: plays written step by step (app/js/script.js). The coach decides every safe and out; these tests
// check that the steps become the play they describe, and survive a share link.
const test = require('node:test');
const assert = require('node:assert');
const Engine = require('../app/js/engine.js');
const Script = require('../app/js/script.js');
const Share = require('../app/js/share.js');
const Field = require('../app/js/field.js');

const FIRST_THIRD = { league: 'littleLeague', runners: { first: true, second: false, third: true }, outs: 1, batter: 'R' };
const CUT = { x: -4, y: 66 };
const trap = (third3) => ({ kind: 'script', title: '1st & 3rd trap', steps: [
  { a: 'pitch', r: 'caught', runners: { first: { go: 'second' } } },
  { a: 'throw', to: 'SS', at: CUT, fake: 'second', runners: { third: { go: 'home' } } },
  third3,
] });
const play = (situation, steps, title) => Engine.planPlay(situation, { kind: 'script', title, steps });
const outs = (p) => p.timeline.events.filter((e) => e.type === 'out');

test('the 1st & 3rd trap: catcher fakes to 2nd, throws to the shortstop, the throw home gets the runner from 3rd', () => {
  const ev = trap({ a: 'throw', to: 'C', at: { x: 0, y: 2 } });
  ev.steps.push({ a: 'tag', runner: 'third', call: 'out' });
  const p = Engine.planPlay(FIRST_THIRD, ev);
  assert.deepEqual(p.scriptIssues, []);
  assert.equal(p.title, '1st & 3rd trap');
  const th = p.timeline.events.filter((e) => e.type === 'throw');
  assert.equal(th.length, 2, 'catcher to shortstop, shortstop home');
  assert.ok(p.timeline.events.some((e) => e.type === 'note' && /Fake to 2nd/.test(e.text)), 'the fake shows');
  const o = outs(p);
  assert.equal(o.length, 1);
  assert.ok(Math.hypot(o[0].at.x, o[0].at.y) < 6, 'out at the plate');
  assert.equal(p.scriptStates[3].runners.third.status, 'out');
  assert.equal(p.scriptStates[3].runners.first.base, 'second', 'the runner from 1st takes 2nd');
  assert.equal(p.assignments.SS.role, 'field');
  assert.match(p.assignments.SS.job, /catch the throw from the catcher/);
});

test('his variation: the runner breaks, turns back, is run back to 3rd and tagged there', () => {
  const ev = trap({ a: 'throw', to: 'C', at: { x: 0, y: 2 }, runners: { third: { go: 'third' } } });
  ev.steps.push({ a: 'run', at: { x: -18, y: 20 } }, { a: 'throw', to: '3B', at: { x: -40, y: 43 } }, { a: 'tag', runner: 'third', call: 'out' });
  const p = Engine.planPlay(FIRST_THIRD, ev);
  assert.deepEqual(p.scriptIssues, []);
  const s = p.scriptStates;
  assert.ok(s[1].runners.third.p > 3.2, 'broke for home in step 2');
  assert.equal(s[1].runners.third.going, 4);
  assert.equal(s[2].runners.third.going, 3, 'turned back in step 3');
  const track = p.timeline.tracks['runner:third'];
  const g = Field.geometry('littleLeague');
  const furthest = Math.min(...track.map((k) => Math.hypot(k.x - g.bases.home.x, k.y - g.bases.home.y)));
  assert.ok(furthest < 40 && furthest > 5, 'got partway home and no further');
  const o = outs(p);
  assert.equal(o.length, 1);
  assert.ok(Math.hypot(o[0].at.x - g.bases.third.x, o[0].at.y - g.bases.third.y) < 10, 'tagged near 3rd');
  assert.equal(p.timeline.events.filter((e) => e.type === 'throw').length, 3);
  assert.equal(s[5].holder, '3B');
});

test('the coach decides: safe means safe, and a runner who reached the plate can still be called out there', () => {
  const ev = trap({ a: 'hold' });
  ev.steps[2] = { a: 'tag', runner: 'third', call: 'safe' };
  const p = Engine.planPlay(FIRST_THIRD, ev);
  assert.equal(outs(p).length, 0);
  assert.ok(p.timeline.events.some((e) => e.type === 'safe'));
  // Slow the defense down so the runner is home first: the tag at the plate still stands, because the coach says so.
  const slow = trap({ a: 'run', at: { x: -30, y: 70 } });
  slow.steps.push({ a: 'run', at: { x: 0, y: 3 } }, { a: 'tag', runner: 'third', call: 'out' });
  const q = Engine.planPlay(FIRST_THIRD, slow);
  assert.deepEqual(q.scriptIssues, []);
  assert.equal(outs(q).length, 1);
});

test('batted balls: the batter runs, forced runners move up, a fly caught for an out, then a throw', () => {
  const sit = { league: 'littleLeague', runners: { first: true }, outs: 0 };
  const p = play(sit, [
    { a: 'pitch', r: 'hit', hit: { kind: 'ground', at: { x: -24, y: 70 } } },
    { a: 'field', by: 'SS' },
    { a: 'throw', to: '2B', at: { x: 0, y: 84 } },
    { a: 'base', base: 'second', runner: 'first', call: 'out' },
    { a: 'throw', to: '1B', at: { x: 42, y: 42 } },
    { a: 'base', base: 'first', runner: 'batter', call: 'out' },
  ]);
  assert.deepEqual(p.scriptIssues, []);
  assert.equal(outs(p).length, 2, 'a double play the coach called');
  assert.ok(p.scriptStates[0].runners.batter, 'the batter is on the field');
  assert.equal(p.scriptStates[0].runners.first.going, 2, 'forced to 2nd');
  const fly = play({ league: 'highSchool', runners: {}, outs: 0 }, [
    { a: 'pitch', r: 'hit', hit: { kind: 'fly', at: { x: 0, y: 260 } } },
    { a: 'field', by: 'CF', call: 'out' },
  ]);
  assert.ok(fly.timeline.events.some((e) => e.type === 'catch'));
  assert.equal(outs(fly).length, 1, 'batter out on the catch');
});

test('a pickoff, a passed ball, and only the moves that fit', () => {
  const pk = play({ league: 'littleLeague', runners: { first: true }, outs: 0 }, [{ a: 'pickoff', base: 'first' }, { a: 'tag', runner: 'first', call: 'safe' }]);
  assert.deepEqual(pk.scriptIssues, []);
  assert.equal(pk.scriptStates[0].holder, '1B');
  const pb = play({ league: 'littleLeague', runners: { third: true }, outs: 0 }, [
    { a: 'pitch', r: 'passed', at: { x: 12, y: -25 }, runners: { third: { go: 'home' } } },
    { a: 'field', by: 'C' },
    { a: 'throw', to: 'P', at: { x: 0, y: 2 } },
    { a: 'tag', runner: 'third', call: 'out' },
  ]);
  assert.deepEqual(pb.scriptIssues, []);
  assert.deepEqual(Script.options(pb.scriptStates[0]), ['field'], 'a loose ball can only be fielded');
  assert.deepEqual(Script.options(pb.scriptStates[1]), ['throw', 'run', 'tag', 'base', 'hold']);
  assert.deepEqual(Script.options(undefined), ['pitch', 'pickoff']);
  // Steps that can't happen are reported, not played.
  const bad = play(FIRST_THIRD, [{ a: 'throw', to: 'SS' }, { a: 'pitch', r: 'caught' }, { a: 'field', by: 'C' }]);
  // The pitcher throwing to the shortstop is allowed (a pickoff by another name); then there's no pitch to make,
  // because the pitcher no longer has the ball, and nothing loose to field.
  assert.deepEqual(bad.scriptIssues.map((x) => x.step), [1, 2]);
});

test('every step reads as a sentence', () => {
  const s0 = { holder: 'C', runners: { third: { p: 3 } } };
  assert.equal(Script.describe({ a: 'throw', to: 'SS', fake: 'second' }, s0).text, 'The catcher throws to the shortstop (fakes to 2nd first).');
  assert.equal(Script.describe({ a: 'tag', runner: 'third', call: 'out' }, { holder: '3B' }).text, 'The third baseman tags the runner from 3rd. Out.');
  assert.equal(Script.describe({ a: 'hold', runners: { third: { go: 'third' } } }, { holder: 'C', runners: { third: { p: 3.5 } } }).meanwhile, 'The runner from 3rd goes back to 3rd.');
  assert.equal(Script.describe({ a: 'pitch', r: 'hit', hit: { kind: 'fly' } }).text, 'Pitch. The batter hits a fly ball.');
});

test('share links carry a built play, step for step', () => {
  const ev = trap({ a: 'throw', to: 'C', at: { x: 0, y: 2 }, runners: { third: { stop: 3.5 } }, move: { P: { x: 6, y: -8 } }, cap: 'Turn back!' });
  ev.steps.push({ a: 'run', at: { x: -18, y: 20 } }, { a: 'throw', to: '3B', at: { x: -40, y: 43 } }, { a: 'tag', runner: 'third', call: 'out' }, { a: 'base', base: 'second', runner: 'first', call: 'safe' }, { a: 'hold' });
  const code = Share.encode(FIRST_THIRD, ev, 'Trap');
  assert.ok(code.length < 130, 'short enough to text: ' + code.length);
  const d = Share.decode(code);
  assert.equal(d.event.kind, 'script');
  assert.equal(d.event.title, '1st & 3rd trap');
  assert.equal(d.name, 'Trap');
  assert.deepEqual(d.event.steps, ev.steps);
  const hit = { kind: 'script', steps: [{ a: 'pitch', r: 'hit', hit: { kind: 'bunt', at: { x: -10, y: 20 } } }, { a: 'field', by: '3B' }, { a: 'pickoff', base: 'third' }] };
  assert.deepEqual(Share.decode(Share.encode({ league: 'pro', runners: {}, outs: 2 }, hit)).event.steps, hit.steps);
});
