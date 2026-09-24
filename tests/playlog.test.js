// The play log: replay codes reproduce a play exactly, and the log keeps only the last 50.
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');
const PL = require('../app/js/playlog.js');

const situation = { runners: { first: true, second: true, third: false }, outs: 2, batter: 'L', league: 'littleLeague', leadoffs: false };
const event = { kind: 'line', at: { x: 52, y: 172 }, result: 'double' };

test('a replay code decodes to the same situation and event', () => {
  const code = PL.encodeReplay(situation, event);
  assert.match(code, /^r1\.[A-Za-z0-9_-]+$/, 'URL-safe');
  assert.deepEqual(PL.decodeReplay(code), { situation, event });
});

test('replaying gives the identical play', () => {
  const a = Engine.planPlay(situation, event);
  const r = PL.decodeReplay(PL.encodeReplay(situation, event));
  const b = Engine.planPlay(r.situation, r.event);
  assert.deepEqual(PL.entry(b, r.situation, r.event, 'x').jobs, PL.entry(a, situation, event, 'x').jobs);
  assert.equal(b.timeline.duration, a.timeline.duration);
});

test('bad replay codes are ignored', () => {
  for (const bad of ['', 'nope', 'r1.', 'r1.!!!', 'r1.' + Buffer.from('{"s":1}').toString('base64')]) assert.equal(PL.decodeReplay(bad), null, bad);
});

test('the entry and texts describe what happened, including a runner held up', () => {
  const plan = Engine.planPlay(situation, event);
  const e = PL.entry(plan, situation, event, '0.4.0');
  assert.equal(e.version, '0.4.0');
  assert.equal(e.jobs.length, 9);
  assert.ok(e.runners.some((r) => r.held === 'third'));
  assert.match(PL.situationText(situation, 'Little League baseball'), /Runners on 1st & 2nd · 2 outs · lefty batter/);
  assert.match(PL.eventText(event), /Line drive to \(52, 172\) ft .* result forced: double/);
  assert.match(PL.didText(plan), /holds at 3rd/);
});

test('the log keeps the last 50 plays', () => {
  const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  const plan = Engine.planPlay(situation, event);
  for (let i = 0; i < 60; i++) PL.record(mem, Object.assign(PL.entry(plan, situation, event, 'x'), { n: i }));
  const log = PL.load(mem);
  assert.equal(log.length, 50);
  assert.equal(log[0].n, 10);
});
