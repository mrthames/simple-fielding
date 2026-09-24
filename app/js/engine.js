/*
 * The play engine.
 *
 * Given the situation (runners, outs, league) and what happened (a batted ball landing somewhere, or
 * a non-batted play such as a steal), it works out what every fielder should do, and then turns that
 * into a timeline the renderer can animate.
 *
 * The defense is derived from a handful of principles rather than looked up in a table of charts:
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
  const PITCH_TIME = 0.75;
  // Runners: about 3.5 s home to 1st in Little League baseball; 12U fastpitch runners are a touch quicker
  // over the same 60 ft (and in softball they're already moving when the ball is hit).
  const runnerSpeed = (geo) => (geo.league.sport === 'softball' ? 18 : 17);
  // Youth throws: firm up to about 90 ft, then they slow down fast (a 10-12 year old can't throw
  // 150 ft on a line). This is what lets a runner score from 2nd on a single to the outfield.
  function throwTime(d) {
    return d <= 90 ? d / 58 : 90 / 58 + (d - 90) / 38;
  }
  // A force out only needs the catch on the bag; a tag play also needs the tag, which takes a youth
  // fielder a moment. A runner is sent unless the throw would beat them by that much and more.
  const TAG_TIME = 0.4;
  const SEND_MARGIN = 0.4;

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

  // Where an outfielder backs up another outfielder: behind the ball and toward the backup's own side.
  function backupSpot(geo, fieldPoint, from, depth = 18, spread = 20) {
    const out = unit(geo.bases.home, fieldPoint);           // toward the fence
    const side = { x: -out.y, y: out.x };                    // perpendicular
    const s = ((from.x - fieldPoint.x) * side.x + (from.y - fieldPoint.y) * side.y) >= 0 ? 1 : -1;
    let p = { x: fieldPoint.x + out.x * depth + side.x * s * spread, y: fieldPoint.y + out.y * depth + side.y * s * spread };
    const max = geo.fenceAt(p) - 8;
    if (Math.hypot(p.x, p.y) > max) {
      // No room behind: stand off to the side instead, still a step deeper than the ball if possible.
      p = { x: fieldPoint.x + side.x * s * 26, y: fieldPoint.y + side.y * s * 26 };
    }
    return inPark(geo, p);
  }

  // Keep a spot inside the fence and in front of the backstop.
  function inPark(geo, p) {
    const r = Math.hypot(p.x, p.y);
    const max = geo.fenceAt(p) - 6;
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

  /*
   * Safety: nobody stands in, or runs through, the batter-runner's lane (the last half of the 1st-base
   * line, on the foul side), and nobody parks on a base path where a runner is coming. Fielders
   * covering 1st come up the inside (fair side) of the line and take the inside of the bag.
   */
  const FAIR_1 = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };   // into fair territory from the 1st-base line
  function laneSafe(geo, p) {
    const along = (p.x + p.y) * Math.SQRT1_2;               // distance up the 1st-base line
    const foul = (p.x - p.y) * Math.SQRT1_2;                 // >0 = foul side of the line
    if (along > 12 && along < geo.base + 4 && foul > -2.5 && foul < 7) {
      const push = foul + 3;
      return { x: p.x + FAIR_1.x * push, y: p.y + FAIR_1.y * push };
    }
    return p;
  }
  function distToSegment(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy), 0, 1);
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  }
  // Minimum distance from any base path between the bases (not counting standing right at a bag).
  function nearBasePath(geo, p) {
    const b = geo.bases;
    const segs = [[b.first, b.second], [b.second, b.third]];
    return Math.min(...segs.map(([a, c]) => distToSegment(p, a, c)));
  }
  // The point on an in-line cutoff/backup spot that keeps clear of the base paths.
  function lineUpClear(geo, base, ball, d) {
    let dd = d, spot = lineUp(base, ball, dd);
    for (let i = 0; i < 12 && nearBasePath(geo, spot) < 6 && dd < dist(base, ball) - 12; i++) {
      dd += 4; spot = lineUp(base, ball, dd);
    }
    return spot;
  }
  // Where somebody covering home sets up for a tag: in front of the plate on the infield side,
  // leaving the runner a path to the back of it. (A force at home is different: stand on the plate.)
  const HOME_TAG = { x: -1.5, y: 3.2 };
  const HOME_FORCE = { x: 0, y: 1.2 };
  const TAG_TEXT = 'Set up in front of the plate and leave the runner a path to the back of it. Catch it, then sweep the tag down.';

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
    if (d > geo.fenceAt(at) && fair && kind !== 'ground') return { type: 'homeRun', at, d, fair, kind };
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
    const fence = geo.fenceAt(at);
    const corner = Math.abs(at.x) > 0.8 * at.y;
    if (kind === 'ground') return (corner && d > 0.8 * fence) ? 2 : 1;
    if (d < 0.8 * fence) return 1;
    if (d < 0.93 * fence) return 2;
    return 3;
  }

  // ---------------------------------------------------------------------------------------------
  // Batted balls
  // ---------------------------------------------------------------------------------------------
  function planBattedBall(geo, situation, event) {
    const ready = Field.readyPositions(geo, situation);
    const plan = newPlan(geo, situation, ready);
    // A ground ball that gets past an infielder: `at` is where they tried for it, `through` is where it
    // rolled to. The play is planned where the ball ended up; the infielder who missed it dives first.
    let tryAt = null;
    if (event.kind === 'ground' && event.through && dist(event.through, event.at) > 4 && Field.isFair(event.at)) {
      tryAt = { x: event.at.x, y: event.at.y };
      event = Object.assign({}, event, { at: event.through });
      delete event.through;
    }
    const out = planBattedBallAt(plan, geo, situation, event);
    if (tryAt) missedGrounder(out, tryAt);
    return out;
  }

  function missedGrounder(plan, tryAt) {
    const { geo } = plan;
    const tryer = dist(tryAt, geo.bases.home) < geo.infieldEdge ? infieldFielder(plan, tryAt, false) : null;
    plan.ball.landing = round(tryAt);
    plan.through = true;
    if (!tryer || tryer === plan.fielder) return;
    const a = plan.assignments[tryer];
    const dive = along(plan.ready[tryer], tryAt, Math.max(0, dist(plan.ready[tryer], tryAt) - 2));
    a.path = [round(dive), ...(a.path || [a.to])];
    a.delay = 0.05;
    a.job = 'Go hard after it — it gets by you! Don\'t stay down: get up and ' + a.job.charAt(0).toLowerCase() + a.job.slice(1);
    plan.missedBy = tryer;
    plan.title = `Through the infield — ${plan.title.charAt(0).toLowerCase()}${plan.title.slice(1)}`;
    plan.summary = `The ball gets past ${the(tryer)}. ` + plan.summary;
    plan.notes.unshift(`When a ground ball gets through, ${the(tryer)} doesn't stay down or watch it: get up and go straight to your job. Everybody else plays it like a hit to the outfield.`);
  }

  function planBattedBallAt(plan, geo, situation, event) {
    const ready = plan.ready;
    if ((event.kind === 'ground' || event.kind === 'bunt') && Field.isFair(event.at) && dist(event.at, geo.bases.home) > geo.fenceAt(event.at) - 6) {
      // A ground ball can't leave the park: it rolls to the fence.
      event = Object.assign({}, event, { kind: 'ground', at: along(geo.bases.home, event.at, geo.fenceAt(event.at) - 8), result: event.result || 'double' });
    }
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
    // On a ball to center, only the corner outfielder on the ball's side backs up the fielder; the
    // other corner backs up a base instead of running across the whole outfield.
    const nearCorner = fieldPoint.x < 0 ? 'LF' : 'RF';
    for (const of of ofs) {
      const adjacent = F === 'CF' ? of === nearCorner : of === 'CF';
      if (adjacent) {
        // Get behind the fielder, in case the ball gets past them: a little deeper, and off to your
        // own side, so two backups (or a backup near the fence) never stand on the fielder's spot.
        assign(plan, of, 'backup', backupSpot(geo, fieldPoint, ready[of]),
          `Back up ${the(F)} — get behind them in case the ball gets by.`, { delay: 0.2 });
      } else {
        // The far corner outfielder comes in to back up a base.
        const base = of === 'RF' ? (target === 'first' ? 'first' : 'second') : (target === 'home' || target === 'third' ? 'third' : 'second');
        // (A corner never runs across behind center: the far corner backs up its own side.)
        // Beyond the base in line with the throw, but an outfielder stays on the grass: behind 2nd
        // that means shallow right-center (or left-center), not the infield dirt by 1st.
        let spot = behind(geo, b[base], fieldPoint, 30);
        if (base === 'second') {
          const r = Math.hypot(spot.x, spot.y), min = geo.infieldEdge + 8;
          if (r < min) spot = { x: spot.x * min / r, y: spot.y * min / r };
        } else {
          spot = outfieldBaseBackup(geo, base, fieldPoint);
        }
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
    const k = geo.base / 60;
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
        assign(plan, '1B', 'cutoff', lineUp(b.home, relaySpot, 36 * k),
          'Be the cutoff for home — line up in front of the plate between the relay and home.', { delay: 0.3 });
        cut = '1B';
      } else {
        assign(plan, '1B', 'cover', b.second,
          'Make sure the batter touches 1st, then follow them to 2nd and cover the bag.', {
            delay: 0.4, path: [lerp(ready1B(plan), b.first, 0.7), b.second],
          });
      }
      assign(plan, 'C', 'cover', target === 'home' ? HOME_TAG : HOME_FORCE,
        target === 'home' ? 'Cover home. ' + TAG_TEXT : 'Stay home — cover home plate.');
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
      cutSpot = lineUpClear(geo, b.second, fieldPoint, clamp(dist(b.second, fieldPoint) * 0.4, 30 * k, 50 * k));
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
      // 25-40 ft from 3rd (scaled), in line, and never on the base path the runner is rounding.
      cutSpot = lineUpClear(geo, b.third, fieldPoint, clamp(dist(b.third, fieldPoint) * 0.3, 25 * k, 40 * k));
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
      const cutD = Math.round(36 * k);
      cutSpot = lineUp(b.home, fieldPoint, cutD);
      assign(plan, cut, 'cutoff', cutSpot,
        `Be the cutoff for home — line up about ${cutD} feet in front of the plate, between the ball and home. Listen for the catcher!`,
        { delay: 0.15 });
      assign(plan, 'C', 'cover', HOME_TAG,
        'Cover home — you are the boss here: yell "Cut!" or "Let it go!" ' + TAG_TEXT);
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
      if (dist(roll, geo.bases.home) > geo.fenceAt(roll) - 6) fieldPoint = along(geo.bases.home, at, geo.fenceAt(at) - 6);
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
    plan.hitBases = bases;

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
    // Center field has priority: if CF can get there nearly as easily, CF takes it.
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
    const r = [{ id: 'batter', from: 'home', to: 'first', caughtOut: true }];

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
    const deep = dist(at, geo.bases.home) > 0.72 * geo.fenceAt(at);
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
    const fencePt = along(geo.bases.home, plan.ball.at, geo.fenceAt(plan.ball.at) - 3);
    assign(plan, F, 'field', fencePt, 'Run to the fence — play it until you know it is gone.', { delay: 0.05 });
    const r = [{ id: 'batter', from: 'home', to: 'home' }];
    for (const base of ['first', 'second', 'third']) if (situation.runners[base]) r.push({ id: base, from: base, to: 'home' });
    plan.runners = r;
    plan.homeRun = true;
    plan.ball.fieldPoint = round(along(geo.bases.home, plan.ball.at, geo.fenceAt(plan.ball.at) + 15));
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
      // Bases loaded, less than two outs: whoever fields it close to the plate takes the force at home.
      if (forced.home && dist(at, b.home) < 35 * (geo.base / 60)) return ['home', 'first'];
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

    // Runners: forced runners run; others hold (and get looked back). With two outs, everybody runs on
    // contact. Whether a runner is out is decided by the clock in the timeline, not here.
    const r = [{ id: 'batter', from: 'home', to: 'first', forced: true }];
    for (const base of ['first', 'second', 'third']) {
      if (!run[base]) continue;
      const nb = nextBase(base);
      if (forced[nb]) r.push({ id: base, from: base, to: nb, forced: true });
      else if (situation.outs === 2) r.push({ id: base, from: base, to: nb });
      else r.push({ id: base, from: base, to: base });
    }
    plan.runners = r;

    const label = isBunt ? 'Bunt' : 'Ground ball';
    plan.title = `${label} to ${the(F)}`;
    const dp = targets.length > 1;
    const first = targets[0];
    const stepSelf = dist(at, b[first]) < 18 * (geo.base / 60) && F !== 'C' || (F === 'C' && first === 'home');
    plan.summary = dp
      ? `${The(F)} gets the lead runner at ${baseName(first)}, then the throw goes to 1st — a double play!`
      : `${The(F)} fields it and ${stepSelf ? 'steps on' : 'throws to'} ${baseName(first)}${first === 'home' ? '' : ' base'}.`;

    // Who covers what.
    const k = geo.base / 60;
    const softball = geo.league.sport === 'softball';
    const leftSide = at.x < -3;
    // On a bunt the second baseman covers 1st, so the shortstop always has 2nd (or 3rd, below).
    const coverSecond = isBunt ? 'SS' : F === 'SS' ? '2B' : F === '2B' ? 'SS' : leftSide ? '2B' : 'SS';
    // Covering 1st: come up the inside of the line (fair side) and take the inside of the bag.
    const firstInside = { x: b.first.x + FAIR_1.x * 1.6, y: b.first.y + FAIR_1.y * 1.6 };
    const lineApproach = { x: (b.first.x - 12 * k * Math.SQRT1_2) + FAIR_1.x * 3, y: (b.first.y - 12 * k * Math.SQRT1_2) + FAIR_1.y * 3 };
    // A corner charging a bunt stays on the fair side of their line.
    const charge1 = geo.onLine(1, 26 * k, 6 * k), charge3 = geo.onLine(-1, 26 * k, 6 * k);

    // 1st base
    if (F === '1B' && isBunt) {
      assign(plan, '2B', 'cover', firstInside, 'Cover 1st base — the first baseman charged the bunt.', { delay: 0.1 });
    } else if (F === '1B' && softball) {
      // Fastpitch: the second baseman covers 1st whenever the first baseman leaves the bag.
      assign(plan, '2B', 'cover', firstInside, 'Cover 1st base — the first baseman is fielding it.', { delay: 0.1 });
      assign(plan, 'P', 'backup', lineApproach, 'Break toward 1st and back up the play.', { delay: 0.1 });
    } else if (F === '1B') {
      assign(plan, 'P', 'cover', firstInside,
        'Ball hit to your left? Run to 1st! Get to the baseline a few steps short of the bag, run up the INSIDE of the line, and take the throw on the inside of the bag.', {
          delay: 0.1, path: [lineApproach, firstInside],
        });
    } else if (isBunt) {
      assign(plan, '2B', 'cover', firstInside, 'Cover 1st base on the bunt — the first baseman is charging.', { delay: 0.1 });
      assign(plan, '1B', 'hold', charge1,
        'Charge in on the bunt! If someone else fields it, peel off to the inside — stay out of the runner\'s lane.', { delay: 0.05 });
    } else {
      assign(plan, '1B', 'cover', firstInside, 'Get to the bag! Stretch toward the throw once you know where it is.');
    }

    // Bunt with a runner on 2nd: the shortstop covers 3rd (the third baseman may charge). With runners
    // on 1st and 2nd that leaves 2nd open — take the sure out at 1st.
    if (isBunt && run.second && F !== 'SS') {
      assign(plan, 'SS', 'cover', b.third, 'Cover 3rd base — the third baseman might charge the bunt.', { delay: 0.1 });
      if (run.first && run.third) plan.notes.push('Bases loaded: every runner is forced. Get the force at home, then 1st if there\'s time.');
      else if (run.first) plan.notes.push('Runners on 1st and 2nd: the shortstop covers 3rd and the second baseman covers 1st, so 2nd is open. Take the sure out at 1st.');
    }
    // Ground ball to the third baseman with a runner on 2nd: the shortstop covers 3rd behind them.
    if (!isBunt && F === '3B' && (run.second || run.first) && !plan.assignments.SS && coverSecond !== 'SS') {
      assign(plan, 'SS', 'cover', b.third, 'Cover 3rd base — the third baseman came in for the ball.', { delay: 0.1 });
    }

    // 2nd base
    if (F !== coverSecond && !plan.assignments[coverSecond]) {
      const job = targets[0] === 'second'
        ? 'Cover 2nd base for the force — catch it, step on the bag, and throw to 1st for two!'
        : 'Cover 2nd base.';
      assign(plan, coverSecond, 'cover', b.second, job, { delay: 0.1 });
    }
    // The other middle infielder backs up the throw to 2nd or backs up the fielder.
    const otherMid = coverSecond === '2B' ? 'SS' : '2B';
    if (otherMid !== F && !plan.assignments[otherMid]) {
      if (targets[0] === 'second') {
        assign(plan, otherMid, 'backup', behind(geo, b.second, at, 16), 'Back up the throw to 2nd base.', { delay: 0.25 });
      } else {
        assign(plan, otherMid, 'backup', behind(geo, at, geo.bases.home, 18), `Back up ${the(F)} in case the ball gets through.`, { delay: 0.2 });
      }
    }

    // 3rd base
    if (F !== '3B') {
      if (isBunt && !run.second) {
        assign(plan, '3B', 'hold', charge3,
          'Charge in on the bunt! If the pitcher or catcher calls it, get back to 3rd.', { delay: 0.05 });
      } else if (isBunt && plan.assignments.SS && plan.assignments.SS.role === 'cover' && near3(plan.assignments.SS.to)) {
        assign(plan, '3B', 'hold', lerp(b.third, charge3, 0.5),
          'Read the bunt: charge it if it\'s yours. If the pitcher or catcher has it, get out of the way — the shortstop has 3rd.', { delay: 0.05 });
      } else {
        assign(plan, '3B', 'cover', b.third, targets[0] === 'third' ? 'Cover 3rd base for the force.' : 'Cover 3rd base.');
      }
    } else if (isBunt && run.first && !run.second && !run.third) {
      // The third baseman charged the bunt with a runner on 1st: the catcher covers 3rd, so the runner
      // can't round 2nd and walk into an empty base.
      assign(plan, 'C', 'cover', b.third, 'The third baseman charged — sprint up the line and cover 3rd so the runner can\'t take it.', { delay: 0.4 });
    }

    function near3(pt) { return pt && dist(pt, b.third) < 6; }

    // Home
    const needHome = run.second || run.third || targets.includes('home');
    if (F !== 'C') {
      if (needHome) {
        assign(plan, 'C', 'cover', targets[0] === 'home' ? HOME_FORCE : HOME_TAG,
          targets[0] === 'home' ? 'Force at home! Step on the plate like a first baseman, then throw to 1st.' : 'Stay home — cover the plate. ' + TAG_TEXT);
      } else if (!plan.assignments.C) {
        assign(plan, 'C', 'backup', { x: b.first.x + 14 * k, y: b.first.y - 18 * k },
          'Run down the line behind the runner to back up the throw to 1st — stay in foul territory.', { delay: 0.3 });
      }
    } else if (needHome && targets[0] !== 'home') {
      assign(plan, 'P', 'cover', HOME_TAG, 'Cover home plate — the catcher left to field the ball. ' + TAG_TEXT, { delay: 0.1 });
    } else if (targets[0] === 'home') {
      assign(plan, 'P', 'hold', { x: 10 * k, y: 16 * k }, 'The catcher has the plate — stay out of the way, off to the 1st-base side.', { delay: 0.1 });
    }

    // Pitcher
    if (F !== 'P' && !plan.assignments.P) {
      if (isBunt) {
        assign(plan, 'P', 'hold', { x: 0, y: geo.mound.y - 14 * k }, `Come off the mound toward the plate — if you field it, ${targets[0] === 'home' ? 'throw home for the force' : 'throw to 1st'}.`, { delay: 0.05 });
      } else if (at.x > 0 && dist(at, b.first) < 60 * k) {
        assign(plan, 'P', 'hold', lineApproach,
          'Ball hit to your left — break toward 1st! Get to the inside of the line in case you need to cover.', { delay: 0.1 });
      } else if (targets[0] === 'home' || targets[0] === 'third') {
        assign(plan, 'P', 'backup', behind(geo, b[targets[0]], at, 22), `Back up ${baseName(targets[0])}.`, { delay: 0.25 });
      } else {
        assign(plan, 'P', 'hold', lerp(geo.mound, b.first, 0.2), 'Get off the mound, out of the way of the throw.', { delay: 0.1 });
      }
    }

    // The fielder
    const throwText = dp && stepSelf
      ? `step on ${baseName(targets[0])}, then throw to 1st for two`
      : dp
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
      } else if (!isBunt && dist(at, geo.bases.home) > 50 && ((of === 'LF' && leftSide) || (of === 'CF'))) {
        assign(plan, of, 'backup', backupSpot(geo, at, ready[of], 45, 14),
          `Charge in to back up ${the(F)}.`, { delay: 0.2 });
      } else {
        // On a bunt or a ball near the plate, the outfielders back up bases, not the fielder.
        const base = of === 'CF' ? 'second' : 'third';
        assign(plan, of, 'backup', outfieldBaseBackup(geo, base, geo.mound),
          `Come in and back up ${baseName(base)} base, in case of a bad throw.`, { delay: 0.3 });
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

  /*
   * Who takes a ball in the air in the infield. Priority depends on direction, not a flat list:
   *   - the catcher takes pops behind and beside the plate;
   *   - the corners own pops in front of them (and a pop on the mound — the pitcher never takes one);
   *   - the middle infielders have priority on pops behind the corners, going away from the plate;
   *   - an outfielder coming in beats an infielder going out.
   * A line drive is different: it belongs to whoever is in its path.
   */
  function infieldAirFielder(plan, at, kind) {
    const { ready, geo } = plan;
    const k = geo.base / 60;
    const dHome = dist(at, geo.bases.home);
    const d = (p) => dist(ready[p], at);
    if (kind === 'line') return nearest(['P', '1B', '2B', 'SS', '3B'], ready, at);
    if (dHome < 30 * k) return Math.abs(at.x) > 14 * k && at.y > 8 ? (at.x > 0 ? '1B' : '3B') : 'C';
    // An outfielder coming in, behind the infield.
    const of = nearestOutfielder(ready, at);
    if (at.y > geo.bases.second.y - 5 * k && d(of) < 55 * k && d(of) < Math.min(d('SS'), d('2B')) + 25 * k) return of;
    // In front of the corners (or on the mound): a corner, or the catcher close to the plate.
    const cornerDepth = Math.max(ready['1B'].y, ready['3B'].y) + 6 * k;
    if (at.y < cornerDepth) {
      const front = dHome < 45 * k ? ['1B', '3B', 'C'] : ['1B', '3B'];
      return nearest(front, ready, at);
    }
    // Behind the corners: the middle infielders. When it's close, the shortstop has priority.
    return d('SS') <= d('2B') + 8 * k ? 'SS' : '2B';
  }

  function planInfieldFly(plan) {
    const { geo, situation, ready } = plan;
    const b = geo.bases;
    const k = geo.base / 60;
    const at = plan.ball.at;
    const run = situation.runners;
    const line = plan.ball.kind === 'line';
    plan.ball.caught = true;

    const F = infieldAirFielder(plan, at, plan.ball.kind);
    plan.fielder = F;
    plan.title = `${line ? 'Line drive' : 'Pop-up'} to ${the(F)}`;
    assign(plan, F, 'field', at,
      line ? 'Catch it! Then look at the runners — if one is off the base, throw behind them.'
        : 'Call it — "I got it! I got it!" — and catch it above your head with two hands.',
      { delay: 0.05 });

    // Runners: on a line drive they freeze and scramble back; on a pop-up they stay put.
    const r = [{ id: 'batter', from: 'home', to: 'first', caughtOut: true }];
    for (const base of ['first', 'second', 'third']) if (run[base]) r.push({ id: base, from: base, to: base, freeze: line });
    plan.runners = r;

    // A caught line drive with runners on and less than two outs: throw behind the lead runner.
    const lead = ['third', 'second', 'first'].find((x) => run[x]);
    if (line && lead && situation.outs < 2) {
      plan.target = lead;
      plan.throws.push({ fromPos: F, to: lead });
      plan.summary = `${The(F)} catches the line drive and throws to ${baseName(lead)} in case the runner was caught off the base.`;
      plan.notes.push('On a line drive, runners freeze. If a runner is caught off the base, throw to the base they left — that\'s a double play.');
    } else {
      plan.summary = `${The(F)} ${line ? 'catches the line drive' : 'calls it and catches it'}. Everyone else gets to a base.`;
    }

    const ofs = ['LF', 'CF', 'RF'];
    if (!line) {
      if (ofs.includes(F)) plan.notes.push('Outfielders coming in have priority over infielders going back — it is easier to catch a ball running toward it.');
      else plan.notes.push('Pop-up priority: the corners take balls in front of them, the shortstop and second baseman take balls behind the corners, the catcher takes pops near the plate, and an outfielder coming in beats an infielder going out. The pitcher points and yells, and lets a fielder catch it.');
      // Infield fly rule: runners on 1st & 2nd (or loaded), less than two outs, a fair pop an infielder can catch.
      if (run.first && run.second && situation.outs < 2 && !ofs.includes(F)) {
        plan.notes.push('Infield fly rule: with runners on 1st and 2nd (or the bases loaded) and less than two outs, the umpire calls the batter out on a fair pop-up an infielder can catch with ordinary effort, caught or not. Runners may advance at their own risk: if it\'s caught they must tag up; if it drops they don\'t have to.');
      }
    }

    // The pitcher covers home only if the catcher leaves it, and never runs through the play.
    if (F === 'C' && at.y < 8 * k) {
      assign(plan, 'P', 'cover', HOME_TAG, 'The catcher left home — run in and cover home plate.', { delay: 0.2 });
    } else if (F === 'C') {
      assign(plan, 'P', 'hold', { x: 14 * k, y: geo.mound.y - 12 * k }, 'Point at the ball, yell the catcher\'s name, and step off to the side — out of the way.', { delay: 0.1 });
    } else {
      assign(plan, 'P', 'hold', { x: at.x > 0 ? -10 * k : 10 * k, y: geo.mound.y - 4 * k }, 'Point at the ball and yell who should take it, then stay out of the way.', { delay: 0.1 });
    }

    coverAllBases(plan);
    // Only an outfielder close enough to matter comes in to back up an infielder.
    if (!ofs.includes(F) && !line) {
      const of = nearest(ofs, ready, at);
      if (!plan.assignments[of] && dist(ready[of], at) < 90 * k) assign(plan, of, 'backup', behind(geo, at, b.home, 25),
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
      if (p) assign(plan, p, 'cover', base === 'home' ? HOME_TAG : b[base], job, { delay: 0.2 });
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
    const dHome = dist(at, b.home);
    // Out of play: over the fence or back past the backstop. Nobody catches that — it's just a foul ball.
    if (dHome > geo.fenceAt(at) - 3 || at.y < geo.backstop) {
      plan.ball.fieldPoint = round(inPark(geo, at));
      return planFoulGround(plan, 'Out of play — a foul ball. Nobody can catch it, so runners go back and everybody resets.');
    }
    plan.ball.caught = true;
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
    if (F === 'C') assign(plan, 'P', 'cover', HOME_TAG, 'The catcher left home — sprint in and cover home plate!', { delay: 0.1 });
    if (F === '1B') assign(plan, '2B', 'cover', b.first, 'Cover 1st base — the first baseman is chasing the ball.', { delay: 0.1 });
    if (F === '3B') assign(plan, 'SS', 'cover', b.third, 'Cover 3rd base — the third baseman is chasing the ball.', { delay: 0.1 });
    if (F === '1B' || F === '3B') {
      assign(plan, 'C', 'hold', lerp(b.home, at, 0.35), 'Go toward the ball and help call it, then get back home.', { delay: 0.1 });
      assign(plan, 'P', 'cover', HOME_TAG, 'Cover home plate while the catcher helps.', { delay: 0.2 });
    }
    plan.notes.push('A caught foul ball is an out. Runners can tag up, just like a fly ball in fair territory.');
    const r = [{ id: 'batter', from: 'home', to: 'home', caughtOut: true }];
    const deep = dHome > 100 * (geo.base / 60);
    const tagHome = situation.runners.third && situation.outs < 2 && deep;
    for (const base of ['first', 'second', 'third']) {
      if (!situation.runners[base]) continue;
      if (base === 'third' && tagHome) r.push({ id: base, from: base, to: 'home', tagUp: true });
      else r.push({ id: base, from: base, to: base });
    }
    plan.runners = r;
    if (tagHome) {
      plan.target = 'home';
      plan.throws.push({ fromPos: F, to: 'home' });
      plan.notes.push('A deep foul fly with a runner on 3rd and less than two outs: the runner can tag and score. Late in a close game, it\'s often smart to let it drop.');
    }
    coverAllBases(plan);
    fillHolds(plan);
    return plan;
  }

  function planFoulGround(plan, summary) {
    const { geo, situation } = plan;
    plan.title = 'Foul ball';
    plan.summary = summary || 'A ground ball in foul territory is dead. Runners go back, and everybody returns to their spot.';
    plan.foul = true;
    const r = [];
    for (const base of ['first', 'second', 'third']) if (situation.runners[base]) r.push({ id: base, from: base, to: base });
    plan.runners = r;
    const F = plan.ball.at.x > 0 ? '1B' : '3B';
    plan.fielder = F;
    plan.ball.fieldPoint = round(inPark(geo, plan.ball.at));
    assign(plan, F, 'field', plan.ball.fieldPoint, 'Let it roll foul — don\'t touch it if it is rolling foul! Then pick it up and toss it back to the pitcher.', { delay: 0.05 });
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
    const softball = geo.league.sport === 'softball';
    const k = geo.base / 60;
    // When a stealing runner can go: with leadoffs, before the pitch; in softball, on the release;
    // in Little League baseball, not until the pitch reaches the batter.
    const go = leads || softball ? 0 : PITCH_TIME;
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
        plan.runners = [{ id: 'first', from: 'first', to: 'second', start: go, commit: true }];
        if (run.second) plan.runners.push({ id: 'second', from: 'second', to: 'second' });
        if (run.third) plan.runners.push({ id: 'third', from: 'third', to: 'third' });
        plan.notes.push(`Who covers? With a ${lefty ? 'left' : 'right'}-handed batter ${the(cover)} covers. Batters usually pull the ball, so the fielder on the pull side stays put.`);
        if (softball) plan.notes.push('Many fastpitch teams have the shortstop cover 2nd on every steal, because the second baseman owns 1st on bunts and slaps. Either works — ask your coach.');
        plan.notes.push(leads ? 'With leadoffs, the pitcher checks the runner and uses a quick delivery to hold them close.' : noLeadNote);
        plan.pitch = true;
        break;
      }
      case 'steal3': {
        plan.title = 'Stealing 3rd';
        plan.summary = 'The runner on 2nd takes off. The catcher throws to 3rd; the third baseman covers.';
        plan.target = 'third';
        plan.fielder = 'C';
        assign(plan, 'C', 'field', { x: 0, y: -3 }, `Catch the pitch and throw to 3rd — step toward the base${lefty ? '' : ', around the right-handed batter'}.`, { delay: 0 });
        assign(plan, '3B', 'cover', { x: b.third.x + 1, y: b.third.y + 1 }, 'Cover 3rd! Catch the throw and tag the runner.', { delay: 0.8 });
        assign(plan, 'SS', 'cover', b.second, 'Cover 2nd base behind the runner.', { delay: 0.8 });
        assign(plan, 'LF', 'backup', behind(geo, b.third, b.home, 45), 'Charge in to back up the throw to 3rd.', { delay: 0.8 });
        assign(plan, 'P', 'hold', { x: 8, y: geo.mound.y - 4 }, 'After the pitch, get out of the throwing lane.', { delay: 0.8 });
        plan.throws.push({ fromPos: 'C', to: 'third' });
        plan.runners = [{ id: 'second', from: 'second', to: 'third', start: go, commit: true }];
        if (run.first) plan.runners.push({ id: 'first', from: 'first', to: 'second', start: go });
        if (run.third) plan.runners.push({ id: 'third', from: 'third', to: 'third' });
        plan.notes.push(leads ? 'A runner on 2nd can take a big lead. The shortstop and second baseman help by faking toward the bag to hold them close.' : noLeadNote);
        plan.pitch = true;
        break;
      }
      case 'firstThirdSteal': {
        plan.fielder = 'C';
        if (situation.outs === 2) {
          // Two outs: throw through. A tag at 2nd before the runner from 3rd touches home ends the inning, no run.
          plan.title = '1st & 3rd — double steal, two outs';
          plan.summary = 'With two outs, the catcher throws through to 2nd. If the tag beats the runner from 3rd home, the run doesn\'t count.';
          plan.target = 'second';
          assign(plan, 'C', 'field', { x: 0, y: -3 }, 'Two outs: catch it and throw through to 2nd. Get the out and the inning is over.', { delay: 0 });
          assign(plan, 'SS', 'cover', b.second, 'Cover 2nd — catch it and tag the runner. With two outs, that ends it.', { delay: 0.8 });
          assign(plan, '2B', 'backup', behind(geo, b.second, b.home, 15), 'Back up the throw behind 2nd.', { delay: 0.8 });
          assign(plan, '3B', 'cover', b.third, 'Stay on 3rd.', { delay: 0.8 });
          assign(plan, 'P', 'hold', { x: -10 * k, y: geo.mound.y - 4 * k }, 'Get out of the throwing lane.', { delay: 0.8 });
          assign(plan, 'CF', 'backup', behind(geo, b.second, b.home, 50), 'Charge in to back up 2nd base.', { delay: 0.8 });
          plan.throws.push({ fromPos: 'C', to: 'second' });
          plan.runners = [
            { id: 'first', from: 'first', to: 'second', start: go, commit: true },
            { id: 'third', from: 'third', to: 'home', start: 'afterFirstThrow' },
          ];
          plan.notes.push('With two outs, many teams throw through to 2nd. If the tag beats the runner from 3rd to the plate, the inning is over and the run doesn\'t count. If the runner scores first, it counts, so the throw has to be quick.');
        } else {
          plan.title = '1st & 3rd — double steal';
          plan.summary = 'The runner on 1st steals. The catcher throws toward 2nd, the second baseman cuts it in front of the bag, and the ball comes home if the runner on 3rd breaks.';
          plan.target = 'home';
          const cutSpot = { x: 4 * k, y: b.second.y - 18 * k };
          assign(plan, 'C', 'field', { x: 0, y: -3 }, 'Catch the pitch, look the runner on 3rd back, then throw to 2nd. Get back to the plate fast!', { delay: 0 });
          assign(plan, '2B', 'cutoff', cutSpot, 'Cut! Come in front of 2nd base. If the runner on 3rd breaks for home, catch it and throw home. If not, let it go through.', { delay: 0.8 });
          assign(plan, 'SS', 'cover', b.second, 'Cover 2nd base, ready to tag the runner coming from 1st.', { delay: 0.8 });
          assign(plan, '3B', 'cover', b.third, 'Stay on 3rd and yell "Four! Four!" if the runner breaks for home.', { delay: 0.8 });
          // The pitcher backs up home by going around the 1st-base side, never across the plate.
          assign(plan, 'P', 'backup', { x: 8 * k, y: geo.backstop * 0.62 }, 'Duck out of the throw, then circle around the 1st-base side to back up home. Never cross in front of the plate.',
            { delay: 0.9, path: [{ x: 18 * k, y: 14 * k }, { x: 14 * k, y: -6 * k }] });
          assign(plan, 'CF', 'backup', behind(geo, b.second, b.home, 50), 'Charge in to back up 2nd base.', { delay: 0.8 });
          assign(plan, '1B', 'cover', b.first, 'Cover 1st base.', { delay: 0.8 });
          plan.throws.push({ fromPos: 'C', via: '2B', to: 'home' });
          plan.runners = [
            { id: 'first', from: 'first', to: 'second', start: go },
            { id: 'third', from: 'third', to: 'home', start: 'afterFirstThrow', commit: true },
          ];
          plan.notes.push('Coaches handle 1st & 3rd differently: throw through to 2nd, fake and throw to 3rd, throw back to the pitcher, or hold the ball. This shows the cut play. Ask your coach which one your team uses.');
        }
        if (run.second) plan.runners.push({ id: 'second', from: 'second', to: 'second' });
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
        assign(plan, 'P', 'cover', HOME_TAG,
          'Sprint to home plate! Point where the ball is and yell for the catcher. ' + TAG_TEXT, { delay: 0.1 });
        if (target === 'third') assign(plan, 'LF', 'backup', outfieldBaseBackup(geo, 'third', b.home), 'Charge in and back up the throw to 3rd.', { delay: 0.3 });
        assign(plan, '1B', 'cover', b.first, 'Cover 1st base.', { delay: 0.3 });
        assign(plan, '2B', 'cover', b.second, 'Cover 2nd base.', { delay: 0.3 });
        assign(plan, '3B', 'cover', b.third, 'Cover 3rd base.', { delay: 0.3 });
        assign(plan, 'SS', 'backup', behind(geo, b.second, b.home, 14), 'Back up 2nd base.', { delay: 0.3 });
        plan.throws.push({ fromPos: 'C', to: target, toPos: target === 'home' ? 'P' : null });
        const r = [];
        for (const base of ['third', 'second', 'first']) if (run[base]) r.push({ id: base, from: base, to: nextBase(base), start: PITCH_TIME + 0.2, commit: true });
        plan.runners = r;
        plan.notes.push('On a passed ball or wild pitch, the pitcher always covers home. The catcher yells and points; the pitcher yells "Here!" so the catcher knows where to throw.');
        plan.pitch = true;
        plan.passed = true;
        break;
      }
      case 'primaryLead': {
        plan.fielder = 'P';
        // 2B backs up from their own depth, off the 1st-2nd base path (never behind a leading runner).
        const offPath = (f) => { const p = lerp(b.first, b.second, f); return { x: p.x + 7 * k, y: p.y + 7 * k }; };
        if (softball) {
          const lead = ['third', 'second', 'first'].find((x) => run[x]) || 'first';
          plan.title = 'Look-back rule';
          plan.target = lead;
          plan.summary = `After the pitch, the pitcher has the ball in the circle. The runner on ${baseName(lead)} must go straight back or go — the pitcher holds the ball and makes her decide.`;
          assign(plan, 'P', 'field', { x: 0, y: geo.mound.y - 3 * k }, 'Ball in the circle: face the runner and HOLD the ball. A throw releases her. Only throw if she\'s caught hanging off the base.', { delay: 0 });
          const baseCover = { first: '1B', second: 'SS', third: '3B' }[lead];
          assign(plan, baseCover, 'cover', b[lead], `Get to ${baseName(lead)} base in case the pitcher needs to throw.`, { delay: 0.1 });
          plan.notes.push('Look-back rule: when the pitcher has the ball in the circle, a runner off the base must immediately go back or try to advance. Once she stops, or starts back, any further move off the base is an out.');
          plan.notes.push('Hold the ball: a throw to a base ends the look-back and lets the runner move freely. Make her commit.');
          plan.runners = [{ id: lead, from: lead, to: lead, leadStart: 10 }];
          for (const x of ['first', 'second', 'third']) if (run[x] && x !== lead) plan.runners.push({ id: x, from: x, to: x });
          plan.lookBack = true;
        } else {
          plan.title = 'Primary lead — pickoff';
          plan.target = 'first';
          plan.summary = 'The runner takes a lead off 1st. The pitcher, from the stretch, throws over to the first baseman.';
          assign(plan, 'P', 'field', geo.mound, 'From the stretch: look at the runner. Step toward 1st and throw over — the first baseman is holding the runner on.', { delay: 0 });
          assign(plan, '1B', 'cover', { x: b.first.x - 1, y: b.first.y + 1 }, 'Hold the runner on: stand at the bag, give the pitcher a target, catch and tag low.', { delay: 0 });
          assign(plan, '2B', 'backup', offPath(0.4), 'Shade toward 1st at your depth — stay off the base path, behind the runner.', { delay: 0.2 });
          assign(plan, 'RF', 'backup', behind(geo, b.first, geo.mound, 45), 'Charge in to back up the pickoff throw.', { delay: 0.2 });
          plan.runners = [{ id: 'first', from: 'first', to: 'first', leadStart: 11 }];
          plan.notes.push('Primary lead: the lead a runner takes before the pitch. The pitcher can throw over, step off, or hold the ball to keep it short.');
          if (!leads) plan.notes.push('Leadoffs aren\'t allowed in 60 ft Little League baseball — switch the league to 50/70 to practice this.');
          plan.throws.push({ fromPos: 'P', to: 'first' });
        }
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
        { const p = lerp(b.first, b.second, 0.35); assign(plan, '2B', 'backup', { x: p.x + 7 * k, y: p.y + 7 * k }, 'Cheat toward 1st at your depth to back up the throw — stay off the base path.', { delay: 0.5 }); }
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
        case 'ground': flight = 0.3 + d / 60; break;   // a youth grounder slows as it goes
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
          if (plan.hitBases === 3) {
            // A triple is a ball that rattles around in the corner: it takes long enough to dig out that
            // the batter makes it to 3rd ahead of the relay.
            const rs = runnerSpeed(geo);
            const batterAt3 = T0 + 0.15 + (3 * geo.base) / rs;
            const relay = plan.assignments[plan.throws[0] && plan.throws[0].via];
            const relayTime = relay ? 0.35 + throwTime(dist(fp, relay.to)) + 0.35 + throwTime(dist(relay.to, b.third)) : 0.35 + throwTime(dist(fp, b.third));
            tBallAtFielder = Math.max(tBallAtFielder, batterAt3 - relayTime + 0.4);
          }
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
        if (dist(at, fp) > 1) ball.push({ t: tRoll + dist(at, fp) / (plan.through ? 45 : 30), x: fp.x, y: fp.y, h: 0 });
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
      for (const [li, leg] of legs.entries()) {
        if (th.step && leg.base) {
          // Fielder steps on the base themselves.
          const tt = t + dist(from, leg.to) / RUN;
          ball.push({ t: tt, x: leg.to.x, y: leg.to.y, h: 3 });
          t = tt;
        } else {
          // Transfer: catch and throw. An outfielder sets their feet first; a cutoff has to catch and turn.
          const fromOF = li === 0 && ['LF', 'CF', 'RF'].includes(th.fromPos);
          t += 0.35 + (fromOF ? 0.3 : 0) + (li > 0 ? 0.1 : 0);
          ball.push({ t, x: from.x, y: from.y, h: 4 });
          const recvArr = leg.pos ? arrival(leg.pos) : t;
          const flightT = throwTime(dist(from, leg.to));
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
    // Processed lead runner first, so a trailing runner never passes, or ends on the same base as, the
    // runner ahead. Whether a runner is safe, out, or held up is decided by the clock: when they'd reach
    // the base against when the ball gets there.
    const RS = runnerSpeed(geo);
    const softball = geo.league.sport === 'softball';
    const runnerTracks = {};
    const runnerStart = plan.pitchOnly ? 0 : T0 + 0.15;
    const ORDER = ['third', 'second', 'first', 'batter'];
    const sorted = [...plan.runners].sort((x, y) => ORDER.indexOf(x.id) - ORDER.indexOf(y.id));
    const taken = new Set();
    const baseAt = (base) => (base === 'home' ? { x: 0, y: 0 } : b[base]);
    const fade = (keys, tOut) => {
      const cut = sampleTrack(keys, tOut);
      const trimmed = keys.filter((k) => k.t < tOut);
      trimmed.push({ t: tOut, x: cut.x, y: cut.y, o: 1 });
      trimmed.push({ t: tOut + 0.6, x: cut.x, y: cut.y, o: 0 });
      events.push({ t: tOut, type: 'out', text: 'Out!', at: { x: cut.x, y: cut.y } });
      return trimmed;
    };

    for (const r of sorted) {
      let path = basePath(r.from, r.to);
      // Never end on a base a runner ahead has already claimed.
      while (path.length && path[path.length - 1] !== 'home' && taken.has(path[path.length - 1])) path.pop();
      if (path.length === 0 && r.from !== r.to) r.to = r.from;
      else if (path.length) r.to = path[path.length - 1];

      const startPos = r.from === 'home' ? { x: -3, y: -1 } : b[r.from];
      const keys = [];
      let lead = 0;
      if (r.leadStart) lead = r.leadStart;
      else if (plan.situation.leadoffs && r.from !== 'home') lead = 8;
      // Softball runners leave on the pitcher's release, so by the time the ball is hit they're off the base.
      else if (softball && !plan.pitchOnly && r.from !== 'home' && !r.tagUp) lead = 8;
      const leadPos = r.from === 'home' ? startPos : along(b[r.from], baseAt(nextBase(r.from)), lead);
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
        events.push({ t: (firstThrowCatch || 1.5), type: 'safe', text: 'Safe!', at: { x: b.first.x, y: b.first.y } });
        continue;
      }
      if (plan.pickoff) {
        const home = b[r.from];
        const back = plan.lookBack ? 1.4 : (firstThrowCatch || 1) - 0.05;
        keys.push({ t: 0.35, x: leadPos.x, y: leadPos.y, o: 1 });
        keys.push({ t: back, x: home.x + 1.5, y: home.y + 1.5, o: 1 });
        runnerTracks[r.id] = keys;
        taken.add(r.from);
        if (!plan.lookBack) events.push({ t: back + 0.05, type: 'safe', text: 'Safe!', at: { x: home.x, y: home.y } });
        continue;
      }
      if (r.freeze) {
        // Line drive: the runner takes a step, freezes, and scrambles back to the base.
        const off = along(b[r.from], baseAt(nextBase(r.from)), 7);
        const back = tBallAtFielder + 0.5;
        keys.push({ t: runnerStart + 0.25, x: off.x, y: off.y, o: 1 });
        keys.push({ t: back, x: b[r.from].x, y: b[r.from].y, o: 1 });
        runnerTracks[r.id] = keys;
        taken.add(r.from);
        const ball = outsMade.find((x) => x.base === r.from);
        if (ball) events.push(ball.t < back ? { t: ball.t, type: 'out', text: 'Doubled off!', at: { ...b[r.from] } } : { t: ball.t, type: 'safe', text: 'Safe!', at: { ...b[r.from] } });
        continue;
      }

      keys.push({ t: t0, x: keys[keys.length - 1].x, y: keys[keys.length - 1].y, o: 1 });
      let cur = keys[keys.length - 1];
      let tt = t0;
      const reachAt = {};
      for (const [bi, base] of path.entries()) {
        const q = baseAt(base);
        // A runner already rounding a base is faster than one starting from a standstill.
        tt += dist(cur, q) / (bi === 0 ? RS : RS * 1.12);
        keys.push({ t: tt, x: q.x, y: q.y, o: 1 });
        reachAt[base] = tt;
        cur = q;
      }
      runnerTracks[r.id] = keys;

      // A batter caught out on a fly: out at the catch.
      if (r.caughtOut) {
        if (!plan.pitchOnly) runnerTracks[r.id] = fade(keys, tBallAtFielder);
        continue;
      }
      // The batter on a clean hit reaches the base the hit is worth.
      if (r.id === 'batter' && plan.classification === 'outfieldHit') { taken.add(r.to); continue; }

      const ballThere = path.length ? outsMade.find((x) => x.base === r.to) : null;
      if (!ballThere) { if (r.to !== 'home') taken.add(r.to); continue; }
      const tRun = reachAt[r.to];
      const canHold = !r.forced && !r.commit;
      const needed = r.forced ? 0.05 : TAG_TIME;          // how far ahead the ball must be for an out
      if (canHold && ballThere.t < tRun - needed - SEND_MARGIN) {
        // The throw would beat them easily: they hold at the last base, as a coach would stop them.
        const holdBase = path.length > 1 ? path[path.length - 2] : r.from;
        const hb = b[holdBase];
        const kept = [];
        let reach = null;
        for (let i = 0; i < keys.length; i++) {
          kept.push(keys[i]);
          if (keys[i].x === hb.x && keys[i].y === hb.y && keys[i].t >= t0) { reach = keys[i].t; break; }
        }
        if (reach === null) { reach = t0; kept.push({ t: t0, x: hb.x, y: hb.y, o: 1 }); }
        const turn = along(hb, baseAt(nextBase(holdBase)), 9);
        const tTurn = reach + 9 / RS;
        const tBack = Math.max(tTurn + 0.3, ballThere.t) + 9 / RS;
        kept.push({ t: tTurn, x: turn.x, y: turn.y, o: 1 });
        kept.push({ t: Math.max(tTurn + 0.3, ballThere.t), x: turn.x, y: turn.y, o: 1 });
        kept.push({ t: tBack, x: hb.x, y: hb.y, o: 1 });
        runnerTracks[r.id] = kept;
        r.held = holdBase;
        r.to = holdBase;
        taken.add(holdBase);
        events.push({ t: ballThere.t, type: 'hold', text: r.tagUp && holdBase === r.from ? 'Stays' : `Holds at ${baseName(holdBase)}`, at: { x: hb.x, y: hb.y } });
        const note = r.tagUp && holdBase === r.from
          ? 'The throw would beat the runner easily, so they stay at the base. On a shorter fly ball, the runner doesn\'t tag.'
          : `The throw would beat the runner to ${baseName(ballThere.base)}${ballThere.base === 'home' ? '' : ' base'}, so they hold at ${baseName(holdBase)}. A good relay keeps runs off the board.`;
        if (!plan.notes.includes(note)) plan.notes.push(note);
      } else if (ballThere.t + needed < tRun) {
        r.out = true;
        runnerTracks[r.id] = fade(keys, Math.min(tRun, ballThere.t + needed));
      } else {
        r.safe = true;
        events.push({ t: tRun, type: 'safe', text: 'Safe!', at: { ...baseAt(r.to) } });
        if (r.to !== 'home') taken.add(r.to);
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

  /*
   * Last checks on every plan, whatever produced it:
   *   - nobody's route or stopping spot is in the batter-runner's lane (a batted ball only);
   *   - nobody ends on top of anybody else (backups and holds get nudged apart);
   *   - softball words for softball ("circle", not "mound").
   */
  function finish(plan) {
    const { geo } = plan;
    const batterRuns = !plan.pitchOnly && plan.runners.some((r) => r.id === 'batter' && r.to !== 'home');
    if (batterRuns) {
      for (const pos of POSITIONS) {
        const a = plan.assignments[pos];
        if (!a || a.role === 'field') continue;
        a.to = round(laneSafe(geo, a.to));
        if (a.path) a.path = a.path.map((q) => round(laneSafe(geo, q)));
      }
    }
    const end = (a) => (a.path ? a.path[a.path.length - 1] : a.to);
    const movable = (a) => a.role === 'backup' || a.role === 'hold';
    for (let pass = 0; pass < 3; pass++) {
      for (const p1 of POSITIONS) {
        for (const p2 of POSITIONS) {
          if (p1 >= p2) continue;
          const a1 = plan.assignments[p1], a2 = plan.assignments[p2];
          const e1 = end(a1), e2 = end(a2);
          if (dist(e1, e2) >= 7) continue;
          const mover = movable(a2) ? a2 : movable(a1) ? a1 : null;
          if (!mover) continue;
          const other = mover === a2 ? e1 : e2;
          let dir = unit(other, end(mover));
          if (!Number.isFinite(dir.x) || (dir.x === 0 && dir.y === 0)) dir = { x: 1, y: 0 };
          const moved = inPark(geo, { x: other.x + dir.x * 9, y: other.y + dir.y * 9 });
          if (mover.path) mover.path[mover.path.length - 1] = round(moved);
          mover.to = round(moved);
        }
      }
    }
    if (geo.league.sport === 'softball') {
      const soft = (t) => t.replace(/off the mound/g, 'out of the circle').replace(/the mound/g, 'the circle').replace(/mound/g, 'circle');
      for (const pos of POSITIONS) plan.assignments[pos].job = soft(plan.assignments[pos].job);
      plan.notes = plan.notes.map(soft);
      plan.summary = soft(plan.summary);
    }
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
    finish(plan);
    plan.timeline = buildTimeline(plan);
    plan.jobs = POSITIONS.map((p) => plan.assignments[p])
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    return plan;
  }

  const api = { planPlay, sampleTrack, classify, basePath, forcedBases, ROLE_ORDER, _dist: dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
