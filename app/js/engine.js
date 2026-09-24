/*
 * The play engine.
 *
 * Given the situation (runners, outs, league) and what happened (a batted ball landing somewhere, or
 * a non-batted play such as a steal), it works out what every fielder should do, and then turns that
 * into a timeline the renderer can animate.
 *
 * The defence is derived from a handful of principles rather than looked up in a table of charts:
 *
 *   1. Somebody fields the ball — whoever is nearest, with priority rules for fly balls and pop-ups.
 *   2. The throw goes to the base the lead runner is trying to reach.
 *   3. Every base that might get a play has somebody on it.
 *   4. A long throw has a cutoff (singles, fly balls) or a relay and a trailer (extra-base hits),
 *      lined up between the ball and the base.
 *   5. Every throw has somebody backing it up; everybody else backs up the ball.
 *
 * docs/SCENARIOS.md is the human-readable version, and tests/engine.test.js holds the engine to it.
 * Pure: no DOM, runs under Node.
 */
(function (root) {
  'use strict';

  const Field = (typeof module !== 'undefined' && module.exports) ? require('./field.js') : root.Field;
  const { POSITIONS, NAMES, PLAYERS, BASE_NAMES, BASE_ORDER } = Field;
  const the = (p) => 'the ' + PLAYERS[p];
  const The = (p) => 'The ' + PLAYERS[p];

  // Speeds in feet per second, roughly what a 10-12 year old manages.
  const RUN = 17;
  const RUNNER = 16;
  const THROW = 62;
  const PITCH_TIME = 0.75;

  // ---------------------------------------------------------------------------------------------
  // Small geometry helpers
  // ---------------------------------------------------------------------------------------------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const unit = (a, b) => { const d = dist(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
  const along = (from, to, d) => { const u = unit(from, to); return { x: from.x + u.x * d, y: from.y + u.y * d }; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round = (p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

  // A point beyond `base`, on the far side from where the throw comes from: where a backup stands.
  function behind(geo, base, from, d) {
    const u = unit(from, base);
    return inPark(geo, { x: base.x + u.x * d, y: base.y + u.y * d });
  }

  // Keep a spot inside the fence and in front of the backstop.
  function inPark(geo, p) {
    const r = Math.hypot(p.x, p.y);
    const max = geo.fence - 6;
    if (r > max) p = { x: p.x * max / r, y: p.y * max / r };
    return { x: p.x, y: Math.max(p.y, geo.backstop * 0.7) };
  }

  /*
   * Where an outfielder stands to back up a base on an infield play. Not strictly "in line with the
   * throw": a throw from the second baseman to 1st runs almost straight at home plate, and the right
   * fielder does not run to home plate. Outfielders back up the corners from foul territory behind the
   * bag, on their own side, and back up 2nd from behind it on the outfield grass.
   */
  function outfieldBaseBackup(geo, base, from) {
    const k = geo.base / 60;
    const b = geo.bases[base];
    if (base === 'first') return { x: b.x + 30 * k, y: b.y - 4 * k };
    if (base === 'third') return { x: b.x - 30 * k, y: b.y - 4 * k };
    // 2nd: on the grass straight behind the bag, a step toward the far side of the throw.
    const side = from.x > b.x + 3 ? -1 : from.x < b.x - 3 ? 1 : 0;
    return { x: b.x + side * 8 * k, y: b.y + 30 * k };
  }

  // A point in line between the ball and a base, `d` feet out from the base: where a cutoff stands.
  function lineUp(base, ball, d) {
    return along(base, ball, Math.min(d, dist(base, ball) - 10));
  }

  const baseName = (b) => BASE_NAMES[b];
  const nextBase = (b) => BASE_ORDER[BASE_ORDER.indexOf(b) + 1];

  // ---------------------------------------------------------------------------------------------
  // Plan builder: collects each fielder's job
  // ---------------------------------------------------------------------------------------------
  function newPlan(geo, situation, ready) {
    return {
      geo,
      situation,
      ready,
      title: '',
      summary: '',
      notes: [],
      fielder: null,
      target: null,
      assignments: {},
      throws: [],        // [{ from: pos|null, at: point, to: point, toPos, label }]
      runners: [],       // [{ id, from, to, start, tagUp, out }]
      ball: null,        // { kind, at, landing, fieldPoint, height, caught }
      pre: null,         // non-batted plays: what happens before the ball is live
    };
  }

  function assign(plan, pos, role, to, job, opts) {
    if (plan.assignments[pos]) return;
    // Somebody covering a bag stands just off it, on the side they came from, so the runner
    // sliding in and the fielder don't draw on top of each other.
    if (role === 'cover' && plan.ready[pos]) {
      for (const base of ['first', 'second', 'third']) {
        const bp = plan.geo.bases[base];
        if (dist(to, bp) < 1.5 && dist(plan.ready[pos], bp) > 4) to = along(bp, plan.ready[pos], 3.5);
      }
    }
    plan.assignments[pos] = Object.assign({ pos, role, to: round(to), job, delay: 0.25 }, opts || {});
  }

  const ROLE_ORDER = ['field', 'cutoff', 'relay', 'trail', 'cover', 'backup', 'hold'];

  // ---------------------------------------------------------------------------------------------
  // Classify a batted ball
  // ---------------------------------------------------------------------------------------------
  function classify(geo, ready, event) {
    const at = event.at;
    const d = dist(at, geo.bases.home);
    const fair = Field.isFair(at);
    let kind = event.kind;
    if (kind === 'bunt' && d > 55) kind = 'ground';
    if (d > geo.fence && fair && kind !== 'ground') return { type: 'homeRun', at, d, fair, kind };
    if (!fair) {
      if (kind === 'ground' || kind === 'bunt') return { type: 'foulGround', at, d, fair, kind };
      return { type: 'foulFly', at, d, fair, kind };
    }
    const inInfield = d < geo.infieldEdge;
    if (kind === 'bunt') return { type: 'bunt', at, d, fair, kind };
    if (kind === 'ground') return { type: inInfield ? 'infieldGround' : 'outfieldHit', at, d, fair, kind };
    if (inInfield) return { type: 'infieldFly', at, d, fair, kind };

    // In the air to the outfield: caught if an outfielder can get there, otherwise a hit.
    const reach = { fly: 55, pop: 55, line: 28 }[kind] || 40;
    const of = nearest(['LF', 'CF', 'RF'], ready, at);
    const caught = dist(ready[of], at) <= reach;
    return { type: caught ? 'outfieldFly' : 'outfieldHit', at, d, fair, kind };
  }

  function nearest(list, ready, p) {
    let best = null, bd = Infinity;
    for (const pos of list) {
      const d = dist(ready[pos], p);
      if (d < bd) { bd = d; best = pos; }
    }
    return best;
  }

  // How many bases an uncaught ball to the outfield is worth.
  function hitBases(geo, c) {
    const { at, d, kind } = c;
    const corner = Math.abs(at.x) > 0.8 * at.y;
    if (kind === 'ground') return (corner && d > 0.8 * geo.fence) ? 2 : 1;
    if (d < 0.8 * geo.fence) return 1;
    if (d < 0.93 * geo.fence) return 2;
    return 3;
  }

  // ---------------------------------------------------------------------------------------------
  // Batted balls
  // ---------------------------------------------------------------------------------------------
  function planBattedBall(geo, situation, event) {
    const ready = Field.readyPositions(geo, situation);
    const plan = newPlan(geo, situation, ready);
    const c = classify(geo, ready, event);
    const run = situation.runners;

    let result = event.result && event.result !== 'auto' ? event.result : null;
    let type = c.type;
    if (result === 'out' && type === 'outfieldHit') type = c.kind === 'ground' ? 'outfieldHit' : 'outfieldFly';
    if (result && result !== 'out' && (type === 'outfieldFly' || type === 'outfieldHit')) type = 'outfieldHit';

    plan.ball = { kind: c.kind, at: round(c.at), landing: round(c.at), fieldPoint: round(c.at), caught: false };
    plan.classification = type;

    switch (type) {
      case 'homeRun': return planHomeRun(plan);
      case 'foulGround': return planFoulGround(plan);
      case 'foulFly': return planFoulFly(plan);
      case 'bunt': return planInfieldGround(plan, true);
      case 'infieldGround': return planInfieldGround(plan, false);
      case 'infieldFly': return planInfieldFly(plan);
      case 'outfieldFly': return planOutfieldFly(plan);
      case 'outfieldHit': {
        let bases = hitBases(geo, c);
        if (result === 'single') bases = 1;
        if (result === 'double') bases = 2;
        if (result === 'triple') bases = 3;
        return planOutfieldHit(plan, bases);
      }
    }
    return plan;
  }

  // --- Outfield -------------------------------------------------------------------------------

  function sideOf(p) { return p.x < 0 ? 'left' : 'right'; }

  function outfieldBackups(plan, F, fieldPoint, target) {
    const { geo, ready } = plan;
    const b = geo.bases;
    const ofs = ['LF', 'CF', 'RF'].filter((p) => p !== F);
    for (const of of ofs) {
      const adjacent = (F === 'CF') || of === 'CF';
      if (adjacent) {
        // Get behind the fielder, in case the ball gets past them.
        assign(plan, of, 'backup', behind(geo, fieldPoint, geo.bases.home, 30),
          `Back up ${the(F)} — get behind them in case the ball gets by.`, { delay: 0.2 });
      } else {
        // The far corner outfielder comes in to back up a base.
        const base = of === 'RF' ? (target === 'first' ? 'first' : 'second') : (target === 'home' || target === 'third' ? 'third' : 'second');
        const spot = behind(geo, b[base], fieldPoint, 45);
        assign(plan, of, 'backup', spot,
          `Run in and back up ${baseName(base)} base in case the throw gets away.`, { delay: 0.4 });
      }
    }
    void ready;
  }

  // Cutoff / relay coverage for a throw from the outfield to `target`.
  function outfieldCoverage(plan, F, fieldPoint, target, extraBases) {
    const { geo, situation } = plan;
    const b = geo.bases;
    const run = situation.runners;
    const left = sideOf(fieldPoint) === 'left';
    const tgt = b[target];

    let cut = null, cutSpot = null;

    if (extraBases) {
      // Relay: a middle infielder goes out toward the ball, the other trails behind them.
      const relay = left ? 'SS' : '2B';
      const trail = left ? '2B' : 'SS';
      const D = dist(fieldPoint, tgt);
      const relaySpot = along(fieldPoint, tgt, clamp(D * 0.45, 45, 85));
      assign(plan, relay, 'relay', relaySpot,
        `Be the relay! Run out toward the ball and line up between ${the(F)} and ${baseName(target)}. Arms up and yell "Here!"`,
        { delay: 0.15 });
      assign(plan, trail, 'trail', along(relaySpot, tgt, 18),
        `Trail the relay — stand about 15 feet behind them in case the throw is off.`, { delay: 0.25 });
      plan.throws.push({ fromPos: F, via: relay, to: target });

      assign(plan, '3B', 'cover', b.third, 'Cover 3rd base — straddle the bag, ready for the throw.');
      if (target === 'home') {
        assign(plan, '1B', 'cutoff', lineUp(b.home, relaySpot, 40),
          'Be the cutoff for home — line up in front of the plate between the relay and home.', { delay: 0.3 });
        cut = '1B';
      } else {
        assign(plan, '1B', 'cover', b.second,
          'Make sure the batter touches 1st, then follow them to 2nd and cover the bag.', {
            delay: 0.4, path: [lerp(ready1B(plan), b.first, 0.7), b.second],
          });
      }
      assign(plan, 'C', 'cover', { x: 0, y: 1.5 }, 'Stay home — cover home plate.');
      if (target === 'home') {
        assign(plan, 'P', 'backup', behind(geo, b.home, relaySpot, 22),
          'Run halfway between 3rd and home, see where the throw goes, then back up home plate.',
          { delay: 0.3, path: [lerp(b.third, b.home, 0.55), behind(geo, b.home, relaySpot, 22)] });
      } else {
        assign(plan, 'P', 'backup', behind(geo, tgt, relaySpot, 30),
          `Back up ${baseName(target)} base — get behind it, in line with the throw.`, { delay: 0.3 });
      }
      outfieldBackups(plan, F, fieldPoint, target);
      if (target === 'home' && run.first) {
        plan.notes.push('With a runner coming around from 1st, the relay lines up with home. The first baseman is the cutoff in front of the plate.');
      }
      return;
    }

    // Single or fly ball: one cutoff.
    if (target === 'second') {
      cut = left ? 'SS' : '2B';
      const cover = left ? '2B' : 'SS';
      cutSpot = lineUp(b.second, fieldPoint, clamp(dist(b.second, fieldPoint) * 0.4, 30, 60));
      assign(plan, cut, 'cutoff', cutSpot,
        `Be the cutoff! Line up between ${the(F)} and 2nd base. Arms up and yell "Cut! Cut!"`, { delay: 0.15 });
      assign(plan, cover, 'cover', b.second, 'Cover 2nd base — get to the bag, ready for the throw.');
      assign(plan, '3B', 'cover', b.third, 'Cover 3rd base.');
      assign(plan, '1B', 'cover', b.first, 'Make sure the batter touches 1st, then stay on the bag.');
      const scoring = run.second || run.third;
      if (!scoring) {
        assign(plan, 'C', 'backup', { x: b.first.x + 12, y: b.first.y - 16 },
          'Run down the line and back up 1st base, behind the first baseman.', { delay: 0.3 });
      } else {
        assign(plan, 'C', 'cover', { x: 0, y: 1.5 }, 'Stay home — cover home plate.');
      }
      assign(plan, 'P', 'backup', behind(geo, b.second, fieldPoint, 25),
        'Back up 2nd base — get behind the bag in line with the throw.', { delay: 0.3 });
    } else if (target === 'third') {
      cut = 'SS';
      cutSpot = lineUp(b.third, fieldPoint, clamp(dist(b.third, fieldPoint) * 0.4, 30, 60));
      assign(plan, 'SS', 'cutoff', cutSpot,
        `Be the cutoff! Line up between ${the(F)} and 3rd base. Arms up and yell!`, { delay: 0.15 });
      assign(plan, '2B', 'cover', b.second, 'Cover 2nd base — the batter might try to go there.');
      assign(plan, '3B', 'cover', b.third, 'Cover 3rd base — the throw is coming here.');
      assign(plan, '1B', 'cover', b.first, 'Make sure the batter touches 1st, then cover the bag.');
      assign(plan, 'C', 'cover', { x: 0, y: 1.5 }, 'Stay home — cover home plate.');
      assign(plan, 'P', 'backup', behind(geo, b.third, fieldPoint, 30),
        'Back up 3rd base — run behind the bag in foul territory, in line with the throw.', { delay: 0.3 });
    } else if (target === 'home') {
      if (F === 'LF') {
        cut = '3B';
        assign(plan, 'SS', 'cover', b.third, 'Cover 3rd base — the third baseman is the cutoff.');
        assign(plan, '2B', 'cover', b.second, 'Cover 2nd base.');
        assign(plan, '1B', 'cover', b.first, 'Cover 1st base.');
      } else {
        cut = '1B';
        assign(plan, '2B', 'cover', b.first, 'Cover 1st base — the first baseman is the cutoff.');
        assign(plan, 'SS', 'cover', b.second, 'Cover 2nd base.');
        assign(plan, '3B', 'cover', b.third, 'Cover 3rd base.');
      }
      cutSpot = lineUp(b.home, fieldPoint, 42);
      assign(plan, cut, 'cutoff', cutSpot,
        `Be the cutoff for home — line up about ${Math.round(42 * geo.base / 60)} feet in front of the plate, between the ball and home. Listen for the catcher!`,
        { delay: 0.15 });
      assign(plan, 'C', 'cover', { x: 0, y: 1.5 },
        'Cover home plate. You are the boss here — yell "Cut!" or "Let it go!"');
      assign(plan, 'P', 'backup', behind(geo, b.home, fieldPoint, 22),
        'Back up home plate — get behind the catcher, in line with the throw.', { delay: 0.3 });
    }
    plan.throws.push({ fromPos: F, via: cut, to: target });
    outfieldBackups(plan, F, fieldPoint, target);
  }

  function ready1B(plan) { return plan.ready['1B']; }

  function planOutfieldHit(plan, bases) {
    const { geo, situation, ready } = plan;
    const run = situation.runners;
    const at = plan.ball.at;
    const F = nearestOutfielder(ready, at);

    // Extra-base hits roll on toward the fence.
    let fieldPoint = at;
    if (bases >= 2) {
      const roll = along(at, { x: at.x * 3, y: at.y * 3 }, 25);
      if (dist(roll, geo.bases.home) > geo.fence - 6) fieldPoint = along(geo.bases.home, at, geo.fence - 6);
      else fieldPoint = roll;
    }
    plan.ball.fieldPoint = round(fieldPoint);
    plan.fielder = F;

    // Who runs where, and where the lead runner is trying to get to.
    const r = [];
    let target;
    if (bases === 1) {
      target = run.second ? 'home' : run.first ? 'third' : 'second';
      r.push({ id: 'batter', from: 'home', to: 'first' });
      if (run.first) r.push({ id: 'first', from: 'first', to: target === 'third' ? 'third' : 'second' });
      if (run.second) r.push({ id: 'second', from: 'second', to: 'home' });
      if (run.third) r.push({ id: 'third', from: 'third', to: 'home' });
    } else if (bases === 2) {
      target = run.first ? 'home' : 'third';
      r.push({ id: 'batter', from: 'home', to: 'second' });
      if (run.first) r.push({ id: 'first', from: 'first', to: 'home' });
      if (run.second) r.push({ id: 'second', from: 'second', to: 'home' });
      if (run.third) r.push({ id: 'third', from: 'third', to: 'home' });
    } else {
      target = 'third';
      r.push({ id: 'batter', from: 'home', to: 'third' });
      for (const base of ['first', 'second', 'third']) if (run[base]) r.push({ id: base, from: base, to: 'home' });
    }
    plan.runners = r;
    plan.target = target;

    const hitName = { 1: 'Single', 2: 'Double', 3: 'Triple' }[bases];
    plan.title = `${hitName} to ${NAMES[F].toLowerCase()}`;
    const how = bases === 1 ? 'hits the cutoff' : 'hits the relay';
    plan.summary = `${The(F)} gets the ball and ${how}; the throw goes to ${baseName(target)}${target === 'home' ? '' : ' base'}.`;

    assign(plan, F, 'field', fieldPoint,
      bases === 1
        ? `Charge the ball and get it! Throw it to the cutoff, chest high.`
        : `Chase the ball down, then throw hard to the relay.`, { delay: 0.05 });
    outfieldCoverage(plan, F, fieldPoint, target, bases >= 2);

    if (bases === 1 && run.third && !run.second) {
      plan.notes.push('The runner from 3rd scores easily, so the throw goes to 2nd to keep the batter at 1st.');
    }
    if (bases === 1 && run.second) {
      plan.notes.push('A runner on 2nd will try to score on a single, so the throw is lined up with home. If the runner stops, the cutoff catches it and checks the other runners.');
    }
    fillHolds(plan);
    return plan;
  }

  function nearestOutfielder(ready, at) {
    const F = nearest(['LF', 'CF', 'RF'], ready, at);
    // Centre field has priority: if CF can get there nearly as easily, CF takes it.
    if (F !== 'CF' && dist(ready.CF, at) - dist(ready[F], at) < 12) return 'CF';
    return F;
  }

  function planOutfieldFly(plan) {
    const { geo, situation, ready } = plan;
    const run = situation.runners;
    const at = plan.ball.at;
    const F = nearestOutfielder(ready, at);
    plan.fielder = F;
    plan.ball.caught = true;
    const outsAfter = situation.outs + 1;

    plan.title = `Fly ball to ${NAMES[F].toLowerCase()}`;
    const r = [{ id: 'batter', from: 'home', to: 'first', out: true }];

    if (outsAfter >= 3) {
      plan.summary = `${The(F)} catches it — that's three outs, inning over!`;
      assign(plan, F, 'field', at, 'Call it loud — "I got it! I got it!" — and catch it with two hands.', { delay: 0.05 });
      for (const base of ['first', 'second', 'third']) if (run[base]) r.push({ id: base, from: base, to: nextBase(base) });
      plan.runners = r;
      plan.notes.push('With two outs, runners run on contact — but once the ball is caught, the inning is over.');
      outfieldBackups(plan, F, at, 'second');
      coverAllBases(plan);
      fillHolds(plan);
      return plan;
    }

    // Tag-ups: after the catch, the runner on 3rd tries to score on a deep fly; runner on 2nd tries for 3rd.
    let target = 'second';
    const deep = dist(at, geo.bases.home) > 0.72 * geo.fence;
    if (run.third && deep) {
      target = 'home';
      r.push({ id: 'third', from: 'third', to: 'home', tagUp: true });
    } else if (run.second && deep && F !== 'LF') {
      target = 'third';
      r.push({ id: 'second', from: 'second', to: 'third', tagUp: true });
    }
    for (const base of ['first', 'second', 'third']) {
      if (run[base] && !r.find((x) => x.id === base)) r.push({ id: base, from: base, to: base });
    }
    plan.runners = r;
    plan.target = target;

    assign(plan, F, 'field', at,
      target === 'second'
        ? 'Call it — "I got it!" — catch it, then throw to the cutoff right away.'
        : `Call it, and catch it moving forward so your throw is strong. Throw to the cutoff — the runner is tagging up!`,
      { delay: 0.05 });
    plan.summary = target === 'second'
      ? `${The(F)} catches it for an out and throws to the cutoff to keep everyone where they are.`
      : `${The(F)} catches it; the runner tags up and the throw goes ${target === 'home' ? 'home' : 'to 3rd'}.`;
    if (target !== 'second') plan.notes.push('Tagging up: on a caught fly ball, the runner must go back and touch their base before running. They can leave the moment the ball is touched.');
    outfieldCoverage(plan, F, at, target, false);
    fillHolds(plan);
    return plan;
  }

  function planHomeRun(plan) {
    const { geo, situation, ready } = plan;
    const F = nearestOutfielder(ready, plan.ball.at);
    plan.title = 'Over the fence!';
    plan.summary = 'Home run. Nobody can make a play — but outfielders always go to the fence in case it stays in.';
    plan.fielder = F;
    const fencePt = along(geo.bases.home, plan.ball.at, geo.fence - 3);
    assign(plan, F, 'field', fencePt, 'Run to the fence — play it until you know it is gone.', { delay: 0.05 });
    const r = [{ id: 'batter', from: 'home', to: 'home' }];
    for (const base of ['first', 'second', 'third']) if (situation.runners[base]) r.push({ id: base, from: base, to: 'home' });
    plan.runners = r;
    plan.homeRun = true;
    plan.ball.fieldPoint = round(along(geo.bases.home, plan.ball.at, geo.fence + 15));
    coverAllBases(plan);
    fillHolds(plan);
    return plan;
  }

  // --- Infield ----------------------------------------------------------------------------------

  function forcedBases(run) {
    const f = { first: true, second: false, third: false, home: false };
    if (run.first) f.second = true;
    if (run.first && run.second) f.third = true;
    if (run.first && run.second && run.third) f.home = true;
    return f;
  }

  function infieldFielder(plan, at, isBunt) {
    const { ready, geo } = plan;
    const dHome = dist(at, geo.bases.home);
    if (isBunt || dHome < 22) {
      if (dHome < 14) return 'C';
      // Bunts: corners charge the lines, pitcher takes the middle, catcher anything right in front.
      if (at.x > 10) return '1B';
      if (at.x < -10) return '3B';
      return dHome < 20 ? 'C' : 'P';
    }
    const cands = ['P', '1B', '2B', 'SS', '3B'];
    let F = nearest(cands, ready, at);
    // A ball past the pitcher belongs to the middle infielders.
    if (F === 'P' && at.y > geo.mound.y + 8) F = at.x < 0 ? 'SS' : '2B';
    return F;
  }

  // The sequence of bases the ball goes to on a ground ball.
  function groundBallTargets(plan, F, at, isBunt) {
    const { situation, geo } = plan;
    const run = situation.runners;
    const forced = forcedBases(run);
    const b = geo.bases;

    if (situation.outs === 2) {
      // Get the easiest out: the forced base closest to the fielder.
      let best = 'first', bd = Infinity;
      for (const base of ['first', 'second', 'third', 'home']) {
        if (!forced[base]) continue;
        const d = dist(at, b[base]);
        if (d < bd) { bd = d; best = base; }
      }
      return [best];
    }
    if (isBunt) {
      if (forced.home && F === 'C') return ['home', 'first'];
      return ['first'];
    }
    if (forced.home) return ['home', 'first'];
    if (forced.third && F === '3B') return ['third', 'first'];
    if (forced.second) return ['second', 'first'];
    return ['first'];
  }

  function planInfieldGround(plan, isBunt) {
    const { geo, situation, ready } = plan;
    const b = geo.bases;
    const run = situation.runners;
    const at = plan.ball.at;
    const F = infieldFielder(plan, at, isBunt);
    plan.fielder = F;
    const targets = groundBallTargets(plan, F, at, isBunt);
    plan.target = targets[0];
    plan.targets = targets;
    const forced = forcedBases(run);

    // Runners: forced runners run; others hold (and get looked back).
    const r = [{ id: 'batter', from: 'home', to: 'first', out: targets.includes('first') }];
    for (const base of ['first', 'second', 'third']) {
      if (!run[base]) continue;
      const nb = nextBase(base);
      if (forced[nb]) r.push({ id: base, from: base, to: nb, out: targets[0] === nb });
      else r.push({ id: base, from: base, to: base });
    }
    plan.runners = r;

    const label = isBunt ? 'Bunt' : 'Ground ball';
    plan.title = `${label} to ${the(F)}`;
    const dp = targets.length > 1;
    const first = targets[0];
    const stepSelf = dist(at, b[first]) < 14 && F !== 'C' || (F === 'C' && first === 'home');
    plan.summary = dp
      ? `${The(F)} gets the lead runner at ${baseName(first)}, then the throw goes to 1st — a double play!`
      : `${The(F)} fields it and ${stepSelf ? 'steps on' : 'throws to'} ${baseName(first)}${first === 'home' ? '' : ' base'}.`;

    // Who covers what.
    const leftSide = at.x < -3;
    const coverSecond = F === 'SS' ? '2B' : F === '2B' ? 'SS' : leftSide ? '2B' : 'SS';

    // 1st base
    if (F === '1B' && isBunt) {
      assign(plan, '2B', 'cover', b.first, 'Cover 1st base — the first baseman charged the bunt.', { delay: 0.1 });
    } else if (F === '1B') {
      assign(plan, 'P', 'cover', b.first,
        'Ball hit to your left? Run to 1st! Head for the line, then run up it and take the throw on the bag.', {
          delay: 0.1, path: [{ x: b.first.x - 6, y: b.first.y - 16 }, { x: b.first.x - 1, y: b.first.y - 1 }],
        });
    } else if (isBunt) {
      assign(plan, '2B', 'cover', b.first, 'Cover 1st base on the bunt — the first baseman is charging.', { delay: 0.1 });
      assign(plan, '1B', 'hold', { x: b.first.x - 6, y: b.first.y - 18 },
        'Charge in on the bunt! If someone else fields it, get out of the way.', { delay: 0.05 });
    } else {
      assign(plan, '1B', 'cover', b.first, 'Get to the bag! Stretch toward the throw once you know where it is.');
    }

    // 2nd base
    if (F !== coverSecond) {
      const job = targets[0] === 'second'
        ? 'Cover 2nd base for the force — catch it, step on the bag, and throw to 1st for two!'
        : 'Cover 2nd base.';
      assign(plan, coverSecond, 'cover', b.second, job, { delay: 0.1 });
    }
    // The other middle infielder backs up the throw to 2nd or backs up the fielder.
    const otherMid = coverSecond === '2B' ? 'SS' : '2B';
    if (otherMid !== F && !plan.assignments[otherMid]) {
      if (isBunt && run.second) {
        assign(plan, 'SS', 'cover', b.third, 'Cover 3rd base — the third baseman might charge the bunt.', { delay: 0.1 });
      } else if (targets[0] === 'second') {
        assign(plan, otherMid, 'backup', behind(geo, b.second, at, 16), 'Back up the throw to 2nd base.', { delay: 0.25 });
      } else {
        assign(plan, otherMid, 'backup', behind(geo, at, geo.bases.home, 18), `Back up ${the(F)} in case the ball gets through.`, { delay: 0.2 });
      }
    }

    // 3rd base
    if (F !== '3B') {
      if (isBunt && !run.second) {
        assign(plan, '3B', 'hold', { x: b.third.x + 6, y: b.third.y - 18 },
          'Charge in on the bunt! If the pitcher or catcher calls it, get back to 3rd.', { delay: 0.05 });
      } else {
        assign(plan, '3B', 'cover', b.third, targets[0] === 'third' ? 'Cover 3rd base for the force.' : 'Cover 3rd base.');
      }
    } else if (run.second || run.first) {
      if (!plan.assignments.SS) assign(plan, 'SS', 'cover', b.third, 'Cover 3rd base — the third baseman came in for the ball.', { delay: 0.1 });
    }

    // Home
    const needHome = run.second || run.third || targets.includes('home');
    if (F !== 'C') {
      if (needHome) {
        assign(plan, 'C', 'cover', { x: 0, y: 1.5 },
          targets[0] === 'home' ? 'Force at home! Step on the plate like a first baseman, then throw to 1st.' : 'Stay home — cover the plate.');
      } else {
        assign(plan, 'C', 'backup', { x: b.first.x + 14, y: b.first.y - 18 },
          'Run down the line to back up the throw to 1st — stay in foul territory.', { delay: 0.3 });
      }
    } else if (needHome) {
      assign(plan, 'P', 'cover', { x: 0, y: 2 }, 'Cover home plate — the catcher left to field the bunt.', { delay: 0.1 });
    }

    // Pitcher
    if (F !== 'P' && !plan.assignments.P) {
      if (isBunt) {
        assign(plan, 'P', 'hold', { x: 0, y: geo.mound.y - 14 }, 'Come off the mound toward the plate — if you field it, throw to 1st.', { delay: 0.05 });
      } else if (at.x > 0 && dist(at, b.first) < 60) {
        assign(plan, 'P', 'cover', { x: b.first.x - 6, y: b.first.y - 16 },
          'Ball hit to your left — break toward 1st in case you need to cover!', { delay: 0.1 });
      } else if (targets[0] === 'home' || targets[0] === 'third') {
        assign(plan, 'P', 'backup', behind(geo, b[targets[0]], at, 22), `Back up ${baseName(targets[0])}.`, { delay: 0.25 });
      } else {
        assign(plan, 'P', 'hold', lerp(geo.mound, b.first, 0.2), 'Get off the mound, out of the way of the throw.', { delay: 0.1 });
      }
    }

    // The fielder
    const throwText = dp
      ? `throw to ${baseName(targets[0])} for the lead runner`
      : stepSelf ? `step on ${baseName(first)}` : `throw to ${baseName(first)}`;
    const look = (!forced.second && run.second) || (!forced.third && run.third);
    assign(plan, F, 'field', at,
      `${isBunt ? 'Charge it' : 'Get in front of it'}, glove down! ${look ? 'Look the runner back, then ' : 'Then '}${throwText}.`, { delay: 0.05 });
    if (look) {
      plan.notes.push('A runner who isn\'t forced doesn\'t have to run. Look them back to their base with your eyes before you throw — then take the sure out at 1st.');
    }
    if (dp) plan.notes.push(isBunt ? '' : 'Double play: get the lead runner first. The second throw only happens if the first out is made cleanly.');
    if (situation.outs === 2) plan.notes.push('Two outs: take the easiest out. Everybody runs on contact.');
    if (run.third && situation.outs < 2 && targets[0] !== 'home') {
      plan.notes.push('The runner on 3rd may score. With a big lead early in a game, trading a run for an out is fine — ask your coach what they want.');
    }
    plan.notes = plan.notes.filter(Boolean);

    // Throw chain (with who catches at each base)
    let fromPos = F;
    for (const t of targets) {
      plan.throws.push({ fromPos, to: t, step: t === targets[0] && stepSelf });
      fromPos = coverAt(plan, t);
    }

    // Outfielders back up the throw bases, otherwise the fielder.
    for (const [of, base] of [['RF', 'first'], ['CF', 'second'], ['LF', 'third']]) {
      if (plan.assignments[of]) continue;
      if (targets.includes(base) || (base === 'first')) {
        const from = base === targets[0] ? at : b[targets[0]];
        assign(plan, of, 'backup', outfieldBaseBackup(geo, base, from),
          `Run in and back up the throw to ${baseName(base)} base.`, { delay: 0.3 });
      } else if ((of === 'LF' && leftSide) || (of === 'CF')) {
        assign(plan, of, 'backup', behind(geo, at, geo.bases.home, 55),
          `Charge in to back up ${the(F)}.`, { delay: 0.2 });
      } else {
        assign(plan, of, 'backup', outfieldBaseBackup(geo, 'third', geo.mound),
          'Come in and back up 3rd base, in case of a bad throw.', { delay: 0.3 });
      }
    }
    fillHolds(plan);
    return plan;
  }

  // Who ends up catching the ball at a base, given the assignments.
  function coverAt(plan, base) {
    const b = plan.geo.bases[base];
    let best = null, bd = 6;
    for (const pos in plan.assignments) {
      const a = plan.assignments[pos];
      const end = a.path ? a.path[a.path.length - 1] : a.to;
      const d = dist(end, b);
      if (d < bd && a.role !== 'backup') { bd = d; best = pos; }
    }
    return best;
  }

  const POP_PRIORITY = ['CF', 'LF', 'RF', 'SS', '2B', '3B', '1B', 'C', 'P'];

  function planInfieldFly(plan) {
    const { geo, situation, ready } = plan;
    const b = geo.bases;
    const at = plan.ball.at;
    plan.ball.caught = true;
    const dHome = dist(at, b.home);

    let F;
    if (dHome < 30) F = at.x > 14 ? '1B' : at.x < -14 ? '3B' : 'C';
    else {
      // Everyone who can get there; the highest priority among them takes it.
      const closest = Math.min(...POSITIONS.map((p) => dist(ready[p], at)));
      const able = POSITIONS.filter((p) => dist(ready[p], at) <= closest + 22 && p !== 'P');
      F = POP_PRIORITY.find((p) => able.includes(p)) || nearest(POSITIONS, ready, at);
    }
    plan.fielder = F;
    const kind = plan.ball.kind === 'line' ? 'Line drive' : 'Pop-up';
    plan.title = `${kind} to ${the(F)}`;
    plan.summary = `${The(F)} calls it and catches it. Everyone else gets to a base.`;
    assign(plan, F, 'field', at,
      plan.ball.kind === 'line' ? 'Catch it! Then look at the runners — are they off their base?' : 'Call it — "I got it! I got it!" — and catch it above your head with two hands.',
      { delay: 0.05 });

    const r = [{ id: 'batter', from: 'home', to: 'first', out: true }];
    for (const base of ['first', 'second', 'third']) if (situation.runners[base]) r.push({ id: base, from: base, to: base });
    plan.runners = r;

    const ofs = ['LF', 'CF', 'RF'];
    if (ofs.includes(F)) plan.notes.push('Outfielders coming in have priority over infielders going back — it is easier to catch a ball running toward it.');
    else plan.notes.push('Priority on pop-ups: outfielders over infielders, and middle infielders (SS, 2B) over the corners. The pitcher points and yells, but lets a fielder catch it.');

    coverAllBases(plan);
    // An outfielder backs up an infielder going out.
    if (!ofs.includes(F)) {
      const of = nearest(ofs, ready, at);
      if (!plan.assignments[of]) assign(plan, of, 'backup', behind(geo, at, b.home, 25),
        `Come in and back up ${the(F)}. If you can catch it easily, call them off!`, { delay: 0.1 });
    }
    fillHolds(plan);
    return plan;
  }

  // Every base covered by the usual fielder, or a sensible substitute when they are busy.
  function coverAllBases(plan) {
    const { geo } = plan;
    const b = geo.bases;
    const F = plan.fielder;
    const taken = (p) => !!plan.assignments[p] || p === F;
    const coverWith = (base, list, job) => {
      const p = list.find((x) => !taken(x));
      if (p) assign(plan, p, 'cover', base === 'home' ? { x: 0, y: 1.5 } : b[base], job, { delay: 0.2 });
    };
    coverWith('first', ['1B', '2B', 'P'], 'Cover 1st base.');
    coverWith('second', F === 'SS' ? ['2B'] : ['SS', '2B'], 'Cover 2nd base.');
    coverWith('third', ['3B', 'SS'], 'Cover 3rd base.');
    coverWith('home', ['C', 'P'], F === 'C' ? 'The catcher left home — run in and cover home plate!' : 'Cover home plate.');
  }

  // --- Foul balls -----------------------------------------------------------------------------

  function planFoulFly(plan) {
    const { geo, situation, ready } = plan;
    const b = geo.bases;
    const at = plan.ball.at;
    plan.ball.caught = true;
    const dHome = dist(at, b.home);
    let F;
    if (at.y < 18 && Math.abs(at.x) < 40) F = 'C';
    else if (dHome < geo.infieldEdge + 20) F = at.x > 0 ? '1B' : '3B';
    else F = at.x > 0 ? 'RF' : 'LF';
    // The catcher also takes pops close up the lines.
    if ((F === '1B' || F === '3B') && dist(at, ready.C) + 8 < dist(at, ready[F])) F = 'C';
    plan.fielder = F;
    plan.title = `Foul pop-up — ${the(F)}`;
    plan.summary = `${The(F)} chases it into foul territory. ${F === 'C' ? 'The pitcher runs in to cover home plate.' : 'Everyone else covers a base.'}`;
    assign(plan, F, 'field', at,
      F === 'C'
        ? 'Rip off your mask, find the ball, then toss the mask away from where you are going. Turn your back to the field and catch it!'
        : 'Chase it — watch out for the fence! Catch it if you can do it safely.', { delay: 0.05 });
    if (F === 'C') assign(plan, 'P', 'cover', { x: 0, y: 2 }, 'The catcher left home — sprint in and cover home plate!', { delay: 0.1 });
    if (F === '1B') assign(plan, '2B', 'cover', b.first, 'Cover 1st base — the first baseman is chasing the ball.', { delay: 0.1 });
    if (F === '3B') assign(plan, 'SS', 'cover', b.third, 'Cover 3rd base — the third baseman is chasing the ball.', { delay: 0.1 });
    if (F === '1B' || F === '3B') {
      assign(plan, 'C', 'hold', lerp(b.home, at, 0.35), 'Go toward the ball and help call it, then get back home.', { delay: 0.1 });
      assign(plan, 'P', 'cover', { x: 0, y: 2 }, 'Cover home plate while the catcher helps.', { delay: 0.2 });
    }
    plan.notes.push('A caught foul ball is an out. Runners can tag up, just like a fly ball in fair territory.');
    const r = [{ id: 'batter', from: 'home', to: 'home', out: true }];
    for (const base of ['first', 'second', 'third']) if (situation.runners[base]) r.push({ id: base, from: base, to: base });
    plan.runners = r;
    coverAllBases(plan);
    fillHolds(plan);
    return plan;
  }

  function planFoulGround(plan) {
    const { geo, situation } = plan;
    plan.title = 'Foul ball';
    plan.summary = 'A ground ball in foul territory is dead. Runners go back, and everybody returns to their spot.';
    plan.foul = true;
    const r = [];
    for (const base of ['first', 'second', 'third']) if (situation.runners[base]) r.push({ id: base, from: base, to: base });
    plan.runners = r;
    const F = plan.ball.at.x > 0 ? '1B' : '3B';
    plan.fielder = F;
    assign(plan, F, 'field', plan.ball.at, 'Let it roll foul — don\'t touch it if it is rolling foul! Then pick it up and toss it back to the pitcher.', { delay: 0.05 });
    plan.notes.push('A slow roller down the line: if it is about to roll foul, let it. If you touch it in fair territory, it is a fair ball.');
    fillHolds(plan);
    void geo;
    return plan;
  }

  // Everyone without a job stays ready at their spot.
  function fillHolds(plan) {
    for (const pos of POSITIONS) {
      if (!plan.assignments[pos]) {
        const at = plan.ready[pos];
        const ofs = ['LF', 'CF', 'RF'];
        assign(plan, pos, 'hold', at,
          ofs.includes(pos) ? 'Take a few steps in, stay ready for the ball.' : 'Stay ready at your spot and watch the ball.', { delay: 0.3 });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Non-batted plays: steals, passed balls, leads
  // ---------------------------------------------------------------------------------------------
  function planSituationPlay(geo, situation, event) {
    const ready = Field.readyPositions(geo, situation);
    const plan = newPlan(geo, situation, ready);
    const b = geo.bases;
    const run = situation.runners;
    const lefty = situation.batter === 'L';
    const leads = !!situation.leadoffs;
    plan.pitchOnly = true;
    plan.ball = { kind: 'pitch', at: { x: 0, y: -1 }, fieldPoint: { x: 0, y: -2 }, caught: true };
    const noLeadNote = geo.league.sport === 'softball'
      ? 'Softball: runners can leave the base when the pitcher releases the ball.'
      : 'In Little League baseball (60 ft), runners can\'t leave the base until the pitch reaches the batter — that makes stealing much harder.';

    switch (event.kind) {
      case 'steal2': {
        plan.title = 'Stealing 2nd';
        const cover = lefty ? 'SS' : '2B';
        const other = lefty ? '2B' : 'SS';
        plan.summary = `The runner on 1st takes off. The catcher throws to 2nd, and ${the(cover)} covers.`;
        plan.target = 'second';
        plan.fielder = 'C';
        assign(plan, 'C', 'field', { x: 0, y: -3 }, 'Catch the pitch, come up throwing, and throw to 2nd base — aim for the bag, knee-high.', { delay: 0 });
        assign(plan, cover, 'cover', { x: b.second.x + (cover === 'SS' ? -1 : 1), y: b.second.y - 1 },
          `Cover 2nd! Straddle the bag, catch the throw and tag the runner's foot as they slide in.`, { delay: 0.8 });
        assign(plan, other, 'backup', behind(geo, b.second, b.home, 15), `Back up the throw behind 2nd base.`, { delay: 0.8 });
        assign(plan, 'P', 'hold', { x: -8, y: geo.mound.y - 4 }, 'After you pitch, get out of the way — duck or step aside so the catcher can throw through.', { delay: 0.8 });
        assign(plan, 'CF', 'backup', behind(geo, b.second, b.home, 50), 'Charge in to back up the throw to 2nd.', { delay: 0.8 });
        assign(plan, '1B', 'cover', b.first, 'Stay near 1st in case of a throw back.', { delay: 0.8 });
        plan.throws.push({ fromPos: 'C', to: 'second' });
        plan.runners = [{ id: 'first', from: 'first', to: 'second', start: leads ? 0 : PITCH_TIME, out: true }];
        if (run.second) plan.runners.push({ id: 'second', from: 'second', to: 'second' });
        if (run.third) plan.runners.push({ id: 'third', from: 'third', to: 'third' });
        plan.notes.push(`Who covers? With a ${lefty ? 'left' : 'right'}-handed batter ${the(cover)} covers. Batters usually pull the ball, so the fielder on the pull side stays put.`);
        plan.notes.push(leads ? 'With leadoffs, the pitcher checks the runner and uses a quick delivery to hold them close.' : noLeadNote);
        plan.pitch = true;
        break;
      }
      case 'steal3': {
        plan.title = 'Stealing 3rd';
        plan.summary = 'The runner on 2nd takes off. The catcher throws to 3rd; the third baseman covers.';
        plan.target = 'third';
        plan.fielder = 'C';
        assign(plan, 'C', 'field', { x: 0, y: -3 }, 'Catch the pitch and throw to 3rd — step toward the base, around a right-handed batter.', { delay: 0 });
        assign(plan, '3B', 'cover', { x: b.third.x + 1, y: b.third.y + 1 }, 'Cover 3rd! Catch the throw and tag the runner.', { delay: 0.8 });
        assign(plan, 'SS', 'cover', b.second, 'Cover 2nd base behind the runner.', { delay: 0.8 });
        assign(plan, 'LF', 'backup', behind(geo, b.third, b.home, 45), 'Charge in to back up the throw to 3rd.', { delay: 0.8 });
        assign(plan, 'P', 'hold', { x: 8, y: geo.mound.y - 4 }, 'After the pitch, get out of the throwing lane.', { delay: 0.8 });
        plan.throws.push({ fromPos: 'C', to: 'third' });
        plan.runners = [{ id: 'second', from: 'second', to: 'third', start: leads ? 0 : PITCH_TIME, out: true }];
        if (run.first) plan.runners.push({ id: 'first', from: 'first', to: 'second', start: leads ? 0 : PITCH_TIME });
        if (run.third) plan.runners.push({ id: 'third', from: 'third', to: 'third' });
        plan.notes.push(leads ? 'A runner on 2nd can take a big lead. The shortstop and second baseman help by faking toward the bag to hold them close.' : noLeadNote);
        plan.pitch = true;
        break;
      }
      case 'firstThirdSteal': {
        plan.title = '1st & 3rd — double steal';
        plan.summary = 'The runner on 1st steals. The catcher throws toward 2nd, the second baseman cuts it in front of the bag, and the ball comes home if the runner on 3rd breaks.';
        plan.target = 'home';
        plan.fielder = 'C';
        const cutSpot = { x: 4, y: b.second.y - 18 };
        assign(plan, 'C', 'field', { x: 0, y: -3 }, 'Catch the pitch, look the runner on 3rd back, then throw to 2nd. Get back to the plate fast!', { delay: 0 });
        assign(plan, '2B', 'cutoff', cutSpot, 'Cut! Come in front of 2nd base. If the runner on 3rd breaks for home, catch it and throw home. If not, let it go through.', { delay: 0.8 });
        assign(plan, 'SS', 'cover', b.second, 'Cover 2nd base, ready to tag the runner coming from 1st.', { delay: 0.8 });
        assign(plan, '3B', 'cover', b.third, 'Stay on 3rd and yell "Four! Four!" if the runner breaks for home.', { delay: 0.8 });
        assign(plan, 'P', 'backup', behind(geo, b.home, cutSpot, 20), 'Duck out of the throw, then back up home plate.', { delay: 0.9 });
        assign(plan, 'CF', 'backup', behind(geo, b.second, b.home, 50), 'Charge in to back up 2nd base.', { delay: 0.8 });
        assign(plan, '1B', 'cover', b.first, 'Cover 1st base.', { delay: 0.8 });
        plan.throws.push({ fromPos: 'C', via: '2B', to: 'home' });
        plan.runners = [
          { id: 'first', from: 'first', to: 'second', start: leads ? 0 : PITCH_TIME },
          { id: 'third', from: 'third', to: 'home', start: 'afterFirstThrow', out: true },
        ];
        if (run.second) plan.runners.push({ id: 'second', from: 'second', to: 'second' });
        plan.notes.push('Coaches handle 1st & 3rd differently: throw through to 2nd, fake and throw to 3rd, throw back to the pitcher, or hold the ball. This shows the cut play. Ask your coach which one your team uses.');
        plan.pitch = true;
        break;
      }
      case 'passedBall': {
        plan.title = 'Passed ball / wild pitch';
        const target = run.third ? 'home' : run.second ? 'third' : 'second';
        plan.target = target;
        plan.fielder = 'C';
        plan.summary = target === 'home'
          ? 'The pitch gets past the catcher. The catcher chases it; the pitcher sprints in to cover home.'
          : `The pitch gets past the catcher. The catcher gets it and throws to ${baseName(target)}.`;
        const backstop = { x: 10, y: geo.backstop + 3 };
        plan.ball = { kind: 'passed', at: backstop, fieldPoint: backstop, caught: false };
        assign(plan, 'C', 'field', backstop, 'The ball got by! Turn and sprint to it, and yell where it is. Pick it up and throw.', { delay: 0.1 });
        assign(plan, 'P', 'cover', { x: 0, y: 2 },
          'Sprint to home plate! Point where the ball is and yell for the catcher. Catch the throw and tag the runner.', { delay: 0.1 });
        assign(plan, '1B', 'cover', b.first, 'Cover 1st base.', { delay: 0.3 });
        assign(plan, '2B', 'cover', b.second, 'Cover 2nd base.', { delay: 0.3 });
        assign(plan, '3B', 'cover', b.third, 'Cover 3rd base.', { delay: 0.3 });
        assign(plan, 'SS', 'backup', behind(geo, b.second, b.home, 14), 'Back up 2nd base.', { delay: 0.3 });
        plan.throws.push({ fromPos: 'C', to: target, toPos: target === 'home' ? 'P' : null });
        const r = [];
        for (const base of ['third', 'second', 'first']) if (run[base]) r.push({ id: base, from: base, to: nextBase(base), start: PITCH_TIME + 0.2, out: nextBase(base) === target });
        plan.runners = r;
        plan.notes.push('On a passed ball or wild pitch, the pitcher always covers home. The catcher yells and points; the pitcher yells "Here!" so the catcher knows where to throw.');
        plan.pitch = true;
        plan.passed = true;
        break;
      }
      case 'primaryLead': {
        plan.title = geo.league.sport === 'softball' ? 'Look-back rule' : 'Primary lead — pickoff';
        plan.target = 'first';
        plan.fielder = 'P';
        if (geo.league.sport === 'softball') {
          plan.summary = 'After the pitch, the pitcher has the ball in the circle. The runner must go back or run right away — the pitcher looks them back.';
          assign(plan, 'P', 'field', { x: 3, y: geo.mound.y - 3 }, 'With the ball in the circle, face the runner. If they aren\'t going back, run at them and throw to the base they are heading to.', { delay: 0 });
          assign(plan, '1B', 'cover', b.first, 'Get back to the bag for the throw.', { delay: 0.1 });
          assign(plan, '2B', 'cover', b.second, 'Cover 2nd in case the runner goes.', { delay: 0.1 });
          assign(plan, 'RF', 'backup', behind(geo, b.first, geo.mound, 45), 'Back up 1st base.', { delay: 0.2 });
          plan.notes.push('Look-back rule: once the pitcher has the ball in the circle, a runner who is off the base must immediately go back or try to advance. If they stop or change direction, they\'re out.');
          plan.runners = [{ id: 'first', from: 'first', to: 'first', leadStart: 10 }];
        } else {
          plan.summary = 'The runner takes a lead off 1st. The pitcher, from the stretch, throws over to the first baseman.';
          assign(plan, 'P', 'field', geo.mound, 'From the stretch: look at the runner. Step toward 1st and throw over — the first baseman is holding the runner on.', { delay: 0 });
          assign(plan, '1B', 'cover', { x: b.first.x - 1, y: b.first.y + 1 }, 'Hold the runner on: stand at the bag, give the pitcher a target, catch and tag low.', { delay: 0 });
          assign(plan, '2B', 'backup', lerp(b.first, b.second, 0.35), 'Move toward 1st to back up a bad pickoff throw.', { delay: 0.2 });
          assign(plan, 'RF', 'backup', behind(geo, b.first, geo.mound, 45), 'Charge in to back up the pickoff throw.', { delay: 0.2 });
          plan.runners = [{ id: 'first', from: 'first', to: 'first', leadStart: 11 }];
          plan.notes.push('Primary lead: the lead a runner takes before the pitch. The pitcher can throw over, step off, or hold the ball to keep it short.');
          if (!leads) plan.notes.push('Leadoffs aren\'t allowed in 60 ft Little League baseball — switch the league to 50/70 to practise this.');
        }
        plan.throws.push({ fromPos: 'P', to: 'first' });
        plan.pickoff = true;
        break;
      }
      case 'secondaryLead': {
        plan.title = 'Secondary lead — back-pick';
        plan.target = 'first';
        plan.fielder = 'C';
        plan.summary = 'As the pitch is thrown, the runner shuffles off 1st. The catcher throws behind them to the first baseman.';
        assign(plan, 'C', 'field', { x: 0, y: -3 }, 'Catch the pitch and snap a throw to 1st — the runner leaned too far off!', { delay: 0 });
        assign(plan, '1B', 'cover', { x: b.first.x - 1, y: b.first.y + 1 }, 'After the pitch, sneak back to the bag for the back-pick. Catch and tag low.', { delay: 0.5 });
        assign(plan, 'RF', 'backup', behind(geo, b.first, b.home, 40), 'Charge in to back up the throw to 1st.', { delay: 0.5 });
        assign(plan, '2B', 'backup', lerp(b.first, b.second, 0.3), 'Cheat toward 1st to back up the throw.', { delay: 0.5 });
        assign(plan, 'P', 'hold', { x: 10, y: geo.mound.y - 6 }, 'After the pitch, step off toward 1st and out of the throwing lane.', { delay: 0.8 });
        plan.throws.push({ fromPos: 'C', to: 'first' });
        plan.runners = [{ id: 'first', from: 'first', to: 'first', leadStart: leads ? 10 : 0, secondary: leads ? 18 : 12 }];
        plan.notes.push('Secondary lead: the extra shuffle steps a runner takes as the pitch is thrown. A catcher with a quick throw can pick them off.');
        if (!leads) plan.notes.push(noLeadNote);
        plan.pitch = true;
        break;
      }
      default:
        plan.title = 'Unknown play';
    }
    fillHolds(plan);
    return plan;
  }

  // ---------------------------------------------------------------------------------------------
  // Timeline: turns a plan into keyframes for every actor
  // ---------------------------------------------------------------------------------------------
  /*
   * tracks[id] = [{ t, x, y, h?, o? }]  — linear between keyframes; renderer eases.
   * events     = [{ t, type, text, at }] — "OUT!", "SAFE" style captions and throw arrows.
   */
  function buildTimeline(plan) {
    const { geo, ready } = plan;
    const b = geo.bases;
    const tracks = {};
    const events = [];
    const T0 = plan.pitchOnly ? 0 : PITCH_TIME;  // contact time for batted balls

    // --- The ball
    const ball = [];
    const mound = geo.mound;
    ball.push({ t: 0, x: mound.x, y: mound.y - 1, h: 5 });

    let contact = T0;
    let fieldPos = plan.fielder;
    let tBallAtFielder;

    // Fielders' movement (computed first so the ball can wait for the fielder).
    const starts = plan.pitch ? PITCH_TIME : T0;
    const fielderTrack = {};
    for (const pos of POSITIONS) {
      const a = plan.assignments[pos];
      const start = ready[pos];
      const keys = [{ t: 0, x: start.x, y: start.y }];
      let t = starts + (a ? a.delay : 0.3);
      let cur = start;
      keys.push({ t, x: cur.x, y: cur.y });
      const pts = a ? (a.path ? a.path.slice() : [a.to]) : [];
      if (a && a.path && dist(a.path[a.path.length - 1], a.to) > 1) pts.push(a.to);
      for (const p of pts) {
        const d = dist(cur, p);
        const speed = a.role === 'hold' ? RUN * 0.5 : RUN;
        t += d / speed;
        keys.push({ t, x: p.x, y: p.y });
        cur = p;
      }
      fielderTrack[pos] = keys;
    }
    const arrival = (pos) => fielderTrack[pos][fielderTrack[pos].length - 1].t;

    if (!plan.pitchOnly) {
      // Pitch arrives, batter hits it.
      ball.push({ t: T0, x: 0, y: 1, h: 3 });
      const at = plan.ball.landing;
      const d = dist(at, b.home);
      let flight;
      switch (plan.ball.kind) {
        case 'ground': flight = 0.3 + d / 75; break;
        case 'bunt': flight = 0.4 + d / 20; break;
        case 'line': flight = 0.1 + d / 95; break;
        case 'pop': flight = 2.6 + d / 200; break;
        default: flight = 1.5 + d / 110;
      }
      const landT = contact + flight;
      const peak = { ground: 2, bunt: 1, line: 7, pop: 85, fly: 60 }[plan.ball.kind] || 40;
      const air = plan.ball.kind === 'fly' || plan.ball.kind === 'pop' || plan.ball.kind === 'line';

      if (air) {
        // Sample the arc.
        const N = 14;
        const catchT = plan.ball.caught ? Math.max(landT, fieldPos ? arrival(fieldPos) + 0.05 : landT) : landT;
        for (let i = 1; i <= N; i++) {
          const f = i / N;
          const p = lerp({ x: 0, y: 1 }, at, f);
          const hMax = peak * Math.min(1, 0.4 + d / 250);
          const h = plan.ball.caught ? 4 * hMax * f * (1 - f) + 4 * f : 4 * hMax * f * (1 - f);
          ball.push({ t: contact + (catchT - contact) * f, x: p.x, y: p.y, h: Math.max(0, h) });
        }
        tBallAtFielder = catchT;
        if (plan.homeRun) {
          ball.push({ t: catchT + 0.6, x: plan.ball.fieldPoint.x, y: plan.ball.fieldPoint.y, h: 10 });
        } else if (!plan.ball.caught) {
          // Lands, then rolls to where it is fielded.
          const fp = plan.ball.fieldPoint;
          const rollT = landT + dist(at, fp) / 30 + 0.2;
          tBallAtFielder = Math.max(rollT, arrival(fieldPos));
          ball.push({ t: rollT, x: fp.x, y: fp.y, h: 0 });
          ball.push({ t: tBallAtFielder, x: fp.x, y: fp.y, h: 0 });
        }
      } else {
        // Grounder: a few bounces.
        const N = 8;
        const fp = plan.ball.fieldPoint;
        const endT = Math.max(contact + flight, fieldPos ? arrival(fieldPos) : 0);
        const tRoll = contact + flight;
        for (let i = 1; i <= N; i++) {
          const f = i / N;
          const p = lerp({ x: 0, y: 1 }, at, f);
          const h = Math.abs(Math.sin(f * Math.PI * 3)) * peak * (1 - f);
          ball.push({ t: contact + (tRoll - contact) * f, x: p.x, y: p.y, h });
        }
        if (dist(at, fp) > 1) ball.push({ t: tRoll + dist(at, fp) / 30, x: fp.x, y: fp.y, h: 0 });
        tBallAtFielder = Math.max(endT, ball[ball.length - 1].t);
        ball.push({ t: tBallAtFielder, x: fp.x, y: fp.y, h: 0 });
      }
    } else if (plan.passed) {
      ball.push({ t: PITCH_TIME, x: 0, y: -2, h: 1 });
      ball.push({ t: PITCH_TIME + 0.5, x: plan.ball.fieldPoint.x, y: plan.ball.fieldPoint.y, h: 0 });
      tBallAtFielder = Math.max(PITCH_TIME + 0.5, arrival('C'));
      ball.push({ t: tBallAtFielder, x: plan.ball.fieldPoint.x, y: plan.ball.fieldPoint.y, h: 0 });
    } else if (plan.pickoff) {
      tBallAtFielder = 0.8;
      ball.push({ t: 0.8, x: mound.x, y: mound.y - 1, h: 5 });
    } else {
      ball.push({ t: PITCH_TIME, x: 0, y: -3, h: 3 });
      tBallAtFielder = PITCH_TIME + 0.15;
    }

    if (plan.ball.caught && !plan.pitchOnly && !plan.homeRun) {
      events.push({ t: tBallAtFielder, type: 'catch', text: 'Caught!', at: plan.ball.landing });
    }

    // Throws
    let t = tBallAtFielder;
    let from = { x: ball[ball.length - 1].x, y: ball[ball.length - 1].y };
    let firstThrowCatch = null;
    const outsMade = [];
    for (const th of plan.throws) {
      const legs = [];
      if (th.via) {
        const a = plan.assignments[th.via];
        legs.push({ to: a.to, pos: th.via });
      }
      const tgtPos = th.toPos || coverAt(plan, th.to);
      const tgt = th.to === 'home' ? { x: 0, y: 1.5 } : b[th.to];
      legs.push({ to: tgt, pos: tgtPos, base: th.to });
      for (const leg of legs) {
        if (th.step && leg.base) {
          // Fielder steps on the base themselves.
          const tt = t + dist(from, leg.to) / RUN;
          ball.push({ t: tt, x: leg.to.x, y: leg.to.y, h: 3 });
          t = tt;
        } else {
          t += 0.35; // transfer
          ball.push({ t, x: from.x, y: from.y, h: 4 });
          const recvArr = leg.pos ? arrival(leg.pos) : t;
          const flightT = dist(from, leg.to) / THROW;
          let tt = t + flightT;
          if (tt < recvArr) { t += recvArr - tt; tt = recvArr; ball.push({ t, x: from.x, y: from.y, h: 4 }); }
          // A flat arc for throws.
          ball.push({ t: (t + tt) / 2, ...lerp(from, leg.to, 0.5), h: 4 + dist(from, leg.to) / 18 });
          ball.push({ t: tt, x: leg.to.x, y: leg.to.y, h: 4 });
          events.push({ t, type: 'throw', from: { ...from }, to: { ...leg.to }, tEnd: tt });
          t = tt;
        }
        if (firstThrowCatch === null) firstThrowCatch = t;
        if (leg.base) outsMade.push({ base: leg.base, t });
        from = leg.to;
      }
      // Stepping after a relay/cutoff: the covering fielder may have to wait.
    }
    if (plan.pickoff && plan.throws.length === 0) firstThrowCatch = 1;
    const endBall = t;

    // A fielder who fields the ball stands still once they have it, instead of running on.
    // (Already true: their path ends at the field point.)
    // For "step on the base" plays, the fielder carries the ball there.
    for (const th of plan.throws) {
      if (th.step && fieldPos) {
        const tr = fielderTrack[fieldPos];
        const last = tr[tr.length - 1];
        const base = th.to === 'home' ? { x: 0, y: 1.5 } : b[th.to];
        const tt = Math.max(last.t, tBallAtFielder) + dist(last, base) / RUN;
        tr.push({ t: Math.max(last.t, tBallAtFielder), x: last.x, y: last.y });
        tr.push({ t: tt, x: base.x, y: base.y });
      }
    }

    // --- Runners
    const runnerTracks = {};
    const runnerStart = plan.pitchOnly ? 0 : T0 + 0.15;
    for (const r of plan.runners) {
      const path = basePath(r.from, r.to);
      const startPos = r.from === 'home' ? { x: -3, y: -1 } : b[r.from];
      const keys = [];
      let lead = 0;
      if (r.leadStart) lead = r.leadStart;
      else if (plan.situation.leadoffs && r.from !== 'home') lead = 8;
      const leadPos = r.from === 'home' ? startPos : along(b[r.from], b[nextBase(r.from)], lead);
      keys.push({ t: 0, x: leadPos.x, y: leadPos.y, o: 1 });
      let t0 = r.start === undefined ? runnerStart : r.start === 'afterFirstThrow' ? (firstThrowCatch || 1) - 0.6 : r.start;
      if (r.tagUp) {
        // Back to the bag, wait for the catch, then go.
        keys.push({ t: runnerStart, x: b[r.from].x, y: b[r.from].y, o: 1 });
        t0 = tBallAtFielder;
      }
      if (r.secondary) {
        // Shuffle further off as the pitch comes in, then dive back.
        const sec = along(b.first, b.second, r.secondary);
        keys.push({ t: PITCH_TIME * 0.4, x: leadPos.x, y: leadPos.y, o: 1 });
        keys.push({ t: PITCH_TIME + 0.1, x: sec.x, y: sec.y, o: 1 });
        keys.push({ t: (firstThrowCatch || 1.5) - 0.1, x: b.first.x, y: b.first.y, o: 1 });
        runnerTracks[r.id] = keys;
        continue;
      }
      if (plan.pickoff) {
        keys.push({ t: 0.35, x: leadPos.x, y: leadPos.y, o: 1 });
        keys.push({ t: (firstThrowCatch || 1) - 0.05, x: b.first.x + 1.5, y: b.first.y + 1.5, o: 1 });
        runnerTracks[r.id] = keys;
        continue;
      }
      keys.push({ t: t0, x: keys[keys.length - 1].x, y: keys[keys.length - 1].y, o: 1 });
      let cur = keys[keys.length - 1];
      let tt = t0;
      for (const base of path) {
        const p = base === 'home' ? { x: 0, y: 0 } : b[base];
        tt += dist(cur, p) / RUNNER;
        keys.push({ t: tt, x: p.x, y: p.y, o: 1 });
        cur = p;
      }
      runnerTracks[r.id] = keys;
      // Outs: fade out a runner who is put out.
      if (r.out) {
        let tOut = null;
        if (plan.ball.caught && r.id === 'batter' && !plan.pitchOnly) tOut = tBallAtFielder;
        else {
          const o = outsMade.find((x) => x.base === r.to);
          if (o) tOut = o.t;
        }
        if (tOut !== null) {
          // Trim the path at the moment of the out.
          const cut = sampleTrack(keys, tOut);
          const trimmed = keys.filter((k) => k.t < tOut);
          trimmed.push({ t: tOut, x: cut.x, y: cut.y, o: 1 });
          trimmed.push({ t: tOut + 0.6, x: cut.x, y: cut.y, o: 0 });
          runnerTracks[r.id] = trimmed;
          events.push({ t: tOut, type: 'out', text: 'Out!', at: { x: cut.x, y: cut.y } });
        }
      }
    }

    // Ball leaves the park, or is tossed back after a foul.
    if (plan.foul) {
      const fp = plan.ball.fieldPoint;
      const ft = tBallAtFielder + 0.8;
      ball.push({ t: ft, x: fp.x, y: fp.y, h: 3 });
      ball.push({ t: ft + dist(fp, mound) / 40, x: mound.x, y: mound.y, h: 5 });
    }

    for (const pos of POSITIONS) tracks[pos] = fielderTrack[pos];
    tracks.ball = ball;
    for (const id in runnerTracks) tracks['runner:' + id] = runnerTracks[id];

    let end = endBall;
    for (const id in tracks) end = Math.max(end, tracks[id][tracks[id].length - 1].t);
    return { tracks, events, duration: end + 1.0, contact: T0 };
  }

  function basePath(from, to) {
    if (from === to) return [];
    const out = [];
    let i = BASE_ORDER.indexOf(from);
    if (from === 'home') i = 0;
    for (let n = 0; n < 4; n++) {
      i += 1;
      const base = BASE_ORDER[i];
      out.push(base);
      if (base === to) break;
    }
    return out;
  }

  function sampleTrack(keys, t) {
    if (!keys.length) return { x: 0, y: 0, h: 0, o: 1 };
    if (t <= keys[0].t) return Object.assign({ h: 0, o: 1 }, keys[0]);
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], k = keys[i];
      if (t <= k.t) {
        const span = k.t - a.t || 1;
        const f = (t - a.t) / span;
        return {
          x: a.x + (k.x - a.x) * f,
          y: a.y + (k.y - a.y) * f,
          h: (a.h || 0) + ((k.h || 0) - (a.h || 0)) * f,
          o: (a.o === undefined ? 1 : a.o) + ((k.o === undefined ? 1 : k.o) - (a.o === undefined ? 1 : a.o)) * f,
        };
      }
    }
    const last = keys[keys.length - 1];
    return Object.assign({ h: 0, o: 1 }, last);
  }

  // ---------------------------------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------------------------------
  function planPlay(situation, event) {
    const s = Object.assign({ runners: {}, outs: 0, batter: 'R', league: 'littleLeague' }, situation);
    s.runners = Object.assign({ first: false, second: false, third: false }, s.runners);
    const geo = Field.geometry(s.league);
    if (s.leadoffs === undefined) s.leadoffs = geo.league.leadoffs;
    const plan = event.at ? planBattedBall(geo, s, event) : planSituationPlay(geo, s, event);
    plan.timeline = buildTimeline(plan);
    plan.jobs = POSITIONS.map((p) => plan.assignments[p])
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    return plan;
  }

  const api = { planPlay, sampleTrack, classify, basePath, forcedBases, ROLE_ORDER, _dist: dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
