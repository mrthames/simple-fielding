/*
 * UI: situation controls, drag-to-hit, playback, the job list.
 */
(function () {
  'use strict';

  const VERSION = '0.30.1';
  const Field = window.Field;
  const BATTED = ['ground', 'line', 'fly', 'pop', 'bunt'];
  const { POSITIONS, NAMES, LEAGUES } = Field;
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
    depth: 'auto',
    d13: 'auto',
    buntD: 'auto',
    kind: 'ground',
    result: 'auto',
    speed: store.get('speed', 1),
    showPaths: store.get('showPaths', true),
    showLooks: store.get('showLooks', true),
    plan: null,
    lastEvent: null,
    playing: false,
    t: 0,
    spotlight: null,
    scenarioIndex: -1,
    askFirst: store.get('askFirst', true),
    pm: store.get('panelMode', 'plays') === 'build' ? 'build' : 'plays',
    build: Object.assign({ what: 'pitch', result: 'caught', pickoff: 'first', ballTo: null, runners: {}, start: {} }, store.get('build', {})),
    asking: false,
    mode: 'coach', // Basic mode is off for now (2026-09-25); the code stays for when it's revisited.
  };
  if (!LEAGUES[state.league]) state.league = 'littleLeague';
  state.leadoffs = store.get('leadoffs.' + state.league, LEAGUES[state.league].leadoffs);
  state.park = store.get('park.' + state.league, null);

  const tester = { on: store.get('tester', false), url: store.get('testerUrl', '') };
  const view = new window.FieldView($('#field'));

  // ------------------------------------------------------------------------------------ 3D
  // A second renderer for the same plans. It follows everything the 2D view is told to do, whenever it's on.
  let v3 = null;
  let lastLabels = null;
  const on3d = () => !!(v3 && document.body.classList.contains('view3d'));
  function sync3d() {
    if (!on3d()) return;
    if (state.plan) { v3.load(state.plan); v3.seek(state.t); }
    else v3.showReady(window.Field.readyPositions(geo, situation()), state.runners, state.batter, state.outs);
    renderCams();
  }
  for (const name of ['load', 'seek', 'showReady', 'setGeometry', 'setLabels']) {
    const orig = view[name].bind(view);
    view[name] = (...args) => {
      const out = orig(...args);
      if (name === 'setLabels') lastLabels = args[0];
      if (on3d()) {
        if (name === 'setLabels') v3.setLabels(args[0]);
        else if (name === 'setGeometry') { v3.setGeometry(args[0]); sync3d(); }
        else if (name === 'showReady') v3.showReady(args[0], args[1], state.batter, state.outs);
        else if (name === 'load') { v3.load(args[0]); renderCams(); }
        else v3.seek(args[0]);
      }
      return out;
    };
  }
  function loadThree(cb) {
    if (window.THREE) return cb();
    const s = document.createElement('script');
    s.src = 'vendor/three.min.js';
    s.onload = cb;
    s.onerror = () => toast("Couldn't load the 3D view.");
    document.head.appendChild(s);
  }
  function renderCams() {
    if (!v3) return;
    const sel = $('#cam');
    const cur = v3.mode;
    sel.innerHTML = '';
    const add = (parent, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; parent.appendChild(o); };
    add(sel, 'broadcast', 'Behind home plate');
    add(sel, 'overhead', 'Overhead');
    const og = document.createElement('optgroup');
    og.label = 'Be the player';
    for (const r of v3.riders()) add(og, r.key, r.label);
    sel.appendChild(og);
    sel.value = [...sel.querySelectorAll('option')].some((o) => o.value === cur) ? cur : 'broadcast';
    if (sel.value !== cur) v3.setMode(sel.value);
  }
  function set3d(on) {
    $('#btn-3d').setAttribute('aria-pressed', String(on));
    store.set('view3d', on);
    if (!on) {
      document.body.classList.remove('view3d');
      $('#cam-bar').hidden = true;
      if (v3) v3.show(false);
      return;
    }
    if (board.on) closeBoard();
    loadThree(() => {
      try {
        if (!v3) {
          v3 = new window.Field3D($('#field-wrap'));
          if (lastLabels) v3.setLabels(lastLabels);
          v3.setGeometry(geo);
          wire3dScrub(v3.canvas);
        }
        // The level or park may have changed while 3D was off: rebuild the field if so.
        if (v3.geo !== geo) v3.setGeometry(geo);
        document.body.classList.add('view3d');
        v3.show(true);
        $('#cam-bar').hidden = false;
        window.Field3D.vrSupported().then((ok) => { $('#btn-vr').hidden = !ok; });
        sync3d();
      } catch (e) {
        toast('3D needs WebGL, which this browser has turned off.');
        $('#btn-3d').setAttribute('aria-pressed', 'false');
      }
    });
  }
  // Drag left or right on the 3D view to scrub the play, like the 2D field.
  function wire3dScrub(canvas) {
    let d = null;
    canvas.addEventListener('pointerdown', (e) => { if (!state.plan) return; stop(); endAsk(); d = { x: e.clientX, t: state.t, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dur = state.plan.timeline.duration;
      state.t = Math.max(0, Math.min(dur, d.t + (e.clientX - d.x) / canvas.clientWidth * dur * 1.2));
      view.seek(state.t);
      updateTransport();
    });
    const end = () => { d = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }
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
    return { runners: Object.assign({}, state.runners), outs: state.outs, batter: state.batter, depth: state.depth !== 'auto' ? state.depth : undefined,
      d13: state.d13 !== 'auto' ? state.d13 : undefined, buntD: state.buntD !== 'auto' ? state.buntD : undefined, league: state.league, park: state.park || undefined, leadoffs: state.leadoffs,
      start: state.pm === 'build' && Object.keys(state.build.start).length ? state.build.start : undefined };
  }

  // -------------------------------------------------------------------------------------------
  // Situation controls
  // -------------------------------------------------------------------------------------------
  function renderSituation() {
    for (const b of $$('.mini-base')) b.classList.toggle('on', !!state.runners[b.dataset.base]);
    const dots = $$('#outs span');
    dots.forEach((d, i) => d.classList.toggle('on', i < state.outs));
    $('#outs').setAttribute('aria-label', `${state.outs} out${state.outs === 1 ? '' : 's'}`);
    const on = ['first', 'second', 'third'].filter((k) => state.runners[k]);
    const ord = { first: '1st', second: '2nd', third: '3rd' };
    const bases = on.length === 3 ? 'Bases loaded' : on.length ? `Runner${on.length > 1 ? 's' : ''} on ${on.map((k) => ord[k]).join(' & ')}` : 'Nobody on';
    $('#sit-strip').textContent = `${state.outs} out${state.outs === 1 ? '' : 's'} · ${bases}${state.batter === 'L' ? ' · Lefty batting' : ''}`;
    const ptSit = $('#play-title .pt-sit');
    if (ptSit) ptSit.textContent = $('#sit-strip').textContent;
    for (const b of $$('#batter-seg button')) b.classList.toggle('on', b.dataset.batter === state.batter);
    for (const b of $$('#depth-seg button')) b.classList.toggle('on', b.dataset.depth === state.depth);
    for (const b of $$('#d13-seg button')) b.classList.toggle('on', b.dataset.d13 === state.d13);
    for (const b of $$('#buntd-seg button')) b.classList.toggle('on', b.dataset.buntd === state.buntD);
    document.body.classList.toggle('kind-bunt', state.kind === 'bunt');
    for (const b of $$('#kind-chips button')) b.classList.toggle('on', b.dataset.kind === state.kind);
    for (const b of $$('#result-chips button')) b.classList.toggle('on', b.dataset.result === state.result);
    // Other plays only make sense with the right runners on.
    const r = state.runners;
    const softball = LEAGUES[state.league].sport === 'softball';
    const need = {
      steal2: r.first && !r.second, steal3: r.second && !r.third, firstThirdSteal: r.first && r.third && !r.second,
      passedBall: r.first || r.second || r.third, primaryLead: r.first || (softball && (r.second || r.third)), secondaryLead: r.first,
      delayedSteal: r.first && r.third, droppedThird: true, rundown: r.first || r.second || r.third,
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
      primaryLead: 'Put a runner on 1st', secondaryLead: 'Put a runner on 1st', delayedSteal: 'Put runners on 1st and 3rd', rundown: 'Put a runner on base (the lead runner gets caught)',
    }[play];
  }

  function toggleRunner(base) {
    state.runners[base] = !state.runners[base];
    situationChanged();
  }

  function situationChanged() {
    if (board.on) closeBoard();
    renderSituation();
    if (state.pm === 'build') { renderBuild(); showReady(); return; }
    // Flip between variations of the same hit: re-run it with the new runners or outs.
    if (state.lastEvent && state.lastEvent.at && BATTED.includes(state.lastEvent.kind)) rerunHit();
    else showReady();
  }

  function showReady() {
    stop();
    state.plan = null;
    state.lastEvent = null;
    const building = state.pm === 'build';
    view.showReady(window.Field.readyPositions(geo, situation()), state.runners,
      building && state.build.what !== 'hit' ? buildLeads() : null,
      building && state.build.what === 'pitch' && (state.build.result === 'passed' || state.build.result === 'dropped') ? (state.build.ballTo || DEFAULT_BALL_TO()) : null);
    svg.classList.toggle('building', building);
    const hint = $('#field-hint .fh-text');
    if (hint) hint.textContent = !building || state.build.what === 'hit' ? "Drag the ball from home plate to where it's hit"
      : state.build.what === 'pickoff' ? 'Set the lead, then press Set play'
      : state.build.result === 'passed' || state.build.result === 'dropped' ? 'Tap where the ball ends up, then Set play'
      : 'Set the runners, then press Set play';
    $('#field-hint').classList.toggle('top', building && state.build.what !== 'hit');
    view.showRollHandle(null);
    $('#result').hidden = true;
    $('#tv-caption').textContent = '';
    renderMarks(null);
    $('#play-title').hidden = true;
    $('#field-hint').hidden = false;
    setSpotlight(null);
    updateTransport();
  }

  // -------------------------------------------------------------------------------------------
  // Running a play
  // -------------------------------------------------------------------------------------------
  // The spot a grounder reached the infield: drag from there to show it getting through.
  function rollHandleAt() {
    const e = state.lastEvent;
    if (!state.plan || !e || e.kind !== 'ground' || !e.at) return null;
    if (Math.hypot(e.at.x, e.at.y) >= geo.infieldEdge) return null;
    return e.at;
  }

  function runEvent(event, opts) {
    if (board.on) closeBoard();
    clearInkOnNewPlay();
    const ev = Object.assign({}, event);
    if (ev.at && BATTED.includes(ev.kind) && state.result !== 'auto' && !ev.result) ev.result = state.result;
    // A grounder at an infielder called a hit: it gets through, on the same line into the outfield.
    if (ev.kind === 'ground' && ev.at && !ev.through && /^(single|double|triple)$/.test(ev.result || '')) {
      const d = Math.hypot(ev.at.x, ev.at.y);
      if (d > 8 && d < geo.infieldEdge && Math.abs(ev.at.x) <= ev.at.y) {
        const reach = (ev.result === 'single' ? 135 : 175) * (geo.base / 60);
        ev.through = { x: Math.round(ev.at.x / d * reach * 10) / 10, y: Math.round(ev.at.y / d * reach * 10) / 10 };
      }
    }
    const plan = window.Engine.planPlay(situation(), ev);
    state.plan = plan;
    // Every play is logged (last 50, on the device) so a tester can report it exactly.
    try { state.entry = window.PlayLog.record(window.localStorage, window.PlayLog.entry(plan, situation(), ev, VERSION)); }
    catch (e) { state.entry = window.PlayLog.entry(plan, situation(), ev, VERSION); }
    state.lastEvent = event;
    state.playName = (opts && opts.name) || null;
    // A play that isn't a hit: the hit choices don't apply to it, so they're dimmed.
    document.body.classList.toggle('nohit', !(event.at && BATTED.includes(event.kind)));
    state.savedId = (opts && opts.savedId) || null;
    markQuick(-1);
    view.load(plan);
    renderResult(plan);
    view.showRollHandle(rollHandleAt());
    $('#field-hint').hidden = true;
    setTitle(plan.title);
    setSpotlight(state.spotlight);
    state.t = 0;
    const auto = !opts || opts.autoplay !== false;
    if (auto && state.askFirst) {
      // Ask the team first: freeze at the hit, paths hidden, until Play.
      state.asking = true;
      view.setShowPaths(false);
      view.seek(0);
      setTitle($('#play-title .pt-name') ? $('#play-title .pt-name').textContent : state.plan.title);
      updateTransport();
    } else {
      endAsk();
      if (auto) play();
      else updateTransport();
    }
  }

  function endAsk() {
    if (!state.asking) return;
    state.asking = false;
    view.setShowPaths(state.showPaths);
    const ask = $('#play-title .pt-ask');
    if (ask) ask.hidden = true;
  }
  // The title card: the play's name, and while asking, the question under it.
  function setTitle(name) {
    const t = $('#play-title');
    t.innerHTML = '<span class="pt-name"></span><span class="pt-ask" hidden>Where does everybody go? <span class="pt-quiz">Drag a player to answer.</span></span><span class="pt-sit"></span>';
    t.querySelector('.pt-name').textContent = name;
    t.querySelector('.pt-sit').textContent = $('#sit-strip').textContent;
    t.querySelector('.pt-ask').hidden = !state.asking;
    t.hidden = false;
  }
  function setAskFirst(on) {
    state.askFirst = on;
    store.set('askFirst', on);
    $('#btn-ask').setAttribute('aria-pressed', String(on));
    if (!on) endAsk();
  }
  $('#btn-ask').addEventListener('click', () => setAskFirst(!state.askFirst));
  $('#btn-3d').addEventListener('click', () => set3d(!on3d()));
  $('#cam').addEventListener('change', (e) => { if (v3) { v3.setMode(e.target.value); v3.seek(state.t); } });
  // VR: the headset drives the frames, so playback advances from its loop. The trigger plays (or replays) the play.
  $('#btn-vr').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!v3) return;
    stop();   // the headset's loop drives playback while you're in VR
    try {
      await v3.enterVR((dt) => {
        if (!state.playing || !state.plan) return;
        state.t = Math.min(state.plan.timeline.duration, state.t + dt * state.speed);
        view.seek(state.t);
        if (state.t >= state.plan.timeline.duration) { state.playing = false; updateTransport(); }
      }, () => {
        if (!state.plan) return;
        endAsk();
        if (state.t >= state.plan.timeline.duration) state.t = 0;
        state.playing = !state.playing;
        updateTransport();
      });
    } catch (err) { toast("Couldn't start VR on this device."); }
  });
  // Next: through My plays when a saved play is open (a playlist for the team meeting), otherwise the play list.
  function nextPlay(step = 1) {
    const mine = window.Share.list(localStorage);
    const i = state.savedId ? mine.findIndex((p) => p.id === state.savedId) : -1;
    if (i >= 0 && mine.length > 1) {
      const p = mine[(i + step + mine.length) % mine.length];
      openCode(p.code, p.name, p.id);
      return;
    }
    runScenario(state.scenarioIndex + step);
  }
  $('#field-next').addEventListener('click', () => nextPlay(1));

  // Markers under the timeline for the moments that matter; tap one to jump there (a beat before it happens).
  function renderMarks(plan) {
    const box = $('#scrub-marks');
    box.innerHTML = '';
    if (!plan) return;
    const dur = plan.timeline.duration;
    const words = { throw: 'Throw', out: 'Out', safe: 'Safe', catch: 'Caught', hold: 'Holds', note: 'Note' };
    const seen = [];
    for (const e of plan.timeline.events) {
      if (!words[e.type] || seen.some((t) => Math.abs(t - e.t) < dur * 0.02)) continue;
      seen.push(e.t);
      const m = document.createElement('button');
      m.type = 'button';
      m.className = 'scrub-mark ' + e.type;
      m.style.left = `${(e.t / dur) * 100}%`;
      m.title = `${words[e.type]} — ${e.t.toFixed(1)} s`;
      m.setAttribute('aria-label', m.title);
      m.addEventListener('click', () => { stop(); endAsk(); state.t = Math.max(0, e.t - 0.25); view.seek(state.t); updateTransport(); });
      box.appendChild(m);
    }
  }

  function renderResult(plan) {
    renderMarks(plan);
    if (state.autoSpeak && canSpeak) setTimeout(() => { if (state.plan === plan) speakPlay(); }, 50);
    $('#result').hidden = false;
    $('#result-title').textContent = plan.title;
    $('#result-summary').textContent = plan.summary;
    // Projector / TV: the teaching point beside the field.
    $('#tv-caption').textContent = plan.summary + (plan.notes && plan.notes[0] ? '\n\n' + plan.notes[0] : '');
    const notes = $('#result-notes');
    notes.innerHTML = '';
    for (const n of plan.notes) {
      const li = document.createElement('li');
      li.textContent = n;
      notes.appendChild(li);
    }
    $('#result').classList.toggle('drawn', !!plan.drawn);
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
    endAsk();
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
    // Next appears on the field once a play has finished.
    const next = !!(state.plan && done && !state.playing && !board.on);
    $('#field-next').hidden = !next;
    $('#field-wrap').classList.toggle('has-next', next);
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
    if (on3d()) set3d(false);
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
    if (drawing) { const d = drawing; drawing = null; document.body.classList.remove('drawing'); $('#draw-bar').hidden = true; board.on = false;
      view.setBoardMode(false); document.body.classList.remove('board-on'); $('#board-bar').hidden = true; $('#btn-board').setAttribute('aria-pressed', 'false');
      finishDrawing(d); return; }
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
    if (drawing) syncStep();
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
    if (drawing) syncStep();
    renderBoardBar();
  }
  function redoBoard() {
    if (!board.redo.length) return;
    board.undo.push(clone(board.state));
    board.state = board.redo.pop();
    view.showBoard(board.state);
    if (drawing) syncStep();
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
    const handle = rollHandleAt();
    if (handle && Math.hypot(p.x - handle.x, p.y - handle.y) < 11 * view.us) {
      stop();
      drag = { id: e.pointerId, start: p, fromRoll: handle, moved: false, at: p, cx: e.clientX };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('dragging');
      e.preventDefault();
      return;
    }
    const nearPlate = Math.hypot(p.x, p.y - 1) < 16 * view.us;
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
        endAsk();
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
    if (drag.fromRoll) {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.moved = true;
      if (drag.moved) view.showDrag(drag.fromRoll, p, 'ground');
      return;
    }
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) { drag.moved = true; clearTimeout(drag.hold); }
    // A drag that doesn't start at home plate scrubs the play (a drag from the plate hits the ball).
    if (drag.moved && !drag.fromPlate && state.plan && !drag.scrub) {
      stop();
      endAsk();
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
    if (d.fromRoll) {
      if (d.moved) {
        const through = { x: Math.round(d.at.x * 10) / 10, y: Math.round(d.at.y * 10) / 10 };
        runEvent({ kind: 'ground', at: d.fromRoll, through });
        state.lastEvent = { kind: 'ground', at: d.fromRoll, through };
      } else if (state.plan) replay();
      return;
    }
    if (cancelled) return;
    if (d.fromPlate && d.moved) {
      if (state.pm === 'build' && state.build.what !== 'hit') { state.build.what = 'hit'; saveBuild(); renderBuild(); }
      hitTo(d.at);
    } else if (!d.moved && state.pm === 'build' && !state.plan && state.build.what !== 'hit') {
      // Building a pitch play: a tap near or behind the plate says where a passed ball ends up.
      if (state.build.what === 'pitch' && d.at.y < 25) {
        if (state.build.result !== 'dropped') state.build.result = 'passed';
        state.build.ballTo = { x: Math.round(d.at.x * 2) / 2, y: Math.round(Math.max(d.at.y, geo.backstop + 2) * 2) / 2 };
        saveBuild(); renderBuild(); showReady();
      }
    } else if (!d.moved && !d.fromPlate) {
      // A plain tap on an empty field hits the ball there (easier with a mouse). Once a play is loaded a tap
      // is a coach pointing at something, so it never throws the play away.
      if (state.spotlight) { setSpotlight(null); return; }
      if (!state.plan && Math.hypot(d.at.x, d.at.y) > 12) hitTo(d.at);
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
  for (const b of $$('#depth-seg button')) b.addEventListener('click', () => { state.depth = b.dataset.depth; situationChanged(); });
  for (const b of $$('#d13-seg button')) b.addEventListener('click', () => {
    state.d13 = b.dataset.d13; renderSituation();
    if (state.lastEvent && state.lastEvent.kind === 'firstThirdSteal') runEvent({ kind: 'firstThirdSteal' });
  });
  for (const b of $$('#buntd-seg button')) b.addEventListener('click', () => { state.buntD = b.dataset.buntd; renderSituation(); rerunHit(); });
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
      if ((play === 'primaryLead' && !(LEAGUES[state.league].sport === 'softball' && (r.second || r.third))) || play === 'secondaryLead') r.first = true;
      if (play === 'delayedSteal') { r.first = true; r.third = true; }
      if (play === 'rundown' && !(r.first || r.second || r.third)) r.first = true;
      renderSituation();
      runEvent({ kind: play });
      scrollToResultOnPhone();
    });
  }

  // Changing the hit type or result re-runs the last batted ball, so a coach can compare.
  function rerunHit() {
    const e = state.lastEvent;
    if (!e || !e.at || !BATTED.includes(e.kind)) return;
    if (state.kind === 'ground' && e.through) runEvent({ kind: 'ground', at: e.at, through: e.through });
    else runEvent({ kind: state.kind, at: e.at });
  }
  function rerun() {
    if (!state.lastEvent) return;
    if (state.lastEvent.at && BATTED.includes(state.lastEvent.kind)) rerunHit();
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
    // Read the slider before stop(): stopping redraws the slider at the old time.
    const v = Number(e.target.value);
    stop();
    state.t = (v / 1000) * state.plan.timeline.duration;
    view.seek(state.t);
    updateTransport();
  });
  // Phones: one button cycles the speed.
  const speedLabel = (v) => ({ 0.25: '¼×', 0.5: '½×', 1: '1×' })[v] || '1×';
  $('#speed-cycle').textContent = speedLabel(state.speed);
  $('#speed-cycle').addEventListener('click', () => {
    const order = [1, 0.5, 0.25];
    state.speed = order[(order.indexOf(state.speed) + 1) % order.length];
    store.set('speed', state.speed);
    $('#speed-cycle').textContent = speedLabel(state.speed);
    for (const x of $$('.transport .seg button')) x.classList.toggle('on', Number(x.dataset.speed) === state.speed);
  });
  for (const b of $$('.transport .seg button')) {
    b.classList.toggle('on', Number(b.dataset.speed) === state.speed);
    b.addEventListener('click', () => {
      state.speed = Number(b.dataset.speed);
      store.set('speed', state.speed);
      for (const x of $$('.transport .seg button')) x.classList.toggle('on', x === b);
      $('#speed-cycle').textContent = speedLabel(state.speed);
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

  // The list's plays are written for a 60 ft field with a 200 ft fence. Infield spots scale with the bases;
  // outfield spots scale with this field's fence in that direction, so a "single to left" lands in front of the
  // left fielder on every field, and a gap double reaches the gap.
  function scaleSpot(p) {
    const r = Math.hypot(p.x, p.y);
    const k = geo.base / 60;
    const f = Field.isFair(p) ? geo.fenceAt(p) / 200 : k;
    const t = Math.max(0, Math.min(1, (r - 110) / 40));
    const s = k + (f - k) * t;
    return { x: Math.round(p.x * s * 10) / 10, y: Math.round(p.y * s * 10) / 10 };
  }

  // The 90 ft plays are written for a standard pro-size field. Outfield spots follow this field's own fence, so a
  // gap double stays a gap double at 13U-14U and in every park.
  const PRO = Field.geometry('pro');
  function scaleAbs(p) {
    const r = Math.hypot(p.x, p.y);
    if (!Field.isFair(p) || r < 170) return { ...p };
    const f = geo.fenceAt(p) / PRO.fenceAt(p);
    const s = 1 + (f - 1) * Math.min(1, (r - 170) / 60);
    return { x: Math.round(p.x * s * 10) / 10, y: Math.round(p.y * s * 10) / 10 };
  }

  function runScenario(idx) {
    const all = window.Scenarios.ALL;
    // Skip plays that don't belong on this field, in whichever direction we're stepping.
    const step = idx < state.scenarioIndex ? -1 : 1;
    let i = (idx + all.length) % all.length;
    for (let n = 0; n < all.length && !window.Scenarios.fits(all[i], state.league); n++) i = (i + step + all.length) % all.length;
    const sc = all[i];
    state.scenarioIndex = i;
    state.runners = Object.assign({ first: false, second: false, third: false }, sc.runners);
    state.outs = sc.outs || 0;
    if (sc.batter) state.batter = sc.batter;
    else if (state.mode === 'basic') state.batter = 'R';
    if (sc.leadoffs && !state.leadoffs && geo.league.sport === 'baseball') {
      // Leads only exist where leadoffs are allowed; switch them on for this play.
      state.leadoffs = true;
      $('#leadoffs').checked = true;
    }
    const ev = Object.assign({}, sc.event);
    if (ev.at && BATTED.includes(ev.kind)) {
      ev.at = sc.abs ? scaleAbs(ev.at) : scaleSpot(ev.at);
      state.kind = ev.kind;
      state.result = ev.result || 'auto';
    }
    renderSituation();
    runEvent(ev);
    setTitle(sc.name);
    state.playName = sc.name;
    markQuick(state.scenarioIndex);
    scrollToResultOnPhone();
  }

  // Basic mode: the plays as a quick-pick list in the panel.
  function buildQuick() {
    const list = $('#quick-list');
    list.innerHTML = '';
    // Each group's first index in Scenarios.ALL; a field's own plays are listed first.
    let start = 0;
    const groups = window.Scenarios.GROUPS.map((g) => { const o = { g, start }; start += g.items.length; return o; })
      .filter(({ g }) => !g.levels || g.levels.includes(state.league))
      .sort((a, b) => (b.g.levels ? 1 : 0) - (a.g.levels ? 1 : 0));
    let shown = 0;
    const mine = window.Share.list(localStorage);
    if (mine.length) {
      const h = document.createElement('h4');
      h.innerHTML = 'My plays <button type="button" class="text-btn small inline" data-manage>Manage</button>';
      h.querySelector('[data-manage]').addEventListener('click', openMyPlays);
      list.appendChild(h);
      for (const p of mine) {
        const d = window.Share.decode(p.code);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lib-item mine';
        btn.dataset.mine = p.id;
        btn.setAttribute('role', 'listitem');
        btn.innerHTML = `<span>${escapeHtml(p.name)}</span>${miniSit({ runners: d.situation.runners, outs: d.situation.outs })}`;
        btn.addEventListener('click', () => openCode(p.code, p.name, p.id));
        list.appendChild(btn);
        shown++;
      }
    }
    for (const { g, start: first } of groups) {
      let i = first;
      shown += g.items.length;
      const h = document.createElement('h4');
      h.textContent = g.name;
      list.appendChild(h);
      for (const it of g.items) {
        const idx = i++;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lib-item';
        btn.dataset.idx = idx;
        btn.setAttribute('role', 'listitem');
        btn.innerHTML = `<span>${escapeHtml(it.name)}</span>${miniSit(it)}`;
        btn.addEventListener('click', () => runScenario(idx));
        list.appendChild(btn);
      }
    }
    const more = $('#quick-more');
    if (more && !$('#quick-wrap').classList.contains('open')) more.textContent = `Show all ${shown} plays ▾`;
    list.scrollTop = 0;
  }
  function markQuick(idx) {
    for (const b of $$('#quick-list .lib-item')) {
      const on = Number(b.dataset.idx) === idx;
      b.classList.toggle('on', on);
      if (on) {
        // Keep the picked play in view inside the list, without scrolling the page.
        const list = $('#quick-list');
        const top = b.offsetTop - list.offsetTop;
        if (top < list.scrollTop || top + b.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - 30;
      }
    }
  }
  $('#quick-next').addEventListener('click', () => nextPlay(1));
  function quickEdge() {
    const l = $('#quick-list');
    $('#quick-wrap').classList.toggle('at-end', l.scrollTop + l.clientHeight >= l.scrollHeight - 4);
  }
  $('#quick-list').addEventListener('scroll', quickEdge, { passive: true });
  $('#quick-more').addEventListener('click', () => {
    const open = $('#quick-wrap').classList.toggle('open');
    $('#quick-more').setAttribute('aria-expanded', String(open));
    $('#quick-more').textContent = open ? 'Show fewer ▴' : `Show all ${$$('#quick-list .lib-item').length} plays ▾`;
  });

  function setMode(mode) {
    state.mode = mode === 'coach' ? 'coach' : 'basic';
    store.set('mode', state.mode);
    const basic = state.mode === 'basic';
    if (basic) {
      if (board.on) closeBoard();
      // Basic has no batter, result or leadoff controls: put them back to their plain defaults.
      state.batter = 'R';
      if (state.result !== 'auto') { state.result = 'auto'; renderSituation(); }
    }
    document.body.classList.toggle('mode-basic', basic);
    for (const b of $$('#mode-seg button')) {
      b.classList.toggle('on', b.dataset.mode === state.mode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    }
  }
  for (const b of $$('#mode-seg button')) b.addEventListener('click', () => setMode(b.dataset.mode));

  $('#btn-library').addEventListener('click', () => openSheet(lib));

  // Settings
  const settings = $('#settings');
  const leagueSel = $('#league');
  const GROUPS = [
    ['Youth baseball', ['littleLeague', 'intermediate']],
    ['Baseball, 90 ft', ['junior90', 'highSchool', 'college', 'pro']],
    ['Fastpitch softball', ['softball8', 'softball10', 'softball', 'softball14', 'softballHS', 'softballCollege', 'softballPro']],
  ];
  for (const [name, keys] of GROUPS) {
    const og = document.createElement('optgroup');
    og.label = name;
    for (const k of keys) {
      if (!LEAGUES[k]) continue;
      const o = document.createElement('option');
      o.value = k; o.textContent = LEAGUES[k].label;
      og.appendChild(o);
    }
    leagueSel.appendChild(og);
  }
  const parkSel = $('#park');
  function renderParks() {
    const parks = Field.parksFor(state.league);
    $('#park-row').hidden = !parks.length;
    parkSel.innerHTML = '';
    const add = (parent, value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; parent.appendChild(o); };
    add(parkSel, '', state.league === 'littleLeague' ? 'Standard field (200 ft)' : 'Standard field');
    const now = parks.filter((p) => !p.historical), then = parks.filter((p) => p.historical);
    const sorted = (list) => list.slice().sort((a, b) => (a.team + a.park).localeCompare(b.team + b.park));
    for (const [label, list] of [[state.league === 'littleLeague' ? 'Little League World Series' : 'Major League parks', sorted(now)], ['Former parks', sorted(then)]]) {
      if (!list.length) continue;
      const og = document.createElement('optgroup');
      og.label = label;
      for (const p of list) add(og, p.key, `${p.team} — ${p.park}`);
      parkSel.appendChild(og);
    }
    if (state.park && !parks.find((p) => p.key === state.park)) state.park = null;
    parkSel.value = state.park || '';
  }
  parkSel.addEventListener('change', () => {
    state.park = parkSel.value || null;
    store.set('park.' + state.league, state.park);
    if (board.on) closeBoard();
    clearInkOnNewPlay();
    const last = state.lastEvent;
    setGeometry();
    if (last) { state.lastEvent = last; rerun(); }
  });
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
    else store.set('softballLeague', key);
    state.leadoffs = store.get('leadoffs.' + key, LEAGUES[key].leadoffs);
    $('#leadoffs').checked = state.leadoffs;
    state.park = store.get('park.' + key, null);
    renderParks();
    setGeometry();
    buildQuick();
    renderSport();
  }
  function renderSport() {
    const sport = LEAGUES[state.league].sport;
    const rules = geo ? geo.rules : {};
    // Slappers are a softball thing, from 10U up.
    $('#batter-slap').hidden = sport !== 'softball' || state.league === 'softball8';
    if (state.batter === 'S' && $('#batter-slap').hidden) { state.batter = 'R'; renderSituation(); }
    // 8U: no stealing, no leads, no pickoffs. The steal card and the builder's steal and pickoff options go away.
    document.body.classList.toggle('no-steals', rules.stealing === 'none');
    document.body.classList.toggle('softball', sport === 'softball');
    document.body.classList.toggle('no-dropped', rules.droppedThird === false);
    // Softball has no leadoffs (runners leave on the release), and the look-back rule replaces pickoffs.
    $('#leadoffs-row').hidden = sport === 'softball';
    const lead = $('#other-plays [data-play="primaryLead"]');
    if (lead) lead.textContent = sport === 'softball' ? 'Look-back rule' : 'Lead & pickoff';
    const second = $('#other-plays [data-play="secondaryLead"]');
    if (second) second.hidden = sport === 'softball';
    for (const b of $$('#sport-seg button')) {
      b.classList.toggle('on', b.dataset.sport === sport);
      b.setAttribute('aria-pressed', String(b.dataset.sport === sport));
    }
  }
  leagueSel.addEventListener('change', () => setLeague(leagueSel.value));
  for (const b of $$('#sport-seg button')) {
    b.addEventListener('click', () => {
      if (LEAGUES[state.league].sport === b.dataset.sport) return;
      setLeague(b.dataset.sport === 'softball' ? store.get('softballLeague', 'softball') : store.get('baseballLeague', 'littleLeague'));
    });
  }
  renderSport();
  $('#leadoffs').checked = state.leadoffs;
  $('#leadoffs').addEventListener('change', (e) => { state.leadoffs = e.target.checked; store.set('leadoffs.' + state.league, state.leadoffs); rerun(); if (!state.lastEvent) showReady(); });
  $('#show-looks').checked = state.showLooks;
  $('#show-looks').addEventListener('change', (e) => { state.showLooks = e.target.checked; store.set('showLooks', state.showLooks); view.setShowLooks(state.showLooks); });
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
  // Full screen, including iPad Safari's prefixed version.
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function enterFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) return el.requestFullscreen().catch(() => {});
      if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    } catch (e) { /* not supported (iPhone) */ }
  }
  function exitFullscreen() {
    try {
      if (document.exitFullscreen && document.fullscreenElement) return document.exitFullscreen().catch(() => {});
      if (document.webkitExitFullscreen && document.webkitFullscreenElement) return document.webkitExitFullscreen();
    } catch (e) { /* ignore */ }
  }
  // Projector mode stays on until the coach turns it off. If the browser drops out of full screen on its own (a
  // stray gesture, the Pencil brushing the browser's close control), the layout stays, and the next tap anywhere
  // goes straight back to full screen.
  let leavingOnPurpose = false;
  function toggleProjector() {
    const on = !document.body.classList.contains('projector');
    document.body.classList.toggle('projector', on);
    $('#fs-back').hidden = true;
    if (on) enterFullscreen();
    else { leavingOnPurpose = true; exitFullscreen(); setTimeout(() => { leavingOnPurpose = false; }, 800); }
  }
  $('#btn-projector').addEventListener('click', toggleProjector);
  function onFsChange() {
    if (fsElement()) { $('#fs-back').hidden = true; return; }
    if (!document.body.classList.contains('projector') || leavingOnPurpose) return;
    // With a keyboard and mouse, leaving full screen (Esc) is on purpose: leave projector mode too.
    if (!matchMedia('(pointer: coarse)').matches) { document.body.classList.remove('projector'); return; }
    $('#fs-back').hidden = false;
    // The next tap is a user gesture, which the browser requires to go full screen again.
    const back = () => { document.removeEventListener('pointerup', back, true); if (document.body.classList.contains('projector') && !fsElement()) enterFullscreen(); };
    document.addEventListener('pointerup', back, true);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  $('#fs-back').addEventListener('click', () => enterFullscreen());
  $('#fs-exit').addEventListener('click', () => { if (document.body.classList.contains('projector')) toggleProjector(); });

  // While drawing, or in projector mode, ignore the browser's own gestures: pinch, double-tap zoom, the
  // press-and-hold menu, and swipes that scroll or dismiss. (Drawing and dragging use pointer events, which still work.)
  const guarded = () => document.body.classList.contains('board-on') || document.body.classList.contains('projector');
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => { if (guarded()) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!guarded()) return;
    if (e.target.closest && e.target.closest('.panel, .sheet, input[type=range], select, textarea, .quick-list')) return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => { if (guarded()) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (guarded() && e.target.closest && e.target.closest('.field-wrap')) e.preventDefault(); });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (document.querySelector('dialog[open]')) return; // a sheet is open: its own keys only
    if ((e.key === 't' || e.key === 'T') && !board.on && state.mode === 'coach') { window.TeamUI.openTeam(); return; }
    if ((e.key === 'f' || e.key === 'F') && tester.on && state.plan && !board.on) { openReport(); return; }
    if ((e.key === 'w' || e.key === 'W') && (board.on || state.mode === 'coach')) { board.on ? closeBoard() : openBoard(); return; }
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
    else if (e.key === 'n' || e.key === 'N' || (e.key === 'ArrowRight' && e.shiftKey)) nextPlay(1);
    else if (e.key === 'ArrowLeft' && e.shiftKey) nextPlay(-1);
    else if (e.key === 'p' || e.key === 'P') toggleProjector();
    else if (e.key === 'r' || e.key === 'R') showReady();
    else if (e.key === 'a' || e.key === 'A') setAskFirst(!state.askFirst);
    else if (e.key === 'Escape') setSpotlight(null);
  });

  // The level and field, named on the field's color key, so a play on screen says what it's played at.
  const LEVEL_NAMES = {
    littleLeague: 'Little League', intermediate: '50/70 baseball', junior90: '13U–14U baseball',
    highSchool: 'High school baseball', college: 'College baseball', pro: 'MLB',
    softball8: '8U softball', softball10: '10U softball', softball: '12U softball', softball14: '14U softball',
    softballHS: 'High school softball', softballCollege: 'College softball', softballPro: 'Pro softball',
  };
  function renderLevel() {
    const L = LEAGUES[state.league];
    const park = state.park && Field.parksFor(state.league).find((p) => p.key === state.park);
    const team = park && park.team === 'Little League World Series' ? 'LLWS' : park && park.team;
    const where = park ? `${team} — ${park.park}` : `${L.base} ft bases`;
    $('#fk-level').textContent = `${LEVEL_NAMES[state.league] || L.label} · ${where}`;
  }
  function setGeometry() {
    geo = window.Field.geometry(state.league, state.park);
    renderLevel();
    view.setGeometry(geo);
    view.setShowPaths(state.showPaths);
    view.setShowLooks(state.showLooks);
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
  // ------------------------------------------------------------------------------------ drawing a play
  // The whiteboard, with steps: each step is where everyone is at that moment. Playback moves between them.
  let drawing = null;   // { steps: [{ dur, cap, players, runners, ball }], cur, name, savedId }
  const strip = (st) => ({ dur: st.dur || 1, cap: st.cap || '', players: clone(st.players), runners: clone(st.runners), ball: clone(st.ball) });
  function syncStep() {
    if (!drawing) return;
    const keep = drawing.steps[drawing.cur];
    drawing.steps[drawing.cur] = Object.assign(strip(board.state), { dur: keep.dur, cap: keep.cap });
    view.drawGhost(drawing.cur > 0 ? drawing.steps[drawing.cur - 1] : null, drawing.steps[drawing.cur]);
  }
  // Steps from a play the app worked out: the start, each catch and throw, and the end.
  function stepsFromPlan(plan) {
    const tl = plan.timeline;
    const times = [0];
    for (const e of tl.events) {
      if (e.type === 'throw') times.push(e.t, e.tEnd); else if (e.type !== 'note') times.push(e.t);
    }
    times.push(Math.max(0, tl.duration - 1));
    const uniq = [...new Set(times.map((t) => Math.round(t * 4) / 4))].sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] >= 0.5).slice(0, 10);
    return uniq.map((t, i) => {
      const players = {};
      for (const pos of POSITIONS) { const p = window.Engine.sampleTrack(tl.tracks[pos], t, true); players[pos] = { x: p.x, y: p.y }; }
      const runners = [];
      for (const r of plan.runners) {
        const keys = tl.tracks['runner:' + r.id];
        if (!keys) continue;
        const p = window.Engine.sampleTrack(keys, t, false);
        if (p.o !== undefined && p.o < 0.5) continue;
        runners.push({ id: r.id, label: r.label || (r.id === 'batter' ? 'B' : 'R'), x: p.x, y: p.y });
      }
      const b = window.Engine.sampleTrack(tl.tracks.ball, t, false);
      const cap = (tl.events.find((e) => e.type !== 'throw' && Math.abs(e.t - t) < 0.3) || {}).text || '';
      return { dur: i === 0 ? 1 : Math.max(0.5, Math.round((t - uniq[i - 1]) * 2) / 2), cap, players, runners, ball: { x: b.x, y: b.y } };
    });
  }
  function startDrawing(from) {
    stop();
    let steps;
    if (from === 'plan' && state.plan && state.plan.drawn && state.lastEvent && state.lastEvent.steps) steps = clone(state.lastEvent.steps);
    else if (from === 'plan' && state.plan) steps = stepsFromPlan(state.plan);
    else {
      showReady();
      const s0 = view.snapshot();
      if (!s0.runners.find((r) => r.id === 'batter')) s0.runners.push({ id: 'batter', label: 'B', x: -3, y: -1 });
      s0.runners.forEach((r, i) => { if (r.id !== 'batter') r.id = 'r' + (i + 1); });
      steps = [Object.assign(strip(s0), { dur: 1, cap: '' })];
    }
    const name = from === 'plan' ? (state.playName || (state.plan && state.plan.title) || '') : '';
    const savedId = from === 'plan' ? state.savedId : null;
    const cur = from === 'plan' ? Math.min(1, steps.length - 1) : 0;
    openBoard();
    drawing = { steps, cur, name, savedId };
    document.body.classList.add('drawing');
    $('#draw-bar').hidden = false;
    showStep(cur);
  }
  function showStep(i) {
    drawing.cur = Math.max(0, Math.min(drawing.steps.length - 1, i));
    const strokes = board.state ? board.state.strokes : [];
    board.state = Object.assign(clone(drawing.steps[drawing.cur]), { strokes });
    board.undo = []; board.redo = [];
    view.showBoard(board.state);
    view.drawGhost(drawing.cur > 0 ? drawing.steps[drawing.cur - 1] : null, drawing.steps[drawing.cur]);
    renderDrawBar();
    renderBoardBar();
  }
  function renderDrawBar() {
    const n = drawing.steps.length, i = drawing.cur;
    $('#db-label').textContent = i === 0 ? 'Start' : `Step ${i} of ${n - 1}`;
    $('#db-prev').disabled = i === 0;
    $('#db-next').disabled = i >= n - 1;
    $('#db-del').disabled = i === 0;
    $('#db-opts').style.visibility = i === 0 ? 'hidden' : '';
    $('#db-dur').value = String(drawing.steps[i].dur || 1);
    $('#db-cap').value = drawing.steps[i].cap || '';
    $('#db-tip').textContent = i === 0
      ? 'Where everyone starts. Move anyone who should start somewhere else, then tap + Step.'
      : 'Move everyone to where they are at this moment: fielders, runners and the ball. The faint trails show where they were a step ago.';
    $('#db-finish').disabled = n < 2;
  }
  function finishDrawing(d) {
    const steps = d.steps.map((st) => strip(st));
    const ink = board.state ? clone(board.state.strokes) : [];
    const name = d.name && !/^A play you drew$/.test(d.name) ? d.name : '';
    runEvent({ kind: 'drawn', steps, title: name || undefined }, { name, savedId: d.savedId });
    if (name) setTitle(name);
    board.ink = ink;
    view.drawInk(ink);
    scrollToResultOnPhone();
  }
  $('#db-prev').addEventListener('click', () => { syncStep(); showStep(drawing.cur - 1); });
  $('#db-next').addEventListener('click', () => { syncStep(); showStep(drawing.cur + 1); });
  $('#db-add').addEventListener('click', () => {
    syncStep();
    const next = Object.assign(strip(drawing.steps[drawing.cur]), { dur: 1, cap: '' });
    drawing.steps.splice(drawing.cur + 1, 0, next);
    showStep(drawing.cur + 1);
  });
  $('#db-del').addEventListener('click', () => {
    if (drawing.cur === 0) return;
    drawing.steps.splice(drawing.cur, 1);
    showStep(drawing.cur - 1);
  });
  $('#db-dur').addEventListener('change', (e) => { drawing.steps[drawing.cur].dur = Number(e.target.value); });
  $('#db-cap').addEventListener('input', (e) => { drawing.steps[drawing.cur].cap = e.target.value; });
  $('#db-finish').addEventListener('click', () => { syncStep(); closeBoard(); });
  $('#build-draw').addEventListener('click', () => startDrawing('scratch'));
  $('#btn-edit').addEventListener('click', () => startDrawing('plan'));

  // ------------------------------------------------------------------------------------ the scenario builder
  const baseName = (x) => ({ first: '1st', second: '2nd', third: '3rd', home: 'home' })[x];
  const DEFAULT_BALL_TO = () => ({ x: 12, y: Math.max(geo.backstop + 4, -40) });
  function leadMax() {
    const L = LEAGUES[state.league];
    if (geo.rules.leave === 'contact') return 0; // 8U: runners leave on contact
    if (L.sport === 'softball') return geo.older ? 16 : 12;   // off the base on the release
    if (!state.leadoffs) return 0;               // 60 ft Little League: no leadoffs
    return geo.base >= 90 ? 30 : 22;
  }
  function defaultLead() {
    if (LEAGUES[state.league].sport === 'softball') return 6;
    return state.leadoffs ? Math.round(geo.tempo.lead.steal) : 0;
  }
  function buildRunner(base) {
    const r = state.build.runners[base] || (state.build.runners[base] = { lead: defaultLead(), go: false });
    r.lead = Math.min(r.lead, leadMax());
    return r;
  }
  function buildLeads() {
    const out = {};
    for (const base of ['first', 'second', 'third']) if (state.runners[base]) out[base] = buildRunner(base).lead;
    return out;
  }
  function saveBuild() { store.set('build', state.build); }
  function buildEvent() {
    const b = state.build;
    const runners = {};
    const canSteal = geo.rules.stealing !== 'none';
    for (const base of ['first', 'second', 'third']) if (state.runners[base]) runners[base] = { lead: buildRunner(base).lead, go: canSteal && b.what === 'pitch' && buildRunner(base).go };
    return b.what === 'pickoff'
      ? { kind: 'pitch', move: 'pickoff', pickoff: state.runners[b.pickoff] ? b.pickoff : Object.keys(runners)[0], runners }
      : { kind: 'pitch', move: 'pitch', result: b.result, ballTo: b.result === 'passed' || b.result === 'dropped' ? (b.ballTo || DEFAULT_BALL_TO()) : undefined, runners };
  }
  function renderBuild() {
    const b = state.build;
    const bases = ['first', 'second', 'third'].filter((x) => state.runners[x]);
    for (const x of $$('#build-what button')) x.classList.toggle('on', x.dataset.what === b.what);
    for (const x of $$('#build-result button')) x.classList.toggle('on', x.dataset.res === b.result);
    $('#build-pitch').hidden = b.what !== 'pitch';
    $('#build-passed-tip').hidden = b.result !== 'passed' && b.result !== 'dropped';
    $('#build-pickoff').hidden = b.what !== 'pickoff';
    $('#build-hit-tip').hidden = b.what !== 'hit';
    document.body.classList.toggle('build-hit', b.what === 'hit');
    // Pickoff: which base (only bases with a runner).
    const pk = $('#build-pickoff-bases');
    pk.innerHTML = '';
    if (!bases.includes(b.pickoff) && bases.length) b.pickoff = bases[0];
    for (const x of bases) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `Throw to ${baseName(x)}`;
      btn.classList.toggle('on', x === b.pickoff);
      btn.addEventListener('click', () => { b.pickoff = x; saveBuild(); renderBuild(); showReady(); });
      pk.appendChild(btn);
    }
    // Runners: lead and whether they go.
    const box = $('#build-runners');
    box.innerHTML = '';
    const max = leadMax();
    for (const x of bases) {
      const r = buildRunner(x);
      const row = document.createElement('div');
      row.className = 'br-row';
      row.innerHTML = `<span class="br-base">${baseName(x)}</span>
        <label class="br-lead"><input type="range" min="0" max="${max}" step="1" value="${r.lead}" ${max ? '' : 'disabled'} aria-label="Lead off ${baseName(x)}"><span></span></label>
        <button type="button" class="br-go" aria-pressed="${r.go}">${r.go ? 'Stealing' : 'Holding'}</button>`;
      const inp = row.querySelector('input'), lbl = row.querySelector('.br-lead span');
      const label = () => { lbl.textContent = max ? `${r.lead} ft lead` : 'No lead'; };
      label();
      inp.addEventListener('input', () => { r.lead = Number(inp.value); label(); saveBuild(); if (!state.plan) view.setRunners(state.runners, buildLeads()); else showReady(); });
      const go = row.querySelector('.br-go');
      go.hidden = b.what !== 'pitch';
      go.classList.toggle('on', r.go);
      go.addEventListener('click', () => { r.go = !r.go; saveBuild(); renderBuild(); showReady(); });
      box.appendChild(row);
    }
    $('#build-no-runners').hidden = bases.length > 0;
    const L = LEAGUES[state.league];
    $('#build-lead-note').textContent = !bases.length ? ''
      : L.sport === 'softball' ? 'Softball runners leave on the release: the lead is how far off the base they are when the pitch arrives.'
      : !state.leadoffs ? 'No leadoffs on this field: runners can go when the pitch reaches the batter. Turn on leadoffs in Settings, or pick a 50/70 or 90 ft field.'
      : 'The lead is where the runner stands as the pitcher comes set. They shuffle a few more steps as the pitch is thrown.';
    $('#build-go').hidden = b.what === 'hit';
    $('#build-go').disabled = b.what === 'pickoff' && !bases.length;
  }
  function setPanelMode(pm) {
    state.pm = pm === 'build' ? 'build' : 'plays';
    store.set('panelMode', state.pm);
    document.body.classList.toggle('pm-build', state.pm === 'build');
    for (const x of $$('#panel-mode button')) { x.classList.toggle('on', x.dataset.pm === state.pm); x.setAttribute('aria-pressed', String(x.dataset.pm === state.pm)); }
    renderBuild();
    if (board.on) closeBoard();
    showReady();
  }
  for (const x of $$('#panel-mode button')) x.addEventListener('click', () => setPanelMode(x.dataset.pm));
  for (const x of $$('#build-what button')) x.addEventListener('click', () => { state.build.what = x.dataset.what; saveBuild(); renderBuild(); showReady(); });
  for (const x of $$('#build-result button')) x.addEventListener('click', () => { state.build.result = x.dataset.res; saveBuild(); renderBuild(); showReady(); });
  $('#build-go').addEventListener('click', () => { runEvent(buildEvent(), { name: '' }); scrollToResultOnPhone(); });
  $('#build-reset').addEventListener('click', () => {
    state.build = { what: 'pitch', result: 'caught', pickoff: 'first', ballTo: null, runners: {}, start: {} };
    saveBuild(); renderBuild(); showReady();
  });
  $('#build-fielders-reset').addEventListener('click', () => { state.build.start = {}; saveBuild(); showReady(); });

  // Quiz: while a play waits at the hit, drag a fielder to where you think they go. The app checks the answer against
  // where the play sends them, marks both spots, and plays it.
  let qdrag = null;
  const quiz = { tries: 0, right: 0 };
  svg.addEventListener('pointerdown', (e) => {
    if (!state.asking || !state.plan || board.on || state.plan.drawn) return;
    const pl = e.target.closest && e.target.closest('.player');
    if (!pl) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const pos = pl.dataset.pos;
    const p = view.toField(e.clientX, e.clientY);
    const at = view.actorAt(pos);
    qdrag = { id: e.pointerId, pos, off: { x: at.x - p.x, y: at.y - p.y }, moved: false, x0: e.clientX, y0: e.clientY, at };
    svg.setPointerCapture(e.pointerId);
  }, true);
  svg.addEventListener('pointermove', (e) => {
    if (!qdrag || e.pointerId !== qdrag.id) return;
    e.stopImmediatePropagation();
    if (!qdrag.moved && Math.hypot(e.clientX - qdrag.x0, e.clientY - qdrag.y0) < 5) return;
    qdrag.moved = true;
    view.cancelHolds();
    const p = view.toField(e.clientX, e.clientY);
    qdrag.at = { x: p.x + qdrag.off.x, y: p.y + qdrag.off.y };
    view.place(view.actors[qdrag.pos], qdrag.at);
  }, true);
  const endQ = (e) => {
    if (!qdrag || e.pointerId !== qdrag.id) return;
    e.stopImmediatePropagation();
    const q = qdrag; qdrag = null;
    if (!q.moved) return;
    const a = state.plan.assignments[q.pos];
    const want = a.path && a.path.length ? a.path[a.path.length - 1] : a.to;
    const off = Math.hypot(q.at.x - want.x, q.at.y - want.y);
    const k = geo.base / 60;
    quiz.tries++;
    const grade = off < 12 * k * (view.us || 1) ? 'right' : off < 28 * k * (view.us || 1) ? 'close' : 'miss';
    if (grade === 'right') quiz.right++;
    const name = Field.PLAYERS[q.pos];
    const msg = grade === 'right' ? `Yes! That's the ${name}'s spot.` : grade === 'close' ? `Close — the ${name} goes a little further. Watch.` : `Not quite — watch where the ${name} goes.`;
    view.showQuiz(q.at, want, grade);
    toast(`${msg}  (${quiz.right} of ${quiz.tries})`);
    setSpotlight(q.pos);
    // Show the answer: the play runs from the hit, with the guess still marked.
    setTimeout(() => { if (state.plan) { endAsk(); play(); } }, 900);
  };
  svg.addEventListener('pointerup', endQ, true);
  svg.addEventListener('pointercancel', endQ, true);

  // Builder, on the field: drag a fielder to where they start. (Registered in the capture phase so it wins over
  // tapping a player; only while building and before a play is set.)
  let fdrag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (state.pm !== 'build' || state.plan || board.on) return;
    const pl = e.target.closest && e.target.closest('.player');
    if (!pl) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const pos = pl.dataset.pos;
    const p = view.toField(e.clientX, e.clientY);
    const at = view.actorAt(pos);
    fdrag = { id: e.pointerId, pos, off: { x: at.x - p.x, y: at.y - p.y }, moved: false, x0: e.clientX, y0: e.clientY };
    svg.setPointerCapture(e.pointerId);
  }, true);
  svg.addEventListener('pointermove', (e) => {
    if (!fdrag || e.pointerId !== fdrag.id) return;
    e.stopImmediatePropagation();
    if (!fdrag.moved && Math.hypot(e.clientX - fdrag.x0, e.clientY - fdrag.y0) < 5) return;
    fdrag.moved = true;
    view.cancelHolds();
    const p = view.toField(e.clientX, e.clientY);
    const q = { x: Math.round((p.x + fdrag.off.x) * 2) / 2, y: Math.round((p.y + fdrag.off.y) * 2) / 2 };
    const r = Math.hypot(q.x, q.y);
    const max = geo.fenceAt(q) - 5;
    const spot = r > max ? { x: q.x * max / r, y: q.y * max / r } : q;
    state.build.start[fdrag.pos] = spot;
    view.place(view.actors[fdrag.pos], spot);
  }, true);
  const endF = (e) => {
    if (!fdrag || e.pointerId !== fdrag.id) return;
    e.stopImmediatePropagation();
    const d = fdrag; fdrag = null;
    if (d.moved) { saveBuild(); showReady(); }
  };
  svg.addEventListener('pointerup', endF, true);
  svg.addEventListener('pointercancel', endF, true);

  // ------------------------------------------------------------------------------------ read aloud
  // For players who can't read the job list yet: the device's own voice reads the play, or one player's job.
  const canSpeak = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  state.autoSpeak = store.get('autoSpeak', false);
  function speakText(parts) {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    for (const text of parts) {
      const u = new SpeechSynthesisUtterance(text.replace(/\b1st\b/g, 'first').replace(/\b2nd\b/g, 'second').replace(/\b3rd\b/g, 'third'));
      u.rate = 0.95;
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    }
  }
  const sayWho = (pos) => { const l = T.labelFor(team, pos); return l.name ? `${l.name}, ${Field.PLAYERS[pos]}` : NAMES[pos]; };
  function speakPlay() {
    const plan = state.plan;
    if (!plan) return;
    if (state.spotlight) {
      const j = plan.jobs.find((x) => x.pos === state.spotlight);
      if (j && j.job) return speakText([`${sayWho(j.pos)}. ${j.job}`]);
    }
    const parts = [state.playName || plan.title];
    if (state.asking) parts.push('Where does everybody go?');
    else {
      parts.push(plan.summary);
      for (const j of plan.jobs) if (j.job) parts.push(`${sayWho(j.pos)}. ${j.job}`);
    }
    speakText(parts);
  }
  if (canSpeak) {
    $('#btn-speak').hidden = false;
    $('#speak-row').hidden = false;
    $('#auto-speak').checked = state.autoSpeak;
    $('#auto-speak').addEventListener('change', (e) => { state.autoSpeak = e.target.checked; store.set('autoSpeak', state.autoSpeak); });
    $('#btn-speak').addEventListener('click', () => {
      if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); return; }
      speakPlay();
    });
  }

  // ------------------------------------------------------------------------------------ share links, My plays
  function shareCode() {
    if (!state.lastEvent) return null;
    const ev = Object.assign({}, state.lastEvent);
    if (ev.at && state.result !== 'auto' && !ev.result) ev.result = state.result;
    return window.Share.encode(situation(), ev, state.playName || '');
  }
  function shareUrl(code) {
    return location.href.split('#')[0] + '#p=' + code;
  }
  // Open a play from a code: set the field and the situation, then run it.
  function openCode(code, nameOverride, savedId) {
    const d = window.Share.decode(code);
    if (!d) { toast("That link doesn't hold a play."); return false; }
    const s = d.situation;
    if (s.league !== state.league) setLeague(s.league);
    if ((s.park || null) !== (state.park || null)) {
      state.park = s.park && Field.parksFor(state.league).find((p) => p.key === s.park) ? s.park : null;
      store.set('park.' + state.league, state.park);
      renderParks();
      setGeometry();
    }
    state.runners = Object.assign({ first: false, second: false, third: false }, s.runners);
    state.outs = s.outs;
    state.batter = s.batter;
    state.depth = s.depth || 'auto';
    state.d13 = s.d13 || 'auto';
    state.buntD = s.buntD || 'auto';
    if (typeof s.leadoffs === 'boolean') { state.leadoffs = s.leadoffs; $('#leadoffs').checked = s.leadoffs; }
    if (d.event.at && BATTED.includes(d.event.kind)) { state.kind = d.event.kind; state.result = d.event.result || 'auto'; }
    if (d.event.kind === 'pitch' || s.start) {
      const e = d.event;
      state.build.start = s.start || {};
      if (e.kind === 'pitch') {
        state.build.what = e.move === 'pickoff' ? 'pickoff' : 'pitch';
        state.build.result = e.result === 'passed' || e.result === 'dropped' ? e.result : 'caught';
        state.build.pickoff = e.pickoff || 'first';
        state.build.ballTo = e.ballTo || null;
        state.build.runners = JSON.parse(JSON.stringify(e.runners || {}));
      } else state.build.what = 'hit';
      saveBuild();
      if (state.pm !== 'build') setPanelMode('build'); else renderBuild();
    }
    renderSituation();
    const name = nameOverride || d.name || '';
    if (d.event.kind === 'drawn' && name) d.event.title = name;
    runEvent(d.event, { name, savedId });
    if (name) { setTitle(name); state.playName = name; }
    for (const x of $$('#quick-list .lib-item.mine')) x.classList.toggle('on', x.dataset.mine === savedId);
    scrollToResultOnPhone();
    return true;
  }
  let toastTimer = null;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  async function sharePlay() {
    const code = shareCode();
    if (!code) return;
    const url = shareUrl(code);
    const title = state.playName || (state.plan && state.plan.title) || 'A play';
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: `Simple Fielding — ${title}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    toast((await copyText(url)) ? 'Link copied — paste it anywhere' : url);
  }
  $('#btn-share').addEventListener('click', sharePlay);

  const saveSheet = $('#save-sheet');
  $('#btn-save').addEventListener('click', () => {
    if (!state.lastEvent) return;
    const editing = state.savedId && window.Share.list(localStorage).find((p) => p.id === state.savedId);
    $('#save-new').hidden = !editing;
    $('#save-go').textContent = editing ? 'Save changes' : 'Save';
    $('#save-name').value = state.playName || (state.plan && state.plan.title) || '';
    openSheet(saveSheet);
    setTimeout(() => { $('#save-name').focus(); $('#save-name').select(); }, 50);
  });
  $('#save-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#save-name').value.trim() || (state.plan && state.plan.title) || 'My play';
    state.playName = name;
    const code = shareCode();
    const editing = state.savedId && !saveAsNew;
    saveAsNew = false;
    const saved = code && (editing ? window.Share.update(localStorage, state.savedId, name, code) : window.Share.add(localStorage, name, code));
    if (saved) state.savedId = saved.id;
    closeSheet(saveSheet);
    if (!saved) { toast("Couldn't save on this device — use Share to keep it as a link."); return; }
    setTitle(name);
    buildQuick();
    toast(`Saved to My plays`);
    // Ask the browser to keep this site's storage (Chrome usually agrees; Safari keeps it for Home Screen apps).
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (err) { /* not offered */ }
  });
  let saveAsNew = false;
  $('#save-new').addEventListener('click', () => { saveAsNew = true; $('#save-form').requestSubmit(); });
  saveSheet.addEventListener('click', (e) => { if (e.target === saveSheet || e.target.closest('[data-close]')) closeSheet(saveSheet); });

  const mySheet = $('#myplays');
  const ICON = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  };
  function renderMyPlays() {
    const plays = window.Share.list(localStorage);
    const box = $('#mp-list');
    box.innerHTML = '';
    $('#mp-empty').hidden = plays.length > 0;
    for (const p of plays) {
      const row = document.createElement('div');
      row.className = 'mp-row';
      row.innerHTML = `<button type="button" class="mp-name"></button>
        <button type="button" class="icon-btn" data-act="up" aria-label="Move up">▲</button>
        <button type="button" class="icon-btn" data-act="down" aria-label="Move down">▼</button>
        <button type="button" class="icon-btn" data-act="share" aria-label="Share">${ICON.share}</button>
        <button type="button" class="icon-btn" data-act="copy" aria-label="Make a copy">${ICON.copy}</button>
        <button type="button" class="icon-btn" data-act="edit" aria-label="Rename">${ICON.edit}</button>
        <button type="button" class="icon-btn danger" data-act="del" aria-label="Delete">${ICON.del}</button>`;
      row.querySelector('.mp-name').textContent = p.name;
      row.querySelector('.mp-name').addEventListener('click', () => { closeSheet(mySheet); openCode(p.code, p.name, p.id); });
      row.querySelector('[data-act="up"]').addEventListener('click', () => { window.Share.move(localStorage, p.id, -1); renderMyPlays(); buildQuick(); });
      row.querySelector('[data-act="down"]').addEventListener('click', () => { window.Share.move(localStorage, p.id, 1); renderMyPlays(); buildQuick(); });
      row.querySelector('[data-act="copy"]').addEventListener('click', () => {
        const c = window.Share.copy(localStorage, p.id);
        renderMyPlays(); buildQuick();
        $('#mp-status').textContent = c ? `Made a copy: "${c.name}". Open it to change it.` : "Couldn't make a copy.";
      });
      row.querySelector('[data-act="share"]').addEventListener('click', async () => {
        const url = shareUrl(window.Share.encode(window.Share.decode(p.code).situation, window.Share.decode(p.code).event, p.name));
        if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: `Simple Fielding — ${p.name}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
        $('#mp-status').textContent = (await copyText(url)) ? `Link to "${p.name}" copied.` : url;
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', () => {
        const name = prompt('Rename this play', p.name);
        if (name && name.trim()) { window.Share.rename(localStorage, p.id, name.trim()); renderMyPlays(); buildQuick(); }
      });
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        if (!confirm(`Delete "${p.name}"? This can't be undone unless you have a backup or a link.`)) return;
        window.Share.remove(localStorage, p.id); renderMyPlays(); buildQuick();
      });
      box.appendChild(row);
    }
  }
  function openMyPlays() { $('#mp-status').textContent = ''; renderMyPlays(); closeSheet(settings); openSheet(mySheet); }
  $('#open-myplays').addEventListener('click', openMyPlays);
  mySheet.addEventListener('click', (e) => { if (e.target === mySheet || e.target.closest('[data-close]')) closeSheet(mySheet); });
  $('#mp-export').addEventListener('click', () => {
    const data = window.Share.exportData(localStorage, team.players && team.players.length ? team : null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `simple-fielding-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('#mp-status').textContent = `Exported ${data.plays.length} play${data.plays.length === 1 ? '' : 's'}${data.team ? ' and your team' : ''}. Keep the file somewhere safe.`;
  });
  $('#mp-import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = window.Share.importData(localStorage, JSON.parse(await file.text()));
      let msg = `Added ${res.added} play${res.added === 1 ? '' : 's'}.`;
      if (res.team && Array.isArray(res.team.players) && res.team.players.length && confirm('The backup has a team too. Replace your team with it?')) {
        // Save it, then load it back through the team module's own checks, into the same team object the
        // team sheet already holds.
        T.save(localStorage, res.team);
        const fresh = T.load(localStorage);
        for (const k of Object.keys(team)) delete team[k];
        Object.assign(team, fresh);
        applyLabels();
        msg += ' Team restored.';
      }
      $('#mp-status').textContent = msg;
      renderMyPlays(); buildQuick();
    } catch (err) { $('#mp-status').textContent = err.message || "Couldn't read that file."; }
  });

  function fromHash() {
    const h = location.hash.slice(1);
    if (h.startsWith('p=')) {
      openCode(decodeURIComponent(h.slice(2)));
      // The play is on screen; tidy the address so Next and new plays don't look like they're the shared one.
      history.replaceState(null, '', location.href.split('#')[0]);
      return;
    }
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
    if ((s.park || null) !== (state.park || null)) {
      state.park = s.park && Field.parksFor(state.league).find((p) => p.key === s.park) ? s.park : null;
      renderParks();
      setGeometry();
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
  window.SimpleFielding = { setMode, state, team, board, tester, openReport, buildReport, reportText, openBoard, closeBoard, runEvent, runScenario, hitTo, seekEnd() { if (state.plan) { stop(); endAsk(); state.t = state.plan.timeline.duration; view.seek(state.t); updateTransport(); } },
    // Paused at time t (seconds): used by scripts/render-hero-video.mjs to film a play frame by frame.
    view3d: () => v3,
    seek(t) { if (state.plan) { stop(); endAsk(); state.t = Math.max(0, Math.min(t, state.plan.timeline.duration)); view.seek(state.t); updateTransport(); } } };

  window.TeamUI.init({ team, onChange: (t) => { T.save(window.localStorage, t); applyLabels(); } });
  renderParks();
  buildLibrary();
  buildQuick();
  setMode('coach');
  setAskFirst(state.askFirst);
  document.body.classList.toggle('pm-build', state.pm === 'build');
  for (const x of $$('#panel-mode button')) x.classList.toggle('on', x.dataset.pm === state.pm);
  setGeometry();
  renderSituation();
  renderBuild();
  showReady();
  if (store.get('view3d', false)) set3d(true);
  fromHash();
})();
