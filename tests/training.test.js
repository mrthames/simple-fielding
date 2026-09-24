// The fielding trainer: grading, and that every lesson's plays are real plays the engine can run.
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/js/engine.js');
const Training = require('../app/js/training.js');

const start = { x: 0, y: 0 };

test('grading: the right direction and about the right distance is right', () => {
  const want = { x: 0, y: 50 };
  assert.equal(Training.grade(start, want, { x: 5, y: 48 }), 'right');           // a few degrees off
  assert.equal(Training.grade(start, want, { x: 0, y: 30 }), 'right');           // part of the way
  assert.equal(Training.grade(start, want, { x: 25, y: 40 }), 'close');          // about 32 degrees off
  assert.equal(Training.grade(start, want, { x: 50, y: 0 }), 'miss');            // the wrong way
  assert.equal(Training.grade(start, want, { x: 0, y: 2 }), 'miss');             // stood still
  assert.equal(Training.grade(start, want, { x: 0, y: 150 }), 'miss');           // far too far
});

test('grading: when the job is to stay put, staying is right', () => {
  const want = { x: 3, y: 4 };
  assert.equal(Training.grade(start, want, start), 'right');                       // "Stay here"
  assert.equal(Training.grade(start, want, { x: 6, y: 6 }), 'right');
  assert.equal(Training.grade(start, want, { x: 40, y: 0 }), 'miss');
});

const Scenarios = require('../app/js/scenarios.js');

test('every lesson: a play from the library that fits its level, a position with a job, one right answer per question', () => {
  const ids = new Set();
  for (const key of Object.keys(Training.TRACKS)) {
    for (const l of Training.lessons(key)) {
      assert.ok(!ids.has(l.id), `lesson ids are unique: ${l.id}`);
      ids.add(l.id);
      assert.ok(l.intro && l.intro.length, `${l.id} has an intro`);
      assert.ok(l.positions && l.positions.length, `${l.id} lists its positions`);
      for (const s of l.steps) {
        if (s.type === 'choice') {
          assert.equal(s.options.filter((o) => o.right).length, 1, `${l.id}: one right answer to "${s.q}"`);
          continue;
        }
        const level = s.level || l.stage.level;
        const sc = s.scenario ? Scenarios.ALL.find((x) => x.name === s.scenario) : s;
        assert.ok(sc, `${l.id}: the play "${s.scenario}" is in the library`);
        if (s.scenario) assert.ok(Scenarios.fits(sc, level), `${l.id}: "${s.scenario}" belongs on ${level}`);
        const plan = Engine.planPlay({ runners: sc.runners, outs: sc.outs || 0, batter: sc.batter || 'R', league: level,
          depth: s.depth || sc.depth, buntD: s.buntD || sc.buntD, leadoffs: sc.leadoffs }, sc.event);
        const a = plan.assignments[s.pos];
        assert.ok(a && a.job, `${l.id}: the ${s.pos} has a job in "${s.scenario || 'the play'}"`);
      }
    }
  }
});
