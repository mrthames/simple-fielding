// The scenario builder's pitch play: leads, steals, pickoffs, back-picks and passed balls, decided by the clock.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');

const play = (league, runners, ev, outs = 0) => Engine.planPlay({ league, runners, outs, leadoffs: league !== 'littleLeague' }, Object.assign({ kind: 'pitch' }, ev));
const r = (p, id) => p.runners.find((x) => x.id === id);

test('pickoff: a bigger lead turns safe into out', () => {
  const small = play('pro', { first: true }, { move: 'pickoff', pickoff: 'first', runners: { first: { lead: 8 } } });
  const big = play('pro', { first: true }, { move: 'pickoff', pickoff: 'first', runners: { first: { lead: 17 } } });
  assert.equal(small.title, 'Pickoff at 1st');
  assert.ok(!r(small, 'first').out);
  assert.ok(r(big, 'first').out);
});

test('pickoffs at 2nd and 3rd have the right cover and backups', () => {
  const p2 = play('highSchool', { second: true }, { move: 'pickoff', pickoff: 'second', runners: { second: { lead: 15 } } });
  assert.equal(p2.assignments.SS.role, 'cover');
  assert.equal(p2.assignments.CF.role, 'backup');
  const p3 = play('highSchool', { third: true }, { move: 'pickoff', pickoff: 'third', runners: { third: { lead: 10 } } });
  assert.equal(p3.assignments['3B'].role, 'cover');
  assert.equal(p3.assignments.LF.role, 'backup');
});

test('a caught pitch: the catcher back-picks a runner way off, and just returns the ball when nobody is', () => {
  const quiet = play('pro', { first: true }, { result: 'caught', runners: { first: { lead: 8 } } });
  assert.equal(quiet.title, 'Pitch caught — runners hold');
  const bold = play('pro', { first: true }, { result: 'caught', runners: { first: { lead: 18 } } });
  assert.equal(bold.title, 'Back-pick at 1st');
  assert.ok(r(bold, 'first').out);
});

test('steals: the lead the coach set is the lead the runner takes, and it changes the result', () => {
  const short = play('intermediate', { first: true }, { result: 'caught', runners: { first: { lead: 4, go: true } } });
  const long = play('intermediate', { first: true }, { result: 'caught', runners: { first: { lead: 14, go: true } } });
  assert.equal(r(short, 'first').leadStart, 4);
  assert.ok(r(short, 'first').out && r(long, 'first').safe);
  assert.equal(play('pro', { first: true, second: true }, { result: 'caught', runners: { first: { lead: 10, go: true }, second: { lead: 15, go: true } } }).target, 'third');
  assert.equal(play('pro', { third: true }, { result: 'caught', runners: { third: { lead: 12, go: true } } }).title, 'Runner on 3rd breaks for home');
});

test('passed ball: it goes where the coach put it; a runner who was not stealing reads it', () => {
  const close = play('pro', { third: true }, { result: 'passed', ballTo: { x: -20, y: -15 }, runners: { third: { lead: 12 } } });
  assert.deepEqual(close.ball.fieldPoint, { x: -20, y: -15 });
  assert.ok(r(close, 'third').held, 'a ball 25 ft away: hold');
  const far = play('pro', { third: true }, { result: 'passed', ballTo: { x: 60, y: -50 }, runners: { third: { lead: 12 } } });
  assert.ok(r(far, 'third').safe, 'a ball to the backstop in the corner: score');
});
