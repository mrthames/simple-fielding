// Share links and saved plays.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Share = require('../app/js/share.js');
const Engine = require('../app/js/engine.js');
const Scenarios = require('../app/js/scenarios.js');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const half = (v) => Math.round(v * 2) / 2;

test('every list play, on every field, survives a share link and replays identically', () => {
  for (const league of Share.LEAGUES) {
    for (const sc of Scenarios.ALL.filter((s) => Scenarios.fits(s, league))) {
      const situation = { league, runners: sc.runners, outs: sc.outs, batter: sc.batter || 'R', leadoffs: !!sc.leadoffs };
      const event = Object.assign({}, sc.event);
      if (event.at) event.at = { x: half(event.at.x), y: half(event.at.y) };
      const code = Share.encode(situation, event, sc.name);
      const d = Share.decode(code);
      assert.equal(d.name, sc.name);
      assert.deepEqual(d.event, event, sc.name);
      const a = Engine.planPlay(situation, event), b = Engine.planPlay(d.situation, d.event);
      assert.equal(a.title, b.title, `${league}: ${sc.name}`);
      assert.equal(a.timeline.duration, b.timeline.duration, `${league}: ${sc.name}`);
    }
  }
});

test('links are short: a play is under 24 characters before its name', () => {
  const c = Share.encode({ league: 'pro', park: 'giants-oracle', runners: { first: true, third: true }, outs: 2, batter: 'L', leadoffs: true },
    { kind: 'ground', at: { x: -22.5, y: 76 }, through: { x: -70, y: 140 }, result: 'single' });
  assert.ok(c.length <= 24, c);
  assert.equal(Share.decode(c).situation.park, 'giants-oracle');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(c), 'URL-safe');
});

test('junk is not a play', () => {
  for (const bad of ['', 'hello', 'AAAA', '!!!', 'r1.xyz']) assert.equal(Share.decode(bad), null, bad);
});

test('My plays: save, rename, delete, and a backup that round-trips without duplicates', () => {
  const st = memStorage();
  const code = Share.encode({ league: 'littleLeague', runners: {}, outs: 0 }, { kind: 'fly', at: { x: -80, y: 135 } });
  const p = Share.add(st, 'Fly to left', code);
  Share.add(st, 'Second', code);
  assert.equal(Share.list(st).length, 2);
  Share.rename(st, p.id, 'Fly to left — what we want');
  assert.equal(Share.list(st).find((x) => x.id === p.id).name, 'Fly to left — what we want');
  const backup = JSON.parse(JSON.stringify(Share.exportData(st, { players: [] })));
  const st2 = memStorage();
  assert.equal(Share.importData(st2, backup).added, 2);
  assert.equal(Share.importData(st2, backup).added, 0);
  Share.remove(st, p.id);
  assert.equal(Share.list(st).length, 1);
  assert.throws(() => Share.importData(st2, { hello: 1 }));
});

test('drawn plays: steps, captions and runners leaving the field survive a link', () => {
  const Field = require('../app/js/field.js');
  const g = Field.geometry('littleLeague');
  const pl = Field.readyPositions(g, { runners: {} });
  const s0 = { dur: 1, players: pl, runners: [{ id: 'batter', label: 'B', x: -3, y: -1 }, { id: 'r1', label: 'R', x: 42, y: 42 }], ball: { x: 0, y: 1.5 } };
  const s1 = { dur: 1.5, cap: 'Error!', players: Object.assign({}, pl, { SS: { x: -20, y: 80 } }), runners: [{ id: 'batter', label: 'B', x: 30, y: 30 }, { id: 'r1', label: 'R', x: 0, y: 84 }], ball: { x: -60, y: 140 } };
  const s2 = { dur: 2, cap: 'Out at 3rd', players: s1.players, runners: [{ id: 'batter', label: 'B', x: 42, y: 42 }], ball: { x: -42, y: 43 } };
  const code = Share.encode({ league: 'littleLeague', runners: { first: true }, outs: 0 }, { kind: 'drawn', steps: [s0, s1, s2] }, 'Tuesday');
  assert.ok(code.length < 300, String(code.length));
  const d = Share.decode(code);
  assert.equal(d.event.steps.length, 3);
  assert.equal(d.event.steps[1].cap, 'Error!');
  assert.deepEqual(d.event.steps[1].players.SS, { x: -20, y: 80 });
  assert.equal(d.event.steps[2].runners.length, 1, 'the runner who was out is gone');
  const p = Engine.planPlay(d.situation, d.event);
  assert.ok(p.drawn && p.timeline.events.some((e) => e.type === 'out'));
});
