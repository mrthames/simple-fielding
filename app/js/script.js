/*
 * Build a play: a play the coach writes one step at a time (requested 2026-10-09).
 *
 * A script is the situation plus a list of steps. Each step is one thing the ball does, and what changes for the
 * runners and fielders while it happens:
 *
 *   { a: 'pitch', r: 'caught' | 'hit' | 'passed' | 'dropped', hit: { kind, at }, at }   (passed / dropped: where it rolls)
 *   { a: 'pickoff', base }                       the pitcher throws to whoever covers that base
 *   { a: 'field', by, call }                     a fielder gets the loose ball; call 'out' = caught in the air, batter out
 *   { a: 'throw', to, at, fake }                 to a fielder; at = where they catch it (a base, or their spot);
 *                                                fake = a base the thrower pump-fakes to first
 *   { a: 'run', at }                             the fielder with the ball runs with it
 *   { a: 'tag', runner, call }                   chase the runner down and tag them: call 'out' | 'safe'
 *   { a: 'base', base, runner, call }            step on a base for a force: call 'out' | 'safe' on that runner
 *   { a: 'hold' }                                the play is over
 * and on any step:
 *   runners: { first: { go: 'second' } | { stop: 3.4 } | { hold: true } }   from this step on
 *   move: { SS: { x, y } }                       a fielder moves to a spot during this step
 *   cap: 'text'                                  a caption for the step
 *
 * The coach decides every safe and out; nothing here judges a play. Runners and fielders keep moving across steps
 * until they get where they were sent or are sent somewhere else, so a runner can break for home in one step and
 * turn back in the next.
 *
 * Runner places are progress along the base path: 0 home, 1 first, 2 second, 3 third, 4 home again (scored).
 * Runner ids: the base they started on ('first', 'second', 'third'), and 'batter'.
 */
(function (root) {
  'use strict';

  const POSITIONS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  const PLAYER = { P: 'pitcher', C: 'catcher', '1B': 'first baseman', '2B': 'second baseman', SS: 'shortstop', '3B': 'third baseman', LF: 'left fielder', CF: 'center fielder', RF: 'right fielder' };
  const BASES = ['first', 'second', 'third', 'home'];
  const BASE_WORD = { first: '1st', second: '2nd', third: '3rd', home: 'home' };
  const BASE_P = { first: 1, second: 2, third: 3, home: 4 };
  const RUNNER_WORD = { first: 'the runner from 1st', second: 'the runner from 2nd', third: 'the runner from 3rd', batter: 'the batter' };
  const HIT_WORD = { ground: 'ground ball', line: 'line drive', fly: 'fly ball', pop: 'pop-up', bunt: 'bunt' };
  const ACTIONS = ['pitch', 'pickoff', 'field', 'throw', 'run', 'tag', 'base', 'hold'];

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  const r1 = (v) => Math.round(v * 100) / 100;
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const the = (pos) => 'the ' + PLAYER[pos];

  // Where a base is, by progress along the path (4 is home again).
  function pathPoint(geo, p) {
    const B = geo.bases;
    const ring = [B.home, B.first, B.second, B.third, B.home];
    const q = Math.max(0, Math.min(4, p));
    const i = Math.min(3, Math.floor(q));
    return lerp(ring[i], ring[i + 1], q - i);
  }
  // The nearest point on the base path to p, as progress (for dragging a runner's stopping spot).
  function progressNear(geo, pt) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = pathPoint(geo, i), b = pathPoint(geo, i + 1);
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const f = Math.max(0, Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / L2));
      const d = dist(pt, lerp(a, b, f));
      if (d < bd) { bd = d; best = i + f; }
    }
    return { p: best, d: bd };
  }
  // Which base a runner is heading to when sent to `base` from progress p ("home" from 3.4 means scoring).
  function targetProgress(base, p) {
    if (base === 'home') return p < 0.5 ? 0 : 4;
    return BASE_P[base];
  }
  // A runner's base when standing on one, else null.
  function baseAt(p) {
    const n = Math.round(p);
    if (Math.abs(p - n) > 0.04) return null;
    return n === 0 ? 'home' : n === 4 ? 'home' : BASES[n - 1];
  }
  // Who covers a base when the ball goes there, given where everyone is: the usual player, or the nearer
  // middle infielder at 2nd.
  function coverer(base, fielders, geo) {
    if (base === 'first') return '1B';
    if (base === 'third') return '3B';
    if (base === 'home') return 'C';
    const b = geo.bases.second;
    return dist(fielders.SS, b) <= dist(fielders['2B'], b) ? 'SS' : '2B';
  }

  // ---------------------------------------------------------------------------------------------------------
  // Motion: runners along the base path, fielders across the field. Each keeps a list of keyframes and at most
  // one motion in progress; a new order starts from wherever they are at that moment.
  // ---------------------------------------------------------------------------------------------------------
  function Runner(id, p, label, speed, segLen) {
    return { id, p0: p, label, keys: [], move: null, status: 'on', speed: speed / segLen, out: null, scoredAt: null };
  }
  function runnerP(r, t) {
    if (!r.move) return r.p0;
    const m = r.move;
    const dt = Math.max(0, t - m.t0);
    const dir = Math.sign(m.p1 - m.p0);
    const span = Math.abs(m.p1 - m.p0);
    return m.p0 + dir * Math.min(span, r.speed * dt);
  }
  function runnerArrive(r) {
    if (!r.move) return null;
    return r.move.t0 + Math.abs(r.move.p1 - r.move.p0) / r.speed;
  }
  // Writes the keyframes of the motion in progress up to time `until` (passing through each base it crosses).
  function closeRunner(geo, r, until) {
    const m = r.move;
    if (!m) return;
    const end = Math.min(until, runnerArrive(r));
    const pEnd = runnerP(r, end);
    const lo = Math.min(m.p0, pEnd), hi = Math.max(m.p0, pEnd);
    const corners = [];
    for (let n = Math.ceil(lo + 1e-6); n < hi - 1e-6; n++) corners.push(n);
    if (m.p1 < m.p0) corners.reverse();
    for (const n of corners) {
      const tc = m.t0 + Math.abs(n - m.p0) / r.speed;
      const pt = pathPoint(geo, n);
      r.keys.push({ t: r1(tc), x: pt.x, y: pt.y });
    }
    const pt = pathPoint(geo, pEnd);
    r.keys.push({ t: r1(end), x: pt.x, y: pt.y });
    r.p0 = pEnd;
    r.move = end < runnerArrive(r) - 1e-6 ? null : null;
  }
  function sendRunner(geo, r, target, t) {
    if (r.status !== 'on') return;
    const p = runnerP(r, t);
    closeRunner(geo, r, t);
    if (!r.keys.length || r.keys[r.keys.length - 1].t < t) { const pt = pathPoint(geo, p); r.keys.push({ t: r1(t), x: pt.x, y: pt.y }); }
    r.p0 = p;
    if (Math.abs(target - p) > 1e-6) r.move = { t0: t, p0: p, p1: target };
  }
  function stopRunner(geo, r, t) { if (r.status === 'on') sendRunner(geo, r, runnerP(r, t), t); }

  function Fielder(pos, at, speed) { return { pos, at: { x: at.x, y: at.y }, keys: [{ t: 0, x: at.x, y: at.y }], move: null, speed }; }
  function fielderAt(f, t) {
    if (!f.move) return f.at;
    const m = f.move, d = dist(m.from, m.to);
    const done = d ? Math.min(1, ((t - m.t0) * f.speed) / d) : 1;
    return t <= m.t0 ? m.from : lerp(m.from, m.to, done);
  }
  function fielderArrive(f) { return f.move ? f.move.t0 + dist(f.move.from, f.move.to) / f.speed : 0; }
  function moveFielder(f, to, t) {
    const here = fielderAt(f, t);
    if (f.move) { const a = Math.min(t, fielderArrive(f)); f.keys.push({ t: r1(a), ...fielderAt(f, a) }); }
    if (!f.keys.length || f.keys[f.keys.length - 1].t < t) f.keys.push({ t: r1(t), x: here.x, y: here.y });
    f.at = here;
    f.move = { t0: t, from: here, to: { x: to.x, y: to.y } };
    return t + dist(here, to) / f.speed;
  }
  function settleFielder(f, until) {
    if (!f.move) return;
    const a = Math.min(until, fielderArrive(f));
    const p = fielderAt(f, a);
    f.keys.push({ t: r1(a), x: p.x, y: p.y });
    if (a >= fielderArrive(f) - 1e-6) { f.at = p; f.move = null; }
  }

  // ---------------------------------------------------------------------------------------------------------
  // The planner
  // ---------------------------------------------------------------------------------------------------------

  /*
   * Turns a script into the plan the app draws: tracks for every fielder, runner and the ball, the events (throws,
   * catches, outs, safes), and what the play looks like after each step (`plan.scriptStates`, for the builder).
   * H: helpers from the engine (newPlan, throwTime, hangTime, computeLooks).
   */
  function plan(geo, situation, event, H) {
    const TP = geo.tempo;
    const ready = root.Field.readyPositions(geo, situation);
    const plan = H.newPlan(geo, situation, ready);
    plan.script = true;
    plan.pitchOnly = true;
    plan.title = (event.title || '').trim() || 'Your play';
    plan.ball = { kind: 'script' };
    const steps = Array.isArray(event.steps) ? event.steps : [];
    const segLen = dist(geo.bases.home, geo.bases.first);
    const F = {};
    for (const pos of POSITIONS) F[pos] = Fielder(pos, ready[pos], TP.fielder);
    const R = {};
    for (const base of ['first', 'second', 'third']) if (situation.runners && situation.runners[base]) R[base] = Runner(base, BASE_P[base], 'R', TP.runner, segLen);
    for (const id in R) { const pt = pathPoint(geo, R[id].p0); R[id].keys.push({ t: 0, x: pt.x, y: pt.y }); }

    const ball = [{ t: 0, x: geo.mound.x, y: geo.mound.y - 1, h: 5 }];
    const events = [];
    const states = [];
    const issues = [];
    const involved = {};
    const note = (pos, text) => { (involved[pos] = involved[pos] || []).push(text); };
    let holder = 'P';
    let loose = null;      // { at, landT, since, air }  a ball nobody has
    let pitched = false;
    let contact = 0;
    let T = 0.3;           // the pitcher's set before anything happens
    const starts = [];     // when each step began
    const busy = {};       // when each fielder last had the ball: they can't leave for a throw before that

    const out = (r, t, at, text) => {
      stopRunner(geo, r, t);
      r.status = 'out';
      r.out = { t, at };
      events.push({ t: r1(t), type: 'out', text: text || 'Out!', at });
    };
    const safe = (r, t, at) => events.push({ t: r1(t), type: 'safe', text: 'Safe!', at });
    const ballKey = (t, p, h) => ball.push({ t: r1(t), x: p.x, y: p.y, h });
    const throwBall = (from, to, t0, t1) => {
      const d = dist(from, to);
      ballKey(t0, from, 4);
      if (d > 20) ball.push({ t: r1((t0 + t1) / 2), x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, h: Math.min(30, 4 + d / 14) });
      ballKey(t1, to, 4);
      events.push({ t: r1(t0), tEnd: r1(t1), type: 'throw', from, to });
    };
    const runnerById = (id) => R[id];
    // A step's runner orders, plus what happens by default on a batted ball: the batter runs to 1st and forced
    // runners move up one base, unless the coach said otherwise.
    const applyRunners = (step, t, defaults) => {
      const orders = Object.assign({}, defaults || {}, step.runners || {});
      for (const id in orders) {
        const r = R[id], o = orders[id];
        if (!r || !o) continue;
        if (o.hold) stopRunner(geo, r, t);
        else if (o.go && BASE_P[o.go]) sendRunner(geo, r, targetProgress(o.go, runnerP(r, t)), t);
        else if (Number.isFinite(o.stop)) sendRunner(geo, r, Math.max(0, Math.min(4, o.stop)), t);
      }
    };

    steps.forEach((step, i) => {
      const t0 = T;
      starts.push(t0);
      // A fielder going to take a throw reads the play: they leave when the step before this one began.
      const leave = (pos) => Math.max(i > 0 ? starts[i - 1] : t0, busy[pos] || 0, F[pos].move ? t0 : 0);
      let tEnd = T + 0.6;
      const fail = (text) => { issues.push({ step: i, text }); };
      if (step && step.move) for (const pos in step.move) if (F[pos] && step.move[pos]) moveFielder(F[pos], step.move[pos], t0);

      const a = step && step.a;
      if (!ACTIONS.includes(a)) { fail('This step has nothing for the ball to do.'); applyRunners(step || {}, t0); }
      else if (a === 'pitch') {
        if (pitched || holder !== 'P') { fail('There is only one pitch, and the pitcher has to have the ball.'); applyRunners(step, t0); }
        else {
          pitched = true;
          const plate = { x: 0, y: 1.5 };
          const tp = t0 + TP.delivery;
          ballKey(t0, F.P.at, 5);
          const res = step.r || 'caught';
          if (res === 'caught') {
            applyRunners(step, t0);
            ballKey(tp, F.C.at, 3);
            holder = 'C';
            tEnd = tp + 0.1;
          } else if (res === 'hit') {
            const hit = step.hit || {};
            const kind = HIT_WORD[hit.kind] ? hit.kind : 'ground';
            const at = hit.at && Number.isFinite(hit.at.x) ? hit.at : { x: -20, y: 70 };
            contact = tp;
            R.batter = Runner('batter', 0, 'B', TP.runner, segLen);
            const hp = pathPoint(geo, 0);
            R.batter.keys.push({ t: 0, x: hp.x, y: hp.y, o: 0 }, { t: r1(tp), x: hp.x, y: hp.y, o: 1 });
            // The batter runs to 1st and forced runners move up, unless the coach sent them somewhere else.
            const defaults = { batter: { go: 'first' } };
            let forced = true;
            for (const b of ['first', 'second', 'third']) {
              if (forced && R[b]) defaults[b] = { go: BASES[BASES.indexOf(b) + 1] }; else forced = false;
            }
            applyRunners(step, t0, {});
            applyRunners({ runners: Object.fromEntries(Object.entries(defaults).filter(([id]) => !(step.runners || {})[id])) }, tp);
            const d = dist(plate, at);
            const air = kind === 'fly' || kind === 'pop' || kind === 'line';
            const flight = kind === 'ground' ? TP.ground.a + d / TP.ground.v : kind === 'bunt' ? TP.bunt.a + d / TP.bunt.v : H.hangTime(geo, kind, d);
            ballKey(tp, plate, 3);
            if (air) ball.push({ t: r1(tp + flight / 2), x: (plate.x + at.x) / 2, y: (plate.y + at.y) / 2, h: kind === 'line' ? 9 : kind === 'pop' ? 60 : Math.min(80, 20 + d / 3) });
            ballKey(tp + flight, at, air ? 5 : 0.5);
            holder = null;
            loose = { at, landT: tp + flight, since: tp, air };
            tEnd = tp + Math.min(flight, 0.9);
          } else {
            // A passed ball, a wild pitch, or strike 3 in the dirt: it gets by the catcher and rolls.
            applyRunners(step, t0);
            const at = step.at && Number.isFinite(step.at.x) ? step.at : { x: 10, y: -20 };
            ballKey(tp, { x: 0, y: 1 }, 1);
            const roll = tp + dist({ x: 0, y: 0 }, at) / (TP.roll || 30);
            ballKey(roll, at, 0.3);
            if (res === 'dropped') {
              R.batter = Runner('batter', 0, 'B', TP.runner, segLen);
              const hp = pathPoint(geo, 0);
              R.batter.keys.push({ t: 0, x: hp.x, y: hp.y, o: 0 }, { t: r1(tp), x: hp.x, y: hp.y, o: 1 });
              if (!(step.runners || {}).batter) sendRunner(geo, R.batter, 1, tp + 0.3);
            }
            holder = null;
            loose = { at, landT: roll, since: tp, air: false };
            tEnd = tp + 0.3;
          }
        }
      } else if (a === 'field') {
        const by = step.by;
        if (!loose) fail('Nobody can field it: someone already has the ball.');
        else if (!F[by]) fail('Pick who gets the ball.');
        else {
          applyRunners(step, t0);
          // Fielders react when the ball is hit, not when the step starts.
          const go = Math.min(t0, loose.since + 0.25);
          const f = F[by];
          const arrive = moveFielder(f, loose.at, go);
          const tCatch = Math.max(loose.landT, arrive);
          settleFielder(f, tCatch);
          f.at = loose.at; f.move = null;
          if (loose.air && arrive <= loose.landT + 0.05) {
            events.push({ t: r1(tCatch), type: 'catch', text: 'Caught!', at: loose.at });
            if (step.call === 'out' && R.batter && R.batter.status === 'on') out(R.batter, tCatch, pathPoint(geo, runnerP(R.batter, tCatch)), 'Out! (caught)');
          } else {
            ballKey(tCatch, loose.at, 1);
          }
          busy[by] = tCatch;
          note(by, `Step ${i + 1}: get the ball.`);
          holder = by;
          loose = null;
          tEnd = tCatch + 0.1;
        }
      } else if (a === 'throw' || a === 'pickoff') {
        let to = step.to, at = step.at;
        if (a === 'pickoff') {
          if (pitched || holder !== 'P') { fail('A pickoff comes from the pitcher, before the pitch.'); applyRunners(step, t0); return void finishStep(); }
          to = to || coverer(step.base || 'first', Object.fromEntries(POSITIONS.map((p) => [p, fielderAt(F[p], t0)])), geo);
          at = at || geo.bases[step.base || 'first'];
        }
        if (!holder) fail('Nobody has the ball to throw: field it first.');
        else if (!F[to] || to === holder) fail('Pick who catches the throw.');
        else {
          applyRunners(step, t0);
          const spot = at && Number.isFinite(at.x) ? at : (F[to].move ? F[to].move.to : fielderAt(F[to], t0));
          const recvArrive = moveFielder(F[to], spot, Math.min(t0, leave(to)));
          let release = t0 + (TP.transfer ? TP.transfer.inf : 0.35);
          if (step.fake && BASE_P[step.fake]) {
            events.push({ t: r1(t0 + 0.1), type: 'note', text: `Fake to ${BASE_WORD[step.fake]}!`, at: fielderAt(F[holder], t0) });
            release += 0.45;
          }
          const from = fielderAt(F[holder], release);
          const tArrive = Math.max(release + H.throwTime(geo, dist(from, spot), holder), recvArrive);
          throwBall(from, spot, release, tArrive);
          settleFielder(F[to], tArrive);
          F[to].at = spot; F[to].move = null;
          busy[holder] = release; busy[to] = tArrive;
          note(holder, `Step ${i + 1}: throw to ${the(to)}${step.fake ? `, after a fake to ${BASE_WORD[step.fake]}` : ''}.`);
          note(to, `Step ${i + 1}: catch the throw from ${the(holder)}.`);
          holder = to;
          tEnd = tArrive + 0.05;
        }
      } else if (a === 'run') {
        if (!holder) fail('Nobody has the ball.');
        else if (!step.at || !Number.isFinite(step.at.x)) fail('Drag where they run.');
        else {
          applyRunners(step, t0);
          const f = F[holder];
          const start = fielderAt(f, t0);
          const arrive = moveFielder(f, step.at, t0);
          ballKey(t0, start, 3); ballKey(arrive, step.at, 3);
          settleFielder(f, arrive);
          note(holder, `Step ${i + 1}: run with the ball.`);
          tEnd = arrive;
        }
      } else if (a === 'tag') {
        const r = runnerById(step.runner);
        if (!holder) fail('Nobody has the ball.');
        else if (!r || r.status !== 'on') fail('Pick a runner still on the field.');
        else {
          applyRunners(step, t0);
          const f = F[holder];
          const start = fielderAt(f, t0);
          // Meet the runner: the first moment the fielder can reach where the runner will be.
          let tm = t0;
          for (let dt = 0; dt <= 8; dt += 0.05) {
            const rp = pathPoint(geo, runnerP(r, t0 + dt));
            if (dist(start, rp) <= f.speed * dt + 3) { tm = t0 + dt; break; }
            tm = t0 + dt;
          }
          const meet = pathPoint(geo, runnerP(r, tm));
          const spot = dist(start, meet) > 2 ? lerp(start, meet, 1 - 2 / dist(start, meet)) : start;
          moveFielder(f, spot, t0);
          settleFielder(f, tm);
          ballKey(t0, start, 3); ballKey(tm, spot, 3);
          const tagT = tm + (TP.tagTime || 0.4) / 2;
          if (step.call === 'safe') safe(r, tagT, meet);
          else out(r, tagT, meet, 'Out! (tag)');
          note(holder, `Step ${i + 1}: tag ${RUNNER_WORD[r.id]}.`);
          tEnd = tagT + 0.2;
        }
      } else if (a === 'base') {
        const base = step.base;
        if (!holder) fail('Nobody has the ball.');
        else if (!BASE_P[base]) fail('Pick the base.');
        else {
          applyRunners(step, t0);
          const f = F[holder];
          const start = fielderAt(f, t0);
          const bp = geo.bases[base];
          const arrive = moveFielder(f, bp, t0);
          settleFielder(f, arrive);
          ballKey(t0, start, 3); ballKey(arrive, bp, 3);
          const r = runnerById(step.runner);
          if (r && r.status === 'on') {
            if (step.call === 'safe') safe(r, arrive, bp); else out(r, arrive, pathPoint(geo, runnerP(r, arrive)), 'Out! (force)');
          }
          note(holder, `Step ${i + 1}: step on ${BASE_WORD[base]}.`);
          tEnd = arrive + 0.2;
        }
      } else if (a === 'hold') {
        applyRunners(step, t0);
        if (holder) note(holder, `Step ${i + 1}: hold the ball. The play is over.`);
        tEnd = t0 + 0.8;
      }
      if (step && step.cap && String(step.cap).trim()) events.push({ t: r1(t0 + 0.05), type: 'note', text: String(step.cap).trim().slice(0, 40), at: holder ? fielderAt(F[holder], t0) : (loose ? loose.at : { x: 0, y: 1.5 }) });
      finishStep();

      function finishStep() {
        tEnd = Math.max(tEnd, t0 + 0.2);
        // A runner who reaches the plate still counts as on the field until the play ends: the coach may call
        // them out at home. Only the end of the play makes it a run.
        states.push(snapshot(i, t0, tEnd));
        T = tEnd;
      }
    });

    function snapshot(i, t0, t1) {
      const runners = {};
      for (const id in R) {
        const r = R[id];
        const p = r.status === 'out' && r.out ? runnerP(r, r.out.t) : runnerP(r, t1);
        runners[id] = { p: Math.round(p * 1000) / 1000, at: pathPoint(geo, p), base: baseAt(p), status: r.status, going: r.move && r.status === 'on' && runnerArrive(r) > t1 ? r.move.p1 : null };
      }
      const fielders = {};
      for (const pos of POSITIONS) { const p = fielderAt(F[pos], t1); fielders[pos] = { x: p.x, y: p.y }; }
      return { step: i, t0: r1(t0), t1: r1(t1), holder, loose: loose ? { at: loose.at, air: loose.air } : null, pitched, runners, fielders };
    }

    // Close every motion, write the tracks.
    let duration = T + 1.2;
    for (const id in R) { const a = runnerArrive(R[id]); if (a && R[id].status === 'on') duration = Math.max(duration, a + 0.6); }
    const tracks = {};
    for (const id in R) {
      const r = R[id];
      const stopT = r.status === 'out' && r.out ? r.out.t : duration;
      closeRunner(geo, r, stopT);
      const keys = r.keys.slice().sort((a, b) => a.t - b.t);
      const last = keys[keys.length - 1];
      if (r.status === 'out' && r.out) keys.push({ t: r1(r.out.t + 0.9), x: last.x, y: last.y, o: 0 });
      else if (runnerP(r, duration) >= 3.999) { const ta = r.move ? runnerArrive(r) : last.t; keys.push({ t: r1(Math.max(last.t, ta) + 0.9), x: last.x, y: last.y, o: 0 }); }
      tracks['runner:' + id] = dedupe(keys);
    }
    for (const pos of POSITIONS) { settleFielder(F[pos], duration); tracks[pos] = dedupe(F[pos].keys.slice().sort((a, b) => a.t - b.t)); }
    const holdAt = holder ? fielderAt(F[holder], duration) : null;
    if (holdAt && ball[ball.length - 1].t < duration) ballKey(duration, holdAt, 3);
    tracks.ball = dedupe(ball.sort((a, b) => a.t - b.t));
    events.sort((a, b) => a.t - b.t);

    plan.runners = Object.values(R).map((r) => ({ id: r.id, from: r.id === 'batter' ? 'home' : r.id, to: r.id === 'batter' ? 'first' : r.id, label: r.label, out: r.status === 'out' || undefined }));
    for (const pos of POSITIONS) {
      const jobs = involved[pos];
      const moved = steps.some((s) => s && s.move && s.move[pos]);
      const role = jobs && jobs.some((j) => /get the ball|catch|tag|step on/.test(j)) ? 'field' : moved ? 'cover' : 'hold';
      plan.assignments[pos] = { pos, role, to: fielderAt(F[pos], duration), job: jobs ? jobs.join(' ') : moved ? 'Move where the coach put you.' : 'Stay ready.', delay: 0 };
    }
    plan.jobs = POSITIONS.map((p) => plan.assignments[p]).filter((a) => a.role !== 'hold');
    const sentences = steps.map((s, i) => describe(s, i ? states[i - 1] : start(geo, situation, ready)));
    plan.summary = steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'}: ${sentences.map((s) => s.text).join(' ')}` : 'Start with the pitch, or a pickoff.';
    plan.notes = sentences.map((s, i) => `Step ${i + 1}: ${s.text}${s.meanwhile ? ' ' + s.meanwhile : ''}`);
    Object.assign(tracks, H.computeLooks(plan, tracks, events, 0, duration));
    plan.timeline = { tracks, events, duration: r1(duration), contact };
    plan.scriptStates = states;
    plan.scriptIssues = issues;
    return plan;
  }

  function dedupe(keys) {
    const out = [];
    for (const k of keys) {
      const prev = out[out.length - 1];
      if (prev && Math.abs(prev.t - k.t) < 1e-6) out[out.length - 1] = Object.assign({}, prev, k);
      else out.push(k);
    }
    return out;
  }

  // What the play looks like before the first step.
  function start(geo, situation, ready) {
    const runners = {};
    for (const b of ['first', 'second', 'third']) if (situation.runners && situation.runners[b]) runners[b] = { p: BASE_P[b], at: geo.bases[b], base: b, status: 'on', going: null };
    return { step: -1, t0: 0, t1: 0, holder: 'P', loose: null, pitched: false, runners, fielders: ready };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Words: each step as a sentence, for the step list and the play's notes.
  // ---------------------------------------------------------------------------------------------------------
  function describe(step, before) {
    step = step || {};
    const h = before && before.holder;
    let text;
    switch (step.a) {
      case 'pitch': {
        const r = step.r || 'caught';
        text = r === 'caught' ? 'Pitch. The catcher catches it.'
          : r === 'hit' ? `Pitch. The batter hits a ${HIT_WORD[(step.hit || {}).kind] || 'ground ball'}.`
          : r === 'passed' ? 'Pitch. It gets by the catcher.'
          : 'Pitch. Strike 3 in the dirt.';
        break;
      }
      case 'pickoff': text = `Pickoff throw to ${BASE_WORD[step.base || 'first']}.`; break;
      case 'field': text = step.by ? `${cap1(the(step.by))} ${step.call === 'out' ? 'catches it. The batter is out.' : 'gets the ball.'}` : 'Who gets the ball?'; break;
      case 'throw': text = step.to ? `${h ? cap1(the(h)) : 'They'} throw${h ? 's' : ''} to ${the(step.to)}${step.fake ? ` (fakes to ${BASE_WORD[step.fake]} first)` : ''}.` : `${h ? cap1(the(h)) : 'They'} throw${h ? 's' : ''} to …`; break;
      case 'run': text = `${h ? cap1(the(h)) : 'They'} run${h ? 's' : ''} with the ball.`; break;
      case 'tag': text = step.runner ? `${h ? cap1(the(h)) : 'They'} tag${h ? 's' : ''} ${RUNNER_WORD[step.runner] || 'the runner'}. ${step.call === 'safe' ? 'Safe.' : 'Out.'}` : `${h ? cap1(the(h)) : 'They'} tag …`; break;
      case 'base': text = step.base ? `${h ? cap1(the(h)) : 'They'} step${h ? 's' : ''} on ${BASE_WORD[step.base]}.${step.runner ? ` ${cap1(RUNNER_WORD[step.runner])} is ${step.call === 'safe' ? 'safe' : 'out'}.` : ''}` : `${h ? cap1(the(h)) : 'They'} step on …`; break;
      case 'hold': text = `${h ? cap1(the(h)) : 'They'} hold${h ? 's' : ''} the ball. Play over.`; break;
      default: text = 'What happens next?';
    }
    const parts = [];
    for (const id in step.runners || {}) {
      const o = step.runners[id];
      const who = cap1(RUNNER_WORD[id] || 'the runner');
      if (!o) continue;
      if (o.hold) parts.push(`${who} holds.`);
      else if (o.go) {
        const from = before && before.runners && before.runners[id];
        const back = from && targetProgress(o.go, from.p) < from.p;
        parts.push(`${who} ${back ? 'goes back to' : o.go === 'home' ? 'runs home' : 'runs to'}${o.go === 'home' && !back ? '' : ' ' + BASE_WORD[o.go]}.`);
      } else if (Number.isFinite(o.stop)) parts.push(`${who} stops partway.`);
    }
    for (const pos in step.move || {}) parts.push(`${cap1(the(pos))} moves.`);
    return { text, meanwhile: parts.join(' ') };
  }

  // ---------------------------------------------------------------------------------------------------------
  // What can happen next, from the state after the last step.
  // ---------------------------------------------------------------------------------------------------------
  function options(state) {
    if (!state || (!state.pitched && state.holder === 'P')) return ['pitch', 'pickoff'];
    if (state.loose) return ['field'];
    if (state.holder) return ['throw', 'run', 'tag', 'base', 'hold'];
    return [];
  }

  // Runners still on the field after a step, for the tag picker and the runner buttons.
  function liveRunners(state) {
    return Object.entries((state && state.runners) || {}).filter(([, r]) => r.status === 'on').map(([id, r]) => Object.assign({ id, word: RUNNER_WORD[id] }, r));
  }

  const api = { plan, describe, options, liveRunners, pathPoint, progressNear, coverer, POSITIONS, PLAYER, BASE_WORD, RUNNER_WORD, HIT_WORD, ACTIONS };
  if (typeof module !== 'undefined' && module.exports) {
    root.Field = root.Field || require('./field.js');
    module.exports = api;
  } else root.Script = api;
})(typeof window !== 'undefined' ? window : globalThis);
