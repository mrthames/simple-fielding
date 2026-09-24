/*
 * UI: situation controls, drag-to-hit, playback, the job list.
 */
(function () {
  'use strict';

  const VERSION = '0.6.0';
  const { POSITIONS, NAMES, LEAGUES } = window.Field;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const store = {
    get(k, d) { try { const v = localStorage.getItem('sf.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sf.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const state = {
    league: store.get('league', 'littleLeague'),
    leadoffs: null,
    runners: { first: false, second: false, third: false },
    outs: 0,
    batter: 'R',
    kind: 'ground',
    result: 'auto',
    speed: store.get('speed', 1),
    showPaths: store.get('showPaths', true),
    plan: null,
    lastEvent: null,
    playing: false,
    t: 0,
    spotlight: null,
    scenarioIndex: -1,
  };
  if (!LEAGUES[state.league]) state.league = 'littleLeague';
  state.leadoffs = store.get('leadoffs.' + state.league, LEAGUES[state.league].leadoffs);

  const tester = { on: store.get('tester', false), url: store.get('testerUrl', '') };
  const view = new window.FieldView($('#field'));
  let geo;

  // The coach's team: names on the field and in the job list. Stored on this device only.
  const T = window.Team;
  let team;
  try { team = T.load(window.localStorage); } catch (e) { team = T.empty(); }

  function who(pos) {
    const l = T.labelFor(team, pos);
    return l.name ? `${NAMES[pos]} · ${l.name}` : NAMES[pos];
  }

  function applyLabels() {
    const labels = {};
    for (const pos of POSITIONS) labels[pos] = T.labelFor(team, pos);
    view.setLabels(labels);
    if (state.plan) renderResult(state.plan);
    setSpotlight(state.spotlight);
  }

  function situation() {
    return { runners: Object.assign({}, state.runners), outs: state.outs, batter: state.batter, league: state.league, leadoffs: state.leadoffs };
  }

  // -------------------------------------------------------------------------------------------
  // Situation controls
  // -------------------------------------------------------------------------------------------
  function renderSituation() {
    for (const b of $$('.mini-base')) b.classList.toggle('on', !!state.runners[b.dataset.base]);
    const dots = $$('#outs span');
    dots.forEach((d, i) => d.classList.toggle('on', i < state.outs));
    $('#outs').setAttribute('aria-label', `${state.outs} out${state.outs === 1 ? '' : 's'}`);
    for (const b of $$('#batter-seg button')) b.classList.toggle('on', b.dataset.batter === state.batter);
    for (const b of $$('#kind-chips button')) b.classList.toggle('on', b.dataset.kind === state.kind);
    for (const b of $$('#result-chips button')) b.classList.toggle('on', b.dataset.result === state.result);
    // Other plays only make sense with the right runners on.
    const r = state.runners;
    const need = {
      steal2: r.first && !r.second, steal3: r.second && !r.third, firstThirdSteal: r.first && r.third && !r.second,
      passedBall: r.first || r.second || r.third, primaryLead: r.first, secondaryLead: r.first,
    };
    for (const b of $$('#other-plays button')) {
      b.classList.toggle('dim', !need[b.dataset.play]);
      b.title = need[b.dataset.play] ? '' : needText(b.dataset.play);
    }
  }

  function needText(play) {
    return {
      steal2: 'Put a runner on 1st (and nobody on 2nd)', steal3: 'Put a runner on 2nd (and nobody on 3rd)',
      firstThirdSteal: 'Put runners on 1st and 3rd', passedBall: 'Put a runner on base',
      primaryLead: 'Put a runner on 1st', secondaryLead: 'Put a runner on 1st',
    }[play];
  }

  function toggleRunner(base) {
    state.runners[base] = !state.runners[base];
    situationChanged();
  }

  function situationChanged() {
    if (board.on) closeBoard();
    renderSituation();
    showReady();
  }

  function showReady() {
    stop();
    state.plan = null;
    state.lastEvent = null;
    view.showReady(window.Field.readyPositions(geo, situation()), state.runners);
    $('#result').hidden = true;
    $('#play-title').hidden = true;
    $('#field-hint').hidden = false;
    setSpotlight(null);
    updateTransport();
  }

  // -------------------------------------------------------------------------------------------
  // Running a play
  // -------------------------------------------------------------------------------------------
  function runEvent(event, opts) {
    if (board.on) closeBoard();
    clearInkOnNewPlay();
    const ev = Object.assign({}, event);
    if (ev.at && state.result !== 'auto' && !ev.result) ev.result = state.result;
    const plan = window.Engine.planPlay(situation(), ev);
    state.plan = plan;
    // Every play is logged (last 50, on the device) so a tester can report it exactly.
    try { state.entry = window.PlayLog.record(window.localStorage, window.PlayLog.entry(plan, situation(), ev, VERSION)); }
    catch (e) { state.entry = window.PlayLog.entry(plan, situation(), ev, VERSION); }
    state.lastEvent = event;
    view.load(plan);
    renderResult(plan);
    $('#field-hint').hidden = true;
    const title = $('#play-title');
    title.textContent = plan.title;
    title.hidden = false;
    setSpotlight(state.spotlight);
    state.t = 0;
    if (!opts || opts.autoplay !== false) play();
    else updateTransport();
  }

  function renderResult(plan) {
    $('#result').hidden = false;
    $('#result-title').textContent = plan.title;
    $('#result-summary').textContent = plan.summary;
    const notes = $('#result-notes');
    notes.innerHTML = '';
    for (const n of plan.notes) {
      const li = document.createElement('li');
      li.textContent = n;
      notes.appendChild(li);
    }
    const jobs = $('#jobs');
    jobs.innerHTML = '';
    for (const j of plan.jobs) {
      const li = document.createElement('li');
      li.className = `job role-${j.role}`;
      li.dataset.pos = j.pos;
      li.innerHTML = `<span class="badge">${j.pos}</span><span class="job-text"><strong>${escapeHtml(who(j.pos))}</strong> ${escapeHtml(j.job)}</span>`;
      li.addEventListener('click', () => setSpotlight(state.spotlight === j.pos ? null : j.pos));
      jobs.appendChild(li);
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function setSpotlight(pos) {
    state.spotlight = pos;
    view.setSpotlight(pos);
    for (const li of $$('#jobs li')) li.classList.toggle('spot', li.dataset.pos === pos);
    const card = $('#spot-card');
    if (pos && state.plan) {
      const j = state.plan.assignments[pos];
      card.className = `spot-card role-${j.role}`;
      card.innerHTML = `<span class="badge">${pos}</span><div><strong>${escapeHtml(who(pos))}</strong><p>${escapeHtml(j.job)}</p></div>`;
      card.hidden = false;
      const li = $(`#jobs li[data-pos="${pos}"]`);
      if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (pos) {
      card.className = 'spot-card';
      card.innerHTML = `<span class="badge">${pos}</span><div><strong>${escapeHtml(who(pos))}</strong><p>Hit the ball to see what the ${NAMES[pos].toLowerCase()} does. Press and hold a player to put a name on them.</p></div>`;
      card.hidden = false;
    } else {
      card.hidden = true;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------------------------
  let raf = 0;
  let lastFrame = 0;

  function play() {
    if (!state.plan) return;
    if (state.t >= state.plan.timeline.duration) state.t = 0;
    state.playing = true;
    lastFrame = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    updateTransport();
  }

  function stop() {
    state.playing = false;
    cancelAnimationFrame(raf);
    updateTransport();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    state.t += dt * state.speed;
    const dur = state.plan.timeline.duration;
    if (state.t >= dur) {
      state.t = dur;
      view.seek(state.t);
      stop();
      return;
    }
    view.seek(state.t);
    updateScrub();
    raf = requestAnimationFrame(frame);
  }

  function updateScrub() {
    const dur = state.plan ? state.plan.timeline.duration : 1;
    $('#scrub').value = Math.round((state.t / dur) * 1000);
    $('#scrub').style.setProperty('--pct', `${(state.t / dur) * 100}%`);
  }

  function updateTransport() {
    const btn = $('#btn-play');
    const done = state.plan && state.t >= state.plan.timeline.duration;
    btn.dataset.mode = state.playing ? 'pause' : done ? 'replay' : 'play';
    btn.setAttribute('aria-label', state.playing ? 'Pause' : done ? 'Replay' : 'Play');
    btn.disabled = !state.plan;
    $('#scrub').disabled = !state.plan;
    $('#transport').classList.toggle('idle', !state.plan);
    $('#btn-report').hidden = !(tester.on && state.plan);
    updateScrub();
  }

  // -------------------------------------------------------------------------------------------
  // Drag to hit
  // -------------------------------------------------------------------------------------------
  const svg = $('#field');
  let drag = null;

  // -------------------------------------------------------------------------------------------
  // Whiteboard: move anything, draw on top. A Pencil always draws; a finger or mouse uses the tool.
  // Registered before the drag-to-hit handlers, in the capture phase, so it can take over the
  // field while the whiteboard is open.
  // -------------------------------------------------------------------------------------------
  const board = {
    on: false,
    tool: 'move',
    color: '#ffffff',
    state: null,     // { players, runners, ball, strokes }
    start: null,     // what Reset goes back to
    undo: [],
    redo: [],
    act: null,       // the gesture in progress
    penActive: false,
    lastPen: 0,
    ink: [],         // strokes that stay on the field after Done, until the next play
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function openBoard() {
    if (board.on) return;
    stop();
    setSpotlight(null);
    const snap = view.snapshot();
    board.state = Object.assign(snap, { strokes: clone(board.ink) });
    board.start = clone(board.state);
    board.undo = []; board.redo = [];
    board.on = true;
    document.body.classList.add('board-on');
    $('#btn-board').setAttribute('aria-pressed', 'true');
    $('#board-bar').hidden = false;
    $('#field-hint').hidden = true;
    view.setBoardMode(true);
    view.showBoard(board.state);
    renderBoardBar();
  }

  function closeBoard() {
    if (!board.on) return;
    board.on = false;
    view.setBoardMode(false);
    board.ink = clone(board.state.strokes);
    document.body.classList.remove('board-on');
    $('#btn-board').setAttribute('aria-pressed', 'false');
    $('#board-bar').hidden = true;
    // Back to the play (or the ready positions); the drawing stays on top.
    if (state.plan) { view.load(state.plan); view.seek(state.t); updateTransport(); }
    else showReady();
    view.drawInk(board.ink);
  }

  function clearInkOnNewPlay() {
    board.ink = [];
    view.drawInk([]);
  }

  function renderBoardBar() {
    for (const b of $$('#board-bar [data-tool]')) b.classList.toggle('on', b.dataset.tool === board.tool);
    for (const b of $$('#board-bar [data-color]')) b.classList.toggle('on', b.dataset.color === board.color);
    $('#bb-undo').disabled = !board.undo.length;
    $('#bb-redo').disabled = !board.redo.length;
    svg.dataset.tool = board.tool;
  }

  function commit() {
    board.undo.push(board.before);
    if (board.undo.length > 100) board.undo.shift();
    board.redo = [];
    board.before = null;
    renderBoardBar();
  }
  function undoBoard() {
    if (!board.undo.length) return;
    board.redo.push(clone(board.state));
    board.state = board.undo.pop();
    view.showBoard(board.state);
    renderBoardBar();
  }
  function redoBoard() {
    if (!board.redo.length) return;
    board.undo.push(clone(board.state));
    board.state = board.redo.pop();
    view.showBoard(board.state);
    renderBoardBar();
  }

  // What is under the finger: the ball first (it is small), then runners, then fielders.
  function pickActor(p) {
    const s = board.state;
    const scale = window.matchMedia('(max-width: 520px)').matches ? 1.35 : 1;
    const d = (q) => Math.hypot(q.x - p.x, q.y - p.y);
    if (d(s.ball) < 7 * scale) return { kind: 'ball' };
    let best = null, bd = Infinity;
    s.runners.forEach((r, i) => { const x = d(r); if (x < 7 * scale && x < bd) { bd = x; best = { kind: 'runner', i }; } });
    if (best) return best;
    for (const pos of POSITIONS) { const x = d(s.players[pos]); if (x < 9 * scale && x < bd) { bd = x; best = { kind: 'player', pos }; } }
    return best;
  }
  function actorPoint(a) {
    const s = board.state;
    return a.kind === 'ball' ? s.ball : a.kind === 'runner' ? s.runners[a.i] : s.players[a.pos];
  }

  function eraseAt(p) {
    const before = board.state.strokes.length;
    board.state.strokes = board.state.strokes.filter((st) => !st.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 5 + st.width));
    return board.state.strokes.length !== before;
  }

  function points(e) {
    const list = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    return list.map((ev) => {
      const p = view.toField(ev.clientX, ev.clientY);
      return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, pr: ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5 };
    });
  }

  svg.addEventListener('pointerdown', (e) => {
    if (!board.on) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const pen = e.pointerType === 'pen';
    // Palm rejection: while a Pencil is on the glass (or just was), ignore touches.
    if (e.pointerType === 'touch' && (board.penActive || performance.now() - board.lastPen < 500)) return;
    if (board.act) return;
    if (pen) board.penActive = true;
    const p = view.toField(e.clientX, e.clientY);
    const tool = pen ? (board.tool === 'arrow' || board.tool === 'eraser' ? board.tool : (board.tool === 'move' ? 'pen' : board.tool)) : board.tool;
    board.before = clone(board.state);
    svg.setPointerCapture(e.pointerId);

    if (tool === 'move') {
      const hit = pickActor(p);
      // Which bag was tapped, by distance: on a phone a fielder's enlarged touch area can cover the bag.
      const base = ['first', 'second', 'third'].find((k) => Math.hypot(view.geo.bases[k].x - p.x, view.geo.bases[k].y - p.y) < 6) || null;
      board.act = { id: e.pointerId, tool, hit, base, start: p, moved: false };
      if (hit) {
        const q = actorPoint(hit);
        board.act.offset = { x: q.x - p.x, y: q.y - p.y };
      }
    } else if (tool === 'eraser') {
      board.act = { id: e.pointerId, tool, erased: eraseAt(p) };
      view.drawInk(board.state.strokes);
    } else {
      const pr = pen ? (e.pressure || 0.5) : 0.5;
      const stroke = { type: tool === 'arrow' ? 'arrow' : 'ink', color: board.color, width: 0, pts: points(e), pr: [pr] };
      board.act = { id: e.pointerId, tool, stroke, pen };
      updateWidth(stroke);
      view.drawInk(board.state.strokes, stroke);
    }
  }, true);

  function updateWidth(st) {
    // Pressure sets the width: a light Pencil touch is thin, a hard press is bold.
    const prs = st.pts.map((q) => q.pr);
    const avg = prs.reduce((a, b) => a + b, 0) / prs.length;
    st.width = st.type === 'arrow' ? 1.4 + avg * 1.6 : 0.8 + avg * 2.4;
  }

  svg.addEventListener('pointermove', (e) => {
    if (!board.on) return;
    e.stopImmediatePropagation();
    const a = board.act;
    if (!a || e.pointerId !== a.id) return;
    const p = view.toField(e.clientX, e.clientY);
    if (a.tool === 'move') {
      if (Math.hypot(p.x - a.start.x, p.y - a.start.y) > 2) a.moved = true;
      if (a.hit && a.moved) {
        const q = actorPoint(a.hit);
        q.x = Math.round((p.x + a.offset.x) * 10) / 10;
        q.y = Math.round((p.y + a.offset.y) * 10) / 10;
        if (a.hit.kind === 'ball') view.placeBall(Object.assign({ h: 0 }, q), false);
        else if (a.hit.kind === 'runner') view.place(view.runnerEls[board.state.runners[a.hit.i].id], q);
        else view.place(view.actors[a.hit.pos], q);
      }
    } else if (a.tool === 'eraser') {
      if (eraseAt(p)) { a.erased = true; view.drawInk(board.state.strokes); }
    } else {
      for (const q of points(e)) {
        const last = a.stroke.pts[a.stroke.pts.length - 1];
        if (Math.hypot(q.x - last.x, q.y - last.y) >= 0.6) a.stroke.pts.push(q);
      }
      updateWidth(a.stroke);
      view.drawInk(board.state.strokes, a.stroke);
    }
  }, true);

  function endBoard(e, cancelled) {
    if (!board.on) return;
    e.stopImmediatePropagation();
    if (e.pointerType === 'pen') { board.penActive = false; board.lastPen = performance.now(); }
    const a = board.act;
    if (!a || e.pointerId !== a.id) return;
    board.act = null;
    if (cancelled) { board.state = board.before; view.showBoard(board.state); return; }
    if (a.tool === 'move') {
      if (a.hit && a.moved) commit();
      else if (!a.moved && a.base) {
        // Tap a base: put a runner on it (or take one off).
        const bp = view.geo.bases[a.base];
        const i = board.state.runners.findIndex((r) => Math.hypot(r.x - bp.x, r.y - bp.y) < 5);
        if (i >= 0) board.state.runners.splice(i, 1);
        else board.state.runners.push({ id: 'wb' + Date.now(), label: 'R', x: bp.x, y: bp.y });
        view.showBoard(board.state);
        commit();
      }
    } else if (a.tool === 'eraser') {
      if (a.erased) commit();
    } else {
      const st = a.stroke;
      delete st.pr;
      for (const q of st.pts) delete q.pr;
      const len = st.pts.reduce((sum, q, i) => i ? sum + Math.hypot(q.x - st.pts[i - 1].x, q.y - st.pts[i - 1].y) : 0, 0);
      if (st.type === 'arrow' && len < 6) { view.drawInk(board.state.strokes); return; }
      board.state.strokes.push(st);
      view.drawInk(board.state.strokes);
      commit();
    }
  }
  svg.addEventListener('pointerup', (e) => endBoard(e, false), true);
  svg.addEventListener('pointercancel', (e) => endBoard(e, true), true);
  svg.addEventListener('click', (e) => { if (board.on) e.stopImmediatePropagation(); }, true);

  $('#btn-board').addEventListener('click', () => (board.on ? closeBoard() : openBoard()));
  $('#bb-done').addEventListener('click', closeBoard);
  for (const b of $$('#board-bar [data-tool]')) b.addEventListener('click', () => { board.tool = b.dataset.tool; renderBoardBar(); });
  for (const b of $$('#board-bar [data-color]')) {
    b.style.setProperty('--swatch', b.dataset.color);
    b.addEventListener('click', () => { board.color = b.dataset.color; if (board.tool === 'move' || board.tool === 'eraser') board.tool = 'pen'; renderBoardBar(); });
  }
  $('#bb-undo').addEventListener('click', undoBoard);
  $('#bb-redo').addEventListener('click', redoBoard);
  $('#bb-clear').addEventListener('click', () => {
    if (!board.state.strokes.length) return;
    board.before = clone(board.state);
    board.state.strokes = [];
    view.drawInk([]);
    commit();
  });
  $('#bb-reset').addEventListener('click', () => {
    board.before = clone(board.state);
    const strokes = board.state.strokes;
    board.state = Object.assign(clone(board.start), { strokes });
    view.showBoard(board.state);
    commit();
  });

  svg.addEventListener('pointerdown', (e) => {
    const baseEl = e.target.closest && e.target.closest('.base');
    if (baseEl) return; // bases toggle on pointerup
    const p = view.toField(e.clientX, e.clientY);
    const nearPlate = Math.hypot(p.x, p.y - 1) < 16;
    // Players are tapped, not dragged — except the catcher, who stands on top of the ball.
    if (!nearPlate && e.target.closest && e.target.closest('.player')) return;
    drag = { id: e.pointerId, start: p, fromPlate: nearPlate, moved: false, at: p, cx: e.clientX };
    svg.setPointerCapture(e.pointerId);
    if (nearPlate) {
      stop();
      svg.classList.add('dragging');
    } else if (state.plan) {
      // Press and hold on the field, then drag left or right, to scrub the play back and forth.
      const d = drag;
      d.hold = setTimeout(() => {
        if (drag !== d || d.moved) return;
        stop();
        d.scrub = { x0: d.cx, t0: state.t };
        showScrub(true);
      }, 350);
    }
    e.preventDefault();
  });

  function showScrub(on) {
    const el = $('#scrub-hint');
    el.hidden = !on;
    svg.classList.toggle('scrubbing', on);
    if (on) updateScrubHint();
  }
  function updateScrubHint() {
    const dur = state.plan.timeline.duration;
    $('#scrub-hint-fill').style.width = `${(state.t / dur) * 100}%`;
    $('#scrub-hint-time').textContent = `${state.t.toFixed(1)} s`;
  }

  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.scrub) {
      // The width of the field is the whole play.
      const w = svg.getBoundingClientRect().width || 1;
      const dur = state.plan.timeline.duration;
      state.t = Math.max(0, Math.min(dur, drag.scrub.t0 + ((e.clientX - drag.scrub.x0) / w) * dur));
      view.seek(state.t);
      updateTransport();
      updateScrubHint();
      return;
    }
    const p = view.toField(e.clientX, e.clientY);
    drag.at = p;
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) { drag.moved = true; clearTimeout(drag.hold); }
    // A drag that doesn't start at home plate scrubs the play (a drag from the plate hits the ball).
    if (drag.moved && !drag.fromPlate && state.plan && !drag.scrub) {
      stop();
      drag.scrub = { x0: drag.cx, t0: state.t };
      showScrub(true);
      return;
    }
    if (drag.moved) view.cancelHolds();
    if (drag.fromPlate && drag.moved) {
      view.showDrag({ x: 0, y: 1 }, p, state.kind);
      $('#field-hint').hidden = true;
    }
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    clearTimeout(d.hold);
    svg.classList.remove('dragging');
    view.hideDrag();
    if (d.scrub) { showScrub(false); return; } // scrubbing never hits the ball
    if (cancelled) return;
    if (d.fromPlate && d.moved) {
      hitTo(d.at);
    } else if (!d.moved && !d.fromPlate) {
      // A plain tap on the field also hits the ball there — easier on a projector or with a mouse.
      if (state.spotlight) { setSpotlight(null); return; }
      if (Math.hypot(d.at.x, d.at.y) > 12) hitTo(d.at);
    } else if (!d.moved && d.fromPlate && state.plan) {
      replay();
    }
  }
  svg.addEventListener('pointerup', (e) => endDrag(e, false));
  svg.addEventListener('pointercancel', (e) => endDrag(e, true));

  // Tapping a base toggles a runner. Tapping a player spotlights them.
  svg.addEventListener('click', (e) => {
    const baseEl = e.target.closest && e.target.closest('.base');
    if (baseEl) toggleRunner(baseEl.dataset.base);
  });
  view.onLongPress = (pos) => { if (!board.on) { stop(); window.TeamUI.openPosition(pos); } };
  view.onPick = (pos) => { if (!drag || !drag.moved) setSpotlight(state.spotlight === pos ? null : pos); };

  function hitTo(p) {
    const at = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
    // A drop right on top of a fielder in the outfield, with "Let the app decide", is a catch for a fly.
    runEvent({ kind: state.kind, at });
  }

  function replay() {
    if (!state.plan) return;
    state.t = 0;
    view.seek(0);
    play();
  }

  // -------------------------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------------------------
  for (const b of $$('.mini-base')) b.addEventListener('click', () => toggleRunner(b.dataset.base));
  $('#btn-clear').addEventListener('click', () => { state.runners = { first: false, second: false, third: false }; situationChanged(); });
  $('#outs').addEventListener('click', () => { state.outs = (state.outs + 1) % 3; situationChanged(); });
  for (const b of $$('#batter-seg button')) b.addEventListener('click', () => { state.batter = b.dataset.batter; renderSituation(); rerun(); });
  for (const b of $$('#kind-chips button')) b.addEventListener('click', () => { state.kind = b.dataset.kind; renderSituation(); rerunHit(); });
  for (const b of $$('#result-chips button')) b.addEventListener('click', () => { state.result = b.dataset.result; renderSituation(); rerunHit(); });
  for (const b of $$('#other-plays button')) {
    b.addEventListener('click', () => {
      const play = b.dataset.play;
      // Put the runners the play needs on base, so the button always does something.
      const r = state.runners;
      if (play === 'steal2') { r.first = true; r.second = false; }
      if (play === 'steal3') { r.second = true; r.third = false; }
      if (play === 'firstThirdSteal') { r.first = true; r.third = true; r.second = false; }
      if (play === 'passedBall' && !(r.first || r.second || r.third)) r.third = true;
      if (play === 'primaryLead' || play === 'secondaryLead') r.first = true;
      renderSituation();
      runEvent({ kind: play });
      scrollToResultOnPhone();
    });
  }

  // Changing the hit type or result re-runs the last batted ball, so a coach can compare.
  function rerunHit() {
    if (state.lastEvent && state.lastEvent.at) runEvent({ kind: state.kind, at: state.lastEvent.at });
  }
  function rerun() {
    if (!state.lastEvent) return;
    if (state.lastEvent.at) rerunHit();
    else runEvent(state.lastEvent);
  }

  function scrollToResultOnPhone() {
    // The field stays on screen; in the stacked layout bring the play's write-up into view in the panel.
    if (window.matchMedia('(min-width: 900px), (orientation: landscape) and (min-width: 560px)').matches) return;
    const panel = $('#panel');
    panel.scrollTo({ top: Math.max(0, $('#result').offsetTop - panel.offsetTop - 8), behavior: 'smooth' });
  }

  $('#btn-play').addEventListener('click', () => {
    if (!state.plan) return;
    if (state.playing) stop();
    else if (state.t >= state.plan.timeline.duration) replay();
    else play();
  });
  $('#scrub').addEventListener('input', (e) => {
    if (!state.plan) return;
    stop();
    state.t = (e.target.value / 1000) * state.plan.timeline.duration;
    view.seek(state.t);
    updateTransport();
  });
  for (const b of $$('.transport .seg button')) {
    b.classList.toggle('on', Number(b.dataset.speed) === state.speed);
    b.addEventListener('click', () => {
      state.speed = Number(b.dataset.speed);
      store.set('speed', state.speed);
      for (const x of $$('.transport .seg button')) x.classList.toggle('on', x === b);
    });
  }
  $('#btn-reset').addEventListener('click', () => { if (board.on) closeBoard(); clearInkOnNewPlay(); showReady(); });

  // Library
  const lib = $('#library');
  function buildLibrary() {
    const body = $('#library-body');
    body.innerHTML = '';
    let i = 0;
    for (const g of window.Scenarios.GROUPS) {
      const h = document.createElement('h3');
      h.textContent = g.name;
      body.appendChild(h);
      const list = document.createElement('div');
      list.className = 'lib-list';
      for (const it of g.items) {
        const idx = i++;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lib-item';
        btn.innerHTML = `<span>${escapeHtml(it.name)}</span>${miniSit(it)}`;
        btn.addEventListener('click', () => { closeSheet(lib); runScenario(idx); });
        list.appendChild(btn);
      }
      body.appendChild(list);
    }
  }
  function miniSit(it) {
    const r = it.runners;
    const dot = (on) => `<i class="${on ? 'on' : ''}"></i>`;
    return `<span class="lib-sit"><span class="lib-bases">${dot(r.third)}${dot(r.second)}${dot(r.first)}</span><span class="lib-outs">${it.outs} out${it.outs === 1 ? '' : 's'}</span></span>`;
  }

  function runScenario(idx) {
    const all = window.Scenarios.ALL;
    const sc = all[(idx + all.length) % all.length];
    state.scenarioIndex = (idx + all.length) % all.length;
    state.runners = Object.assign({ first: false, second: false, third: false }, sc.runners);
    state.outs = sc.outs || 0;
    if (sc.batter) state.batter = sc.batter;
    if (sc.leadoffs && !state.leadoffs && geo.league.sport === 'baseball') {
      // Leads only exist where leadoffs are allowed; switch them on for this play.
      state.leadoffs = true;
      $('#leadoffs').checked = true;
    }
    const ev = Object.assign({}, sc.event);
    if (ev.at) {
      const k = geo.base / 60;
      ev.at = { x: ev.at.x * k, y: ev.at.y * k };
      state.kind = ev.kind;
      state.result = ev.result || 'auto';
    }
    renderSituation();
    runEvent(ev);
    scrollToResultOnPhone();
  }

  $('#btn-library').addEventListener('click', () => openSheet(lib));

  // Settings
  const settings = $('#settings');
  const leagueSel = $('#league');
  for (const k in LEAGUES) {
    const o = document.createElement('option');
    o.value = k; o.textContent = LEAGUES[k].label;
    leagueSel.appendChild(o);
  }
  leagueSel.value = state.league;
  function setLeague(key) {
    if (!LEAGUES[key]) return;
    if (board.on) closeBoard();
    clearInkOnNewPlay();
    state.league = key;
    leagueSel.value = key;
    store.set('league', key);
    // Remember which baseball field was last used, so Softball → Baseball goes back to it.
    if (LEAGUES[key].sport === 'baseball') store.set('baseballLeague', key);
    state.leadoffs = store.get('leadoffs.' + key, LEAGUES[key].leadoffs);
    $('#leadoffs').checked = state.leadoffs;
    setGeometry();
    renderSport();
  }
  function renderSport() {
    const sport = LEAGUES[state.league].sport;
    for (const b of $$('#sport-seg button')) {
      b.classList.toggle('on', b.dataset.sport === sport);
      b.setAttribute('aria-pressed', String(b.dataset.sport === sport));
    }
  }
  leagueSel.addEventListener('change', () => setLeague(leagueSel.value));
  for (const b of $$('#sport-seg button')) {
    b.addEventListener('click', () => {
      if (LEAGUES[state.league].sport === b.dataset.sport) return;
      setLeague(b.dataset.sport === 'softball' ? 'softball' : store.get('baseballLeague', 'littleLeague'));
    });
  }
  renderSport();
  $('#leadoffs').checked = state.leadoffs;
  $('#leadoffs').addEventListener('change', (e) => { state.leadoffs = e.target.checked; store.set('leadoffs.' + state.league, state.leadoffs); rerun(); if (!state.lastEvent) showReady(); });
  $('#show-paths').checked = state.showPaths;
  $('#show-paths').addEventListener('change', (e) => { state.showPaths = e.target.checked; store.set('showPaths', state.showPaths); view.setShowPaths(state.showPaths); });
  $('#btn-settings').addEventListener('click', () => openSheet(settings));
  $('#version').textContent = VERSION;

  function openSheet(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function closeSheet(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  for (const d of [lib, settings]) {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) closeSheet(d); });
  }

  // Projector mode
  function toggleProjector() {
    const on = !document.body.classList.contains('projector');
    document.body.classList.toggle('projector', on);
    try {
      if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* not supported (iPhone) */ }
  }
  $('#btn-projector').addEventListener('click', toggleProjector);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('projector'); });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (document.querySelector('dialog[open]')) return; // a sheet is open: its own keys only
    if ((e.key === 't' || e.key === 'T') && !board.on) { window.TeamUI.openTeam(); return; }
    if ((e.key === 'f' || e.key === 'F') && tester.on && state.plan && !board.on) { openReport(); return; }
    if (e.key === 'w' || e.key === 'W') { board.on ? closeBoard() : openBoard(); return; }
    if (board.on) {
      const tools = { m: 'move', d: 'pen', a: 'arrow', e: 'eraser' };
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoBoard() : undoBoard(); }
      else if (tools[e.key.toLowerCase()]) { board.tool = tools[e.key.toLowerCase()]; renderBoardBar(); }
      else if (e.key === 'Escape' || e.key === 'Enter') closeBoard();
      return;
    }
    if (e.key === ' ') { e.preventDefault(); $('#btn-play').click(); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && state.plan && !e.shiftKey) {
      // Step through the play a quarter second at a time.
      stop();
      const dur = state.plan.timeline.duration;
      state.t = Math.max(0, Math.min(dur, state.t + (e.key === 'ArrowRight' ? 0.25 : -0.25)));
      view.seek(state.t);
      updateTransport();
    }
    else if (e.key === 'n' || e.key === 'N' || (e.key === 'ArrowRight' && e.shiftKey)) runScenario(state.scenarioIndex + 1);
    else if (e.key === 'ArrowLeft' && e.shiftKey) runScenario(state.scenarioIndex - 1);
    else if (e.key === 'p' || e.key === 'P') toggleProjector();
    else if (e.key === 'r' || e.key === 'R') showReady();
    else if (e.key === 'Escape') setSpotlight(null);
  });

  function setGeometry() {
    geo = window.Field.geometry(state.league);
    view.setGeometry(geo);
    view.setShowPaths(state.showPaths);
    applyLabels();
    showReady();
  }

  // -------------------------------------------------------------------------------------------
  // Tester mode: "Something wrong?" reports, sent to the tester's Google Sheet (or copied)
  // -------------------------------------------------------------------------------------------
  const PL = window.PlayLog;

  function setTester(on) {
    tester.on = on;
    store.set('tester', on);
    $('#tester').hidden = !on;
    updateTransport();
  }

  // Five taps on the version number turns tester mode on.
  let taps = 0, tapTimer = 0;
  $('#version').addEventListener('click', () => {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 5) { taps = 0; setTester(true); $('#tester-url').focus(); }
  });
  $('#tester-url').value = tester.url;
  $('#tester-url').addEventListener('change', (e) => { tester.url = e.target.value.trim(); store.set('testerUrl', tester.url); });
  $('#tester-off').addEventListener('click', () => setTester(false));
  $('#tester').hidden = !tester.on;

  function replayUrl(code) {
    return location.href.split('#')[0] + '#replay=' + code;
  }

  function buildReport(said, positions) {
    const e = state.entry;
    const leagueLabel = LEAGUES[e.situation.league] ? LEAGUES[e.situation.league].label : e.situation.league;
    const ua = (navigator.userAgent.match(/(iPhone|iPad|Android|Macintosh|Windows)[^;)]*/) || [''])[0];
    return {
      app: 'simple-fielding',
      id: 'r' + Date.now().toString(36),
      version: VERSION,
      said,
      positions,
      situationText: PL.situationText(e.situation, leagueLabel),
      eventText: PL.eventText(e.event),
      didText: PL.didText(state.plan),
      replay: replayUrl(e.replay),
      device: `${ua} ${window.innerWidth}x${window.innerHeight}`.trim(),
      play: e,
    };
  }

  function reportText(r) {
    return [
      `SF-REPORT ${r.id} v${r.version}`,
      `said: ${r.said}`,
      r.positions.length ? `players: ${r.positions.join(', ')}` : '',
      `play: ${r.play.title}`,
      `situation: ${r.situationText}`,
      `event: ${r.eventText}`,
      `did: ${r.didText.replace(/\n/g, ' | ')}`,
      `replay: ${r.replay}`,
    ].filter(Boolean).join('\n');
  }

  async function sendReport(r) {
    if (!tester.url) throw new Error('no address');
    const body = JSON.stringify(r);
    // text/plain keeps this a "simple" request: no CORS preflight, which Apps Script can't answer.
    const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    let res;
    try {
      res = await fetch(tester.url, { method: 'POST', body, headers });
    } catch (err) {
      // The reply couldn't be read (CORS on the redirect). Send it blind: Apps Script still records it.
      await fetch(tester.url, { method: 'POST', body, headers, mode: 'no-cors' });
      return 'sent-unconfirmed';
    }
    const j = await res.json().catch(() => null);
    if (j && j.ok === false) throw new Error(j.error || 'rejected');
    return j && j.ok ? 'sent' : 'sent-unconfirmed';
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      if (navigator.share) { try { await navigator.share({ text }); return true; } catch (err) { return false; } }
      return false;
    }
  }

  const report = $('#report');
  function openReport() {
    if (!state.plan || !state.entry) return;
    stop();
    const e = state.entry;
    const leagueLabel = LEAGUES[e.situation.league] ? LEAGUES[e.situation.league].label : '';
    $('#report-play').textContent = `${e.title} — ${PL.situationText(e.situation, leagueLabel)}`;
    const pos = $('#report-pos');
    pos.innerHTML = '';
    for (const p of [...POSITIONS, 'Runners', 'Ball']) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = p; b.dataset.pos = p;
      b.addEventListener('click', () => b.classList.toggle('on'));
      pos.appendChild(b);
    }
    $('#report-status').textContent = '';
    $('#report-send').disabled = false;
    $('#report-send').textContent = tester.url ? 'Send report' : 'Copy report';
    $('#report-copy').hidden = !tester.url;
    openSheet(report);
    $('#report-said').focus();
  }
  function reportInput() {
    return buildReport($('#report-said').value.trim(), $$('#report-pos button.on').map((b) => b.dataset.pos));
  }
  $('#btn-report').addEventListener('click', openReport);
  report.addEventListener('click', (e) => { if (e.target === report || e.target.closest('[data-close]')) closeSheet(report); });
  $('#report-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = reportInput();
    const status = $('#report-status');
    if (!r.said) { status.textContent = 'Say what should have happened first.'; $('#report-said').focus(); return; }
    if (!tester.url) {
      status.textContent = (await copyText(reportText(r))) ? 'Copied. Paste it into the chat.' : "Couldn't copy.";
      return;
    }
    $('#report-send').disabled = true;
    status.textContent = 'Sending…';
    try {
      const how = await sendReport(r);
      status.textContent = how === 'sent' ? `Sent (${r.id}). Thanks!` : `Sent (${r.id}). It should be in the Sheet in a moment.`;
      $('#report-said').value = '';
      setTimeout(() => closeSheet(report), 1400);
    } catch (err) {
      status.textContent = `Couldn't send (${err.message}). Use "Copy instead".`;
      $('#report-send').disabled = false;
    }
  });
  $('#report-copy').addEventListener('click', async () => {
    const r = reportInput();
    $('#report-status').textContent = (await copyText(reportText(r))) ? 'Copied.' : "Couldn't copy.";
  });
  $('#tester-test').addEventListener('click', async () => {
    const st = $('#tester-status');
    if (!tester.url) { st.textContent = 'Paste the address first.'; return; }
    if (!state.plan) { hitTo({ x: -80, y: 135 }); stop(); }
    st.textContent = 'Sending…';
    try {
      const how = await sendReport(buildReport('Test report from the settings screen. Ignore.', []));
      st.textContent = how === 'sent' ? 'It worked. Check the Sheet.' : "Sent, but the reply couldn't be read here. Check the Sheet.";
    } catch (err) { st.textContent = `That didn't work: ${err.message}`; }
  });

  // Open a play from a replay link (#replay=r1...) or turn tester mode on from a link (#tester or #tester=URL).
  function fromHash() {
    const h = location.hash.slice(1);
    if (h.startsWith('tester')) {
      const url = decodeURIComponent(h.split('=').slice(1).join('='));
      if (url) { tester.url = url; store.set('testerUrl', url); $('#tester-url').value = url; }
      setTester(true);
      history.replaceState(null, '', location.href.split('#')[0]);
      return;
    }
    if (!h.startsWith('replay=')) return;
    const r = PL.decodeReplay(h.slice(7));
    if (!r) return;
    const s = r.situation;
    if (s.league && LEAGUES[s.league] && s.league !== state.league) {
      setLeague(s.league);
    }
    state.runners = Object.assign({ first: false, second: false, third: false }, s.runners);
    state.outs = s.outs || 0;
    state.batter = s.batter === 'L' ? 'L' : 'R';
    if (typeof s.leadoffs === 'boolean') { state.leadoffs = s.leadoffs; $('#leadoffs').checked = s.leadoffs; }
    if (r.event.at) { state.kind = r.event.kind; state.result = r.event.result || 'auto'; }
    renderSituation();
    runEvent(r.event);
  }
  window.addEventListener('hashchange', fromHash);

  // Test hook: lets the Playwright suite drive plays without synthesising drags.
  window.SimpleFielding = { state, team, board, tester, openReport, buildReport, reportText, openBoard, closeBoard, runEvent, runScenario, hitTo, seekEnd() { if (state.plan) { stop(); state.t = state.plan.timeline.duration; view.seek(state.t); updateTransport(); } } };

  window.TeamUI.init({ team, onChange: (t) => { T.save(window.localStorage, t); applyLabels(); } });
  buildLibrary();
  setGeometry();
  renderSituation();
  fromHash();
})();
