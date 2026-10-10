// Build a play with endings and mistakes (asked for 2026-10-10): a play that forks ("he commits", "he turns back",
// "bad toss"), and throws that go wild or get dropped. Each path must plan cleanly and survive a share link.
const test = require('node:test');
const assert = require('node:assert');
const Engine = require('../app/js/engine.js');
const Script = require('../app/js/script.js');
const Share = require('../app/js/share.js');

const FIRST_THIRD = { league: 'littleLeague', runners: { first: true, second: false, third: true }, outs: 1, batter: 'R' };
const outs = (p) => p.timeline.events.filter((e) => e.type === 'out');

// His 1st & 3rd trick play: the runner on 3rd leads, breaks on the throw to the cheating shortstop.
// Main play: he commits and is tagged at home. Ending 0: he turns back and is run down at 3rd. Ending 1, off
// ending 0: the toss to 3rd is wild and he heads home again.
const trick = () => ({
  kind: 'script', title: '1st & 3rd cut', main: 'He commits: out at home',
  steps: [
    { a: 'pitch', r: 'caught', runners: { first: { go: 'second' }, third: { stop: 3.2 } }, move: { SS: { x: -20, y: 70 } } },
    { a: 'throw', to: 'SS', at: { x: -12, y: 55 }, runners: { third: { go: 'home' } } },
    { a: 'throw', to: 'C', at: { x: 0, y: 2 } },
    { a: 'tag', runner: 'third', call: 'out' },
  ],
  alts: [
    { name: 'He turns back: rundown', from: -1, at: 2, steps: [
      { a: 'run', at: { x: -14, y: 16 }, runners: { third: { go: 'third' } } },
      { a: 'throw', to: '3B', at: { x: -40, y: 43 } },
      { a: 'tag', runner: 'third', call: 'out' },
    ] },
    { name: 'Bad toss: he heads home', from: 0, at: 0, steps: [
      { a: 'throw', to: '3B', at: { x: -40, y: 43 }, err: 'wild', miss: { x: -62, y: 30 }, runners: { third: { go: 'home' } } },
      { a: 'field', by: 'LF' },
    ] },
  ],
});

test('endings: each path is the shared steps plus its own', () => {
  const ev = trick();
  assert.equal(Script.resolve(ev, -1).length, 4);
  const back = Script.resolve(ev, 0);
  assert.equal(back.length, 6, 'pitch, throw to SS, throw home, then three of its own');
  assert.equal(back[3].a, 'run');
  const toss = Script.resolve(ev, 1);
  assert.deepEqual(toss.map((s) => s.a), ['pitch', 'throw', 'throw', 'run', 'throw', 'field'], 'forks after the catcher runs at him');
  assert.equal(toss[4].err, 'wild');
  assert.deepEqual(Script.endings(ev).map((e) => e.name), ['He commits: out at home', 'He turns back: rundown', 'Bad toss: he heads home']);
  assert.deepEqual(Script.segments(ev, 1).map((s) => [s.owner, s.start, s.use]), [[-1, 0, 3], [0, 3, 1], [1, 4, 2]]);
  assert.equal(Script.resolve(ev, 7).length, 4, 'an ending that is not there plays the main play');
});

test('endings: the engine plays the one asked for, and every path plans cleanly', () => {
  for (const k of [-1, 0, 1]) {
    const p = Engine.planPlay(FIRST_THIRD, Object.assign(trick(), { branch: k }));
    assert.deepEqual(p.scriptIssues, [], `ending ${k}`);
  }
  const main = Engine.planPlay(FIRST_THIRD, trick());
  assert.ok(Math.hypot(outs(main)[0].at.x, outs(main)[0].at.y) < 6, 'main: out at the plate');
  const back = Engine.planPlay(FIRST_THIRD, Object.assign(trick(), { branch: 0 }));
  assert.equal(back.scriptStates[5].runners.third.status, 'out');
  assert.ok(back.scriptStates[5].runners.third.p < 3.4, 'tagged near 3rd');
});

test('a wild throw: the ball ends up where the coach put it, nobody has it, and the thrower gets the error', () => {
  const p = Engine.planPlay(FIRST_THIRD, Object.assign(trick(), { branch: 1 }));
  const st = p.scriptStates[4];
  assert.equal(st.holder, null);
  assert.deepEqual(st.loose.at, { x: -62, y: 30 });
  assert.equal(p.error.code, 'E2', 'the catcher threw it');
  assert.ok(p.timeline.events.some((e) => e.text === 'Wild throw!' && e.error));
  assert.deepEqual(Script.options(st), ['field'], 'next, someone gets the ball');
  assert.equal(p.scriptStates[5].holder, 'LF');
  assert.match(Script.describe(trick().alts[1].steps[0], p.scriptStates[3]).text, /Wild throw/);
});

test('a dropped throw: it reaches the glove and gets away, and the catcher of the throw gets the error', () => {
  const steps = trick().steps.slice(0, 2);
  steps[1] = Object.assign({}, steps[1], { err: 'dropped' });
  const p = Engine.planPlay(FIRST_THIRD, { kind: 'script', steps });
  assert.deepEqual(p.scriptIssues, []);
  assert.equal(p.scriptStates[1].holder, null);
  assert.ok(p.scriptStates[1].loose);
  assert.equal(p.error.code, 'E6');
  assert.match(Script.describe(steps[1], p.scriptStates[0]).text, /shortstop drops it/);
});

test('a link carries the endings, their names and the mistakes', () => {
  const ev = trick();
  const d = Share.decode(Share.encode(FIRST_THIRD, ev, '1st & 3rd cut'));
  assert.equal(d.event.main, ev.main);
  assert.deepEqual(d.event.steps, ev.steps);
  assert.equal(d.event.alts.length, 2);
  for (const k of [0, 1]) {
    assert.equal(d.event.alts[k].name, ev.alts[k].name);
    assert.equal(d.event.alts[k].from, ev.alts[k].from);
    assert.equal(d.event.alts[k].at, ev.alts[k].at);
    assert.deepEqual(d.event.alts[k].steps, ev.alts[k].steps);
  }
  const mistake = { kind: 'script', steps: [ev.steps[0], Object.assign({}, ev.steps[1], { err: 'dropped' })] };
  assert.equal(Share.decode(Share.encode(FIRST_THIRD, mistake)).event.steps[1].err, 'dropped');
});

test('old links are untouched: a play without endings or mistakes packs exactly as before', () => {
  const plain = { kind: 'script', title: 'Plain', steps: trick().steps };
  const code = Share.encode(FIRST_THIRD, plain, 'Plain');
  const d = Share.decode(code);
  assert.equal(d.event.alts, undefined);
  assert.equal(d.event.main, undefined);
  assert.deepEqual(d.event.steps, plain.steps);
  // The endings block is extra bytes at the very end: the link with endings starts with the plain one's bytes.
  const withEndings = Share.encode(FIRST_THIRD, Object.assign({}, plain, { alts: trick().alts }), 'Plain');
  assert.ok(withEndings.length > code.length);
});
